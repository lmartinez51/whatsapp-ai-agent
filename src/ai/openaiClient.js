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

  const response = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: inputs
  });

  const embeddings = response.data.map(e => e.embedding);

  return Array.isArray(input) ? embeddings : embeddings[0];
}

/**
 * Gets a chat completion.
 * @param {object[]} messages 
 * @param {object} options Override defaults (temperature, max_tokens, etc)
 */
async function getCompletion(messages, options = {}) {
  try {
    const defaultOptions = {
      model: config.modelName,
      temperature: 0.7,
    };
    
    // Merge options
    const finalOptions = { ...defaultOptions, ...options };

    const response = await openai.chat.completions.create({
      messages,
      ...finalOptions
    });

    return response.choices[0].message.content;
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
