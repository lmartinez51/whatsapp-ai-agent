require('dotenv').config();

const config = {
  openaiApiKey: process.env.OPENAI_API_KEY,
  modelName: process.env.MODEL_NAME || 'gpt-5.4-nano-2026-03-17',
  confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.65,
  language: process.env.LANGUAGE || 'es',
};

// Validate critical variables
if (!config.openaiApiKey) {
  console.warn("WARNING: OPENAI_API_KEY is not set in environment variables.");
}

module.exports = config;
