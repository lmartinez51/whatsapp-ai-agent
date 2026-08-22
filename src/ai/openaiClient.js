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
 * Gets a generation response using the new Responses API.
 * @param {object[]} messages 
 * @param {object} options Override defaults (temperature, max_tokens, etc)
 */
async function getCompletion(messages, options = {}) {
  try {
    const defaultOptions = {
      model: config.modelName,
      temperature: 0.7,
    };
    
    const finalOptions = { ...defaultOptions, ...options };

    // ==========================================
    // 🛠️ TRADUCTOR DE JSON MODE (LEGACY A RESPONSES API)
    // ==========================================
    if (finalOptions.response_format) {
        // Le pasamos el objeto completo { type: "json_object" } en lugar del puro string
        finalOptions.text = { format: finalOptions.response_format };
        delete finalOptions.response_format; 
    }

    // ==========================================
    // 🛠️ MAPEADOR: De Messages a Items
    // ==========================================
    const items = messages.map(msg => {
      // Si el mensaje ya trae formato avanzado (como el arreglo multimodal de imágenes), 
      // lo pasamos tal cual, solo le inyectamos el type: "message"
      return {
        type: "message",
        role: msg.role,
        content: msg.content
      };
    });

    // ==========================================
    // 🚀 NUEVA RESPONSES API
    // ==========================================
    const response = await openai.responses.create({
      input: items,
      ...finalOptions
    });

    return response.output_text;
  } catch (error) {
    logger.error({ err: error }, 'Failed to get completion from OpenAI');
    throw error;
  }
}

module.exports = {
  getEmbedding,
  getCompletion,
  openai
};
