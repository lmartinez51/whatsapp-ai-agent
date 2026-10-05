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
  // Sonda opcional para depuración profunda (activar solo si DEBUG_RAW=true)
  if (process.env.DEBUG_RAW === 'true') {
    client.on('message_create', (msg) => {
      if (msg.fromMe) return;
      normalizeMessageKey(msg);
      logger.debug(
        { type: msg.type, from: msg.from, body: msg.body },
        '[SONDA RAW] Mensaje detectado'
      );
    });
  }

  client.on('message', async (message) => {
    normalizeMessageKey(message);

    try {
      const messageId = message.id?._serialized;
      if (messageId && processedMessages.has(messageId)) return;
      if (messageId) processedMessages.add(messageId);

      // Descarte silencioso de estados y newsletters
      if (!message.from || message.from === 'status@broadcast' || message.from.includes('@newsletter')) {
        return;
      }

      if (message.fromMe) return;

      const messageAge = Date.now() / 1000 - message.timestamp;
      if (messageAge > 120) return;

      // Descarte silencioso de grupos
      if (message.from.endsWith('@g.us')) return;

      const allowedTypes = ['chat', 'image', 'sticker', 'audio', 'ptt'];
      if (!allowedTypes.includes(message.type)) return;

      const text = (message.body || '').trim();
      if (!text && !message.hasMedia) return;

      let chat;
      try {
        chat = await message.getChat();
      } catch (chatError) {
        logger.debug({ err: chatError.message }, 'getChat() falló, usando chat mock fallback');
        chat = {
          id: { _serialized: message.from },
          isGroup: false,
          name: message._data?.notifyName || 'Contacto',
          sendMessage: (content, options) => client.sendMessage(message.from, content, options)
        };
      }

      if (chat.isGroup) return;

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