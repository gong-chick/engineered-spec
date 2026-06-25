const assert = require('assert');

const {
  collectRelatedAssetIdsFromScenarios,
  mergeSelectionWithDerivedIds,
} = require('../../internal/hub-sync-selection');

function createSelection(mode, values = []) {
  return {
    mode,
    values: new Set(values),
  };
}

function main() {
  const localScenarios = {
    'change-to-release': {
      roles: ['build-specialist', 'e2e-test-specialist'],
      skills: ['create-test'],
    },
    'change-to-architecture-review': {
      roles: ['architecture-advisor'],
      skills: [],
    },
  };
  const localRoles = {
    'build-specialist': {
      skill_priority: ['config-and-secret-scan'],
    },
    'e2e-test-specialist': {
      skill_priority: ['ui-verification'],
      micro_skill_allowlist: ['web-design-guidelines'],
    },
    'architecture-advisor': {
      skill_priority: ['create-proposal', 'dependency-impact-graph'],
    },
  };

  const derived = collectRelatedAssetIdsFromScenarios({
    scenarioIds: ['change-to-release'],
    localScenarios,
    localRoles,
  });

  assert.deepStrictEqual(derived.roleIds, ['build-specialist', 'e2e-test-specialist']);
  assert.deepStrictEqual(derived.skillIds, [
    'create-test',
    'config-and-secret-scan',
    'ui-verification',
    'web-design-guidelines',
  ]);

  const derivedOnly = mergeSelectionWithDerivedIds({
    selection: createSelection('all'),
    selectionSpecified: false,
    derivedIds: derived.roleIds,
    preferDerivedWhenImplicitAll: true,
  });
  assert.strictEqual(derivedOnly.mode, 'pick');
  assert.deepStrictEqual(Array.from(derivedOnly.values), ['build-specialist', 'e2e-test-specialist']);

  const mergedPick = mergeSelectionWithDerivedIds({
    selection: createSelection('pick', ['architecture-advisor']),
    selectionSpecified: true,
    derivedIds: derived.roleIds,
    preferDerivedWhenImplicitAll: true,
  });
  assert.strictEqual(mergedPick.mode, 'pick');
  assert.deepStrictEqual(Array.from(mergedPick.values), [
    'architecture-advisor',
    'build-specialist',
    'e2e-test-specialist',
  ]);

  const explicitNone = mergeSelectionWithDerivedIds({
    selection: createSelection('none'),
    selectionSpecified: true,
    derivedIds: derived.roleIds,
    preferDerivedWhenImplicitAll: true,
  });
  assert.strictEqual(explicitNone.mode, 'none');
  assert.deepStrictEqual(Array.from(explicitNone.values), []);

  console.log('hub-sync selection logic test passed');
}

main();
