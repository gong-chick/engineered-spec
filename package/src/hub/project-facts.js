function toProjectFacts(scanResult) {
  return (scanResult.packages || []).map((pkg) => ({
    packageId: pkg.packageId,
    path: pkg.path,
    projectKind: pkg.projectKind,
    primary: pkg.primary ? {
      domain: (pkg.primary.tags || []).includes('backend') ? 'backend' : (pkg.primary.tags || []).includes('frontend') ? 'frontend' : 'unknown',
      language: pkg.primary.language || [],
      frameworks: [pkg.primary.framework].filter(Boolean),
      confidence: pkg.primary.confidence || 0,
      manifestSlug: pkg.primary.manifestSlug || '',
      tags: pkg.primary.tags || [],
    } : null,
    candidates: pkg.candidates || [],
  }));
}

function toHubWorkspace(scanResult) {
  const workspace = scanResult.workspace || {};
  return {
    rootDir: '.',
    type: workspace.type || 'single-project',
    packageManager: workspace.packageManager || null,
    rootDependencies: workspace.rootDependencies || {},
  };
}

module.exports = {
  toProjectFacts,
  toHubWorkspace,
};
