const { spawnSync } = require('child_process');

function runGit(repoRoot, args, options = {}) {
  if (!repoRoot) {
    throw new Error('缺少 repoRoot，无法执行 git 命令');
  }
  const result = spawnSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...(options.env || {}),
    },
  });
  const output = {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    args,
  };
  if (!output.ok && !options.allowFailure) {
    const detail = (output.stderr || output.stdout || '').trim();
    throw new Error(`git 命令执行失败：git ${args.join(' ')}${detail ? `，${detail}` : ''}`);
  }
  return output;
}

function isGitAvailable() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  return result.status === 0;
}

module.exports = {
  isGitAvailable,
  runGit,
};
