const logger = require('../utils/logger');

class StyleAnalyzer {
  constructor() {
    this.rawMessages = [];
  }

  addMessage(text) {
    if (text && typeof text === 'string') {
      this.rawMessages.push(text);
    }
  }

  analyze() {
    logger.info(`Analyzing style across ${this.rawMessages.length} messages.`);
    
    let totalLength = 0;
    let emojiCount = 0;
    const emojiRegex = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

    this.rawMessages.forEach(msg => {
      totalLength += msg.length;
      const emojis = msg.match(emojiRegex);
      if (emojis) {
        emojiCount += emojis.length;
      }
    });

    const avgLength = this.rawMessages.length > 0 ? (totalLength / this.rawMessages.length) : 0;
    const avgEmojis = this.rawMessages.length > 0 ? (emojiCount / this.rawMessages.length) : 0;

    // Based on these basic heuristics, determine tone
    let tone = "casual";
    if (avgEmojis > 0.5) tone = "expressive, frequent emoji usage";
    if (avgLength > 50) tone = "detailed, writes long paragraphs";
    if (avgLength < 15) tone = "terse, writes very short sentences";

    return {
      sentence_length: avgLength,
      emoji_usage: avgEmojis,
      tone,
      humor_level: "moderate", // Default heuristic, could be expanded
      response_delay_patterns: "variable"
    };
  }
}

module.exports = new StyleAnalyzer();
