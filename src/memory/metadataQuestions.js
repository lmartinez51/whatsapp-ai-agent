const { choice, noul } = require('@typesafe-ai/sdk');
const openaiClient = require('../ai/openaiClient');
const geminiClient = require('../ai/geminiClient');
const logger = require('../utils/logger');

/**
 * 16-option provisional topic taxonomy grounded in actual WhatsApp conversation history.
 */
const TOPIC_CRITERIA = {
  saludo_plática: 'A greeting, brief check-in, emoji exchange, or small talk with no other subject',
  planes_salidas: 'Making plans to meet up, go out, drink, eat, or travel',
  trabajo_escuela: 'Work, school, studies, jobs, professional life, or career events',
  tecnologia_gadgets: 'Tech, devices, apps, software, hardware, IoT, or AI',
  relaciones_drama: 'Romantic relationships, breakups, dating, jealousy, or interpersonal conflict',
  familia: 'Family members, parenting, home life, or domestic situations',
  humor_bromas: 'Jokes, roasts, teasing, memes, or playful insults where the banter itself is the content — no underlying subject is being discussed',
  apoyo_emocional: 'Emotional support, venting frustration, sadness, or asking for comfort',
  dinero_deudas: 'Money, payments, debts, tickets, billing, or financial matters',
  chisme_cotilleo: 'Gossip or talking about a specific third party, their actions, or social drama involving named or described people',
  entretenimiento: 'TV shows, movies, music, sports, streaming, or events',
  comida_bebida: 'Food, drinks, restaurants, cooking, or bar outings',
  viajes_lugares: 'Travel, locations, cities, tourism, or describing places',
  salud_cuerpo: 'Health, illness, medical topics, appearance, or physical wellbeing',
  media_visual: 'The exchange is primarily about an image, sticker, voice note, or video — the media is the message',
  otro: 'Anything that does not fit any category above'
};

/**
 * Criteria for determining if an exchange is substantive enough to record in long-term contact profile.
 */
const WORTH_STORING_CRITERIA = {
  true: 'The exchange reveals something specific about the user: their interests, plans, emotional state, a named person or place, an opinion, or a fact about their life. This includes substantive arguments, venting with detail, or coordination of real-world actions.',
  false: "The exchange is a greeting, a filler response ('ok', 'jaja', 'sí'), a pure emoji or sticker with no words, or a media annotation with no textual context about what was actually said. Nothing specific about the user could be inferred."
};

/**
 * Human-readable fallback labels in Spanish for fallback summaries if the LLM summary call fails.
 * Used as: `El usuario y ${agentName} hablaron sobre ${TOPIC_LABELS[topic]}.`
 */
const TOPIC_LABELS = {
  saludo_plática: 'saludos y plática casual',
  planes_salidas: 'planes y salidas',
  trabajo_escuela: 'trabajo o escuela',
  tecnologia_gadgets: 'tecnología y dispositivos',
  relaciones_drama: 'relaciones interpersonales',
  familia: 'temas familiares',
  humor_bromas: 'bromas y humor',
  apoyo_emocional: 'apoyo emocional y desahogo',
  dinero_deudas: 'dinero y finanzas',
  chisme_cotilleo: 'chismes y novedades sociales',
  entretenimiento: 'entretenimiento y eventos',
  comida_bebida: 'comida y bebidas',
  viajes_lugares: 'viajes y lugares',
  salud_cuerpo: 'salud y bienestar',
  media_visual: 'contenido multimedia compartido',
  otro: 'un tema general'
};

/**
 * Pinned TypeSafe System One model. Uses jev-1.13.0 (exact version).
 * Can be overridden via TYPESAFE_MODEL in .env.
 */
const TYPESAFE_MODEL = process.env.TYPESAFE_MODEL || 'jev-1.13.0';

/**
 * Default threshold for worth_storing decision. Permissive by default (0.55).
 * Can be overridden via MEMORY_WORTH_STORING_THRESHOLD in .env.
 */
const WORTH_STORING_THRESHOLD = parseFloat(process.env.MEMORY_WORTH_STORING_THRESHOLD) || 0.55;

/**
 * Formats the conversation exchange into the single state string expected by Jev questions.
 * Enforces input truncation to keep token budgets predictable and bounded.
 *
 * @param {string} userMessage - Raw or annotated message from user
 * @param {string} assistantReply - Raw reply from assistant
 * @param {string} [agentName='Camila'] - Name of active persona
 * @returns {{ exchange: string }} State object for systemOne
 */
function buildExchangeState(userMessage, assistantReply, agentName = 'Camila') {
  const u = (userMessage || '').slice(0, 1500);
  const a = (assistantReply || '').slice(0, 500);
  return {
    exchange: `User: ${u}\n${agentName}: ${a}`
  };
}

/**
 * Metadata extraction questions for TypeSafe System One (Jev).
 */
const METADATA_QUESTIONS = {
  topic: choice(
    'What is the primary topic of this WhatsApp conversation exchange?',
    TOPIC_CRITERIA
  ),
  worth_storing: noul(
    'Does this conversation exchange contain information worth remembering about the user — such as preferences, plans, opinions, personal facts, or notable events?',
    WORTH_STORING_CRITERIA
  )
};

/**
 * Generates a one-sentence neutral summary in Spanish using the active LLM (persona-free).
 *
 * @param {string} userMessage - User's incoming message
 * @param {string} assistantReply - Agent's reply
 * @param {string} [agentName='Camila'] - Name of active agent persona
 * @returns {Promise<string|null>} Cleaned summary string or null if call fails
 */
async function generatePlainTextSummary(userMessage, assistantReply, agentName = 'Camila') {
  const prompt =
    `Eres un analizador de conversaciones de WhatsApp.\n` +
    `Resume en una sola oración en español, en tercera persona, lo que se habló.\n` +
    `Especifica que la conversación fue entre el usuario y ${agentName}.\n` +
    `Sé específico: menciona nombres, lugares, eventos o temas concretos si los hay.\n` +
    `Responde solo con la oración, sin markdown, sin JSON, sin explicaciones.\n\n` +
    `Conversación:\n` +
    `Usuario: ${userMessage}\n` +
    `${agentName}: ${assistantReply}`;

  const activeLLM = (process.env.ACTIVE_LLM || 'openai').toLowerCase();
  let rawText = null;

  try {
    if (activeLLM === 'gemini') {
      rawText = await geminiClient.getGeminiCompletion(
        [{ role: 'user', parts: [{ text: prompt }] }],
        { maxOutputTokens: 120 }
      );
    } else {
      rawText = await openaiClient.getCompletion(
        [{ role: 'system', content: prompt }],
        {
          temperature: 0.2,
          reasoning: { effort: 'low' },
          max_output_tokens: 120
        }
      );
    }
  } catch (err) {
    logger.warn({ err: err.message || err }, 'Failed to call LLM for plain-text summary');
    return null;
  }

  const cleaned = (rawText || '').trim();
  return cleaned || null;
}

module.exports = {
  TOPIC_CRITERIA,
  WORTH_STORING_CRITERIA,
  TOPIC_LABELS,
  TYPESAFE_MODEL,
  WORTH_STORING_THRESHOLD,
  buildExchangeState,
  METADATA_QUESTIONS,
  generatePlainTextSummary
};

