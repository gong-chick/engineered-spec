/**
 * ai-spec-auto visual <subcmd>
 *
 * Opt-in 接入入口，完全不参与 init / sync 主链。仅在用户主动调用时才落盘
 * .ai-spec/visual-bridge.json，并提供连通性自检。
 *
 * 子命令：
 *   - init     交互式生成 visual-bridge.json
 *   - disable  关闭 enabled
 *   - status   显示当前桥接配置 + inbox 状态
 *   - test     单次 ping visual + 拉取 pending + 推送一条 receipt 探针
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');
const { URL } = require('url');

const BRIDGE_REL_PATH = '.ai-spec/visual-bridge.json';
const INBOX_REL_PATH = '.ai-spec/inbox';

function bridgePath(targetDir) {
  return path.join(targetDir, BRIDGE_REL_PATH);
}

function inboxPath(targetDir) {
  return path.join(targetDir, INBOX_REL_PATH);
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_err) {
    // noop
  }
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_err) {
    return null;
  }
}

function loadBridge(targetDir) {
  return safeReadJson(bridgePath(targetDir));
}

function writeBridge(targetDir, data) {
  const file = bridgePath(targetDir);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  return file;
}

function ask(rl, question, defaultValue) {
  return new Promise((resolve) => {
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    rl.question(`${question}${suffix}: `, (answer) => {
      const trimmed = String(answer || '').trim();
      resolve(trimmed || defaultValue || '');
    });
  });
}

function generateConnectToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** 读取 `--flag value`（value 不能是另一个以 `--` 开头的开关） */
function readArgValue(argv, flag) {
  const idx = argv.indexOf(flag);
  if (idx === -1) return null;
  const v = argv[idx + 1];
  if (v == null || String(v).startsWith('--')) return null;
  return String(v).trim();
}

/**
 * `visual test` 里拉 pending / 推 receipt 的 HTTP 超时（毫秒）。
 * 默认 15s：本地 Next dev 首次打 /api/internal/ingest/raw 时编译 + DB 往往超过 1.5s。
 * 与 internal/visual-hooks/config-loader 相同环境变量名。
 */
function resolveVisualTestHttpTimeoutMs() {
  const raw = process.env.AI_SPEC_VISUAL_PUSH_TIMEOUT_MS;
  const n = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(n) && n >= 500 && n <= 120000) {
    return n;
  }
  return 15000;
}

async function runInit(targetDir, args) {
  const yes = args.includes('--yes') || args.includes('-y');
  const existing = loadBridge(targetDir) || {};

  const fromCliServer = readArgValue(args, '--server');
  const fromCliWorkspaceId =
    readArgValue(args, '--workspace-id') || readArgValue(args, '--workspace_id');
  const fromCliAgentId =
    readArgValue(args, '--agent-id') || readArgValue(args, '--agent_id');
  const fromCliConnectToken =
    readArgValue(args, '--connect-token') || readArgValue(args, '--connect_token');

  let serverUrl = fromCliServer || existing.server_url || 'http://localhost:3000';
  let workspaceId = fromCliWorkspaceId || existing.workspace_id || path.basename(targetDir);
  let agentId = fromCliAgentId || existing.agent_id || 'ai-spec-auto';
  let pushMode = existing.push_mode || 'hook';
  let inboxTransport = existing.inbox_transport || 'http-pull';
  let pollHint = existing.poll_interval_hint || 'on-cli-tick';
  let connectToken = fromCliConnectToken || existing.connect_token || generateConnectToken();

  if (!yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      serverUrl = await ask(rl, 'Visual server URL', serverUrl);
      workspaceId = await ask(rl, 'Workspace ID', workspaceId);
      agentId = await ask(rl, 'Agent ID', agentId);
      pushMode = await ask(rl, 'Push mode (hook|collector)', pushMode);
      inboxTransport = await ask(rl, 'Inbox transport (http-pull|file-inbox)', inboxTransport);
      pollHint = await ask(rl, 'Poll interval hint', pollHint);
      const useToken = await ask(rl, 'Connect token (leave empty to keep generated)', '');
      if (useToken) connectToken = useToken;
    } finally {
      rl.close();
    }
  }

  const data = {
    schema_version: 1,
    enabled: true,
    server_url: serverUrl,
    workspace_id: workspaceId,
    agent_id: agentId,
    connect_token: connectToken,
    push_mode: pushMode,
    inbox_transport: inboxTransport,
    poll_interval_hint: pollHint,
    updated_at: new Date().toISOString(),
  };
  const file = writeBridge(targetDir, data);

  if (inboxTransport === 'file-inbox' || inboxTransport === 'http-pull') {
    ensureDir(inboxPath(targetDir));
  }

  console.log(`[visual] bridge written: ${file}`);
  console.log('[visual] connect_token (share with visual UI):');
  console.log(`         ${connectToken}`);
  return 0;
}

function runDisable(targetDir) {
  const existing = loadBridge(targetDir);
  if (!existing) {
    console.log('[visual] bridge not configured; nothing to disable');
    return 0;
  }
  const next = { ...existing, enabled: false, updated_at: new Date().toISOString() };
  writeBridge(targetDir, next);
  console.log('[visual] bridge disabled');
  return 0;
}

function runStatus(targetDir) {
  const bridge = loadBridge(targetDir);
  if (!bridge) {
    console.log('[visual] not configured (.ai-spec/visual-bridge.json absent)');
    return 0;
  }
  const inboxDir = inboxPath(targetDir);
  let pending = 0;
  let applied = 0;
  if (fs.existsSync(inboxDir)) {
    try {
      const items = fs.readdirSync(inboxDir);
      pending = items.filter((name) => /^control-.*\.json$/.test(name)).length;
      const appliedDir = path.join(inboxDir, '.applied');
      if (fs.existsSync(appliedDir)) {
        applied = fs.readdirSync(appliedDir).length;
      }
    } catch (_err) {
      // noop
    }
  }

  console.log(JSON.stringify({
    enabled: !!bridge.enabled,
    server_url: bridge.server_url || null,
    workspace_id: bridge.workspace_id || null,
    agent_id: bridge.agent_id || null,
    push_mode: bridge.push_mode || null,
    inbox_transport: bridge.inbox_transport || 'http-pull',
    inbox: { pending, applied },
    updated_at: bridge.updated_at || null,
  }, null, 2));
  return 0;
}

function httpPing(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      resolve({ ok: false, error: `invalid url: ${err.message}` });
      return;
    }
    const protocol = parsed.protocol === 'https:' ? https : http;
    const req = protocol.request(parsed, { method: 'GET' }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, statusCode: res.statusCode, body: body.slice(0, 200) });
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('timeout')), timeoutMs);
    req.on('error', (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
    req.on('close', () => clearTimeout(timer));
    req.end();
  });
}

async function runTest(targetDir) {
  const bridge = loadBridge(targetDir);
  if (!bridge || !bridge.enabled) {
    console.log('[visual] bridge disabled or missing; nothing to test');
    return 0;
  }
  const serverUrl = bridge.server_url;
  if (!serverUrl) {
    console.error('[visual] missing server_url');
    return 1;
  }

  const ping = await httpPing(serverUrl);
  console.log(`[visual] ping ${serverUrl} → ${ping.ok ? 'ok' : 'fail'}${ping.statusCode ? ` (status ${ping.statusCode})` : ''}${ping.error ? ` (${ping.error})` : ''}`);

  const testHttpMs = resolveVisualTestHttpTimeoutMs();

  let pulled = 0;
  try {
    const { pullPendingControls } = require('../internal/visual-hooks/control-puller');
    const result = await pullPendingControls({ targetDir, timeoutMs: testHttpMs });
    pulled = result.written || 0;
    console.log(`[visual] pull pending → ${pulled} written (transport=${result.transport})`);
  } catch (err) {
    console.log(`[visual] pull pending failed: ${err.message}`);
  }

  try {
    const { pushReceipts } = require('../internal/visual-hooks/receipt-pusher');
    const probe = [{
      eventType: 'control.receipt',
      outbox_id: `probe_${Date.now()}`,
      command: 'approve_gate',
      result: 'applied',
      reason: 'visual test probe',
      applied_state_snapshot: null,
      received_at: new Date().toISOString(),
    }];
    const pushResult = await pushReceipts({ targetDir, receipts: probe, timeoutMs: testHttpMs });
    console.log(`[visual] push probe receipt → ${pushResult.pushed ? 'ok' : 'fail'}${pushResult.error ? ` (${pushResult.error})` : ''}`);
  } catch (err) {
    console.log(`[visual] push probe failed: ${err.message}`);
  }

  return 0;
}

/**
 * `visual watch`：长驻守护，周期性消费 `.ai-spec/inbox/` 并拉取 visual 侧 outbox。
 *
 * 完全复用 `internal/visual-hooks/inbox-consumer.js` 的 `consumeInbox` 实现，
 * 不引入新状态机。任何异常都只写日志，不退出；连续失败指数退避到上限。
 *
 * 严格与 init / update / protocol-* 主链解耦：本子命令只在用户手动启动时运行。
 */
async function runWatch(targetDir, args) {
  const bridge = loadBridge(targetDir);
  if (!bridge) {
    console.error(
      '[visual watch] bridge 未配置（.ai-spec/visual-bridge.json 缺失）。请先运行 `visual init`。',
    );
    return 1;
  }
  if (bridge.enabled === false) {
    console.error('[visual watch] bridge enabled=false；请先 `visual init` 或手动改 enabled=true。');
    return 1;
  }

  const intervalRaw = readArgValue(args, '--interval');
  let intervalMs = Number.parseInt(intervalRaw || '2000', 10);
  if (!Number.isFinite(intervalMs) || intervalMs < 500) intervalMs = 2000;
  if (intervalMs > 60000) intervalMs = 60000;

  const maxBackoffMs = 30000;
  const logDir = path.join(targetDir, '.ai-spec', 'logs');
  const logFile = path.join(logDir, 'visual-watch.log');
  ensureDir(logDir);

  const writeLog = (level, message, extra) => {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      message,
      ...(extra && typeof extra === 'object' ? extra : {}),
    });
    try {
      fs.appendFileSync(logFile, `${line}\n`, 'utf-8');
    } catch (_err) {
      /* silent */
    }
    // stdout 方便 tmux / launchd 里直接观察
    const prefix = level === 'error' ? '[visual watch][ERR]' : '[visual watch]';
    console.log(`${prefix} ${message}${extra ? ` ${JSON.stringify(extra)}` : ''}`);
  };

  writeLog('info', 'start', {
    target: targetDir,
    server_url: bridge.server_url || null,
    workspace_id: bridge.workspace_id || null,
    interval_ms: intervalMs,
  });

  let running = true;
  let failureStreak = 0;
  const stop = (signal) => {
    if (!running) return;
    running = false;
    writeLog('info', 'stop', { signal: signal || 'manual' });
  };
  process.on('SIGINT', () => {
    stop('SIGINT');
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    stop('SIGTERM');
    process.exit(0);
  });

  const { consumeInbox } = require('../internal/visual-hooks/inbox-consumer');

  const tickTimeoutMs = Math.max(1000, Math.floor(intervalMs * 2));

  while (running) {
    try {
      const result = await consumeInbox({
        targetDir,
        timeoutMs: tickTimeoutMs,
      });
      const processed = result?.processed || 0;
      const pulled = result?.pulled || 0;
      if (processed > 0 || pulled > 0) {
        writeLog('info', 'tick', {
          processed,
          pulled,
          receipts: Array.isArray(result?.receipts)
            ? result.receipts.map((r) => ({ outbox_id: r.outbox_id, result: r.result }))
            : [],
        });
      }
      failureStreak = 0;
    } catch (err) {
      failureStreak += 1;
      writeLog('error', 'tick_failed', {
        error: String(err?.message || err),
        streak: failureStreak,
      });
    }

    const backoff = failureStreak === 0
      ? intervalMs
      : Math.min(maxBackoffMs, intervalMs * Math.pow(2, Math.min(failureStreak, 5)));

    await new Promise((resolve) => setTimeout(resolve, backoff));
  }

  return 0;
}

function printUsage() {
  console.log(
    'Usage: ai-spec-auto visual <init|disable|status|test|watch> [--target <dir>] [init: --server <url> --workspace-id <id> --agent-id <id> --connect-token <token> --yes] [watch: --interval <ms>]',
  );
}

async function main(argv) {
  const args = [...argv];
  let target = process.cwd();
  const remaining = [];
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--target') {
      target = path.resolve(process.cwd(), args.shift() || '.');
    } else {
      remaining.push(arg);
    }
  }

  const sub = remaining.shift();
  if (!sub || sub === '-h' || sub === '--help') {
    printUsage();
    return 0;
  }

  switch (sub) {
    case 'init':
      return runInit(target, remaining);
    case 'disable':
      return runDisable(target);
    case 'status':
      return runStatus(target);
    case 'test':
      return runTest(target);
    case 'watch':
      return runWatch(target, remaining);
    default:
      printUsage();
      return 1;
  }
}

module.exports = { main };
