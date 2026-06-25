/**
 * Tool Permission — 工具权限校验
 *
 * 根据 AgentProfile 的 allowedTools / deniedTools 判断是否允许使用某工具。
 * 规则：deniedTools 优先于 allowedTools；空 allowedTools 表示全部允许。
 */

// ============================================================
// checkToolPermission — 工具权限校验
// ============================================================

/**
 * 检查 Agent 是否被允许使用指定工具
 * @param {Object} profile - AgentProfile
 * @param {string} toolName - 工具名称
 * @returns {{ allowed: boolean, reason: string }}
 */
function checkToolPermission(profile, toolName) {
  if (!profile || typeof profile !== 'object') {
    return { allowed: false, reason: 'profile 无效' };
  }

  if (!toolName || typeof toolName !== 'string') {
    return { allowed: false, reason: 'toolName 无效' };
  }

  const deniedTools = profile.deniedTools || [];
  const allowedTools = profile.allowedTools || [];

  // deniedTools 优先级最高 — 精确匹配
  if (deniedTools.includes(toolName)) {
    return { allowed: false, reason: `工具 ${toolName} 在 deniedTools 列表中` };
  }

  // 空 allowedTools 表示全部允许（除 deniedTools 中的）
  if (allowedTools.length === 0) {
    return { allowed: true, reason: 'allowedTools 为空，全部允许' };
  }

  // allowedTools 非空时，必须在列表中
  if (allowedTools.includes(toolName)) {
    return { allowed: true, reason: `工具 ${toolName} 在 allowedTools 列表中` };
  }

  return { allowed: false, reason: `工具 ${toolName} 不在 allowedTools 列表中` };
}

// ============================================================
// checkBatchToolPermission — 批量工具权限校验
// ============================================================

/**
 * 批量检查 Agent 是否被允许使用多个工具
 * @param {Object} profile - AgentProfile
 * @param {string[]} toolNames - 工具名称列表
 * @returns {{ results: Record<string, { allowed: boolean, reason: string }>, allAllowed: boolean }}
 */
function checkBatchToolPermission(profile, toolNames) {
  const results = {};
  let allAllowed = true;

  for (const toolName of toolNames) {
    results[toolName] = checkToolPermission(profile, toolName);
    if (!results[toolName].allowed) {
      allAllowed = false;
    }
  }

  return { results, allAllowed };
}

// ============================================================
// getAllowedTools — 获取有效允许工具列表
// ============================================================

/**
 * 获取 Agent 的有效允许工具列表
 * @param {Object} profile - AgentProfile
 * @param {string[]} allAvailableTools - 所有可用工具列表
 * @returns {string[]}
 */
function getAllowedTools(profile, allAvailableTools = []) {
  if (!profile) return [];

  const deniedTools = profile.deniedTools || [];
  const allowedTools = profile.allowedTools || [];

  // 空 allowedTools = 全部允许，排除 denied
  if (allowedTools.length === 0) {
    return allAvailableTools.filter((t) => !deniedTools.includes(t));
  }

  // 非空 allowedTools，取交集后排除 denied
  return allowedTools.filter((t) => !deniedTools.includes(t));
}

module.exports = {
  checkToolPermission,
  checkBatchToolPermission,
  getAllowedTools,
};
