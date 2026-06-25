/**
 * P3.1 RBAC 权限模型
 *
 * 角色定义、权限点管理、权限校验、项目级例外
 */

const {
  VALID_ORG_ROLES,
  VALID_TEAM_ROLES,
  VALID_PERMISSION_ACTIONS,
  VALID_PERMISSION_RESOURCES,
  VALID_PERMISSION_SCOPES,
  DEFAULT_ROLE_PERMISSIONS,
} = require('./rbac-types');

// ============================================================
// 角色管理
// ============================================================

/**
 * 创建角色
 * @param {object} overrides
 * @returns {object}
 */
function createRole(overrides = {}) {
  const now = new Date().toISOString();
  return {
    roleId: overrides.roleId || '',
    name: overrides.name || '',
    scope: overrides.scope || 'project',
    permissions: overrides.permissions || [],
    inherits: overrides.inherits || [],
    createdAt: overrides.createdAt || now,
    ...filterUndefined(overrides, ['roleId', 'name', 'scope', 'permissions', 'inherits', 'createdAt']),
  };
}

/**
 * 校验角色
 * @param {object} role
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateRole(role) {
  const errors = [];

  if (!role || typeof role !== 'object') {
    return { ok: false, errors: ['角色必须是对象'] };
  }

  if (!role.roleId || typeof role.roleId !== 'string') {
    errors.push('roleId 必填且为字符串');
  }

  if (!role.name || typeof role.name !== 'string') {
    errors.push('name 必填且为字符串');
  }

  if (!VALID_PERMISSION_SCOPES.has(role.scope)) {
    errors.push(`scope 必须是 ${[...VALID_PERMISSION_SCOPES].join(', ')} 之一`);
  }

  if (!Array.isArray(role.permissions)) {
    errors.push('permissions 必须是数组');
  } else {
    role.permissions.forEach((perm, idx) => {
      const permErrors = validatePermission(perm);
      if (!permErrors.ok) {
        permErrors.errors.forEach(e => errors.push(`permissions[${idx}]: ${e}`));
      }
    });
  }

  if (!Array.isArray(role.inherits)) {
    errors.push('inherits 必须是数组');
  }

  return { ok: errors.length === 0, errors };
}

// ============================================================
// 权限点管理
// ============================================================

/**
 * 创建权限点
 * @param {object} overrides
 * @returns {object}
 */
function createPermission(overrides = {}) {
  return {
    action: overrides.action || 'read',
    resource: overrides.resource || 'asset',
    conditions: overrides.conditions || null,
  };
}

/**
 * 校验权限点
 * @param {object} perm
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validatePermission(perm) {
  const errors = [];

  if (!perm || typeof perm !== 'object') {
    return { ok: false, errors: ['权限点必须是对象'] };
  }

  if (!VALID_PERMISSION_ACTIONS.has(perm.action)) {
    errors.push(`action 必须是 ${[...VALID_PERMISSION_ACTIONS].join(', ')} 之一`);
  }

  if (!VALID_PERMISSION_RESOURCES.has(perm.resource)) {
    errors.push(`resource 必须是 ${[...VALID_PERMISSION_RESOURCES].join(', ')} 之一`);
  }

  return { ok: errors.length === 0, errors };
}

// ============================================================
// 权限校验
// ============================================================

/**
 * 检查权限
 * @param {object} params
 * @param {object[]} params.roles - 用户拥有的角色列表
 * @param {string} params.action - 目标动作
 * @param {string} params.resource - 目标资源
 * @param {object[]} [params.exceptions] - 项目级例外
 * @returns {{ allowed: boolean, reason: string, matchedRoles: string[] }}
 */
function checkPermission({ roles, action, resource, exceptions = [] }) {
  // 1. 收集所有角色的权限（含继承链）
  const allPermissions = new Map(); // key: "action:resource", value: Set<roleId>
  const visited = new Set();

  for (const role of roles) {
    collectPermissions(role, roles, allPermissions, visited);
  }

  // 2. 应用项目级例外
  for (const exception of exceptions) {
    if (exception.grants) {
      for (const grant of exception.grants) {
        const key = `${grant.action}:${grant.resource}`;
        if (!allPermissions.has(key)) {
          allPermissions.set(key, new Set());
        }
        allPermissions.get(key).add(`exception:${exception.projectId}`);
      }
    }
    if (exception.denies) {
      for (const deny of exception.denies) {
        const key = `${deny.action}:${deny.resource}`;
        allPermissions.delete(key);
      }
    }
  }

  // 3. 检查目标权限
  const targetKey = `${action}:${resource}`;
  const matched = allPermissions.get(targetKey);
  const allowed = !!matched && matched.size > 0;
  const matchedRoles = allowed ? [...matched] : [];

  return {
    allowed,
    reason: allowed
      ? `权限匹配: ${matchedRoles.join(', ')}`
      : `无权限: ${action}:${resource}`,
    matchedRoles,
  };
}

/**
 * 递归收集角色权限（含继承链）
 * @param {object} role
 * @param {object[]} allRoles
 * @param {Map} permissionMap
 * @param {Set} visited
 */
function collectPermissions(role, allRoles, permissionMap, visited) {
  if (visited.has(role.roleId)) return;
  visited.add(role.roleId);

  // 添加自身权限
  for (const perm of role.permissions) {
    const key = `${perm.action}:${perm.resource}`;
    if (!permissionMap.has(key)) {
      permissionMap.set(key, new Set());
    }
    permissionMap.get(key).add(role.roleId);
  }

  // 处理继承
  if (role.inherits && role.inherits.length > 0) {
    for (const inheritRoleId of role.inherits) {
      // 先查默认角色
      const defaultRoleDef = DEFAULT_ROLE_PERMISSIONS[inheritRoleId];
      if (defaultRoleDef) {
        const inheritedRole = createRole({
          roleId: inheritRoleId,
          name: inheritRoleId,
          scope: role.scope,
          permissions: defaultRoleDef.permissions,
          inherits: defaultRoleDef.inherits,
        });
        collectPermissions(inheritedRole, allRoles, permissionMap, visited);
      }

      // 再查传入的角色列表
      const inheritedRole = allRoles.find(r => r.roleId === inheritRoleId);
      if (inheritedRole) {
        collectPermissions(inheritedRole, allRoles, permissionMap, visited);
      }
    }
  }
}

/**
 * 授予权限到角色
 * @param {object} role
 * @param {object} permission
 * @returns {object} 新角色对象
 */
function grantPermission(role, permission) {
  const permErrors = validatePermission(permission);
  if (!permErrors.ok) {
    throw new Error(`无效权限点: ${permErrors.errors.join(', ')}`);
  }

  const exists = role.permissions.some(
    p => p.action === permission.action && p.resource === permission.resource
  );

  if (exists) return role;

  return {
    ...role,
    permissions: [...role.permissions, permission],
  };
}

/**
 * 撤销角色权限
 * @param {object} role
 * @param {object} permission
 * @returns {object} 新角色对象
 */
function revokePermission(role, permission) {
  return {
    ...role,
    permissions: role.permissions.filter(
      p => !(p.action === permission.action && p.resource === permission.resource)
    ),
  };
}

// ============================================================
// 项目级例外
// ============================================================

/**
 * 创建项目级权限例外
 * @param {object} overrides
 * @returns {object}
 */
function createProjectException(overrides = {}) {
  const now = new Date().toISOString();
  return {
    projectId: overrides.projectId || '',
    roleId: overrides.roleId || '',
    grants: overrides.grants || [],
    denies: overrides.denies || [],
    reason: overrides.reason || '',
    createdAt: overrides.createdAt || now,
  };
}

/**
 * 校验项目级例外
 * @param {object} exception
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateProjectException(exception) {
  const errors = [];

  if (!exception || typeof exception !== 'object') {
    return { ok: false, errors: ['项目例外必须是对象'] };
  }

  if (!exception.projectId || typeof exception.projectId !== 'string') {
    errors.push('projectId 必填且为字符串');
  }

  if (!exception.roleId || typeof exception.roleId !== 'string') {
    errors.push('roleId 必填且为字符串');
  }

  if (!Array.isArray(exception.grants)) {
    errors.push('grants 必须是数组');
  } else {
    exception.grants.forEach((perm, idx) => {
      const permErrors = validatePermission(perm);
      if (!permErrors.ok) {
        permErrors.errors.forEach(e => errors.push(`grants[${idx}]: ${e}`));
      }
    });
  }

  if (!Array.isArray(exception.denies)) {
    errors.push('denies 必须是数组');
  } else {
    exception.denies.forEach((perm, idx) => {
      const permErrors = validatePermission(perm);
      if (!permErrors.ok) {
        permErrors.errors.forEach(e => errors.push(`denies[${idx}]: ${e}`));
      }
    });
  }

  if (!exception.reason || typeof exception.reason !== 'string') {
    errors.push('reason 必填且为字符串');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * 从默认角色权限构建角色对象
 * @param {string} roleId
 * @returns {object|null}
 */
function getDefaultRole(roleId) {
  const def = DEFAULT_ROLE_PERMISSIONS[roleId];
  if (!def) return null;

  return createRole({
    roleId,
    name: roleId,
    scope: 'org',
    permissions: def.permissions,
    inherits: def.inherits,
  });
}

/**
 * 列出所有预定义角色 ID
 * @returns {string[]}
 */
function listDefaultRoles() {
  return Object.keys(DEFAULT_ROLE_PERMISSIONS);
}

// ============================================================
// 辅助函数
// ============================================================

function filterUndefined(obj, knownKeys) {
  const result = {};
  for (const key of Object.keys(obj)) {
    if (!knownKeys.includes(key)) {
      result[key] = obj[key];
    }
  }
  return result;
}

module.exports = {
  createRole,
  validateRole,
  createPermission,
  validatePermission,
  checkPermission,
  grantPermission,
  revokePermission,
  createProjectException,
  validateProjectException,
  getDefaultRole,
  listDefaultRoles,
};
