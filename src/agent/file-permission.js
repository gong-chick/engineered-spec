/**
 * File Permission — 文件作用域权限校验
 *
 * 根据 AgentProfile 的 allowedFileScopes / deniedFileScopes 判断是否允许访问某文件。
 * 规则：deniedFileScopes 优先于 allowedFileScopes；使用 glob 匹配。
 */

// ============================================================
// globMatch — 简易 glob 匹配
// ============================================================

/**
 * 简易 glob 模式匹配（支持 ** / * / ?）
 * @param {string} pattern - glob 模式
 * @param {string} filePath - 文件路径
 * @returns {boolean}
 */
function globMatch(pattern, filePath) {
  // 规范化路径分隔符
  const normalizedPattern = pattern.replace(/\\/g, '/');
  const normalizedPath = filePath.replace(/\\/g, '/');

  // 转换 glob 为正则表达式
  let regexStr = normalizedPattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&') // 转义特殊字符
    .replace(/\*\*/g, '{{DOUBLE_STAR}}') // 临时替换 **
    .replace(/\*/g, '[^/]*') // * 匹配非斜杠字符
    .replace(/\?/g, '[^/]') // ? 匹配单个非斜杠字符
    .replace(/\{\{DOUBLE_STAR\}\}/g, '.*'); // ** 匹配任意路径

  // **/ 前缀应匹配零个或多个路径段（根文件也需要匹配）
  regexStr = regexStr.replace(/^\.\*\//, '(.*\\/)?');

  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(normalizedPath);
}

// ============================================================
// matchesAnyGlob — 匹配任一 glob 模式
// ============================================================

/**
 * 检查文件路径是否匹配 glob 模式列表中的任一模式
 * @param {string[]} patterns - glob 模式列表
 * @param {string} filePath - 文件路径
 * @returns {boolean}
 */
function matchesAnyGlob(patterns, filePath) {
  return patterns.some((pattern) => globMatch(pattern, filePath));
}

// ============================================================
// checkFilePermission — 文件权限校验
// ============================================================

/**
 * 检查 Agent 是否被允许访问指定文件
 * @param {Object} profile - AgentProfile
 * @param {string} filePath - 文件路径
 * @returns {{ allowed: boolean, reason: string }}
 */
function checkFilePermission(profile, filePath) {
  if (!profile || typeof profile !== 'object') {
    return { allowed: false, reason: 'profile 无效' };
  }

  if (!filePath || typeof filePath !== 'string') {
    return { allowed: false, reason: 'filePath 无效' };
  }

  const deniedFileScopes = profile.deniedFileScopes || [];
  const allowedFileScopes = profile.allowedFileScopes || [];

  // deniedFileScopes 优先级最高
  if (deniedFileScopes.length > 0 && matchesAnyGlob(deniedFileScopes, filePath)) {
    return { allowed: false, reason: `文件 ${filePath} 匹配 deniedFileScopes` };
  }

  // 空 allowedFileScopes 表示全部允许（除 denied 外）
  if (allowedFileScopes.length === 0) {
    return { allowed: true, reason: 'allowedFileScopes 为空，全部允许' };
  }

  // allowedFileScopes 非空时，必须匹配至少一个
  if (matchesAnyGlob(allowedFileScopes, filePath)) {
    return { allowed: true, reason: `文件 ${filePath} 匹配 allowedFileScopes` };
  }

  return { allowed: false, reason: `文件 ${filePath} 不匹配任何 allowedFileScopes` };
}

// ============================================================
// checkBatchFilePermission — 批量文件权限校验
// ============================================================

/**
 * 批量检查 Agent 是否被允许访问多个文件
 * @param {Object} profile - AgentProfile
 * @param {string[]} filePaths - 文件路径列表
 * @returns {{ results: Record<string, { allowed: boolean, reason: string }>, allAllowed: boolean }}
 */
function checkBatchFilePermission(profile, filePaths) {
  const results = {};
  let allAllowed = true;

  for (const filePath of filePaths) {
    results[filePath] = checkFilePermission(profile, filePath);
    if (!results[filePath].allowed) {
      allAllowed = false;
    }
  }

  return { results, allAllowed };
}

module.exports = {
  globMatch,
  matchesAnyGlob,
  checkFilePermission,
  checkBatchFilePermission,
};
