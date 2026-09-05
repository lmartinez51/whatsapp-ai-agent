const assert = require('node:assert/strict');
const test = require('node:test');

const memoryIngestionManager = require('../src/memory/memoryIngestionManager');
const geminiClient = require('../src/ai/geminiClient');
const openaiClient = require('../src/ai/openaiClient');

test('MemoryIngestionManager._extractMetadata delegates to Gemini when ACTIVE_LLM=gemini', async (t) => {
  const prevActiveLLM = process.env.ACTIVE_LLM;
  const originalGetGeminiCompletion = geminiClient.getGeminiCompletion;
  t.after(() => {
    process.env.ACTIVE_LLM = prevActiveLLM;
    geminiClient.getGeminiCompletion = originalGetGeminiCompletion;
  });

  process.env.ACTIVE_LLM = 'gemini';

  let calledGemini = false;
  geminiClient.getGeminiCompletion = async (contents, options) => {
    calledGemini = true;
    return JSON.stringify({
      topics: ['testing', 'gemini'],
      summary: 'El usuario y Lorenzo hablaron sobre pruebas unitarias.'
    });
  };

  const metadata = await memoryIngestionManager._extractMetadata('hola', 'adios', 'lorenzo');
  assert.equal(calledGemini, true, 'Expected getGeminiCompletion to be called');
  assert.deepEqual(metadata.topics, ['testing', 'gemini']);
  assert.equal(metadata.summary, 'El usuario y Lorenzo hablaron sobre pruebas unitarias.');
});

test('MemoryIngestionManager._extractMetadata gracefully handles LLM failures and returns null without throwing', async (t) => {
  const prevActiveLLM = process.env.ACTIVE_LLM;
  const originalGetGeminiCompletion = geminiClient.getGeminiCompletion;
  t.after(() => {
    process.env.ACTIVE_LLM = prevActiveLLM;
    geminiClient.getGeminiCompletion = originalGetGeminiCompletion;
  });

  process.env.ACTIVE_LLM = 'gemini';
  geminiClient.getGeminiCompletion = async () => {
    throw new Error('Gemini API connection reset');
  };

  const metadata = await memoryIngestionManager._extractMetadata('hola', 'adios', 'lorenzo');
  assert.equal(metadata, null, 'Expected metadata to be null on LLM failure');
});

test('MemoryIngestionManager._extractMetadata parses JSON wrapped in markdown code fences', async (t) => {
  const prevActiveLLM = process.env.ACTIVE_LLM;
  const originalGetGeminiCompletion = geminiClient.getGeminiCompletion;
  t.after(() => {
    process.env.ACTIVE_LLM = prevActiveLLM;
    geminiClient.getGeminiCompletion = originalGetGeminiCompletion;
  });

  process.env.ACTIVE_LLM = 'gemini';
  geminiClient.getGeminiCompletion = async () => {
    return '```json\n{\n  "topics": ["code fences", "formatting"],\n  "summary": "Prueba de markdown code fences"\n}\n```';
  };

  const metadata = await memoryIngestionManager._extractMetadata('hola', 'adios', 'lorenzo');
  assert.ok(metadata, 'Expected valid metadata object');
  assert.deepEqual(metadata.topics, ['code fences', 'formatting']);
  assert.equal(metadata.summary, 'Prueba de markdown code fences');
});

test('MemoryIngestionManager._extractMetadata returns null on empty, falsy, or whitespace-only response', async (t) => {
  const prevActiveLLM = process.env.ACTIVE_LLM;
  const originalGetGeminiCompletion = geminiClient.getGeminiCompletion;
  t.after(() => {
    process.env.ACTIVE_LLM = prevActiveLLM;
    geminiClient.getGeminiCompletion = originalGetGeminiCompletion;
  });

  process.env.ACTIVE_LLM = 'gemini';

  geminiClient.getGeminiCompletion = async () => '';
  let metadata = await memoryIngestionManager._extractMetadata('hola', 'adios', 'lorenzo');
  assert.equal(metadata, null, 'Expected null on empty string');

  geminiClient.getGeminiCompletion = async () => '   \n  \t  ';
  metadata = await memoryIngestionManager._extractMetadata('hola', 'adios', 'lorenzo');
  assert.equal(metadata, null, 'Expected null on whitespace-only string');

  geminiClient.getGeminiCompletion = async () => null;
  metadata = await memoryIngestionManager._extractMetadata('hola', 'adios', 'lorenzo');
  assert.equal(metadata, null, 'Expected null on null completion');
});

test('MemoryIngestionManager._extractMetadata returns null cleanly on truncated or invalid JSON', async (t) => {
  const prevActiveLLM = process.env.ACTIVE_LLM;
  const originalGetGeminiCompletion = geminiClient.getGeminiCompletion;
  t.after(() => {
    process.env.ACTIVE_LLM = prevActiveLLM;
    geminiClient.getGeminiCompletion = originalGetGeminiCompletion;
  });

  process.env.ACTIVE_LLM = 'gemini';

  // Truncated JSON response simulating token exhaustion / maxOutputTokens limit
  geminiClient.getGeminiCompletion = async () => '{"topics": ["interrupted", "trunc';
  const metadata = await memoryIngestionManager._extractMetadata('hola', 'adios', 'lorenzo');
  assert.equal(metadata, null, 'Expected null on truncated JSON');
});
