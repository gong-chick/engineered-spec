#!/bin/bash
# 快速更新测试项目的 ai-spec-auto 和配置 visual

set -e

AUTO_PATH="/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec"
TEST_PROJECT="/Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本10"
VISUAL_SERVER="http://localhost:3000"

echo "=== 更新测试项目 ai-spec-auto ==="
echo ""

# 1. 更新 ai-spec-auto
echo "1️⃣  更新 ai-spec-auto..."
cd "$TEST_PROJECT"
npm install "$AUTO_PATH"
echo "   ✅ ai-spec-auto 更新完成"
echo ""

# 2. 验证更新
echo "2️⃣  验证更新..."
VERSION=$(npx ai-spec-auto --version 2>/dev/null || echo "unknown")
echo "   当前版本: $VERSION"

if [ -d "node_modules/ai-spec-auto/internal/visual-hooks" ]; then
  echo "   ✅ visual-hooks 已安装"
else
  echo "   ❌ visual-hooks 未找到，请检查"
  exit 1
fi

if [ -f "node_modules/ai-spec-auto/.ai-spec/visual-config.example.json" ]; then
  echo "   ✅ visual-config.example.json 存在"
else
  echo "   ⚠️  visual-config.example.json 未找到"
fi
echo ""

# 3. 创建或更新 visual 配置
echo "3️⃣  配置 visual 集成..."
mkdir -p .ai-spec

if [ -f ".ai-spec/visual-config.json" ]; then
  echo "   ℹ️  visual-config.json 已存在，跳过"
  cat .ai-spec/visual-config.json
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
  echo "   ✅ visual-config.json 已创建"
fi
echo ""

# 4. 测试协议命令
echo "4️⃣  测试协议命令..."
if npx ai-spec-auto protocol-status > /dev/null 2>&1; then
  echo "   ✅ protocol-status 命令正常"
else
  echo "   ⚠️  protocol-status 命令异常（可能项目未初始化 run）"
fi
echo ""

# 5. 显示下一步操作
echo "=== 更新完成 ==="
echo ""
echo "📋 下一步操作："
echo ""
echo "  1. 启动 visual 服务（如果尚未启动）："
echo "     cd /Users/lizhenwei/workspace/vueworkspace/bairong/engineered-spec-visual"
echo "     docker-compose up -d"
echo ""
echo "  2. 执行 Collector 批量采集："
echo "     cd /Users/lizhenwei/workspace/vueworkspace/bairong/engineered-spec-visual"
echo "     npm run collector -- \\"
echo "       --workspace-id test-project-local \\"
echo "       --project $TEST_PROJECT \\"
echo "       --server http://localhost:3000"
echo ""
echo "  3. 启动新 run 测试实时推送："
echo "     cd $TEST_PROJECT"
echo "     npx ai-spec-auto protocol-step --user-input '测试 visual 集成'"
echo ""
echo "  4. 在浏览器查看控制台："
echo "     open http://localhost:3000/workspaces"
echo ""
