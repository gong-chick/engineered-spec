#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_DIR="${1:-/Users/lizhenwei/workspace/test/test-ai-spec/ai-spec-cursor-test}"
PROFILE="${AI_SPEC_TEST_PROFILE:-vue}"
IDE="${AI_SPEC_TEST_IDE:-cursor}"
PACKAGE_NAME="${AI_SPEC_PACKAGE_NAME:-$(node -e "process.stdout.write(require(process.argv[1]).name)" "${PACKAGE_ROOT}/package.json")}"
PACKAGE_VERSION="${AI_SPEC_MANIFEST_VERSION:-$(node -e "process.stdout.write(require(process.argv[1]).version)" "${PACKAGE_ROOT}/package.json")}"
PACKAGE_SPEC="${AI_SPEC_PACKAGE_SPEC:-${PACKAGE_NAME}@${PACKAGE_VERSION}}"
INIT_EXTRA_ARGS="${AI_SPEC_INIT_EXTRA_ARGS:---no-uipro --no-lint --no-husky -y}"

mkdir -p "${TARGET_DIR}"
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
  "name": "cursor-spec-archive-test",
  "description": "Manual Cursor test manifest for specs + archive confirmation",
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
    "Manual Cursor installation for specs generation and archive confirmation validation"
  ]
}
EOF

echo "==> init"
(
  cd "${TARGET_DIR}"
  # shellcheck disable=SC2086
  "${RUNNER[@]}" init . --profile "${PROFILE}" --ide "${IDE}" ${INIT_EXTRA_ARGS}
)

echo "==> sync"
(
  cd "${TARGET_DIR}"
  "${RUNNER[@]}" sync . --manifest ./manifest.json
)

echo "==> validate registry"
(
  cd "${TARGET_DIR}"
  "${RUNNER[@]}" validate-registry
)

echo "==> done"
echo "manifest: ${MANIFEST_PATH}"
echo "manual test steps:"
echo "  1. reopen Cursor in ${TARGET_DIR}"
echo "  2. run: /spec-start 创建一个商品 mock 页面，只做演示版，数据本地 mock"
echo "  3. requirement 阶段后检查: openspec/changes/<change-id>/specs/ui/spec.md"
echo "  4. code-guardian 完成后，确认是否出现“是否归档”的摘要询问"
echo "  5. 输入: 同意归档"
echo "  6. 检查: openspec/specs/ui/spec.md 与 openspec/changes/archive/"
echo "  7. 若要测跳过归档，再跑一轮并输入: 先不归档"
