const assert = require('node:assert/strict');
const test = require('node:test');

const {
  buildGeminiRequestPayload,
  createGeminiResult
} = require('../src/ai/geminiClient');

test('buildGeminiRequestPayload uses Gemini 3.5 Flash with current config shape', () => {
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

  assert.equal(payload.model, 'gemini-3.5-flash');
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
