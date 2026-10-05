const { GoogleGenAI } = require('@google/genai');
const config = require('../config');
const logger = require('../utils/logger');

// Inicializamos el cliente una sola vez de forma global (Singleton)
let geminiClient = null;

if (config.geminiApiKey) {
    geminiClient = new GoogleGenAI({ apiKey: config.geminiApiKey });
}

const SAMPLING_CONFIG_KEYS = ['temperature', 'topP', 'topK', 'top_p', 'top_k'];

function normalizeThinkingLevel(level) {
    const normalized = (level || 'medium').trim().toLowerCase();
    const allowedLevels = new Set(['minimal', 'low', 'medium', 'high']);
    const safeLevel = allowedLevels.has(normalized) ? normalized : 'medium';
    return safeLevel.toUpperCase();
}

function buildGeminiRequestPayload(contents, options = {}) {
    const { thinkingConfig = {}, ...configOverrides } = options;
    const finalConfig = {
        maxOutputTokens: 800,
        ...configOverrides,
        thinkingConfig: {
            thinkingLevel: normalizeThinkingLevel(config.geminiThinkingLevel),
            ...thinkingConfig
        }
    };

    finalConfig.thinkingConfig.thinkingLevel = normalizeThinkingLevel(finalConfig.thinkingConfig.thinkingLevel);
    delete finalConfig.thinkingConfig.thinkingBudget;

    for (const key of SAMPLING_CONFIG_KEYS) {
        delete finalConfig[key];
    }

    return {
        model: config.geminiModelName,
        contents,
        config: finalConfig
    };
}

function getFirstCandidateContent(response) {
    return response?.candidates?.[0]?.content || null;
}

function createGeminiResult(response) {
    return {
        text: typeof response?.text === 'string' ? response.text : null,
        content: getFirstCandidateContent(response),
        usageMetadata: response?.usageMetadata || null
    };
}

/**
 * Gets a content generation response from Gemini.
 * @param {object[]} contents - The array of content parts (user/model history).
 * @param {object} options - Override defaults (systemInstruction, safetySettings, etc).
 * @returns {Promise<object>}
 */
async function getGeminiCompletionResult(contents, options = {}) {
    if (!geminiClient) {
        throw new Error("Gemini client is not initialized. Check your GEMINI_API_KEY.");
    }

    const requestPayload = buildGeminiRequestPayload(contents, options);

    // ==========================================
    // SISTEMA DE SUPERVIVENCIA (Exponential Backoff)
    // ==========================================
    // 3 attempts total (~14 s max wait) — kept short intentionally so that
    // if Gemini is truly down, the cross-provider failover in responseEngine
    // can hand off to the secondary LLM quickly instead of blocking for a
    // full minute before the user gets a response.
    const RETRY_DELAYS_MS = [2000, 4000, 8000];
    const MAX_RETRIES = RETRY_DELAYS_MS.length;

    // Helper para extraer status y mensaje legible sin volcar el JSON masivo de la API
    function extractErrorInfo(err) {
        let status = err?.status || err?.code || 500;
        let message = err?.message || 'Unknown error';

        if (typeof message === 'string' && message.trim().startsWith('{')) {
            try {
                const parsed = JSON.parse(message);
                if (parsed.error) {
                    status = parsed.error.code || status;
                    message = parsed.error.status || parsed.error.message || message;
                }
            } catch (_) {}
        }
        // Resumen conciso si es cuota
        if (String(status) === '429' || message.includes('RESOURCE_EXHAUSTED')) {
            message = 'RESOURCE_EXHAUSTED (Quota exceeded)';
        } else if (message.length > 120) {
            message = message.substring(0, 120) + '...';
        }
        return { status, message };
    }

    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
        try {
            const response = await geminiClient.models.generateContent(requestPayload);
            const result = createGeminiResult(response);

            if (result.usageMetadata) {
                logger.debug({ usageMetadata: result.usageMetadata }, 'Gemini usage metadata');
            }

            return result;

        } catch (error) {
            const { status, message } = extractErrorInfo(error);

            // Si es cuota agotada (RESOURCE_EXHAUSTED / 429 cuota diaria), no sirve reintentar de inmediato
            const isQuotaExhausted =
                status === 429 &&
                (error.message && (
                    error.message.includes('Quota exceeded') ||
                    error.message.includes('quota') ||
                    error.message.includes('RESOURCE_EXHAUSTED')
                ));

            const isTransientError = !isQuotaExhausted && (
                status === 503 ||
                status === 429 ||
                (error.message && (
                    error.message.toLowerCase().includes('overloaded') ||
                    error.message.includes('UNAVAILABLE')
                ))
            );

            if (isTransientError && attempt <= MAX_RETRIES) {
                const delayMs = RETRY_DELAYS_MS[attempt - 1];
                console.log(`\x1b[33m[API SATURADA]\x1b[0m Gemini ocupado (Status: ${status}). Reintento ${attempt}/${MAX_RETRIES} en ${delayMs / 1000}s...`);

                await new Promise(resolve => setTimeout(resolve, delayMs));
                continue;
            }

            // Log limpio y conciso en consola
            logger.warn({ provider: 'gemini', status, message, attempt }, `[Gemini Error] Status: ${status} - ${message}`);
            throw error;
        }
    }
}

async function getGeminiCompletion(contents, options = {}) {
    const result = await getGeminiCompletionResult(contents, options);
    return result.text;
}

module.exports = {
    buildGeminiRequestPayload,
    createGeminiResult,
    getGeminiCompletion,
    getGeminiCompletionResult,
    geminiClient
};
