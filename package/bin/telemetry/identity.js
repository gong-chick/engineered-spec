'use strict';

const crypto = require('crypto');
const os = require('os');
const { safeCall, safeRequire } = require('./safe');

let cached = null;

function fallbackId() {
  const interfaces = safeCall(function () {
    return os.networkInterfaces();
  }, {});
  const macs = [];
  if (interfaces && typeof interfaces === 'object') {
    Object.keys(interfaces).forEach(function (name) {
      const list = interfaces[name] || [];
      list.forEach(function (entry) {
        if (entry && entry.mac && entry.mac !== '00:00:00:00:00:00') {
          macs.push(entry.mac);
        }
      });
    });
  }
  macs.sort();
  const userInfo = safeCall(function () {
    return os.userInfo();
  }, { username: 'unknown' });
  const material = [
    macs.join(','),
    userInfo && userInfo.username ? userInfo.username : 'unknown',
    safeCall(function () { return os.hostname(); }, 'unknown'),
    safeCall(function () { return os.platform(); }, 'unknown'),
  ].join('|');
  return crypto.createHash('sha256').update(material).digest('hex');
}

function resolveInstallationId() {
  if (cached) return cached;
  const mod = safeRequire('node-machine-id');
  let id = null;
  if (mod && typeof mod.machineIdSync === 'function') {
    id = safeCall(function () {
      return mod.machineIdSync(true);
    }, null);
  }
  if (!id || typeof id !== 'string' || id.length < 8) {
    id = fallbackId();
  }
  cached = String(id).slice(0, 128);
  return cached;
}

module.exports = { resolveInstallationId, fallbackId };
