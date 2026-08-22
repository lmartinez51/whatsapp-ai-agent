const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const crypto = require('crypto');

class EmbeddingCache {
  constructor() {
    this.cacheDir = path.join(__dirname, '..', '..', 'data', 'cache');
    this.cacheFile = path.join(this.cacheDir, 'embeddings.json');
    this.cache = {};

    this._initCache();
  }

  _initCache() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
    if (fs.existsSync(this.cacheFile)) {
      try {
        const data = fs.readFileSync(this.cacheFile, 'utf-8');
        this.cache = JSON.parse(data);
      } catch (err) {
        logger.error({ err }, 'Failed to load embedding cache, starting fresh.');
        this.cache = {};
      }
    }
  }

  _saveCache() {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache), 'utf-8');
    } catch (err) {
      logger.error({ err }, 'Failed to save embedding cache.');
    }
  }

  _hashText(text) {
    return crypto.createHash('sha256').update(text).digest('hex');
  }

  get(text) {
    const hash = this._hashText(text);
    return this.cache[hash] || null;
  }

  set(text, embedding) {
    const hash = this._hashText(text);
    this.cache[hash] = embedding;
    this._saveCache();
  }

  setMany(entries) {
    for (const { text, embedding } of entries) {
      const hash = this._hashText(text);
      this.cache[hash] = embedding;
    }

    this._saveCache();
  }
}

module.exports = new EmbeddingCache();
