const crypto = require('crypto');
const fs = require('fs');

function sha256Text(text) {
  if (text === undefined || text === null) {
    throw new Error('内容不能为空，无法计算 checksum');
  }
  return `sha256:${crypto.createHash('sha256').update(String(text)).digest('hex')}`;
}

function sha256File(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`文件不存在，无法计算 checksum：${filePath || '未提供路径'}`);
  }
  return sha256Text(fs.readFileSync(filePath));
}

function stableStringify(value) {
  if (value === undefined || value === null) {
    throw new Error('JSON 内容不能为空，无法计算 checksum');
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function safeJsonHash(object) {
  return sha256Text(stableStringify(object));
}

module.exports = {
  safeJsonHash,
  sha256File,
  sha256Text,
  stableStringify,
};
