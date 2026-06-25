const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');
const fixturesRoot = path.join(__dirname, 'fixtures');

function cloneFixture(name) {
  const source = path.join(fixturesRoot, name);
  const target = fs.mkdtempSync(path.join(os.tmpdir(), `registry-fixture-${name}-`));
  fs.cpSync(source, target, { recursive: true });
  return target;
}

function overwriteFile(fixtureDir, relPath, content) {
  const filePath = path.join(fixtureDir, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

const validCases = [
  {
    name: 'valid-minimal',
    fixtureDir: path.join(fixturesRoot, 'valid-minimal'),
    expectedSummary: {
      profile_count: 1,
      rule_count: 1,
      skill_count: 1,
      role_count: 1,
      flow_count: 1,
      scenario_package_count: 1,
    },
  },
  {
    name: 'valid-custom-profile',
    fixtureDir: path.join(fixturesRoot, 'valid-custom-profile'),
    expectedSummary: {
      profile_count: 1,
      rule_count: 1,
      skill_count: 1,
      role_count: 1,
      flow_count: 1,
      scenario_package_count: 1,
    },
  },
  (() => {
    const fixtureDir = cloneFixture('valid-minimal');
    overwriteFile(
      fixtureDir,
      '.agents/skills/common/demo-skill/SKILL.md',
      `---\nname: demo-skill\ndescription: Use this demo skill when validating registry fixtures that should emit a compatibility warning.\n---\n\n# Demo Skill\n\n## When to use\n\nUse this skill for registry warning tests.\n\n## Workspace dependency\n\nRead \`.agents/rules/common/demo-rule.md\` before proceeding.\n`
    );
    return {
      name: 'valid-warning-missing-compatibility',
      fixtureDir,
      expectedSummary: {
        profile_count: 1,
        rule_count: 1,
        skill_count: 1,
        role_count: 1,
        flow_count: 1,
        scenario_package_count: 1,
      },
      expectedWarnings: ['Repo-dependent skill should declare compatibility'],
    };
  })(),
];

const invalidCases = [
  {
    name: 'invalid-scenario-missing-role',
    fixtureDir: path.join(__dirname, 'fixtures', 'invalid-scenario-missing-role'),
    expectedError: 'references unknown role: missing-role',
  },
  {
    name: 'invalid-missing-source',
    fixtureDir: path.join(__dirname, 'fixtures', 'invalid-missing-source'),
    expectedError: 'references missing source: .agents/rules/common/missing-source-rule.md',
  },
  {
    name: 'invalid-missing-support-file',
    fixtureDir: path.join(__dirname, 'fixtures', 'invalid-missing-support-file'),
    expectedError: 'roles.json support file is missing: .agents/roles/common/missing-support-file.md',
  },
  {
    name: 'invalid-domains-type',
    fixtureDir: path.join(fixturesRoot, 'invalid-domains-type'),
    expectedError: 'rules.json entry "demo-rule" domains must be an array',
  },
  (() => {
    const fixtureDir = cloneFixture('valid-custom-profile');
    overwriteFile(
      fixtureDir,
      '.agents/skills/profiles/nest/demo-skill/SKILL.md',
      `---\nname: demo-skill\ndescription: Use this fixture to validate that top-level version is rejected.\nversion: "1.0.0"\n---\n\n# Demo Skill\n`
    );
    return {
      name: 'invalid-skill-top-level-version',
      fixtureDir,
      expectedError: 'Unsupported top-level frontmatter field: version',
    };
  })(),
  (() => {
    const fixtureDir = cloneFixture('valid-custom-profile');
    overwriteFile(
      fixtureDir,
      '.agents/skills/profiles/nest/demo-skill/SKILL.md',
      `---\nname: demo-skill\ndescription: Use this fixture to validate nested metadata rejection.\nmetadata:\n  outer:\n    inner: "true"\n---\n\n# Demo Skill\n`
    );
    return {
      name: 'invalid-skill-nested-metadata',
      fixtureDir,
      expectedError: 'metadata.outer must be a string',
    };
  })(),
  (() => {
    const fixtureDir = cloneFixture('valid-custom-profile');
    overwriteFile(
      fixtureDir,
      '.agents/skills/profiles/nest/demo-skill/SKILL.md',
      `---\nname: Demo_Skill\ndescription: Use this fixture to validate name format enforcement.\n---\n\n# Demo Skill\n`
    );
    return {
      name: 'invalid-skill-name',
      fixtureDir,
      expectedError: 'must use lowercase letters, numbers, and single hyphens only',
    };
  })(),
  (() => {
    const fixtureDir = cloneFixture('valid-custom-profile');
    overwriteFile(
      fixtureDir,
      '.agents/skills/profiles/nest/demo-skill/SKILL.md',
      `---\nname: demo-skill\n---\n\n# Demo Skill\n`
    );
    return {
      name: 'invalid-skill-missing-description',
      fixtureDir,
      expectedError: 'description is required',
    };
  })(),
  (() => {
    const fixtureDir = cloneFixture('valid-custom-profile');
    const longDescription = 'a'.repeat(1025);
    overwriteFile(
      fixtureDir,
      '.agents/skills/profiles/nest/demo-skill/SKILL.md',
      `---\nname: demo-skill\ndescription: ${longDescription}\n---\n\n# Demo Skill\n`
    );
    return {
      name: 'invalid-skill-description-too-long',
      fixtureDir,
      expectedError: 'description exceeds 1024 characters',
    };
  })(),
  (() => {
    const fixtureDir = cloneFixture('valid-custom-profile');
    const longBody = Array.from({ length: 505 }, (_, index) => `line ${index + 1}`).join('\n');
    overwriteFile(
      fixtureDir,
      '.agents/skills/profiles/nest/demo-skill/SKILL.md',
      `---\nname: demo-skill\ndescription: Use this fixture to validate the 500 line limit.\n---\n\n${longBody}\n`
    );
    return {
      name: 'invalid-skill-over-500-lines',
      fixtureDir,
      expectedError: 'SKILL.md exceeds 500 lines',
    };
  })(),
  (() => {
    const fixtureDir = cloneFixture('valid-custom-profile');
    overwriteFile(
      fixtureDir,
      '.agents/skills/profiles/nest/demo-skill/SKILL.md',
      `---\nname: demo-skill\ndescription: Use this fixture to validate broken bundled resource links.\n---\n\n# Demo Skill\n\nSee \`references/missing.md\` before using this skill.\n`
    );
    return {
      name: 'invalid-skill-missing-resource-reference',
      fixtureDir,
      expectedError: 'Bundled resource reference is missing: references/missing.md',
    };
  })(),
];

function run(args) {
  return spawnSync('node', ['./bin/cli.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
}

function runInvalidCase(testCase) {
  const result = run(['validate-registry', '--source', testCase.fixtureDir, '--json']);

  assert.strictEqual(
    result.status,
    1,
    `expected validate-registry to fail for ${testCase.name}, got ${result.status}\nstderr:\n${result.stderr}`
  );

  assert.ok(result.stdout.trim(), 'expected validate-registry to print JSON output');

  const report = JSON.parse(result.stdout);
  assert.strictEqual(report.kind, 'registry-validation-result');
  assert.strictEqual(report.status, 'failed');
  assert.ok(report.stats && report.stats.skill_spec, 'expected skill_spec stats to be present');
  assert.ok(
    report.errors.some((item) => item.includes(testCase.expectedError)),
    `expected "${testCase.expectedError}" for ${testCase.name}, got:\n${report.errors.join('\n')}`
  );
}

function runValidCase(testCase) {
  const result = run(['validate-registry', '--source', testCase.fixtureDir, '--json']);

  assert.strictEqual(
    result.status,
    0,
    `expected validate-registry to pass for ${testCase.name}, got ${result.status}\nstderr:\n${result.stderr}`
  );

  assert.ok(result.stdout.trim(), 'expected validate-registry to print JSON output');

  const report = JSON.parse(result.stdout);
  assert.strictEqual(report.kind, 'registry-validation-result');
  assert.strictEqual(report.status, 'success');
  assert.deepStrictEqual(report.errors, []);
  assert.deepStrictEqual(report.summary, testCase.expectedSummary);
  assert.ok(report.stats && report.stats.skill_spec, 'expected skill_spec stats to be present');
  if (testCase.expectedWarnings) {
    for (const expectedWarning of testCase.expectedWarnings) {
      assert.ok(
        report.warnings.some((item) => item.includes(expectedWarning)),
        `expected warning "${expectedWarning}" for ${testCase.name}, got:\n${report.warnings.join('\n')}`
      );
    }
  }
}

function main() {
  for (const testCase of validCases) {
    runValidCase(testCase);
  }

  for (const testCase of invalidCases) {
    runInvalidCase(testCase);
  }

  console.log(
    `registry test passed: ${validCases.length} valid fixture(s) and ${invalidCases.length} invalid fixture(s) behave as expected`
  );
}

main();
