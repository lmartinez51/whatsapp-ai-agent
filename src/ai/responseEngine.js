const { getCompletion } = require('./openaiClient');
const { getGeminiCompletionResult } = require('./geminiClient'); // <-- Importamos el nuevo cliente
const personalityEngine = require('../personality/personalityEngine');
const logger = require('../utils/logger');
const { buildMasterSystemPrompt } = require('../prompts');

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
 * Core engine responsible for routing messages to the appropriate Large Language Model (OpenAI or Gemini) and generating contextual responses.
 */
class ResponseEngine {
  
  async _generateOpenAIResponse(messages, contactProfile) {
    try {
      return await getCompletion(messages, {
        max_output_tokens: 80, 
        temperature: 0.75 
      });
    } catch (error) {
      logger.warn({ err: error.message || error, contact: contactProfile?.name }, 'OpenAI failed to generate a reply');
      return null;
    }
  }

  async _generateGeminiResponse(incomingMessage, recentContext, systemContent, contactProfile, mediaObject) {
    try {
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

      // Usamos el cliente limpio con las nuevas opciones
      const geminiResult = await getGeminiCompletionResult(contents, geminiOptions);
      return {
        text: geminiResult.text,
        provider: 'gemini',
        modelContent: geminiResult.content,
        usageMetadata: geminiResult.usageMetadata
      };

    } catch (error) {
      logger.warn({ err: error.message || error, contact: contactProfile?.name }, 'Gemini failed to generate a reply');
      return null;
    }
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

      const activeLLM = process.env.ACTIVE_LLM || 'openai';
      let responseResult = null;

      if (activeLLM === 'gemini') {
         responseResult = await this._generateGeminiResponse(incomingMessage, recentContext, systemContent, contactProfile, mediaObject);
      } else {
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
                 incomingMessage += "\n\n*(Sistema: El usuario te envió un mensaje de voz, pero en este momento estás operando con el motor de OpenAI sin módulo de transcripción activo. Pídele amablemente al usuario que te escriba el mensaje o dile que tienes los oídos tapados.)*";
                 userContent = incomingMessage;
             }
         }

         const messages = [
           { role: 'system', content: systemContent },
           ...(recentContext || []),
           { role: 'user', content: userContent }
         ];
         const replyText = await this._generateOpenAIResponse(messages, contactProfile);
         responseResult = replyText
           ? { text: replyText, provider: 'openai' }
           : null;
      }

      if (responseResult && responseResult.text) {
        return responseResult;
      }

      logger.warn(
        { contact: contactProfile?.name, activeLLM },
        'All LLM attempts exhausted. Activating emergency fallback response.'
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
