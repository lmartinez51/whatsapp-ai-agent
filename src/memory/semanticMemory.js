const vectorStore = require('./vectorStore');
const { getEmbedding } = require('../ai/openaiClient');
const logger = require('../utils/logger');
const crypto = require('crypto');

const MEMORY_COLLECTION = "semantic_memories";

/**
 * Handles the storage, batching, and semantic retrieval of conversation memories using a vector database.
 */
class SemanticMemory {
  
  /**
   * Generates a deterministic unique ID for a memory entry based on contact, text, and timestamp.
   * @param {string} contactId - The WhatsApp contact ID.
   * @param {string} text - The actual text content to be hashed.
   * @param {number} timestamp - The Unix timestamp of the memory.
   * @returns {string} The computed hexadecimal SHA-256 hash string.
   * @private
   */
  _generateId(contactId, text, timestamp) {
    return crypto.createHash('sha256').update(`${contactId}_${text}_${timestamp}`).digest('hex');
  }

  /**
   * Embeds and stores a single message or event into the Vector DB.
   * @param {string} contactId - The WhatsApp contact ID.
   * @param {string} messageText - The message content to embed and store.
   * @param {string} [type='message'] - The classification type of the memory (e.g., 'message', 'human_required').
   * @param {number} [timestamp=Date.now()] - The Unix timestamp when the event occurred.
   * @returns {Promise<boolean>} True if the memory was successfully stored, otherwise false.
   * @throws {Error} Throws internally and catches it, returning false to prevent pipeline interruptions.
   */
  async storeMemory(contactId, messageText, type = 'message', timestamp = Date.now()) {
    try {
      const embedding = await getEmbedding(messageText);
      const id = this._generateId(contactId, messageText, timestamp);
      
      await vectorStore.add(
        MEMORY_COLLECTION,
        [id],
        [embedding],
        [{ contact_id: contactId, type, timestamp }],
        [messageText]
      );
      logger.debug({ contactId, type }, 'Stored new semantic memory');
      return true;
    } catch (error) {
      logger.error({ err: error, contactId }, 'Failed to store semantic memory');
      return false;
    }
  }

  /**
   * Embeds and stores a batch of messages into the Vector DB simultaneously for performance.
   * @param {string} contactId - The WhatsApp contact ID.
   * @param {Array<Object>} messages - The array of message objects to embed.
   * @param {string} [type="message"] - The classification type applied to all items in the batch.
   * @returns {Promise<void>} Resolves when the batch request finishes. Error handling is internal.
   * @throws {Error} Throws internally and catches it, logging the failure without crashing.
   */
  async storeMemoriesBatch(contactId, messages, type = "message") {
    try {
      const texts = messages.map(m => m.text);
      const timestamps = messages.map(m => m.timestamp ?? Date.now());

      const embeddings = await getEmbedding(texts); 

      const ids = texts.map((text, i) =>
        this._generateId(contactId, text, timestamps[i])
      );

      const metadatas = texts.map((_, i) => ({
        contact_id: contactId,
        type,
        timestamp: timestamps[i]
      }));

      await vectorStore.add(
        MEMORY_COLLECTION,
        ids,
        embeddings,
        metadatas,
        texts
      );

      logger.debug(
        { contactId, count: texts.length },
        "Stored semantic memory batch"
      );

    } catch (error) {
      logger.error({ err: error, contactId }, "Failed to store semantic memory batch");
    }
  }

  /**
   * Retrieves the top K semantic memories most relevant to the provided text query for a specific contact.
   * @param {string} contactId - The WhatsApp contact ID.
   * @param {string} queryText - The search query to embed and compare against stored memories.
   * @param {number} [topK=5] - The maximum number of relevant memories to retrieve.
   * @returns {Promise<string>} A pre-formatted string block displaying the recalled memories, or an empty string if none are found.
   * @throws {Error} Throws internally and catches it, returning an empty string to keep the chatbot functional.
   */
  async retrieveMemories(contactId, queryText, topK = 5) {
    try {
      const queryEmbedding = await getEmbedding(queryText);
      
      const results = await vectorStore.query(
        MEMORY_COLLECTION,
        queryEmbedding,
        topK,
        { contact_id: contactId }
      );
      
      // Validamos la estructura de arreglos anidados de ChromaDB
      if (!results || !results.documents || !results.documents[0] || results.documents[0].length === 0) {
        return ""; // Retornamos una cadena vacía para inyectar limpiamente en el prompt XML
      }
      
      const documents = results.documents[0];
      const metadatas = results.metadatas ? results.metadatas[0] : [];
      const distances = results.distances ? results.distances[0] : []; 

      const formattedMemories = [];

      documents.forEach((text, index) => {
        const distance = distances[index];
        
        // TIP CHROMADB: ChromaDB devuelve resultados usando distancia Coseno o L2.
        // Si la distancia es muy grande (ej. > 0.4 en Coseno), el recuerdo es irrelevante.
        // Puedes descomentar las siguientes líneas para afinar la puntería de los recuerdos:
        /*
        if (distance !== undefined && distance > 0.4) { 
           return; 
        }
        */

        const meta = metadatas[index];
        let timeContext = "Fecha desconocida";
        
        if (meta && meta.timestamp) {
          const dateObj = new Date(meta.timestamp);
          // Configurado para la zona horaria de Juárez
          timeContext = dateObj.toLocaleString('es-MX', { 
            timeZone: 'America/Ciudad_Juarez', 
            dateStyle: 'short', 
            timeStyle: 'short' 
          });
        }

        formattedMemories.push(`[${timeContext}] Mensaje: "${text}"`);
      });

      return formattedMemories.join("\n");

    } catch (error) {
      logger.error({ err: error, contactId }, 'Failed to retrieve semantic memory');
      return "";
    }
  }
}

module.exports = new SemanticMemory();
