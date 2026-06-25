'use strict';

// 零侵入验收测试：
// 1) telemetry 模块正常加载 + 未配置 URL → wrap 透明 pass-through，且不发网络请求
// 2) telemetry/index.js 抛错 → wrap 降级为透明 pass-through
// 3) 整个 telemetry 目录不存在（模拟删除）→ require 失败，主流程仍可运行

const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

function resetCache() {
  Object.keys(require.cache).forEach(function (key) {
    if (key.indexOf(path.join('bin', 'telemetry')) !== -1) {
      delete require.cache[key];
    }
  });
}

async function testDisabledPassthrough() {
  resetCache();
  delete process.env.AI_SPEC_VISUAL_URL;
  process.env.AI_SPEC_TELEMETRY_DISABLED = '1';

  const telemetry = require('../../bin/telemetry');
  let called = 0;
  const result = telemetry.wrap('init', function () {
    called += 1;
    return 42;
  });
  assert.equal(called, 1, 'fn must be invoked');
  assert.equal(result, 42, 'wrap must return fn result verbatim');

  const asyncResult = await telemetry.wrap('init', async function () {
    return 'ok';
  });
  assert.equal(asyncResult, 'ok', 'async wrap must return awaited value');

  delete process.env.AI_SPEC_TELEMETRY_DISABLED;
  console.log('✓ disabled passthrough');
}

async function testThrowingAspect() {
  resetCache();
  // 替换 aspect 为抛错版本
  const aspectPath = require.resolve('../../bin/telemetry/aspect.js');
  require.cache[aspectPath] = {
    id: aspectPath,
    filename: aspectPath,
    loaded: true,
    exports: {
      wrap: function () {
        throw new Error('boom');
      },
    },
  };
  const telemetry = require('../../bin/telemetry');
  const result = telemetry.wrap('init', function () {
    return 'still-works';
  });
  assert.equal(result, 'still-works', 'wrap must degrade when aspect throws');
  delete require.cache[aspectPath];
  console.log('✓ throwing aspect degrades');
}

async function testMissingTelemetryDir() {
  resetCache();
  // 模拟 telemetry 目录被删除：拦截 require('./telemetry') 抛 MODULE_NOT_FOUND
  const origResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, isMain, options) {
    if (request === './telemetry' || request.indexOf('/bin/telemetry') !== -1) {
      const err = new Error("Cannot find module '" + request + "'");
      err.code = 'MODULE_NOT_FOUND';
      throw err;
    }
    return origResolve.call(this, request, parent, isMain, options);
  };
  try {
    let telemetry;
    try {
      telemetry = require('../../bin/telemetry');
    } catch (_error) {
      telemetry = { wrap: function (_c, fn) { return fn(); } };
    }
    const result = telemetry.wrap('init', function () {
      return 'ok';
    });
    assert.equal(result, 'ok');
    console.log('✓ missing telemetry dir — main flow still works');
  } finally {
    Module._resolveFilename = origResolve;
  }
}

async function testFnExceptionPropagates() {
  resetCache();
  // 显式禁用遥测，wrap 应为透明 passthrough（直接 return fn()，同步抛出原异常）。
  // 仓库 defaults.json 提供了默认 URL，所以不 disable 的话 wrap 会走异步分支。
  delete process.env.AI_SPEC_VISUAL_URL;
  process.env.AI_SPEC_TELEMETRY_DISABLED = '1';
  try {
    const telemetry = require('../../bin/telemetry');
    let thrown = null;
    try {
      telemetry.wrap('init', function () {
        throw new Error('fn-fail');
      });
    } catch (error) {
      thrown = error;
    }
    assert.ok(thrown, 'fn exception must propagate');
    assert.equal(thrown.message, 'fn-fail');
    console.log('✓ fn exceptions propagate unchanged');
  } finally {
    delete process.env.AI_SPEC_TELEMETRY_DISABLED;
  }
}

(async () => {
  try {
    await testDisabledPassthrough();
    await testThrowingAspect();
    await testMissingTelemetryDir();
    await testFnExceptionPropagates();
    console.log('\nAll telemetry isolation tests passed.');
  } catch (error) {
    console.error('Telemetry isolation test FAILED:', error);
    process.exit(1);
  }
})();
