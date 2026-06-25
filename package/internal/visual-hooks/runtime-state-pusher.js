const fs = require('fs');
const path = require('path');

const { initVisualHooks } = require('./index');

const pendingVisualRuntimeStatePushes = new Set();

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function appendVisualPushTrace(targetDir, payload) {
  try {
    const tracePath = path.join(targetDir, '.ai-spec', 'internal', 'visual-push.jsonl');
    fs.mkdirSync(path.dirname(tracePath), { recursive: true });
    fs.appendFileSync(tracePath, `${JSON.stringify({
      at: new Date().toISOString(),
      ...payload,
    })}\n`, 'utf8');
  } catch {
    // ignore: visual push trace must never block the protocol flow
  }
}

async function pushVisualRuntimeStateSnapshotNow(targetDir) {
  const resolvedTargetDir = path.resolve(targetDir || '.');
  const currentRunPath = path.join(resolvedTargetDir, '.ai-spec', 'current-run.json');
  const currentRun = readJsonIfExists(currentRunPath);
  if (!currentRun?.run_id) {
    const result = { pushed: false, reason: 'missing-current-run' };
    appendVisualPushTrace(resolvedTargetDir, {
      result: result.reason,
      run_id: null,
      workspace_id: null,
      targetDir: resolvedTargetDir,
      config_source: null,
    });
    return result;
  }

  let hooks = null;
  try {
    hooks = initVisualHooks({ targetDir: resolvedTargetDir });
  } catch (error) {
    const result = {
      pushed: false,
      reason: 'hook-init-failed',
      error: error?.message || String(error),
    };
    appendVisualPushTrace(resolvedTargetDir, {
      result: result.reason,
      run_id: currentRun.run_id,
      workspace_id: currentRun.workspace_id || null,
      targetDir: resolvedTargetDir,
      config_source: null,
      error: result.error,
    });
    return result;
  }

  if (!hooks?.onRunStateChange) {
    const result = { pushed: false, reason: 'hooks-disabled' };
    appendVisualPushTrace(resolvedTargetDir, {
      result: result.reason,
      run_id: currentRun.run_id,
      workspace_id: currentRun.workspace_id || hooks?.config?.workspace_id || null,
      targetDir: resolvedTargetDir,
      config_source: hooks?.config?.config_source || null,
    });
    return result;
  }

  const response = await hooks.onRunStateChange({
    ...currentRun,
    workspace_id: currentRun.workspace_id || hooks.config?.workspace_id || path.basename(resolvedTargetDir),
  });

  const normalizedWorkspaceId =
    currentRun.workspace_id || hooks.config?.workspace_id || path.basename(resolvedTargetDir);
  const result = response?.ok === false
    ? {
        pushed: false,
        reason: 'request-failed',
        error: response.error || 'unknown push failure',
      }
    : {
        pushed: true,
        run_id: currentRun.run_id,
        workspace_id: normalizedWorkspaceId,
      };

  appendVisualPushTrace(resolvedTargetDir, {
    result: result.pushed ? 'pushed' : result.reason,
    run_id: currentRun.run_id,
    workspace_id: normalizedWorkspaceId,
    targetDir: resolvedTargetDir,
    config_source: hooks.config?.config_source || null,
    error: result.pushed ? null : result.error || null,
  });

  return result;
}

function pushVisualRuntimeStateSnapshot(targetDir) {
  const pushPromise = pushVisualRuntimeStateSnapshotNow(targetDir)
    .catch(() => undefined)
    .finally(() => {
      pendingVisualRuntimeStatePushes.delete(pushPromise);
    });
  pendingVisualRuntimeStatePushes.add(pushPromise);
  return pushPromise;
}

async function drainVisualRuntimeStatePushes() {
  if (pendingVisualRuntimeStatePushes.size === 0) {
    return;
  }
  await Promise.allSettled([...pendingVisualRuntimeStatePushes]);
}

module.exports = {
  pushVisualRuntimeStateSnapshot,
  pushVisualRuntimeStateSnapshotNow,
  drainVisualRuntimeStatePushes,
};
