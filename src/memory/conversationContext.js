/**
 * In-memory short-term context buffer per contact.
 * Retains the last 10 messages to provide immediate conversational flow.
 */
class ConversationContext {
  constructor() {
    // Map of contactId to array of message objects
    // Example: { "123@c.us": [{ role: "user", content: "Hi" }, { role: "assistant", content: "Hello!" }] }
    this.buffer = new Map();
    this.MAX_MESSAGES = 10;
  }

  /**
   * Append a new message to the short-term buffer.
   * @param {string} contactId 
   * @param {string} role "user" or "assistant"
   * @param {string} content message content
   */
  addMessage(contactId, role, content) {
    if (!this.buffer.has(contactId)) {
      this.buffer.set(contactId, []);
    }

    const messages = this.buffer.get(contactId);
    messages.push({ role, content });

    // Keep only the last MAX_MESSAGES
    if (messages.length > this.MAX_MESSAGES) {
      messages.shift(); // Remove oldest
    }
  }

  /**
   * Get the short-term conversation context for a contact.
   * @param {string} contactId 
   * @returns {object[]} Array of message objects
   */
  getContext(contactId) {
    return this.buffer.get(contactId) || [];
  }

  /**
   * Clear the buffer for a specific contact.
   * @param {string} contactId 
   */
  clearContext(contactId) {
    this.buffer.delete(contactId);
  }
}

module.exports = new ConversationContext();
