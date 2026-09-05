const assert = require('node:assert/strict');
const test = require('node:test');

const classifier = require('../src/ai/classifier');
const confidenceEngine = require('../src/pipeline/confidenceEngine');
const openaiClient = require('../src/ai/openaiClient');

test('Classifier returns safe fallback classification on LLM / network failure', async (t) => {
  const originalGetCompletion = openaiClient.getCompletion;
  t.after(() => {
    openaiClient.getCompletion = originalGetCompletion;
  });

  // Mock getCompletion to simulate an OpenAI API failure (e.g. 500, network reset, 400)
  openaiClient.getCompletion = async () => {
    throw new Error('OpenAI API connection timeout');
  };

  const messageText = 'Oye, compre una laptop nueva hoy en la tarde';
  const result = await classifier.classify(messageText);

  assert.ok(result, 'Expected a classification result');
  assert.equal(result.intent, 'chat');
  assert.equal(result.confidence, 0.7);
  assert.equal(result.requires_human, false, 'Expected requires_human to be false on network/API failure');
  assert.equal(result.isFallback, true);
});

test('ConfidenceEngine allows safe fallback classification to flow through without human lock', async (t) => {
  const fallbackClassification = {
    intent: 'chat',
    confidence: 0.7,
    importance: 0.2,
    complexity: 0.2,
    requires_human: false,
    isFallback: true
  };

  const score = confidenceEngine.evaluateConfidence(fallbackClassification);
  assert.equal(score, 0.7, 'Expected confidenceEngine to evaluate explicit fallback confidence score as 0.7');

  // Verify shouldRespond allows the message through
  const originalClassify = classifier.classify;
  t.after(() => {
    classifier.classify = originalClassify;
  });

  classifier.classify = async () => fallbackClassification;

  const evaluation = await confidenceEngine.shouldRespond('Oye, compre una laptop nueva hoy');
  assert.equal(evaluation.isAllowed, true, 'Expected message to be allowed through');
  assert.equal(evaluation.score, 0.7);
  assert.equal(evaluation.responseMode, 'auto');
});
