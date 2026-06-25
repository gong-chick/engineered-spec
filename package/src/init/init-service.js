const { TechScannerEngine } = require('../scanner/engine');
const { resolveHubConfig } = require('../hub/hub-config');
const { HubClient } = require('../hub/hub-client');
const { toHubWorkspace, toProjectFacts } = require('../hub/project-facts');
const { InitPlanBuilder } = require('./init-plan');

class InitService {
  constructor(options = {}) {
    this.scanner = options.scanner || new TechScannerEngine();
    this.planBuilder = options.planBuilder || new InitPlanBuilder();
    this.hubClient = options.hubClient || new HubClient();
  }

  async createPlan(rootDir, options = {}) {
    const scanResult = await this.scanner.scan(rootDir, options.scanOptions || {});
    const hubConfig = resolveHubConfig(rootDir, options);
    if (options.manualManifestSlug) {
      return this.planBuilder.build(scanResult, {
        manualManifestSlug: options.manualManifestSlug,
        recommendationSource: 'manual',
        hubConfig,
        workspaceRoot: options.workspaceRoot,
      });
    }

    if (!hubConfig.url || hubConfig.enabled === false) {
      const plan = this.planBuilder.build(scanResult, {
        recommendationSource: 'local',
        hubConfig,
        workspaceRoot: options.workspaceRoot,
      });
      plan.warnings.push('未配置 Hub URL，已使用本地模式');
      return plan;
    }

    try {
      const hubRecommendations = await this.hubClient.recommendManifests({
        hubUrl: hubConfig.url,
        workspace: toHubWorkspace(scanResult),
        projectFacts: toProjectFacts(scanResult),
      });
      return this.planBuilder.build(scanResult, {
        hubRecommendations: hubRecommendations.recommendations || [],
        recommendationSource: 'hub',
        hubConfig,
        workspaceRoot: options.workspaceRoot,
      });
    } catch (error) {
      if (hubConfig.fallbackToLocal) {
        const plan = this.planBuilder.build(scanResult, {
          recommendationSource: 'local',
          hubConfig,
          workspaceRoot: options.workspaceRoot,
        });
        plan.warnings.push(`Hub 推荐失败，已降级本地推荐：${error.message}`);
        return plan;
      }
      throw error;
    }
  }
}

module.exports = {
  InitService,
};
