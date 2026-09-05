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

/**
 * Gets a generation response using the new Responses API.
 * @param {object[]} messages 
 * @param {object} options Override defaults (temperature, max_tokens, etc)
 */
async function getCompletion(messages, options = {}) {
  try {
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
  openai,
  isReasoningOrCurrentGenModel,
  sanitizeOpenAIOptions
};
