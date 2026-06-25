---
name: create-api
description: 指导在 React 项目中按团队规范创建和维护 HTTP 接口，包括类型定义、请求封装、命名约定与错误处理。当前端需要新增或调整 API 时使用本技能。
compatibility: Requires a local React project workspace and the repository's API/rule conventions under .agents/rules/.
---

# 创建与维护 API

## 使用场景

当前端需要：

- 为某个业务模块 **新增接口**
- 为已有接口 **补充类型定义**
- **重构接口文件** 或拆分模块

请使用本技能，并同时遵守 `.agents/rules/05-API规范.md` 中的强制规则。

---

## 步骤 1：确定接口归属模块

1. 先确定业务模块名称（如 `banner`、`user`、`ai-editor`）。
2. 对应的文件归属：
   - 请求封装文件：`src/api/<module>.ts`
   - 类型定义文件：`src/api/types/<module>.ts`

**约定：**

- 所有请求函数都放在 `src/api/` 下按模块拆分，禁止在组件、page、store 中直接调用 `request`。

---

## 步骤 2：定义类型

在 `src/api/types/<module>.ts` 中定义请求/响应类型：

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

**注意：**

- 请求参数类型和返回值类型应严格依据 Apifox 等接口文档，**禁止凭空创造字段**。
- 返回值一般是 `{ code: number; message: string; data: {...} }`，`requestConfig` 的 `API_RESPONSE_TRANSFER_METHOD` 内部已处理 `code` 判断并返回 `data`，因此这里只需定义 `data` 的结构。

---

## 步骤 3：创建请求函数

在 `src/api/<module>.ts` 中：

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

## 步骤 4：命名与错误处理约定

**命名（必须遵守 `05-API规范` 中的 NON-NEGOTIABLE）：**

- 获取列表：`getXxxListApi`
- 获取详情：`getXxxDetailApi`
- 创建：`createXxxApi`
- 更新：`updateXxxApi`
- 删除：`deleteXxxApi`
- 统一使用 `Api` 后缀，**禁止** 使用 `fetchXxx` 等前缀。

**错误处理：**

- 接口错误由 `requestConfig` 统一处理，业务代码中**禁止重复**加 `message.error` 等错误提示。
- 业务侧只处理成功逻辑，以及**前端自身校验错误**（如表单校验失败）。

---

## 步骤 5：在业务代码中使用

在组件或 store 中使用时：

```ts
import { getBannerListApi } from '@/api/banner';

const loadData = async () => {
  const res = await getBannerListApi({ page: 1, pageSize: 10 });
  // res 类型已经是 GetBannerListResult
};
```

---

## 快速检查清单

- [ ] 类型在 `src/api/types/<module>.ts`，请求在 `src/api/<module>.ts`？
- [ ] 命名符合 `getXxxApi` / `createXxxApi` / `updateXxxApi` / `deleteXxxApi`？
- [ ] 使用 `import { request } from '@koi-design/vix-tools'`？
- [ ] 未重复处理接口错误？
- [ ] 类型与接口文档一致？
