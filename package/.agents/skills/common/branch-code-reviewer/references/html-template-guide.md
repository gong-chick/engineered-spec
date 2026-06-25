# 评审报告 HTML 模板参考

## 报告结构示例

本文件提供 HTML 报告的结构参考,实际生成时应动态填充数据。

## 核心功能模块

### 1. 概览面板

应包含的统计指标:
- 变更文件总数
- 新增行数 / 删除行数
- 提交次数
- 技术风险总数(按等级分布)
- 业务风险总数(按等级分布)
- 需求覆盖度(如果有需求文档)
- 整体通过率

### 2. 文件树导航

展示结构:
```
src/
├── components/
│   ├── OrderForm.vue (+120/-15) 🟡 2个风险
│   └── PaymentButton.vue (+80/-0) 🔴 1个风险
├── api/
│   └── order.js (+200/-30) 🔵 3个建议
└── utils/
    └── validator.js (+50/-0) ⚪ 1个提示
```

### 3. 代码差异展示

支持两种模式:
- **Side-by-Side**: 左右对比
- **Unified**: 统一显示

颜色标记:
- 绿色背景: 新增行
- 红色背景: 删除行
- 黄色背景: 修改行

### 4. 技术风险列表

每个风险项包含:
```json
{
  "file": "src/components/OrderForm.vue",
  "line": 45,
  "severity": "critical",
  "category": "security",
  "title": "XSS 攻击风险",
  "description": "用户输入未转义直接渲染到页面",
  "suggestion": "使用 v-html 时应对内容进行转义处理",
  "code": "<div v-html=\"userInput\"></div>",
  "fixed_code": "<div>{{ userInput }}</div>"
}
```

### 5. 业务风险列表

每个业务风险项包含:
```json
{
  "severity": "critical",
  "category": "missing_feature",
  "title": "缺少支付失败处理逻辑",
  "description": "需求文档要求支付失败时显示错误提示并提供重试选项",
  "requirement_ref": "docs/prd-order-module.md §4.2 支付流程",
  "related_files": ["src/components/PaymentButton.vue"],
  "suggestion": "添加支付失败的 catch 处理,显示错误提示",
  "impact": "用户支付失败后无法继续操作,影响转化率"
}
```

## 交互功能实现要点

### 模式切换
- 使用 JavaScript 切换 CSS class 实现
- Side-by-Side: `display: grid; grid-template-columns: 1fr 1fr;`
- Unified: `display: block;`

### 主题切换
- 使用 CSS 变量定义颜色
- 通过切换 `data-theme="dark"` 属性实现
- 使用 localStorage 保存用户偏好

### 评论功能
- 点击行号触发评论输入
- 评论数据存储在 localStorage
- 格式: `comments:{fileName}:{line}: [{user, content, timestamp}]`

### 搜索功能
- 使用正则表达式匹配文件名和代码内容
- 高亮匹配结果
- 支持上一个/下一个跳转

### 过滤功能
- 按文件类型过滤: `.vue`, `.js`, `.ts` 等
- 按风险等级过滤: critical, warning, suggestion, info
- 按风险类型过滤: technical, business

## 性能优化建议

1. **虚拟滚动**: 大量代码差异时使用虚拟滚动
2. **懒加载**: 文件树展开时才加载子节点
3. **代码折叠**: 默认折叠未变更区域
4. **防抖搜索**: 搜索输入防抖 300ms
5. **Web Worker**: 复杂计算(如代码分析)放到 Web Worker

## 打印优化

```css
@media print {
  .no-print { display: none; }
  .diff-viewer { page-break-inside: avoid; }
  .risk-item { page-break-inside: avoid; }
}
```
