'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { safeCall } = require('./safe');

// 仓库内默认配置（禁止含 secret）。加载失败时回退为空对象，不影响主流程。
function loadRepoDefaults() {
  return safeCall(function () {
    const raw = fs.readFileSync(path.join(__dirname, 'defaults.json'), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  }, {});
}

function getUserConfigFile() {
  return path.join(os.homedir(), '.ai-spec-auto', 'config.json');
}

// 用户主目录配置，允许存放 secret、URL 覆盖、总开关。失败时回退空对象。
function loadUserConfig() {
  return safeCall(function () {
    const raw = fs.readFileSync(getUserConfigFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  }, {});
}

function pickString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function pickBool(value) {
  if (value === true) return true;
  if (typeof value === 'string') return value === '1' || value === 'true';
  return false;
}

// 合并优先级（高 → 低）：环境变量 > ~/.ai-spec-auto/config.json > 仓库默认。
function getConfig() {
  const env = process.env || {};
  const repo = loadRepoDefaults();
  const user = loadUserConfig();

  const envDisabled = pickBool(env.AI_SPEC_TELEMETRY_DISABLED);
  const userDisabled = pickBool(user.disabled);
  const repoDisabled = pickBool(repo.disabled);
  const disabled = envDisabled || userDisabled || repoDisabled;

  const url =
    pickString(env.AI_SPEC_VISUAL_URL) ||
    pickString(user.visualUrl) ||
    pickString(repo.visualUrl);

  // secret 仅从环境变量或用户主目录读取，绝不从仓库默认读取
  const secret = pickString(env.AI_SPEC_TELEMETRY_SECRET) || pickString(user.secret);

  return {
    disabled,
    visualUrl: url,
    secret,
    enabled: !disabled && url.length > 0,
  };
}

function getCacheDir() {
  return path.join(os.homedir(), '.ai-spec-auto');
}

function getCacheFile() {
  return path.join(getCacheDir(), 'telemetry.json');
}

function ensureCacheDir() {
  safeCall(function () {
    fs.mkdirSync(getCacheDir(), { recursive: true });
  });
}

function readCache() {
  return safeCall(function () {
    const raw = fs.readFileSync(getCacheFile(), 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  }, {});
}

function writeCache(next) {
  ensureCacheDir();
  safeCall(function () {
    fs.writeFileSync(getCacheFile(), JSON.stringify(next, null, 2), 'utf8');
  });
}

function markNoticeShown() {
  const cache = readCache();
  if (!cache.noticeShown) {
    cache.noticeShown = true;
    cache.noticeShownAt = new Date().toISOString();
    writeCache(cache);
    return true;
  }
  return false;
}

module.exports = {
  getConfig,
  getCacheDir,
  getCacheFile,
  readCache,
  writeCache,
  markNoticeShown,
};
