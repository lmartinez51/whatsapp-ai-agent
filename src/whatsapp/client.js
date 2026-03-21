const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const logger = require('../utils/logger');
const { attachListeners } = require('./listener');
const fs = require('fs');
const path = require('path');
const { applyDisguise } = require('../utils/disguiseManager');

let wappClient = null;

const initWhatsAppClient = () => {
  if (wappClient) return wappClient; // evita reinicialización accidental

  logger.info('Initializing WhatsApp Web Client...');

  wappClient = new Client({
    authStrategy: new LocalAuth({ dataPath: 'data/whatsapp_auth' }),
    puppeteer: {
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    }
  });

  wappClient.on('qr', (qr) => {
    logger.info('QR Code received, please scan with your phone:');
    qrcode.generate(qr, { small: true });
  });

  wappClient.on('ready', async () => { // <-- 1. Agregamos 'async' aquí
      logger.info('WhatsApp client is ready!');

      // ==========================================
      // 🎭 SISTEMA DE DISFRAZ MULTI-AGENTE (PERFIL + STORIES)
      // ==========================================
      const activeAgent = process.env.ACTIVE_AGENT || 'lorenzo';
      await applyDisguise(wappClient, activeAgent);
      // ==========================================

      // =========================================================
      // 🔍 SCRIPT TEMPORAL DE EXTRACCIÓN DE IDs DE CONTACTOS
      // =========================================================
      // try {
      //   logger.info('Extrayendo lista de contactos para el diccionario VIP...');
        
      //   // 2. Agregamos 'await' aquí para esperar a que WhatsApp devuelva el arreglo
      //   const contacts = await wappClient.getContacts();

      //   console.log("\n=========================================================");
      //   console.log("📝 LISTA DE CONTACTOS GUARDADOS (COPIA LOS IDs QUE NECESITES)");
      //   console.log("=========================================================\n");

      //   contacts.forEach(contact => {
      //     // Filtramos para asegurar que:
      //     // 1. Lo tienes guardado en tu libreta de direcciones (isMyContact)
      //     // 2. NO es un grupo (!isGroup)
      //     if (contact.isMyContact && !contact.isGroup) {
      //       // Obtenemos el nombre de la agenda, o el pushname si no hay nombre
      //       const name = contact.name || contact.pushname || 'Sin Nombre';
      //       const id = contact.id._serialized;
            
      //       // padEnd(25) ayuda a que los IDs queden alineados como en una tabla
      //       console.log(`Nombre: ${name.padEnd(25)} -> ID: "${id}"`);
      //     }
      //   });

      //   console.log("\n=========================================================\n");
      // } catch (error) {
      //   logger.error({ err: error }, 'Error al extraer la lista de contactos');
      // }
    });

    wappClient.on('authenticated', () => {
      logger.info('WhatsApp Client Authenticated successfully.');
    });

    wappClient.on('auth_failure', (msg) => {
      logger.error(`WhatsApp Authentication failure: ${msg}`);
    });

    wappClient.on('disconnected', (reason) => {
      logger.warn(`WhatsApp Client disconnected: ${reason}`);
    });

    attachListeners(wappClient);

    wappClient.initialize();

    return wappClient;
  };

const getClient = () => {
  if (!wappClient) throw new Error('WhatsApp Client not initialized. Call initWhatsAppClient() first.');
  return wappClient;
};

module.exports = {
  initWhatsAppClient,
  getClient
};