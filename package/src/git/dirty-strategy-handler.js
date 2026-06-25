const { BlockDirtyStrategy } = require('./strategies/block-dirty-strategy');
const { IgnoreDirtyStrategy } = require('./strategies/ignore-dirty-strategy');
const { PatchSnapshotStrategy } = require('./strategies/patch-snapshot-strategy');
const { WipCommitStrategy } = require('./strategies/wip-commit-strategy');
const { normalizeDirtyStrategy } = require('./types');

class DirtyStrategyHandler {
  constructor(options = {}) {
    this.strategies = options.strategies || {
      block: new BlockDirtyStrategy(options),
      'patch-snapshot': new PatchSnapshotStrategy(options),
      'wip-commit': new WipCommitStrategy(options),
      ignore: new IgnoreDirtyStrategy(options),
    };
  }

  async handle(input = {}) {
    const strategy = normalizeDirtyStrategy(input.strategy);
    return this.strategies[strategy].handle({
      ...input,
      strategy,
      runId: input.runId || 'run-local',
    });
  }
}

module.exports = {
  DirtyStrategyHandler,
};
