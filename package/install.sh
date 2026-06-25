#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLI="$SCRIPT_DIR/bin/cli.js"

if ! command -v node >/dev/null 2>&1; then
  echo "✖ 未检测到 Node.js 环境，请先安装 Node.js 18+ 后重试。" >&2
  exit 1
fi

if [ ! -f "$CLI" ]; then
  echo "✖ 未找到 ai-spec-auto CLI: $CLI" >&2
  exit 1
fi

exec node "$CLI" "$@"
