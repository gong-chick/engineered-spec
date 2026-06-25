/**
 * Visual Push Client
 * 
 * 功能：通过 HTTP/WebSocket 推送事件到 visual 服务
 * 特性：
 * - 超时控制
 * - 自动重试
 * - 优雅降级
 */

const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

/**
 * 创建推送客户端
 * @param {VisualConfig} config
 * @returns {PushClient}
 */
function createPushClient(config) {
  const {
    visual_url,
    workspace_id,
    target_dir,
    push_timeout_ms = 3000,
    retry_times = 1
  } = config;

  // 在 hook 上下文里 process.cwd() 通常就是项目根目录；带上以便 visual 自动落 Workspace.rootPath，
  // 让控制下行的文件兜底通道（.ai-spec/inbox/）能正确解析到本地路径。
  const rootPath = (() => {
    try {
      return fs.realpathSync(path.resolve(target_dir || process.cwd()));
    } catch (_err) {
      return null;
    }
  })();

  return {
    /**
     * 推送事件到 visual 服务
     * @param {PushEvent} event
     * @returns {Promise<void>}
     */
    async push(event) {
      let url;
      try {
        url = new URL('/api/internal/ingest/raw', visual_url);
      } catch (err) {
        throw new Error(`invalid visual_url: ${visual_url}`);
      }

      const protocol = url.protocol === 'https:' ? https : http;

      const payload = {
        sourceKind: 'hook-push',
        workspaceId: workspace_id,
        root_path: rootPath,
        rawEvents: [{
          sourceKind: 'hook-event',
          sourcePath: 'internal/visual-hooks',
          eventType: event.eventType,
          eventKey: `${event.runId}:${event.eventType}:${Date.now()}`,
          dedupeKey: generateDedupeKey(event),
          checksum: generateChecksum(event.payload),
          occurredAt: new Date().toISOString(),
          entityType: 'run',
          entityId: event.runId,
          payload: event.payload
        }]
      };

      let lastError = null;

      for (let attempt = 0; attempt <= retry_times; attempt++) {
        try {
          await sendRequest(protocol, url, payload, push_timeout_ms);
          return; // 成功，直接返回
        } catch (err) {
          lastError = err;
          if (attempt < retry_times) {
            console.warn(`[visual-hooks] push failed (attempt ${attempt + 1}/${retry_times + 1}), retrying...`);
            await sleep(500 * (attempt + 1)); // 指数退避
          }
        }
      }

      // 所有重试都失败
      throw lastError;
    }
  };
}

/**
 * 发送 HTTP 请求
 * @param {typeof http | typeof https} protocol
 * @param {URL} url
 * @param {object} payload
 * @param {number} timeoutMs
 * @returns {Promise<void>}
 */
function sendRequest(protocol, url, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      req.destroy();
      reject(new Error(`push timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    // 勿把 workspaceId 放进 X-Workspace-ID：Node 的 HTTP 头值必须是单字节字符，
    // 中文等非 ASCII 会抛 Invalid character in header content。ingest 已从 JSON body 读取 workspaceId。
    const req = protocol.request(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'ai-spec-auto-visual-hooks/1.0'
      }
    }, (res) => {
      clearTimeout(timeout);

      let body = '';
      res.on('data', chunk => body += chunk);

      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`push failed: ${res.statusCode} ${body}`));
        }
      });
    });

    req.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    req.write(JSON.stringify(payload));
    req.end();
  });
}

/**
 * 生成去重键
 * @param {PushEvent} event
 * @returns {string}
 */
function generateDedupeKey(event) {
  const content = `${event.eventType}|${event.runId}|${JSON.stringify(event.payload)}`;
  return simpleHash(content);
}

/**
 * 生成校验和
 * @param {object} payload
 * @returns {string}
 */
function generateChecksum(payload) {
  return simpleHash(JSON.stringify(payload));
}

/**
 * 简单哈希函数（用于去重和校验）
 * @param {string} str
 * @returns {string}
 */
function simpleHash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * 延迟函数
 * @param {number} ms
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  createPushClient
};
