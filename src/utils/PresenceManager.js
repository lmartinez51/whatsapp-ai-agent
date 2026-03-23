const logger = require('./logger');
const personalityEngine = require('../personality/personalityEngine');

// Función de utilidad para pausar la ejecución de forma asíncrona
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class PresenceManager {
  /**
   * Calcula el tiempo de espera inicial (en gris) basado en la jerarquía del contacto.
   */
  _getInitialDelay(contactId, relationship) {
    let min = 120000; // 2 minutos por defecto
    let max = 300000; // 5 minutos por defecto

    // 1. El jefe
    if (relationship === 'jefe') {
      min = 1000;  // 1 segs
      max = 2000;  // 2 segs
    } 
    // 2. La Pareja
    else if (relationship === 'pareja' || relationship === 'ex-pareja') {
      min = 2000;  // 2 segs
      max = 4000;  // 4 segs
    } 
    // 3. VIPs Tier 1 (Heavy Sarcasm)
    else if (personalityEngine.heavySarcasmContacts.includes(contactId)) {
      min = 20000;  // 20 segs
      max = 30000;  // 30 segs
    } 
    // 4. VIPs Tier 2 (Casual Slang - Steven)
    else if (personalityEngine.casualSlangContacts.includes(contactId)) {
      min = 30000;  // 30 segs
      max = 45000; // 45 segs
    } 
    // 5. VIPs Tier 3 (Polite Casual - Blanca)
    else if (personalityEngine.politeCasualContacts.includes(contactId)) {
      min = 45000;  // 45 segs
      max = 60000; // 1 minuto
    }
    // 6. Resto de amigos conocidos
    else if (relationship === 'amigo' || relationship === 'amiga') {
      min = 60000;  // 1 minuto
      max = 240000; // 4 minutos
    }

    // Jitter: Calculamos un valor aleatorio entre el min y el max
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Simula el tiempo que tarda un humano en teclear el mensaje
   */
  _getTypingDelay(text) {
    // Asumimos que Lorenzo teclea rápido: ~80ms por caracter + 1 segundo para acomodarse
    const delayMs = 1000 + (text.length * 80); 
    // Un tope máximo de 15 segundos para que WhatsApp no cancele el estado "escribiendo..."
    return Math.min(delayMs, 15000); 
  }

  /**
   * Orquesta toda la ilusión humana (Esperar -> Visto -> Leer -> Escribir)
   */
  async simulateHumanPresence(chat, contactId, contactName, relationship, replyText) {
    // 1. Tiempo en "Gris" (Ignorando el mensaje)
    const initialWait = this._getInitialDelay(contactId, relationship);
    
    // Log amigable para que tú sepas qué está pasando tras bambalinas
    const timeString = new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: true });
    const agentName = personalityEngine.activeAgent === 'lorenzo' ? 'Lorenzo' : 'Camila';
    console.log(`\x1b[35m[%s]\x1b[0m ⏳ ${agentName} esperará \x1b[33m${(initialWait/1000).toFixed(0)}s\x1b[0m para abrir el chat de %s...`, timeString, contactName);
    
    await delay(initialWait);

    // 2. Entrar al chat (Palomitas Azules)
    if (chat.sendSeen) {
      await chat.sendSeen();
    }

    // 3. Simular lectura (Pausa corta de 2 a 4 segundos)
    const readingTime = Math.floor(Math.random() * 2000) + 2000;
    await delay(readingTime);

    // 4. Activar "Escribiendo..."
    if (chat.sendStateTyping) {
      await chat.sendStateTyping();
    }

    // 5. Esperar mientras "teclea"
    const typingTime = this._getTypingDelay(replyText);
    await delay(typingTime);

    // 6. Limpiar estado por precaución
    if (chat.clearState) {
      await chat.clearState();
    }
  }
}

module.exports = new PresenceManager();