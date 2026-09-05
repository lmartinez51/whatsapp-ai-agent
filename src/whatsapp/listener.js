const logger = require('../utils/logger');
const messageProcessor = require('../pipeline/messageProcessor');

const processedMessages = new Set();

setInterval(() => {
  processedMessages.clear();
}, 1000 * 60 * 10);

const normalizeMessageKey = (msg) => {
  if (!msg) return;
  if (msg.id && !msg.id._serialized) {
    const rawSerialized = msg.id.$1 || msg._data?.id?._serialized || msg._data?.id?.$1;
    if (rawSerialized) {
      msg.id._serialized = rawSerialized;
    } else if (msg.id.remote && msg.id.id) {
      const fromMe = Boolean(msg.id.fromMe);
      msg.id._serialized = `${fromMe}_${msg.id.remote}_${msg.id.id}`;
    }
  }
  if (typeof msg.from === 'object' && msg.from !== null) {
    msg.from = msg.from._serialized || msg.from.$1 || String(msg.from);
  }
};

const attachListeners = (client) => {
  // Sonda para cualquier mensaje creado o recibido
  client.on('message_create', (msg) => {
    if (msg.fromMe) return; // evitar eco propio en consola
    normalizeMessageKey(msg);
    console.log(`\x1b[36m[SONDA RAW]\x1b[0m Tipo: ${msg.type} | From: ${msg.from} | Body: "${msg.body}" | Age: ${Math.round(Date.now() / 1000 - msg.timestamp)}s`);
  });

  client.on('message', async (message) => {
    normalizeMessageKey(message);
    console.log(`\x1b[32m[EVENTO MESSAGE]\x1b[0m ID: ${message.id?._serialized} | From: ${message.from} | Type: ${message.type}`);

    try {
      const messageId = message.id?._serialized;
      if (messageId && processedMessages.has(messageId)) {
        console.log(`[FILTRO] Descartado por duplicado: ${messageId}`);
        return;
      }
      if (messageId) processedMessages.add(messageId);

      // Escudo básico contra estados y newsletters únicamente
      if (!message.from || message.from === 'status@broadcast' || message.from.includes('@newsletter')) {
        console.log(`[FILTRO] Descartado por broadcast/newsletter: ${message.from}`);
        return;
      }

      if (message.fromMe) return;

      const messageAge = Date.now() / 1000 - message.timestamp;
      if (messageAge > 120) {
        console.log(`[FILTRO] Descartado por antigüedad (${Math.round(messageAge)}s > 120s)`);
        return;
      }

      if (message.from.endsWith('@g.us')) {
        console.log(`[FILTRO] Descartado por ser grupo: ${message.from}`);
        return;
      }

      const allowedTypes = ['chat', 'image', 'sticker', 'audio', 'ptt'];
      if (!allowedTypes.includes(message.type)) {
        console.log(`[FILTRO] Descartado por tipo no permitido: ${message.type}`);
        return;
      }

      const text = (message.body || '').trim();
      if (!text && !message.hasMedia) {
        console.log('[FILTRO] Descartado por no tener texto ni media');
        return;
      }

      let chat;
      try {
        chat = await message.getChat();
      } catch (chatError) {
        console.log(`[FALLBACK] getChat() falló: ${chatError.message}. Creando chat mock.`);
        chat = {
          id: { _serialized: message.from },
          isGroup: false,
          name: message._data?.notifyName || 'Contacto',
          sendMessage: (content, options) => client.sendMessage(message.from, content, options)
        };
      }

      if (chat.isGroup) return;

      console.log(`\x1b[35m[PIPELINE]\x1b[0m Enviando mensaje a messageProcessor...`);
      await messageProcessor.processIncomingMessage(message, chat);

    } catch (error) {
      logger.error(
        { err: error, msgId: message.id?._serialized },
        'Error capturado en el listener'
      );
    }
  });
};

module.exports = { attachListeners };