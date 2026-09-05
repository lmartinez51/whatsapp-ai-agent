const assert = require('node:assert/strict');
const test = require('node:test');

const config = require('../src/config');
const {
  buildGeminiRequestPayload,
  createGeminiResult
} = require('../src/ai/geminiClient');

test('buildGeminiRequestPayload uses configured Gemini model with current config shape', () => {
  const contents = [{ role: 'user', parts: [{ text: 'Hola' }] }];
  const safetySettings = [
    {
      category: 'HARM_CATEGORY_HARASSMENT',
      threshold: 'BLOCK_ONLY_HIGH'
    }
  ];

  const payload = buildGeminiRequestPayload(contents, {
    temperature: 0.75,
    topP: 0.9,
    safetySettings
  });

  assert.equal(payload.model, config.geminiModelName);
  assert.equal(payload.config.temperature, undefined);
  assert.equal(payload.config.topP, undefined);
  assert.equal(payload.safetySettings, undefined);
  assert.deepEqual(payload.config.safetySettings, safetySettings);
  assert.equal(payload.config.thinkingConfig.thinkingLevel, 'MEDIUM');
});

test('buildGeminiRequestPayload validates thinking level overrides', () => {
  const payload = buildGeminiRequestPayload([], {
    thinkingConfig: {
      thinkingLevel: 'low',
      thinkingBudget: 1024
    }
  });

  assert.equal(payload.config.thinkingConfig.thinkingLevel, 'LOW');
  assert.equal(payload.config.thinkingConfig.thinkingBudget, undefined);
});

test('createGeminiResult preserves text, candidate content, and usage metadata', () => {
  const content = {
    role: 'model',
    parts: [{ text: 'Que onda' }]
  };
  const usageMetadata = {
    totalTokenCount: 42,
    thoughtsTokenCount: 7
  };

  const result = createGeminiResult({
    text: 'Que onda',
    candidates: [{ content }],
    usageMetadata
  });

  assert.equal(result.text, 'Que onda');
  assert.deepEqual(result.content, content);
  assert.deepEqual(result.usageMetadata, usageMetadata);
});

test('getGeminiCompletionResult retries on 503 and succeeds on subsequent attempt', async (t) => {
  const geminiModule = require('../src/ai/geminiClient');
  if (!geminiModule.geminiClient) {
    return; // Skip if no client configured in env
  }

  const originalGenerateContent = geminiModule.geminiClient.models.generateContent;
  const originalSetTimeout = global.setTimeout;
  t.after(() => {
    geminiModule.geminiClient.models.generateContent = originalGenerateContent;
    global.setTimeout = originalSetTimeout;
  });

  // Fast-forward setTimeout in test
  global.setTimeout = (fn) => {
    fn();
    return 0;
  };

  let attempts = 0;
  geminiModule.geminiClient.models.generateContent = async () => {
    attempts++;
    if (attempts === 1) {
      const err = new Error('503 UNAVAILABLE: High demand spike');
      err.status = 503;
      throw err;
    }
    return {
      text: 'Respuesta recuperada tras reintento',
      candidates: [{ content: { role: 'model', parts: [{ text: 'Respuesta recuperada tras reintento' }] } }]
    };
  };

  const result = await geminiModule.getGeminiCompletionResult([{ role: 'user', parts: [{ text: 'Hola' }] }]);
  assert.equal(attempts, 2, 'Expected generateContent to be called twice');
  assert.equal(result.text, 'Respuesta recuperada tras reintento');
});
