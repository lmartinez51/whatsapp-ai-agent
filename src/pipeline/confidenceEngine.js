const logger = require('../utils/logger');
const classifier = require('../ai/classifier');
const config = require('../config');

class ConfidenceEngine {
  constructor() {
    // Puntajes perfectamente sincronizados con el Classifier social
    this.intentBaseConfidence = {
      greeting: 0.95,            // "Hola", "Qué rollo" -> Respuestas casi automáticas
      smalltalk: 0.95,           // Chisme o plática trivial -> Terreno seguro para el LLM
      informal_plan: 0.90,       // "Vamos a pistear", "Fuga" -> Muy seguro de contestar
      information_request: 0.90, // "¿A qué hora sales?" -> Seguro, leerá el contexto
      rant_venting: 0.85,        // "Estoy hasta la madre" -> Nivel medio-alto, requiere el toque de Lorenzo
      emotional_support: 0.80,   // "Ando agüitado" -> Nivel medio, hay que tener un poco de tacto
      emotional_crisis: 0.0,     // Bloqueo absoluto, requiere que tú (el humano) tomes el celular
      other: 0.75                // Fallback
    };

    // Los pesos matemáticos se mantienen intactos
    this.weights = {
      complexity: 0.35,
      importance: 0.25
    };
  }

  /**
   * Compute confidence score
   */
  evaluateConfidence(classification) {
    if (!classification) {
      return 0;
    }

    const { intent, complexity, importance, requires_human } = classification;

    // Bloqueo duro inmediato basado en las reglas de escalamiento del Clasificador
    if (requires_human === true) {
      logger.warn(
        { intent },
        "Confidence Gate triggered: Message requires human intervention (Critical Flag)"
      );
      return 0;
    }

    const baseConfidence = this.intentBaseConfidence[intent] ?? this.intentBaseConfidence.other;

    const complexityPenalty = complexity * this.weights.complexity;
    const importancePenalty = importance * this.weights.importance;

    let finalConfidence = baseConfidence - complexityPenalty - importancePenalty;

    // Límites de seguridad (Boundary enforcement)
    finalConfidence = Math.max(0, Math.min(1, finalConfidence));

    // logger.info(
    //   { intent, baseConfidence, complexity, importance, finalConfidence },
    //   "Confidence Engine Evaluated"
    // );

    return finalConfidence;
  }

  /**
   * Main evaluation entry
   */
  async shouldRespond(messageText) {
    try {
      const classification = await classifier.classify(messageText);
      const score = this.evaluateConfidence(classification);
      
      const threshold = config.confidenceThreshold || 0.65; 

      const isAllowed = score >= threshold;
      let responseMode = "auto";

      if (score < threshold) {
        responseMode = "human_required";
      } else if (score < threshold + 0.1) {
        responseMode = "careful_auto"; 
      }

      // logger.info(
      //   { messageText, score, threshold, responseMode, classification },
      //   "Confidence evaluation result"
      // );

      return {
        isAllowed,
        score,
        responseMode,
        classification
      };

    } catch (error) {
      logger.error(
        { err: error },
        "Confidence evaluation failed"
      );

      return {
        isAllowed: false,
        score: 0,
        responseMode: "error",
        classification: null
      };
    }
  }
}

module.exports = new ConfidenceEngine();