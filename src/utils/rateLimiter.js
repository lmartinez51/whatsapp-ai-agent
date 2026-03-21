class RateLimiter {
  constructor() {
    this.lastResponseTimeMs = 0;
    // Base delay in ms
    this.baseDelayMs = 2000;
    // Vary delay based on message length
    this.msPerCharacter = 50;
  }

  /**
   * Simulates realistic human typing delay.
   * Includes thinking pause, typing speed, and natural variance.
   * @param {string} messageText
   */
  async simulateHumanDelay(messageText) {

    const now = Date.now();
    const timeSinceLast = now - this.lastResponseTimeMs;

    const length = messageText.length;

    // 1. Thinking delay (humans pause before typing)
    const thinkingDelay = 600 + Math.random() * 900;

    // 2. Typing speed (characters per second)
    const avgTypingSpeed = 6 + Math.random() * 4; 
    const typingDelay = (length / avgTypingSpeed) * 1000;

    // 3. Extra pause for longer messages (humans pause mid-thought)
    let midPause = 0;
    if (length > 80) {
      midPause = 400 + Math.random() * 600;
    }

    let totalDelay = thinkingDelay + typingDelay + midPause;

    // 4. Prevent instant double responses
    if (timeSinceLast < 2500) {
      totalDelay += (2500 - timeSinceLast);
    }

    // 5. Add natural randomness (±15%)
    const variance = totalDelay * 0.15 * (Math.random() * 2 - 1);
    totalDelay += variance;

    // 6. Clamp delay limits
    totalDelay = Math.max(900, Math.min(totalDelay, 7000));

    await new Promise(resolve => setTimeout(resolve, totalDelay));

    this.lastResponseTimeMs = Date.now();
  }
}

module.exports = new RateLimiter();
