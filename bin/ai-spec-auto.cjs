#!/usr/bin/env node
var cp = require('child_process');
var path = require('path');
var cliPath = path.join(__dirname, 'cli.js');
cp.execFileSync('node', [cliPath].concat(process.argv.slice(2)), {
  stdio: 'inherit',
  cwd: process.cwd(),
  env: process.env
});
