/**
 * Visual Control Puller
 *
 * 可选 HTTP 拉取：在 inbox-consumer 之前，先从 visual 拉取 pending 控制指令，
 * 把响应转写成 .ai-spec/inbox/control-*.json 文件，统一交给 inbox-consumer 消费。
 *
 * 设计约束：
 * - 仅使用 Node 内置（http/https/fs/path），零依赖
 * - 严格短超时（默认 ≤ 800ms），任何错误必须静默
 * - 仅在 visual-bridge.json 存在 enabled=true 且 inbox_transport != 'file-only' 时启用
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL } = require('url');

const INBOX_DIR_REL = '.ai-spec/inbox';

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (_err) {
    return null;
  }
}

function loadBridgeConfig(targetDir) {
  const candidates = [
    path.join(targetDir, '.ai-spec/visual-bridge.json'),
    path.join(targetDir, '.ai-spec/visual-config.json'),
  ];
  for (const file of candidates) {
    const data = safeReadJson(file);
    if (data && typeof data === 'object') {
      return data;
    }
  }
  return null;
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_err) {
    // noop
  }
}

function getServerUrl(bridge) {
  return bridge?.server_url || bridge?.serverUrl || bridge?.visual_url || null;
}

function getWorkspaceId(bridge) {
  return bridge?.workspace_id || bridge?.workspaceId || null;
}

function httpRequest({ url, method = 'GET', headers = {}, timeoutMs = 800, body = null }) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const protocol = parsed.protocol === 'https:' ? https : http;
    const req = protocol.request(
      parsed,
      {
        method,
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ai-spec-auto-control-puller/1.0',
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ statusCode: res.statusCode, body: text });
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${text.slice(0, 200)}`));
          }
        });
      },
    );

    const timer = setTimeout(() => {
      req.destroy(new Error(`request timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.on('close', () => clearTimeout(timer));

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

/**
 * 拉取 pending 控制指令并落盘为 inbox 文件
 * @param {{ targetDir: string, timeoutMs?: number }} opts
 * @returns {Promise<{ pulled: number, written: number, transport: string, error?: string }>}
 */
async function pullPendingControls(opts = {}) {
  const targetDir = opts.targetDir || process.cwd();
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 800;

  const bridge = loadBridgeConfig(targetDir);
  if (!bridge || bridge.enabled === false) {
    return { pulled: 0, written: 0, transport: 'disabled' };
  }

  const transport = bridge.inbox_transport || bridge.inboxTransport || 'http-pull';
  if (transport === 'file-only' || transport === 'file-inbox') {
    return { pulled: 0, written: 0, transport };
  }

  const serverUrl = getServerUrl(bridge);
  const workspaceId = getWorkspaceId(bridge);
  if (!serverUrl || !workspaceId) {
    return { pulled: 0, written: 0, transport, error: 'missing server_url/workspace_id' };
  }

  const sinceFile = path.join(targetDir, INBOX_DIR_REL, '.last-pull.json');
  ensureDir(path.dirname(sinceFile));
  const since = safeReadJson(sinceFile)?.cursor || '';

  let endpoint;
  try {
    endpoint = new URL('/api/control/pending', serverUrl);
    endpoint.searchParams.set('workspace_id', workspaceId);
    if (since) endpoint.searchParams.set('since', since);
  } catch (err) {
    return { pulled: 0, written: 0, transport, error: err.message };
  }

  let response;
  try {
    response = await httpRequest({
      url: endpoint.toString(),
      method: 'GET',
      headers: bridge.connect_token ? { 'X-Connect-Token': bridge.connect_token } : {},
      timeoutMs,
    });
  } catch (err) {
    return { pulled: 0, written: 0, transport, error: err.message };
  }

  let parsed;
  try {
    parsed = JSON.parse(response.body);
  } catch (err) {
    return { pulled: 0, written: 0, transport, error: `invalid JSON response: ${err.message}` };
  }

  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  if (items.length === 0) {
    return { pulled: 0, written: 0, transport };
  }

  const inboxDir = path.join(targetDir, INBOX_DIR_REL);
  ensureDir(inboxDir);

  let written = 0;
  let cursor = since;
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const outboxId = item.outbox_id || item.id || `pull_${Date.now()}_${written}`;
    const fileName = `control-${String(outboxId).replace(/[^a-zA-Z0-9_-]/g, '_')}.json`;
    const target = path.join(inboxDir, fileName);
    try {
      fs.writeFileSync(target, `${JSON.stringify(item, null, 2)}\n`, 'utf-8');
      written += 1;
      if (item.created_at && (!cursor || item.created_at > cursor)) {
        cursor = item.created_at;
      }
    } catch (_err) {
      // 单个文件落盘失败不影响其他
    }
  }

  if (cursor && cursor !== since) {
    try {
      fs.writeFileSync(sinceFile, JSON.stringify({ cursor, updated_at: new Date().toISOString() }, null, 2), 'utf-8');
    } catch (_err) {
      // noop
    }
  }

  return { pulled: items.length, written, transport };
}

module.exports = {
  pullPendingControls,
};
