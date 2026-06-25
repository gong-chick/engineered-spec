'use strict';

// 验证 healthcheck 兜底：
//   - 可达（HEAD 200）→ 返回 true，允许 reporter 后续上报
//   - 不可达（连接拒绝/超时/5xx）→ 返回 false，跳过上报
//   - 进程内缓存：同一次调用多次只发一次 HEAD
//   - 跨进程冷却：失败时间写入 ~/.ai-spec-auto/telemetry.json，冷却窗口内不再探测

const assert = require('node:assert/strict');
const { test } = require('node:test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HEALTHCHECK_PATH = path.join(
  __dirname,
  '..',
  '..',
  'bin',
  'telemetry',
  'healthcheck.js',
);

function freshRequire(modulePath) {
  // 同时清空 healthcheck 和其依赖的 config 的缓存，确保 HOME 重定向生效
  delete require.cache[require.resolve(modulePath)];
  delete require.cache[
    require.resolve(path.join(__dirname, '..', '..', 'bin', 'telemetry', 'config.js'))
  ];
  return require(modulePath);
}

function withTempHome(run) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-health-'));
  const prev = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = tmp;
  process.env.USERPROFILE = tmp;
  return Promise.resolve()
    .then(function () {
      return run(tmp);
    })
    .finally(function () {
      process.env.HOME = prev.HOME;
      process.env.USERPROFILE = prev.USERPROFILE;
      fs.rmSync(tmp, { recursive: true, force: true });
    });
}

function startHealthServer(handler) {
  return new Promise(function (resolve) {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', function () {
      const addr = server.address();
      resolve({
        server: server,
        url: 'http://127.0.0.1:' + addr.port,
      });
    });
  });
}

function closeServer(server) {
  return new Promise(function (resolve) {
    server.close(function () {
      resolve();
    });
  });
}

test('returns true when /api/health responds 200', async function () {
  await withTempHome(async function () {
    const calls = [];
    const { server, url } = await startHealthServer(function (req, res) {
      calls.push({ method: req.method, url: req.url });
      res.writeHead(200);
      res.end();
    });
    try {
      const hc = freshRequire(HEALTHCHECK_PATH);
      hc.__resetForTests();
      const ok = await hc.ensureReachable(url);
      assert.equal(ok, true);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].method, 'HEAD');
      assert.equal(calls[0].url, '/api/health');
    } finally {
      await closeServer(server);
    }
  });
});

test('returns false when /api/health is unreachable', async function () {
  await withTempHome(async function () {
    const hc = freshRequire(HEALTHCHECK_PATH);
    hc.__resetForTests();
    // 127.0.0.1:1 基本一定拒绝
    const ok = await hc.ensureReachable('http://127.0.0.1:1');
    assert.equal(ok, false);
  });
});

test('process-level memoization: HEAD is sent only once per process', async function () {
  await withTempHome(async function () {
    let callCount = 0;
    const { server, url } = await startHealthServer(function (_req, res) {
      callCount += 1;
      res.writeHead(200);
      res.end();
    });
    try {
      const hc = freshRequire(HEALTHCHECK_PATH);
      hc.__resetForTests();
      const a = await hc.ensureReachable(url);
      const b = await hc.ensureReachable(url);
      const c = await hc.ensureReachable(url);
      assert.equal(a, true);
      assert.equal(b, true);
      assert.equal(c, true);
      assert.equal(callCount, 1, 'HEAD should be sent once even for multiple reports');
    } finally {
      await closeServer(server);
    }
  });
});

test('concurrent calls share a single probe', async function () {
  await withTempHome(async function () {
    let callCount = 0;
    const { server, url } = await startHealthServer(function (_req, res) {
      callCount += 1;
      // 人为延迟 50ms 确保多个并发请求都在等同一个 probe
      setTimeout(function () {
        res.writeHead(200);
        res.end();
      }, 50);
    });
    try {
      const hc = freshRequire(HEALTHCHECK_PATH);
      hc.__resetForTests();
      const results = await Promise.all([
        hc.ensureReachable(url),
        hc.ensureReachable(url),
        hc.ensureReachable(url),
        hc.ensureReachable(url),
      ]);
      assert.deepEqual(results, [true, true, true, true]);
      assert.equal(callCount, 1, 'concurrent ensureReachable must share one in-flight probe');
    } finally {
      await closeServer(server);
    }
  });
});

test('cross-process cooldown: after failure, next process skips probe', async function () {
  await withTempHome(async function (home) {
    // 手动写入一个"最近刚失败过"的缓存
    const dir = path.join(home, '.ai-spec-auto');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'telemetry.json'),
      JSON.stringify({ lastHealthFailAt: new Date().toISOString() }),
      'utf8',
    );
    let callCount = 0;
    const { server, url } = await startHealthServer(function (_req, res) {
      callCount += 1;
      res.writeHead(200);
      res.end();
    });
    try {
      const hc = freshRequire(HEALTHCHECK_PATH);
      hc.__resetForTests();
      const ok = await hc.ensureReachable(url);
      assert.equal(ok, false, 'cooldown should force false even if server is up');
      assert.equal(callCount, 0, 'cooldown should skip the network probe entirely');
    } finally {
      await closeServer(server);
    }
  });
});

test('HEAD 405 falls back to GET (covers reverse proxy + dev rewrite cases)', async function () {
  await withTempHome(async function () {
    const calls = [];
    const { server, url } = await startHealthServer(function (req, res) {
      calls.push({ method: req.method, url: req.url });
      if (req.method === 'HEAD') {
        res.writeHead(405);
        res.end();
        return;
      }
      res.writeHead(200);
      res.end();
    });
    try {
      const hc = freshRequire(HEALTHCHECK_PATH);
      hc.__resetForTests();
      const ok = await hc.ensureReachable(url);
      assert.equal(ok, true, 'HEAD 405 should not be treated as down if GET works');
      assert.equal(calls.length, 2, 'expected exactly HEAD then GET');
      assert.equal(calls[0].method, 'HEAD');
      assert.equal(calls[1].method, 'GET');
    } finally {
      await closeServer(server);
    }
  });
});

test('HEAD timeout falls back to GET within second attempt (dev cold compile case)', async function () {
  await withTempHome(async function () {
    // 模拟 Next.js dev 首次冷编译：HEAD 超时（比 timeout 慢），但 GET 立即成功
    process.env.AI_SPEC_TELEMETRY_HEALTH_TIMEOUT_MS = '200';
    const calls = [];
    const { server, url } = await startHealthServer(function (req, res) {
      calls.push(req.method);
      if (req.method === 'HEAD') {
        // 超过 200ms 的 timeout，让它被 abort
        setTimeout(function () {
          try {
            res.writeHead(200);
            res.end();
          } catch (_err) {
            /* already aborted */
          }
        }, 600);
        return;
      }
      res.writeHead(200);
      res.end();
    });
    try {
      const hc = freshRequire(HEALTHCHECK_PATH);
      hc.__resetForTests();
      const ok = await hc.ensureReachable(url);
      assert.equal(ok, true, 'fallback GET should rescue HEAD timeout');
      assert.equal(calls.length >= 2, true, 'expected HEAD then GET');
      assert.equal(calls[0], 'HEAD');
      assert.equal(calls[calls.length - 1], 'GET');
    } finally {
      await closeServer(server);
      delete process.env.AI_SPEC_TELEMETRY_HEALTH_TIMEOUT_MS;
    }
  });
});

test('successful probe clears stale failure timestamp', async function () {
  await withTempHome(async function (home) {
    const dir = path.join(home, '.ai-spec-auto');
    fs.mkdirSync(dir, { recursive: true });
    // 写一个很久以前的失败时间（超过冷却窗口）
    const longAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    fs.writeFileSync(
      path.join(dir, 'telemetry.json'),
      JSON.stringify({ lastHealthFailAt: longAgo }),
      'utf8',
    );
    const { server, url } = await startHealthServer(function (_req, res) {
      res.writeHead(200);
      res.end();
    });
    try {
      const hc = freshRequire(HEALTHCHECK_PATH);
      hc.__resetForTests();
      const ok = await hc.ensureReachable(url);
      assert.equal(ok, true);
      const cache = JSON.parse(
        fs.readFileSync(path.join(dir, 'telemetry.json'), 'utf8'),
      );
      assert.equal(
        cache.lastHealthFailAt,
        undefined,
        'success should remove the stale failure marker',
      );
    } finally {
      await closeServer(server);
    }
  });
});
