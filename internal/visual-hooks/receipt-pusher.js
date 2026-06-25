/**
 * Visual Receipt Pusher
 *
 * 把 inbox-consumer 的处理结果（applied / rejected / conflict）作为
 * `control.receipt` ingest 事件回灌给 visual。
 *
 * 设计约束：
 * - 仅使用 Node 内置（http/https/fs/path/crypto），零依赖
 * - 严格短超时，任何错误必须静默
 * - 不读取或修改本地协议状态，仅做出站
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');

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

function getServerUrl(bridge) {
  return bridge?.server_url || bridge?.serverUrl || bridge?.visual_url || null;
}

function getWorkspaceId(bridge) {
  return bridge?.workspace_id || bridge?.workspaceId || null;
}

function shortHash(value) {
  return crypto
    .createHash('sha256')
    .update(typeof value === 'string' ? value : JSON.stringify(value))
    .digest('hex')
    .slice(0, 16);
}

function sendRequest({ url, payload, headers, timeoutMs }) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      reject(err);
      return;
    }
    const protocol = parsed.protocol === 'https:' ? https : http;
    const req = protocol.request(parsed, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ai-spec-auto-receipt-pusher/1.0',
        ...headers,
      },
    }, (res) => {
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
    });
    const timer = setTimeout(() => {
      req.destroy(new Error(`request timeout after ${timeoutMs}ms`));
    }, timeoutMs);
    req.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    req.on('close', () => clearTimeout(timer));
    req.write(JSON.stringify(payload));
    req.end();
  });
}

/**
 * 推送一组 receipts 给 visual
 * @param {{ targetDir?: string, receipts: Array<object>, timeoutMs?: number }} opts
 * @returns {Promise<{ pushed: number, error?: string }>}
 */
async function pushReceipts(opts = {}) {
  const targetDir = opts.targetDir || process.cwd();
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 1500;
  const receipts = Array.isArray(opts.receipts) ? opts.receipts : [];
  if (receipts.length === 0) {
    return { pushed: 0 };
  }

  const bridge = loadBridgeConfig(targetDir);
  if (!bridge || bridge.enabled === false) {
    return { pushed: 0, error: 'bridge disabled' };
  }
  const serverUrl = getServerUrl(bridge);
  const workspaceId = getWorkspaceId(bridge);
  if (!serverUrl || !workspaceId) {
    return { pushed: 0, error: 'missing server_url/workspace_id' };
  }

  let endpoint;
  try {
    endpoint = new URL('/api/internal/ingest/raw', serverUrl).toString();
  } catch (err) {
    return { pushed: 0, error: `invalid url: ${err.message}` };
  }

  const now = new Date().toISOString();
  const payload = {
    sourceKind: 'control-receipt',
    workspaceId,
    rawEvents: receipts.map((receipt, index) => {
      const dedupeBase = `${receipt.outbox_id || ''}|${receipt.result || ''}|${receipt.received_at || ''}`;
      return {
        sourceKind: 'control-receipt',
        sourcePath: 'internal/visual-hooks/receipt-pusher',
        eventType: 'control.receipt',
        eventKey: `${receipt.outbox_id || `r_${index}`}:control.receipt:${Date.now()}`,
        dedupeKey: shortHash(dedupeBase),
        checksum: shortHash(receipt),
        occurredAt: receipt.received_at || now,
        entityType: 'control_outbox',
        entityId: String(receipt.outbox_id || ''),
        payload: {
          outbox_id: receipt.outbox_id || null,
          command: receipt.command || null,
          result: receipt.result || 'unknown',
          reason: receipt.reason || null,
          applied_state_snapshot: receipt.applied_state_snapshot || null,
          received_at: receipt.received_at || now,
        },
      };
    }),
  };

  try {
    // workspaceId 只在 JSON body 中传递；不要写入 X-Workspace-ID（非 ASCII 目录名会导致 Node 抛错）。
    await sendRequest({
      url: endpoint,
      payload,
      headers: {
        ...(bridge.connect_token ? { 'X-Connect-Token': bridge.connect_token } : {}),
      },
      timeoutMs,
    });
    return { pushed: receipts.length };
  } catch (err) {
    return { pushed: 0, error: err.message };
  }
}

module.exports = {
  pushReceipts,
};
