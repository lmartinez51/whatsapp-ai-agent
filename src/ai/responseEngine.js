const { getCompletion } = require('./openaiClient');
const { GoogleGenAI } = require('@google/genai');
const personalityEngine = require('../personality/personalityEngine');
const logger = require('../utils/logger');

let geminiClient = null;

/**
 * Core engine responsible for routing messages to the appropriate Large Language Model (OpenAI or Gemini) and generating contextual responses.
 */
class ResponseEngine {
  /**
   * Generates a chat completion response using the OpenAI API.
   * @param {Array<Object>} messages - The array of message objects (system, user, assistant) forming the conversation history.
   * @param {Object} contactProfile - The contact's profile used for logging and error tracking.
   * @returns {Promise<string|null>} The text response from OpenAI, or null if an error occurs.
   * @throws {Error} Throws internally and catches it to prevent crashing, logging the failure instead.
   * @private
   */
  async _generateOpenAIResponse(messages, contactProfile) {
    try {
      return await getCompletion(messages, {
        max_completion_tokens: 80, 
        temperature: 0.75 
      });
    } catch (error) {
      logger.error({ err: error, contact: contactProfile?.name }, 'OpenAI failed to generate a reply');
      return null;
    }
  }

  /**
   * Generates a chat completion response using the Google Gemini API.
   * @param {string} incomingMessage - The latest user message text to respond to.
   * @param {Array<Object>} recentContext - The recent conversation history in OpenAI format.
   * @param {string} systemContent - The compiled system prompt defining persona and rules.
   * @param {Object} contactProfile - The contact's profile used for logging and error tracking.
   * @param {Object|null} mediaObject - The visual data (base64) from images or stickers.
   * @returns {Promise<string|null>} The text response from Gemini, or null if an error occurs.
   * @throws {Error} Throws internally and catches it to prevent crashing, logging the failure instead.
   * @private
   */
  async _generateGeminiResponse(incomingMessage, recentContext, systemContent, contactProfile, mediaObject) {
    try {
      if (!geminiClient) {
          geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      }

      // Map OpenAI roles to Gemini roles ('assistant' -> 'model')
      const geminiContext = (recentContext || []).map(msg => ({
        role: msg.role === 'assistant' ? 'model' : msg.role,
        parts: [{ text: msg.content || "" }] 
      }));

      // ==========================================
      // 👁️ NERVIO ÓPTICO PARA GEMINI
      // ==========================================
      const userParts = [{ text: incomingMessage }];
      
      // Si el MessageProcessor nos mandó una imagen, la inyectamos nativamente
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

      const response = await geminiClient.models.generateContent({
        model: 'gemini-3.1-flash-preview', // <-- Asegúrate de usar tu modelo preferido
        contents: contents,
        config: {
          systemInstruction: systemContent,
          maxOutputTokens: 800,
          temperature: 0.75,
          thinkingConfig: {
            thinkingLevel: 'minimal'
          }
        }
      });
      return response.text;
    } catch (error) {
      logger.error({ err: error, contact: contactProfile?.name }, 'Gemini failed to generate a reply');
      return null;
    }
  }

  /**
   * The primary entry point for generating AI responses. Orchestrates context building, temporal awareness, and LLM routing.
   * @param {string} incomingMessage - The raw or translated text from the user.
   * @param {Object} contactProfile - The semantic profile containing topics, traits, and recent interactions.
   * @param {string} semanticMemories - A stringified block of relevant past semantic memories.
   * @param {Array<Object>} recentContext - The short-term conversation context for context continuity.
   * @param {Object|null} mediaObject - Contains Base64 data and mimetype if an image/sticker was received.
   * @returns {Promise<string|null>} The generated text response, or null if generation fails.
   */
  async generateResponse(incomingMessage, contactProfile, semanticMemories, recentContext, mediaObject = null) {
    try {
      // 0. El reloj del sistema
      const currentDateTime = new Date().toLocaleString('en-US', { 
        timeZone: 'America/Ciudad_Juarez', 
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });

      // 1. Identidad
      const agentSystemPrompt = personalityEngine.getPersonalityPrompt(contactProfile);

      // 2. Temas de interés
      const topicsString = (contactProfile?.topics && contactProfile.topics.length > 0)
        ? `Temas o intereses conocidos: ${contactProfile.topics.join(', ')}`
        : '';

      // 3. Interacciones recientes
      const interactionsString = (contactProfile?.recent_interactions && contactProfile.recent_interactions.length > 0)
        ? contactProfile.recent_interactions.map(int => {
            const dateStr = new Date(int.date).toLocaleDateString('en-US', { 
              timeZone: 'America/Ciudad_Juarez', month: 'short', day: 'numeric' 
            });
            const agentTag = int.agent ? `(Memoria de ${int.agent.toUpperCase()}): ` : '';
            return `[${dateStr}] ${agentTag}${int.summary}`;
          }).join('\n')
        : '';

      // 4. El prompt maestro
      const systemContent = `
${agentSystemPrompt}

<system_clock>
CURRENT DATE AND TIME: ${currentDateTime}
</system_clock>

<temporal_awareness>
CRITICAL RULE: You possess temporal awareness. Before referencing any event from the "recent_interactions_summary" or "semantic_memories", you MUST logically compare its timestamp against the CURRENT DATE AND TIME.
- If the memory's date is in the past, you MUST refer to the event in the past tense (e.g., "How was the outing?", "Did you end up going?").
- NEVER ask if a plan is "still happening" or "are we still on" if the date of the plan has already passed.
- Use natural time expressions based on the current date (e.g., "yesterday", "a few days ago", "last weekend").
</temporal_awareness>

<dynamic_context>
<contact_profile>
Nombre del contacto que escribe: ${contactProfile?.name || "Desconocido"}
Relación con el dueño del teléfono: ${contactProfile?.relationship || "desconocido"}
${topicsString}
</contact_profile>
${interactionsString ? `\n<recent_interactions_summary>\nBrief summaries of past chats. Use ONLY for context, do not randomly bring them up:\n${interactionsString}\n</recent_interactions_summary>` : ''}
${semanticMemories ? `\n<semantic_memories>\nUse ONLY if they add direct value to the current conversation:\n${semanticMemories}\n</semantic_memories>` : ''}
</dynamic_context>

<output_contract>
- LENGTH: 1 to 3 sentences maximum.
- FORMAT: Plain text for WhatsApp. NO Markdown, NO bullet points.
- FOURTH WALL: Never break character. Never state you are an AI language model (unless the persona explicitly requires acknowledging you are an AI assistant, like Camila).
</output_contract>
      `.trim();

      const activeLLM = process.env.ACTIVE_LLM || 'openai';

      if (activeLLM === 'gemini') {
         return await this._generateGeminiResponse(incomingMessage, recentContext, systemContent, contactProfile, mediaObject);
      } else {
         // ==========================================
         // 👁️ NERVIO ÓPTICO PARA OPENAI
         // ==========================================
         let userContent = incomingMessage;
         
         // Si hay una imagen, convertimos el contenido en un array multimodal nativo de OpenAI
         if (mediaObject && mediaObject.data && mediaObject.mimetype) {
             userContent = [
                 { type: "text", text: incomingMessage },
                 { 
                     type: "image_url", 
                     image_url: { 
                         url: `data:${mediaObject.mimetype};base64,${mediaObject.data}` 
                     } 
                 }
             ];
         }

         const messages = [
           { role: 'system', content: systemContent },
           ...(recentContext || []),
           { role: 'user', content: userContent }
         ];
         return await this._generateOpenAIResponse(messages, contactProfile);
      }

    } catch (error) {
      logger.error({ err: error, contact: contactProfile?.name }, 'ResponseEngine failed to generate a reply');
      return null;
    }
  }
}

module.exports = new ResponseEngine();