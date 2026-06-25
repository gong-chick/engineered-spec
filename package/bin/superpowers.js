const fs = require('fs');
const os = require('os');
const path = require('path');

const SUPERPOWERS_STATE_REL_PATH = '.ai-spec/superpowers.json';
const MANAGED_AGENTS_BLOCK_START = '<!-- ai-spec-auto superpowers bridge:start -->';
const MANAGED_AGENTS_BLOCK_END = '<!-- ai-spec-auto superpowers bridge:end -->';
const DEFAULT_ALLOWED_ROLES = ['requirement-analyst', 'frontend-implementer', 'code-guardian'];
const DEFAULT_ALLOWED_REPO_SKILLS = [
  'using-superpowers',
  'create-proposal',
  'design-analysis',
  'execute-task',
  'ui-verification',
  'web-design-guidelines',
  'create-test',
];

function resolveHomeDir(env = process.env) {
  return env.HOME || env.USERPROFILE || os.homedir();
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  }
  return [...new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean))];
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_error) {
    return false;
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getSuperpowersStatePath(targetDir) {
  return path.join(targetDir, SUPERPOWERS_STATE_REL_PATH);
}

function normalizeSuperpowersManifest(value, fallbackValue = null) {
  const raw = value === undefined ? fallbackValue : value;
  if (raw == null) {
    return null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Manifest superpowers（超能力配置）必须是对象');
  }

  const enabled = Boolean(raw.enabled);
  const policy = raw.policy == null ? 'ask' : String(raw.policy).trim();
  const preferredMode = raw.preferred_mode == null ? 'host-enhanced' : String(raw.preferred_mode).trim();
  const codexEntry = raw.codex_entry == null ? 'agents-skill-wrapper' : String(raw.codex_entry).trim();

  if (!['ask'].includes(policy)) {
    throw new Error(`Manifest superpowers.policy 不合法: ${policy}`);
  }
  if (!['host-enhanced', 'project-minimal'].includes(preferredMode)) {
    throw new Error(`Manifest superpowers.preferred_mode 不合法: ${preferredMode}`);
  }
  if (!['agents-skill-wrapper'].includes(codexEntry)) {
    throw new Error(`Manifest superpowers.codex_entry 不合法: ${codexEntry}`);
  }

  return {
    enabled,
    policy,
    preferred_mode: preferredMode,
    codex_entry: codexEntry,
  };
}

function detectHostCapabilities(env = process.env) {
  const homeDir = resolveHomeDir(env);
  const codexHome = env.CODEX_HOME || path.join(homeDir, '.codex');

  return {
    cursor: false,
    claude: fileExists(path.join(homeDir, '.claude', 'skills', 'using-superpowers', 'SKILL.md')),
    codex: (
      fileExists(path.join(codexHome, 'skills', 'using-superpowers', 'SKILL.md'))
      || fileExists(path.join(codexHome, 'superpowers', 'skills', 'using-superpowers', 'SKILL.md'))
    ),
  };
}

function buildBindings(enabled, mode, ides, hostCapabilities, manifestConfig = null) {
  const ideSet = new Set(normalizeList(ides));
  const codexEntry = manifestConfig?.codex_entry || 'agents-skill-wrapper';

  return {
    cursor: {
      enabled: enabled && ideSet.has('cursor'),
      entry_mode: enabled && ideSet.has('cursor') ? 'project-minimal' : 'off',
    },
    claude: {
      enabled: enabled && ideSet.has('claude'),
      entry_mode: enabled && ideSet.has('claude')
        ? (mode === 'host-enhanced' && hostCapabilities.claude ? 'host-enhanced' : 'project-minimal')
        : 'off',
    },
    codex: {
      enabled: enabled && ideSet.has('codex'),
      entry_mode: enabled && ideSet.has('codex')
        ? (mode === 'host-enhanced' && hostCapabilities.codex ? codexEntry : 'project-minimal')
        : 'off',
    },
  };
}

function buildSuperpowersState({
  targetDir = null,
  enabled = false,
  manifestConfig = null,
  ides = [],
  env = process.env,
  cliVersion = 'workspace',
  source = 'runtime',
  previousState = null,
} = {}) {
  const normalizedManifest = normalizeSuperpowersManifest(manifestConfig);
  const requestedEnabled = Boolean(normalizedManifest?.enabled ?? enabled);
  const hostCapabilities = detectHostCapabilities(env);

  let mode = 'off';
  let lastFallbackReason = null;
  if (requestedEnabled) {
    if (hostCapabilities.claude || hostCapabilities.codex) {
      mode = 'host-enhanced';
    } else {
      mode = 'project-minimal';
      if ((normalizedManifest?.preferred_mode || 'host-enhanced') === 'host-enhanced') {
        lastFallbackReason = '未检测到可用的宿主 superpowers 技能，已降级到 project-minimal';
      }
    }
  }

  const state = {
    schema_version: 1,
    enabled: requestedEnabled,
    mode,
    source,
    asked_at_install: source === 'init' ? true : Boolean(previousState?.asked_at_install),
    bindings: buildBindings(requestedEnabled, mode, ides, hostCapabilities, normalizedManifest),
    host: {
      capabilities: hostCapabilities,
      codex_home: env.CODEX_HOME || path.join(resolveHomeDir(env), '.codex'),
    },
    allowed_roles: [...DEFAULT_ALLOWED_ROLES],
    allowed_repo_skills: [...DEFAULT_ALLOWED_REPO_SKILLS],
    fallback_strategy: 'graceful-degrade',
    last_fallback_reason: lastFallbackReason,
    telemetry: {
      last_binding_check_at: new Date().toISOString(),
      last_successful_mode: mode,
      last_fallback_reason: lastFallbackReason,
      hit_count: Number(previousState?.telemetry?.hit_count) || 0,
    },
    cli_version: cliVersion,
  };

  if (targetDir) {
    state.target_dir = path.resolve(targetDir);
  }
  return state;
}

function readJson(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (_error) {
    throw new Error(`${label} 不是合法 JSON: ${filePath}`);
  }
}

function writeSuperpowersState(targetDir, state) {
  const statePath = getSuperpowersStatePath(targetDir);
  ensureDir(path.dirname(statePath));
  fs.writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
  return statePath;
}

function readSuperpowersState(targetDir) {
  const statePath = getSuperpowersStatePath(targetDir);
  if (!fs.existsSync(statePath)) {
    return null;
  }
  return readJson(statePath, 'superpowers state');
}

function buildRoleHostEnhancedHints(roleId) {
  if (roleId === 'requirement-analyst') {
    return ['using-superpowers', 'brainstorming', 'plan'];
  }
  if (roleId === 'frontend-implementer') {
    return ['test-driven-development', 'systematic-debugging'];
  }
  if (roleId === 'code-guardian') {
    return ['requesting-code-review'];
  }
  return [];
}

function buildRoleRecommendedSequence(roleId, state) {
  if (!state?.enabled || state.mode !== 'host-enhanced') {
    return [];
  }

  if (roleId === 'requirement-analyst') {
    return ['using-superpowers', 'brainstorming', 'plan', 'create-proposal'];
  }

  if (roleId === 'frontend-implementer') {
    return ['using-superpowers', 'execute-task'];
  }

  if (roleId === 'code-guardian') {
    return ['using-superpowers', 'create-test', 'ui-verification'];
  }

  return [];
}

function buildRoleUserPrompt(roleId, state) {
  if (!state?.enabled || state.mode !== 'host-enhanced') {
    return null;
  }

  if (roleId === 'requirement-analyst') {
    return '已启用 Superpowers 增强：先执行 using-superpowers(超级能力使用) 对齐技能调度，再按 brainstorming(头脑风暴设计) / plan(规划) 收敛需求，最后执行 create-proposal(创建提案) 产出 proposal/specs/design/tasks。';
  }

  if (roleId === 'frontend-implementer') {
    return '已启用 Superpowers 增强：先按 using-superpowers(技能调度核心规范) 选择执行路径，再由 execute-task(任务执行规范) 推进实现。';
  }

  if (roleId === 'code-guardian') {
    return '已启用 Superpowers 增强：先按 using-superpowers(技能调度核心规范) 对齐检查路径，再执行 create-test / ui-verification / web-design-guidelines。';
  }

  return null;
}

function loadSuperpowersState(targetDir, options = {}) {
  const existing = readSuperpowersState(targetDir);
  if (existing) {
    return existing;
  }

  const manifest = options.manifest || null;
  const normalizedManifest = normalizeSuperpowersManifest(manifest?.superpowers || null);
  if (normalizedManifest?.enabled) {
    const rebuilt = buildSuperpowersState({
      targetDir,
      enabled: true,
      manifestConfig: normalizedManifest,
      ides: manifest?.ides || options.ides || [],
      env: options.env || process.env,
      cliVersion: options.cliVersion || 'workspace',
      source: 'manifest-rebuild',
    });
    rebuilt.last_fallback_reason = rebuilt.last_fallback_reason || 'superpowers 状态文件缺失，已按 manifest 重建';
    rebuilt.telemetry.last_fallback_reason = rebuilt.last_fallback_reason;
    return rebuilt;
  }

  return buildSuperpowersState({
    targetDir,
    enabled: false,
    manifestConfig: normalizedManifest,
    ides: manifest?.ides || options.ides || [],
    env: options.env || process.env,
    cliVersion: options.cliVersion || 'workspace',
    source: 'runtime',
  });
}

function buildSuperpowersContract(targetDir, roleId, options = {}) {
  const state = loadSuperpowersState(targetDir, options);
  const entryAssets = [];
  if (state.enabled) {
    entryAssets.push('.ai-spec/superpowers.json');
    if (state.bindings.codex?.enabled) {
      entryAssets.push('AGENTS.md');
      entryAssets.push('.codex/commands/*.md');
    }
    if (state.bindings.cursor?.enabled) {
      entryAssets.push('.cursor/skills/using-superpowers');
    }
    if (state.bindings.claude?.enabled) {
      entryAssets.push('.claude/skills/using-superpowers');
    }
  }

  return {
    enabled: Boolean(state.enabled),
    mode: state.mode || 'off',
    provider: state.mode === 'host-enhanced' ? 'host-superpowers' : state.enabled ? 'project-minimal' : 'disabled',
    entry_assets: entryAssets,
    allowed_roles: Array.isArray(state.allowed_roles) ? state.allowed_roles : [...DEFAULT_ALLOWED_ROLES],
    allowed_repo_skills: Array.isArray(state.allowed_repo_skills) ? state.allowed_repo_skills : [...DEFAULT_ALLOWED_REPO_SKILLS],
    host_enhanced_hints: state.enabled && state.mode === 'host-enhanced' ? buildRoleHostEnhancedHints(roleId) : [],
    recommended_sequence: buildRoleRecommendedSequence(roleId, state),
    user_prompt: buildRoleUserPrompt(roleId, state),
    fallback_strategy: state.fallback_strategy || 'graceful-degrade',
    fallback_reason: state.last_fallback_reason || null,
  };
}

function shouldExposeSkillToIde(skillId, superpowersEnabled) {
  if (skillId !== 'using-superpowers') {
    return true;
  }
  return Boolean(superpowersEnabled);
}

function renderManagedAgentsBlock() {
  return [
    MANAGED_AGENTS_BLOCK_START,
    '# ai-spec-auto superpowers bridge',
    '',
    '当当前任务需要走 Codex 项目级命令契约时：',
    '- 先读取 `.ai-spec/superpowers.json`，确认当前模式与回退原因。',
    '- 若存在 `.codex/commands/*.md`，优先按这些命令契约执行项目级入口。',
    '- 当 `superpowers.json.mode = "host-enhanced"` 时，优先遵循宿主增强提示；若宿主能力不可用，回退到 `project-minimal`。',
    MANAGED_AGENTS_BLOCK_END,
    '',
  ].join('\n');
}

function upsertManagedAgentsBlock(targetDir, enabled) {
  const agentsPath = path.join(targetDir, 'AGENTS.md');
  const block = renderManagedAgentsBlock();
  const hasFile = fs.existsSync(agentsPath);
  const current = hasFile ? fs.readFileSync(agentsPath, 'utf8') : '';
  const blockRegex = new RegExp(
    `${MANAGED_AGENTS_BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?${MANAGED_AGENTS_BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\n?`,
    'g',
  );

  if (!enabled) {
    if (!hasFile) {
      return null;
    }
    const next = current.replace(blockRegex, '').trim();
    if (!next) {
      fs.rmSync(agentsPath, { force: true });
      return agentsPath;
    }
    fs.writeFileSync(agentsPath, `${next}\n`, 'utf8');
    return agentsPath;
  }

  const next = current.match(blockRegex)
    ? current.replace(blockRegex, `${block}`)
    : `${current.replace(/\s*$/, '')}${current.trim() ? '\n\n' : ''}${block}`;
  fs.writeFileSync(agentsPath, next, 'utf8');
  return agentsPath;
}

module.exports = {
  SUPERPOWERS_STATE_REL_PATH,
  MANAGED_AGENTS_BLOCK_START,
  MANAGED_AGENTS_BLOCK_END,
  DEFAULT_ALLOWED_ROLES,
  DEFAULT_ALLOWED_REPO_SKILLS,
  normalizeSuperpowersManifest,
  detectHostCapabilities,
  buildSuperpowersState,
  getSuperpowersStatePath,
  writeSuperpowersState,
  readSuperpowersState,
  loadSuperpowersState,
  buildSuperpowersContract,
  shouldExposeSkillToIde,
  upsertManagedAgentsBlock,
};
