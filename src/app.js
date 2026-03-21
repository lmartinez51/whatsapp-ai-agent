/**
 * @file AI'm Camila - WhatsApp AI Agent
 * @author Lorenzo Martinez
 * @version 1.0.0
 * @description A high-level WhatsApp AI assistant architecture featuring a Dual-LLM Strategy Pattern (OpenAI/Gemini) and a native sticker interceptor pipeline.
 */

const logger = require('./utils/logger');
const { initWhatsAppClient } = require('./whatsapp/client');
const memoryIngestionManager = require('./memory/memoryIngestionManager');

/**
 * Bootstraps the application, initializing required asynchronous dependencies and starting the WhatsApp client.
 * @returns {Promise<void>} Resolves when the application has successfully started.
 * @throws {Error} Throws if dependency initialization fails, triggering a process exit.
 */
async function bootstrap() {
  try {
    logger.info('Starting AI WhatsApp Assistant...');

    // Inicializar dependencias (ej. conexión a base de datos vectorial por adelantado)
    // await initVectorStore();
    await memoryIngestionManager.init();

    // Iniciar el cliente de interfaz web / WhatsApp
    initWhatsAppClient();

  } catch (error) {
    logger.error({ err: error }, 'Failed to bootstrap application.');
    process.exit(1);
  }
}

// Manejadores globales de errores no capturados
process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught Exception');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error({ err: reason, promise }, 'Unhandled Rejection');
});

bootstrap();
