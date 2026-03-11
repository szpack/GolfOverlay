# GolfHub Round Model — 业务模型文档

## 1. Round 是什么，不是什么

**Round 是一场球局的完整实例**。它记录了一次具体的打球过程：谁在什么球场、打了哪些洞、每洞多少杆。

Round **不是**：
- 不是模板——每个 Round 是一次性的实例，不能被"重复使用"
- 不是球场——Round 包含球场快照（snapshot），但球场本身由 ClubStore 管理
- 不是球员——Round 包含球员快照，但球员本身由 BuddyStore 管理
- 不是赛事——Round 可以属于某个 Event，但 Event 是更高层的组织单元

---

## 2. RoundSummary vs RoundData

RoundStore 采用 **Summary + Data 分层存储**：

| 维度 | RoundSummary | RoundData |
|------|-------------|-----------|
| localStorage | `golf_v6_round_summaries`（所有 round 共享一个 key） | `golf_v6_rd_{roundId}`（每个 round 单独一个 key） |
| 加载时机 | 应用启动时全量加载到内存 | 按需加载（打开某个 round 时） |
| 包含内容 | 状态、日期、球场名、球员名列表、进度、sync 元数据 | 球场快照、球员快照、逐洞成绩、击球数据 |
| 大小 | 轻量（~1KB/round） | 较重（~5-20KB/round） |
| 用途 | 列表展示、索引查询、状态判断 | 成绩录入、数据编辑、导出 |

**不可违反的规则**：
- Summary 拉取（pullSummaries）不能写入 Data 字段
- Data 字段的变更必须通过 `flushProgress()` 持久化
- Summary 和 Data 的 roundId 必须一致

---

## 3. RoundSummary 主要字段

### 基础信息

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | string | 格式 `rnd_YYYYMMDD_<ts36><rand6>`，客户端生成 |
| `version` | number | summary schema version，当前固定 1 |
| `status` | string | 状态机主状态（见第 4 节） |
| `date` | string | YYYY-MM-DD |
| `teeTime` | string\|null | ISO 开球时间 |
| `isActive` | boolean | 是否为当前活跃 round |

### 球场信息

| 字段 | 类型 | 说明 |
|------|------|------|
| `courseId` | string\|null | ClubStore 中的 club ID |
| `courseName` | string | 球场名（快照值） |
| `routingName` | string | 路线名（快照值） |
| `routeMode` | string\|null | 路线模式 |
| `routeSummary` | string | 路线摘要 |

### 球员信息

| 字段 | 类型 | 说明 |
|------|------|------|
| `playerIds` | string[] | roundPlayerId 列表 |
| `playerNames` | string[] | 球员名列表（展示用） |
| `playerCount` | number | 球员人数 |

### 进度

| 字段 | 类型 | 说明 |
|------|------|------|
| `holesPlanned` | number | 计划洞数（9 或 18，最大 36） |
| `holesCompleted` | number | 已完成洞数（0 ~ holesPlanned） |
| `lastActivityAt` | string\|null | ISO，最后一次成绩/击球写入时间 |

### 生命周期

| 字段 | 类型 | 说明 |
|------|------|------|
| `startedAt` | string\|null | ISO，round 开始时间 |
| `endedAt` | string\|null | ISO，round 结束时间（finish 或 abandon） |
| `endedBy` | string\|null | `'manual'` \| `'auto'` |
| `lockState` | string | `'open'` \| `'grace'` \| `'locked'`（见第 6 节） |
| `reopenUntil` | string\|null | ISO，grace 窗口截止时间 |
| `reopenCount` | number | 重新打开次数 |
| `lastReopenedAt` | string\|null | ISO，最后一次 reopen 时间 |
| `deletedAt` | string\|null | ISO，软删除时间戳 |
| `abandonReason` | string | 放弃原因 |

### Sync 元数据

| 字段 | 说明 |
|------|------|
| `sync.syncStatus` | `'local'` \| `'pending'` \| `'synced'` \| `'conflict'` |
| `sync.localVersion` | 本地 meta 变更版本号（仅 applyLocal* 操作 bump） |
| `sync.serverVersion` | 服务端版本号 |
| `sync.lastSyncedAt` | 上次同步时间 |
| `dirtyFlags.meta` | 是否有 meta 待同步 |
| `dirtyFlags.score` | 是否有 score 待同步 |
| `dirtyHoles` | `{ [holeNo]: true }` 待同步的洞 |

### 统计

| 字段 | 类型 | 说明 |
|------|------|------|
| `summaryStats` | object\|null | finish/abandon 时计算的统计快照 |

---

## 4. Round 状态机

```
                    ┌─────────────┐
         创建 ────→ │  scheduled  │
                    └──────┬──────┘
                           │ startRound / activateRound
                           ▼
                    ┌─────────────┐
              ┌───→ │ in_progress │ ←───┐
              │     └──┬──────┬──┘     │
              │        │      │        │
              │  finish│      │abandon │ reopen
              │        ▼      ▼        │
              │  ┌──────┐  ┌─────────┐ │
              └──│finish│  │abandoned│─┘
           reopen│  ed  │  │         │
                 └──────┘  └─────────┘
```

| 起始状态 | 目标状态 | 触发方法 | 条件 |
|----------|----------|----------|------|
| scheduled | in_progress | `startRound()` / `activateRound()` | — |
| scheduled | abandoned | `abandonRound()` | — |
| in_progress | finished | `finishRound()` / `applyLocalFinish()` | — |
| in_progress | abandoned | `abandonRound()` / `applyLocalAbandon()` | — |
| finished | in_progress | `reopenRound()` / `applyLocalReopen()` | `lockState === 'grace'` |
| abandoned | in_progress | `reopenRound()` / `applyLocalReopen()` | — |

### Auto-Finish

`RoundStore.checkAutoFinish()` 在 Shell 启动和 `flushProgress()` 时自动执行：
- 条件：`status === 'in_progress'` 且非活跃 round 且空闲 >= 6 小时 且 `holesCompleted >= holesPlanned`
- 结果：调用 `applyLocalFinish(roundId, { endedBy: 'auto' })`

---

## 5. Finish / Abandon / Reopen 规则

### finishRound(roundId, opts)

1. 状态：`in_progress` → `finished`
2. 设置 `endedAt`、`endedBy`（默认 `'manual'`，auto-finish 时为 `'auto'`）
3. 设置 `lockState = 'grace'`
4. 设置 `reopenUntil = now + 24 小时`
5. 计算 `derivedStats`（summaryStats）
6. 如果是活跃 round，清除活跃状态

### abandonRound(roundId, reason)

1. 状态：`in_progress` 或 `scheduled` → `abandoned`
2. 设置 `endedAt`、`endedBy = 'manual'`
3. 设置 `lockState = 'locked'`（**无 grace 窗口**）
4. 记录 `abandonReason`
5. 计算 `derivedStats`

### reopenRound(roundId)

1. `finished` + `lockState === 'grace'` → `in_progress`
   - 保留 `endedAt`，设 `lockState = 'open'`
2. `abandoned` → `in_progress`
   - 清除 `endedAt`、`abandonReason`，设 `lockState = 'open'`
3. 递增 `reopenCount`，记录 `lastReopenedAt`

---

## 6. lockState / reopenUntil / reopenCount 语义

| lockState | 含义 | 可 reopen |
|-----------|------|-----------|
| `open` | round 正常进行中 | — |
| `grace` | round 已 finish，24 小时内可重新打开 | 是 |
| `locked` | grace 过期或 abandon | 否（abandon 可 reopen，locked finish 不可） |

### Grace 窗口

- `GRACE_WINDOW_MS = 24 * 60 * 60 * 1000`（24 小时）
- finish 时设置 `reopenUntil = now + 24h`
- `checkGraceLock()` 在 Shell 启动和 flush 时检查过期的 grace 窗口，过期则设 `lockState = 'locked'`

### reopenCount

累计重新打开次数，每次 reopen +1。用于审计和防滥用。

---

## 7. holesCompleted / holesPlanned / lastActivityAt

### holesCompleted

- 由 `recomputeProgress()` 自动计算
- 计算逻辑：遍历所有洞，计算"所有球员都有 gross 值"的洞数
- 变更时设置 `dirtyFlags.meta = true` + `_markSyncPending()`

### holesPlanned

- 创建 round 时根据球场路线确定（9 或 18）
- 不随打球过程变化

### lastActivityAt

- 每次 `updateHoleScore()` 或 `updateShot()` 时更新为 `new Date().toISOString()`
- 用于 auto-finish 判断（空闲超 6 小时）

---

## 8. playersSnapshot 的作用

`RoundData.playersSnapshot` 是 round 创建时球员信息的**不可变快照**：

```javascript
[{
  roundPlayerId: 'rp_abc123',   // 局内唯一标识
  playerId: 'buddy_xxx',        // 可选，长期身份 ID
  name: '张三',
  color: 'blue'
}]
```

**作用**：
- 保证即使源 Buddy 被删除或改名，round 内的球员信息不变
- 作为 `scores` 和 `shots` 对象的 key 索引源
- 同步到云端作为 `playersSnapshotJson`

**不是实时引用**——修改 BuddyStore 中的球员信息不会影响已有 round 的 snapshot。

---

## 9. courseSnapshot 的作用

`RoundData.courseSnapshot` 是 round 创建时球场洞信息的快照：

```javascript
[{
  number: 1,        // 1-based 洞号
  par: 4,
  yards: 380,
  holeId: 'nine1_h1'
}]
```

**作用**：
- 保证球场数据修改不影响已有 round 的 par 和 yards 基准
- 用于计算 delta（gross - par）
- 同步到云端作为 `courseSnapshotJson`

---

## 10. 实现入口

| 模块 | 文件 | 职责 |
|------|------|------|
| RoundStore | `js/roundStore.js` | 持久层：Summary/Data 分层存储、sync 元数据、applyLocal*/applyRemote* |
| Round | `js/round.js` | 纯函数模型：createRound、状态映射、成绩计算、fromScorecard/toScorecard |
| RoundTypes | `js/roundTypes.js` | JSDoc 类型定义（无运行时代码） |
| NewRoundService | `js/newRoundService.js` | 创建服务：验证输入 → 构建 Round → applyLocalCreate |
| RoundsPage | `js/shell/roundsPage.js` | 列表 UI：卡片渲染、End/Reopen/Delete 操作 |
| RoundHelper | `js/shell/roundHelper.js` | 数据桥接：RoundStore → 页面展示格式 |
| app.js | `js/app.js` | Overlay Center：成绩录入 → D.save() → flushProgress |

---

## 11. 不允许混淆的边界

### roundPlayerId 是局内真相键

- `roundPlayerId`（格式 `rp_<ts36>_<rand4>`）是 round 内所有数据归属的**主键**
- `scores[rpId]`、`shots[rpId]` 都以 roundPlayerId 为 key
- HoleScore 同步到云端时，以 `roundPlayerId` 为归属键（upsert 的 unique key 是 `roundId + holeNo + roundPlayerId`）

### playerId 不是局内主键

- `playerId` 是球员的**长期身份标识**，可能为 null（客人、历史数据）
- playerId 只用于跨 round 统计和 buddy 回溯，不用于局内数据索引
- 同一个 playerId 在不同 round 中会有不同的 roundPlayerId

### Round 是实例，不是模板

- 每个 Round 有唯一 ID，创建后不可"重用"
- `cloneRound()` 会生成新 ID，是全新实例

### Snapshot 是快照，不是实时引用

- `playersSnapshot` 和 `courseSnapshot` 在 round 创建时固化
- 源数据（BuddyStore、ClubStore）后续变更不影响已有 round
- 修改 round 内的 snapshot 不影响源数据
