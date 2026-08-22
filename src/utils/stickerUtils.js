const path = require('path');

const STICKER_NAME_PATTERN = /^[a-z0-9_-]+$/;

function normalizeStickerName(rawName) {
  if (typeof rawName !== 'string') {
    return null;
  }

  const name = rawName.trim().toLowerCase().replace(/\.webp$/i, '');

  if (!name || !STICKER_NAME_PATTERN.test(name)) {
    return null;
  }

  return name;
}

function resolveStickerPath(stickersDir, rawName) {
  const stickerName = normalizeStickerName(rawName);

  if (!stickerName) {
    return null;
  }

  const resolvedDir = path.resolve(stickersDir);
  const resolvedPath = path.resolve(resolvedDir, `${stickerName}.webp`);
  const relativePath = path.relative(resolvedDir, resolvedPath);

  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return null;
  }

  return resolvedPath;
}

module.exports = {
  normalizeStickerName,
  resolveStickerPath
};
