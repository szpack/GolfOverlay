# GolfHub Sync v1 — 架构文档

## 1. 文档目的

本文档描述 GolfHub 云同步系统 Sync v1 的当前已实现架构。所有内容基于已落地的代码，用于指导后续开发、调试和架构评审。

---

## 2. Sync v1 当前能力边界

| 维度 | 当前已实现 | 不在 v1 范围 |
|------|-----------|-------------|
| 同步对象 | Round + HoleScore | Buddy / Club / Course / Shot |
| 存储 | localStorage | IndexedDB |
| 推送 | 单条 FIFO + 指数退避 | 批量推送、WebSocket |
| 拉取 | 登录时摘要 + 开局时详情 | 实时推送通知、SSE、长轮询 |
| 冲突 | 保守 LWW + dirty flag | 三路合并、CRDT、用户手动解决 UI |
| 多设备 | 刷新后可见 | 实时协同 |
| 离线 | 完全可用，上线后推送 | Service Worker、Background Sync |
| 重试 | 最多 10 次，指数退避 2s→30s | 永久队列、跨会话恢复 |
| UI | sidebar 状态指示 + round card badge + console 工具 | 冲突手动解决弹窗 |

---

## 3. 核心原则

### 3.1 Local First
所有写操作先落 localStorage，UI 立即响应。同步在后台异步进行，网络故障不影响用户操作。

### 3.2 Async Push / Pull
- **Push**：用户操作 → `applyLocal*` → `SyncQueue.enqueue()` → `PushEngine` 消费 → REST API
- **Pull**：登录时拉摘要、打开 round 时拉详情，通过 `applyRemote*` 合并到本地

### 3.3 Round / HoleScore 为唯一同步对象
当前只有 Round（含 meta）和 HoleScore（per-hole per-player 成绩）参与云同步。Buddy、Club、Course、Shot 仍为纯本地数据。

### 3.4 保守冲突策略
- 服务端权威字段（status、lockState 等）：始终取服务端值
- 内容字段（courseName、holesCompleted 等）：LWW，dirty+newer 本地胜
- 成绩字段：dirty hole 本地胜，否则按 updatedAt 比较

---

## 4. 顶层模块图

```
┌──────────────────────────────────────────────────────────┐
│                     RoundStore                            │
│  applyLocal*（用户操作 → enqueue）                         │
│  applyRemote*（服务端数据 → 合并，绝不 enqueue）            │
│  flushProgress（score 脏数据 → onScoreFlush）              │
└────────┬──────────────────────────────┬───────────────────┘
         │ enqueue                      │ merge
         ▼                              ▲
┌────────────────────────────────────────────────────────────┐
│                  SyncCoordinator                           │
│  enqueueRound{Create,Update,Finish,Abandon,Reopen,Delete} │
│  enqueueScoreUpsert · onScoreFlush · onRoundOpen · status  │
└────┬──────────────┬──────────────────────▲─────────────────┘
     │              │                      │
     ▼              ▼                      │
┌──────────┐ ┌──────────────┐   ┌──────────┴──────────┐
│ SyncQueue│→│ PushEngine   │   │   PullEngine        │
│ (FIFO)   │ │ drain→API    │   │ pullSummaries       │
│ coalesce │ │ backoff/retry│   │ pullRoundDetail     │
└──────────┘ └──────┬───────┘   └──────────┬──────────┘
                    │                      │
             ┌──────▼───────┐   ┌──────────▼──────────┐
             │ onSuccess →  │   │ ConflictResolver    │
             │ updateSyncMeta│  │ resolveRoundMeta    │
             │ onConflict → │   │ resolveHoleScores   │
             │ auto-pull    │   │ conflict log (200)  │
             └──────────────┘   └─────────────────────┘

┌──────────┐   ┌──────────┐
│ DeviceId │   │ SyncDebug│ ← console 调试工具
└──────────┘   └──────────┘
```

### 文件清单

| 文件 | 行数 | localStorage Key | 职责 |
|------|------|-----------------|------|
| `js/cloud/deviceId.js` | 37 | `golf_v7_device_id` | 设备 UUID 生成与缓存 |
| `js/cloud/syncQueue.js` | 341 | `golf_v7_sync_queue` | FIFO 队列，coalesce 合并 |
| `js/cloud/pushEngine.js` | 282 | — | 队列消费 → REST API |
| `js/cloud/pullEngine.js` | 170 | — | 登录拉摘要，开局拉详情 |
| `js/cloud/conflictResolver.js` | 219 | `golf_v7_conflict_log` | LWW + dirty-aware 冲突解决 |
| `js/cloud/syncCoordinator.js` | 420 | — | 中枢编排，唯一 enqueue 入口 |
| `js/cloud/syncDebug.js` | 202 | — | 控制台调试工具 |

### 加载顺序（index.html）

```
apiClient.js → authState.js → deviceId.js → syncQueue.js
→ conflictResolver.js → pushEngine.js → pullEngine.js
→ syncCoordinator.js → syncDebug.js
```

---

## 5. 关键数据流

### 5.1 创建 Round

```
用户点 "New Round"
→ NewRoundService.activateRound()
  → RoundStore.applyLocalCreate(round, snapshot)
    → putRound() 写 localStorage（立即可用）
    → _bumpLocalVersion(summary)
    → SyncCoordinator.enqueueRoundCreate(roundId, payload)
      → SyncQueue.enqueue({operation:'create'})
      → PushEngine.nudge()
        → POST /api/v1/rounds（幂等：同 ID+owner 返回已有）
        → onSuccess → _updateSyncMeta(serverVersion)
```

### 5.2 Round Meta 更新

```
D.save() → RoundStore.flushProgress()
→ recomputeProgress() 检测 holesCompleted 变化
  → dirtyFlags.meta = true, _markSyncPending()
→ SyncCoordinator.onScoreFlush() 检测 dirtyFlags.meta
  → _extractMetaPayload() → enqueueRoundUpdate()
    → SyncQueue.coalesce() 或 enqueue()
    → PushEngine.nudge()
      → PATCH /api/v1/rounds/:id
```

### 5.3 录入 Score

```
用户输入成绩
→ D.setPlayerGross() → scheduleSave(350ms debounce)
  → D.save() → RoundStore.flushProgress()
    ① 写 summary 到 localStorage
    ② _markHoleDirty(roundId, holeIdx)
       → dirtyHoles[holeNo]=true, dirtyFlags.score=true
       → _markSyncPending(summary)
    ③ SyncCoordinator.onScoreFlush(roundId, summary, dirtyHoles, roundData)
       → 遍历 dirtyHoles，每洞:
          _extractHoleScores(roundData, holeNo)
          enqueueScoreUpsert(roundId, holeNo, scores, serverVersion)
            → SyncQueue.coalesce(roundId:hole:N, 'upsert_scores') 或 enqueue()
            → PushEngine.nudge()
    ④ 清除 dirtyFlags + dirtyHoles
```

**关键语义**：score 变更不 bump localVersion。localVersion 只跟踪 round meta 变更。score 脏状态通过 dirtyFlags.score + dirtyHoles 追踪。

### 5.4 Push 成功

```
PushEngine drain cycle:
→ SyncQueue.peek() 取队首 pending
→ markSyncing(changeId)
→ _dispatch(entry) 按 entity_type:operation 路由到 API
→ 2xx 成功:
  → markSynced(changeId)（从队列移除）
  → SyncCoordinator._handlePushSuccess()
    → _updateSyncMeta(roundId, { serverVersion, lastSyncedAt })
    → summary.sync.syncStatus = 'synced'
```

### 5.5 Pull 合并

```
场景 A — 登录时:
→ SyncCoordinator._pullOnLogin()
  → 扫描所有 summary 取最大 lastSyncedAt
  → PullEngine.pullSummaries({updatedAfter, force:true})
    → GET /api/v1/rounds?limit=100&include_deleted=true&updated_after=X
    → 每条 → RoundStore.applyRemoteMerge(serverRound)

场景 B — 打开 round:
→ SyncCoordinator.onRoundOpen(roundId)
  → PullEngine.pullRoundDetail(roundId)
    → 并行: GET /rounds/:id + GET /rounds/:id/hole-scores
    → RoundStore.applyRemoteMerge(roundDetail)
    → RoundStore.applyRemoteScoreMerge(roundId, holeScores)
```

### 5.6 Conflict Log

所有冲突（push 失败、pull 合并选择）都记录到 `golf_v7_conflict_log`：
```javascript
{ ts, roundId, field, localValue, remoteValue, winner, reason }
```
最多保留 200 条。可通过 `SyncDebug.conflicts()` 查看。

---

## 6. Queue 结构

localStorage key: `golf_v7_sync_queue`

### Entry Shape（固定 v1，不可变更）

```javascript
{
  change_id:          'chg_<timestamp>_<random>',
  entity_type:        'round' | 'hole_score',
  entity_id:          string,        // round id 或 'roundId:hole:N'
  operation:          string,        // create|update|finish|abandon|reopen|delete|upsert_scores
  payload:            object,
  base_version:       number,        // serverVersion at enqueue time（0 = never synced）
  status:             'pending' | 'syncing' | 'synced' | 'failed' | 'conflict',
  retry_count:        number,
  last_error_code:    number | null,
  last_error_message: string | null,
  created_at:         string,        // ISO
  updated_at:         string,        // ISO
  device_id:          string,        // DeviceId.get()
  user_id:            string
}
```

### Status 转换

```
pending → syncing → synced（移除）
pending → syncing → failed → pending（retryFailed）
pending → syncing → conflict（永久，需人工处理）
```

### Coalesce 规则

- 只在 `pending` 状态的条目上合并
- `update` 操作：shallow merge payload
- `upsert_scores` 操作：整体替换 payload
- 其他操作（create、finish 等）不合并

---

## 7. Push 规则

### 消费顺序
FIFO——严格按 `created_at` 顺序消费。

### Dispatch 路由

| entity_type:operation | HTTP | Endpoint |
|---|---|---|
| `round:create` | POST | `/api/v1/rounds` |
| `round:update` | PATCH | `/api/v1/rounds/:id` |
| `round:finish` | POST | `/api/v1/rounds/:id/finish` |
| `round:abandon` | POST | `/api/v1/rounds/:id/abandon` |
| `round:reopen` | POST | `/api/v1/rounds/:id/reopen` |
| `round:delete` | DELETE | `/api/v1/rounds/:id` |
| `hole_score:upsert_scores` | PUT | `/api/v1/rounds/:roundId/holes/:holeNo/scores` |

注意：`hole_score` 的 `entity_id` 是 `roundId:hole:N` 格式，dispatch 时通过 `split(':hole:')` 解析出 roundId 和 holeNo。

### 退避常量

```javascript
BASE_DELAY   = 2000    // 2s
MAX_DELAY    = 30000   // 30s
MAX_RETRIES  = 10
```

公式：`delay = BASE_DELAY * 2^min(retryCount, 5)`，封顶 MAX_DELAY。

### 失败分类

| HTTP Status | 分类 | 处理 |
|---|---|---|
| 0（网络错误） | 可重试 | markFailed，等退避 |
| 401（认证过期） | 可重试 | markFailed，stop engine |
| 409（版本冲突） | 永久 | markConflict，触发 auto-pull |
| 429（限流） | 可重试 | markFailed，stop engine |
| 其他 4xx | 永久 | markConflict |
| 5xx | 可重试 | markFailed，等退避 |

---

## 8. Pull 规则

### pullSummaries

- 触发时机：登录时、`SyncDebug.forcePull()` 手动触发
- 冷却：30 秒（`force:true` 跳过冷却）
- 参数：`updatedAfter`（取所有 summary 中最大的 `lastSyncedAt`）
- API：`GET /api/v1/rounds?limit=100&include_deleted=true&updated_after=X`
- 每条结果调用 `RoundStore.applyRemoteMerge()`

### pullRoundDetail

- 触发时机：用户打开 round（`SyncCoordinator.onRoundOpen()`）
- 前置检查：`serverVersion === 0` 则跳过（从未同步过的本地 round）
- 并行请求：`GET /rounds/:id` + `GET /rounds/:id/hole-scores`
- 合并：`applyRemoteMerge()` + `applyRemoteScoreMerge()`
- 404 处理：服务端已删除 → 本地设置 `deletedAt`

---

## 9. 冲突处理规则

### Round Meta 冲突

**SERVER_FIELDS**（始终取服务端值，不可被本地覆盖）：
```
status, lockState, endedAt, endedBy, reopenUntil,
reopenCount, startedAt, visibility, deletedAt
```

**LWW_FIELDS**（本地 dirty + 本地更新时间更新 → 本地胜，否则服务端胜）：
```
courseName, routingName, holesPlanned, holesCompleted,
lastActivityAt, date
```

### HoleScore 冲突

逐洞逐 `roundPlayerId` 比较：
1. 该洞在 `dirtyHoles` 中 → **本地胜**，跳过服务端数据
2. 该洞非 dirty → 比较 `serverScore.updatedAt` vs `localHole._remoteUpdatedAt`
   - 服务端更新 → **服务端胜**，覆盖 gross/notes
   - 否则 → **本地胜**

### 关键约束

- `applyRemoteMerge()` 和 `applyRemoteScoreMerge()` **绝不调用 SyncCoordinator**，绝不 enqueue
- 只有 `applyLocal*` 系列方法会触发 enqueue

---

## 10. Sync 元数据定义

每个 RoundSummary 包含以下 sync 相关字段：

### sync 对象

| 字段 | 类型 | 默认值 | 语义 |
|------|------|--------|------|
| `syncStatus` | string | `'local'` | `local`（从未同步）\| `pending`（有待推送变更）\| `synced`（已同步）\| `conflict`（冲突） |
| `localVersion` | number | `1` | **仅跟踪 round meta 本地变更**。每次 `applyLocal*` 调用（Create/Finish/Abandon/Reopen/Remove）时 +1。score 变更**不 bump localVersion** |
| `serverVersion` | number | `0` | 来自服务端响应，每次服务端 mutation +1。`0` 表示从未同步到云端 |
| `lastSyncedAt` | string\|null | `null` | 上次成功 push/pull 的 ISO 时间戳 |

### dirtyFlags 对象

| 字段 | 类型 | 语义 |
|------|------|------|
| `meta` | boolean | `true` = 有 round meta 变更待同步（holesCompleted 等） |
| `score` | boolean | `true` = 有 hole score 变更待同步 |

### dirtyHoles 对象

```javascript
{ [holeNo]: true }   // holeNo 是 1-based
```

`flushProgress()` 消费 dirtyHoles 后清除。

### _markSyncPending(summary)

当 `syncStatus` 为 `'synced'` 或 `'local'` 时，设为 `'pending'`。已经是 `'pending'` 或 `'conflict'` 时不变。

---

## 11. 当前已知限制 / 技术债

| # | 问题 | 影响 | 优先级 |
|---|------|------|--------|
| T1 | localStorage 容量上限 ~5MB，SyncQueue + RoundStore + ConflictLog 共享 | 大量离线改动可能超额 | 中 |
| T2 | PushEngine 页面关闭即停，pending 条目延迟到下次打开 | 推送延迟 | 低 |
| T3 | pullSummaries 只取 100 条，超过的历史 round 无法拉取 | 老用户数据不完整 | 中 |
| T4 | 无 token refresh，JWT 过期后 PushEngine 停止 | 长时间使用中断同步 | 中 |
| T5 | ConflictResolver 无用户介入 UI，静默解决 | 可能丢弃本地改动 | 低 |
| T6 | coalesce 只合并 pending，failed 条目不参与 | 重试时可能推送过时数据 | 低 |
| T7 | script tag 版本号手动维护 | 浏览器缓存旧代码 | 低 |

---

## 12. 后续演进方向

| 阶段 | 内容 | 前置 |
|------|------|------|
| v1.1 | token refresh + 分页拉取 + 容量监控 | 无 |
| v1.2 | 冲突通知 toast + 详情查看 UI | v1.1 |
| v2.0 | WebSocket/SSE 实时推送通知 | 服务端支持 |
| v2.1 | Buddy/Club/Course 同步（复用 SyncQueue + PushEngine） | v1.1 |
| v3.0 | Service Worker + IndexedDB + Background Sync | 重大重构 |
