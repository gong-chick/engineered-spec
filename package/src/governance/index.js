/**
 * Governance 模块 barrel 导出
 */

const rbacTypes = require('./rbac-types');
const rbac = require('./rbac');
const assetReview = require('./asset-review');
const auditLog = require('./audit-log');
const grayRelease = require('./gray-release');
const rollback = require('./rollback');
const policyTypes = require('./policy-types');
const securityPolicy = require('./security-policy');

module.exports = {
  // 类型与常量
  ...rbacTypes,
  // RBAC 权限模型
  ...rbac,
  // 资产审核工作流
  ...assetReview,
  // 审计日志
  ...auditLog,
  // 灰度发布
  ...grayRelease,
  // 版本回滚
  ...rollback,
  // 安全策略类型
  ...policyTypes,
  // 安全策略引擎
  ...securityPolicy,
};
