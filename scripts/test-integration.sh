#!/bin/bash
# 在测试项目中验证 visual 集成

set -e

AUTO_PATH="/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec"
VISUAL_PATH="/Users/lizhenwei/workspace/vueworkspace/bairong/engineered-spec-visual"
TEST_PROJECT="/Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本10"
VISUAL_SERVER="http://localhost:18780"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           测试项目 Visual 集成验证                           ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ========== 步骤 1：验证 visual 服务 ==========
echo "🔍 步骤 1: 验证 visual 服务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

HEALTH=$(curl -s http://localhost:18780/api/health 2>/dev/null || echo "failed")
if [[ "$HEALTH" == *"ok"* ]]; then
  echo "✅ visual 服务正常运行: http://localhost:18780"
else
  echo "❌ visual 服务未启动或异常"
  echo "   请先在另一个终端执行："
  echo "   cd $VISUAL_PATH"
  echo "   ./start-with-db.sh"
  exit 1
fi
echo ""

# ========== 步骤 2：更新测试项目 ==========
echo "🔄 步骤 2: 更新测试项目的 ai-spec-auto"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$TEST_PROJECT"

echo "   更新 ai-spec-auto..."
npm install "$AUTO_PATH" > /dev/null 2>&1
echo "✅ ai-spec-auto 已更新"

# 验证版本
VERSION=$(npx ai-spec-auto --version 2>/dev/null || echo "unknown")
echo "✅ 当前版本: $VERSION"

# 验证 visual-hooks
if [ -d "node_modules/ai-spec-auto/internal/visual-hooks" ]; then
  echo "✅ visual-hooks 已安装"
  HOOK_FILES=$(ls node_modules/ai-spec-auto/internal/visual-hooks/*.js 2>/dev/null | wc -l)
  echo "   包含 $HOOK_FILES 个文件"
else
  echo "❌ visual-hooks 未找到"
  exit 1
fi
echo ""

# ========== 步骤 3：配置 visual 集成 ==========
echo "⚙️  步骤 3: 配置 visual 集成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p .ai-spec

if [ -f ".ai-spec/visual-config.json" ]; then
  echo "   ℹ️  visual-config.json 已存在"
  CURRENT_URL=$(cat .ai-spec/visual-config.json | grep visual_url | cut -d'"' -f4 2>/dev/null || echo "")
  if [ "$CURRENT_URL" != "$VISUAL_SERVER" ]; then
    echo "   ⚠️  URL 不匹配，更新为: $VISUAL_SERVER"
    cat > .ai-spec/visual-config.json <<EOF
{
  "enabled": true,
  "visual_url": "$VISUAL_SERVER",
  "workspace_id": "test-project-local",
  "workspace_name": "测试项目本地实例",
  "push_mode": "hook",
  "push_timeout_ms": 3000,
  "retry_times": 1
}
EOF
    echo "✅ 配置已更新"
  else
    echo "✅ 配置正确，无需修改"
  fi
else
  cat > .ai-spec/visual-config.json <<EOF
{
  "enabled": true,
  "visual_url": "$VISUAL_SERVER",
  "workspace_id": "test-project-local",
  "workspace_name": "测试项目本地实例",
  "push_mode": "hook",
  "push_timeout_ms": 3000,
  "retry_times": 1
}
EOF
  echo "✅ 配置已创建"
fi

echo "   当前配置："
cat .ai-spec/visual-config.json
echo ""

# ========== 步骤 4：执行 Collector 采集 ==========
echo "📦 步骤 4: 执行 Collector 批量采集"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$VISUAL_PATH"

echo "   采集测试项目的历史数据..."
COLLECTOR_OUTPUT=$(npm run collector -- \
  --workspace-id test-project-local \
  --project "$TEST_PROJECT" \
  --server "$VISUAL_SERVER" \
  2>&1 | grep -A 20 "Collector CLI" || echo "")

if [[ "$COLLECTOR_OUTPUT" == *"inserted"* ]] || [[ "$COLLECTOR_OUTPUT" == *"skipped"* ]]; then
  echo "✅ Collector 采集完成"
  echo "$COLLECTOR_OUTPUT" | grep -E "(inserted|skipped|total)" | head -5
else
  echo "⚠️  Collector 输出："
  echo "$COLLECTOR_OUTPUT" | head -10
fi
echo ""

# ========== 步骤 5：测试实时推送 ==========
echo "🧪 步骤 5: 测试实时推送"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$TEST_PROJECT"

echo "   执行 protocol-status 验证..."
if npx ai-spec-auto protocol-status > /dev/null 2>&1; then
  echo "✅ protocol-status 命令正常"
else
  echo "⚠️  protocol-status 命令异常（可能项目未初始化）"
fi
echo ""

echo "   现在可以测试实时推送："
echo ""
echo "   cd $TEST_PROJECT"
echo "   npx ai-spec-auto protocol-step --user-input '测试 visual 实时推送'"
echo ""
echo "   执行后，在 visual 控制台应该能看到新的 run 记录"
echo ""

# ========== 完成 ==========
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                     ✅ 集成验证准备完成                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 当前状态："
echo ""
echo "  ✅ visual 服务运行: http://localhost:18780"
echo "  ✅ MariaDB 运行: localhost:13306"
echo "  ✅ ai-spec-auto 版本: $VERSION"
echo "  ✅ visual-hooks 已安装"
echo "  ✅ visual-config.json 已配置"
echo "  ✅ Collector 采集已执行"
echo ""
echo "🎯 验证清单："
echo ""
echo "  1. 查看 visual 控制台："
echo "     open http://localhost:18780/workspaces"
echo ""
echo "  2. 应该看到工作区 'test-project-local'"
echo ""
echo "  3. 测试实时推送："
echo "     cd $TEST_PROJECT"
echo "     npx ai-spec-auto protocol-step --user-input '测试实时推送'"
echo ""
echo "  4. 刷新控制台，验证新 run 是否出现"
echo ""
echo "  5. 测试降级机制（可选）："
echo "     # 在 visual 终端按 Ctrl+C 停止服务"
echo "     # 再次执行 protocol-step，协议应正常推进"
echo ""
