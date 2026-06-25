#!/usr/bin/env node
/**
 * 盘点当前仓库中的 skill、rule、专家(role)、流程(flow)、命令(command)、编排(orchestration) 等资产数量。
 *
 * Usage:
 *   node tests/scripts/project-capability-inventory.js
 *   node tests/scripts/project-capability-inventory.js --json
 *   node tests/scripts/project-capability-inventory.js --source /path/to/repo
 */

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = [...argv];
  const options = { json: false, source: null };
  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--json') options.json = true;
    else if (arg === '--source') options.source = args.shift();
    else if (arg === '--help' || arg === '-h') options.help = true;
  }
  return options;
}

function printUsage() {
  console.log(`Usage:
  node tests/scripts/project-capability-inventory.js [--json] [--source <dir>]
`);
}

function walkFiles(rootDir, { filter } = {}) {
  const out = [];
  if (!fs.existsSync(rootDir)) return out;
  const stack = [rootDir];
  while (stack.length) {
    const dir = stack.pop();
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name === '.DS_Store') continue;
      const full = path.join(dir, name);
      let st;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        stack.push(full);
      } else if (!filter || filter(full, name)) {
        out.push(full);
      }
    }
  }
  return out;
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function relFiles(root, subdir, predicate) {
  const abs = path.join(root, subdir);
  return walkFiles(abs, { filter: predicate }).map((p) => path.relative(root, p));
}

function countRegistry(root) {
  const registryDir = path.join(root, '.agents', 'registry');
  const skills = readJsonSafe(path.join(registryDir, 'skills.json'));
  const rules = readJsonSafe(path.join(registryDir, 'rules.json'));
  const roles = readJsonSafe(path.join(registryDir, 'roles.json'));
  const profiles = readJsonSafe(path.join(registryDir, 'profiles.json'));
  const scenarioPackages = readJsonSafe(path.join(registryDir, 'scenario-packages.json'));

  return {
    skills: skills && skills.skills ? Object.keys(skills.skills).length : 0,
    rules: rules && rules.rules ? Object.keys(rules.rules).length : 0,
    roles: roles && roles.roles ? Object.keys(roles.roles).length : 0,
    profiles: profiles && profiles.profiles ? Object.keys(profiles.profiles).length : 0,
    scenarioPackages:
      scenarioPackages && scenarioPackages.scenario_packages
        ? Object.keys(scenarioPackages.scenario_packages).length
        : 0,
    supportFiles: roles && Array.isArray(roles.support_files) ? roles.support_files.length : 0,
  };
}

function countFilesystem(root) {
  const skillMd = relFiles(root, path.join('.agents', 'skills'), (full, name) => name === 'SKILL.md');
  const skillNestedRules = relFiles(
    root,
    path.join('.agents', 'skills'),
    (full, name) => full.includes(`${path.sep}rules${path.sep}`) && name.endsWith('.md'),
  );

  const ruleDocs = relFiles(root, path.join('.agents', 'rules'), (full, name) => {
    if (!name.endsWith('.md')) return false;
    if (name.toLowerCase() === 'readme.md') return false;
    return true;
  });

  const roleDocs = relFiles(root, path.join('.agents', 'roles'), (full, name) => {
    if (!name.endsWith('.md')) return false;
    const lower = name.toLowerCase();
    if (lower === 'readme.md' || lower === 'index.md') return false;
    return true;
  });

  const flowDocs = relFiles(root, path.join('.agents', 'flows'), (full, name) => {
    if (!name.endsWith('.md')) return false;
    const base = path.basename(full).toLowerCase();
    if (base === 'readme.md' || base === 'frontmatter.md' || base === 'run_output.md') return false;
    return true;
  });

  const commandDocs = relFiles(root, path.join('.agents', 'commands'), (full, name) => {
    if (!name.endsWith('.md')) return false;
    if (name.toLowerCase() === 'readme.md') return false;
    return true;
  });

  const orchestrationDocs = relFiles(root, path.join('.agents', 'orchestration'), (full, name) => {
    if (!name.endsWith('.md')) return false;
    if (name.toLowerCase() === 'readme.md') return false;
    return true;
  });

  const cursorRuleDocs = relFiles(root, path.join('.cursor', 'rules'), (full, name) => {
    if (!name.endsWith('.md')) return false;
    if (name.toLowerCase() === 'readme.md') return false;
    return true;
  });

  const cursorSkillMd = relFiles(root, path.join('.cursor', 'skills'), (full, name) => name === 'SKILL.md');

  return {
    skillFoldersWithSkillMd: skillMd.length,
    skillNestedRuleFiles: skillNestedRules.length,
    agentsRuleMarkdownFiles: ruleDocs.length,
    agentsRoleMarkdownFiles: roleDocs.length,
    flowMarkdownFiles: flowDocs.length,
    commandMarkdownFiles: commandDocs.length,
    orchestrationMarkdownFiles: orchestrationDocs.length,
    cursorRuleMarkdownFiles: cursorRuleDocs.length,
    cursorSkillMdFiles: cursorSkillMd.length,
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printUsage();
    process.exit(0);
  }

  const root = options.source ? path.resolve(options.source) : path.join(__dirname, '..', '..');
  if (!fs.existsSync(path.join(root, '.agents'))) {
    console.error(`未找到 ${path.join(root, '.agents')}，请确认 --source 指向仓库根目录。`);
    process.exit(1);
  }

  const registry = countRegistry(root);
  const fsCounts = countFilesystem(root);

  const report = {
    root,
    generatedAt: new Date().toISOString(),
    registry,
    filesystem: fsCounts,
    summary: {
      '注册表·技能(skill)条目数': registry.skills,
      '注册表·规则(rule)条目数': registry.rules,
      '注册表·专家(role)条目数': registry.roles,
      '注册表·技术栈档案(profile)数': registry.profiles,
      '注册表·场景包(scenario package)数': registry.scenarioPackages,
      '注册表·roles.support_files 引用数': registry.supportFiles,
      '磁盘·SKILL.md 数量(.agents/skills)': fsCounts.skillFoldersWithSkillMd,
      '磁盘·技能内嵌 rules/*.md': fsCounts.skillNestedRuleFiles,
      '磁盘·规则文档 .md(.agents/rules，不含 README)': fsCounts.agentsRuleMarkdownFiles,
      '磁盘·专家文档 .md(.agents/roles，不含 README/INDEX)': fsCounts.agentsRoleMarkdownFiles,
      '磁盘·流程文档 .md(.agents/flows，不含 README/FRONTMATTER/RUN_OUTPUT)': fsCounts.flowMarkdownFiles,
      '磁盘·命令文档 .md(.agents/commands)': fsCounts.commandMarkdownFiles,
      '磁盘·编排文档 .md(.agents/orchestration)': fsCounts.orchestrationMarkdownFiles,
      '磁盘·Cursor 规则 .md(.cursor/rules)': fsCounts.cursorRuleMarkdownFiles,
      '磁盘·Cursor SKILL.md(.cursor/skills)': fsCounts.cursorSkillMdFiles,
    },
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log('项目能力资产盘点');
  console.log('================');
  console.log(`仓库根目录: ${root}`);
  console.log(`生成时间: ${report.generatedAt}`);
  console.log('');
  console.log('【注册表 .agents/registry】');
  console.log(`  技能(skill)条目:     ${registry.skills}`);
  console.log(`  规则(rule)条目:      ${registry.rules}`);
  console.log(`  专家(role)条目:      ${registry.roles}`);
  console.log(`  档案(profile):         ${registry.profiles}`);
  console.log(`  场景包:                ${registry.scenarioPackages}`);
  console.log(`  support_files 引用:  ${registry.supportFiles}`);
  console.log('');
  console.log('【磁盘 .agents】');
  console.log(`  SKILL.md 数量:         ${fsCounts.skillFoldersWithSkillMd}`);
  console.log(`  技能内嵌 rules/*.md:   ${fsCounts.skillNestedRuleFiles}`);
  console.log(`  规则 .md:              ${fsCounts.agentsRuleMarkdownFiles}`);
  console.log(`  专家 .md:              ${fsCounts.agentsRoleMarkdownFiles}`);
  console.log(`  流程(flow) .md:        ${fsCounts.flowMarkdownFiles}`);
  console.log(`  命令(command) .md:     ${fsCounts.commandMarkdownFiles}`);
  console.log(`  编排(orchestration) .md: ${fsCounts.orchestrationMarkdownFiles}`);
  console.log('');
  console.log('【Cursor 镜像（若存在）】');
  console.log(`  .cursor/rules .md:     ${fsCounts.cursorRuleMarkdownFiles}`);
  console.log(`  .cursor/skills SKILL.md: ${fsCounts.cursorSkillMdFiles}`);
  console.log('');
  console.log('说明: 「注册表」为发布/安装时引用的 ID 数量；「磁盘」为实际文件数，二者可能因嵌套规则、多 profile 副本而不一致。');
}

main();
