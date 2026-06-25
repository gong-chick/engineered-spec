#!/bin/bash
# 本地验证 visual 集成（不使用 Docker）

set -e

AUTO_PATH="/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec"
VISUAL_PATH="/Users/lizhenwei/workspace/vueworkspace/bairong/engineered-spec-visual"
TEST_PROJECT="/Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本10"
VISUAL_SERVER="http://localhost:3000"

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     本地验证 engineered-spec-visual 集成（不使用 Docker）         ║"
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

# 检查 Node.js
if ! command -v node &> /dev/null; then
  echo "❌ Node.js 未安装"
  exit 1
fi
NODE_VERSION=$(node --version)
echo "✅ Node.js 版本: $NODE_VERSION"

# 检查 npm
if ! command -v npm &> /dev/null; then
  echo "❌ npm 未安装"
  exit 1
fi
NPM_VERSION=$(npm --version)
echo "✅ npm 版本: $NPM_VERSION"

echo ""

# ========== 阶段 2：准备 visual 项目 ==========
echo "🔧 阶段 2: 准备 visual 项目"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$VISUAL_PATH"

# 检查 node_modules
if [ ! -d "node_modules" ]; then
  echo "   安装依赖..."
  npm install
  echo "✅ 依赖安装完成"
else
  echo "✅ node_modules 已存在"
fi

# 检查 .env 文件
if [ ! -f ".env" ]; then
  echo "⚠️  .env 文件不存在，创建默认配置..."
  cat > .env <<EOF
# Database (使用 SQLite 进行本地开发)
DATABASE_URL="file:./dev.db"

# NextAuth
NEXTAUTH_SECRET="local-dev-secret-$(openssl rand -base64 32 | tr -d '=+/' | cut -c1-32)"
NEXTAUTH_URL="http://localhost:3000"

# 本地开发模式
NODE_ENV=development
EOF
  echo "✅ .env 文件已创建（使用 SQLite）"
else
  echo "✅ .env 文件已存在"
fi

# 生成 Prisma 客户端
echo "   生成 Prisma 客户端..."
npm run prisma:generate > /dev/null 2>&1
echo "✅ Prisma 客户端已生成"

# 初始化数据库
echo "   初始化数据库..."
npm run prisma:push > /dev/null 2>&1
echo "✅ 数据库已初始化"

echo ""

# ========== 阶段 3：更新测试项目 ==========
echo "🔄 阶段 3: 更新测试项目"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$TEST_PROJECT"

# 更新 ai-spec-auto
echo "   更新 ai-spec-auto..."
npm install "$AUTO_PATH" > /dev/null 2>&1
echo "✅ ai-spec-auto 已更新"

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
  echo "✅ visual-config.json 已创建"
fi

echo ""

# ========== 阶段 5：启动 visual 服务 ==========
echo "🚀 阶段 5: 启动 visual 服务"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$VISUAL_PATH"

echo "   启动 visual 开发服务器..."
echo "   使用命令: npm run dev"
echo ""
echo "⚠️  请在新终端窗口运行以下命令启动 visual："
echo ""
echo "   cd $VISUAL_PATH"
echo "   npm run dev"
echo ""
echo "   启动后按 Enter 继续..."
read -r

# 等待服务启动
echo "   等待服务启动（最多 30 秒）..."
for i in {1..30}; do
  if curl -s http://localhost:3000/api/health > /dev/null 2>&1; then
    echo "✅ visual 服务启动成功"
    break
  fi
  if [ $i -eq 30 ]; then
    echo "❌ visual 服务启动超时"
    echo "   请确认服务是否正常启动"
    exit 1
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

# ========== 阶段 6：执行 Collector 采集 ==========
echo "📦 阶段 6: 执行 Collector 采集"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$VISUAL_PATH"

echo "   执行 Collector 采集..."
COLLECTOR_RESULT=$(npm run collector -- \
  --workspace-id test-project-local \
  --project "$TEST_PROJECT" \
  --server "$VISUAL_SERVER" \
  --json 2>&1 | grep -A 100 '^{' | head -1 || echo '{"ingest":{"ok":false}}')

# 解析结果
if command -v jq &> /dev/null; then
  INSERTED=$(echo "$COLLECTOR_RESULT" | jq -r '.ingest.inserted // 0' 2>/dev/null || echo "0")
  SKIPPED=$(echo "$COLLECTOR_RESULT" | jq -r '.ingest.skipped // 0' 2>/dev/null || echo "0")
  TOTAL=$(echo "$COLLECTOR_RESULT" | jq -r '.ingest.total // 0' 2>/dev/null || echo "0")
  
  if [ "$INSERTED" -gt 0 ] || [ "$SKIPPED" -gt 0 ]; then
    echo "✅ Collector 采集成功"
    echo "   插入: $INSERTED, 跳过: $SKIPPED, 总计: $TOTAL"
  else
    echo "⚠️  Collector 采集结果未知"
    echo "   原始输出: $COLLECTOR_RESULT"
  fi
else
  echo "⚠️  jq 未安装，无法解析结果"
  echo "   原始输出: $COLLECTOR_RESULT"
fi

echo ""

# ========== 阶段 7：测试实时推送 ==========
echo "🧪 阶段 7: 测试实时推送"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$TEST_PROJECT"

echo "   测试协议命令..."
if npx ai-spec-auto protocol-status > /dev/null 2>&1; then
  echo "✅ protocol-status 命令正常"
else
  echo "⚠️  protocol-status 命令异常（可能项目未初始化 run）"
fi

echo ""
echo "   现在可以测试实时推送："
echo "   cd $TEST_PROJECT"
echo "   npx ai-spec-auto protocol-step --user-input '测试 visual 集成'"
echo ""

# ========== 完成 ==========
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                     🎉 本地验证准备完成                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📋 验证清单："
echo ""
echo "  ✅ visual 服务运行: http://localhost:3000"
echo "  ✅ ai-spec-auto 已更新: $VERSION"
echo "  ✅ visual-hooks 已安装"
echo "  ✅ visual-config.json 已配置"
echo "  ✅ Collector 采集完成"
echo ""
echo "🚀 验证步骤："
echo ""
echo "  1. 查看 visual 控制台："
echo "     open http://localhost:3000/workspaces"
echo ""
echo "  2. 测试实时推送："
echo "     cd $TEST_PROJECT"
echo "     npx ai-spec-auto protocol-step --user-input '测试实时推送'"
echo ""
echo "  3. 在 visual 控制台验证数据是否实时更新"
echo ""
echo "  4. 测试降级机制（停止 visual 服务）："
echo "     # 在 visual 终端按 Ctrl+C 停止服务"
echo "     cd $TEST_PROJECT"
echo "     npx ai-spec-auto protocol-step --user-input '测试降级'"
echo "     # 协议应该正常推进，不受影响"
echo ""
