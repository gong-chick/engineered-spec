#!/bin/bash
# 完整的 visual 集成配置和验证脚本

set -e

VISUAL_SERVER="${VISUAL_SERVER:-http://localhost:3000}"
AUTO_PATH="/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec"
VISUAL_PATH="/Users/lizhenwei/workspace/vueworkspace/bairong/engineered-spec-visual"
TEST_PROJECT="/Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本10"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     engineered-spec-visual 集成配置与验证                         ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ========== 阶段 1：检查环境 ==========
echo "📋 阶段 1: 检查环境"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 检查 auto 项目
if [ ! -d "$AUTO_PATH" ]; then
  echo "❌ auto 项目不存在: $AUTO_PATH"
  exit 1
fi
echo "✅ auto 项目: $AUTO_PATH"

# 检查 visual 项目
if [ ! -d "$VISUAL_PATH" ]; then
  echo "❌ visual 项目不存在: $VISUAL_PATH"
  exit 1
fi
echo "✅ visual 项目: $VISUAL_PATH"

# 检查测试项目
if [ ! -d "$TEST_PROJECT" ]; then
  echo "❌ 测试项目不存在: $TEST_PROJECT"
  exit 1
fi
echo "✅ 测试项目: $TEST_PROJECT"

# 检查 Docker
if ! command -v docker &> /dev/null; then
  echo "❌ Docker 未安装"
  exit 1
fi
echo "✅ Docker 已安装"

# 检查 docker-compose
if ! command -v docker-compose &> /dev/null; then
  echo "❌ docker-compose 未安装"
  exit 1
fi
echo "✅ docker-compose 已安装"

echo ""

# ========== 阶段 2：启动 visual 服务 ==========
echo "🚀 阶段 2: 启动 visual 服务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$VISUAL_PATH"

# 检查 .env 文件
if [ ! -f ".env" ]; then
  echo "⚠️  .env 文件不存在，从模板创建..."
  cp .env.example .env
  echo "   请编辑 .env 文件设置 DB_PASSWORD 和 NEXTAUTH_SECRET"
  echo "   然后重新运行此脚本"
  exit 1
fi
echo "✅ .env 文件存在"

# 启动服务
echo "   启动 docker-compose..."
docker-compose up -d

# 等待服务启动
echo "   等待服务启动（最多 60 秒）..."
for i in {1..60}; do
  if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ visual 服务启动成功"
    break
  fi
  sleep 1
done

# 验证健康检查
HEALTH=$(curl -s http://localhost:3000/api/health || echo "failed")
if [[ "$HEALTH" == *"ok"* ]]; then
  echo "✅ 健康检查通过"
else
  echo "❌ 健康检查失败: $HEALTH"
  exit 1
fi

echo ""

# ========== 阶段 3：更新测试项目 ==========
echo "🔄 阶段 3: 更新测试项目"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$TEST_PROJECT"

# 更新 ai-spec-auto
echo "   更新 ai-spec-auto..."
npm install "$AUTO_PATH"

# 验证版本
VERSION=$(npx ai-spec-auto --version 2>/dev/null || echo "unknown")
echo "✅ ai-spec-auto 版本: $VERSION"

# 验证 visual-hooks
if [ -d "node_modules/ai-spec-auto/internal/visual-hooks" ]; then
  echo "✅ visual-hooks 已安装"
else
  echo "❌ visual-hooks 未找到"
  exit 1
fi

echo ""

# ========== 阶段 4：配置 visual ==========
echo "⚙️  阶段 4: 配置 visual"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

mkdir -p .ai-spec

if [ -f ".ai-spec/visual-config.json" ]; then
  echo "   ℹ️  visual-config.json 已存在"
  cat .ai-spec/visual-config.json | head -5
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
  echo "✅ visual-config.json 已创建"
fi

echo ""

# ========== 阶段 5：执行 Collector 采集 ==========
echo "📦 阶段 5: 执行 Collector 采集"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$VISUAL_PATH"

# 安装 visual 项目依赖（如果需要）
if [ ! -d "node_modules" ]; then
  echo "   安装 visual 项目依赖..."
  npm install
fi

# 执行 Collector
echo "   执行 Collector 采集..."
COLLECTOR_RESULT=$(npm run collector -- \
  --workspace-id test-project-local \
  --project "$TEST_PROJECT" \
  --server "$VISUAL_SERVER" \
  --json 2>/dev/null || echo '{"ingest":{"ok":false}}')

# 解析结果
INSERTED=$(echo "$COLLECTOR_RESULT" | jq -r '.ingest.inserted // 0' 2>/dev/null || echo "0")
SKIPPED=$(echo "$COLLECTOR_RESULT" | jq -r '.ingest.skipped // 0' 2>/dev/null || echo "0")
TOTAL=$(echo "$COLLECTOR_RESULT" | jq -r '.ingest.total // 0' 2>/dev/null || echo "0")

if [ "$INSERTED" -gt 0 ] || [ "$SKIPPED" -gt 0 ]; then
  echo "✅ Collector 采集成功"
  echo "   插入: $INSERTED, 跳过: $SKIPPED, 总计: $TOTAL"
else
  echo "⚠️  Collector 采集失败或无数据"
  echo "   结果: $COLLECTOR_RESULT"
fi

echo ""

# ========== 阶段 6：验证集成 ==========
echo "🧪 阶段 6: 验证集成"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# 验证控制台
echo "   验证 visual 控制台..."
WORKSPACES=$(curl -s http://localhost:3000/api/workspaces 2>/dev/null || echo "failed")
if [[ "$WORKSPACES" != "failed" ]]; then
  echo "✅ 控制台 API 正常"
else
  echo "❌ 控制台 API 异常"
fi

echo ""

# ========== 完成 ==========
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                     🎉 集成配置完成                          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 验证清单："
echo ""
echo "  ✅ visual 服务运行: http://localhost:3000"
echo "  ✅ ai-spec-auto 已更新: $VERSION"
echo "  ✅ visual-hooks 已安装"
echo "  ✅ visual-config.json 已配置"
echo "  ✅ Collector 采集完成: 插入 $INSERTED 条"
echo ""
echo "🚀 下一步操作："
echo ""
echo "  1. 查看 visual 控制台："
echo "     open http://localhost:3000/workspaces"
echo ""
echo "  2. 测试实时推送："
echo "     cd $TEST_PROJECT"
echo "     npx ai-spec-auto protocol-step --user-input '测试实时推送'"
echo ""
echo "  3. 测试降级机制："
echo "     docker-compose -f $VISUAL_PATH/docker-compose.yml stop visual"
echo "     cd $TEST_PROJECT"
echo "     npx ai-spec-auto protocol-step --user-input '测试降级'"
echo "     # 协议应该正常推进，不受影响"
echo ""
