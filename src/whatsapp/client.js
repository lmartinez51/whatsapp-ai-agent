const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger');
const { attachListeners } = require('./listener');
const { applyDisguise } = require('../utils/disguiseManager');

let wappClient = null;

const initWhatsAppClient = () => {
  if (wappClient) return wappClient;

  logger.info('Initializing WhatsApp Web Client...');

  wappClient = new Client({
    authStrategy: new LocalAuth({ dataPath: 'data/whatsapp_auth' }),
    authTimeoutMs: 60000,
    puppeteer: {
      headless: 'new',
      navigationTimeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu'
      ]
    }
  });

  // 1. Attach message & pipeline listeners immediately to prevent race conditions
  attachListeners(wappClient);

  let frameListenerAttached = false;
  const setupNavigationListener = () => {
    if (wappClient.pupPage && !frameListenerAttached) {
      frameListenerAttached = true;
      wappClient.pupPage.on('framenavigated', async (frame) => {
        try {
          if (wappClient.pupPage && frame === wappClient.pupPage.mainFrame()) {
            logger.info('Post-auth frame navigation detected. Verifying script injection stability...');
            await wappClient.pupPage.waitForFunction(
              () => typeof window.WWebJS !== 'undefined',
              { timeout: 30000 }
            ).catch(() => {});
            logger.info('WWebJS script injection re-verified after frame reload.');
          }
        } catch (err) {
          logger.warn({ err: err.message }, 'Failed to re-verify script injection after frame navigation');
        }
      });
    }
  };

  wappClient.on('ready', async () => {
    logger.info('WhatsApp client is ready!');
    setupNavigationListener();

    const activeAgent = process.env.ACTIVE_AGENT || 'lorenzo';
    await applyDisguise(wappClient, activeAgent);
  });

  wappClient.on('qr', (qr) => {
    logger.info('QR Code received:');
    qrcode.generate(qr, { small: true });
  });

  wappClient.on('authenticated', () => {
    logger.info('WhatsApp Client Authenticated successfully.');
    setupNavigationListener();
  });

  wappClient.on('auth_failure', (msg) => {
    logger.error(`WhatsApp Authentication failure: ${msg}`);
  });

  wappClient.on('disconnected', (reason) => {
    logger.warn(`WhatsApp Client disconnected: ${reason}`);
  });

  wappClient.initialize();

  return wappClient;
};

const getClient = () => {
  if (!wappClient) throw new Error('WhatsApp Client not initialized.');
  return wappClient;
};

module.exports = {
  initWhatsAppClient,
  getClient
};