#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ALLOWED_TOP_LEVEL_FIELDS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]);

function stripQuotes(value) {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function extractFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) {
    return {
      ok: false,
      error: 'SKILL.md must start with YAML frontmatter delimited by ---',
    };
  }

  return {
    ok: true,
    frontmatterText: match[1],
    body: content.slice(match[0].length),
  };
}

function parseFrontmatter(frontmatterText) {
  const data = {};
  const rawKeys = [];
  const errors = [];
  const lines = frontmatterText.split(/\r?\n/);

  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim() || /^\s*#/.test(line)) {
      index += 1;
      continue;
    }

    if (/^\s/.test(line)) {
      errors.push(`Unexpected indentation in frontmatter: "${line.trim()}"`);
      index += 1;
      continue;
    }

    const match = line.match(/^([A-Za-z0-9-]+):(?:\s*(.*))?$/);
    if (!match) {
      errors.push(`Invalid frontmatter line: "${line}"`);
      index += 1;
      continue;
    }

    const key = match[1];
    const rawValue = match[2] ?? '';
    rawKeys.push(key);

    if (key === 'metadata') {
      if (rawValue.trim()) {
        errors.push('metadata must be declared as a mapping');
        data.metadata = rawValue.trim();
        index += 1;
        continue;
      }

      const metadata = {};
      index += 1;
      while (index < lines.length) {
        const nestedLine = lines[index];
        if (!nestedLine.trim() || /^\s*#/.test(nestedLine)) {
          index += 1;
          continue;
        }
        if (!/^\s/.test(nestedLine)) {
          break;
        }

        const indent = nestedLine.match(/^(\s*)/)[1].length;
        const nestedMatch = nestedLine.match(/^\s+([^:\s][^:]*):(?:\s*(.*))?$/);
        if (!nestedMatch) {
          errors.push(`Invalid metadata line: "${nestedLine.trim()}"`);
          index += 1;
          continue;
        }

        const nestedKey = nestedMatch[1].trim();
        const nestedValue = nestedMatch[2] ?? '';

        if (!nestedValue.trim()) {
          let probeIndex = index + 1;
          let hasNestedBlock = false;
          while (probeIndex < lines.length) {
            const probeLine = lines[probeIndex];
            if (!probeLine.trim() || /^\s*#/.test(probeLine)) {
              probeIndex += 1;
              continue;
            }
            const probeIndent = probeLine.match(/^(\s*)/)[1].length;
            if (probeIndent <= indent) {
              break;
            }
            hasNestedBlock = true;
            probeIndex += 1;
          }

          if (hasNestedBlock) {
            metadata[nestedKey] = { __invalid_nested_value__: true };
            index = probeIndex;
            continue;
          }
        }

        metadata[nestedKey] = stripQuotes(nestedValue);
        index += 1;
      }

      data.metadata = metadata;
      continue;
    }

    if (!rawValue.trim()) {
      const parts = [];
      index += 1;
      while (index < lines.length) {
        const continuation = lines[index];
        if (!continuation.trim()) {
          index += 1;
          continue;
        }
        if (!/^\s/.test(continuation)) {
          break;
        }
        parts.push(continuation.trim());
        index += 1;
      }
      data[key] = stripQuotes(parts.join(' '));
      continue;
    }

    data[key] = stripQuotes(rawValue);
    index += 1;
  }

  return {
    data,
    rawKeys,
    errors,
  };
}

function normalizeBundledPath(ref) {
  const trimmed = String(ref || '').trim().replace(/[),.;:]+$/g, '');
  if (trimmed.startsWith('./')) {
    return trimmed.slice(2);
  }
  return trimmed;
}

function collectBundledPathReferences(body) {
  const refs = new Set();
  const lines = body.split(/\r?\n/);
  let inFence = false;

  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) {
      continue;
    }

    const isExampleLine = /\bexamples?\b|示例|例如|would be helpful/i.test(line);
    const hasResourceCue = /see|refer|reference|read|load|run|must-read|使用|参考|读取|运行|详见|引用|可参考|先按|技能路径/i.test(line);
    const patterns = [/\]\(((?:\.\/)?(?:references|scripts|assets)\/[^)\s]+)\)/g];

    if (!isExampleLine && hasResourceCue) {
      patterns.push(/`((?:\.\/)?(?:references|scripts|assets)\/[^`\s]+)`/g);
      patterns.push(/(^|[\s(>])((?:\.\/)?(?:references|scripts|assets)\/[A-Za-z0-9._/-]+)/gm);
    }

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(line)) !== null) {
        const ref = normalizeBundledPath(match[match.length - 1]);
        if (ref) {
          refs.add(ref);
        }
      }
    }
  }

  return [...refs];
}

function hasWhenToUseCue(description) {
  const value = String(description || '');
  return /\buse when\b|\bused when\b|\bwhen\b|\btriggers on\b|\bload for\b|当|用于|适用于|需要|遇到/i.test(value);
}

function hasGotchas(body) {
  return /##\s*gotchas\b|##\s*注意事项|##\s*常见错误|##\s*常见问题/i.test(body);
}

function hasChecklist(body) {
  return /- \[ \]|- \[x\]/i.test(body);
}

function hasValidationLoop(body) {
  return /validation loop|plan-validate-execute|验证循环|先.+验证|run validation|重新验证|validate again/i.test(body);
}

function isRepoDependent(body) {
  return /(?:\.agents\/rules\/|\.agents\/skills\/|\.cursor\/skills\/|openspec\/|\/opsx:|\/opsx-)/.test(body);
}

function validateMetadata(metadata) {
  const errors = [];

  if (metadata === undefined) {
    return errors;
  }

  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    errors.push('metadata must be a string-to-string mapping');
    return errors;
  }

  for (const [key, value] of Object.entries(metadata)) {
    if (typeof key !== 'string' || !key.trim()) {
      errors.push('metadata keys must be non-empty strings');
      continue;
    }
    if (typeof value !== 'string') {
      errors.push(`metadata.${key} must be a string`);
    }
  }

  return errors;
}

function validateSkillSpec(skillPath) {
  const resolved = path.resolve(skillPath);
  const skillDir = path.basename(resolved) === 'SKILL.md' ? path.dirname(resolved) : resolved;
  const skillMdPath = path.join(skillDir, 'SKILL.md');
  const result = {
    skill_dir: skillDir,
    skill_file: skillMdPath,
    errors: [],
    warnings: [],
    stats: {
      line_count: 0,
      bundled_reference_count: 0,
      has_scripts: fs.existsSync(path.join(skillDir, 'scripts')),
      has_references: fs.existsSync(path.join(skillDir, 'references')),
      has_assets: fs.existsSync(path.join(skillDir, 'assets')),
      has_evals: fs.existsSync(path.join(skillDir, 'evals')),
    },
  };

  if (!fs.existsSync(skillMdPath)) {
    result.errors.push('SKILL.md not found');
    return result;
  }

  const content = fs.readFileSync(skillMdPath, 'utf8');
  result.stats.line_count = content.split(/\r?\n/).length;
  if (result.stats.line_count > 500) {
    result.errors.push(`SKILL.md exceeds 500 lines (${result.stats.line_count})`);
  }

  const extracted = extractFrontmatter(content);
  if (!extracted.ok) {
    result.errors.push(extracted.error);
    return result;
  }

  const parsed = parseFrontmatter(extracted.frontmatterText);
  result.errors.push(...parsed.errors);
  const data = parsed.data || {};

  for (const key of parsed.rawKeys) {
    if (!ALLOWED_TOP_LEVEL_FIELDS.has(key)) {
      result.errors.push(`Unsupported top-level frontmatter field: ${key}`);
    }
  }

  const name = typeof data.name === 'string' ? data.name.trim() : '';
  if (!name) {
    result.errors.push('name is required');
  } else {
    if (name.length > 64) {
      result.errors.push(`name exceeds 64 characters (${name.length})`);
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) {
      result.errors.push(`name "${name}" must use lowercase letters, numbers, and single hyphens only`);
    }
    if (path.basename(skillDir) !== name) {
      result.errors.push(`name "${name}" must match directory name "${path.basename(skillDir)}"`);
    }
  }

  const description = typeof data.description === 'string' ? data.description.trim() : '';
  if (!description) {
    result.errors.push('description is required');
  } else if (description.length > 1024) {
    result.errors.push(`description exceeds 1024 characters (${description.length})`);
  } else if (!hasWhenToUseCue(description)) {
    result.warnings.push('description should clearly say what the skill does and when to use it');
  }

  if (data.license !== undefined && typeof data.license !== 'string') {
    result.errors.push('license must be a string if provided');
  }

  if (data.compatibility !== undefined) {
    if (typeof data.compatibility !== 'string' || !data.compatibility.trim()) {
      result.errors.push('compatibility must be a non-empty string if provided');
    } else if (data.compatibility.trim().length > 500) {
      result.errors.push(`compatibility exceeds 500 characters (${data.compatibility.trim().length})`);
    }
  }

  if (data['allowed-tools'] !== undefined && typeof data['allowed-tools'] !== 'string') {
    result.errors.push('allowed-tools must be a string if provided');
  }

  result.errors.push(...validateMetadata(data.metadata));

  const bundledRefs = collectBundledPathReferences(extracted.body);
  result.stats.bundled_reference_count = bundledRefs.length;
  for (const ref of bundledRefs) {
    if (ref.startsWith('../')) {
      result.errors.push(`Bundled resource reference must stay inside the skill root: ${ref}`);
      continue;
    }
    if (!/^(references|scripts|assets)\//.test(ref)) {
      result.errors.push(`Bundled resource reference must use a skill-root relative path: ${ref}`);
      continue;
    }
    const target = path.join(skillDir, ref);
    if (!fs.existsSync(target)) {
      result.errors.push(`Bundled resource reference is missing: ${ref}`);
    }
  }

  if (isRepoDependent(extracted.body) && !(typeof data.compatibility === 'string' && data.compatibility.trim())) {
    result.warnings.push('Repo-dependent skill should declare compatibility');
  }

  const looksMultiStep = /##\s*步骤|##\s*工作流程|workflow|四步|五步|step 1|第[一二三四五六七八九十]步/i.test(extracted.body);
  if (looksMultiStep && result.stats.line_count > 120 && !hasChecklist(extracted.body) && !hasValidationLoop(extracted.body)) {
    result.warnings.push('Multi-step skill should include a checklist or a validation loop');
  }

  if (
    result.stats.line_count > 150 &&
    (/必须|强制|NON-NEGOTIABLE|严格/.test(extracted.body) || looksMultiStep) &&
    !hasGotchas(extracted.body)
  ) {
    result.warnings.push('Fragile or strict workflows should document gotchas');
  }

  if (result.stats.line_count > 300 && !result.stats.has_references && !result.stats.has_scripts && !result.stats.has_assets) {
    result.warnings.push('Large SKILL.md should move detailed content into references/, scripts/, or assets/');
  }

  return result;
}

function printPretty(report) {
  console.log(`skill-spec validation: ${report.errors.length > 0 ? 'failed' : 'success'}`);
  console.log(`skill_dir: ${report.skill_dir}`);
  console.log(`skill_file: ${report.skill_file}`);
  console.log(`line_count: ${report.stats.line_count}`);
  if (report.warnings.length > 0) {
    console.log('warnings:');
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }
  if (report.errors.length > 0) {
    console.log('errors:');
    for (const error of report.errors) {
      console.log(`- ${error}`);
    }
  }
}

function main(argv) {
  const args = [...argv];
  const options = {
    json: false,
  };
  let skillPath = null;

  while (args.length > 0) {
    const arg = args.shift();
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      console.log('Usage: node bin/skill-spec-validator.js <skill-dir|SKILL.md> [--json]');
      return 0;
    }
    if (!skillPath) {
      skillPath = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!skillPath) {
    throw new Error('Missing skill path');
  }

  const report = validateSkillSpec(skillPath);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    printPretty(report);
  }
  return report.errors.length > 0 ? 1 : 0;
}

module.exports = {
  ALLOWED_TOP_LEVEL_FIELDS,
  validateSkillSpec,
};

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(`skill-spec-validator failed: ${error.message}`);
    process.exit(1);
  }
}
