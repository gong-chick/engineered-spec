const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergeMissing(defaultValue, existingValue) {
  if (Array.isArray(defaultValue)) {
    return Array.isArray(existingValue) ? existingValue : defaultValue;
  }
  if (!isPlainObject(defaultValue)) {
    return existingValue === undefined ? defaultValue : existingValue;
  }

  const result = isPlainObject(existingValue) ? { ...existingValue } : {};
  for (const [key, value] of Object.entries(defaultValue)) {
    if (result[key] === undefined) {
      result[key] = value;
    } else if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = mergeMissing(value, result[key]);
    }
  }
  return result;
}

function stableHash(input, length = 16) {
  return crypto.createHash('sha256').update(String(input)).digest('hex').slice(0, length);
}

function createChecksum(input) {
  return `sha256:${crypto.createHash('sha256').update(String(input)).digest('hex')}`;
}

function toPosixPath(filePath) {
  return String(filePath).replace(/\\/g, '/');
}

function toRelativePath(rootDir, targetPath) {
  const relativePath = path.relative(rootDir, targetPath) || '.';
  return toPosixPath(relativePath);
}

module.exports = {
  ensureDir,
  readJsonIfExists,
  writeJson,
  mergeMissing,
  stableHash,
  createChecksum,
  toRelativePath,
  toPosixPath,
};
