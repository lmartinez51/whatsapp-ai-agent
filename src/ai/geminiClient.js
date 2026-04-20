const { GoogleGenAI } = require('@google/genai');
const config = require('../config');
const logger = require('../utils/logger');

// Inicializamos el cliente una sola vez de forma global (Singleton)
let geminiClient = null;

if (config.geminiApiKey) {
    geminiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

/**
 * Gets a content generation response from Gemini.
 * @param {object[]} contents - The array of content parts (user/model history).
 * @param {object} options - Override defaults (systemInstruction, temperature, etc).
 * @returns {Promise<string|null>}
 */
async function getGeminiCompletion(contents, options = {}) {
    if (!geminiClient) {
        throw new Error("Gemini client is not initialized. Check your GEMINI_API_KEY.");
    }

    try {
        const defaultOptions = {
            temperature: config.geminiTemperature,
            maxOutputTokens: 800,
            thinkingConfig: {
                thinkingLevel: 'minimal'
            }
        };

        const finalOptions = { ...defaultOptions, ...options };

        // Extraemos safetySettings de las opciones si es que existen
        const safetySettings = finalOptions.safetySettings;
        delete finalOptions.safetySettings; // Lo borramos para no mandarlo doble por accidente

        // Armamos el paquete principal para la API
        const requestPayload = {
            model: config.geminiModelName,
            contents: contents,
            config: finalOptions
        };

        // Si detectamos los escudos modificados, se los inyectamos a la raíz
        if (safetySettings) {
            requestPayload.safetySettings = safetySettings;
        }

        const response = await geminiClient.models.generateContent(requestPayload);

        return response.text;
    } catch (error) {
        logger.error({ err: error }, 'Failed to get completion from Gemini');
        throw error;
    }
}

module.exports = {
    getGeminiCompletion,
    geminiClient
};