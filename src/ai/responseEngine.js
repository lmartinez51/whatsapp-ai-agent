const { getCompletion } = require('./openaiClient');
const { getGeminiCompletionResult } = require('./geminiClient'); // <-- Importamos el nuevo cliente
const personalityEngine = require('../personality/personalityEngine');
const logger = require('../utils/logger');
const { buildMasterSystemPrompt } = require('../prompts');

// ============================================================
// ⚡ IN-MEMORY CIRCUIT BREAKER
// ============================================================
// Tracks whether a provider is temporarily disabled due to
// sustained failures (rate limits, quota exhaustion, downtime).
// When a provider trips, it is bypassed for CIRCUIT_BREAKER_COOLDOWN_MS
// so that every incoming message doesn't repeat the full retry delay.
// ============================================================

const CIRCUIT_BREAKER_COOLDOWN_MS =
  parseInt(process.env.LLM_CIRCUIT_BREAKER_COOLDOWN_MS, 10) || 20 * 60 * 1000; // default 20 min

/**
 * @typedef  {Object} CircuitState
 * @property {boolean} open          - true  → provider is disabled (cooling down)
 * @property {number}  openedAt      - timestamp (ms) when the circuit was tripped
 * @property {number}  failureCount  - consecutive failures recorded
 */

/** @type {Object.<string, CircuitState>} */
const circuitBreaker = {
  gemini: { open: false, openedAt: 0, failureCount: 0 },
  openai: { open: false, openedAt: 0, failureCount: 0 }
};

/** Returns true when the circuit for a provider is open (disabled). */
function isCircuitOpen(provider) {
  const state = circuitBreaker[provider];
  if (!state || !state.open) return false;

  const elapsed = Date.now() - state.openedAt;
  if (elapsed >= CIRCUIT_BREAKER_COOLDOWN_MS) {
    // Cooldown expired — half-open: allow one attempt
    state.open = false;
    state.failureCount = 0;
    logger.info(
      { provider, cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS },
      '[CircuitBreaker] Cooldown expired. Allowing retry for provider.'
    );
    return false;
  }

  const remainingSec = Math.ceil((CIRCUIT_BREAKER_COOLDOWN_MS - elapsed) / 1000);
  logger.warn(
    { provider, remainingSec },
    `[CircuitBreaker] Provider is open (disabled). ${remainingSec}s remaining in cooldown.`
  );
  return true;
}

/** Trip the circuit for a provider (start cooldown). */
function tripCircuit(provider) {
  const state = circuitBreaker[provider];
  if (!state) return;
  state.open = true;
  state.openedAt = Date.now();
  state.failureCount += 1;
  logger.warn(
    { provider, cooldownMs: CIRCUIT_BREAKER_COOLDOWN_MS, failureCount: state.failureCount },
    '[CircuitBreaker] Provider tripped. Entering cooldown.'
  );
}

/** Reset the circuit after a successful generation. */
function resetCircuit(provider) {
  const state = circuitBreaker[provider];
  if (!state) return;
  if (state.failureCount > 0) {
    logger.info({ provider }, '[CircuitBreaker] Provider recovered. Resetting circuit.');
  }
  state.open = false;
  state.openedAt = 0;
  state.failureCount = 0;
}

/**
 * Returns true when the error is a "quota / rate-limit / unavailable" class
 * that should trip the circuit breaker for this provider.
 * @param {Error} error
 */
function isQuotaOrRateLimitError(error) {
  if (!error) return false;
  const status = error.status || error.code;
  if (status === 429 || status === 503) return true;
  const msg = (error.message || '').toLowerCase();
  return (
    msg.includes('429') ||
    msg.includes('503') ||
    msg.includes('insufficient_quota') ||
    msg.includes('rate_limit') ||
    msg.includes('resource_exhausted') ||
    msg.includes('overloaded') ||
    msg.includes('unavailable')
  );
}

// ============================================================

function cloneGeminiContent(content) {
  if (!content || !Array.isArray(content.parts)) return null;
  return JSON.parse(JSON.stringify(content));
}

function mapContextMessageToGemini(message) {
  if (message.geminiContent && (message.role === 'assistant' || message.role === 'model')) {
    return cloneGeminiContent(message.geminiContent);
  }

  const role = message.role === 'assistant' ? 'model' : message.role;
  if (role !== 'user' && role !== 'model') return null;

  const content = typeof message.content === 'string'
    ? message.content
    : JSON.stringify(message.content || '');

  return {
    role,
    parts: [{ text: content }]
  };
}

/**
 * Core engine responsible for routing messages to the appropriate Large Language
 * Model (OpenAI or Gemini) and generating contextual responses.
 *
 * Routing order is determined by `process.env.ACTIVE_LLM`:
 *   - 'gemini'  → Primary: Gemini,  Secondary: OpenAI
 *   - 'openai'  → Primary: OpenAI,  Secondary: Gemini
 *
 * An in-memory circuit breaker prevents hammering a failing primary provider
 * on every request. Once tripped, incoming requests are routed directly to the
 * secondary provider for `LLM_CIRCUIT_BREAKER_COOLDOWN_MS` milliseconds
 * (default 20 min, configurable via env var). After cooldown the primary is
 * allowed to retry (half-open state).
 */
class ResponseEngine {

  // ----------------------------------------------------------
  // Internal provider methods — now throw on error so _tryProvider
  // can inspect the error for circuit-breaker logic.
  // ----------------------------------------------------------

  async _generateOpenAIResponse(messages, contactProfile) {
    // Throws on failure (propagates from getCompletion)
    const replyText = await getCompletion(messages, {
      reasoning: { effort: 'low' },
      max_output_tokens: 300,
      temperature: 0.75
    });
    return replyText ? { text: replyText, provider: 'openai' } : null;
  }

  async _generateGeminiResponse(incomingMessage, recentContext, systemContent, contactProfile, mediaObject) {
    // Map OpenAI roles to Gemini roles ('assistant' -> 'model').
    // Preserve raw Gemini model content when available so thought signatures survive turns.
    const geminiContext = (recentContext || [])
      .map(mapContextMessageToGemini)
      .filter(Boolean);

    // ==========================================
    // 👁️ NERVIO ÓPTICO PARA GEMINI
    // ==========================================
    const userParts = [{ text: incomingMessage }];

    if (mediaObject && mediaObject.data && mediaObject.mimetype) {
      userParts.push({
        inlineData: {
          data: mediaObject.data,
          mimeType: mediaObject.mimetype
        }
      });
    }

    const contents = [
      ...geminiContext,
      { role: 'user', parts: userParts }
    ];

    const geminiOptions = {
      systemInstruction: systemContent
    };

    // ==========================================
    // 🛡️ MODO DESCHONGUE: Bajar escudos para Anita
    // ==========================================
    // Reducimos el filtro de acoso a "BLOCK_ONLY_HIGH" para permitir lenguaje soez y roast
    if (contactProfile && contactProfile.contactId === '19153164832@c.us') {
      geminiOptions.safetySettings = [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_ONLY_HIGH'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_ONLY_HIGH'
        }
      ];
      console.log(`\x1b[31m[⚠️ MODO DESCHONGUE ACTIVADO]\x1b[0m Filtros de seguridad reducidos temporalmente para Ana.`);
    }

    // Usamos el cliente limpio con las nuevas opciones — throws on failure
    const geminiResult = await getGeminiCompletionResult(contents, geminiOptions);
    return {
      text: geminiResult.text,
      provider: 'gemini',
      modelContent: geminiResult.content,
      usageMetadata: geminiResult.usageMetadata
    };
  }

  _getEmergencyFallback() {
    const activeAgent = (process.env.ACTIVE_AGENT || personalityEngine.activeAgent || 'lorenzo').toLowerCase();

    const fallbackText = activeAgent === 'camila'
      ? "¡Chale! Se me congeló el changarro con tanta gente queriendo chisme al mismo tiempo. 🥶 Si ocupas algo urgente de Lorenzo o mío, tírame un mensajito en un ratito en lo que revive mi sistema."
      : "¡Qué onda! Se me saturó un poco la red por acá y ando medio trabado. 🔌 Échame un mensajito en unos minutitos en lo que se descongestiona el sistema.";

    return {
      text: fallbackText,
      confidence: 0.5,
      isFallback: true,
      provider: 'fallback'
    };
  }

  /**
   * Builds the OpenAI messages array (system + history + new user message),
   * handling multimodal content for images and audio.
   */
  _buildOpenAIMessages(systemContent, recentContext, incomingMessage, mediaObject) {
    let userContent = incomingMessage;

    // ==========================================
    // 👁️ NERVIO ÓPTICO Y OÍDO PARA OPENAI
    // ==========================================
    if (mediaObject && mediaObject.data && mediaObject.mimetype) {
      if (mediaObject.mimetype.startsWith('image/')) {
        // Es imagen/sticker: OpenAI la soporta nativamente
        userContent = [
          { type: "text", text: incomingMessage },
          {
            type: "image_url",
            image_url: { url: `data:${mediaObject.mimetype};base64,${mediaObject.data}` }
          }
        ];
      } else if (mediaObject.mimetype.startsWith('audio/')) {
        // Es audio: GPT-5.4-nano requiere Whisper o un endpoint distinto para audio.
        // Le informamos al modelo que está sordo temporalmente para que no crashee.
        userContent = incomingMessage + "\n\n*(Sistema: El usuario te envió un mensaje de voz, pero en este momento estás operando con el motor de OpenAI sin módulo de transcripción activo. Pídele amablemente al usuario que te escriba el mensaje o dile que tienes los oídos tapados.)*";
      }
    }

    return [
      { role: 'system', content: systemContent },
      ...(recentContext || []),
      { role: 'user', content: userContent }
    ];
  }

  /**
   * Attempts generation using the named provider. Returns the result object on
   * success, or null if the provider's circuit is open or the call fails.
   * Handles all circuit-breaker state transitions internally.
   *
   * @param {'gemini'|'openai'} provider
   * @param {object} ctx - Shared context built in generateResponseResult
   * @returns {Promise<object|null>}
   */
  async _tryProvider(provider, ctx) {
    if (isCircuitOpen(provider)) {
      logger.info(
        { provider, contact: ctx.contactProfile?.name },
        '[Failover] Skipping provider — circuit open. Routing to secondary.'
      );
      return null;
    }

    try {
      let result;
      if (provider === 'gemini') {
        result = await this._generateGeminiResponse(
          ctx.incomingMessage,
          ctx.recentContext,
          ctx.systemContent,
          ctx.contactProfile,
          ctx.mediaObject
        );
      } else {
        const messages = this._buildOpenAIMessages(
          ctx.systemContent,
          ctx.recentContext,
          ctx.incomingMessage,
          ctx.mediaObject
        );
        result = await this._generateOpenAIResponse(messages, ctx.contactProfile);
      }

      if (result && result.text) {
        resetCircuit(provider);
        return result;
      }

      // Provider returned an empty result (shouldn't normally happen, but guard it)
      logger.warn({ provider, contact: ctx.contactProfile?.name }, '[Failover] Provider returned empty result.');
      return null;

    } catch (error) {
      const shouldTrip = isQuotaOrRateLimitError(error);
      if (shouldTrip) {
        tripCircuit(provider);
      } else {
        // Non-quota error — log, but don't trip the full circuit
        if (circuitBreaker[provider]) circuitBreaker[provider].failureCount += 1;
        logger.warn(
          { provider, err: error.message || error, contact: ctx.contactProfile?.name },
          '[Failover] Provider threw a non-quota error.'
        );
      }
      return null;
    }
  }

  async generateResponseResult(incomingMessage, contactProfile, semanticMemories, recentContext, mediaObject = null) {
    try {
      const currentDateTime = new Date().toLocaleString('en-US', {
        timeZone: 'America/Ciudad_Juarez',
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      const agentSystemPrompt = personalityEngine.getPersonalityPrompt(contactProfile);

      const topicsString = (contactProfile?.topics && contactProfile.topics.length > 0)
        ? `Temas o intereses conocidos: ${contactProfile.topics.join(', ')}`
        : '';

      const interactionsString = (contactProfile?.recent_interactions && contactProfile.recent_interactions.length > 0)
        ? contactProfile.recent_interactions.map(int => {
            const dateStr = new Date(int.date).toLocaleDateString('en-US', {
              timeZone: 'America/Ciudad_Juarez', month: 'short', day: 'numeric'
            });
            const agentTag = int.agent ? `(Memoria de ${int.agent.toUpperCase()}): ` : '';
            return `[${dateStr}] ${agentTag}${int.summary}`;
          }).join('\n')
        : '';

      const systemContent = buildMasterSystemPrompt({
        agentSystemPrompt,
        currentDateTime,
        contactProfile,
        topicsString,
        interactionsString,
        semanticMemories
      });

      // ============================================================
      // ⚡ CROSS-PROVIDER FAILOVER WITH CIRCUIT BREAKER
      // ============================================================
      // Determine primary / secondary based on ACTIVE_LLM env var.
      //   ACTIVE_LLM=gemini  → Primary: Gemini,  Secondary: OpenAI
      //   ACTIVE_LLM=openai  → Primary: OpenAI,  Secondary: Gemini
      // ============================================================

      const activeLLM = (process.env.ACTIVE_LLM || 'openai').toLowerCase();
      const primary   = activeLLM === 'gemini' ? 'gemini' : 'openai';
      const secondary = primary === 'gemini'   ? 'openai' : 'gemini';

      /** Shared context passed to _tryProvider */
      const ctx = { incomingMessage, recentContext, systemContent, contactProfile, mediaObject };

      // --- 1. Attempt Primary provider ---
      let responseResult = await this._tryProvider(primary, ctx);

      // --- 2. Attempt Secondary if Primary failed or circuit was open ---
      if (!responseResult) {
        logger.warn(
          { primary, secondary, contact: contactProfile?.name },
          '[Failover] Primary provider unavailable. Attempting secondary provider.'
        );
        responseResult = await this._tryProvider(secondary, ctx);
      }

      // --- 3. Both providers exhausted → static emergency fallback ---
      if (responseResult && responseResult.text) {
        return responseResult;
      }

      logger.warn(
        { contact: contactProfile?.name, primary, secondary },
        '[Failover] Both providers exhausted. Activating emergency fallback response.'
      );
      return this._getEmergencyFallback();

    } catch (error) {
      logger.warn(
        { err: error.message || error, contact: contactProfile?.name },
        'ResponseEngine failed to generate a reply. Activating emergency fallback response.'
      );
      return this._getEmergencyFallback();
    }
  }

  async generateResponse(incomingMessage, contactProfile, semanticMemories, recentContext, mediaObject = null) {
    const result = await this.generateResponseResult(incomingMessage, contactProfile, semanticMemories, recentContext, mediaObject);
    return result?.text || null;
  }
}

module.exports = new ResponseEngine();
