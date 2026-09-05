const assert = require('node:assert/strict');
const test = require('node:test');

const responseEngine = require('../src/ai/responseEngine');

test('ResponseEngine.generateResponseResult returns emergency fallback for Camila when model fails', async (t) => {
  const originalActiveAgent = process.env.ACTIVE_AGENT;
  const originalActiveLLM = process.env.ACTIVE_LLM;
  const originalGeminiGen = responseEngine._generateGeminiResponse;

  t.after(() => {
    process.env.ACTIVE_AGENT = originalActiveAgent;
    process.env.ACTIVE_LLM = originalActiveLLM;
    responseEngine._generateGeminiResponse = originalGeminiGen;
  });

  process.env.ACTIVE_AGENT = 'camila';
  process.env.ACTIVE_LLM = 'gemini';

  responseEngine._generateGeminiResponse = async () => null;

  const result = await responseEngine.generateResponseResult(
    'Hola Camila',
    { name: 'Usuario Prueba', relationship: 'amigo' },
    '',
    []
  );

  assert.ok(result, 'Expected result to be returned');
  assert.equal(result.isFallback, true);
  assert.equal(result.confidence, 0.5);
  assert.equal(result.provider, 'fallback');
  assert.ok(result.text.includes('congeló el changarro'), 'Expected Camila in-character emergency message');
});

test('ResponseEngine.generateResponseResult returns emergency fallback for Lorenzo when model fails', async (t) => {
  const originalActiveAgent = process.env.ACTIVE_AGENT;
  const originalActiveLLM = process.env.ACTIVE_LLM;
  const originalGeminiGen = responseEngine._generateGeminiResponse;

  t.after(() => {
    process.env.ACTIVE_AGENT = originalActiveAgent;
    process.env.ACTIVE_LLM = originalActiveLLM;
    responseEngine._generateGeminiResponse = originalGeminiGen;
  });

  process.env.ACTIVE_AGENT = 'lorenzo';
  process.env.ACTIVE_LLM = 'gemini';

  responseEngine._generateGeminiResponse = async () => null;

  const result = await responseEngine.generateResponseResult(
    'Hola Lorenzo',
    { name: 'Usuario Prueba', relationship: 'amigo' },
    '',
    []
  );

  assert.ok(result, 'Expected result to be returned');
  assert.equal(result.isFallback, true);
  assert.equal(result.confidence, 0.5);
  assert.equal(result.provider, 'fallback');
  assert.ok(result.text.includes('saturó un poco la red'), 'Expected Lorenzo in-character emergency message');
});
