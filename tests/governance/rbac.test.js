/**
 * P3.1 RBAC 权限模型测试
 */

const assert = require('assert');

const {
  ORG_ROLES,
  TEAM_ROLES,
  PERMISSION_ACTIONS,
  PERMISSION_RESOURCES,
  PERMISSION_SCOPES,
  DEFAULT_ROLE_PERMISSIONS,
  VALID_ORG_ROLES,
  VALID_TEAM_ROLES,
  VALID_PERMISSION_ACTIONS,
  VALID_PERMISSION_RESOURCES,
  VALID_PERMISSION_SCOPES,
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
} = require('../../src/governance');

// ============================================================
// 常量与枚举测试
// ============================================================

async function testEnumsExist() {
  console.log('  TC01: 枚举常量存在且冻结');
  assert.ok(ORG_ROLES);
  assert.ok(TEAM_ROLES);
  assert.ok(PERMISSION_ACTIONS);
  assert.ok(PERMISSION_RESOURCES);
  assert.ok(PERMISSION_SCOPES);
  assert.ok(DEFAULT_ROLE_PERMISSIONS);

  assert.strictEqual(typeof ORG_ROLES.ORG_ADMIN, 'string');
  assert.strictEqual(typeof TEAM_ROLES.TEAM_LEAD, 'string');
  assert.strictEqual(typeof PERMISSION_ACTIONS.CREATE, 'string');
  assert.strictEqual(typeof PERMISSION_RESOURCES.ASSET, 'string');
  assert.strictEqual(typeof PERMISSION_SCOPES.ORG, 'string');

  // 验证冻结
  assert.strictEqual(Object.isFrozen(ORG_ROLES), true);
  assert.strictEqual(Object.isFrozen(TEAM_ROLES), true);
  assert.strictEqual(Object.isFrozen(PERMISSION_ACTIONS), true);
}

async function testValidSets() {
  console.log('  TC02: VALID_* Set 包含所有枚举值');
  assert.strictEqual(VALID_ORG_ROLES.size, 2);
  assert.strictEqual(VALID_TEAM_ROLES.size, 4);
  assert.strictEqual(VALID_PERMISSION_ACTIONS.size, 7);
  assert.strictEqual(VALID_PERMISSION_RESOURCES.size, 7);
  assert.strictEqual(VALID_PERMISSION_SCOPES.size, 3);

  assert.ok(VALID_ORG_ROLES.has('org-admin'));
  assert.ok(VALID_TEAM_ROLES.has('developer'));
  assert.ok(VALID_PERMISSION_ACTIONS.has('approve'));
  assert.ok(VALID_PERMISSION_RESOURCES.has('audit'));
  assert.ok(VALID_PERMISSION_SCOPES.has('project'));
}

// ============================================================
// 角色管理测试
// ============================================================

async function testCreateRoleDefaults() {
  console.log('  TC03: createRole 默认值正确');
  const role = createRole();
  assert.strictEqual(role.roleId, '');
  assert.strictEqual(role.name, '');
  assert.strictEqual(role.scope, 'project');
  assert.deepStrictEqual(role.permissions, []);
  assert.deepStrictEqual(role.inherits, []);
  assert.ok(role.createdAt);
}

async function testCreateRoleOverride() {
  console.log('  TC04: createRole 支持字段覆盖');
  const role = createRole({
    roleId: 'admin',
    name: '管理员',
    scope: 'org',
    permissions: [{ action: 'read', resource: 'asset' }],
  });
  assert.strictEqual(role.roleId, 'admin');
  assert.strictEqual(role.name, '管理员');
  assert.strictEqual(role.scope, 'org');
  assert.strictEqual(role.permissions.length, 1);
}

async function testValidateRoleValid() {
  console.log('  TC05: validateRole 有效角色通过');
  const role = createRole({
    roleId: 'dev',
    name: '开发者',
    scope: 'team',
    permissions: [{ action: 'read', resource: 'asset' }],
  });
  const result = validateRole(role);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.errors.length, 0);
}

async function testValidateRoleInvalid() {
  console.log('  TC06: validateRole 无效角色报错');
  const result = validateRole({});
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some(e => e.includes('roleId')));
  assert.ok(result.errors.some(e => e.includes('name')));
}

async function testValidateRoleInvalidScope() {
  console.log('  TC07: validateRole 无效 scope 报错');
  const role = createRole({ roleId: 'x', name: 'x', scope: 'invalid' });
  const result = validateRole(role);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('scope')));
}

async function testValidateRoleInvalidPermission() {
  console.log('  TC08: validateRole 无效权限点报错');
  const role = createRole({
    roleId: 'x',
    name: 'x',
    permissions: [{ action: 'invalid', resource: 'asset' }],
  });
  const result = validateRole(role);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some(e => e.includes('permissions[0]')));
}

// ============================================================
// 权限点测试
// ============================================================

async function testCreatePermission() {
  console.log('  TC09: createPermission 默认值');
  const perm = createPermission();
  assert.strictEqual(perm.action, 'read');
  assert.strictEqual(perm.resource, 'asset');
  assert.strictEqual(perm.conditions, null);
}

async function testValidatePermissionValid() {
  console.log('  TC10: validatePermission 有效权限通过');
  const result = validatePermission({ action: 'approve', resource: 'asset' });
  assert.strictEqual(result.ok, true);
}

async function testValidatePermissionInvalid() {
  console.log('  TC11: validatePermission 无效权限报错');
  const result = validatePermission({ action: 'invalid', resource: 'invalid' });
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length >= 2);
}

// ============================================================
// 权限校验测试
// ============================================================

async function testCheckPermissionAllowed() {
  console.log('  TC12: checkPermission 有权限时允许');
  const role = createRole({
    roleId: 'dev',
    name: '开发者',
    scope: 'team',
    permissions: [
      { action: 'read', resource: 'asset' },
      { action: 'create', resource: 'asset' },
    ],
  });

  const result = checkPermission({
    roles: [role],
    action: 'read',
    resource: 'asset',
  });

  assert.strictEqual(result.allowed, true);
  assert.ok(result.matchedRoles.includes('dev'));
}

async function testCheckPermissionDenied() {
  console.log('  TC13: checkPermission 无权限时拒绝');
  const role = createRole({
    roleId: 'viewer',
    name: '查看者',
    scope: 'team',
    permissions: [{ action: 'read', resource: 'asset' }],
  });

  const result = checkPermission({
    roles: [role],
    action: 'delete',
    resource: 'asset',
  });

  assert.strictEqual(result.allowed, false);
  assert.ok(result.reason.includes('无权限'));
}

async function testCheckPermissionWithInheritance() {
  console.log('  TC14: checkPermission 继承链权限');
  const teamLead = getDefaultRole('team-lead');
  assert.ok(teamLead);

  const result = checkPermission({
    roles: [teamLead],
    action: 'read',
    resource: 'memory',
  });

  assert.strictEqual(result.allowed, true);
}

async function testCheckPermissionWithExceptions() {
  console.log('  TC15: checkPermission 项目例外生效');
  const role = createRole({
    roleId: 'dev',
    name: '开发者',
    scope: 'team',
    permissions: [{ action: 'read', resource: 'asset' }],
  });

  // 授予额外权限
  const result1 = checkPermission({
    roles: [role],
    action: 'publish',
    resource: 'asset',
    exceptions: [
      { projectId: 'proj-1', grants: [{ action: 'publish', resource: 'asset' }], denies: [] },
    ],
  });
  assert.strictEqual(result1.allowed, true);

  // 撤销已有权限
  const result2 = checkPermission({
    roles: [role],
    action: 'read',
    resource: 'asset',
    exceptions: [
      { projectId: 'proj-1', grants: [], denies: [{ action: 'read', resource: 'asset' }] },
    ],
  });
  assert.strictEqual(result2.allowed, false);
}

async function testCheckPermissionMultipleRoles() {
  console.log('  TC16: checkPermission 多角色合并');
  const role1 = createRole({
    roleId: 'dev',
    permissions: [{ action: 'read', resource: 'asset' }],
  });
  const role2 = createRole({
    roleId: 'reviewer',
    permissions: [{ action: 'approve', resource: 'asset' }],
  });

  const result = checkPermission({
    roles: [role1, role2],
    action: 'approve',
    resource: 'asset',
  });

  assert.strictEqual(result.allowed, true);
  assert.ok(result.matchedRoles.includes('reviewer'));
}

// ============================================================
// 授权/撤权测试
// ============================================================

async function testGrantPermission() {
  console.log('  TC17: grantPermission 授予权限');
  const role = createRole({ roleId: 'dev', permissions: [] });
  const updated = grantPermission(role, { action: 'read', resource: 'asset' });
  assert.strictEqual(updated.permissions.length, 1);
  assert.strictEqual(updated.permissions[0].action, 'read');
  // 原角色不变
  assert.strictEqual(role.permissions.length, 0);
}

async function testGrantPermissionIdempotent() {
  console.log('  TC18: grantPermission 幂等');
  const role = createRole({
    roleId: 'dev',
    permissions: [{ action: 'read', resource: 'asset' }],
  });
  const updated = grantPermission(role, { action: 'read', resource: 'asset' });
  assert.strictEqual(updated.permissions.length, 1);
}

async function testRevokePermission() {
  console.log('  TC19: revokePermission 撤销权限');
  const role = createRole({
    roleId: 'dev',
    permissions: [
      { action: 'read', resource: 'asset' },
      { action: 'create', resource: 'asset' },
    ],
  });
  const updated = revokePermission(role, { action: 'read', resource: 'asset' });
  assert.strictEqual(updated.permissions.length, 1);
  assert.strictEqual(updated.permissions[0].action, 'create');
}

async function testRevokePermissionNonexistent() {
  console.log('  TC20: revokePermission 撤销不存在的权限安全');
  const role = createRole({
    roleId: 'dev',
    permissions: [{ action: 'read', resource: 'asset' }],
  });
  const updated = revokePermission(role, { action: 'delete', resource: 'asset' });
  assert.strictEqual(updated.permissions.length, 1);
}

// ============================================================
// 项目例外测试
// ============================================================

async function testCreateProjectException() {
  console.log('  TC21: createProjectException 默认值');
  const exc = createProjectException();
  assert.strictEqual(exc.projectId, '');
  assert.strictEqual(exc.roleId, '');
  assert.deepStrictEqual(exc.grants, []);
  assert.deepStrictEqual(exc.denies, []);
  assert.strictEqual(exc.reason, '');
}

async function testValidateProjectExceptionValid() {
  console.log('  TC22: validateProjectException 有效例外通过');
  const exc = createProjectException({
    projectId: 'proj-1',
    roleId: 'dev',
    grants: [{ action: 'publish', resource: 'asset' }],
    denies: [],
    reason: '特殊需求',
  });
  const result = validateProjectException(exc);
  assert.strictEqual(result.ok, true);
}

async function testValidateProjectExceptionInvalid() {
  console.log('  TC23: validateProjectException 无效例外报错');
  const result = validateProjectException({});
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length >= 3);
}

// ============================================================
// 默认角色测试
// ============================================================

async function testGetDefaultRole() {
  console.log('  TC24: getDefaultRole 获取预定义角色');
  const admin = getDefaultRole('org-admin');
  assert.ok(admin);
  assert.strictEqual(admin.roleId, 'org-admin');
  assert.ok(admin.permissions.length > 0);

  const viewer = getDefaultRole('viewer');
  assert.ok(viewer);
  assert.ok(viewer.permissions.length > 0);
}

async function testGetDefaultRoleInvalid() {
  console.log('  TC25: getDefaultRole 不存在的角色返回 null');
  const result = getDefaultRole('nonexistent');
  assert.strictEqual(result, null);
}

async function testListDefaultRoles() {
  console.log('  TC26: listDefaultRoles 列出所有预定义角色');
  const roles = listDefaultRoles();
  assert.ok(roles.length >= 5);
  assert.ok(roles.includes('org-admin'));
  assert.ok(roles.includes('team-lead'));
  assert.ok(roles.includes('developer'));
  assert.ok(roles.includes('reviewer'));
  assert.ok(roles.includes('viewer'));
}

// ============================================================
// 默认角色权限校验
// ============================================================

async function testAllDefaultRolesValid() {
  console.log('  TC27: 所有预定义角色通过校验');
  const roles = listDefaultRoles();
  for (const roleId of roles) {
    const role = getDefaultRole(roleId);
    assert.ok(role, `角色 ${roleId} 不存在`);
    const result = validateRole(role);
    assert.strictEqual(result.ok, true, `角色 ${roleId} 校验失败: ${result.errors.join(', ')}`);
  }
}

async function testDefaultRolePermissionsCorrect() {
  console.log('  TC28: 预定义角色权限符合预期');
  const admin = getDefaultRole('org-admin');
  const checkAdmin = checkPermission({
    roles: [admin],
    action: 'rollback',
    resource: 'asset',
  });
  assert.strictEqual(checkAdmin.allowed, true);

  const viewer = getDefaultRole('viewer');
  const checkViewer = checkPermission({
    roles: [viewer],
    action: 'delete',
    resource: 'asset',
  });
  assert.strictEqual(checkViewer.allowed, false);
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== rbac.test.js ===');

  const tests = [
    testEnumsExist,
    testValidSets,
    testCreateRoleDefaults,
    testCreateRoleOverride,
    testValidateRoleValid,
    testValidateRoleInvalid,
    testValidateRoleInvalidScope,
    testValidateRoleInvalidPermission,
    testCreatePermission,
    testValidatePermissionValid,
    testValidatePermissionInvalid,
    testCheckPermissionAllowed,
    testCheckPermissionDenied,
    testCheckPermissionWithInheritance,
    testCheckPermissionWithExceptions,
    testCheckPermissionMultipleRoles,
    testGrantPermission,
    testGrantPermissionIdempotent,
    testRevokePermission,
    testRevokePermissionNonexistent,
    testCreateProjectException,
    testValidateProjectExceptionValid,
    testValidateProjectExceptionInvalid,
    testGetDefaultRole,
    testGetDefaultRoleInvalid,
    testListDefaultRoles,
    testAllDefaultRolesValid,
    testDefaultRolePermissionsCorrect,
  ];

  let passed = 0;
  let failed = 0;

  for (const testFn of tests) {
    try {
      await testFn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${testFn.name} — ${err.message}`);
    }
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败, 共 ${tests.length} 个`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
