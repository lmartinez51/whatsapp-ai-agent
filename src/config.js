require('dotenv').config({ override: true });

const parseNumberEnv = (value, fallback) => {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseGeminiThinkingLevel = (value, fallback) => {
  const normalized = (value || '').trim().toLowerCase();
  const allowedLevels = new Set(['minimal', 'low', 'medium', 'high']);
  return allowedLevels.has(normalized) ? normalized : fallback;
};

const config = {
  // Configuración de OpenAI
  openaiApiKey: process.env.OPENAI_API_KEY,
  modelName: process.env.MODEL_NAME || 'gpt-5.4-nano-2026-03-17',
  
  // Configuración de Gemini
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModelName: process.env.GEMINI_MODEL_NAME || 'gemini-3.5-flash',
  geminiThinkingLevel: parseGeminiThinkingLevel(process.env.GEMINI_THINKING_LEVEL, 'medium'),

  // Configuración Global
  confidenceThreshold: parseNumberEnv(process.env.CONFIDENCE_THRESHOLD, 0.30),
  language: process.env.LANGUAGE || 'es',
};

// Validate critical variables
if (!config.openaiApiKey) {
  console.warn("WARNING: OPENAI_API_KEY is not set in environment variables.");
}
if (!config.geminiApiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not set in environment variables.");
}

module.exports = config;
