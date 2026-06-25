const path = require('path');
const { RunIdGenerator } = require('./run-id');
const { RunStore } = require('./run-store');
const { VisualReporter } = require('../visual/visual-reporter');

const RUN_SCHEMA_VERSION = '1.0.0';

function summarizeRequirement(text) {
  const normalized = String(text || '').trim().replace(/\s+/g, ' ');
  return normalized.slice(0, 80) || '未命名需求';
}

function relativeOrEmpty(rootDir, targetPath) {
  if (!targetPath) return '';
  if (!path.isAbsolute(targetPath)) return targetPath;
  const relative = path.relative(rootDir, targetPath);
  if (!path.isAbsolute(relative)) return (relative || '.').replace(/\\/g, '/');
  return '<external-path>';
}

function createEvent(type, message, detail = {}) {
  return {
    type,
    message,
    detail,
    createdAt: new Date().toISOString(),
  };
}

function createInitialRun(input) {
  const now = new Date().toISOString();
  return {
    schemaVersion: RUN_SCHEMA_VERSION,
    runId: input.runId,
    requirement: {
      rawText: input.requirement || '',
      summary: summarizeRequirement(input.requirement),
      type: input.type || 'feature',
    },
    state: 'initialized',
    stage: 'initialized',
    target: {
      rootDir: '.',
      packages: input.packages || [],
    },
    branch: {
      enabled: input.branchEnabled !== false,
      baseBranch: '',
      branchName: '',
      worktreeEnabled: input.worktreeEnabled !== false,
      worktreePath: '',
    },
    executor: {
      type: null,
      status: 'not_configured',
    },
    context: {
      built: false,
      stage: null,
      tokenEstimate: null,
    },
    circuitBreaker: {
      enabled: true,
      triggered: false,
      reason: null,
    },
    incidents: [],
    events: [
      createEvent('run_created', 'Run 已创建'),
    ],
    createdAt: now,
    updatedAt: now,
  };
}

class RunService {
  constructor(options = {}) {
    this.store = options.store || new RunStore();
    this.idGenerator = options.idGenerator || new RunIdGenerator();
    this.visualReporter = options.visualReporter || new VisualReporter();
    this.visualOptions = options.visualOptions || {};
  }

  createRun(input = {}) {
    const rootDir = path.resolve(input.rootDir || process.cwd());
    const runId = input.runId || this.idGenerator.generate(input.requirement || '');
    const run = createInitialRun({
      ...input,
      runId,
    });
    const saved = this.store.save(rootDir, run);
    this.visualReporter.reportRunEventNonBlocking(rootDir, saved, saved.events[0], {
      ...this.visualOptions,
      type: 'spec_started',
      eventId: `${saved.runId}:spec_started:0`,
      payload: {
        requirementSummary: saved.requirement.summary,
      },
    });
    return saved;
  }

  loadRun(rootDir, runId) {
    return this.store.load(path.resolve(rootDir || process.cwd()), runId);
  }

  loadLatestRun(rootDir) {
    return this.store.loadLatest(path.resolve(rootDir || process.cwd()));
  }

  saveRun(rootDir, run) {
    return this.store.save(path.resolve(rootDir || process.cwd()), run);
  }

  updateRun(rootDir, runId, updater) {
    const run = this.loadRun(rootDir, runId);
    const next = updater({ ...run });
    return this.saveRun(rootDir, next);
  }

  transition(rootDir, runId, nextState, reason, detail = {}) {
    return this.updateRun(rootDir, runId, (run) => {
      const previousState = run.state;
      run.state = nextState;
      run.stage = nextState;
      run.events = run.events || [];
      const event = createEvent('state_transition', reason || `状态流转到 ${nextState}`, {
        from: previousState,
        to: nextState,
        ...detail,
      });
      run.events.push(event);
      setImmediate(() => {
        try {
          this.visualReporter.reportRunEventNonBlocking(rootDir, run, event, {
            ...this.visualOptions,
            type: 'state_transition',
            state: nextState,
            stage: nextState,
            payload: event.detail,
          });
        } catch (_error) {
          // Visual 上报必须是非阻断路径。
        }
      });
      return run;
    });
  }

  appendEvent(rootDir, runId, type, message, detail = {}) {
    return this.updateRun(rootDir, runId, (run) => {
      run.events = run.events || [];
      const event = createEvent(type, message, detail);
      run.events.push(event);
      setImmediate(() => {
        try {
          this.visualReporter.reportRunEventNonBlocking(rootDir, run, event, {
            ...this.visualOptions,
            type: mapEventType(type),
            payload: detail,
          });
          if (type === 'context_built' || type === 'executor_finished') {
            this.visualReporter.reportHistoryNonBlocking(rootDir, run, {
              ...this.visualOptions,
              historyId: `history:${run.runId}:${type}`,
              summary: message,
              changedFiles: detail.changedFiles || run.executor?.lastResult?.changedFiles || [],
            });
          }
        } catch (_error) {
          // Visual 上报必须是非阻断路径。
        }
      });
      return run;
    });
  }

  appendIncident(rootDir, runId, incident) {
    return this.updateRun(rootDir, runId, (run) => {
      run.incidents = run.incidents || [];
      run.incidents.push({
        incidentId: incident.incidentId,
        type: incident.type,
        level: incident.level,
        stage: incident.stage,
        message: incident.message,
      });
      return run;
    });
  }

  updateBranch(rootDir, runId, branch, originalRootDir = rootDir) {
    return this.updateRun(rootDir, runId, (run) => {
      run.branch = {
        ...run.branch,
        ...branch,
        worktreePath: relativeOrEmpty(originalRootDir, branch.worktreePath || run.branch?.worktreePath || ''),
      };
      return run;
    });
  }

  updateContext(rootDir, runId, context) {
    return this.updateRun(rootDir, runId, (run) => {
      run.context = {
        built: true,
        stage: context.stage,
        tokenEstimate: context.tokenEstimate,
      };
      return run;
    });
  }

  updateExecutor(rootDir, runId, executor) {
    return this.updateRun(rootDir, runId, (run) => {
      run.executor = {
        ...(run.executor || {}),
        ...executor,
      };
      run.events = run.events || [];
      const event = createEvent('executor_updated', '执行器状态已更新', {
        type: run.executor.type || null,
        status: run.executor.status || null,
      });
      run.events.push(event);
      setImmediate(() => {
        try {
          const mappedType = run.executor.status === 'failed' || run.executor.status === 'timeout'
            ? 'executor_failed'
            : run.executor.status === 'succeeded' || run.executor.status === 'skipped' || run.executor.status === 'human_review_required'
              ? 'executor_completed'
              : 'executor_selected';
          this.visualReporter.reportRunEventNonBlocking(rootDir, run, event, {
            ...this.visualOptions,
            type: mappedType,
            level: mappedType === 'executor_failed' ? 'error' : 'info',
            executor: run.executor.type || '',
            payload: {
              status: run.executor.status || null,
              selectionReason: run.executor.selectionReason || '',
              changedFiles: run.executor.lastResult?.changedFiles || [],
            },
          });
        } catch (_error) {
          // Visual 上报必须是非阻断路径。
        }
      });
      return run;
    });
  }
}

function mapEventType(type) {
  if (type === 'context_built') return 'context_built';
  if (type === 'executor_updated') return 'executor_selected';
  if (type === 'executor_finished') return 'executor_completed';
  if (type === 'planning_completed') return 'stage_completed';
  if (String(type).includes('failed')) return 'stage_failed';
  return type || 'runtime_event';
}

module.exports = {
  RUN_SCHEMA_VERSION,
  RunService,
  createEvent,
  createInitialRun,
  relativeOrEmpty,
  summarizeRequirement,
};
