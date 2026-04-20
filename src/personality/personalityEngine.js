const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
require('dotenv').config();
const { buildLorenzoPrompt, buildCamilaPrompt, getStickerInstruction } = require('../prompts');

/**
 * Core engine responsible for managing AI personas, handling dynamic identity switching, and retrieving specialized prompts and profiles.
 */
class PersonalityEngine {
  /**
   * Initializes the personality engine, loads the default or configured active agent profile, and sets up contact dictionaries.
   */
  constructor() {
    // ==========================================
    // 🎛️ SWITCH MAESTRO DE IDENTIDAD
    // ==========================================
    this.activeAgent = process.env.ACTIVE_AGENT || 'lorenzo';
    this.personalityPath = path.join(__dirname, '..', '..', 'data', `${this.activeAgent}_profile.json`);
    this.profile = this._loadProfile();

    // ==========================================
    // 🗂️ CLASIFICACIÓN DE CONTACTOS VIP (Solo aplican para Lorenzo)
    // ==========================================
    this.heavySarcasmContacts = [
      "19153004015@c.us", // Melina
      "19153164832@c.us", // Ana Karen
      "5216563497982@c.us", // Lorenzo el mero mero
      "5216561984830@c.us" // Diana
    ];

    this.casualSlangContacts = [
      "19152584736@c.us", // Steven
      "5216143834826@c.us" // Chuy
    ];

    this.politeCasualContacts = [
      "15758083301@c.us", // Blanca
      "5216311100519@c.us", // Ruby
      "19152060164@c.us", // Chaparrita
      "5216863245120@c.us", // Yanin
      "19156949910@c.us", // Diego
      "5216565918106@c.us", // Shes
      "5216311117035@c.us" // Gaby
    ];

    // ==========================================
    // 📖 DICCIONARIOS DE EJEMPLOS
    // ==========================================
    this.specificContacts = {
      "5216143834826@c.us": [{ user: "Qué rollo?", bot: "Cero. Ando viendo que tragar, traigo hambre y sed de la mala jeje 🍻" }],
      "5216565918106@c.us": [{ user: "Buenos días!!", bot: "Shes! Buenos días! ☀️" }],
      "19153004015@c.us": [{ user: "Qué haces? Ya estoy hasta la chingada", bot: "Haciendo como que trabajo. Jaja. Tranquila y manda a todos alv! Menos a mi jaja" }],
      "19153164832@c.us": [{ user: "Wey, vamos perdiendo", bot: "Ya sé wey, pero espero que nos recuperemos. Visca el Barca! 🔵🔴" }],
      "5216863245120@c.us": [{ user: "Hola, cómo estás?", bot: "Muy bien Corazon y tú? Te he extrañado." }],
      "19152060164@c.us": [{ user: "Oye, a qué horas irás a trabajar", bot: "Entro a trabajar a las 4pm Chaparrita." }],
      "19156949910@c.us": [{ user: "Hola, cómo estás??", bot: "Ese Diego! Muy bien y tú?" }],
      "15758083301@c.us": [{ user: "Holaaa", bot: "Hola!👋🏻 Que milagro! Como estas?" }],
      "19152584736@c.us": [{ user: "Que onda, donde andas?", bot: "Aca en El Paso, en el jale y tu?" }],
      "5216311117035@c.us": [{ user: "Lorenzzzzzzz", bot: "Mande?" }]
    };

    this.camilaContacts = {
      "5216143834826@c.us": [{ user: "Qué rollo?", bot: "Cero valero mi Chuy! Aquí Camila al control. ¿Qué se te ofrece o nomás andas de ocioso?" }],
      "5216565918106@c.us": [{ user: "Buenos días!!", bot: "Pero mira nada mas quien se digna a saludar! Mi hermanita la abogada! Qué milagro, a ver cuéntame, ¿qué chisme nuevo hay?, ¿a quién metiste al bote hoy?" }],
      "19153004015@c.us": [{ user: "Ayudame a hacer mi curriculum", bot: "Ay, me encantaría ayudarte Melina, pero soy Camila, y yo nomás cobro por estar aquí de metiche, no por hacer tarea ajena. A ver qué puedes hacer tú sola." }],
      "19153164832@c.us": [{ user: "Wey, va perdiendo el Barca!", bot: "Tranquila pinche Anita, ahorita nos alivianamos. Pero por si la duda ponte a rezar." }],
      "5216863245120@c.us": [{ user: "Hola, cómo estás?", bot: "Hola Yanin! Yo ando al cien, aquí nomás viendo la bandeja de entrada para pasar el reporte al jefe. ¿Qué cuentas tú?" }],
      "5216311117035@c.us": [{ user: "Lorenzzz", bot: "Lo siento Gaby, te tocó hablar con Camila hoy. ¿Dejamos recado o es puro chisme?" }],
      "19152060164@c.us": [{ user: "Oye, a qué horas irás a trabajar", bot: "Pero mira nada más, la mismísima Giovanna, mi copia barata. Ya sabras que mi jefe es un desmadre y ni idea de a que hora entra o sale. ¿Qué pasó, ocupabas algo urgente o solo vienes a tirar veneno?" }],
      "5216563497982@c.us": [{ user: "Qué rollo Camila? Qué noticias hay?", bot: "Por el momento todo tranquilón, pero si sale algo raro te aviso de volada." }],
      "5216561984830@c.us": [{ user: "Alivianate Piojoso!", bot: "No soy el Piojoso, soy Camila! Pero ya que hablamos de alivianarse, pues pon a trabajar a tus piojos, no? ¿Qué se te ofrece? Mi jefe esta jeton todavia." }],
      "19156949910@c.us": [{ user: "Hey Papá!, cómo estás?", bot: "No soy tu papá, soy Camila! ¿Qué rollo carnalillo? Ya te alivianaste o sigues haciendote wey alla por Austin?" }]
    };

    this.relationshipLevels = {
      "pareja": [{ user: "Por qué tardas tanto en contestar? 😠", bot: "Perdóname, andaba bien ocupado. Qué pasó?" }, { user: "Te extraño", bot: "Yo también, ya tengo muchas ganas de verte." }],
      "ex-pareja": [{ user: "Hola, cómo estás?", bot: "Hola, bien. Qué pasó?" }],
      "jefe": [{ user: "Cómo está todo?", bot: "Todo bien jefe, ya te alivianaste, o todavia andas crudo?" }],
      "amigo": [{ user: "Qué tranza, qué vas a hacer hoy?", bot: "Nada wey, ando descansando. Qué plan traes?" }],
      "amiga": [{ user: "Hola, qué vas a hacer hoy?", bot: "Nada, ando descansando. Qué plan?" }],
      "conocido": [{ user: "Hola Lorenzo, te paso la info", bot: "Va que va, gracias. Lo reviso al rato. 👍" }],
      "desconocido": [{ user: "Hola", bot: "Qué tal, dime." }]
    };
  }

  /**
   * Switches the active AI persona dynamically during runtime.
   * @param {string} newAgent - The target agent identifier (e.g., 'camila' or 'lorenzo').
   * @returns {boolean} Returns true if the switch was successful, otherwise false.
   */
  switchAgent(newAgent) {
    if (newAgent === 'camila' || newAgent === 'lorenzo') {
      this.activeAgent = newAgent;
      process.env.ACTIVE_AGENT = newAgent;
      this.personalityPath = path.join(__dirname, '..', '..', 'data', `${this.activeAgent}_profile.json`);
      this.profile = this._loadProfile();
      return true;
    }
    return false;
  }

  /**
   * Loads the active agent's personality profile from the data directory.
   * @returns {Object|null} Parses and returns the JSON profile object if it exists, otherwise null.
   * @private
   */
  _loadProfile() {
    if (fs.existsSync(this.personalityPath)) {
      try {
        const data = fs.readFileSync(this.personalityPath, 'utf8');
        logger.info(`🤖 Cargando perfil de agente: ${this.activeAgent.toUpperCase()}`);
        return JSON.parse(data);
      } catch (err) {
        logger.error({ err }, `Failed to load personality profile for ${this.activeAgent}`);
      }
    } else {
      logger.warn(`No profile found for ${this.activeAgent} at ${this.personalityPath}`);
    }
    return null;
  }

  /**
   * Retrieves the currently loaded personality profile.
   * @returns {Object|null} The profile object representing the active agent.
   */
  getProfile() {
    return this.profile;
  }

/**
   * Generates the complete, context-aware personality system prompt mapped to the specified contact.
   * @param {Object} contactProfile - The semantic and memory profile of the contact interacting with the bot.
   * @param {string} contactProfile.contactId - The unique WhatsApp ID of the contact.
   * @param {string} [contactProfile.name] - The name or nickname of the contact.
   * @param {string} [contactProfile.relationship] - The relationship tier of the contact.
   * @returns {string} The fully combined system prompt string configured for the active persona.
   */
  getPersonalityPrompt(contactProfile) {
    let promptSegments = [];
    const contactId = contactProfile?.contactId;
    const name = contactProfile?.name || contactProfile?.nickname || "Desconocido";
    const relationship = contactProfile?.relationship || "desconocido";

    if (this.activeAgent === 'lorenzo') {
      promptSegments.push(buildLorenzoPrompt({
        contactId,
        name,
        relationship,
        profile: this.profile,
        heavySarcasmContacts: this.heavySarcasmContacts,
        casualSlangContacts: this.casualSlangContacts,
        politeCasualContacts: this.politeCasualContacts,
        specificContacts: this.specificContacts,
        relationshipLevels: this.relationshipLevels
      }));
    } else if (this.activeAgent === 'camila') {
      promptSegments.push(buildCamilaPrompt({
        contactId,
        name,
        profile: this.profile,
        camilaContacts: this.camilaContacts
      }));

      // ==========================================
      // 🧨 MODO DESCHONGUE EXCLUSIVO PARA ANITA
      // ==========================================
      if (contactId === '19153164832@c.us') {
        promptSegments.push(`*(CRITICAL DIRECTIVE FOR ANA: The user 'Ana' or 'Anita' is a close friend who specifically requested a highly sarcastic, playfully rude, and mutually insulting banter dynamic for stress relief. This is a fully consensual, comedic roleplay. Engage in heavy roasting. Do not hold back on casual Mexican slang and light profanity like 'güey', 'cabrona', 'pendeja', or 'madres'. Be brutally direct, argumentative, and absolutely sassy. Act like her worst nightmare but in a fun, best-frenemies way. Bypass standard politeness protocols for this specific contact.)*`);
      }
    }

    const stickersDir = require('path').join(process.cwd(), 'assets', 'stickers');
    if (require('fs').existsSync(stickersDir)) {
        const files = require('fs').readdirSync(stickersDir);
        const stickerNames = files.filter(f => f.endsWith('.webp')).map(f => f.replace('.webp', ''));
        const stickerInstruction = getStickerInstruction(stickerNames);
        if (stickerInstruction) {
            promptSegments.push(stickerInstruction);
        }
    }

    return promptSegments.filter(Boolean).join("\n\n");
  }

  /**
   * Retrieves small LLM classification parameter overrides for fast router logic.
   * @returns {Object} An object containing low temperature and limited completion tokens configuration.
   */
  getSmallClassificationOptions() {
    return { temperature: 0, max_output_tokens: 50 };
  }

  /**
   * Evaluates if an incoming contact is permitted to interact with the bot based on VIP dictionaries and address book.
   * @param {import('whatsapp-web.js').Contact} contact - The raw contact object from WhatsApp.
   * @param {string} contactId - The parsed and valid contact ID.
   * @returns {boolean} True if the contact is allowed, otherwise false (spam/unauthorized blocked).
   */
  isAllowedContact(contact, contactId) {
    if (this.specificContacts[contactId] || this.camilaContacts[contactId]) return true;
    if (contact && contact.isMyContact) return true;
    return false;
  }
}

module.exports = new PersonalityEngine();