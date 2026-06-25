/**
 * Visual Hooks - 切面式数据推送入口
 * 
 * 功能：在 ai-spec-auto 协议推进的关键节点推送数据到 visual 服务
 * 设计原则：
 * - 零侵入：不修改现有协议逻辑
 * - 优雅降级：visual 不可用时自动降级，不影响主流程
 * - 配置驱动：通过 .ai-spec/visual-config.json 控制启用与否
 */

const { loadVisualConfig } = require('./config-loader');
const { createPushClient } = require('./push-client');

let visualHooks = null;
let initError = null;

/**
 * 初始化 visual hooks
 * @returns {VisualHooks | null} hooks 对象，如果未启用则返回 null
 */
function initVisualHooks(options = {}) {
  // 避免重复初始化
  const targetDir = options.targetDir ? require('path').resolve(options.targetDir) : null;
  if (visualHooks !== null && (!targetDir || visualHooks.config.target_dir === targetDir)) {
    return visualHooks;
  }

  try {
    const config = loadVisualConfig({ targetDir });
    
    if (!config?.enabled || !config?.visual_url) {
      console.warn('[visual-hooks] disabled or not configured');
      visualHooks = null;
      return null;
    }

    console.warn('[visual-hooks] initializing with config:', {
      visual_url: config.visual_url,
      workspace_id: config.workspace_id,
      push_mode: config.push_mode
    });

    const client = createPushClient(config);

    visualHooks = {
      /**
       * Hook: run 启动时
       * 触发点: protocol-step 命令入口
       */
      onRunStart: async (runId, workspaceId, input) => {
        try {
          await client.push({
            eventType: 'run.started',
            runId,
            workspaceId,
            payload: {
              run_id: runId,
              workspace_id: workspaceId,
              input,
              started_at: new Date().toISOString()
            }
          });
          console.warn(`[visual-hooks] onRunStart pushed: ${runId}`);
          return {
            ok: true,
            eventType: 'run.started',
            runId,
            workspaceId,
          };
        } catch (err) {
          console.warn('[visual-hooks] onRunStart failed:', err.message);
          return {
            ok: false,
            eventType: 'run.started',
            runId,
            workspaceId,
            error: err.message,
          };
        }
      },

      /**
       * Hook: run 状态变更时
       * 触发点: expert-executor 执行完专家后
       */
      onRunStateChange: async (runState) => {
        try {
          await client.push({
            eventType: 'run.state_changed',
            runId: runState.run_id,
            workspaceId: runState.workspace_id,
            payload: runState
          });
          console.warn(`[visual-hooks] onRunStateChange pushed: ${runState.run_id}`);
          return {
            ok: true,
            eventType: 'run.state_changed',
            runId: runState.run_id,
            workspaceId: runState.workspace_id,
          };
        } catch (err) {
          console.warn('[visual-hooks] onRunStateChange failed:', err.message);
          return {
            ok: false,
            eventType: 'run.state_changed',
            runId: runState.run_id,
            workspaceId: runState.workspace_id,
            error: err.message,
          };
        }
      },

      /**
       * Hook: 归档完成时
       * 触发点: archive-change 完成归档后
       */
      onArchiveComplete: async (archiveResult) => {
        try {
          await client.push({
            eventType: 'run.archived',
            runId: archiveResult.run_id,
            workspaceId: archiveResult.workspace_id,
            payload: {
              ...archiveResult,
              archived_at: new Date().toISOString()
            }
          });
          console.warn(`[visual-hooks] onArchiveComplete pushed: ${archiveResult.run_id}`);
          return {
            ok: true,
            eventType: 'run.archived',
            runId: archiveResult.run_id,
            workspaceId: archiveResult.workspace_id,
          };
        } catch (err) {
          console.warn('[visual-hooks] onArchiveComplete failed:', err.message);
          return {
            ok: false,
            eventType: 'run.archived',
            runId: archiveResult.run_id,
            workspaceId: archiveResult.workspace_id,
            error: err.message,
          };
        }
      },

      /**
       * 配置信息（只读）
       */
      config: {
        visual_url: config.visual_url,
        workspace_id: config.workspace_id,
        enabled: config.enabled,
        target_dir: config.target_dir,
        config_source: config.config_source || null,
      }
    };

    return visualHooks;
  } catch (err) {
    console.warn('[visual-hooks] initialization failed:', err.message);
    initError = err;
    visualHooks = null;
    return null;
  }
}

/**
 * 获取当前 hooks 实例（不触发初始化）
 * @returns {VisualHooks | null}
 */
function getVisualHooks() {
  return visualHooks;
}

/**
 * 获取初始化错误（用于调试）
 * @returns {Error | null}
 */
function getInitError() {
  return initError;
}

/**
 * 重置 hooks（用于测试）
 */
function resetVisualHooks() {
  visualHooks = null;
  initError = null;
}

module.exports = {
  initVisualHooks,
  getVisualHooks,
  getInitError,
  resetVisualHooks
};
