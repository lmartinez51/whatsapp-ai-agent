const logger = require('../utils/logger');
const messageProcessor = require('../pipeline/messageProcessor');

// Store processed message IDs
const processedMessages = new Set();

/**
 * Attaches event listeners for incoming WhatsApp messages.
 * @param {import('whatsapp-web.js').Client} client
 */
const attachListeners = (client) => {

  // Clean processed IDs periodically to avoid memory growth
  setInterval(() => {
    processedMessages.clear();
    // logger.debug('Processed message cache cleared'); // Silenciado para limpieza
  }, 1000 * 60 * 10); // every 10 minutes


  client.on('message', async (message) => {
    try {
      const messageId = message.id?._serialized;

      // 1. Duplicate protection
      if (processedMessages.has(messageId)) {
        return;
      }
      processedMessages.add(messageId);

      // 2. 🛡️ ESCUDO DE PROTOCOLO (Anti-Spam de Canales y Status)
      if (message.from === 'status@broadcast' || message.from.includes('@newsletter')) {
        return;
      }

      // 3. Ignore own messages
      if (message.fromMe) {
        return;
      }

      // 4. Ignore old messages (replay protection)
      const messageAge = Date.now() / 1000 - message.timestamp;
      if (messageAge > 60) {
        return;
      }

      // ==========================================
      // 5. 🛡️ FILTRO DE TIPO DE MENSAJE (¡PUERTAS ABIERTAS!)
      // ==========================================
      
      // Lista VIP de lo que SÍ vamos a procesar
      const allowedTypes = ['chat', 'image', 'sticker', 'audio', 'ptt'];
      
      // Si el tipo de mensaje NO está en nuestra lista VIP, lo ignoramos.
      if (!allowedTypes.includes(message.type)) {
        // console.log(`[🛡️ FILTRO] Bloqueando tipo no soportado: ${message.type}`);
        return;
      }

      const text = (message.body || '').trim();
      // Si no trae texto Y TAMPOCO trae un archivo adjunto (audio/foto), entonces sí mátalo
      if (!text && !message.hasMedia) return;

      // 6. OBTENER CHAT
      const chat = await message.getChat();

      // 7. Ignore group chats
      if (chat.isGroup) {
        return;
      }

      // El log de "Incoming message" ya lo hace el MessageProcessor de forma bonita, 
      // así que aquí ya no necesitamos imprimir nada para evitar duplicidad.

      // 8. Pasar al procesador principal
      await messageProcessor.processIncomingMessage(message, chat);

    } catch (error) {
      if (message.from.includes('@newsletter')) return;

      logger.error(
        { err: error, msgId: message.id?._serialized },
        'Error fatal en el listener de mensajes'
      );
    }
  });
};

module.exports = { attachListeners };