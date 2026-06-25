---
alwaysApply: false
description: Vue 项目的 API 规范，包括接口目录结构、请求封装、函数命名约定、类型定义、错误处理原则。当新增、修改、重构或重写接口时读取此规则。
---

# API 规范（Vue）

## 目录结构

```text
src/
├── api/                    # 接口请求函数
│   ├── login.ts
│   ├── order.ts
│   └── types/              # 请求/响应类型定义
│       ├── login.ts
│       └── order.ts
└── config/
    └── requestConfig.ts    # 请求全局配置
```

- 所有接口请求函数集中在 `src/api/<name>.ts` 中，按业务模块拆分文件
- 请求/响应类型定义放在 `src/api/types/<name>.ts` 中
- 禁止在组件、页面、store 中直接调用 `request`，必须通过 `src/api/` 下的函数

## 接口请求规范

- 使用 `@koi-design/vix-tools` 的 `request` 发起请求
- 请求全局配置（超时、成功码、鉴权失败处理等）集中在 `src/config/requestConfig.ts`
- 应用入口通过 `request.init(requestConfig)` 完成初始化

```ts
import { request } from '@koi-design/vix-tools';

export function getOrderListApi(data: GetOrderListParams): Promise<GetOrderListResult> {
  return request({
    url: '/api/order/page',
    method: 'post',
    data,
  });
}
```

如需查看完整示例与落地步骤，请使用技能文件：

- `.agents/skills/create-api/SKILL.md`

## 接口函数命名（NON-NEGOTIABLE）

| 操作 | 命名规则 | 示例 |
|------|----------|------|
| 获取列表 | getXxxListApi | `getOrderListApi` |
| 获取详情 | getXxxDetailApi | `getOrderDetailApi` |
| 创建 | createXxxApi | `createOrderApi` |
| 更新 | updateXxxApi | `updateOrderApi` |
| 删除 | deleteXxxApi | `deleteOrderApi` |

- 统一使用 `Api` 后缀，区分接口函数与业务函数
- **禁止**使用 `fetch` 前缀或匈牙利命名法

## 接口错误处理（NON-NEGOTIABLE）

`requestConfig` 中的 `API_RESPONSE_TRANSFER_METHOD` 和 `API_RESPONSE_ERROR_METHOD` 已统一处理接口错误，业务代码中**禁止重复添加** `message.error` 等错误提示：

- 接口错误由请求配置统一处理，业务代码只需处理成功逻辑
- 前端表单验证错误和业务逻辑检查错误可以保留
- 成功提示可以保留（业务逻辑的成功反馈）
