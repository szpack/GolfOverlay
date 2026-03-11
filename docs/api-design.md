# GolfHub API 设计文档 — Sync v1

## 1. API 总览

**Base URL**: `/api/v1`
**认证**: 所有端点需要 `Authorization: Bearer <JWT>` 头
**Content-Type**: `application/json`

当前已实现 10 个端点：8 个 Round CRUD + 2 个 HoleScore。

---

## 2. Round API 列表

| # | HTTP | Path | 用途 |
|---|------|------|------|
| 1 | POST | `/rounds` | 创建 Round（幂等） |
| 2 | GET | `/rounds` | 列出用户 Round（Summary） |
| 3 | GET | `/rounds/:id` | 获取单个 Round（Detail） |
| 4 | PATCH | `/rounds/:id` | 更新 Round Meta |
| 5 | POST | `/rounds/:id/finish` | 结束 Round |
| 6 | POST | `/rounds/:id/abandon` | 放弃 Round |
| 7 | POST | `/rounds/:id/reopen` | 重新打开 Round |
| 8 | DELETE | `/rounds/:id` | 软删除 Round |

## 3. HoleScore API 列表

| # | HTTP | Path | 用途 |
|---|------|------|------|
| 9 | GET | `/rounds/:id/hole-scores` | 获取全部洞成绩 |
| 10 | PUT | `/rounds/:id/holes/:holeNo/scores` | Upsert 某洞成绩 |

---

## 4. 端点详细说明

### 4.1 POST /rounds — 创建 Round（幂等）

**用途**：客户端创建新 round，支持离线重试安全回放。

**请求字段**：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string (max 64) | 是 | 客户端生成，格式 `rnd_YYYYMMDD_xxx` |
| `date` | string | 是 | YYYY-MM-DD |
| `status` | string | 否 | `scheduled`\|`in_progress`\|`finished`\|`abandoned`，默认 `scheduled` |
| `visibility` | string | 否 | `private`\|`friends`\|`public`，默认 `private` |
| `clubId` | string | 否 | 本地 ClubStore ID |
| `courseId` | string | 否 | 球场 ID |
| `courseName` | string | 否 | 球场名 |
| `routingName` | string | 否 | 路线名 |
| `teeTime` | datetime | 否 | 开球时间 |
| `startedAt` | datetime | 否 | 开始时间 |
| `endedAt` | datetime | 否 | 结束时间 |
| `endedBy` | string | 否 | `manual`\|`auto` |
| `reopenUntil` | datetime | 否 | Grace 截止 |
| `reopenCount` | number | 否 | 默认 0 |
| `lastActivityAt` | datetime | 否 | 最后活动时间 |
| `holesPlanned` | number (1-36) | 否 | 默认 18 |
| `holesCompleted` | number (0-36) | 否 | 默认 0 |
| `playersSnapshotJson` | JSON | 否 | 球员快照 |
| `courseSnapshotJson` | JSON | 否 | 球场快照 |
| `settingsSnapshotJson` | JSON | 否 | 设置快照 |

**返回字段**（201 或 200）：

```json
{ "id": "rnd_xxx", "serverVersion": 1, "updatedAt": "2026-03-10T..." }
```

**幂等规则**：
- 同一 `id` + 同一 `ownerUserId` → 返回已有记录（200），`created: false`
- 同一 `id` + 不同 `ownerUserId` → **409 Conflict**

这是离线优先架构的关键设计：客户端重试 POST 不会创建重复 round。

### 4.2 GET /rounds — 列出用户 Round（Summary）

**用途**：拉取用户 round 摘要列表，支持增量同步。

**查询参数**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `updated_after` | datetime | 增量拉取：只返回此时间之后更新的 round |
| `status` | string | 按状态过滤 |
| `include_deleted` | boolean | 包含软删除的 round（默认 false） |
| `limit` | number | 最大返回数（默认 100，上限 200） |

**返回字段**：

```json
{
  "rounds": [{
    "id", "status", "visibility", "lockState",
    "courseName", "routingName", "date", "teeTime",
    "startedAt", "endedAt", "endedBy", "reopenUntil",
    "holesPlanned", "holesCompleted",
    "serverVersion", "createdAt", "updatedAt", "deletedAt"
  }]
}
```

**关键**：这是 **Summary 接口**，不返回 `playersSnapshotJson`、`courseSnapshotJson`、`settingsSnapshotJson` 等大字段。客户端不应将此接口的数据写入 RoundData。

### 4.3 GET /rounds/:id — 获取单个 Round（Detail）

**用途**：获取 round 完整信息，包含快照 JSON 字段。

**返回字段**：在 Summary 字段基础上，额外包含：
- `ownerUserId`
- `clubId`, `courseId`
- `reopenCount`, `lastActivityAt`
- `playersSnapshotJson` — 完整球员快照 JSON
- `courseSnapshotJson` — 完整球场快照 JSON
- `settingsSnapshotJson` — 设置快照 JSON

### 4.4 PATCH /rounds/:id — 更新 Round Meta

**用途**：更新 round 的元数据字段。

**白名单字段**（非白名单字段被忽略）：

```
visibility, teeTime, date, clubId, courseId,
courseName, routingName, holesPlanned, holesCompleted,
lastActivityAt, playersSnapshotJson, courseSnapshotJson,
settingsSnapshotJson
```

**baseVersion**：请求可携带 `baseVersion`，当前为 advisory check（v1 保守策略），mismatch 时日志警告但不拒绝。

**不可通过 PATCH 修改的字段**：`status`、`lockState`、`endedAt`、`endedBy`、`reopenUntil`、`reopenCount`。这些字段必须通过专用 action 端点修改。

**返回**：`{ id, serverVersion, updatedAt }`

### 4.5 POST /rounds/:id/finish — 结束 Round

**请求字段**：

| 字段 | 类型 | 说明 |
|------|------|------|
| `endedAt` | datetime | 结束时间，默认 now |
| `endedBy` | string | `manual`\|`auto`，默认 `manual` |

**状态转换**：`in_progress` 或 `scheduled` → `finished`
**副作用**：设置 `lockState='grace'`，设置 `reopenUntil = now + 24h`

**错误**：
- 404 — round 不存在或非本人
- 409 `invalid_transition` — 当前状态不允许 finish

### 4.6 POST /rounds/:id/abandon — 放弃 Round

**请求字段**：同 finish（endedAt, endedBy）

**状态转换**：`scheduled` 或 `in_progress` → `abandoned`
**副作用**：设置 `lockState='locked'`（无 grace 窗口）

### 4.7 POST /rounds/:id/reopen — 重新打开

**请求**：无 body

**状态转换**：`finished` 或 `abandoned` → `in_progress`
**条件**：finished + `lockState='locked'` → 409（grace 过期）
**副作用**：清除 endedAt/endedBy/reopenUntil，设 `lockState='open'`，`reopenCount++`

### 4.8 DELETE /rounds/:id — 软删除

**请求**：无 body
**行为**：设置 `deletedAt` 时间戳，`serverVersion++`
**不做硬删除**，round 仍可通过 `include_deleted=true` 查询到

### 4.9 GET /rounds/:id/hole-scores — 获取全部洞成绩

**返回**：

```json
{
  "scores": [{
    "id": "uuid",
    "roundId": "rnd_xxx",
    "holeNo": 1,
    "roundPlayerId": "rp_abc",
    "playerId": "buddy_xxx",
    "gross": 4,
    "notes": null,
    "serverVersion": 1,
    "createdAt": "...",
    "updatedAt": "..."
  }]
}
```

排序：holeNo ASC, roundPlayerId ASC

**关键**：返回中的 `roundPlayerId` 是数据归属的主键，不是 `playerId`。

### 4.10 PUT /rounds/:id/holes/:holeNo/scores — Upsert 洞成绩

**用途**：按洞号 upsert 每个球员的成绩。

**请求字段**：

```json
{
  "scores": [{
    "roundPlayerId": "rp_abc",
    "playerId": "buddy_xxx",
    "gross": 4,
    "notes": "3-putt"
  }]
}
```

**Upsert 语义（关键）**：
- Unique key：`roundId + holeNo + roundPlayerId`
- 请求中存在的 roundPlayerId → 创建或更新
- 请求中**不存在**的 roundPlayerId → **不受影响**（不会删除）
- 这是 upsert-only，不是 replace-all

**验证**：
- `holeNo`：1-36 整数
- `scores`：非空数组
- `roundPlayerId`：必填字符串
- `gross`：0-20 整数或 null

**返回**：

```json
{
  "holeNo": 1,
  "scores": [{ "id": "uuid", "serverVersion": 2, "updatedAt": "..." }]
}
```

---

## 5. 幂等规则汇总

| 端点 | 幂等性 | 机制 |
|------|--------|------|
| POST /rounds | 幂等 | 同 ID + 同 owner 返回已有 |
| PUT .../scores | 幂等 | upsert by unique key |
| POST .../finish | 非幂等 | 已 finished 返回 409 |
| POST .../reopen | 非幂等 | 已 in_progress 返回 409 |
| DELETE /rounds/:id | 幂等 | 已删除返回 404 |

---

## 6. Ownership 校验规则

- 所有 API 操作通过 JWT 获取 `req.userId`
- 查询 Round 时 WHERE `ownerUserId = req.userId`
- **跨用户访问统一返回 404**（不暴露 round 是否存在）
- HoleScore 操作通过其 Round 的 ownerUserId 校验

---

## 7. Deleted Round 的访问规则

- `GET /rounds`：默认**不包含**已删除 round
- `GET /rounds?include_deleted=true`：包含已删除（用于客户端同步删除状态）
- `GET /rounds/:id`：已删除 round **可以**获取详情
- `PATCH/finish/abandon/reopen`：已删除 round 返回 404
- `DELETE`：已删除 round 返回 404（幂等考虑）

---

## 8. updated_after 的用法

客户端登录时使用增量拉取：
```
GET /rounds?updated_after=2026-03-09T10:00:00Z&include_deleted=true&limit=100
```

- 服务端过滤 `updatedAt > updated_after`
- 包含 deleted 以便客户端同步删除状态
- 客户端扫描本地所有 summary 的 `sync.lastSyncedAt`，取最大值作为 updated_after
- 首次拉取（无 lastSyncedAt）不传 updated_after，获取全量

---

## 9. 错误码约定

| HTTP | error 字段 | 含义 |
|------|-----------|------|
| 400 | `validation` | 请求参数验证失败，附 `messages[]` |
| 401 | `Authentication required` / `Token expired` / `Invalid token` | 认证失败 |
| 404 | `Round not found` | round 不存在或非本人 |
| 409 | `conflict` | POST /rounds ID 冲突（不同 owner） |
| 409 | `invalid_transition` | 状态转换不合法 |
| 409 | `locked` | Grace 过期，不可 reopen |
| 500 | — | 服务端错误 |

---

## 10. 当前已知限制

| # | 限制 | 说明 |
|---|------|------|
| L1 | 无分页 cursor | list 接口只有 limit，无 offset/cursor，超 200 条需多次调用 |
| L2 | baseVersion 只做 advisory | PATCH 的版本检查不拒绝 mismatch，v1 保守策略 |
| L3 | 无批量操作 | 每次只能操作单个 round 或单个洞的成绩 |
| L4 | 无 Shot 同步 | 击球详情无 API |
| L5 | 无 Buddy/Club API | 球友和球会数据无同步端点 |
| L6 | 无 webhook/event | 服务端变更无主动通知 |
