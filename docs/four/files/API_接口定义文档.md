# API_接口定义文档

> 版本：v1.0 | engineered-spec-visual API 定义

---

## 1. 通用响应格式

### 1.1 成功响应

```json
{
  "success": true,
  "data": {
    // 响应数据
  }
}
```

### 1.2 错误响应

```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "会话已过期，请重新登录",
    "details": null
  }
}
```

### 1.3 分页响应

```json
{
  "success": true,
  "data": {
    "items": [],
    "total": 100,
    "page": 1,
    "pageSize": 20,
    "hasNext": true
  }
}
```

---

## 2. 错误码定义

| HTTP 状态码 | 业务错误码 | 说明 |
|-------------|-----------|------|
| 400 | BAD_REQUEST | 请求参数错误 |
| 401 | UNAUTHORIZED | 未认证或会话过期 |
| 403 | FORBIDDEN | 权限不足 |
| 404 | NOT_FOUND | 资源不存在 |
| 409 | CONFLICT | 资源冲突（如重复提交） |
| 422 | VALIDATION_ERROR | 数据校验失败 |
| 429 | RATE_LIMITED | 请求频率限制 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |

---

## 3. 认证方式

- **方式**：Cookie-based Session
- **Cookie 名称**：`session_token`
- **Token 格式**：512 字符 nanoid
- **过期时间**：默认 7 天
- **认证接口**：POST /api/auth/login、POST /api/auth/register、POST /api/auth/logout

---

## 4. Dashboard 接口

### 4.1 首页聚合接口

```
GET /api/dashboard/summary
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID（URL 参数或路径） |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "workspace": {
      "id": "ws-xxx",
      "name": "前端项目组",
      "slug": "frontend-team"
    },
    "overview": {
      "totalRuns": 156,
      "activeRuns": 3,
      "totalChanges": 42,
      "archivedChanges": 38,
      "totalAgents": 8,
      "onlineAgents": 5
    },
    "health": {
      "score": 87,
      "level": "good",
      "issues": [
        {
          "type": "stale_run",
          "message": "2 个 Run 超过 30 分钟未更新",
          "severity": "warning"
        }
      ]
    },
    "recentActivity": [
      {
        "type": "run_completed",
        "runKey": "run-20260423-001",
        "message": "组件替换需求 #123 已完成",
        "occurredAt": "2026-04-23T10:00:00Z"
      }
    ]
  }
}
```

**错误码**：401 (UNAUTHORIZED), 403 (FORBIDDEN), 404 (NOT_FOUND)

---

### 4.2 Onboarding 接口

```
GET /api/dashboard/onboarding
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "steps": [
      {
        "id": "install_cli",
        "title": "安装 CLI",
        "description": "在项目根目录执行 npx ai-spec-auto init",
        "status": "completed",
        "completedAt": "2026-04-20T10:00:00Z"
      },
      {
        "id": "first_run",
        "title": "首次 Run",
        "description": "使用 AI 完成第一个需求",
        "status": "completed",
        "completedAt": "2026-04-21T14:00:00Z"
      },
      {
        "id": "first_archive",
        "title": "首次归档",
        "description": "完成第一个需求的归档流程",
        "status": "in_progress",
        "completedAt": null
      },
      {
        "id": "team_setup",
        "title": "团队配置",
        "description": "邀请团队成员加入工作区",
        "status": "pending",
        "completedAt": null
      }
    ],
    "progress": 0.5,
    "estimatedCompletion": "2026-04-25T18:00:00Z"
  }
}
```

**错误码**：401, 403, 404

---

### 4.3 运行态健康度接口

```
GET /api/dashboard/runtime-health
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID |
| range | string | 否 | 时间范围（7d/30d/90d），默认 7d |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "score": 87,
    "level": "good",
    "metrics": {
      "avgTurnCount": 12.5,
      "completionRate": 0.92,
      "avgDuration": 1800,
      "staleRunCount": 2,
      "errorRate": 0.05
    },
    "trends": [
      {
        "date": "2026-04-17",
        "score": 82
      },
      {
        "date": "2026-04-18",
        "score": 85
      },
      {
        "date": "2026-04-19",
        "score": 87
      }
    ],
    "issues": [
      {
        "id": "issue-001",
        "type": "stale_run",
        "runKey": "run-20260415-003",
        "message": "Run 超过 30 分钟未更新",
        "severity": "warning",
        "occurredAt": "2026-04-23T09:00:00Z"
      }
    ]
  }
}
```

**错误码**：401, 403, 404

---

### 4.4 交付闭环进度接口

```
GET /api/dashboard/delivery-progress
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID |
| range | string | 否 | 时间范围，默认 30d |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "summary": {
      "totalChanges": 42,
      "archived": 38,
      "inProgress": 3,
      "failed": 1,
      "archiveRate": 0.905
    },
    "stages": [
      {
        "stage": "proposal",
        "count": 42,
        "avgDuration": 300
      },
      {
        "stage": "design",
        "count": 40,
        "avgDuration": 600
      },
      {
        "stage": "tasks",
        "count": 38,
        "avgDuration": 1800
      },
      {
        "stage": "checklist",
        "count": 38,
        "avgDuration": 300
      },
      {
        "stage": "archive",
        "count": 38,
        "avgDuration": 60
      }
    ],
    "changes": [
      {
        "changeKey": "change-20260423-001",
        "title": "用户列表组件替换",
        "stage": "archive",
        "status": "completed",
        "startedAt": "2026-04-22T10:00:00Z",
        "completedAt": "2026-04-23T10:00:00Z"
      }
    ]
  }
}
```

**错误码**：401, 403, 404

---

### 4.5 效率收益接口

```
GET /api/dashboard/efficiency
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID |
| range | string | 否 | 时间范围，默认 30d |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "metrics": {
      "codeAcceptanceRate": 0.70,
      "codeAdoptionRate": 0.80,
      "reviewCommentsPerPR": 1.5,
      "reviewRoundsPerPR": 1.2,
      "avgReviewTime": 720,
      "newcomerOnboardDays": 1.5
    },
    "comparison": {
      "before": {
        "codeAcceptanceRate": 0.30,
        "codeAdoptionRate": 0.40,
        "reviewCommentsPerPR": 6.5,
        "reviewRoundsPerPR": 2.5,
        "avgReviewTime": 1500,
        "newcomerOnboardDays": 10
      },
      "improvement": {
        "codeAcceptanceRate": "+133%",
        "codeAdoptionRate": "+100%",
        "reviewCommentsPerPR": "-77%",
        "reviewRoundsPerPR": "-52%",
        "avgReviewTime": "-52%",
        "newcomerOnboardDays": "-85%"
      }
    },
    "trends": [
      {
        "date": "2026-04-01",
        "codeAcceptanceRate": 0.55,
        "codeAdoptionRate": 0.65
      }
    ]
  }
}
```

**错误码**：401, 403, 404

---

### 4.6 阻塞变化流接口

```
GET /api/dashboard/block-flow
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "blocks": [
      {
        "id": "block-001",
        "type": "stale_run",
        "runKey": "run-20260415-003",
        "title": "Run 长时间未响应",
        "description": "Run 超过 30 分钟未更新，可能卡住",
        "severity": "warning",
        "blockedSince": "2026-04-23T09:00:00Z",
        "suggestedAction": "检查 AI Agent 状态或手动干预"
      },
      {
        "id": "block-002",
        "type": "failed_task",
        "runKey": "run-20260420-005",
        "title": "任务执行失败",
        "description": "TASK-007 执行失败，错误：权限不足",
        "severity": "critical",
        "blockedSince": "2026-04-23T08:30:00Z",
        "suggestedAction": "检查权限配置或重试任务"
      }
    ],
    "totalBlocks": 2,
    "criticalCount": 1,
    "warningCount": 1
  }
}
```

**错误码**：401, 403, 404

---

### 4.7 规范资产命中接口

```
GET /api/dashboard/asset-coverage
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "coverage": {
      "rules": {
        "total": 13,
        "active": 13,
        "hitRate": 0.85,
        "items": [
          {
            "slug": "coding-standard",
            "name": "编码规范",
            "hitCount": 156,
            "hitRate": 0.92
          }
        ]
      },
      "skills": {
        "total": 25,
        "active": 10,
        "hitRate": 0.60,
        "items": [
          {
            "slug": "create-proposal",
            "name": "创建提案",
            "hitCount": 42,
            "hitRate": 0.75
          }
        ]
      },
      "roles": {
        "total": 32,
        "active": 10,
        "hitRate": 0.45,
        "items": [
          {
            "slug": "task-orchestrator",
            "name": "任务编排器",
            "hitCount": 156,
            "hitRate": 1.0
          }
        ]
      }
    },
    "uncoveredAreas": [
      {
        "category": "skills",
        "slug": "security-audit",
        "reason": "从未被触发"
      }
    ]
  }
}
```

**错误码**：401, 403, 404

---

## 5. Runs & Changes 接口

### 5.1 最近 Runs 接口

```
GET /api/runs/recent
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 20 |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "runKey": "run-20260423-001",
        "status": "completed",
        "lastEventType": "run.completed",
        "lastOccurredAt": "2026-04-23T10:00:00Z",
        "turnCount": 15,
        "currentRole": null,
        "currentTask": null
      }
    ],
    "total": 156,
    "page": 1,
    "pageSize": 20,
    "hasNext": true
  }
}
```

**错误码**：401, 403, 404

---

### 5.2 最近 Changes 接口

```
GET /api/changes/recent
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID |
| page | number | 否 | 页码，默认 1 |
| pageSize | number | 否 | 每页条数，默认 20 |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "changeKey": "change-20260423-001",
        "docType": "proposal",
        "title": "用户列表组件替换",
        "sourcePath": "openspec/changes/change-20260423-001/proposal.md",
        "contentHash": "sha256-xxx",
        "status": "archived",
        "archivedAt": "2026-04-23T10:00:00Z"
      }
    ],
    "total": 42,
    "page": 1,
    "pageSize": 20,
    "hasNext": true
  }
}
```

**错误码**：401, 403, 404

---

## 6. 统计与趋势接口

### 6.1 安装趋势接口

```
GET /api/dashboard/installation-trend
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| range | string | 否 | 时间范围（7d/30d/90d），默认 30d |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "totalInstallations": 25,
    "activeInstallations": 18,
    "trends": [
      {
        "date": "2026-04-01",
        "newInstallations": 3,
        "totalEvents": 150
      }
    ],
    "platforms": {
      "darwin": 15,
      "linux": 7,
      "win32": 3
    },
    "profiles": {
      "vue": 12,
      "react": 13
    },
    "ides": {
      "cursor": 20,
      "claude": 15,
      "opencode": 5,
      "trae": 3
    }
  }
}
```

**错误码**：401

---

### 6.2 试点项目接口

```
GET /api/dashboard/pilot-projects
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "projects": [
      {
        "id": "pilot-001",
        "name": "用户中心",
        "slug": "user-center",
        "status": "active",
        "phase": "M2",
        "metrics": {
          "totalRuns": 25,
          "completedRuns": 23,
          "archiveRate": 0.92,
          "codeAcceptanceRate": 0.75
        },
        "startedAt": "2026-04-10T10:00:00Z"
      }
    ],
    "summary": {
      "totalProjects": 3,
      "activeProjects": 2,
      "completedProjects": 1
    }
  }
}
```

**错误码**：401, 403, 404

---

### 6.3 试点复盘接口

```
GET /api/dashboard/pilot-review
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID |
| projectId | string | 否 | 试点项目 ID |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "project": {
      "name": "用户中心",
      "phase": "M2",
      "duration": "14天"
    },
    "review": {
      "goals": [
        {
          "goal": "开发者快速上手",
          "result": "达成",
          "evidence": "新人 1 天内完成首次合规 PR"
        },
        {
          "goal": "真实需求闭环",
          "result": "达成",
          "evidence": "3 个组件替换需求全部归档"
        }
      ],
      "metrics": {
        "codeAcceptanceRate": {
          "target": 0.70,
          "actual": 0.75,
          "status": "exceeded"
        },
        "archiveRate": {
          "target": 0.80,
          "actual": 0.92,
          "status": "exceeded"
        }
      },
      "lessons": [
        {
          "type": "positive",
          "content": "L3 安装流程顺畅，用户反馈良好"
        },
        {
          "type": "improvement",
          "content": "部分技能触发频率低，需要优化提示"
        }
      ]
    }
  }
}
```

**错误码**：401, 403, 404

---

## 7. 内部接口

### 7.1 内部摄取接口

```
POST /api/internal/ingest/raw
```

**请求头**：

| 头 | 必填 | 说明 |
|------|------|------|
| X-Workspace-Token | 是 | 工作区连接令牌 |
| Content-Type | 是 | application/json |

**请求体**：

```json
{
  "sourceKind": "br-ai-spec",
  "sourcePath": "/path/to/project",
  "eventType": "run.status_changed",
  "eventKey": "run-20260423-001",
  "dedupeKey": "hash-xxx",
  "checksum": "sha256-xxx",
  "occurredAt": "2026-04-23T10:00:00Z",
  "entityType": "run",
  "entityId": "run-20260423-001",
  "payload": {
    "status": "executing",
    "currentRole": "frontend-implementer"
  }
}
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "eventId": "evt-xxx",
    "ingestedAt": "2026-04-23T10:00:01Z",
    "deduplicated": false
  }
}
```

**错误码**：400 (BAD_REQUEST), 401 (UNAUTHORIZED), 409 (CONFLICT - 重复事件)

---

## 8. 控制接口

### 8.1 发送控制指令

```
POST /api/control/command
```

**请求头**：

| 头 | 必填 | 说明 |
|------|------|------|
| Cookie | 是 | 会话 Cookie |

**请求体**：

```json
{
  "workspaceId": "ws-xxx",
  "runKey": "run-20260423-001",
  "command": "pause",
  "payload": {
    "reason": "manual intervention"
  }
}
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "commandId": "cmd-xxx",
    "status": "pending",
    "signature": "hmac-sha256-xxx",
    "createdAt": "2026-04-23T10:00:00Z"
  }
}
```

**错误码**：400, 401, 403, 404, 422

---

### 8.2 查询控制指令状态

```
GET /api/control/command/:commandId
```

**响应示例**：

```json
{
  "success": true,
  "data": {
    "commandId": "cmd-xxx",
    "runKey": "run-20260423-001",
    "command": "pause",
    "status": "applied",
    "appliedAt": "2026-04-23T10:00:05Z",
    "actorId": "user-xxx"
  }
}
```

**错误码**：401, 403, 404

---

### 8.3 列出控制指令

```
GET /api/control/commands
```

**请求参数**：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| workspaceId | string | 是 | 工作区 ID |
| runKey | string | 否 | Run 标识 |
| status | string | 否 | 状态过滤 |
| page | number | 否 | 页码 |
| pageSize | number | 否 | 每页条数 |

**响应示例**：

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "commandId": "cmd-xxx",
        "runKey": "run-20260423-001",
        "command": "pause",
        "status": "applied",
        "createdAt": "2026-04-23T10:00:00Z",
        "appliedAt": "2026-04-23T10:00:05Z"
      }
    ],
    "total": 5,
    "page": 1,
    "pageSize": 20
  }
}
```

**错误码**：401, 403, 404
