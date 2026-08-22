const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const qrcode = require("qrcode-terminal");
const logger = require("../utils/logger");
const { attachListeners } = require("./listener");
const fs = require("fs");
const path = require("path");
const { applyDisguise } = require("../utils/disguiseManager");

let wappClient = null;

const initWhatsAppClient = () => {
  if (wappClient) return wappClient; // evita reinicialización accidental

  logger.info("Initializing WhatsApp Web Client...");

  wappClient = new Client({
    authStrategy: new LocalAuth({ dataPath: "data/whatsapp_auth" }),
    puppeteer: {
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  wappClient.on("qr", (qr) => {
    logger.info("QR Code received, please scan with your phone:");
    qrcode.generate(qr, { small: true });
  });

  wappClient.on("ready", async () => {
    logger.info("WhatsApp client is ready!");

    // ==========================================
    // 🎭 SISTEMA DE DISFRAZ MULTI-AGENTE (PERFIL + STORIES)
    // ==========================================
    const activeAgent = process.env.ACTIVE_AGENT || "lorenzo";
    await applyDisguise(wappClient, activeAgent);
    // ==========================================
  });

  wappClient.on("authenticated", () => {
    logger.info("WhatsApp Client Authenticated successfully.");
  });

  wappClient.on("auth_failure", (msg) => {
    logger.error(`WhatsApp Authentication failure: ${msg}`);
  });

  wappClient.on("disconnected", (reason) => {
    logger.warn(`WhatsApp Client disconnected: ${reason}`);
  });

  attachListeners(wappClient);

  wappClient.initialize();

  return wappClient;
};

const getClient = () => {
  if (!wappClient)
    throw new Error(
      "WhatsApp Client not initialized. Call initWhatsAppClient() first.",
    );
  return wappClient;
};

module.exports = {
  initWhatsAppClient,
  getClient,
};
