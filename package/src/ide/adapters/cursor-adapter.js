const fs = require('fs');
const path = require('path');
const { ensureDir } = require('../../project/json-utils');
const { SYNC_ACTIONS, PROFILES } = require('../ide-types');
const { IDEAdapter, createAdapterOutput } = require('./adapter-protocol');

function buildCursorRuleContent() {
  return [
    '---',
    'description: ai-spec-auto 项目规范入口',
    'alwaysApply: true',
    '---',
    '',
    '# ai-spec-auto Cursor 规则入口',
    '',
    '本项目通过 `ai-spec-auto` 管理规则、技能、命令和上下文索引。',
    '',
    '## 读取顺序',
    '',
    '1. `.agents/registry/ide-registry.json`',
    '2. `.agents/registry.index.json`',
    '3. `.ai-spec/context-index.json`',
    '4. `.ai-spec/ai-spec.lock.json`',
    '',
    '## 执行要求',
    '',
    '- 不要跳过索引直接读取所有资产。',
    '- 不要上传源码、原始提示词、原始响应、绝对路径或密钥。',
    '- 先判断当前任务属于 React / Vue 前端开发、组件修改、路由修改、状态管理还是测试修复。',
    '- 再按需读取对应 Rule / Skill。',
  ].join('\n');
}

function buildProjectOverviewRule(profile) {
  const profileLabel = profile === PROFILES.REACT ? 'React + TypeScript + Vite' : profile === PROFILES.VUE ? 'Vue 3 + TypeScript + Vite' : '前端项目';
  return [
    '---',
    'description: 项目总览规则 - 项目基本信息与技术栈',
    'globs: "**/*"',
    '---',
    '',
    '# 00 - 项目总览',
    '',
    '## 规则名称',
    '',
    '项目总览规则',
    '',
    '## 适用范围',
    '',
    '所有文件',
    '',
    '## AI 执行要求',
    '',
    `- 本项目使用 ${profileLabel} 技术栈`,
    '- 修改代码前必须先读取 `.ai-spec/config.json` 了解项目配置',
    '- 修改代码前必须先读取 `.ai-spec/manifest.json` 了解资产清单',
    '- 遵守 `.agents/rules/` 下的编码规范和通用约束',
    '- 所有输出使用中文',
    '',
    '## 禁止事项',
    '',
    '- 禁止上传源码、原始提示词、原始响应到外部',
    '- 禁止硬编码密钥或敏感信息',
    '- 禁止跳过测试直接标记完成',
    '',
    '## 需要读取的项目资产',
    '',
    '- `.ai-spec/config.json`',
    '- `.ai-spec/manifest.json`',
    '- `.ai-spec/ai-spec.lock.json`',
    '- `.memory/project.md`（如果存在）',
    '',
    '## 测试要求',
    '',
    '- 修改代码后必须运行项目测试命令',
    '- 测试结果必须真实，禁止伪造',
    '',
    '## 验收要求',
    '',
    '- 代码能正常构建',
    '- 测试全部通过',
    '- 无 lint 错误',
  ].join('\n');
}

function buildDeliveryWorkflowRule() {
  return [
    '---',
    'description: AI 交付工作流规则 - 需求到交付的完整流程',
    'globs: "**/*"',
    '---',
    '',
    '# 10 - AI 交付工作流',
    '',
    '## 规则名称',
    '',
    'AI 交付工作流规则',
    '',
    '## 适用范围',
    '',
    '所有开发任务',
    '',
    '## AI 执行要求',
    '',
    '1. 需求输入：从 Spec 开始，读取 `.ai-spec/specs/` 下的需求文档',
    '2. 测试计划：根据需求生成测试计划',
    '3. DoD 定义：明确完成标准',
    '4. 实现开发：按规范编写代码',
    '5. Hook 检查：执行 pre-test / post-test hooks',
    '6. 测试验证：运行测试并记录结果',
    '7. 修复循环：失败时自动修复，最多 2 次',
    '8. 证据归档：生成 Evidence Report',
    '',
    '## 禁止事项',
    '',
    '- 禁止跳过 Hook 检查',
    '- 禁止跳过测试验证',
    '- 禁止无限修复循环（最大 2 次）',
    '- 禁止伪造测试结果',
    '',
    '## 需要读取的项目资产',
    '',
    '- `.ai-spec/specs/` 下的需求文档',
    '- `.harness/hooks.config.json`（Hook 配置）',
    '- `.ai-spec/manifest.json`',
    '',
    '## 测试要求',
    '',
    '- 每个 Spec 完成后必须运行测试',
    '- 测试失败必须记录原因',
    '',
    '## 验收要求',
    '',
    '- 所有 Hook 执行通过',
    '- 测试全部通过',
    '- Evidence Report 已生成',
  ].join('\n');
}

function buildFrontendRule(profile) {
  const isVue = profile === PROFILES.VUE;
  const isReact = profile === PROFILES.REACT;
  const componentLib = isVue ? 'Element Plus' : isReact ? 'Ant Design' : '项目指定组件库';
  const stateLib = isVue ? 'Pinia' : isReact ? 'Zustand' : '项目指定状态管理';
  const styleLib = isVue ? 'Scoped Style / CSS Modules' : isReact ? 'SCSS Modules' : 'CSS Modules';

  return [
    '---',
    'description: 前端开发规则 - 组件、路由、状态管理规范',
    'globs: "src/**/*.{vue,tsx,jsx,ts,js}"',
    '---',
    '',
    '# 20 - 前端开发规则',
    '',
    '## 规则名称',
    '',
    '前端开发规则',
    '',
    '## 适用范围',
    '',
    'src/ 目录下的前端代码',
    '',
    '## AI 执行要求',
    '',
    `- 组件必须使用 ${isVue ? '<script setup lang="ts">' : 'TypeScript 函数组件'}`,
    `- UI 组件基于 ${componentLib} 二次封装`,
    `- 状态管理使用 ${stateLib}`,
    `- 样式使用 ${styleLib}`,
    '- 新增组件必须有明确的 Props 类型定义',
    '- 路由使用懒加载',
    '',
    '## 禁止事项',
    '',
    `- 禁止使用 ${isVue ? 'Options API' : 'Class Component'}`,
    '- 禁止使用 any 类型',
    '- 禁止硬编码颜色值（使用 CSS 变量）',
    '- 禁止在组件中直接调用 API（必须通过 api/ 层）',
    '- 禁止在 src/ 下新建非标准目录',
    '',
    '## 需要读取的项目资产',
    '',
    '- `.agents/rules/` 下的编码规范',
    '- `.agents/rules/` 下的组件规范',
    '- `.agents/rules/` 下的样式规范',
    '- `.memory/conventions.md`（如果存在）',
    '',
    '## 测试要求',
    '',
    '- 工具函数必须有单元测试',
    '- 复杂业务逻辑必须有测试覆盖',
    '',
    '## 验收要求',
    '',
    '- TypeScript 类型检查通过',
    '- ESLint 检查通过',
    '- 组件能正常渲染',
  ].join('\n');
}

function buildTestRule() {
  return [
    '---',
    'description: 测试规则 - 测试编写与质量门禁',
    'globs: "**/*.{test,spec}.{ts,js,tsx,jsx}"',
    '---',
    '',
    '# 30 - 测试规则',
    '',
    '## 规则名称',
    '',
    '测试规则',
    '',
    '## 适用范围',
    '',
    '所有测试文件',
    '',
    '## AI 执行要求',
    '',
    '- 测试文件与源文件同目录，命名 `<name>.test.ts`',
    '- 遵循 Arrange-Act-Assert 模式',
    '- 测试行为而非实现',
    '- 每个 test 只验证一个行为点',
    '- Mock 外部依赖，不 Mock 被测模块内部',
    '- describe 和 it 使用中文描述',
    '',
    '## 禁止事项',
    '',
    '- 禁止测试依赖执行顺序',
    '- 禁止滥用快照测试',
    '- 禁止硬编码延时（使用 vi.useFakeTimers）',
    '- 禁止伪造测试结果',
    '',
    '## 需要读取的项目资产',
    '',
    '- `.agents/rules/` 下的测试规范',
    '- `vitest.config.ts` 或 `jest.config.ts`',
    '',
    '## 测试要求',
    '',
    '- 测试必须能独立运行',
    '- 测试覆盖率不低于 80%',
    '',
    '## 验收要求',
    '',
    '- 所有测试通过',
    '- 无 skip 或 only 标记',
  ].join('\n');
}

function buildReviewRule() {
  return [
    '---',
    'description: 代码审查规则 - 提交前自检清单',
    'globs: "**/*"',
    '---',
    '',
    '# 40 - 代码审查规则',
    '',
    '## 规则名称',
    '',
    '代码审查规则',
    '',
    '## 适用范围',
    '',
    '所有代码变更',
    '',
    '## AI 执行要求',
    '',
    '- 提交前必须自检以下清单',
    '- 代码可读性：命名清晰、函数简短（<50 行）',
    '- 错误处理：异常不能被吞掉',
    '- 类型安全：不能使用 any',
    '- 安全性：无硬编码密钥、无注入风险',
    '- 测试覆盖：新增功能有测试',
    '',
    '## 禁止事项',
    '',
    '- 禁止提交 debugger 语句',
    '- 禁止提交注释掉的代码块',
    '- 禁止提交 console.log（生产代码）',
    '- 禁止绕过 lint 检查',
    '',
    '## 需要读取的项目资产',
    '',
    '- `.agents/rules/` 下的编码规范',
    '- `.agents/rules/` 下的通用约束',
    '- `.ai-spec/manifest.json`',
    '',
    '## 测试要求',
    '',
    '- 修改后必须重新运行测试',
    '',
    '## 验收要求',
    '',
    '- 所有自检项通过',
    '- lint 检查无 error',
    '- 类型检查通过',
  ].join('\n');
}

function buildCommandContent(commandName, profile) {
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
      '',
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

  return '';
}

class CursorAdapter extends IDEAdapter {
  get adapterId() {
    return 'cursor';
  }

  detect(input) {
    const rootDir = input.rootDir;
    const hasCursorDir = fs.existsSync(path.join(rootDir, '.cursor'));
    const hasAiSpec = fs.existsSync(path.join(rootDir, '.ai-spec'));
    if (hasAiSpec && !hasCursorDir) {
      return { applicable: true, reason: '项目已初始化且尚未生成 Cursor 适配文件' };
    }
    if (hasCursorDir) {
      return { applicable: true, reason: 'Cursor 目录已存在，可更新' };
    }
    return { applicable: true, reason: '默认适用' };
  }

  /**
   * 生成 Cursor IDE 指针文件列表
   * @param {{ profile: string }|import('./adapter-protocol').AdapterInput} input
   * @returns {import('./adapter-protocol').AdapterOutput}
   */
  generateFiles(input = {}) {
    const profile = input.profile || PROFILES.AUTO;
    const files = [
      {
        relativePath: '.cursor/rules/ai-spec-auto.mdc',
        content: buildCursorRuleContent(),
        type: 'pointer-rule',
      },
      {
        relativePath: '.cursor/rules/00-project-overview.mdc',
        content: buildProjectOverviewRule(profile),
        type: 'rule',
      },
      {
        relativePath: '.cursor/rules/10-ai-delivery-workflow.mdc',
        content: buildDeliveryWorkflowRule(),
        type: 'rule',
      },
      {
        relativePath: '.cursor/rules/20-frontend-rule.mdc',
        content: buildFrontendRule(profile),
        type: 'rule',
      },
      {
        relativePath: '.cursor/rules/30-test-rule.mdc',
        content: buildTestRule(),
        type: 'rule',
      },
      {
        relativePath: '.cursor/rules/40-review-rule.mdc',
        content: buildReviewRule(),
        type: 'rule',
      },
      {
        relativePath: '.cursor/commands/spec-start.md',
        content: buildCommandContent('spec-start', profile),
        type: 'command',
      },
      {
        relativePath: '.cursor/commands/spec-update.md',
        content: buildCommandContent('spec-update', profile),
        type: 'command',
      },
      {
        relativePath: '.cursor/commands/spec-status.md',
        content: buildCommandContent('spec-status', profile),
        type: 'command',
      },
    ];
    return createAdapterOutput(this.adapterId, files);
  }

  /**
   * 写入所有 Cursor 指针文件到目标目录
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
   * 检查 Cursor 指针文件是否存在
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
  CursorAdapter,
  buildCursorRuleContent,
  buildCommandContent,
};
