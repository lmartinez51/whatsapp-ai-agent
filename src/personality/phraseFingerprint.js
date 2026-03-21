const logger = require('../utils/logger');

class PhraseFingerprint {
  constructor() {
    this.phrasesFrequency = {};
  }

  addMessage(text) {
    if (!text || typeof text !== 'string') return;
    
    const lowerText = text.toLowerCase();
    
    // Normalize laughter (jajaja -> jaja)
    if (/(ja){2,}/.test(lowerText) || /(ha){2,}/.test(lowerText) || /jeje/.test(lowerText)) {
      this.trackPhrase("jaja");
    }

    // Extract trigrams as common phrases
    const words = lowerText.replace(/[^\w\sñáéíóú]/gi, '').split(/\s+/).filter(w => w.length > 0);
    for (let i = 0; i < words.length - 2; i++) {
        const phrase = `${words[i]} ${words[i+1]} ${words[i+2]}`;
        this.trackPhrase(phrase);
    }
  }

  trackPhrase(phrase) {
    if (!this.phrasesFrequency[phrase]) {
      this.phrasesFrequency[phrase] = 0;
    }
    this.phrasesFrequency[phrase]++;
  }

  analyze() {
    logger.info('Analyzing phrase fingerprint...');
    
    // Sort phrases by frequency
    const sortedPhrases = Object.entries(this.phrasesFrequency)
      .filter(([phrase, count]) => count > 5 && phrase.length > 4) // minimum threshold
      .sort((a, b) => b[1] - a[1])
      .map(([phrase]) => phrase);

    // Get top 15 frequently used phrases
    const topPhrases = sortedPhrases.slice(0, 15);

    let typicalLaughter = "jaja";
    if (this.phrasesFrequency["jaja"] > 10) {
      typicalLaughter = "uses 'jaja' occasionally, but NEVER in every message";
    }

    return {
      frequently_used_words: topPhrases,
      typical_laughter_expressions: typicalLaughter,
      typical_agreement_expressions: "ok, va, simón, sale, orale pues", // placeholder default heuristics
      typical_sarcasm_markers: "sí, ajá, uy sí"
    };
  }
}

module.exports = new PhraseFingerprint();
