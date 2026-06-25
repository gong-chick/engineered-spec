/**
 * Visual Inbox Consumer
 *
 * 在 CLI 命令边界（protocol-step / -advance / -update / -status）以同步、超时短的方式
 * 扫描 .ai-spec/inbox/ 下的控制指令文件并应用到本地 runtime-state，再把结果
 * 通过 receipt-pusher 反向回报给 visual。
 *
 * 设计约束（见 plan）：
 * - 仅使用 Node 内置模块（fs / path / crypto / os），零 npm 依赖
 * - 所有失败必须静默降级，永不抛出阻断主流程
 * - 超时硬限（默认 ≤ 50ms），保证不影响命令启动时延
 * - 处理过的文件移入 .ai-spec/inbox/.processed/，带结果后缀
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const INBOX_DIR_REL = '.ai-spec/inbox';
const PROCESSED_SUBDIR = '.processed';
const APPLIED_SUBDIR = '.applied';
const FAILED_SUBDIR = '.failed';

const SUPPORTED_COMMANDS = new Set([
  'approve_gate',
  'reject_gate',
  'resume_run',
  'cancel_run',
]);

function safeReadJson(filePath) {
  try {
    const text = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(text);
  } catch (_err) {
    return null;
  }
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_err) {
    // noop
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
      return { source: file, data };
    }
  }
  return null;
}

function verifySignature(message, signature, secret) {
  if (!secret) {
    return true; // 未配置 token 视为本地受信任环境，跳过校验
  }
  if (!signature || typeof signature !== 'string') {
    return false;
  }
  try {
    const expected = crypto
      .createHmac('sha256', String(secret))
      .update(typeof message === 'string' ? message : JSON.stringify(message))
      .digest('hex');
    if (expected.length !== signature.length) {
      return false;
    }
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch (_err) {
    return false;
  }
}

function loadRuntimeState(targetDir) {
  try {
    const runtimeState = require('../../bin/runtime-state');
    return runtimeState;
  } catch (_err) {
    return null;
  }
}

/**
 * 切面式写入：当 Visual 侧审批被成功应用后，往项目根 .ai-spec/next-step.md
 * 追加一条人类可读的提示，供 IDE 里的 AI / 用户感知"已批准、请继续"。
 *
 * 设计原则：
 * - 纯 additive，失败 silent 吞，绝不影响主 apply 链路
 * - 只追加，不清空；保留审批历史
 * - 通过结构化 marker 方便 AGENTS.md / Cursor slash 读取
 */
function appendNextStepHint(targetDir, command, payload, snapshot) {
  try {
    const file = path.join(targetDir, '.ai-spec', 'next-step.md');
    ensureDir(path.dirname(file));
    const ts = new Date().toISOString();
    const gate = payload?.gate || snapshot?.pending_gate || 'unknown';
    const runId = payload?.run_id || snapshot?.run_id || 'unknown';
    const nextRole = snapshot?.current_role || payload?.next_role || 'unknown';
    const recommend =
      command === 'approve_gate' || command === 'resume_run'
        ? '请在 IDE (Cursor / Claude Code) 执行 `/spec-continue` 继续下一步开发。'
        : command === 'request_changes'
          ? '请补齐资产后重新提交审批。'
          : '请查看 visual 审批结果并在 IDE 按提示操作。';
    const block = [
      '',
      `## [${ts}] ${command} applied`,
      '',
      `- run_id: \`${runId}\``,
      `- gate: \`${gate}\``,
      `- next_role: \`${nextRole}\``,
      `- action: ${recommend}`,
      '',
      '<!-- visual-next-step:end -->',
      '',
    ].join('\n');

    const header = fs.existsSync(file)
      ? ''
      : [
          '# Visual 审批 → 下一步提示',
          '',
          '> 本文件由 `br-ai-spec` 的 visual-hooks 自动追加写入。',
          '> 每当 visual 侧审批（approve_gate / resume_run）被成功应用到本地',
          '> runtime-state 后，会在下方 append 一条记录。IDE 中的 AI 可读取',
          '> 该文件作为"继续开发"的信号。本地手动推进或清理可直接删除此文件。',
          '',
        ].join('\n');

    fs.appendFileSync(file, `${header}${block}`, 'utf-8');
  } catch (_err) {
    // silent — 这条提示是增值能力，失败绝不影响主链路
  }
}

/**
 * 切面式写入 gate-signal.json：为 IDE 侧 AI 轮询提供"审批已到达"的结构化信号。
 * 所有失败静默吞掉，绝不影响 apply 主链路。
 */
function emitGateSignal(targetDir, command, payload, snapshot) {
  try {
    const normalizedDecision = String(payload?.decision || '').trim().toLowerCase();
    const decision =
      command === 'approve_gate'
        ? 'approved'
        : command === 'resume_run'
          ? 'resumed'
          : command === 'reject_gate'
            ? normalizedDecision === 'request_changes' || normalizedDecision === 'request-changes'
              ? 'request_changes'
              : 'rejected'
            : null;
    if (!decision) return;
    const { writeGateSignal } = require('./gate-signal');
    writeGateSignal({
      targetDir,
      runId: payload?.run_id || snapshot?.run_id || null,
      gate: payload?.gate || snapshot?.pending_gate || 'unknown',
      decision,
      reason: payload?.reason || payload?.decision || null,
      actorId: payload?.requested_by || payload?.actor_id || null,
    });
  } catch (_err) {
    // silent — 切面能力，任何异常都不允许冒泡影响 receipt 结果
  }
}

function applyControl(targetDir, command, payload) {
  const runtimeState = loadRuntimeState(targetDir);
  if (!runtimeState) {
    return { result: 'rejected', reason: 'runtime-state module unavailable' };
  }

  try {
    if (command === 'approve_gate') {
      const result = runtimeState.approveRunState({
        target: targetDir,
        gate: payload?.gate || null,
        runId: payload?.run_id || null,
        nextRole: payload?.next_role || null,
        status: payload?.status || 'running',
      });
      const snapshot = {
        status: result?.state?.status,
        current_role: result?.state?.current_role,
        run_id: result?.state?.run_id,
      };
      appendNextStepHint(targetDir, 'approve_gate', payload, snapshot);
      emitGateSignal(targetDir, 'approve_gate', payload, snapshot);
      return { result: 'applied', snapshot };
    }

    if (command === 'reject_gate') {
      const state = safeReadJson(path.join(targetDir, '.ai-spec', 'current-run.json'));
      if (!state?.run_id) {
        return { result: 'conflict', reason: 'current run-state unavailable' };
      }
      const activeGate = state.pending_gate || null;
      const requestedGate = payload?.gate || activeGate;
      if (!activeGate) {
        return { result: 'conflict', reason: 'No pending approval gate found' };
      }
      if (requestedGate && activeGate !== requestedGate) {
        return {
          result: 'conflict',
          reason: `Pending gate mismatch: current is "${activeGate}", requested "${requestedGate}"`,
        };
      }
      const decision = String(payload?.decision || '').trim().toLowerCase();
      const isRequestChanges =
        decision === 'request_changes' || decision === 'request-changes';
      const reason = payload?.reason || payload?.decision || 'rejected by visual gate';
      const result = runtimeState.gateBlockedRunState({
        target: targetDir,
        runId: payload?.run_id || state.run_id,
        gate: activeGate,
        pendingGate: activeGate,
        status: 'waiting-approval',
        fromRole: state.current_role || null,
        toRole: state.current_role || null,
        blockedByRole: state.current_role || state.gate_context?.blocked_by_role || null,
        resumeToRole: state.gate_context?.resume_to_role || null,
        requiredUserAction: isRequestChanges
          ? `请先补齐资产或说明后重新提交审批。${reason ? ` 当前要求：${reason}` : ''}`.trim()
          : state.gate_context?.required_user_action || '当前门禁已被拒绝，请修正后重新请求审批。',
        blockedReason: isRequestChanges
          ? `gate request_changes: ${reason}`
          : `gate rejected: ${reason}`,
        message: isRequestChanges
          ? `gate request_changes: ${reason}`
          : `gate rejected: ${reason}`,
        eventType: isRequestChanges ? 'gate-request-changes' : 'gate-rejected',
      });
      const rejectSnapshot = {
        status: result?.state?.status,
        current_role: result?.state?.current_role,
        pending_gate: result?.state?.pending_gate,
        run_id: result?.state?.run_id,
      };
      if (isRequestChanges) {
        appendNextStepHint(targetDir, 'request_changes', payload, rejectSnapshot);
      }
      emitGateSignal(targetDir, 'reject_gate', payload, rejectSnapshot);
      return {
        result: 'rejected',
        reason,
        snapshot: rejectSnapshot,
      };
    }

    if (command === 'resume_run') {
      const result = runtimeState.approveRunState({
        target: targetDir,
        gate: payload?.gate || null,
        runId: payload?.run_id || null,
        nextRole: payload?.next_role || payload?.resume_to_role || null,
        status: 'running',
      });
      const snapshot = {
        status: result?.state?.status,
        current_role: result?.state?.current_role,
        run_id: result?.state?.run_id,
      };
      appendNextStepHint(targetDir, 'resume_run', payload, snapshot);
      emitGateSignal(targetDir, 'resume_run', payload, snapshot);
      return { result: 'applied', snapshot };
    }

    if (command === 'cancel_run') {
      // cancel_run 走轻量路径：只生成回执，不强制改写状态以避免与协议推进竞争。
      return {
        result: 'applied',
        snapshot: { decision: 'cancel_requested', reason: payload?.reason || null },
      };
    }

    return { result: 'rejected', reason: `unsupported command: ${command}` };
  } catch (err) {
    const msg = String(err?.message || err);
    if (/No pending approval gate/.test(msg) || /Pending gate mismatch/.test(msg)) {
      return { result: 'conflict', reason: msg };
    }
    return { result: 'rejected', reason: msg };
  }
}

function moveFile(srcPath, destDir) {
  ensureDir(destDir);
  const base = path.basename(srcPath);
  const dest = path.join(destDir, `${Date.now()}_${base}`);
  try {
    fs.renameSync(srcPath, dest);
    return dest;
  } catch (_err) {
    try {
      fs.copyFileSync(srcPath, dest);
      fs.unlinkSync(srcPath);
      return dest;
    } catch (_err2) {
      return null;
    }
  }
}

function listInboxFiles(inboxDir) {
  if (!fs.existsSync(inboxDir)) return [];
  let entries;
  try {
    entries = fs.readdirSync(inboxDir, { withFileTypes: true });
  } catch (_err) {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && /^control-.*\.json$/.test(entry.name))
    .map((entry) => path.join(inboxDir, entry.name))
    .sort();
}

/**
 * 消费 inbox 控制指令并产生 receipt 列表
 *
 * 完整生命周期（按顺序，每步都是 best-effort 静默失败）：
 *   1. 可选 HTTP pull：从 visual 拉 pending 控制指令落盘到 inbox
 *   2. 扫描 inbox 文件并应用到本地 runtime-state
 *   3. 可选 HTTP push：把 receipts 回灌给 visual
 *
 * @param {{ targetDir: string, timeoutMs?: number, secret?: string, skipPull?: boolean, skipPush?: boolean }} opts
 * @returns {Promise<{ processed: number, receipts: Array<object>, pulled?: number }>}
 */
async function consumeInbox(opts = {}) {
  const targetDir = opts.targetDir || process.cwd();
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : 50;
  const startedAt = Date.now();

  const bridge = loadBridgeConfig(targetDir);
  const secret =
    opts.secret ||
    bridge?.data?.control_secret ||
    bridge?.data?.controlSecret ||
    null;

  let pulled = 0;
  if (!opts.skipPull && bridge?.data?.enabled !== false) {
    try {
      const { pullPendingControls } = require('./control-puller');
      const pullResult = await pullPendingControls({
        targetDir,
        timeoutMs: Math.max(50, Math.floor(timeoutMs * 4)),
      });
      pulled = pullResult?.written || 0;
    } catch (_err) {
      // pull 阶段失败不影响后续 inbox 消费
    }
  }

  const inboxDir = path.join(targetDir, INBOX_DIR_REL);
  if (!fs.existsSync(inboxDir)) {
    return { processed: 0, receipts: [], pulled };
  }

  const files = listInboxFiles(inboxDir);
  if (files.length === 0) {
    return { processed: 0, receipts: [] };
  }

  const receipts = [];
  let processed = 0;
  const seenOutboxIds = new Set();

  for (const file of files) {
    if (Date.now() - startedAt > timeoutMs) {
      break; // 超时优雅退出，剩余文件留待下一次命令边界处理
    }

    const envelope = safeReadJson(file);
    if (!envelope || typeof envelope !== 'object') {
      moveFile(file, path.join(inboxDir, FAILED_SUBDIR));
      continue;
    }

    const {
      outbox_id: outboxId,
      command,
      payload,
      signature,
    } = envelope;
    const receiptKey = outboxId || path.basename(file);

    if (seenOutboxIds.has(receiptKey)) {
      moveFile(file, path.join(inboxDir, PROCESSED_SUBDIR));
      continue;
    }
    seenOutboxIds.add(receiptKey);

    let receipt = {
      eventType: 'control.receipt',
      outbox_id: receiptKey,
      command: command || null,
      result: 'rejected',
      reason: null,
      applied_state_snapshot: null,
      received_at: new Date().toISOString(),
    };

    if (!command || !SUPPORTED_COMMANDS.has(command)) {
      receipt.reason = `unsupported command: ${command}`;
      moveFile(file, path.join(inboxDir, FAILED_SUBDIR));
      receipts.push(receipt);
      processed += 1;
      continue;
    }

    const signed = verifySignature(
      { outbox_id: outboxId, command, payload },
      signature,
      secret,
    );
    if (!signed) {
      receipt.reason = 'signature verification failed';
      moveFile(file, path.join(inboxDir, FAILED_SUBDIR));
      receipts.push(receipt);
      processed += 1;
      continue;
    }

    const applyResult = applyControl(targetDir, command, payload || {});
    receipt.result = applyResult.result;
    receipt.reason = applyResult.reason || null;
    receipt.applied_state_snapshot = applyResult.snapshot || null;

    const destDir = applyResult.result === 'applied'
      ? path.join(inboxDir, APPLIED_SUBDIR)
      : path.join(inboxDir, PROCESSED_SUBDIR);
    moveFile(file, destDir);

    receipts.push(receipt);
    processed += 1;
  }

  if (!opts.skipPush && receipts.length > 0 && bridge?.data?.enabled !== false) {
    try {
      const { pushReceipts } = require('./receipt-pusher');
      await pushReceipts({
        targetDir,
        receipts,
        timeoutMs: Math.max(200, Math.floor(timeoutMs * 8)),
      });
    } catch (_err) {
      // 推送失败不影响本地 inbox 已正常处理的事实
    }
  }

  return { processed, receipts, pulled };
}

module.exports = {
  consumeInbox,
  INBOX_DIR_REL,
};
