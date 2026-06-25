const fs = require('fs');
const path = require('path');
const { ensureDir } = require('../../project/json-utils');
const { SYNC_ACTIONS, PROFILES } = require('../ide-types');
const { IDEAdapter, createAdapterOutput } = require('./adapter-protocol');

function buildClaudeEntryContent() {
  return [
    '# ai-spec-auto Claude Code 入口',
    '',
    '你是当前项目的 AI 开发协作者。项目规范由 `ai-spec-auto` 管理。',
    '',
    '## 必读索引',
    '',
    '1. `.agents/registry/ide-registry.json`',
    '2. `.agents/registry.index.json`',
    '3. `.ai-spec/context-index.json`',
    '4. `.ai-spec/ai-spec.lock.json`',
    '',
    '## 原则',
    '',
    '- 先读索引，再读资产。',
    '- 先确认任务阶段，再进入实现。',
    '- Vue / React 前端项目优先读取前端资产。',
    '- 不要泄露源码、路径、密钥。',
    '- 所有提示和错误输出必须使用中文。',
  ].join('\n');
}

function buildClaudeCommandContent(commandName, profile) {
  const profileLabel = profile === PROFILES.REACT ? 'React' : profile === PROFILES.VUE ? 'Vue' : '前端';

  if (commandName === 'spec-start') {
    return [
      `# /spec-start`,
      '',
      '请按 `ai-spec-auto` 规范启动一个新需求。',
      '',
      '执行前先读取：',
      '',
      '1. `.agents/registry/ide-registry.json`',
      '2. `.agents/registry.index.json`',
      '3. `.ai-spec/context-index.json`',
      '4. `.ai-spec/ai-spec.lock.json`',
      '',
      '要求：',
      '',
      '- 先确认需求范围。',
      `- 再判断 ${profileLabel} 技术栈。`,
      '- 只读取必要 Rule / Skill。',
      '- 不要直接修改业务代码，除非已经进入实现阶段。',
      '- 所有输出使用中文。',
    ].join('\n');
  }

  if (commandName === 'spec-update') {
    return [
      `# /spec-update`,
      '',
      '请按 `ai-spec-auto` 规范补充或修正当前需求。',
      '',
      '执行前先读取：',
      '',
      '1. `.ai-spec/current-run.json`（如果有）',
      '2. `.ai-spec/project.json`',
      '3. `.agents/registry/ide-registry.json`',
      '',
      '要求：',
      '- 先确认当前 run 状态再补充。',
      '- 补充内容须与原有需求上下文一致。',
      '- 所有输出使用中文。',
    ].join('\n');
  }

  if (commandName === 'spec-status') {
    return [
      `# /spec-status`,
      '',
      '查看当前 `ai-spec-auto` 运行状态。',
      '',
      '读取 `.ai-spec/current-run.json`，输出当前阶段、已完成的步骤、待处理的步骤。',
      '',
      '所有输出使用中文。',
    ].join('\n');
  }

  if (commandName === 'spec-implement') {
    return [
      '# /spec-implement',
      '',
      '按 Spec 实现代码。',
      '',
      '执行前先读取：',
      '',
      '1. `.ai-spec/specs/<specId>/spec.md`',
      '2. `.ai-spec/specs/<specId>/test-plan.md`',
      '3. `.ai-spec/specs/<specId>/dod.md`',
      '4. `.agents/registry.index.json`',
      '',
      '要求：',
      '- 严格按 Spec 实现，不擅自扩展范围。',
      '- 实现完成后运行测试。',
      '- 测试通过后更新 Spec 状态为 testing。',
      '- 所有输出使用中文。',
    ].join('\n');
  }

  if (commandName === 'spec-review') {
    return [
      '# /spec-review',
      '',
      '对当前 Spec 的实现进行代码审查。',
      '',
      '执行前先读取：',
      '',
      '1. `.ai-spec/specs/<specId>/spec.md`',
      '2. `.ai-spec/specs/<specId>/dod.md`',
      '3. `.ai-spec/specs/<specId>/review-checklist.md`',
      '',
      '要求：',
      '- 检查代码是否符合 Spec 要求。',
      '- 检查是否满足 DoD 标准。',
      '- 输出审查结论表格。',
      '- 所有输出使用中文。',
    ].join('\n');
  }

  if (commandName === 'spec-repair') {
    return [
      '# /spec-repair',
      '',
      '修复测试失败或审查不通过的问题。',
      '',
      '执行前先读取：',
      '',
      '1. `.ai-spec/specs/<specId>/spec.md`',
      '2. `.ai-spec/specs/<specId>/test-plan.md`',
      '3. 最近的 Evidence Report',
      '',
      '要求：',
      '- 最大修复次数为 2 次。',
      '- 超过次数必须中断并记录原因。',
      '- 修复记录必须进入 Evidence。',
      '- 所有输出使用中文。',
    ].join('\n');
  }

  return '';
}

function buildAgentContent(agentName) {
  if (agentName === 'architect-reviewer') {
    return [
      '# 架构审查 Agent',
      '',
      '## 角色',
      '',
      '架构审查专家，负责审查代码变更是否符合项目架构规范。',
      '',
      '## 职责',
      '',
      '- 审查代码变更的架构合理性',
      '- 检查模块边界是否被破坏',
      '- 检查是否存在循环依赖',
      '- 输出架构审查意见',
      '',
      '## 工具权限',
      '',
      '- Read: 读取代码文件',
      '- Grep: 搜索代码',
      '- Glob: 查找文件',
      '',
      '## 禁止事项',
      '',
      '- 禁止直接修改代码',
      '- 禁止绕过审查流程',
    ].join('\n');
  }

  if (agentName === 'frontend-implementer') {
    return [
      '# 前端实现 Agent',
      '',
      '## 角色',
      '',
      '前端开发专家，负责按 Spec 实现前端代码。',
      '',
      '## 职责',
      '',
      '- 按 Spec 实现前端组件和页面',
      '- 遵守项目编码规范',
      '- 执行自检和测试',
      '',
      '## 工具权限',
      '',
      '- Read: 读取代码文件',
      '- Edit: 编辑代码文件',
      '- Write: 创建新文件',
      '- Bash: 运行测试命令',
      '',
      '## 禁止事项',
      '',
      '- 禁止修改后端代码',
      '- 禁止修改配置文件',
      '- 禁止跳过测试',
    ].join('\n');
  }

  if (agentName === 'test-reviewer') {
    return [
      '# 测试审查 Agent',
      '',
      '## 角色',
      '',
      '测试专家，负责审查测试覆盖率和测试质量。',
      '',
      '## 职责',
      '',
      '- 审查测试用例是否覆盖核心场景',
      '- 检查测试质量（是否有脆弱测试）',
      '- 验证测试结果真实性',
      '- 输出测试审查意见',
      '',
      '## 工具权限',
      '',
      '- Read: 读取测试文件',
      '- Bash: 运行测试命令',
      '- Grep: 搜索测试用例',
      '',
      '## 禁止事项',
      '',
      '- 禁止修改测试结果',
      '- 禁止伪造测试通过',
    ].join('\n');
  }

  if (agentName === 'security-reviewer') {
    return [
      '# 安全审查 Agent',
      '',
      '## 角色',
      '',
      '安全专家，负责审查代码安全性。',
      '',
      '## 职责',
      '',
      '- 检查是否存在硬编码密钥',
      '- 检查是否存在注入风险',
      '- 检查输入验证是否完整',
      '- 输出安全审查意见',
      '',
      '## 工具权限',
      '',
      '- Read: 读取代码文件',
      '- Grep: 搜索安全模式',
      '- Glob: 查找文件',
      '',
      '## 禁止事项',
      '',
      '- 禁止直接修改代码',
      '- 禁止绕过安全检查',
    ].join('\n');
  }

  return '';
}

function buildSettingsJson() {
  return JSON.stringify({
    hooks: {
      PreToolUse: [],
      PostToolUse: [],
      Stop: [],
    },
    permissions: {
      allow: [],
      deny: [],
    },
  }, null, 2);
}

class ClaudeAdapter extends IDEAdapter {
  get adapterId() {
    return 'claude';
  }

  detect(input) {
    const rootDir = input.rootDir;
    const hasClaudeDir = fs.existsSync(path.join(rootDir, '.claude'));
    const hasAiSpec = fs.existsSync(path.join(rootDir, '.ai-spec'));
    if (hasAiSpec && !hasClaudeDir) {
      return { applicable: true, reason: '项目已初始化且尚未生成 Claude Code 适配文件' };
    }
    if (hasClaudeDir) {
      return { applicable: true, reason: 'Claude Code 目录已存在，可更新' };
    }
    return { applicable: true, reason: '默认适用' };
  }

  /**
   * 生成 Claude Code IDE 指针文件列表
   * @param {{ profile: string }|import('./adapter-protocol').AdapterInput} input
   * @returns {import('./adapter-protocol').AdapterOutput}
   */
  generateFiles(input = {}) {
    const profile = input.profile || PROFILES.AUTO;
    const files = [
      {
        relativePath: '.claude/ai-spec-auto.md',
        content: buildClaudeEntryContent(),
        type: 'pointer-entry',
      },
      {
        relativePath: '.claude/commands/spec-start.md',
        content: buildClaudeCommandContent('spec-start', profile),
        type: 'command',
      },
      {
        relativePath: '.claude/commands/spec-update.md',
        content: buildClaudeCommandContent('spec-update', profile),
        type: 'command',
      },
      {
        relativePath: '.claude/commands/spec-status.md',
        content: buildClaudeCommandContent('spec-status', profile),
        type: 'command',
      },
      {
        relativePath: '.claude/commands/spec-implement.md',
        content: buildClaudeCommandContent('spec-implement', profile),
        type: 'command',
      },
      {
        relativePath: '.claude/commands/spec-review.md',
        content: buildClaudeCommandContent('spec-review', profile),
        type: 'command',
      },
      {
        relativePath: '.claude/commands/spec-repair.md',
        content: buildClaudeCommandContent('spec-repair', profile),
        type: 'command',
      },
      {
        relativePath: '.claude/agents/architect-reviewer.md',
        content: buildAgentContent('architect-reviewer'),
        type: 'agent',
      },
      {
        relativePath: '.claude/agents/frontend-implementer.md',
        content: buildAgentContent('frontend-implementer'),
        type: 'agent',
      },
      {
        relativePath: '.claude/agents/test-reviewer.md',
        content: buildAgentContent('test-reviewer'),
        type: 'agent',
      },
      {
        relativePath: '.claude/agents/security-reviewer.md',
        content: buildAgentContent('security-reviewer'),
        type: 'agent',
      },
      {
        relativePath: '.claude/settings.json',
        content: buildSettingsJson(),
        type: 'config',
      },
    ];
    return createAdapterOutput(this.adapterId, files);
  }

  /**
   * 写入所有 Claude 指针文件到目标目录
   * @param {string} rootDir
   * @param {{ dryRun?: boolean, profile?: string }} options
   * @returns {Array<{ path: string, action: string }>}
   */
  write(rootDir, options = {}) {
    const output = this.generateFiles({ profile: options.profile });
    const results = [];

    for (const file of output.files) {
      const filePath = path.join(rootDir, file.relativePath);
      const exists = fs.existsSync(filePath);
      const action = exists ? SYNC_ACTIONS.UPDATE : SYNC_ACTIONS.CREATE;

      if (!options.dryRun) {
        ensureDir(path.dirname(filePath));
        fs.writeFileSync(filePath, `${file.content}\n`, 'utf8');
      }

      results.push({
        path: file.relativePath,
        action,
      });
    }

    return results;
  }

  /**
   * 检查 Claude 指针文件是否存在
   * @param {string} rootDir
   * @returns {Array<{ path: string, exists: boolean }>}
   */
  check(rootDir) {
    const output = this.generateFiles();
    return output.files.map((file) => ({
      path: file.relativePath,
      exists: fs.existsSync(path.join(rootDir, file.relativePath)),
    }));
  }
}

module.exports = {
  ClaudeAdapter,
  buildClaudeEntryContent,
  buildClaudeCommandContent,
};
