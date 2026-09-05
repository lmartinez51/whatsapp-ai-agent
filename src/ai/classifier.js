const openaiClient = require('./openaiClient');
const personalityEngine = require('../personality/personalityEngine');
const fastIntentRouter = require('./fastIntentRouter');
const logger = require('../utils/logger');

class Classifier {
  constructor() {
    // Intents rediseñados para WhatsApp Personal
    this.allowedIntents = new Set([
      "greeting",           // Saludos ("Hola", "Qué rollo", "Buenos días")
      "smalltalk",          // Plática trivial o chisme ("Ando aburrido", "Jaja sí")
      "chat",               // Conversación general / chat casual
      "informal_plan",      // Organizar salidas, invitar a comer, chelear ("Vamos a Hooters", "Fuga")
      "information_request",// Preguntas directas ("¿A qué hora entras a trabajar?", "¿Dónde andas?")
      "rant_venting",       // Quejarse de la vida/trabajo ("Estoy hasta la chingada de mi jefe")
      "emotional_support",  // Apoyo emocional ligero ("Ando agüitado", "Corté con mi morra")
      "emotional_crisis",   // Emergencias reales (Suicidio, violencia, accidentes)
      "other"               // Cualquier otra cosa
    ]);
  }

  /**
   * Validates classifier output schema
   */
  validateSchema(data) {
    if (!data || typeof data !== "object") {
      throw new Error("Classifier returned invalid object");
    }

    const { intent, importance, complexity, requires_human } = data;

    if (typeof intent !== "string") {
      throw new Error("Invalid intent");
    }

    if (!this.allowedIntents.has(intent)) {
      logger.warn({ intent }, "Unknown intent returned, normalizing to 'other'");
      data.intent = "other";
    }

    if (typeof importance !== "number" || importance < 0 || importance > 1) {
      data.importance = 0.5;
    }

    if (typeof complexity !== "number" || complexity < 0 || complexity > 1) {
      data.complexity = 0.5;
    }

    if (typeof requires_human !== "boolean") {
      data.requires_human = false;
    }

    return data;
  }

  /**
   * Builds the system prompt for classification
   */
  buildSystemPrompt() {
    const intentsList = Array.from(this.allowedIntents).map(i => `- ${i}`).join('\n');

    return `
<system_role>
You are an analytical classifier for incoming PERSONAL WhatsApp messages. Your sole purpose is to analyze the user's message and categorize it accurately into a predefined JSON schema based on casual, social interactions.
</system_role>

<structured_output_contract>
- You must respond ONLY with valid, parsable JSON.
- Do not include any conversational text, explanations, or markdown fences (e.g., do not use \`\`\`json).
- The JSON object MUST contain exactly these four keys with the exact data types specified:
  1. "intent" (string)
  2. "importance" (number, float between 0.0 and 1.0)
  3. "complexity" (number, float between 0.0 and 1.0)
  4. "requires_human" (boolean)
</structured_output_contract>

<schema_definitions>
[intent]
Must be EXACTLY one of the following categories:
${intentsList}

*Definitions for context:*
- 'informal_plan': Making plans to hang out, drink, or eat (e.g., "Vamos por unas cheves", "Fuga al cine").
- 'rant_venting': Casual complaining about work, life, or people (e.g., "Ya estoy hasta la madre", "Me caga mi jefe").
- 'emotional_support': Seeking light comfort (e.g., "Ando agüitado", "Terminé con mi novio").

[importance]
0.0 is a trivial message ("jaja", "ok"), 1.0 is highly critical or a life emergency.

[complexity]
0.0 is a simple response, 1.0 requires deep reasoning, multi-step logic, or heavy context.
</schema_definitions>

<escalation_rules>
The "requires_human" flag is extremely strict. 

Set "requires_human": true ONLY for severe emergencies such as:
- Riesgo de suicidio o autolesiones ("Quiero suicidarme", "No quiero vivir")
- Abuso o violencia ("Me están golpeando")
- Emergencia médica o legal grave ("Necesito ayuda urgente", "Choqué el carro")

Set "requires_human": false for normal social behavior:
- Venting/Ranting ("Ya estoy hasta la madre")
- Light sadness ("Ando deprimida", "Tuve un mal día")
- Making plans ("Vamos a pistear")
</escalation_rules>
`.trim();
  }

  /**
   * Classifies a message using fast router or LLM
   */
  async classify(messageText) {
    try {
      const normalizedText = messageText.toLowerCase().trim();

      // 1️⃣ Fast Intent Router
      const fastRoute = fastIntentRouter.route(normalizedText);

      if (fastRoute) {
        logger.info(
          { messageText, classification: fastRoute },
          "Fast router classification used"
        );
        return fastRoute;
      }

      // 2️⃣ Fallback al clasificador LLM
      const messages = [
        { role: "system", content: this.buildSystemPrompt() },
        { role: "user", content: messageText }
      ];

      const smallOptions = personalityEngine.getSmallClassificationOptions();

      const responseText = await openaiClient.getCompletion(messages, {
        ...smallOptions,
        reasoning: { effort: 'low' },
        max_output_tokens: 250,
        response_format: { type: "json_object" }
      });

      let parsed;

      try {
        const cleanJsonString = responseText
          .replace(/```json/gi, '')
          .replace(/```/g, '')
          .trim();

        parsed = JSON.parse(cleanJsonString);
      } catch (err) {
        logger.error({ responseText }, "Classifier returned invalid JSON");
        throw new Error("Invalid JSON from classifier");
      }

      const validated = this.validateSchema(parsed);

      // logger.info(
      //   { messageText, classification: validated },
      //   "LLM classification used"
      // );

      return validated;

    } catch (error) {
      logger.warn(
        { err: error.message || error, messageText },
        "Classifier evaluation failed; using safe conversational fallback classification"
      );

      // Fallback seguro: Si ocurre un error de API o red, no bloquear mensajes seguros con requires_human: true
      return {
        intent: "chat",
        confidence: 0.7,
        importance: 0.2,
        complexity: 0.2,
        requires_human: false,
        isFallback: true
      };
    }
  } 
}

module.exports = new Classifier();