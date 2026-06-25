/**
 * Visual Gate Signal（切面能力，绝不影响主链路）
 *
 * 用途：当 Visual 侧审批指令在 inbox-consumer 里被成功应用后，额外写一个
 *      轻量的 `.ai-spec/gate-signal.json`，供 IDE 中的 AI（Cursor / Claude Code）
 *      通过规则 / skill 轮询该文件实现"审批后原对话自动继续"。
 *
 * 设计约束：
 * - 纯 Node 内置模块（fs / path / os），零 npm 依赖
 * - 所有 IO 失败必须静默降级，只写 .ai-spec/logs/gate-signal.log，绝不抛
 * - 原子写：先写 .tmp，再 rename，避免读侧读到半写文件
 * - 不与 runtime-state / inbox-consumer 的任何返回值耦合
 *
 * 文件契约（schema_version=1）：
 * {
 *   "schema_version": 1,
 *   "run_id": "run_2026xxxx",
 *   "gate": "before-implementation",
 *   "decision": "approved" | "rejected" | "resumed" | "request_changes",
 *   "reason": "...optional...",
 *   "actor_id": "...optional...",
 *   "ts_ms": 1714000000000,
 *   "ts_iso": "2026-04-23T..."
 * }
 *
 * AI 读侧判定：signal.run_id === currentRunId 且 signal.gate === currentGate
 * 且 signal.ts_ms > waitStartedAt 时才视为命中。错配一律忽略，避免陈旧信号误触发。
 */

const fs = require('fs');
const path = require('path');

const SIGNAL_REL = '.ai-spec/gate-signal.json';
const LOG_REL = '.ai-spec/logs/gate-signal.log';
const SCHEMA_VERSION = 1;

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_err) {
    // noop
  }
}

function logError(targetDir, phase, err) {
  try {
    const logPath = path.join(targetDir, LOG_REL);
    ensureDir(path.dirname(logPath));
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      phase,
      message: String(err?.message || err),
    });
    fs.appendFileSync(logPath, `${line}\n`, 'utf-8');
  } catch (_err) {
    // 真正的最后一道防线失败也必须吞掉
  }
}

/**
 * 写入 gate-signal.json（原子）。任何失败只写日志，绝不抛。
 *
 * @param {object} opts
 * @param {string} opts.targetDir 项目根
 * @param {string} opts.runId
 * @param {string} opts.gate
 * @param {'approved'|'rejected'|'resumed'|'request_changes'} opts.decision
 * @param {string} [opts.reason]
 * @param {string} [opts.actorId]
 * @returns {{ ok: boolean, path?: string }}
 */
function writeGateSignal(opts) {
  const targetDir = opts && opts.targetDir;
  if (!targetDir || typeof targetDir !== 'string') {
    return { ok: false };
  }
  const runId = opts.runId;
  const gate = opts.gate;
  const decision = opts.decision;
  if (!runId || !gate || !decision) {
    logError(targetDir, 'write.validate', new Error('missing runId/gate/decision'));
    return { ok: false };
  }

  const now = Date.now();
  const payload = {
    schema_version: SCHEMA_VERSION,
    run_id: String(runId),
    gate: String(gate),
    decision: String(decision),
    reason: opts.reason ? String(opts.reason) : null,
    actor_id: opts.actorId ? String(opts.actorId) : null,
    ts_ms: now,
    ts_iso: new Date(now).toISOString(),
  };

  const target = path.join(targetDir, SIGNAL_REL);
  const tmp = `${target}.tmp-${process.pid}-${now}`;
  try {
    ensureDir(path.dirname(target));
    fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
    try {
      fs.renameSync(tmp, target);
    } catch (renameErr) {
      try {
        fs.copyFileSync(tmp, target);
        fs.unlinkSync(tmp);
      } catch (copyErr) {
        logError(targetDir, 'write.rename', renameErr);
        logError(targetDir, 'write.copy', copyErr);
        return { ok: false };
      }
    }
    return { ok: true, path: target };
  } catch (err) {
    logError(targetDir, 'write.writeFile', err);
    try {
      if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
    } catch (_cleanupErr) {
      // ignore
    }
    return { ok: false };
  }
}

/**
 * 读取 gate-signal.json（供排障或 skill 端本地验证用）。
 * 损坏 / 不存在 → 返回 null，不抛。
 */
function readGateSignal(targetDir) {
  if (!targetDir) return null;
  const target = path.join(targetDir, SIGNAL_REL);
  try {
    const text = fs.readFileSync(target, 'utf-8');
    const data = JSON.parse(text);
    if (data && typeof data === 'object' && data.schema_version === SCHEMA_VERSION) {
      return data;
    }
    return null;
  } catch (_err) {
    return null;
  }
}

module.exports = {
  writeGateSignal,
  readGateSignal,
  SIGNAL_REL,
  SCHEMA_VERSION,
};
