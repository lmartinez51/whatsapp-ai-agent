const logger = require('../utils/logger');

class EscalationManager {
  constructor() {
    // Aquí pones el ID de tu WhatsApp secundario (el que recibe las alertas)
    // Lo ideal es meterlo en tu archivo .env como MASTER_NUMBER=521XXXXXXXXXX@c.us
    this.masterNumber = process.env.MASTER_NUMBER || "5216563497982@c.us"; 
  }

  /**
   * Evalúa si el mensaje contiene palabras clave de emergencia
   */
  isUrgent(text) {
    if (!text) return false;
    // Regex ajustado para emergencias reales (como lo de la llanta)
    const urgentRegex = /\b(urge|emergencia|urgente|ponch[oó]|hospital|choqu[eé]|r[aá]pido|auxilio|accidente)\b/i;
    return urgentRegex.test(text);
  }

  /**
   * Envía la alerta a tu número secundario
   */
  async alertMaster(client, contactName, text) {
    const alertMessage = `🚨 *ALERTA DE EMERGENCIA* 🚨\n👤 *De:* ${contactName}\n💬 *Mensaje:* "${text}"\n\n_El bot ha silenciado su respuesta. El chat está libre para ti._`;
    
    try {
      // Usamos el cliente global de WhatsApp para mandar el mensaje a TU número
      await client.sendMessage(this.masterNumber, alertMessage);
      // Log amigable para tu consola
      console.log(`\x1b[41m\x1b[37m[🚨 ALERTA ENVIADA]\x1b[0m Pitazo enviado al celular maestro sobre ${contactName}.`);
    } catch (error) {
      logger.error({ err: error }, 'Error enviando alerta al maestro');
    }
  }
}

module.exports = new EscalationManager();