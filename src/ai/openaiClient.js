const { OpenAI } = require('openai');
const config = require('../config');
const logger = require('../utils/logger');
const embeddingCache = require('../memory/embeddingCache');

const openai = new OpenAI({
  apiKey: config.openaiApiKey,
});

/**
 * Gets embeddings for the given text, using cache if available.
 * @param {string} text 
 * @returns {Promise<number[]>}
 */
async function getEmbedding(input) {
  const inputs = Array.isArray(input) ? input : [input];

  if (inputs.length === 0) {
    return [];
  }

  const embeddings = new Array(inputs.length);
  const missingByText = new Map();

  inputs.forEach((text, index) => {
    const cachedEmbedding = embeddingCache.get(text);

    if (cachedEmbedding) {
      embeddings[index] = cachedEmbedding;
      return;
    }

    const pendingIndexes = missingByText.get(text) || [];
    pendingIndexes.push(index);
    missingByText.set(text, pendingIndexes);
  });

  const missingTexts = Array.from(missingByText.keys());

  if (missingTexts.length > 0) {
    const response = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: missingTexts
    });

    const cacheEntries = [];

    response.data.forEach((item, fallbackIndex) => {
      const responseIndex = item.index ?? fallbackIndex;
      const text = missingTexts[responseIndex];
      const embedding = item.embedding;
      const inputIndexes = missingByText.get(text);

      if (!inputIndexes) {
        return;
      }

      for (const inputIndex of inputIndexes) {
        embeddings[inputIndex] = embedding;
      }

      cacheEntries.push({ text, embedding });
    });

    embeddingCache.setMany(cacheEntries);
  }

  return Array.isArray(input) ? embeddings : embeddings[0];
}

/**
 * Helper to determine if a model is a reasoning or current-gen architecture
 * (such as gpt-5*, o1*, o3*) that does not support arbitrary sampling parameters.
 * @param {string} modelName 
 * @returns {boolean}
 */
function isReasoningOrCurrentGenModel(modelName) {
  if (!modelName || typeof modelName !== 'string') return false;
  const normalized = modelName.trim().toLowerCase();
  return /^(gpt-5|o1|o3)/i.test(normalized);
}

/**
 * Sanitizes options payload for OpenAI API compatibility across model families.
 * @param {object} options 
 * @param {string} [modelOverride] 
 * @returns {object}
 */
function sanitizeOpenAIOptions(options = {}, modelOverride) {
  const model = options.model || modelOverride || config.modelName || process.env.MODEL_NAME || 'gpt-5.4-nano-2026-03-17';
  const isReasoning = isReasoningOrCurrentGenModel(model);

  const sanitized = { ...options, model };

  // Set default temperature only for models that support arbitrary sampling
  if (!isReasoning && sanitized.temperature === undefined) {
    sanitized.temperature = 0.7;
  }

  // For reasoning and current-gen models (gpt-5*, o1*, o3*), strip arbitrary sampling parameters
  if (isReasoning) {
    delete sanitized.temperature;
    delete sanitized.top_p;

    // Normalize reasoning_effort into the Responses API reasoning configuration
    if (sanitized.reasoning_effort && !sanitized.reasoning) {
      sanitized.reasoning = { effort: sanitized.reasoning_effort };
      delete sanitized.reasoning_effort;
    }
  } else {
    delete sanitized.reasoning;
    delete sanitized.reasoning_effort;
  }

  // Replace any usage of max_tokens with max_completion_tokens
  if ('max_tokens' in sanitized) {
    sanitized.max_completion_tokens = sanitized.max_tokens;
    delete sanitized.max_tokens;
  }

  // In the OpenAI Responses API (openai.responses.create), token limits are specified via max_output_tokens.
  // Translate max_completion_tokens into max_output_tokens and remove unsupported parameter.
  if ('max_completion_tokens' in sanitized) {
    if (sanitized.max_output_tokens === undefined) {
      sanitized.max_output_tokens = sanitized.max_completion_tokens;
    }
    delete sanitized.max_completion_tokens;
  }

  return sanitized;
}

// ============================================================
// Transient error detection for OpenAI retry logic.
// Returns true for server-side blips that are safe to retry.
// Returns false for hard errors that should fail-fast so the
// cross-provider circuit breaker can take over immediately.
// ============================================================

/**
 * Returns true when the OpenAI error is a hard, non-retryable failure:
 * auth errors (401), bad request (400), or quota exhaustion (429 +
 * "insufficient_quota" in the message). These should propagate
 * immediately so the circuit breaker can route to the secondary LLM.
 * @param {Error} error
 */
function isHardOpenAIError(error) {
  if (!error) return false;
  const status = error.status || error.code;
  if (status === 401 || status === 400) return true;
  if (status === 429) {
    const msg = (error.message || '').toLowerCase();
    // Transient rate-limit spikes are retryable; quota exhaustion is not.
    return msg.includes('insufficient_quota') || msg.includes('billing');
  }
  return false;
}

/**
 * Returns true when the error is a transient server-side blip that
 * is worth retrying a couple of times before giving up.
 * @param {Error} error
 */
function isTransientOpenAIError(error) {
  if (!error) return false;
  const status = error.status || error.code;
  // 500 Internal Server Error, 502 Bad Gateway, 503 Service Unavailable
  if (status === 500 || status === 502 || status === 503) return true;
  // Transient 429 rate-limit spikes (not quota exhaustion)
  if (status === 429 && !isHardOpenAIError(error)) return true;
  return false;
}

/** Async non-blocking delay helper. */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fast retry schedule: 2 retries after the initial attempt → 3 total.
const OPENAI_RETRY_DELAYS_MS = [1500, 3000];

/**
 * Gets a generation response using the new Responses API.
 * Applies a lightweight transient retry loop (max 2 retries, 1.5s / 3s)
 * for 500/502/503 and transient 429 spikes. Hard errors (401, 400,
 * 429+insufficient_quota) bypass the loop and throw immediately.
 * @param {object[]} messages
 * @param {object}   options  Override defaults (temperature, max_tokens, etc)
 */
async function getCompletion(messages, options = {}) {
  const finalOptions = sanitizeOpenAIOptions(options);

  // ==========================================
  // 🛠️ TRADUCTOR DE JSON MODE (LEGACY A RESPONSES API)
  // ==========================================
  if (finalOptions.response_format) {
    // Le pasamos el objeto completo { type: "json_object" } en lugar del puro string
    finalOptions.text = { format: finalOptions.response_format };
    delete finalOptions.response_format;
  }

  // ==========================================
  // 🛠️ MAPEADOR: De Messages a Items (Responses API)
  // ==========================================
  const items = messages.map(msg => {
    // 1. Jerarquía de roles: Mapear 'system' a 'developer' para mayor adherencia en modelos GPT-5
    const role = msg.role === 'system' ? 'developer' : msg.role;

    // 2. Normalizar arreglos de contenido multimodal (texto e imágenes)
    if (Array.isArray(msg.content)) {
      const normalizedContent = msg.content.map(part => {
        if (!part || typeof part !== 'object') {
          return { type: 'input_text', text: String(part || '') };
        }
        if (part.type === 'text') {
          return { type: 'input_text', text: part.text || '' };
        }
        if (part.type === 'image_url') {
          const rawUrl = typeof part.image_url === 'object' ? part.image_url?.url : part.image_url;
          return { type: 'input_image', image_url: rawUrl };
        }
        return part;
      });

      return { type: 'message', role, content: normalizedContent };
    }

    return { type: 'message', role, content: msg.content };
  });

  // ==========================================
  // 🚀 NUEVA RESPONSES API — con retry para errores transitorios
  // ==========================================
  const MAX_ATTEMPTS = OPENAI_RETRY_DELAYS_MS.length + 1; // 3 total

  function extractOpenAIErrorInfo(err) {
    const status = err?.status || err?.code || 500;
    let message = err?.message || 'Unknown error';
    if (typeof message === 'string' && message.length > 120) {
      message = message.substring(0, 120) + '...';
    }
    return { status, message };
  }

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const response = await openai.responses.create({ input: items, ...finalOptions });
      return response.output_text;
    } catch (error) {
      const { status, message } = extractOpenAIErrorInfo(error);

      // Hard errors: fail immediately — let the circuit breaker decide
      if (isHardOpenAIError(error)) {
        logger.warn({ provider: 'openai', status, message, attempt }, `[OpenAI Hard Error] Status: ${status} - ${message}`);
        throw error;
      }

      // Transient errors: retry if attempts remain
      if (isTransientOpenAIError(error) && attempt < MAX_ATTEMPTS) {
        const delayMs = OPENAI_RETRY_DELAYS_MS[attempt - 1];
        logger.warn(
          { provider: 'openai', status, attempt, maxAttempts: MAX_ATTEMPTS, delayMs },
          `[OpenAI Retry] Status ${status}. Reintentando en ${delayMs}ms…`
        );
        await delay(delayMs);
        continue;
      }

      // Unknown or exhausted retries
      logger.warn({ provider: 'openai', status, message, attempt }, `[OpenAI Error] Status: ${status} - ${message}`);
      throw error;
    }
  }
}

module.exports = {
  getEmbedding,
  getCompletion,
  openai,
  isReasoningOrCurrentGenModel,
  sanitizeOpenAIOptions,
  isHardOpenAIError,
  isTransientOpenAIError
};
