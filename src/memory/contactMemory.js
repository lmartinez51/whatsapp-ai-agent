const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * Manages the persistence and retrieval of static non-vector contact profiles locally.
 */
class ContactMemory {
  /**
   * Initializes the contact memory manager and ensures the storage directory exists.
   */
  constructor() {
    this.contactsDir = path.join(__dirname, '..', '..', 'data', 'contacts');
    if (!fs.existsSync(this.contactsDir)) {
      fs.mkdirSync(this.contactsDir, { recursive: true });
    }
  }

  /**
   * Generates the safe filesystem path for a specific contact's JSON profile.
   * @param {string} contactId - The raw WhatsApp contact ID.
   * @returns {string} The computed absolute file path.
   * @private
   */
  _getContactProfilePath(contactId) {
    // Sanitizar el contactId para que sea un nombre de archivo válido
    const safeId = contactId.replace(/[^a-zA-Z0-9]/g, '_');
    return path.join(this.contactsDir, `${safeId}.json`);
  }

  /**
   * Retrieves a contact profile, creating an initial scaffold if one does not exist.
   * @param {string} contactId - The WhatsApp contact ID.
   * @param {string} [name="Desconocido"] - The fallback name used when creating a fresh profile.
   * @returns {Promise<Object>} The parsed contact profile JSON object.
   * @throws {Error} Throws internally and catches it, returning a safe fallback object upon parse failure.
   */
async getProfile(contactId, name = "Desconocido") {
    const profilePath = this._getContactProfilePath(contactId);
    
    if (!fs.existsSync(profilePath)) {
      const defaultProfile = {
        contactId, // Guardamos el ID limpio
        name,
        relationship: "desconocido", // Mejor usar español para consistencia con el PersonalityEngine
        topics: [],
        recent_interactions: []
      };
      await this.saveProfile(contactId, defaultProfile);
      return defaultProfile;
    }

    try {
      const data = fs.readFileSync(profilePath, 'utf8');
      const profile = JSON.parse(data);
      
      // Blindaje de seguridad: Si el archivo JSON viejo omitía contactId, se inyecta en la memoria
      // Esto asegura que PersonalityEngine siempre obtenga un contactId válido
      profile.contactId = contactId; 
      
      return profile;
    } catch (error) {
      logger.error({ err: error, contactId }, 'Failed to load contact profile');
      return { contactId, name, relationship: "desconocido" }; // Estructura de respaldo segura
    }
  }

  /**
   * Persists profile modifications to the local filesystem.
   * @param {string} contactId - The WhatsApp contact ID.
   * @param {Object} profileData - The complete profile object to serialize and save.
   * @returns {Promise<void>} Resolves when the file write is finished.
   * @throws {Error} Catches and logs filesystem write errors internally.
   */
  async saveProfile(contactId, profileData) {
    const profilePath = this._getContactProfilePath(contactId);
    try {
      fs.writeFileSync(profilePath, JSON.stringify(profileData, null, 2), 'utf8');
    } catch (error) {
      logger.error({ err: error, contactId }, 'Failed to save contact profile');
    }
  }
}

module.exports = new ContactMemory();
