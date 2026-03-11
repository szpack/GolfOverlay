# GolfHub — 项目规则

## 项目概览

GolfHub 是高尔夫赛事管理与实时展示系统。以 Round（球局）为核心，以 Gameplay 为主线，以 Overlay 为差异化展示层。

三层架构：
- **Management Layer** — Players / Teams / Clubs / Rounds
- **Round Workspace** — Scores / Gameplay / Shots
- **Overlay Engine** — Leaderboard / Player Tag / Scoreboard / Match Board

技术栈：纯前端（无构建工具，全局 IIFE，script 加载顺序即依赖），服务端 Express + Prisma + PostgreSQL。

---

## 核心架构事实

- 所有 JS 为全局函数/IIFE，无模块系统，脚本加载顺序在 `index.html` 中定义
- 数据持久化基于 localStorage，分层存储（Summary + Data）
- 云同步（Sync v1）已实现 Round + HoleScore 的 push/pull，架构为 local-first
- Canvas 渲染基准宽度 1920px，通过 `scale = w/1920` 缩放
- 不使用任何构建工具，浏览器直接打开 `index.html` 运行

---

## 不可违反的规则

### Sync 硬规则

1. **`applyRemote*` 绝不能 enqueue**——`applyRemoteMerge()` 和 `applyRemoteScoreMerge()` 只写 localStorage，绝不调用 SyncCoordinator 的任何 enqueue 方法。违反此规则会导致无限 push-pull 循环。

2. **`localVersion` 只跟踪 round meta 本地变更**——仅 `applyLocal{Create,Finish,Abandon,Reopen,Remove}` 会 bump localVersion。Score 变更不 bump localVersion，score 脏状态通过 `dirtyFlags.score` + `dirtyHoles` 追踪。

3. **Score 变更不 bump localVersion**——成绩录入走 `_markHoleDirty()` → `dirtyHoles[holeNo]` + `dirtyFlags.score` + `_markSyncPending()` 路径，不经过 `_bumpLocalVersion()`。

4. **SyncCoordinator 是唯一的 enqueue 入口**——只有 `syncCoordinator.js` 调用 `SyncQueue.enqueue()`，其他模块通过调用 SyncCoordinator 的公开方法间接入队。

5. **flushProgress() 是 score 同步的唯一触发点**——D.save() → RoundStore.flushProgress() → SyncCoordinator.onScoreFlush()。不存在其他路径将 score 变更推入 SyncQueue。

### Round 模型硬规则

6. **roundPlayerId 是局内真相键**——`scores[rpId]`、`shots[rpId]`、HoleScore 的 unique key (`roundId + holeNo + roundPlayerId`) 都以 roundPlayerId 为归属。playerId 可为 null（客人/旧数据），不可作为局内主键。

7. **Snapshot 是不可变快照**——`playersSnapshot` 和 `courseSnapshot` 在 round 创建时固化。修改 BuddyStore/ClubStore 不影响已有 round。修改 round 内 snapshot 不影响源数据。

8. **Summary 和 Data 不能混写**——pullSummaries 只更新 Summary 层，不能写入 Data 字段。Data 变更必须通过 flushProgress() 持久化。

9. **Round 是实例，不是模板**——每个 Round 有唯一 ID，创建后不可重用。cloneRound() 生成新 ID。

### API 硬规则

10. **GET /rounds 返回 Summary only**——不含 playersSnapshotJson、courseSnapshotJson 等大字段。客户端不应将此接口数据写入 RoundData。

11. **PUT /rounds/:id/holes/:holeNo/scores 是 upsert only**——请求中存在的 roundPlayerId 被 upsert，不存在的 roundPlayerId 不受影响。不是 replace-all，不会自动删除。

12. **跨用户 round/hole-score 访问统一返回 404**——不暴露 round 是否存在。

13. **POST /rounds 幂等**——同 ID + 同 owner 返回已有（200），同 ID + 不同 owner 返回 409。

14. **Status 转换不通过 PATCH**——必须使用专用 action 端点（finish/abandon/reopen）。PATCH 白名单不含 status/lockState/endedAt 等字段。

---

## 修改代码前必须先理解的边界

### RoundStore 四层分离

| 层 | 方法前缀 | 调 SyncCoordinator | 说明 |
|----|----------|-------------------|------|
| persist | putRound/putSummary/putData/remove | 否 | 纯存储，不触发同步 |
| applyLocal | applyLocal{Create,Finish,Abandon,Reopen,Remove} | 是 | 用户操作 → enqueue |
| applyRemote | applyRemote{Merge,ScoreMerge} | **绝不** | 服务端数据合并 |
| bridge | syncFromScorecard | 否 | D.sc() 兼容层 |

### Score 变更数据流

```
用户操作 → D.setPlayerGross() → scheduleSave(350ms)
→ D.save() → RoundStore.flushProgress()
  → _markHoleDirty() → dirtyFlags + dirtyHoles
  → SyncCoordinator.onScoreFlush(dirtyHoles)
    → enqueueScoreUpsert per dirty hole
  → 清除 dirtyFlags + dirtyHoles
```

### 冲突解决策略

- **SERVER_FIELDS**（始终服务端胜）：status, lockState, endedAt, endedBy, reopenUntil, reopenCount, startedAt, visibility, deletedAt
- **LWW_FIELDS**（dirty+newer 本地胜）：courseName, routingName, holesPlanned, holesCompleted, lastActivityAt, date
- **HoleScore**：dirtyHoles 中的洞本地胜，否则按 updatedAt 比较

---

## 哪些模块改动要特别谨慎

| 模块 | 风险点 |
|------|--------|
| `roundStore.js` | 四层分离边界、sync 元数据更新逻辑、flushProgress 脏标记清除 |
| `syncCoordinator.js` | 唯一 enqueue 入口、onScoreFlush 与 dirtyHoles 的消费逻辑 |
| `pushEngine.js` | hole_score entity_id 解析（`split(':hole:')`）、失败分类 |
| `conflictResolver.js` | SERVER_FIELDS 和 LWW_FIELDS 列表、dirty hole 判定 |
| `data.js` | D.sc() 与 RoundStore 的双写关系、flushProgress 触发链 |
| `pullEngine.js` | applyRemoteMerge 调用（必须不 enqueue） |

---

## 做改动时的输出要求

### 涉及 Sync 相关逻辑时

必须在改动说明中回答：
1. 是否影响 SyncQueue 的 enqueue/coalesce 行为？
2. 是否影响 dirtyFlags / dirtyHoles / syncStatus 的状态转换？
3. 是否可能破坏 applyRemote* "绝不 enqueue" 的约束？
4. 是否影响 localVersion 的 bump 语义？

### 每次完成代码修改后

必须按顺序执行：

**1. 升级 VERSION 文件**
- 读取根目录 `VERSION`（纯版本号一行）
- 按改动类型升级对应位，写回 `VERSION`（只保留一行，无空行）

**2. 在 README.md 的 `## Changelog` 下方插入新条目（最新在前）**
```
### vX.Y.Z — YYYY-MM-DD
- 变更点1（用户可感知的描述）
- 变更点2
```

**3. 输出建议 git commit message**
- 格式：`vX.Y.Z: <简短描述>`

---

## 项目结构

```
GolfHub/
├── index.html              # App Shell + Overlay Center
├── css/
│   ├── overlay.css         # Overlay 样式（不修改）
│   └── shell.css           # App Shell 样式
├── data/
│   └── courses.json        # 球场静态数据
├── js/
│   ├── data.js             # v4.0 统一数据访问层 D
│   ├── roundTypes.js       # JSDoc 类型定义（无运行时）
│   ├── round.js            # Round 数据模型（纯函数）
│   ├── roundStore.js       # Round 持久层（Summary + Data 分层）
│   ├── roundIndex.js       # Round 查询索引
│   ├── scoreboard.js       # 计分卡逻辑
│   ├── ui.js               # 界面操作
│   ├── clubStore.js        # Club 球会 CRUD（localStorage）
│   ├── buddyStore.js       # Buddy 球友 CRUD（localStorage）
│   ├── courseRouting.js     # 球场路由工具
│   ├── roundManager.js     # Round 状态管理
│   ├── newRoundService.js  # New Round 创建服务
│   ├── sessionIO.js        # 球局 JSON 导入导出
│   ├── import/             # GolfLive 成绩导入
│   ├── cloud/              # 云同步层（Sync v1）
│   │   ├── apiClient.js    # HTTP 客户端
│   │   ├── authState.js    # JWT 认证状态
│   │   ├── deviceId.js     # 设备 UUID
│   │   ├── syncQueue.js    # 同步队列（localStorage FIFO）
│   │   ├── conflictResolver.js  # 冲突解决
│   │   ├── pushEngine.js   # 推送引擎
│   │   ├── pullEngine.js   # 拉取引擎
│   │   ├── syncCoordinator.js   # 同步编排器
│   │   └── syncDebug.js    # 控制台调试工具
│   ├── shell/              # App Shell 框架
│   │   ├── router.js       # Hash-based SPA 路由
│   │   ├── shell.js        # Shell 控制器
│   │   ├── homePage.js     # Home 页面
│   │   ├── roundsPage.js   # Rounds 列表
│   │   ├── coursesPage.js  # Courses 管理
│   │   ├── courseDetailPage.js    # Club 详情
│   │   ├── courseStructureEditor.js # 结构编辑器
│   │   ├── courseImportPage.js    # 球场导入
│   │   ├── newRoundPage.js # New Round 页面
│   │   └── roundHelper.js  # Round 数据桥接
│   └── app.js              # 应用核心（Overlay Center）
├── server/                 # Express + Prisma 后端
│   ├── src/
│   │   ├── index.js        # 服务入口
│   │   ├── routes/rounds.js     # Round API 路由
│   │   ├── services/roundService.js  # Round 业务逻辑
│   │   └── middleware/auth.js   # JWT 认证中间件
│   └── prisma/schema.prisma    # 数据库 Schema
├── docs/                   # 架构文档
│   ├── sync-v1.md          # Sync v1 架构
│   ├── round-model.md      # Round 业务模型
│   ├── data-architecture.md # 数据架构
│   ├── api-design.md       # API 设计
│   └── environment-and-release.md  # 环境与发布
├── VERSION                 # 当前版本号（一行）
└── CLAUDE.md               # 本文件
```

## 加载顺序

```html
<!-- 数据层 -->
<script src="js/data.js"></script>
<script src="js/roundTypes.js"></script>
<script src="js/round.js"></script>
<script src="js/roundStore.js"></script>
<script src="js/roundIndex.js"></script>

<!-- UI 层 -->
<script src="js/scoreboard.js"></script>
<script src="js/ui.js"></script>

<!-- 业务模块 -->
<script src="js/clubStore.js"></script>
<script src="js/buddyStore.js"></script>
<script src="js/courseRouting.js"></script>
<script src="js/roundManager.js"></script>
<script src="js/sessionIO.js"></script>
<script src="js/import/*.js"></script>
<script src="js/newRoundService.js"></script>

<!-- 应用核心 -->
<script src="js/app.js"></script>

<!-- 云同步层 -->
<script src="js/cloud/apiClient.js"></script>
<script src="js/cloud/authState.js"></script>
<script src="js/cloud/deviceId.js"></script>
<script src="js/cloud/syncQueue.js"></script>
<script src="js/cloud/conflictResolver.js"></script>
<script src="js/cloud/pushEngine.js"></script>
<script src="js/cloud/pullEngine.js"></script>
<script src="js/cloud/syncCoordinator.js"></script>
<script src="js/cloud/syncDebug.js"></script>

<!-- App Shell -->
<script src="js/shell/router.js"></script>
<script src="js/shell/roundHelper.js"></script>
<script src="js/shell/homePage.js"></script>
<script src="js/shell/roundsPage.js"></script>
<script src="js/shell/*.js"></script>
<script src="js/shell/shell.js"></script>  <!-- 必须最后 -->
```

## localStorage Keys

| Key | 模块 | 内容 |
|-----|------|------|
| `golf_v4_scorecard` | data.js | 当前活跃 round 业务数据 |
| `golf_v4_workspace` | data.js | UI 状态 |
| `golf_v5_buddies` | buddyStore.js | 球友列表 |
| `golf_v5_clubs` | clubStore.js | 球会数据 |
| `golf_v6_store_meta` | roundStore.js | Schema 版本 |
| `golf_v6_round_summaries` | roundStore.js | 所有 round 摘要 |
| `golf_v6_round_active` | roundStore.js | 活跃 round ID |
| `golf_v6_rd_{roundId}` | roundStore.js | 单个 round 详情 |
| `golf_v7_sync_queue` | syncQueue.js | 同步队列 |
| `golf_v7_device_id` | deviceId.js | 设备 UUID |
| `golf_v7_conflict_log` | conflictResolver.js | 冲突日志 |
