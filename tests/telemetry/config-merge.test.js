'use strict';

// 验证配置三层合并：环境变量 > ~/.ai-spec-auto/config.json > bin/telemetry/defaults.json
// 通过 HOME 重定向将用户配置隔离到临时目录，避免污染真实用户目录。

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CONFIG_PATH = path.join(
  __dirname,
  '..',
  '..',
  'bin',
  'telemetry',
  'config.js',
);
const DEFAULTS_PATH = path.join(
  __dirname,
  '..',
  '..',
  'bin',
  'telemetry',
  'defaults.json',
);

function freshRequire(modulePath) {
  delete require.cache[require.resolve(modulePath)];
  return require(modulePath);
}

function withTempHome(run) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-telemetry-'));
  const prev = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    AI_SPEC_VISUAL_URL: process.env.AI_SPEC_VISUAL_URL,
    AI_SPEC_TELEMETRY_SECRET: process.env.AI_SPEC_TELEMETRY_SECRET,
    AI_SPEC_TELEMETRY_DISABLED: process.env.AI_SPEC_TELEMETRY_DISABLED,
  };
  process.env.HOME = tmp;
  process.env.USERPROFILE = tmp;
  delete process.env.AI_SPEC_VISUAL_URL;
  delete process.env.AI_SPEC_TELEMETRY_SECRET;
  delete process.env.AI_SPEC_TELEMETRY_DISABLED;
  try {
    run(tmp);
  } finally {
    process.env.HOME = prev.HOME;
    process.env.USERPROFILE = prev.USERPROFILE;
    if (prev.AI_SPEC_VISUAL_URL !== undefined)
      process.env.AI_SPEC_VISUAL_URL = prev.AI_SPEC_VISUAL_URL;
    if (prev.AI_SPEC_TELEMETRY_SECRET !== undefined)
      process.env.AI_SPEC_TELEMETRY_SECRET = prev.AI_SPEC_TELEMETRY_SECRET;
    if (prev.AI_SPEC_TELEMETRY_DISABLED !== undefined)
      process.env.AI_SPEC_TELEMETRY_DISABLED = prev.AI_SPEC_TELEMETRY_DISABLED;
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function writeUserConfig(homeDir, obj) {
  const dir = path.join(homeDir, '.ai-spec-auto');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(obj), 'utf8');
}

test('repo defaults are respected when no env and no user config', function () {
  withTempHome(function () {
    const { getConfig } = freshRequire(CONFIG_PATH);
    const cfg = getConfig();
    const repoDefaults = JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8'));
    assert.equal(cfg.visualUrl, String(repoDefaults.visualUrl).trim());
    assert.equal(cfg.secret, '');
    assert.equal(cfg.enabled, cfg.visualUrl.length > 0);
  });
});

test('user config overrides repo defaults', function () {
  withTempHome(function (home) {
    writeUserConfig(home, {
      visualUrl: 'http://127.0.0.1:3000',
      secret: 'user-secret',
    });
    const { getConfig } = freshRequire(CONFIG_PATH);
    const cfg = getConfig();
    assert.equal(cfg.visualUrl, 'http://127.0.0.1:3000');
    assert.equal(cfg.secret, 'user-secret');
    assert.equal(cfg.enabled, true);
  });
});

test('env vars override user config', function () {
  withTempHome(function (home) {
    writeUserConfig(home, {
      visualUrl: 'http://127.0.0.1:3000',
      secret: 'user-secret',
    });
    process.env.AI_SPEC_VISUAL_URL = 'http://env-host:9999';
    process.env.AI_SPEC_TELEMETRY_SECRET = 'env-secret';
    const { getConfig } = freshRequire(CONFIG_PATH);
    const cfg = getConfig();
    assert.equal(cfg.visualUrl, 'http://env-host:9999');
    assert.equal(cfg.secret, 'env-secret');
  });
});

test('AI_SPEC_TELEMETRY_DISABLED=1 disables regardless of other sources', function () {
  withTempHome(function (home) {
    writeUserConfig(home, { visualUrl: 'http://127.0.0.1:3000' });
    process.env.AI_SPEC_VISUAL_URL = 'http://env-host:9999';
    process.env.AI_SPEC_TELEMETRY_DISABLED = '1';
    const { getConfig } = freshRequire(CONFIG_PATH);
    const cfg = getConfig();
    assert.equal(cfg.enabled, false);
    assert.equal(cfg.disabled, true);
  });
});

test('user config disabled=true also disables', function () {
  withTempHome(function (home) {
    writeUserConfig(home, {
      visualUrl: 'http://127.0.0.1:3000',
      disabled: true,
    });
    const { getConfig } = freshRequire(CONFIG_PATH);
    const cfg = getConfig();
    assert.equal(cfg.enabled, false);
  });
});

test('repo defaults never leak secret (sanity check)', function () {
  const repoDefaults = JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8'));
  assert.equal(Object.prototype.hasOwnProperty.call(repoDefaults, 'secret'), false);
});

test('malformed user config is silently ignored and does not throw', function () {
  withTempHome(function (home) {
    const dir = path.join(home, '.ai-spec-auto');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'config.json'), '{ not valid json', 'utf8');
    const { getConfig } = freshRequire(CONFIG_PATH);
    const cfg = getConfig();
    const repoDefaults = JSON.parse(fs.readFileSync(DEFAULTS_PATH, 'utf8'));
    assert.equal(cfg.visualUrl, String(repoDefaults.visualUrl).trim());
    assert.equal(cfg.secret, '');
  });
});
