---
name: create-api
description: 指导在 Vue 3 项目中按团队规范创建和维护 HTTP 接口，包括类型定义、请求封装、命名约定与错误处理。当前端需要新增或调整 API 时使用本技能。
compatibility: Requires a local Vue project workspace and the repository's API/rule conventions under .agents/rules/.
---

# 创建与维护 API

## 目录结构

```text
src/api/<name>.ts                # 请求函数（按业务模块拆分）
src/api/types/<name>.ts     # 请求/响应类型定义
```

所有请求函数集中在 `src/api/` 下按模块管理，禁止在组件或 store 中直接调用 `request`。

---

## 创建步骤

### 1. 定义类型

```ts
// src/api/types/banner.ts
export interface Banner {
  id: number;
  title: string;
  imageUrl: string;
  status: number;
}

export interface GetBannerListParams {
  page: number;
  pageSize: number;
  status?: number;
}

export interface GetBannerListResult {
  list: Banner[];
  total: number;
}

export type CreateBannerParams = Pick<Banner, 'title' | 'imageUrl'>;
export type UpdateBannerParams = CreateBannerParams & { id: number };
```

类型严格依据接口文档（如 Apifox），禁止凭空创造字段。

### 2. 创建请求函数

```ts
// src/api/banner.ts
import { request } from '@koi-design/vix-tools';
import type {
  GetBannerListParams,
  GetBannerListResult,
  CreateBannerParams,
  UpdateBannerParams,
} from './types/banner';

export function getBannerListApi(data: GetBannerListParams): Promise<GetBannerListResult> {
  return request({ url: '/api/banner/page', method: 'post', data });
}

export function getBannerDetailApi(id: number): Promise<Banner> {
  return request({ url: `/api/banner/${id}`, method: 'get' });
}

export function createBannerApi(data: CreateBannerParams): Promise<void> {
  return request({ url: '/api/banner', method: 'post', data });
}

export function updateBannerApi(data: UpdateBannerParams): Promise<void> {
  return request({ url: `/api/banner/${data.id}`, method: 'put', data });
}

export function deleteBannerApi(id: number): Promise<void> {
  return request({ url: `/api/banner/${id}`, method: 'delete' });
}
```

---

## 命名约定（NON-NEGOTIABLE）

`getXxxListApi` / `getXxxDetailApi` / `createXxxApi` / `updateXxxApi` / `deleteXxxApi`

- 统一使用 `Api` 后缀，区分接口函数与业务函数
- **禁止** `fetchXxx` 等前缀

## 错误处理（NON-NEGOTIABLE）

- 接口错误由 `requestConfig` 统一处理，业务代码中**禁止重复** `message.error` 等提示
- 业务侧只处理成功逻辑及前端自身校验错误

---

## 快速检查清单

- [ ] 类型在 `src/api/types/<name>.ts`，请求在 `src/api/<name>.ts`？
- [ ] 命名符合 `getXxxApi` / `createXxxApi` / `updateXxxApi` / `deleteXxxApi`？
- [ ] 使用 `import { request } from '@koi-design/vix-tools'`？
- [ ] 未重复处理接口错误？
- [ ] 类型与接口文档一致？
