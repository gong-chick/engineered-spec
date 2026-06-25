const { BoundaryResolver } = require('./boundary/boundary-resolver');
const { FactExtractor } = require('./facts/fact-extractor');
const { DetectorRegistry } = require('./detectors/detector-registry');

function mergeDependencyMaps(...maps) {
  return maps.reduce((acc, item) => {
    for (const [name, meta] of Object.entries(item || {})) {
      acc[name] = meta;
    }
    return acc;
  }, {});
}

function buildPackageResult(facts, detection) {
  const primary = detection.primary || null;
  return {
    packageId: facts.packageId,
    name: facts.name || undefined,
    path: facts.relativePath,
    primary,
    candidates: detection.candidates,
    tags: detection.tags,
    recommendedManifest: primary?.manifestSlug || undefined,
    confidence: primary?.confidence || 0,
    reasons: primary?.reasons || [],
    buildTool: primary?.buildTool || undefined,
    language: primary?.language || undefined,
    testTools: facts.testTools || [],
    componentLibraries: facts.componentLibraries || [],
    packageManager: facts.packageManager || undefined,
  };
}

class TechScannerEngine {
  constructor(options = {}) {
    this.boundaryResolver = options.boundaryResolver || new BoundaryResolver();
    this.factExtractor = options.factExtractor || new FactExtractor();
    this.detectorRegistry = options.detectorRegistry || new DetectorRegistry();
  }

  async scan(rootDir, options = {}) {
    const workspace = this.boundaryResolver.resolve(rootDir, options);
    const rootFacts = this.factExtractor.extract({
      rootDir: workspace.rootDir,
      relativePath: '.',
      workspaceRoot: workspace.rootDir,
    });
    const packages = workspace.packages.map((pkg) => {
      const facts = this.factExtractor.extract({
        rootDir: pkg.rootDir,
        relativePath: pkg.relativePath,
        workspaceRoot: workspace.rootDir,
      });
      const detection = this.detectorRegistry.detect(facts);
      return buildPackageResult(facts, detection);
    });

    return {
      workspace: {
        rootDir: workspace.rootDir,
        type: workspace.type,
        packageManager: workspace.packageManager || rootFacts.packageManager || undefined,
        rootDependencies: mergeDependencyMaps(rootFacts.dependencies, rootFacts.devDependencies),
      },
      packages,
    };
  }
}

module.exports = {
  TechScannerEngine,
};
