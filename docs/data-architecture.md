# GolfHub 数据架构文档

## 1. 顶层实体概览

| 实体 | 说明 | 主模块 | 主键格式 |
|------|------|--------|---------|
| User | 已注册用户，拥有账号和 JWT | AuthState (cloud) | UUID (server) |
| Player | 旧版概念，正在迁移为 Buddy | — | — |
| Buddy | 球友联系人，本地 CRUD | BuddyStore | `buddy_<ts>_<rand>` |
| Club | 球会，包含多个 Course/Layout | ClubStore | `club_<ts>_<rand>` |
| Course/Layout | 球场路线（9/18 洞结构） | ClubStore 内嵌 | `layout_<id>` |
| Round | 一场球局实例 | RoundStore | `rnd_YYYYMMDD_<ts36><rand6>` |
| HoleScore | 某洞某球员的成绩 | RoundStore (Data) / Server | `roundId + holeNo + roundPlayerId` |
| Shot | 某次击球的详细信息 | RoundStore (Data) | round 内 per-player per-hole 数组 |

---

## 2. 云端 vs 本地数据分布

### 当前已在云端的数据

| 实体 | 云端存储 | 同步方式 | 实现版本 |
|------|---------|---------|---------|
| User | PostgreSQL (Prisma) | 注册/登录 API | v23.x |
| Round | PostgreSQL (Prisma) | Sync v1 Push/Pull | v24.1.0 |
| HoleScore | PostgreSQL (Prisma) | Sync v1 Push/Pull | v24.1.0 |

### 当前仅在本地的数据

| 实体 | localStorage Key | 说明 |
|------|-----------------|------|
| Buddy | `golf_v5_buddies` | 球友联系人，离线优先 |
| Club/Course | `golf_v5_clubs` | 球会主数据（含内嵌 Layouts） |
| Shot | `golf_v6_rd_{roundId}` 内 | 嵌在 RoundData.shots 中，不单独同步 |
| Scorecard (D.sc) | `golf_v4_scorecard` | 当前活跃 round 的业务数据（兼容层） |
| Workspace (D.ws) | `golf_v4_workspace` | 当前 UI 状态（当前洞、显示偏好、Canvas 布局） |
| Background | `golf_v531_bg` | 背景图 base64 |
| SyncQueue | `golf_v7_sync_queue` | 待推送队列 |
| DeviceId | `golf_v7_device_id` | 设备 UUID |
| ConflictLog | `golf_v7_conflict_log` | 冲突日志（最多 200 条） |

---

## 3. Summary / Detail / Snapshot / UI 状态分层

### Summary（摘要）

轻量级索引数据，应用启动时全量加载。

| 数据 | 存储 | 说明 |
|------|------|------|
| RoundSummary | `golf_v6_round_summaries` | 所有 round 的摘要信息（状态、日期、进度、sync 元数据） |
| ActiveRoundId | `golf_v6_round_active` | 当前活跃 round ID |
| StoreMeta | `golf_v6_store_meta` | schema 版本 |

**规则**：Summary 拉取（pullSummaries）只更新 Summary 层字段，**不能写入 Detail/Data 层**。

### Detail（详情）

按需加载的完整数据。

| 数据 | 存储 | 说明 |
|------|------|------|
| RoundData | `golf_v6_rd_{roundId}` | 球场快照、球员快照、逐洞成绩、击球数据 |

每个 round 有独立的 localStorage key，避免单次加载过大。

### Snapshot（快照）

创建时固化的引用数据副本，之后不再随源数据变化。

| 快照 | 位置 | 说明 |
|------|------|------|
| `courseSnapshot` | RoundData | 球场洞信息快照（par、yards、holeId） |
| `playersSnapshot` | RoundData | 球员信息快照（roundPlayerId、name、color） |
| `courseSnapshotJson` | Server Round | 云端存储的球场快照（JSON） |
| `playersSnapshotJson` | Server Round | 云端存储的球员快照（JSON） |

**规则**：Snapshot 是不可变的，修改源数据（ClubStore/BuddyStore）不影响已有 round 的 snapshot。

### UI 状态

纯前端状态，不参与同步。

| 数据 | 存储 | 说明 |
|------|------|------|
| Workspace | `golf_v4_workspace` | 当前洞号、当前球员、显示偏好、Canvas 布局 |
| Sidebar | `golf_sidebar_collapsed` | 侧边栏折叠状态 |

---

## 4. 本地数据与云端数据的连接关系

```
┌─────────────────────────────────────────────────────────┐
│                    localStorage                          │
│                                                          │
│  ┌─────────────────┐    ┌──────────────────────┐        │
│  │ RoundSummary    │───▶│ sync.serverVersion   │ ◀──┐   │
│  │ (golf_v6_...)   │    │ sync.syncStatus      │    │   │
│  └─────────────────┘    │ sync.lastSyncedAt    │    │   │
│           │              └──────────────────────┘    │   │
│           ▼                                          │   │
│  ┌─────────────────┐                                 │   │
│  │ RoundData       │                                 │   │
│  │ (golf_v6_rd_*)  │                                 │   │
│  │ ├ courseSnapshot │                                 │   │
│  │ ├ playersSnapshot│                                │   │
│  │ ├ scores        │ ◀─── HoleScore 合并来源         │   │
│  │ └ shots         │      (applyRemoteScoreMerge)    │   │
│  └─────────────────┘                                 │   │
│           │                                          │   │
│     SyncQueue ────────── PushEngine ──────────────────┤   │
│  (golf_v7_sync_queue)          │                     │   │
│                                ▼                     │   │
└────────────────────────────────┼─────────────────────┘   │
                                 │ HTTP                    │
                                 ▼                         │
┌────────────────────────────────────────────────────────┐  │
│              PostgreSQL (Server)                       │  │
│  ┌──────────┐    ┌──────────────┐                     │  │
│  │  Round   │───▶│ serverVersion│ ────────────────────┘  │
│  │          │    │ updatedAt    │                        │
│  │          │    │ ownerUserId  │                        │
│  └──────────┘    └──────────────┘                        │
│  ┌──────────┐                                            │
│  │HoleScore │  unique: roundId + holeNo + roundPlayerId  │
│  └──────────┘                                            │
└──────────────────────────────────────────────────────────┘
```

### 同步连接点

1. **Round 创建**：客户端生成 ID → POST /rounds → 服务端存储 → 返回 serverVersion → 写入 summary.sync
2. **Score 更新**：本地 scores → PUT /rounds/:id/holes/:holeNo/scores → upsert by roundPlayerId
3. **Pull 合并**：服务端 Round → applyRemoteMerge → 更新 summary + data
4. **Pull Score**：服务端 HoleScore[] → applyRemoteScoreMerge → 按 roundPlayerId 合并到 scores

### Ownership

- 云端 Round 通过 `ownerUserId` 绑定到 User
- 所有 API 操作校验 ownership，跨用户访问统一返回 404
- 本地 Round 无 ownership 概念（单用户设备）

---

## 5. 为何采用 Local-First + Sync

### 设计决策

1. **离线可用是刚需**：球场网络信号差，用户必须能离线录入成绩
2. **延迟敏感**：成绩录入需即时反馈，不能等网络往返
3. **渐进式迁移**：项目从纯本地 MVP 演进，local-first 是最小改动路径
4. **服务端简单**：不需要实时协同的复杂基础设施

### 架构选择

- 写操作 → localStorage 立即完成 → 后台异步 push
- 读操作 → 始终从 localStorage 读取 → 定期 pull 更新
- 冲突 → 保守策略自动解决（服务端权威 + LWW）

---

## 6. D.sc() 与 RoundStore 的关系

`D.sc()`（data.js 的 scorecardData）是**当前活跃 round 的工作视图**，它与 RoundStore 的关系是：

```
创建 round:
  NewRoundService → RoundStore.applyLocalCreate()
                  → D.sc() 初始化

录入成绩:
  用户操作 → D.setPlayerGross() → scheduleSave(350ms)
          → D.save() → RoundStore.flushProgress()

切换 round:
  RoundStore → roundHelper.loadIntoScorecard() → D.sc() 重写
```

`D.sc()` 存储在 `golf_v4_scorecard`，RoundData 存储在 `golf_v6_rd_{id}`。`flushProgress()` 负责将 D.sc() 的变更同步到 RoundStore。

---

## 7. localStorage Key 汇总

| Key | 版本 | 内容 | 模块 |
|-----|------|------|------|
| `golf_v4_scorecard` | v4.0 | 当前 round 业务数据 | data.js |
| `golf_v4_workspace` | v4.0 | UI 状态 | data.js |
| `golf_v531` | legacy | 旧版数据（自动迁移） | data.js |
| `golf_v531_bg` | legacy | 背景图 base64 | data.js |
| `golf_v5_buddies` | v5 | 球友列表 | buddyStore.js |
| `golf_v5_clubs` | v5 | 球会数据 | clubStore.js |
| `golf_v6_store_meta` | v6 | RoundStore schema 版本 | roundStore.js |
| `golf_v6_round_summaries` | v6 | 所有 round 摘要 | roundStore.js |
| `golf_v6_round_active` | v6 | 活跃 round ID | roundStore.js |
| `golf_v6_rd_{roundId}` | v6 | 单个 round 详情 | roundStore.js |
| `golf_v7_sync_queue` | v7 | 同步队列 | syncQueue.js |
| `golf_v7_device_id` | v7 | 设备 UUID | deviceId.js |
| `golf_v7_conflict_log` | v7 | 冲突日志 | conflictResolver.js |
| `golf_sidebar_collapsed` | — | 侧边栏状态 | shell.js |

---

## 8. 当前数据层已知技术债

| # | 问题 | 说明 |
|---|------|------|
| D1 | D.sc() 与 RoundStore 双写 | 当前活跃 round 同时存在于 `golf_v4_scorecard` 和 `golf_v6_rd_{id}`，由 `flushProgress()` 同步，有潜在不一致风险 |
| D2 | localStorage 容量共享 | 所有数据共享 ~5MB 配额，大量 round 或离线队列可能超额 |
| D3 | Shot 不参与云同步 | 击球详情（type/purpose/result/toPin）只存本地，跨设备不可见 |
| D4 | Buddy/Club 不参与云同步 | 球友和球会数据仍为纯本地，跨设备需重建 |
| D5 | 无数据导出/备份机制 | localStorage 清除即丢失（云端只有 Round + HoleScore） |
| D6 | Summary 和 Data 的一致性靠 flush | 如果 flush 未执行（页面崩溃），可能丢失最后的成绩变更 |
