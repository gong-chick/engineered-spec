/**
 * P3.1 RBAC 常量与枚举
 *
 * 定义组织角色、团队角色、权限作用域、默认角色权限映射
 */

// ============================================================
// 组织级角色
// ============================================================

const ORG_ROLES = Object.freeze({
  ORG_ADMIN: 'org-admin',
  ORG_MEMBER: 'org-member',
});

const VALID_ORG_ROLES = new Set(Object.values(ORG_ROLES));

// ============================================================
// 团队级角色
// ============================================================

const TEAM_ROLES = Object.freeze({
  TEAM_LEAD: 'team-lead',
  DEVELOPER: 'developer',
  REVIEWER: 'reviewer',
  VIEWER: 'viewer',
});

const VALID_TEAM_ROLES = new Set(Object.values(TEAM_ROLES));

// ============================================================
// 权限动作
// ============================================================

const PERMISSION_ACTIONS = Object.freeze({
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  APPROVE: 'approve',
  PUBLISH: 'publish',
  ROLLBACK: 'rollback',
});

const VALID_PERMISSION_ACTIONS = new Set(Object.values(PERMISSION_ACTIONS));

// ============================================================
// 权限资源
// ============================================================

const PERMISSION_RESOURCES = Object.freeze({
  ASSET: 'asset',
  CONFIG: 'config',
  HOOK: 'hook',
  MEMORY: 'memory',
  AUDIT: 'audit',
  POLICY: 'policy',
  RELEASE: 'release',
});

const VALID_PERMISSION_RESOURCES = new Set(Object.values(PERMISSION_RESOURCES));

// ============================================================
// 权限作用域
// ============================================================

const PERMISSION_SCOPES = Object.freeze({
  ORG: 'org',
  TEAM: 'team',
  PROJECT: 'project',
});

const VALID_PERMISSION_SCOPES = new Set(Object.values(PERMISSION_SCOPES));

// ============================================================
// 预定义角色权限映射
// ============================================================

const DEFAULT_ROLE_PERMISSIONS = Object.freeze({
  'org-admin': {
    permissions: [
      { action: 'create', resource: 'asset' },
      { action: 'read', resource: 'asset' },
      { action: 'update', resource: 'asset' },
      { action: 'delete', resource: 'asset' },
      { action: 'approve', resource: 'asset' },
      { action: 'publish', resource: 'asset' },
      { action: 'rollback', resource: 'asset' },
      { action: 'create', resource: 'config' },
      { action: 'read', resource: 'config' },
      { action: 'update', resource: 'config' },
      { action: 'delete', resource: 'config' },
      { action: 'create', resource: 'hook' },
      { action: 'read', resource: 'hook' },
      { action: 'update', resource: 'hook' },
      { action: 'delete', resource: 'hook' },
      { action: 'read', resource: 'memory' },
      { action: 'update', resource: 'memory' },
      { action: 'read', resource: 'audit' },
      { action: 'create', resource: 'policy' },
      { action: 'read', resource: 'policy' },
      { action: 'update', resource: 'policy' },
      { action: 'delete', resource: 'policy' },
      { action: 'create', resource: 'release' },
      { action: 'read', resource: 'release' },
      { action: 'rollback', resource: 'release' },
    ],
    inherits: [],
  },
  'team-lead': {
    permissions: [
      { action: 'create', resource: 'asset' },
      { action: 'read', resource: 'asset' },
      { action: 'update', resource: 'asset' },
      { action: 'approve', resource: 'asset' },
      { action: 'publish', resource: 'asset' },
      { action: 'read', resource: 'config' },
      { action: 'update', resource: 'config' },
      { action: 'read', resource: 'hook' },
      { action: 'update', resource: 'hook' },
      { action: 'read', resource: 'memory' },
      { action: 'update', resource: 'memory' },
      { action: 'read', resource: 'audit' },
      { action: 'read', resource: 'policy' },
      { action: 'read', resource: 'release' },
    ],
    inherits: ['developer'],
  },
  developer: {
    permissions: [
      { action: 'create', resource: 'asset' },
      { action: 'read', resource: 'asset' },
      { action: 'update', resource: 'asset' },
      { action: 'read', resource: 'config' },
      { action: 'read', resource: 'hook' },
      { action: 'read', resource: 'memory' },
    ],
    inherits: [],
  },
  reviewer: {
    permissions: [
      { action: 'read', resource: 'asset' },
      { action: 'approve', resource: 'asset' },
      { action: 'read', resource: 'config' },
      { action: 'read', resource: 'hook' },
      { action: 'read', resource: 'audit' },
    ],
    inherits: [],
  },
  viewer: {
    permissions: [
      { action: 'read', resource: 'asset' },
      { action: 'read', resource: 'config' },
    ],
    inherits: [],
  },
});

module.exports = {
  ORG_ROLES,
  VALID_ORG_ROLES,
  TEAM_ROLES,
  VALID_TEAM_ROLES,
  PERMISSION_ACTIONS,
  VALID_PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  VALID_PERMISSION_RESOURCES,
  PERMISSION_SCOPES,
  VALID_PERMISSION_SCOPES,
  DEFAULT_ROLE_PERMISSIONS,
};
