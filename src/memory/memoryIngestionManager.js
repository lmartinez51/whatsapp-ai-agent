const fs = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const logger = require('../utils/logger');
const vectorStore = require('./vectorStore');
const semanticMemory = require('./semanticMemory');
const contactMemory = require('./contactMemory');
const openaiClient = require('../ai/openaiClient');
const geminiClient = require('../ai/geminiClient');
const { TypeSafeClient } = require('@typesafe-ai/sdk');
const {
  METADATA_QUESTIONS,
  WORTH_STORING_THRESHOLD,
  TOPIC_LABELS,
  TYPESAFE_MODEL,
  buildExchangeState,
  generatePlainTextSummary
} = require('./metadataQuestions');

let typeSafeClient = null;
function getTypeSafeClient() {
  if (!typeSafeClient && process.env.TYPESAFE_API_KEY) {
    typeSafeClient = new TypeSafeClient({
      apiKey: process.env.TYPESAFE_API_KEY,
      defaultModel: TYPESAFE_MODEL
    });
  }
  return typeSafeClient;
}

const STATE_FILE_PATH = path.join(__dirname, '../../data/memory_state.json');
const STATE_FILE_TMP = path.join(__dirname, '../../data/memory_state.tmp.json');

const MEMORY_COLLECTION = "semantic_memories";

class MemoryIngestionManager {
  constructor() {
    this.state = {};
    this.isInitialized = false;
    this.processedHashes = new Set();
    this.processingLocks = new Map();
  }

  /**
   * Initialize state from file and vector store migration.
   */
  async init() {
    try {
      // 1. Load memory_state.json
      let stateChanged = false;
      try {
        const data = await fs.readFile(STATE_FILE_PATH, 'utf8');
        this.state = JSON.parse(data);
      } catch (err) {
        if (err.code === 'ENOENT') {
          logger.info('memory_state.json not found, initializing empty state.');
          this.state = {};
          // Ensure data directory exists
          await fs.mkdir(path.dirname(STATE_FILE_PATH), { recursive: true });
        } else {
          throw err;
        }
      }

      // 2. Query vector db to detect contacts with existing embeddings
      let results;
      try {
        results = await vectorStore.get(MEMORY_COLLECTION, undefined, ["metadatas", "documents"]);
      } catch (dbErr) {
        // Collection might not exist yet, that's fine
        logger.warn({ err: dbErr }, 'Could not fetch from Chroma, assuming empty collection or not created yet.');
      }

      // Format migration for existing state file variables (e.g. status -> state)
      for (const contactId in this.state) {
         if (this.state[contactId].status) {
             this.state[contactId].state = this.state[contactId].status;
             this.state[contactId].pairCount = this.state[contactId].embeddedPairs || this.state[contactId].totalPairs || 0;
             delete this.state[contactId].status;
             delete this.state[contactId].embeddedPairs;
             delete this.state[contactId].totalPairs;
             stateChanged = true;
         }
      }

      // STARTUP CONSISTENCY CHECK
      const hasState = Object.keys(this.state).length > 0;
      const dbEmpty = !results || !results.metadatas || results.metadatas.length === 0;

      if (hasState && dbEmpty) {
        logger.warn('memory_state.json exists but vector DB is empty. Resetting all contacts to NEW_CONTACT.');
        for (const contactId in this.state) {
          this.state[contactId] = { state: "NEW_CONTACT", pairCount: 0 };
        }
        stateChanged = true;
      } else if (!dbEmpty) {
        const pairsCountByContact = {};
        for (let i = 0; i < results.metadatas.length; i++) {
          const meta = results.metadatas[i];
          const doc = results.documents ? results.documents[i] : null;

          if (meta && meta.contact_id && doc) {
             if (doc.includes('User: ') && doc.includes('Lorenzo: ')) {
               pairsCountByContact[meta.contact_id] = (pairsCountByContact[meta.contact_id] || 0) + 1;
             }
          }
        }

        for (const [contactId, count] of Object.entries(pairsCountByContact)) {
          if (!this.state[contactId]) {
             if (count >= 24) {
                this.state[contactId] = { state: "FROZEN", pairCount: count };
                logger.info({ contactId, count }, 'Auto-migrated existing contact to FROZEN');
             } else {
                this.state[contactId] = { state: "LEARNING", pairCount: count };
                logger.info({ contactId, count }, 'Auto-migrated existing contact to LEARNING');
             }
             stateChanged = true;
          }
        }
      }

      if (stateChanged || Object.keys(this.state).length === 0) {
        await this._saveState();
      }

      this.isInitialized = true;
      logger.info('Memory Ingestion Manager initialized successfully.');
    } catch (error) {
      logger.error({ err: error }, 'Failed to initialize Memory Ingestion Manager');
      throw error;
    }
  }

  async _saveState() {
    try {
      const data = JSON.stringify(this.state, null, 2);
      await fs.writeFile(STATE_FILE_TMP, data, 'utf8');
      await fs.rename(STATE_FILE_TMP, STATE_FILE_PATH);
    } catch (error) {
      logger.error({ err: error }, 'Failed to save memory state atomically.');
      throw error;
    }
  }

  /**
   * Extrae los temas y el resumen de la interacción usando TypeSafe System One (Jev)
   * para clasificación de topic y compuerta de worth_storing, y el LLM activo para resumen en texto plano.
   * Si USE_TYPESAFE_METADATA !== 'true', recurre al método legacy _extractMetadataLegacy.
   */
  async _extractMetadata(userMessage, assistantReply, activeAgent) {
    if (process.env.USE_TYPESAFE_METADATA !== 'true') {
      return this._extractMetadataLegacy(userMessage, assistantReply, activeAgent);
    }

    const agentName = activeAgent === 'camila' ? 'Camila' : 'Lorenzo';

    try {
      const client = getTypeSafeClient();
      if (!client) {
        logger.warn('TypeSafe client unavailable (missing TYPESAFE_API_KEY); failing closed for metadata extraction.');
        return null;
      }

      // 1. Construir estado acotado
      const state = buildExchangeState(userMessage, assistantReply, agentName);

      // 2. Consulta TypeSafe Jev (un solo request, preguntas en paralelo, modelo pineado)
      const response = await client.systemOne({
        state,
        questions: METADATA_QUESTIONS,
        model: TYPESAFE_MODEL
      });

      const topicAnswer = response?.answers?.topic;
      const worthStoringAnswer = response?.answers?.worth_storing;

      if (!topicAnswer || !worthStoringAnswer) {
        logger.warn({ response }, 'Unexpected response structure from TypeSafe System One; returning null.');
        return null;
      }

      const topic = topicAnswer.choice;
      const worthProb = worthStoringAnswer.noul;

      // Compuerta: si no vale la pena almacenar, retornar null de inmediato (evita llamada LLM de resumen)
      if (typeof worthProb !== 'number' || worthProb < WORTH_STORING_THRESHOLD) {
        logger.debug(
          { worthProb, threshold: WORTH_STORING_THRESHOLD, topic },
          'Conversation exchange below worth_storing threshold; skipping memory profile storage.'
        );
        return null;
      }

      // 3. Generación de resumen neutral en texto plano con LLM activo (persona-free)
      let summary = await generatePlainTextSummary(userMessage, assistantReply, agentName);

      if (!summary) {
        const label = TOPIC_LABELS[topic] || topic;
        summary = `El usuario y ${agentName} hablaron sobre ${label}.`;
      }

      return {
        topics: [topic],
        summary
      };
    } catch (error) {
      logger.warn({ err: error.message || error }, 'TypeSafe metadata extraction failed; failing closed (returning null).');
      return null;
    }
  }

  /**
   * Extracción legacy vía prompt JSON y parseo manual con regex/llaves.
   * Preservado verbatim como respaldo para rollback.
   */
  async _extractMetadataLegacy(userMessage, assistantReply, activeAgent) {
    const agentName = activeAgent === 'camila' ? 'Camila' : 'Lorenzo';
    
    const prompt = `
      <system_role>
      Eres un analizador de conversaciones. Tu objetivo es resumir una interacción corta de WhatsApp entre el Usuario y ${agentName}.
      </system_role>

      <structured_output_contract>
      Responde ÚNICAMENTE con JSON válido usando esta estructura exacta:
      {
        "topics": ["tema 1", "tema 2"], // Arreglo de strings cortos (1-3 palabras máximo)
        "summary": "Resumen de una sola línea de lo que se habló"
      }
      IMPORTANTE: En el 'summary', debes redactar en tercera persona y especificar que la conversación fue con ${agentName} (ej. 'El usuario y ${agentName} hablaron sobre...').
      </structured_output_contract>

      <conversation>
      Usuario: ${userMessage}
      ${agentName}: ${assistantReply}
      </conversation>
    `.trim();

    let rawText;
    try {
      const activeLLM = (process.env.ACTIVE_LLM || 'openai').toLowerCase();

      if (activeLLM === 'gemini') {
        rawText = await geminiClient.getGeminiCompletion(
          [{ role: 'user', parts: [{ text: prompt }] }],
          {
            responseMimeType: 'application/json',
            maxOutputTokens: 200
          }
        );
      } else {
        rawText = await openaiClient.getCompletion([{ role: 'system', content: prompt }], {
          temperature: 0.1,
          reasoning: { effort: 'low' },
          max_output_tokens: 300,
          response_format: { type: "json_object" }
        });
      }
    } catch (error) {
      logger.warn({ err: error.message || error }, 'Failed to call LLM for conversation metadata extraction');
      return null;
    }

    if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
      return null;
    }

    let cleanJson = rawText
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();

    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(cleanJson);
    } catch (parseError) {
      logger.debug(
        { err: parseError.message, preview: cleanJson.slice(0, 100) },
        'Truncated or invalid JSON encountered during metadata extraction; skipping gracefully.'
      );
      return null;
    }
  }

  /**
   * Background process called after assistant reply is sent.
   */
  async handleConversationUpdate(contactId, userMessage, assistantReply) {
    if (!this.isInitialized) {
       logger.warn('MemoryIngestionManager not initialized, skipping update.');
       return;
    }

    if (!userMessage || !assistantReply || typeof userMessage !== 'string' || typeof assistantReply !== 'string') {
      logger.warn({ contactId }, 'Incomplete conversation pair detected, skipping memory ingestion.');
      return;
    }

    const hash = crypto.createHash('sha256').update(`${contactId}_${userMessage}_${assistantReply}`).digest('hex');
    if (this.processedHashes.has(hash)) {
       return;
    }
    this.processedHashes.add(hash);

    if (!this.processingLocks.has(contactId)) {
       this.processingLocks.set(contactId, Promise.resolve());
    }

    const processPromise = this.processingLocks.get(contactId).then(async () => {
      try {
        // ==========================================
        // 1. ACTUALIZACIÓN DE MEMORIA A CORTO PLAZO (JSON)
        // ==========================================
        // CAPTURAMOS EL AGENTE ACTIVO AL MOMENTO DE LA CONVERSACIÓN
        const currentAgent = process.env.ACTIVE_AGENT || 'lorenzo'; 
        
        // LE PASAMOS EL AGENTE AL EXTRACTOR
        const metadata = await this._extractMetadata(userMessage, assistantReply, currentAgent);
        
        if (metadata) {
          const profile = await contactMemory.getProfile(contactId);
          
          if (profile) {
            const combinedTopics = new Set([...(profile.topics || []), ...metadata.topics]);
            profile.topics = Array.from(combinedTopics).slice(-15);

            profile.recent_interactions = profile.recent_interactions || [];
            profile.recent_interactions.unshift({
              date: new Date().toISOString(),
              agent: currentAgent, // <--- GUARDAMOS LA ETIQUETA DEL DUEÑO DE LA MEMORIA
              summary: metadata.summary
            });
            
            profile.recent_interactions = profile.recent_interactions.slice(0, 5);

            await contactMemory.saveProfile(contactId, profile);
            logger.debug({ contactId }, `Contact profile updated for interaction with ${currentAgent}.`);
          }
        }

        // ==========================================
        // 2. ACTUALIZACIÓN DE MEMORIA VECTORIAL (Tu código original)
        // ==========================================
        let contact = this.state[contactId];

        if (!contact) {
          contact = { state: "NEW_CONTACT", pairCount: 0 };
          this.state[contactId] = contact;
        }

        if (contact.state === "FROZEN") return;

        if (contact.state === "NEW_CONTACT") {
          contact.pairCount += 1;
          if (contact.pairCount >= 12) {
            contact.state = "LEARNING";
            contact.pairCount = 0;
            logger.info({ contactId }, 'Contact upgraded from NEW_CONTACT to LEARNING.');
          }
          await this._saveState();
          return;
        }

        if (contact.state === "LEARNING") {
          let combinedText = `User: ${userMessage}\nLorenzo: ${assistantReply}`;
          
          if (combinedText.length > 2000) {
             combinedText = combinedText.substring(0, 2000) + '...';
          }

          const success = await semanticMemory.storeMemory(contactId, combinedText, "conversation_pair");
          
          if (success) {
            contact.pairCount += 1;
            if (contact.pairCount >= 36) {
               contact.state = "FROZEN";
               logger.info({ contactId }, 'Contact upgraded from LEARNING to FROZEN permanently.');
            }
            await this._saveState();
          }
        }
      } catch (error) {
        logger.warn({ err: error.message || error, contactId }, 'Error in background memory ingestion (graceful degradation).');
      }
    });

    this.processingLocks.set(contactId, processPromise);
  }
}

module.exports = new MemoryIngestionManager();