const assert = require('node:assert/strict');
const test = require('node:test');

const semanticMemory = require('../src/memory/semanticMemory');
const openaiClient = require('../src/ai/openaiClient');
const vectorStore = require('../src/memory/vectorStore');
const { buildMasterSystemPrompt } = require('../src/prompts/masterPrompt');

test('SemanticMemory.retrieveMemories gracefully handles 401 AuthenticationError and returns empty array', async (t) => {
  const originalGetEmbedding = openaiClient.getEmbedding;
  t.after(() => {
    openaiClient.getEmbedding = originalGetEmbedding;
  });

  openaiClient.getEmbedding = async () => {
    const err = new Error('Incorrect API key provided: sk-invalid. You can find your API key at https://platform.openai.com/account/api-keys.');
    err.status = 401;
    err.code = 'invalid_api_key';
    throw err;
  };

  const result = await semanticMemory.retrieveMemories('test-contact@c.us', 'Hola, ¿cómo estás?');
  assert.ok(Array.isArray(result), 'Expected result to be an array');
  assert.equal(result.length, 0, 'Expected empty array on 401 error');
});

test('SemanticMemory.retrieveMemories gracefully handles missing OpenAI API key and returns empty array', async (t) => {
  const config = require('../src/config');
  const originalKey = config.openaiApiKey;
  t.after(() => {
    config.openaiApiKey = originalKey;
  });

  config.openaiApiKey = '';
  const result = await semanticMemory.retrieveMemories('test-contact@c.us', 'Query without API key');
  assert.ok(Array.isArray(result), 'Expected result to be an array');
  assert.equal(result.length, 0, 'Expected empty array when API key is missing');
});

test('SemanticMemory.retrieveMemories gracefully handles vectorStore query failure', async (t) => {
  const originalGetEmbedding = openaiClient.getEmbedding;
  const originalQuery = vectorStore.query;
  t.after(() => {
    openaiClient.getEmbedding = originalGetEmbedding;
    vectorStore.query = originalQuery;
  });

  openaiClient.getEmbedding = async () => [0.1, 0.2, 0.3];
  vectorStore.query = async () => {
    throw new Error('ChromaDB connection refused');
  };

  const result = await semanticMemory.retrieveMemories('test-contact@c.us', 'test query');
  assert.ok(Array.isArray(result), 'Expected result to be an array');
  assert.equal(result.length, 0, 'Expected empty array on vector store error');
});

test('SemanticMemory.storeMemory gracefully handles embedding failure without throwing', async (t) => {
  const originalGetEmbedding = openaiClient.getEmbedding;
  t.after(() => {
    openaiClient.getEmbedding = originalGetEmbedding;
  });

  openaiClient.getEmbedding = async () => {
    throw new Error('401 Unauthorized');
  };

  const success = await semanticMemory.storeMemory('test-contact@c.us', 'test message');
  assert.equal(success, false, 'Expected storeMemory to return false on embedding error');
});

test('buildMasterSystemPrompt omits semantic_memories block when semanticMemories is empty array or empty string', () => {
  const promptWithEmptyArray = buildMasterSystemPrompt({
    agentSystemPrompt: 'Prompt base',
    currentDateTime: '2026-09-04 18:00',
    contactProfile: { name: 'Amigo', relationship: 'amigo' },
    topicsString: '',
    interactionsString: '',
    semanticMemories: []
  });
  assert.ok(!promptWithEmptyArray.includes('<semantic_memories>'), 'Should not include <semantic_memories> when empty array');

  const promptWithEmptyString = buildMasterSystemPrompt({
    agentSystemPrompt: 'Prompt base',
    currentDateTime: '2026-09-04 18:00',
    contactProfile: { name: 'Amigo', relationship: 'amigo' },
    topicsString: '',
    interactionsString: '',
    semanticMemories: ''
  });
  assert.ok(!promptWithEmptyString.includes('<semantic_memories>'), 'Should not include <semantic_memories> when empty string');
});
