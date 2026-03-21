const logger = require('../utils/logger');

class FastIntentRouter {
  constructor() {
    this.patterns = {
      greeting: [
        /\b(hola|hello|buenas|hey|hi|qu[eé] onda|qu[eé] rollo|qu[eé] tranza|q onda)\b/i
      ],

      smalltalk: [
        /\b(qu[eé] tal|c[oó]mo est[aá]s|how are you|qu[eé] haces|qu[eé] pedo|q haces|qu[eé] cuentas)\b/i
      ],

      informal_plan: [
        /\b(vamos a|fuga|pistear|chelas|cervezas|un plan|salir|salimos|piste|hooters)\b/i
      ],

      rant_venting: [
        /\b(hasta la madre|hasta la chingada|me caga|pinche|harto de|harta de|no soporto)\b/i
      ],

      emotional_crisis: [
        /(suicid|no quiero vivir|quiero morir|matarme|choqu[eé]|emergencia)/i
      ],

      emotional_support: [
        /\b(estoy triste|ando deprimid|termin[eé] con|me siento mal|ag[uü]itad[oa]|llorando)\b/i
      ]
    };
  }

  route(messageText) {
    for (const intent in this.patterns) {
      const regexList = this.patterns[intent];
      for (const regex of regexList) {
        if (regex.test(messageText)) {
          logger.info(
            { intent, messageText },
            "FastIntentRouter matched"
          );
          return this.buildClassification(intent);
        }
      }
    }
    return null;
  }

  buildClassification(intent) {
    switch (intent) {
      case "greeting":
        return {
          intent,
          importance: 0.1,
          complexity: 0.1,
          requires_human: false
        };

      case "smalltalk":
        return {
          intent,
          importance: 0.2,
          complexity: 0.1,
          requires_human: false
        };

      case "informal_plan":
        return {
          intent,
          importance: 0.4,
          complexity: 0.2,
          requires_human: false
        };

      case "rant_venting":
        return {
          intent,
          importance: 0.5,
          complexity: 0.3,
          requires_human: false
        };

      case "emotional_support":
        return {
          intent,
          importance: 0.6,
          complexity: 0.4,
          requires_human: false
        };

      case "emotional_crisis":
        return {
          intent,
          importance: 1.0,
          complexity: 1.0,
          requires_human: true
        };

      default:
        return null;
    }
  }
}

module.exports = new FastIntentRouter();