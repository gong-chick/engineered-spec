#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const https = require('https');

function printUsage() {
  console.log(`Usage:
  ai-spec-auto visual-bridge push-current [options]

Options:
  --target <dir>         Target project directory (default: .)
  --server-url <url>     Visual platform base URL
  --workspace-id <id>    Workspace id
  --agent-id <id>        Agent id
  --connect-token <tok>  Connect token
  --event-name <name>    Event label override (default: runtime-state-updated)
  --json                 Print JSON result
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {
    target: '.',
    eventName: 'runtime-state-updated',
    json: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--target':
        options.target = args.shift();
        break;
      case '--server-url':
        options.serverUrl = args.shift();
        break;
      case '--workspace-id':
        options.workspaceId = args.shift();
        break;
      case '--agent-id':
        options.agentId = args.shift();
        break;
      case '--connect-token':
        options.connectToken = args.shift();
        break;
      case '--event-name':
        options.eventName = args.shift();
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { command, options };
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  const entries = Object.entries(value).sort(([left], [right]) => left.localeCompare(right));
  return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`).join(',')}}`;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function resolveVisualBridgePath(targetDir) {
  return path.join(targetDir, '.ai-spec', 'visual-bridge.json');
}

function loadVisualBridgeConfig(targetDir, overrides = {}) {
  const configPath = resolveVisualBridgePath(targetDir);
  const fileConfig = fs.existsSync(configPath) ? readJsonFile(configPath) : {};
  const merged = {
    enabled: fileConfig.enabled !== false,
    server_url:
      overrides.serverUrl ||
      process.env.AI_SPEC_VISUAL_SERVER_URL ||
      fileConfig.server_url ||
      null,
    workspace_id:
      overrides.workspaceId ||
      process.env.AI_SPEC_VISUAL_WORKSPACE_ID ||
      fileConfig.workspace_id ||
      null,
    agent_id:
      overrides.agentId ||
      process.env.AI_SPEC_VISUAL_AGENT_ID ||
      fileConfig.agent_id ||
      'ai-spec-auto',
    connect_token:
      overrides.connectToken ||
      process.env.AI_SPEC_VISUAL_CONNECT_TOKEN ||
      fileConfig.connect_token ||
      null,
  };

  return {
    ...merged,
    path: configPath,
  };
}

function buildRunStateRawEvent(state, targetDir, eventName) {
  const sourcePath = '.ai-spec/current-run.json';
  const updatedAt =
    state?.timestamps?.updated_at ||
    state?.timestamps?.created_at ||
    new Date().toISOString();
  const checksum = sha256(stableStringify(state));
  const eventKey = `${state.run_id}:${eventName}:${updatedAt}:${checksum.slice(0, 12)}`;
  return {
    workspaceId: null,
    sourceKind: 'run-state-json',
    sourcePath,
    eventType: `runtime-state.${eventName}`,
    eventKey,
    dedupeKey: sha256(`run-state-json|${targetDir}|${eventKey}|${checksum}`),
    checksum,
    occurredAt: updatedAt,
    entityType: 'run-state',
    entityId: state.run_id,
    payload: state,
  };
}

function postJson(urlString, body) {
  const url = new URL(urlString);
  const payload = Buffer.from(JSON.stringify(body));
  const client = url.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const req = client.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': payload.length,
        },
      },
      (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed = null;
          try {
            parsed = raw ? JSON.parse(raw) : null;
          } catch (error) {
            return reject(error);
          }

          if (res.statusCode >= 400) {
            return reject(new Error(`visual bridge request failed: ${res.statusCode}`));
          }

          resolve(parsed);
        });
      },
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function pushRunStateUpdate({
  targetDir,
  eventName = 'runtime-state-updated',
  state = null,
  serverUrl = null,
  workspaceId = null,
  agentId = null,
  connectToken = null,
}) {
  const resolvedTargetDir = path.resolve(process.cwd(), targetDir || '.');
  const bridge = loadVisualBridgeConfig(resolvedTargetDir, {
    serverUrl,
    workspaceId,
    agentId,
    connectToken,
  });
  if (!bridge.enabled || !bridge.server_url || !bridge.workspace_id || !bridge.connect_token) {
    return {
      ok: false,
      skipped: true,
      reason: 'bridge-disabled-or-incomplete',
    };
  }

  const runtimeState =
    state ||
    readJsonFile(path.join(resolvedTargetDir, '.ai-spec', 'current-run.json'));
  const rawEvent = buildRunStateRawEvent(runtimeState, resolvedTargetDir, eventName);

  const response = await postJson(new URL('/api/internal/ingest/run-state', bridge.server_url).toString(), {
    workspace_id: bridge.workspace_id,
    agent_id: bridge.agent_id,
    connect_token: bridge.connect_token,
    source_kind: 'run-state-json',
    raw_events: [rawEvent],
  });

  return {
    ok: true,
    target: resolvedTargetDir,
    bridge,
    rawEvent,
    response,
  };
}

async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || options.help || command === 'help') {
    printUsage();
    return 0;
  }

  if (command !== 'push-current') {
    throw new Error(`Unsupported visual-bridge command: ${command}`);
  }

  const result = await pushRunStateUpdate({
    targetDir: options.target,
    eventName: options.eventName,
    serverUrl: options.serverUrl,
    workspaceId: options.workspaceId,
    agentId: options.agentId,
    connectToken: options.connectToken,
  });

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    console.log(`visual bridge pushed: ${result.rawEvent.entityId}`);
  } else {
    console.log(`visual bridge skipped: ${result.reason}`);
  }

  return 0;
}

if (require.main === module) {
  main().then(
    (exitCode) => process.exit(exitCode),
    (error) => {
      console.error(`visual-bridge error: ${error.message}`);
      process.exit(1);
    },
  );
}

module.exports = {
  parseArgs,
  loadVisualBridgeConfig,
  buildRunStateRawEvent,
  pushRunStateUpdate,
  main,
};
