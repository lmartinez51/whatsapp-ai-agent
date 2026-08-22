const assert = require('node:assert/strict');
const path = require('path');
const test = require('node:test');

const { normalizeStickerName, resolveStickerPath } = require('../src/utils/stickerUtils');

test('normalizeStickerName keeps safe sticker names predictable', () => {
  assert.equal(normalizeStickerName(' Shouting_LlamandoAnita.webp '), 'shouting_llamandoanita');
  assert.equal(normalizeStickerName('dancing-bailando'), 'dancing-bailando');
});

test('normalizeStickerName rejects empty and unsafe names', () => {
  assert.equal(normalizeStickerName(''), null);
  assert.equal(normalizeStickerName('../secret'), null);
  assert.equal(normalizeStickerName('nested/sticker'), null);
  assert.equal(normalizeStickerName('bad name'), null);
});

test('resolveStickerPath stays inside the stickers directory', () => {
  const stickersDir = path.join(process.cwd(), 'assets', 'stickers');

  assert.equal(
    resolveStickerPath(stickersDir, 'shocked_alv'),
    path.resolve(stickersDir, 'shocked_alv.webp')
  );

  assert.equal(resolveStickerPath(stickersDir, '..\\secret'), null);
});
