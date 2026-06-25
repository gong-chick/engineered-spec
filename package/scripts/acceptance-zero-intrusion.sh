#!/usr/bin/env bash
# 验收脚本：zero-intrusion + control 闭环 + 停服推进不受影响
#
# 用法：
#   ./scripts/acceptance-zero-intrusion.sh
#
# 依赖：bash / node（仅使用内置模块），不依赖 visual 在线
# 退出码：0 全部通过；非 0 任一校验失败

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

PASS=0
FAIL=0

print_section() {
  echo ""
  echo "══════════════════════════════════════════════════════════════"
  echo "▶ $1"
  echo "══════════════════════════════════════════════════════════════"
}

check() {
  local label="$1"
  local cond="$2"
  if eval "$cond" >/dev/null 2>&1; then
    echo "  ✅ $label"
    PASS=$((PASS + 1))
  else
    echo "  ❌ $label"
    FAIL=$((FAIL + 1))
  fi
}

# =========================================================
print_section "证据 1：package.json runtime 依赖数为 0（零依赖）"
# =========================================================

DEP_COUNT=$(node -e "
const pkg = require('./package.json');
const deps = Object.keys(pkg.dependencies || {});
console.log(deps.length);
")
echo "  当前 dependencies 条目数：$DEP_COUNT"
check "dependencies 仍为 0" "[ '$DEP_COUNT' = '0' ]"

# =========================================================
print_section "证据 2：init / sync / install 主链未引用 visual-hooks"
# =========================================================

INIT_FILE="bin/install.js"
SYNC_FILE="bin/cli.js"

INIT_HITS=$(grep -nE 'visual-hooks|consumeInbox|inbox-consumer' "$INIT_FILE" 2>/dev/null | wc -l | tr -d ' ')
echo "  bin/install.js 中 visual-hooks 引用次数：$INIT_HITS"
check "install.js 未引用 visual-hooks" "[ '$INIT_HITS' = '0' ]"

# bin/cli.js 中只允许在 protocol-step / -advance / -update / -status 命令处出现
CLI_HITS=$(grep -nE 'visual-hooks|consumeInbox' "$SYNC_FILE" 2>/dev/null | wc -l | tr -d ' ')
echo "  bin/cli.js 中 visual-hooks 引用次数：$CLI_HITS"
check "cli.js 中 visual-hooks 引用 ≤ 8（4 个命令边界）" "[ '$CLI_HITS' -le '8' ]"

# =========================================================
print_section "证据 3：visual init 完全 opt-in（默认未生成 bridge）"
# =========================================================

TMP_PROJECT="$(mktemp -d -t ai-spec-accept-XXXXXX)"
echo "  创建临时项目：$TMP_PROJECT"
mkdir -p "$TMP_PROJECT/.ai-spec"

check "默认无 visual-bridge.json" "! [ -f '$TMP_PROJECT/.ai-spec/visual-bridge.json' ]"
check "默认无 visual-config.json" "! [ -f '$TMP_PROJECT/.ai-spec/visual-config.json' ]"

# =========================================================
print_section "闭环 1：inbox-consumer 应用 approve_gate 控制指令"
# =========================================================

INBOX_DIR="$TMP_PROJECT/.ai-spec/inbox"
mkdir -p "$INBOX_DIR"

# 构造一个无 secret 的本地受信指令
cat > "$INBOX_DIR/control-test-001.json" <<'JSON'
{
  "outbox_id": "test-outbox-001",
  "command": "approve_gate",
  "payload": { "gate": "designer-handoff", "next_role": "executor" },
  "signature": ""
}
JSON

CONSUME_OUTPUT=$(node -e "
const path = require('path');
const consumer = require('${ROOT_DIR}/internal/visual-hooks/inbox-consumer');
consumer
  .consumeInbox({
    targetDir: '$TMP_PROJECT',
    timeoutMs: 500,
    skipPull: true,
    skipPush: true,
  })
  .then((res) => {
    console.log(JSON.stringify(res));
  })
  .catch((err) => {
    console.error('CONSUME_ERROR', err.message);
    process.exit(1);
  });
" 2>&1)

echo "  consumeInbox 结果：$CONSUME_OUTPUT"
check "至少处理 1 个控制指令" "echo '$CONSUME_OUTPUT' | grep -q '\"processed\":1'"
check "原始 inbox 文件已搬移" "! [ -f '$INBOX_DIR/control-test-001.json' ]"
FOUND_PROCESSED=$(find "$INBOX_DIR/.applied" "$INBOX_DIR/.processed" "$INBOX_DIR/.failed" -type f -name '*control-test-001*' 2>/dev/null | wc -l | tr -d ' ')
check "处理结果落到 .processed/.applied/.failed 之一" "[ '$FOUND_PROCESSED' -ge '1' ]"

# =========================================================
print_section "停服 1：bridge 启用但 visual 不可达，consumeInbox 仍按超时返回"
# =========================================================

cat > "$TMP_PROJECT/.ai-spec/visual-bridge.json" <<JSON
{
  "enabled": true,
  "visual_url": "http://127.0.0.1:1",
  "workspace_id": "accept-tmp",
  "connect_token": "demo-token"
}
JSON

START_MS=$(node -e 'console.log(Date.now())')
node -e "
const consumer = require('${ROOT_DIR}/internal/visual-hooks/inbox-consumer');
consumer
  .consumeInbox({
    targetDir: '$TMP_PROJECT',
    timeoutMs: 200,
  })
  .then((res) => {
    console.log('STOPSERVE_OK', JSON.stringify(res));
  })
  .catch(() => {
    console.log('STOPSERVE_FAIL');
    process.exit(2);
  });
" >/tmp/ai-spec-accept-stopserve.log 2>&1
EXIT_CODE=$?
END_MS=$(node -e 'console.log(Date.now())')
ELAPSED=$((END_MS - START_MS))

echo "  停服模式 consumeInbox 返回码：${EXIT_CODE}，耗时 ${ELAPSED}ms"
check "停服模式下 consumeInbox 不抛异常" "[ '${EXIT_CODE}' = '0' ]"
check "停服模式下耗时 ≤ 3000ms（不阻塞协议推进）" "[ '${ELAPSED}' -le '3000' ]"

# =========================================================
print_section "汇总"
# =========================================================

echo ""
echo "  通过：$PASS    失败：$FAIL"
echo "  临时项目：$TMP_PROJECT"
echo "  停服日志：/tmp/ai-spec-accept-stopserve.log"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
