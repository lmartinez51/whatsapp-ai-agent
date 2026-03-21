const { ChromaClient } = require('chromadb');
const logger = require('../utils/logger');

/**
 * Provides a simplified interface for interacting with the local ChromaDB vector database.
 */
class VectorStore {
  /**
   * Initializes the vector store wrapper, setting up the ChromaDB client instance.
   */
  constructor() {
    this.client = new ChromaClient();
    this.collections = {};
  }

  /**
   * Initializes a ChromaDB collection or retrieves it if it already exists.
   * @param {string} collectionName - The name of the collection to get or create.
   * @returns {Promise<Object>} The ChromaDB collection instance.
   * @throws {Error} Throws if the collection creation or retrieval fails.
   */
  async getOrCreateCollection(collectionName) {
    try {
      if (this.collections[collectionName]) {
        return this.collections[collectionName];
      }
      
      const collection = await this.client.getOrCreateCollection({
        name: collectionName,
        metadata: { "hnsw:space": "cosine" }
      });
      
      this.collections[collectionName] = collection;
      return collection;
    } catch (error) {
      logger.error({ err: error, collectionName }, 'Error getting/creating Chroma collection');
      throw error;
    }
  }

  /**
   * Inserts or updates document embeddings inside a specific collection.
   * @param {string} collectionName - The target collection name.
   * @param {string[]} ids - Unique document identifiers.
   * @param {number[][]} embeddings - The calculated vector embeddings for the documents.
   * @param {object[]} metadatas - Array of metadata objects corresponding to each document.
   * @param {string[]} documents - The raw text contents of the documents.
   * @returns {Promise<void>} Resolves when the batch add is fully complete.
   * @throws {Error} Throws if the injection into the database fails.
   */
  async add(collectionName, ids, embeddings, metadatas, documents) {
    const collection = await this.getOrCreateCollection(collectionName);
    await collection.add({
      ids,
      embeddings,
      metadatas,
      documents
    });
  }

  /**
   * Queries existing vectors in ChromaDB to find the nearest semantic matches.
   * @param {string} collectionName - The target collection name.
   * @param {number[]} queryEmbedding - The vector embedding of the search query.
   * @param {number} [nResults=5] - The maximum number of nearest results to return.
   * @param {object} [where] - Optional metadata filter dictionary.
   * @returns {Promise<Object>} The resulting matched documents and distances.
   * @throws {Error} Throws if the collection query operation fails.
   */
  async query(collectionName, queryEmbedding, nResults = 5, where = undefined) {
    const collection = await this.getOrCreateCollection(collectionName);
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: nResults,
      where: where // Filtro de metadatos opcional
    });
    return results;
  }

  /**
   * Retrieves existing vectors or metadata directly from a ChromaDB collection.
   * @param {string} collectionName - The target collection name.
   * @param {object} [where] - Optional metadata filter dictionary.
   * @param {string[]} [include=['metadatas', 'documents']] - The fields to return in the result set.
   * @returns {Promise<Object>} The retrieved raw document rows.
   * @throws {Error} Throws if retrieving the records fails.
   */
  async get(collectionName, where = undefined, include = ['metadatas', 'documents']) {
    const collection = await this.getOrCreateCollection(collectionName);
    const results = await collection.get({
      where: where,
      include: include
    });
    return results;
  }
}

module.exports = new VectorStore();
