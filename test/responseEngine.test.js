const assert = require('node:assert/strict');
const test = require('node:test');

const responseEngine = require('../src/ai/responseEngine');

test('ResponseEngine.generateResponseResult returns emergency fallback for Camila when both providers fail', async (t) => {
  const originalActiveAgent = process.env.ACTIVE_AGENT;
  const originalActiveLLM = process.env.ACTIVE_LLM;
  const originalTryProvider = responseEngine._tryProvider.bind(responseEngine);

  t.after(() => {
    process.env.ACTIVE_AGENT = originalActiveAgent;
    process.env.ACTIVE_LLM = originalActiveLLM;
    responseEngine._tryProvider = originalTryProvider;
  });

  process.env.ACTIVE_AGENT = 'camila';
  process.env.ACTIVE_LLM = 'gemini';

  // Simulate both primary (Gemini) and secondary (OpenAI) failing
  responseEngine._tryProvider = async () => null;

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

test('ResponseEngine.generateResponseResult returns emergency fallback for Lorenzo when both providers fail', async (t) => {
  const originalActiveAgent = process.env.ACTIVE_AGENT;
  const originalActiveLLM = process.env.ACTIVE_LLM;
  const originalTryProvider = responseEngine._tryProvider.bind(responseEngine);

  t.after(() => {
    process.env.ACTIVE_AGENT = originalActiveAgent;
    process.env.ACTIVE_LLM = originalActiveLLM;
    responseEngine._tryProvider = originalTryProvider;
  });

  process.env.ACTIVE_AGENT = 'lorenzo';
  process.env.ACTIVE_LLM = 'gemini';

  // Simulate both primary (Gemini) and secondary (OpenAI) failing
  responseEngine._tryProvider = async () => null;

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

test('ResponseEngine.generateResponseResult returns secondary provider result when primary fails', async (t) => {
  const originalActiveLLM = process.env.ACTIVE_LLM;
  const originalTryProvider = responseEngine._tryProvider.bind(responseEngine);

  t.after(() => {
    process.env.ACTIVE_LLM = originalActiveLLM;
    responseEngine._tryProvider = originalTryProvider;
  });

  process.env.ACTIVE_LLM = 'gemini';

  let callCount = 0;
  responseEngine._tryProvider = async (provider) => {
    callCount++;
    if (provider === 'gemini') return null; // primary fails
    return { text: 'Respuesta del backup', provider: 'openai' }; // secondary succeeds
  };

  const result = await responseEngine.generateResponseResult(
    'Hola',
    { name: 'Usuario Prueba', relationship: 'amigo' },
    '',
    []
  );

  assert.ok(result, 'Expected result to be returned');
  assert.equal(result.provider, 'openai', 'Expected secondary provider to be used');
  assert.equal(result.text, 'Respuesta del backup');
  assert.equal(callCount, 2, 'Expected both providers to be attempted');
});
