const fs = require('fs');
const path = require('path');
const { writeJson } = require('../run/run-store');

const SPEC_STATUSES = ['draft', 'ready', 'implementing', 'testing', 'reviewing', 'done', 'blocked'];

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^\w一-鿿]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'unnamed';
}

function generateSpecId(requirement) {
  const slug = slugify(requirement);
  const shortHash = Date.now().toString(36).slice(-6);
  return `${slug}-${shortHash}`;
}

function buildRequirementMd(specId, requirement, now) {
  return [
    `# 需求描述`,
    '',
    `| 字段 | 值 |`,
    `|------|-----|`,
    `| specId | ${specId} |`,
    `| 创建时间 | ${now} |`,
    `| 状态 | draft |`,
    '',
    `## 原始需求`,
    '',
    requirement || '（待补充）',
    '',
    `## 需求范围`,
    '',
    '（待补充）',
    '',
    `## 约束与假设`,
    '',
    '（待补充）',
  ].join('\n');
}

function buildSpecMd(specId, requirement, now) {
  return [
    `# 技术规格`,
    '',
    `| 字段 | 值 |`,
    `|------|-----|`,
    `| specId | ${specId} |`,
    `| 创建时间 | ${now} |`,
    `| 状态 | draft |`,
    '',
    `## 功能描述`,
    '',
    requirement || '（待补充）',
    '',
    `## 技术方案`,
    '',
    '（待补充）',
    '',
    `## 接口设计`,
    '',
    '（待补充）',
    '',
    `## 数据结构`,
    '',
    '（待补充）',
    '',
    `## 影响范围`,
    '',
    '（待补充）',
  ].join('\n');
}

function buildTestPlanMd(specId, now) {
  return [
    `# 测试计划`,
    '',
    `| 字段 | 值 |`,
    `|------|-----|`,
    `| specId | ${specId} |`,
    `| 创建时间 | ${now} |`,
    '',
    `## 测试策略`,
    '',
    '（待补充）',
    '',
    `## 测试用例`,
    '',
    '| 编号 | 场景 | 输入 | 预期结果 | 状态 |',
    '|------|------|------|----------|------|',
    '| TC01 | （待补充） | - | - | 待执行 |',
    '',
    `## 测试命令`,
    '',
    '（待补充）',
  ].join('\n');
}

function buildDodMd(specId, now) {
  return [
    `# Definition of Done`,
    '',
    `| 字段 | 值 |`,
    `|------|-----|`,
    `| specId | ${specId} |`,
    `| 创建时间 | ${now} |`,
    '',
    `## 完成标准`,
    '',
    '| 编号 | 标准 | 状态 |',
    '|------|------|------|',
    '| DoD-01 | 代码实现完成 | 待验证 |',
    '| DoD-02 | 单元测试通过 | 待验证 |',
    '| DoD-03 | 代码审查通过 | 待验证 |',
    '| DoD-04 | 无安全漏洞 | 待验证 |',
    '| DoD-05 | 文档已更新 | 待验证 |',
    '',
    `## 禁止事项`,
    '',
    '- 不允许伪造测试结果',
    '- 不允许跳过测试',
    '- 不允许绕过 Hook',
  ].join('\n');
}

function buildReviewChecklistMd(specId, now) {
  return [
    `# Review Checklist`,
    '',
    `| 字段 | 值 |`,
    `|------|-----|`,
    `| specId | ${specId} |`,
    `| 创建时间 | ${now} |`,
    '',
    `## 代码质量`,
    '',
    '- [ ] 代码可读性良好',
    '- [ ] 函数职责单一',
    '- [ ] 无重复代码',
    '- [ ] 错误处理完善',
    '',
    `## 架构合规`,
    '',
    '- [ ] 符合项目目录结构',
    '- [ ] 模块边界清晰',
    '- [ ] 无循环依赖',
    '',
    `## 安全检查`,
    '',
    '- [ ] 无硬编码密钥',
    '- [ ] 输入已验证',
    '- [ ] 无注入风险',
    '',
    `## 测试覆盖`,
    '',
    '- [ ] 核心逻辑有测试',
    '- [ ] 边界场景已覆盖',
    '- [ ] 测试结果真实',
  ].join('\n');
}

class SpecWriter {
  /**
   * 生成 Spec 目录结构和模板文件
   * @param {string} rootDir 项目根目录
   * @param {object} options
   * @param {string} options.requirement 需求描述
   * @param {string} [options.specId] 自定义 specId
   * @param {string} [options.now] 时间戳
   * @returns {{ specId: string, specDir: string, files: string[] }}
   */
  write(rootDir, options = {}) {
    const now = options.now || new Date().toISOString();
    const specId = options.specId || generateSpecId(options.requirement);
    const specDir = path.join(rootDir, '.ai-spec', 'specs', specId);

    if (!fs.existsSync(specDir)) {
      fs.mkdirSync(specDir, { recursive: true });
    }

    const files = [];

    const requirementPath = path.join(specDir, 'requirement.md');
    if (!fs.existsSync(requirementPath)) {
      fs.writeFileSync(requirementPath, buildRequirementMd(specId, options.requirement, now), 'utf8');
      files.push('requirement.md');
    }

    const specPath = path.join(specDir, 'spec.md');
    if (!fs.existsSync(specPath)) {
      fs.writeFileSync(specPath, buildSpecMd(specId, options.requirement, now), 'utf8');
      files.push('spec.md');
    }

    const testPlanPath = path.join(specDir, 'test-plan.md');
    if (!fs.existsSync(testPlanPath)) {
      fs.writeFileSync(testPlanPath, buildTestPlanMd(specId, now), 'utf8');
      files.push('test-plan.md');
    }

    const dodPath = path.join(specDir, 'dod.md');
    if (!fs.existsSync(dodPath)) {
      fs.writeFileSync(dodPath, buildDodMd(specId, now), 'utf8');
      files.push('dod.md');
    }

    const reviewPath = path.join(specDir, 'review-checklist.md');
    if (!fs.existsSync(reviewPath)) {
      fs.writeFileSync(reviewPath, buildReviewChecklistMd(specId, now), 'utf8');
      files.push('review-checklist.md');
    }

    // 更新 specs/index.json
    this.updateIndex(rootDir, specId, {
      title: options.requirement || '未命名需求',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    });

    return { specId, specDir, files };
  }

  /**
   * 更新 specs/index.json 索引
   */
  updateIndex(rootDir, specId, meta) {
    const indexPath = path.join(rootDir, '.ai-spec', 'specs', 'index.json');
    let index = { specs: [] };
    if (fs.existsSync(indexPath)) {
      try {
        index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
      } catch (_e) {
        index = { specs: [] };
      }
    }

    const existing = index.specs.find((s) => s.specId === specId);
    if (!existing) {
      index.specs.push({
        specId,
        title: meta.title,
        status: meta.status,
        createdAt: meta.createdAt,
        updatedAt: meta.updatedAt,
      });
    } else {
      existing.status = meta.status || existing.status;
      existing.updatedAt = meta.updatedAt || new Date().toISOString();
    }

    writeJson(indexPath, index);
  }

  /**
   * 列出所有 Spec
   */
  list(rootDir) {
    const indexPath = path.join(rootDir, '.ai-spec', 'specs', 'index.json');
    if (!fs.existsSync(indexPath)) return { specs: [] };
    try {
      return JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    } catch (_e) {
      return { specs: [] };
    }
  }

  /**
   * 获取 Spec 状态
   */
  getStatus(rootDir, specId) {
    const specDir = path.join(rootDir, '.ai-spec', 'specs', specId);
    if (!fs.existsSync(specDir)) return null;

    const index = this.list(rootDir);
    const meta = index.specs.find((s) => s.specId === specId);

    const files = [];
    for (const name of ['requirement.md', 'spec.md', 'test-plan.md', 'dod.md', 'review-checklist.md']) {
      if (fs.existsSync(path.join(specDir, name))) {
        files.push(name);
      }
    }

    return {
      specId,
      meta: meta || { specId, status: 'unknown' },
      files,
      specDir,
    };
  }
}

module.exports = {
  SpecWriter,
  generateSpecId,
  SPEC_STATUSES,
};
