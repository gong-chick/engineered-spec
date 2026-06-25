'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { safeCall } = require('./safe');

function readJson(file) {
  return safeCall(function () {
    const raw = fs.readFileSync(file, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  }, null);
}

function readCliVersion(pkgRoot) {
  if (!pkgRoot) return null;
  const pkg = readJson(path.join(pkgRoot, 'package.json'));
  return pkg && typeof pkg.version === 'string' ? pkg.version : null;
}

function readProjectMeta(cwd) {
  if (!cwd || typeof cwd !== 'string') {
    return { projectHash: null, projectName: null };
  }
  const hash = crypto.createHash('sha256').update(cwd).digest('hex').slice(0, 32);
  const pkg = readJson(path.join(cwd, 'package.json'));
  const name = pkg && typeof pkg.name === 'string' ? pkg.name.slice(0, 200) : null;
  return { projectHash: hash, projectName: name };
}

function readInstallState(cwd) {
  if (!cwd) return null;
  return readJson(path.join(cwd, '.ai-spec', 'install-state.json'));
}

function pickString(value) {
  return typeof value === 'string' ? value : null;
}

function collectCommon(options) {
  const opts = options || {};
  const cwd = opts.cwd || process.cwd();
  const userInfo = safeCall(function () {
    return os.userInfo();
  }, {});
  const state = readInstallState(cwd);
  const project = readProjectMeta(cwd);

  return {
    hostname: safeCall(function () { return os.hostname(); }, null),
    username: userInfo && userInfo.username ? String(userInfo.username).slice(0, 128) : null,
    platform: safeCall(function () { return os.platform(); }, null),
    arch: safeCall(function () { return os.arch(); }, null),
    osRelease: safeCall(function () { return os.release(); }, null),
    nodeVersion: process.version,
    cliVersion: readCliVersion(opts.pkgRoot),
    profile: state ? pickString(state.profile) : null,
    ides: state && Array.isArray(state.ides) ? state.ides : null,
    level: state ? pickString(state.level) : null,
    projectHash: project.projectHash,
    projectName: project.projectName,
  };
}

module.exports = { collectCommon };
