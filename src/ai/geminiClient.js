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

    const defaultOptions = {
        temperature: config.geminiTemperature,
        maxOutputTokens: 800,
        thinkingConfig: {
            thinkingLevel: 'minimal'
        }
    };

    const finalOptions = { ...defaultOptions, ...options };
    const safetySettings = finalOptions.safetySettings;
    delete finalOptions.safetySettings; 

    const requestPayload = {
        model: config.geminiModelName, // Aquí debe estar jalando tu 'gemini-3-flash-preview' del .env
        contents: contents,
        config: finalOptions
    };

    if (safetySettings) {
        requestPayload.safetySettings = safetySettings;
    }

    // ==========================================
    // 🛡️ SISTEMA DE SUPERVIVENCIA (Exponential Backoff)
    // ==========================================
    const MAX_RETRIES = 3;
    let delayMs = 2000; // Empezamos esperando 2 segundos

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            // Intentamos contactar a la API
            const response = await geminiClient.models.generateContent(requestPayload);
            return response.text;

        } catch (error) {
            // Buscamos las firmas clásicas de un servidor saturado (Código 503 o 429)
            const isTransientError = 
                error.status === 503 || 
                error.status === 429 || 
                (error.message && (error.message.toLowerCase().includes('overloaded') || error.message.includes('503') || error.message.includes('429')));

            if (isTransientError && attempt < MAX_RETRIES) {
                console.log(`\x1b[33m[⚠️ API SATURADA]\x1b[0m Gemini está ocupado. Reintento ${attempt}/${MAX_RETRIES} en ${delayMs/1000}s...`);
                
                // Pausamos la ejecución por 'delayMs' milisegundos
                await new Promise(resolve => setTimeout(resolve, delayMs));
                
                // Duplicamos el tiempo de espera para el siguiente intento (2s -> 4s -> 8s)
                delayMs *= 2; 
                continue; // Volvemos a iniciar el ciclo for
            }

            // Si el error es otra cosa (ej. llave inválida) o se nos acabaron los intentos, lanzamos el error real
            logger.error({ err: error, attempt }, 'Failed to get completion from Gemini after retries');
            throw error;
        }
    }
}

module.exports = {
    getGeminiCompletion,
    geminiClient
};