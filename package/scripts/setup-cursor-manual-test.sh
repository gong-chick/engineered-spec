#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_DIR="${1:-.}"
PROFILE="${AI_SPEC_TEST_PROFILE:-vue}"
IDE="${AI_SPEC_TEST_IDE:-cursor}"
PACKAGE_NAME="${AI_SPEC_PACKAGE_NAME:-$(node -e "process.stdout.write(require(process.argv[1]).name)" "${PACKAGE_ROOT}/package.json")}"
PACKAGE_VERSION="${AI_SPEC_MANIFEST_VERSION:-$(node -e "process.stdout.write(require(process.argv[1]).version)" "${PACKAGE_ROOT}/package.json")}"
PACKAGE_SPEC="${AI_SPEC_PACKAGE_SPEC:-${PACKAGE_NAME}@${PACKAGE_VERSION}}"
INIT_EXTRA_ARGS="${AI_SPEC_INIT_EXTRA_ARGS:---no-uipro --no-lint --no-husky -y}"

TARGET_DIR="$(cd "${TARGET_DIR}" && pwd)"
MANIFEST_PATH="${TARGET_DIR}/manifest.json"

if command -v pnpm >/dev/null 2>&1; then
  RUNNER=(pnpm dlx "${PACKAGE_SPEC}")
else
  RUNNER=(npx "${PACKAGE_SPEC}")
fi

echo "==> target: ${TARGET_DIR}"
echo "==> package: ${PACKAGE_SPEC}"
echo "==> profile: ${PROFILE}"
echo "==> ide: ${IDE}"
echo "==> init args: ${INIT_EXTRA_ARGS}"
echo "==> runner: ${RUNNER[*]}"

echo "==> clean old ai-spec artifacts"
rm -rf \
  "${TARGET_DIR}/.agents" \
  "${TARGET_DIR}/.cursor" \
  "${TARGET_DIR}/.claude" \
  "${TARGET_DIR}/.ai-spec" \
  "${TARGET_DIR}/openspec"
rm -f \
  "${TARGET_DIR}/node_modules/.bin/ai-spec" \
  "${TARGET_DIR}/node_modules/.bin/ai-spec-auto" \
  "${TARGET_DIR}/node_modules/.bin/ai-spec-auto"

echo "==> write manifest.json"
cat > "${MANIFEST_PATH}" <<EOF
{
  "schema_version": 1,
  "manifest_type": "hub-install",
  "name": "cursor-manual-test",
  "description": "Manual test manifest for ${PACKAGE_NAME}@latest",
  "version": "${PACKAGE_VERSION}",
  "profile": "${PROFILE}",
  "ides": ["${IDE}"],
  "scenario_packages": ["frontend-basic"],
  "roles": [
    "task-orchestrator",
    "requirement-analyst",
    "frontend-implementer",
    "code-guardian",
    "archive-change"
  ],
  "skills": [
    "create-proposal",
    "design-analysis",
    "execute-task",
    "archive-change"
  ],
  "rules": [
    "coding-standard",
    "api-standard",
    "route-standard",
    "style-standard",
    "generic-constraints",
    "test-standard"
  ],
  "entry_role": "task-orchestrator",
  "notes": [
    "Manual Cursor installation and sync validation"
  ]
}
EOF

echo "==> init"
(
  cd "${TARGET_DIR}"
  # Current-stage manual testing focuses on /spec-start summary UX.
  # Skip optional installers and force non-interactive init to avoid waiting in silent OpenSpec setup.
  # shellcheck disable=SC2086
  "${RUNNER[@]}" init . --profile "${PROFILE}" --ide "${IDE}" ${INIT_EXTRA_ARGS}
)

echo "==> sync"
(
  cd "${TARGET_DIR}"
  "${RUNNER[@]}" sync . --manifest ./manifest.json
)

echo "==> check"
(
  cd "${TARGET_DIR}"
  "${RUNNER[@]}" check .
)

echo "==> done"
echo "manifest: ${MANIFEST_PATH}"
echo "next:"
echo "  1. reopen Cursor"
echo "  2. run /spec-start 创建一个好看的登录页面，没有UI，mock数据即可"
