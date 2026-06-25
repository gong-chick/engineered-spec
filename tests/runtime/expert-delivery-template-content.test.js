const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const demo = require('../../bin/demo-runtime-smoke');

const repoRoot = path.join(__dirname, '..', '..');

function readRepoFile(relPath) {
  return fs.readFileSync(path.join(repoRoot, relPath), 'utf8');
}

function findArchivedChangeDir(targetDir) {
  const archiveRoot = path.join(targetDir, 'openspec', 'changes', 'archive');
  const entries = fs.readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  assert.ok(entries.length > 0, 'expected archived change directory to exist');
  return path.join(archiveRoot, entries[0]);
}

function assertContains(content, expected, message) {
  assert.ok(content.includes(expected), `${message}: missing "${expected}"`);
}

function main() {
  const proposalTemplate = readRepoFile('openspec/schemas/expert-delivery/templates/proposal.md');
  assertContains(proposalTemplate, '### 业务目标', 'proposal 模板应包含业务目标子段');
  assertContains(proposalTemplate, '### 工程目标', 'proposal 模板应包含工程目标子段');
  assertContains(proposalTemplate, '### 变更对象与入口', 'proposal 模板应包含变更对象与入口子段');
  assertContains(proposalTemplate, '### 设计链接', 'proposal 模板应包含设计链接子段');
  assertContains(proposalTemplate, '### 组件复用约束（可选）', 'proposal 模板应包含组件复用约束子段');
  assertContains(proposalTemplate, '### In Scope(纳入范围)', 'proposal 模板应包含纳入范围提示');
  assertContains(proposalTemplate, '### Out of Scope(排除范围)', 'proposal 模板应包含排除范围提示');

  const designTemplate = readRepoFile('openspec/schemas/expert-delivery/templates/design.md');
  assertContains(designTemplate, '### 页面与路由落点', 'design 模板应包含页面与路由落点子段');
  assertContains(designTemplate, '### 接口与数据落点', 'design 模板应包含接口与数据落点子段');
  assertContains(designTemplate, '### 状态与样式落点', 'design 模板应包含状态与样式落点子段');
  assertContains(designTemplate, '### 组件复用策略', 'design 模板应包含组件复用策略子段');
  assertContains(designTemplate, '### 本地验证', 'design 模板应包含本地验证子段');
  assertContains(designTemplate, '### 浏览器验证', 'design 模板应包含浏览器验证子段');

  const tasksTemplate = readRepoFile('openspec/schemas/expert-delivery/templates/tasks.md');
  assertContains(tasksTemplate, '## 执行总原则', 'tasks 模板应包含执行总原则');
  assertContains(tasksTemplate, '## 子任务清单', 'tasks 模板应包含子任务清单');
  assertContains(tasksTemplate, '- [ ] 目标：', 'tasks 模板应包含目标字段');
  assertContains(tasksTemplate, '- [ ] 输入：', 'tasks 模板应包含输入字段');
  assertContains(tasksTemplate, '- [ ] 输出：', 'tasks 模板应包含输出字段');
  assertContains(tasksTemplate, '- [ ] 验证点：', 'tasks 模板应包含验证点字段');
  assertContains(tasksTemplate, '- [ ] 依赖或前置条件：', 'tasks 模板应包含依赖字段');

  const checklistTemplate = readRepoFile('openspec/schemas/expert-delivery/templates/checklist.md');
  assertContains(checklistTemplate, '### 本地验证摘要', 'checklist 模板应包含本地验证摘要');
  assertContains(checklistTemplate, '### 浏览器验证摘要', 'checklist 模板应包含浏览器验证摘要');
  assertContains(checklistTemplate, '### 范围一致性', 'checklist 模板应包含范围一致性');
  assertContains(checklistTemplate, '### 组件复用检查', 'checklist 模板应包含组件复用检查');

  const iterationsTemplate = readRepoFile('openspec/schemas/expert-delivery/templates/iterations.md');
  assertContains(iterationsTemplate, '- 问题来源：', 'iterations 模板应包含问题来源提示');
  assertContains(iterationsTemplate, '- 已完成动作：', 'iterations 模板应包含已完成动作提示');
  assertContains(iterationsTemplate, '- 风险说明：', 'iterations 模板应包含风险说明提示');
  assertContains(iterationsTemplate, '- 交接说明：', 'iterations 模板应包含交接说明提示');

  const configTemplate = readRepoFile('openspec/config.yaml.template');
  assertContains(configTemplate, '组件复用策略、设计链接和变更入口', 'config 模板应提示 proposal 补充内容');
  assertContains(configTemplate, '信息结构、状态管理、组件复用策略和验收路径', 'config 模板应提示 design 补充内容');
  assertContains(configTemplate, '目标、输入、输出、验证点和依赖或前置条件', 'config 模板应提示 tasks 结构化填写');
  assertContains(configTemplate, '本地验证、浏览器验证、范围一致性和组件复用检查', 'config 模板应提示 checklist 摘要');
  assertContains(configTemplate, '问题来源、修正动作、残留风险和下轮提醒', 'config 模板应提示 iterations 摘要');

  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-template-demo-'));
  demo.runDemoRuntimeSmoke({
    target: targetDir,
    userInput: '新增一个商品 mock 页面',
    runId: 'run_20260417_120000_template',
  });

  const archivedChangeDir = findArchivedChangeDir(targetDir);
  const proposal = fs.readFileSync(path.join(archivedChangeDir, 'proposal.md'), 'utf8');
  assertContains(proposal, '### 业务目标', 'demo proposal 应包含业务目标子段');
  assertContains(proposal, '### 组件复用约束（可选）', 'demo proposal 应包含组件复用约束子段');

  const design = fs.readFileSync(path.join(archivedChangeDir, 'design.md'), 'utf8');
  assertContains(design, '### 页面与路由落点', 'demo design 应包含页面与路由落点');
  assertContains(design, '### 关键验收路径', 'demo design 应包含关键验收路径');

  const tasks = fs.readFileSync(path.join(archivedChangeDir, 'tasks.md'), 'utf8');
  assertContains(tasks, '## 执行总原则', 'demo tasks 应包含执行总原则');
  assertContains(tasks, '- [ ] 验证点：', 'demo tasks 应包含验证点字段');

  const checklist = fs.readFileSync(path.join(archivedChangeDir, 'checklist.md'), 'utf8');
  assertContains(checklist, '### 本地验证摘要', 'demo checklist 应包含本地验证摘要');
  assertContains(checklist, '### 组件复用检查', 'demo checklist 应包含组件复用检查');

  const iterations = fs.readFileSync(path.join(archivedChangeDir, 'iterations.md'), 'utf8');
  assertContains(iterations, '- 问题来源：', 'demo iterations 应包含问题来源提示');
  assertContains(iterations, '- 交接说明：', 'demo iterations 应包含交接说明提示');

  console.log('expert-delivery 模板测试通过：模板与示例输出包含增强后的结构化提示');
}

main();
