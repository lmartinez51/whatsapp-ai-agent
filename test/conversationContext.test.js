const assert = require('node:assert/strict');
const test = require('node:test');

const conversationContext = require('../src/memory/conversationContext');

test('conversationContext keeps optional Gemini model content metadata', () => {
  const contactId = 'gemini-context-test@c.us';
  const geminiContent = {
    role: 'model',
    parts: [
      {
        text: 'Respuesta con firma',
        thoughtSignature: 'opaque-signature'
      }
    ]
  };

  conversationContext.clearContext(contactId);
  conversationContext.addMessage(contactId, 'assistant', 'Respuesta con firma', {
    geminiContent
  });

  const [message] = conversationContext.getContext(contactId);

  assert.equal(message.role, 'assistant');
  assert.equal(message.content, 'Respuesta con firma');
  assert.deepEqual(message.geminiContent, geminiContent);

  conversationContext.clearContext(contactId);
});
