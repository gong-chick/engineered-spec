const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createNextProject(prefix) {
  const root = createTempDir(prefix);
  writeJson(path.join(root, 'package.json'), {
    name: 'visual-next-demo',
    dependencies: { next: '^16.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
  });
  writeText(path.join(root, 'src/app/layout.tsx'), 'export default function Layout({ children }) { return children; }\n');
  return root;
}

function runCliAsync(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', ['./bin/cli.js', ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AI_SPEC_SKIP_LAUNCHER_SYNC: '1',
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function wait(ms = 50) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function startVisualServer(options = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : null;
      requests.push({ method: req.method, url: req.url, body });
      const send = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (options.failAll) {
        send(500, {
          success: false,
          data: null,
          error: { code: 'VISUAL_DOWN', message: 'Visual 不可用', suggestion: '请稍后重试' },
          requestId: 'test',
          timestamp: new Date().toISOString(),
        });
        return;
      }
      send(200, {
        success: true,
        data: { accepted: true, url: req.url },
        error: null,
        requestId: 'test',
        timestamp: new Date().toISOString(),
      });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = {
  createNextProject,
  createTempDir,
  readJson,
  repoRoot,
  runCliAsync,
  startVisualServer,
  wait,
  writeJson,
  writeText,
};
