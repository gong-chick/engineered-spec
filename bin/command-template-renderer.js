const fs = require('fs');

const LOCAL_CLI_PATTERN = /\.\/node_modules\/\.bin\/ai-spec-auto/g;

function resolveGlobalLauncherCommand(platform = process.platform) {
  if (platform === 'win32') {
    return '"%USERPROFILE%\\.ai-spec-auto\\bin\\ai-spec-auto.cmd"';
  }
  return '"$HOME/.ai-spec-auto/bin/ai-spec-auto"';
}

function renderCommandTemplateContent(content, options = {}) {
  const launcherCommand = options.launcherCommand;
  let rendered = launcherCommand
    ? String(content).replace(LOCAL_CLI_PATTERN, launcherCommand)
    : String(content);

  if (options.forceLocalProtocol) {
    const prefix = options.platform === 'win32'
      ? 'set ENGINEERED_SPEC_FORCE_LOCAL_PROTOCOL=1 && '
      : 'ENGINEERED_SPEC_FORCE_LOCAL_PROTOCOL=1 ';
    rendered = rendered.replace(
      /^(\s*)(\.\/node_modules\/\.bin\/ai-spec-auto\s+protocol-(?:step|update|advance|stop|status)\b)/gm,
      (_match, indent, command) => `${indent}${prefix}${command}`,
    );
  }

  return rendered;
}

function readRenderedCommandTemplate(sourcePath, options = {}) {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  return renderCommandTemplateContent(raw, options);
}

module.exports = {
  resolveGlobalLauncherCommand,
  renderCommandTemplateContent,
  readRenderedCommandTemplate,
};
