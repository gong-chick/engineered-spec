#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PACKAGE_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

TARGET_DIR="${1:-/Users/lizhenwei/workspace/test/test-ai-spec/ai-spec-cursor-test}"
PACKAGE_NAME="${AI_SPEC_PACKAGE_NAME:-$(node -e "process.stdout.write(require(process.argv[1]).name)" "${PACKAGE_ROOT}/package.json")}"
PACKAGE_VERSION="${AI_SPEC_MANIFEST_VERSION:-$(node -e "process.stdout.write(require(process.argv[1]).version)" "${PACKAGE_ROOT}/package.json")}"
PACKAGE_SPEC="${AI_SPEC_PACKAGE_SPEC:-${PACKAGE_NAME}@${PACKAGE_VERSION}}"
TIMESTAMP="$(date '+%Y%m%d-%H%M%S')"
SNAPSHOT_DIR="${PACKAGE_ROOT}/docs/paser_three/test-snapshots"
SNAPSHOT_PREFIX="${SNAPSHOT_DIR}/${TIMESTAMP}-${PACKAGE_VERSION}-post-publish"
SETUP_LOG="${SNAPSHOT_PREFIX}.setup.log"
SMOKE_JSON="${SNAPSHOT_PREFIX}.smoke.json"
AUTOFIX_JSON="${SNAPSHOT_PREFIX}.auto-fix.json"
SNAPSHOT_MD="${SNAPSHOT_PREFIX}.md"

STATUS_SETUP="pending"
STATUS_SMOKE="pending"
STATUS_AUTOFIX="pending"
STATUS_OVERALL="running"
ERROR_STEP=""
ERROR_MESSAGE=""
INSTALLED_VERSION="(not-installed)"
SMOKE_RUN_STATUS="(not-run)"
SMOKE_ARCHIVE_DIR="(not-run)"
AUTOFIX_FAILURE_ROLE="(not-run)"
AUTOFIX_GUARDIAN_ROLE="(not-run)"
AUTOFIX_VERIFICATION="(not-run)"
AUTOFIX_CHECKPOINTS="(not-run)"

mkdir -p "${SNAPSHOT_DIR}"
TARGET_DIR="$(cd "${TARGET_DIR}" && pwd 2>/dev/null || echo "${TARGET_DIR}")"

write_snapshot() {
  cat > "${SNAPSHOT_MD}" <<EOF
# 发版后验证快照

## 基本信息

- 时间：${TIMESTAMP}
- 包：\`${PACKAGE_SPEC}\`
- 目标项目：\`${TARGET_DIR}\`
- 已安装版本：\`${INSTALLED_VERSION}\`
- 总体状态：\`${STATUS_OVERALL}\`

## 验证结果

| 项目 | 状态 | 说明 |
| --- | --- | --- |
| 安装/同步 | ${STATUS_SETUP} | setup 脚本输出见 \`${SETUP_LOG}\` |
| smoke 闭环 | ${STATUS_SMOKE} | run_status=\`${SMOKE_RUN_STATUS}\`，archive=\`${SMOKE_ARCHIVE_DIR}\` |
| auto-fix 回环 | ${STATUS_AUTOFIX} | 首次失败角色=\`${AUTOFIX_FAILURE_ROLE}\`，修复后角色=\`${AUTOFIX_GUARDIAN_ROLE}\`，verification=\`${AUTOFIX_VERIFICATION}\`，checkpoint_count=\`${AUTOFIX_CHECKPOINTS}\` |

## 文件快照

- setup 日志：\`${SETUP_LOG}\`
- smoke JSON：\`${SMOKE_JSON}\`
- auto-fix JSON：\`${AUTOFIX_JSON}\`
- 当前快照：\`${SNAPSHOT_MD}\`

## 查看建议

1. 先看 \`${SNAPSHOT_MD}\`，确认总体状态与三项结果。
2. 再看 \`${SMOKE_JSON}\`，确认 demo-runtime-smoke 是否仍能走到归档成功。
3. 再看 \`${AUTOFIX_JSON}\`，确认失败后只回 implementer 一次，并进入 guardian。
4. 如果要看临时验证目录，可打开：
   - \`${TARGET_DIR}/.tmp/runtime-smoke-demo\`
   - \`${TARGET_DIR}/.tmp/auto-fix-cli-demo\`

## 清理方式

如果你看完要删除本轮快照，可执行：

\`\`\`bash
rm -f "${SETUP_LOG}" "${SMOKE_JSON}" "${AUTOFIX_JSON}" "${SNAPSHOT_MD}"
\`\`\`

如果你连测试临时目录也一起清掉，可再执行：

\`\`\`bash
rm -rf "${TARGET_DIR}/.tmp/runtime-smoke-demo" "${TARGET_DIR}/.tmp/auto-fix-cli-demo"
\`\`\`
EOF

  if [[ -n "${ERROR_STEP}" || -n "${ERROR_MESSAGE}" ]]; then
    {
      echo
      echo "## 异常信息"
      echo
      echo "- 失败步骤：\`${ERROR_STEP:-unknown}\`"
      echo "- 失败原因：\`${ERROR_MESSAGE:-unknown}\`"
    } >> "${SNAPSHOT_MD}"
  fi
}

trap write_snapshot EXIT

run_step() {
  local step_name="$1"
  shift
  echo "==> ${step_name}"
  "$@"
}

capture_installed_version() {
  INSTALLED_VERSION="$(node -e "const path=require('path');const name=process.argv[1];const target=process.argv[2];const file=path.join(target,'node_modules',...name.split('/'),'package.json');process.stdout.write(require(file).version);" "${PACKAGE_NAME}" "${TARGET_DIR}" 2>/dev/null || true)"
  if [[ -z "${INSTALLED_VERSION}" ]]; then
    INSTALLED_VERSION="(not-installed)"
  fi
}

capture_smoke_summary() {
  SMOKE_RUN_STATUS="$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String((j.current_run && j.current_run.status) || (j.summary && j.summary.run_status) || j.run_status || '(unknown)'));" "${SMOKE_JSON}" 2>/dev/null || echo '(unknown)')"
  SMOKE_ARCHIVE_DIR="$(node -e "const fs=require('fs');const path=require('path');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));const proposal=j.current_run&&j.current_run.artifacts&&j.current_run.artifacts.proposal;process.stdout.write(String(proposal ? path.dirname(proposal) : ((j.summary && j.summary.archive_dir) || j.archive_dir || '(none)')));" "${SMOKE_JSON}" 2>/dev/null || echo '(unknown)')"
}

capture_autofix_summary() {
  AUTOFIX_FAILURE_ROLE="$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String((j.first_failure && j.first_failure.current_role) || '(unknown)'));" "${AUTOFIX_JSON}" 2>/dev/null || echo '(unknown)')"
  AUTOFIX_GUARDIAN_ROLE="$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String((j.after_fix && j.after_fix.current_role) || '(unknown)'));" "${AUTOFIX_JSON}" 2>/dev/null || echo '(unknown)')"
  AUTOFIX_VERIFICATION="$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String((j.after_fix && j.after_fix.verification) || '(unknown)'));" "${AUTOFIX_JSON}" 2>/dev/null || echo '(unknown)')"
  AUTOFIX_CHECKPOINTS="$(node -e "const fs=require('fs');const j=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String((j.after_fix && j.after_fix.checkpoint_count) || '(unknown)'));" "${AUTOFIX_JSON}" 2>/dev/null || echo '(unknown)')"
}

main() {
  echo "==> package: ${PACKAGE_SPEC}"
  echo "==> target: ${TARGET_DIR}"
  echo "==> snapshot: ${SNAPSHOT_MD}"

  ERROR_STEP="setup"
  if bash "${PACKAGE_ROOT}/scripts/setup-cursor-spec-archive-test.sh" "${TARGET_DIR}" > "${SETUP_LOG}" 2>&1; then
    STATUS_SETUP="passed"
  else
    STATUS_SETUP="failed"
    STATUS_OVERALL="failed"
    ERROR_MESSAGE="setup-cursor-spec-archive-test.sh 执行失败，详情见 ${SETUP_LOG}"
    return 1
  fi
  capture_installed_version

  ERROR_STEP="smoke"
  rm -rf "${TARGET_DIR}/.tmp/runtime-smoke-demo"
  if (
    cd "${TARGET_DIR}"
    ./node_modules/.bin/ai-spec demo-runtime-smoke --target ./.tmp/runtime-smoke-demo --json > "${SMOKE_JSON}"
  ); then
    STATUS_SMOKE="passed"
    capture_smoke_summary
  else
    STATUS_SMOKE="failed"
    STATUS_OVERALL="failed"
    ERROR_MESSAGE="demo-runtime-smoke 执行失败，详情见 ${SMOKE_JSON}"
    return 1
  fi

  ERROR_STEP="auto-fix"
  if node "${PACKAGE_ROOT}/scripts/post-publish-auto-fix-check.js" --target-root "${TARGET_DIR}" --package-name "${PACKAGE_NAME}" --output "${AUTOFIX_JSON}" > /dev/null; then
    STATUS_AUTOFIX="passed"
    capture_autofix_summary
  else
    STATUS_AUTOFIX="failed"
    STATUS_OVERALL="failed"
    ERROR_MESSAGE="auto-fix CLI 验证失败，详情见 ${AUTOFIX_JSON}"
    return 1
  fi

  STATUS_OVERALL="passed"
  ERROR_STEP=""
  ERROR_MESSAGE=""
  echo "==> done"
  echo "snapshot: ${SNAPSHOT_MD}"
}

main "$@"
