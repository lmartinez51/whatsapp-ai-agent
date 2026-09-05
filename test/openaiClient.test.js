const assert = require('node:assert/strict');
const test = require('node:test');

const {
  isReasoningOrCurrentGenModel,
  sanitizeOpenAIOptions,
  getCompletion,
  openai
} = require('../src/ai/openaiClient');

test('isReasoningOrCurrentGenModel identifies reasoning and current-generation models', () => {
  assert.equal(isReasoningOrCurrentGenModel('gpt-5.6-luna'), true);
  assert.equal(isReasoningOrCurrentGenModel('GPT-5-turbo'), true);
  assert.equal(isReasoningOrCurrentGenModel('o1-preview'), true);
  assert.equal(isReasoningOrCurrentGenModel('o1-mini'), true);
  assert.equal(isReasoningOrCurrentGenModel('o3-mini'), true);
  assert.equal(isReasoningOrCurrentGenModel('o3'), true);

  assert.equal(isReasoningOrCurrentGenModel('gpt-4o'), false);
  assert.equal(isReasoningOrCurrentGenModel('gpt-4o-mini'), false);
  assert.equal(isReasoningOrCurrentGenModel('gpt-3.5-turbo'), false);
  assert.equal(isReasoningOrCurrentGenModel(''), false);
  assert.equal(isReasoningOrCurrentGenModel(null), false);
});

test('sanitizeOpenAIOptions strips temperature and maps max_tokens for gpt-5/o1/o3 models', () => {
  const input = {
    model: 'gpt-5.6-luna',
    temperature: 0.75,
    top_p: 0.9,
    max_tokens: 150
  };

  const sanitized = sanitizeOpenAIOptions(input);
  assert.equal(sanitized.model, 'gpt-5.6-luna');
  assert.equal(sanitized.temperature, undefined, 'temperature should be removed for gpt-5');
  assert.equal(sanitized.top_p, undefined, 'top_p should be removed for gpt-5');
  assert.equal(sanitized.max_tokens, undefined, 'max_tokens should be stripped');
  assert.equal(sanitized.max_output_tokens, 150, 'max_output_tokens should be set from max_tokens');
});

test('sanitizeOpenAIOptions preserves temperature for legacy/standard models like gpt-4o', () => {
  const input = {
    model: 'gpt-4o',
    temperature: 0.3,
    max_output_tokens: 100
  };

  const sanitized = sanitizeOpenAIOptions(input);
  assert.equal(sanitized.model, 'gpt-4o');
  assert.equal(sanitized.temperature, 0.3);
  assert.equal(sanitized.max_output_tokens, 100);
});

test('getCompletion passes sanitized payload to openai.responses.create', async (t) => {
  const originalResponsesCreate = openai.responses.create;
  t.after(() => {
    openai.responses.create = originalResponsesCreate;
  });

  let capturedPayload = null;
  openai.responses.create = async (payload) => {
    capturedPayload = payload;
    return { output_text: 'Simulated LLM response' };
  };

  const messages = [{ role: 'user', content: 'Hello' }];
  const response = await getCompletion(messages, {
    model: 'gpt-5.6-luna',
    temperature: 0.8,
    max_tokens: 60
  });

  assert.equal(response, 'Simulated LLM response');
  assert.ok(capturedPayload, 'Expected payload to be passed to openai.responses.create');
  assert.equal(capturedPayload.model, 'gpt-5.6-luna');
  assert.equal(capturedPayload.temperature, undefined);
  assert.equal(capturedPayload.max_tokens, undefined);
  assert.equal(capturedPayload.max_output_tokens, 60);
});

test('sanitizeOpenAIOptions normalizes reasoning_effort and preserves reasoning object for reasoning models', () => {
  const withReasoningEffort = sanitizeOpenAIOptions({
    model: 'gpt-5.6-luna',
    reasoning_effort: 'low',
    max_output_tokens: 300
  });
  assert.deepEqual(withReasoningEffort.reasoning, { effort: 'low' });
  assert.equal(withReasoningEffort.reasoning_effort, undefined);
  assert.equal(withReasoningEffort.max_output_tokens, 300);

  const withExplicitReasoning = sanitizeOpenAIOptions({
    model: 'gpt-5.6-luna',
    reasoning: { effort: 'low' },
    max_output_tokens: 300
  });
  assert.deepEqual(withExplicitReasoning.reasoning, { effort: 'low' });

  const legacyModel = sanitizeOpenAIOptions({
    model: 'gpt-4o',
    reasoning_effort: 'low',
    reasoning: { effort: 'low' }
  });
  assert.equal(legacyModel.reasoning, undefined);
  assert.equal(legacyModel.reasoning_effort, undefined);
});

