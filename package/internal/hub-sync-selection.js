function uniqueKeepOrder(items) {
  const output = [];
  const seen = new Set();
  for (const item of items || []) {
    if (!item || seen.has(item)) continue;
    seen.add(item);
    output.push(item);
  }
  return output;
}

function collectRelatedAssetIdsFromScenarios({ scenarioIds, localScenarios, localRoles }) {
  const roleIds = [];
  const skillIds = [];

  for (const scenarioId of scenarioIds || []) {
    const scenario = localScenarios?.[scenarioId];
    if (!scenario) continue;

    roleIds.push(...(Array.isArray(scenario.roles) ? scenario.roles : []));
    skillIds.push(...(Array.isArray(scenario.skills) ? scenario.skills : []));

    for (const roleId of Array.isArray(scenario.roles) ? scenario.roles : []) {
      const role = localRoles?.[roleId];
      if (!role) continue;
      skillIds.push(...(Array.isArray(role.skill_priority) ? role.skill_priority : []));
      skillIds.push(...(Array.isArray(role.micro_skill_allowlist) ? role.micro_skill_allowlist : []));
      skillIds.push(...(Array.isArray(role.preferred_skills) ? role.preferred_skills : []));
    }
  }

  return {
    roleIds: uniqueKeepOrder(roleIds),
    skillIds: uniqueKeepOrder(skillIds),
  };
}

function mergeSelectionWithDerivedIds({
  selection,
  selectionSpecified,
  derivedIds,
  preferDerivedWhenImplicitAll,
}) {
  if (!selection || selection.mode === 'none') {
    return selection || { mode: 'none', values: new Set() };
  }

  const derivedValues = uniqueKeepOrder(derivedIds);
  if (selection.mode === 'pick') {
    return {
      mode: 'pick',
      values: new Set([...selection.values, ...derivedValues]),
    };
  }

  if (!selectionSpecified && preferDerivedWhenImplicitAll && derivedValues.length > 0) {
    return {
      mode: 'pick',
      values: new Set(derivedValues),
    };
  }

  return selection;
}

module.exports = {
  collectRelatedAssetIdsFromScenarios,
  mergeSelectionWithDerivedIds,
};
