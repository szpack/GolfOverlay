GolfHub Sync v1 最终总结                                                           
                                                                                     
  ---                                                                                
  1. 最终模块结构图                                                                  
                                                                                     
  ┌─────────────────────────────────────────────────────────────────┐                
  │                        UI Layer                                 │                
  │  ┌──────────────┐  ┌──────────────┐  ┌────────────────────────┐ │                
  │  │ Shell.js     │  │ RoundsPage   │  │ app.js / NewRoundSvc   │ │                
  │  │ _updateSync  │  │ _syncBadge   │  │ endRound / createRound │ │                
  │  │ Indicator()  │  │ per card     │  │                        │ │                
  │  └──────┬───────┘  └──────┬───────┘  └───────────┬────────────┘ │
  │         │ poll 3s         │ read                  │ call         │
  │         ▼                 ▼                       ▼              │
  │  ┌─────────────────────────────────────────────────────────────┐ │
  │  │                    RoundStore                               │ │
  │  │  ┌─────────────┐ ┌──────────────┐ ┌───────────────────────┐│ │
  │  │  │ persist     │ │ applyLocal*  │ │ applyRemote*          ││ │
  │  │  │ (pure R/W)  │ │ (→ enqueue)  │ │ (← merge, no enqueue)││ │
  │  │  └─────────────┘ └──────┬───────┘ └───────────▲───────────┘│ │
  │  │                         │                     │             │ │
  │  │  flushProgress() ───────┤                     │             │ │
  │  │  (score dirty → onScoreFlush)                 │             │ │
  │  └─────────────────────────┼─────────────────────┼─────────────┘ │
  └────────────────────────────┼─────────────────────┼───────────────┘
                               │                     │
  ┌────────────────────────────┼─────────────────────┼───────────────┐
  │                    Cloud Sync Layer              │               │
  │                            ▼                     │               │
  │  ┌─────────────────────────────────────────────────────────────┐ │
  │  │                 SyncCoordinator                             │ │
  │  │  enqueueRound{Create,Update,Finish,Abandon,Reopen,Delete}  │ │
  │  │  enqueueScoreUpsert · onScoreFlush · onRoundOpen · status  │ │
  │  └──────┬──────────────────┬──────────────────────▲────────────┘ │
  │         │                  │                      │              │
  │         ▼                  ▼                      │              │
  │  ┌──────────────┐   ┌──────────────┐   ┌──────────┴───────────┐ │
  │  │  SyncQueue   │──▶│  PushEngine  │   │    PullEngine        │ │
  │  │  localStorage│   │  FIFO drain  │   │  pullSummaries       │ │
  │  │  coalesce    │   │  backoff     │   │  pullRoundDetail     │ │
  │  └──────────────┘   │  retry ×10   │   └──────────────────────┘ │
  │                     └──────┬───────┘              │              │
  │                            │                      │              │
  │                     ┌──────▼───────┐   ┌──────────▼───────────┐ │
  │                     │ onSuccess →  │   │ ConflictResolver     │ │
  │                     │ _updateSync  │   │ resolveRoundMeta     │ │
  │                     │ Meta         │   │ resolveHoleScores    │ │
  │                     │              │   │ conflict log (200)   │ │
  │                     │ onConflict → │   └──────────────────────┘ │
  │                     │ auto-pull    │                             │
  │                     └──────────────┘                             │
  │                                                                  │
  │  ┌──────────────┐   ┌──────────────┐                            │
  │  │  DeviceId    │   │  SyncDebug   │  ← console tools           │
  │  │  localStorage│   │  8 commands  │                            │
  │  └──────────────┘   └──────────────┘                            │
  │                                                                  │
  │                            │ HTTP                                │
  └────────────────────────────┼─────────────────────────────────────┘
                               ▼
  ┌────────────────────────────────────────────────────────────────┐
  │  Server (Express + Prisma + PostgreSQL)                       │
  │  POST /rounds · PATCH /rounds/:id · PUT /rounds/:id/scores   │
  │  POST /rounds/:id/finish · POST /rounds/:id/reopen           │
  │  DELETE /rounds/:id · GET /rounds · GET /rounds/:id          │
  │  GET /rounds/:id/hole-scores                                 │
  └────────────────────────────────────────────────────────────────┘

  文件清单（8 个新文件 + 5 个修改文件）

  ┌──────────────────────────────┬───────┬───────────────────────────────────────┐
  │             文件             │ 行数  │                 角色                  │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ js/cloud/deviceId.js         │ 37    │ 设备 UUID 生成与缓存                  │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ js/cloud/syncQueue.js        │ 341   │ localStorage FIFO 队列，coalesce 合并 │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ js/cloud/pushEngine.js       │ 282   │ 队列消费 → REST API，指数退避重试     │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ js/cloud/pullEngine.js       │ 170   │ 登录拉摘要，开局拉详情                │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ js/cloud/conflictResolver.js │ 219   │ LWW + dirty-aware 冲突解决            │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ js/cloud/syncCoordinator.js  │ 420   │ 中枢编排，唯一 enqueue 入口           │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ js/cloud/syncDebug.js        │ 202   │ 控制台调试工具                        │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ roundStore.js (modified)     │ ~1500 │ 四层分离 + sync metadata              │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ newRoundService.js           │ —     │ putRound → applyLocalCreate           │
  │ (modified)                   │       │                                       │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ app.js (modified)            │ —     │ finishRound → applyLocalFinish        │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ roundsPage.js (modified)     │ —     │ sync badge + applyLocal* 调用         │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ shell.js (modified)          │ —     │ sync indicator +                      │
  │                              │       │ SyncCoordinator.init()                │
  ├──────────────────────────────┼───────┼───────────────────────────────────────┤
  │ data.js (modified)           │ —     │ remove → applyLocalRemove             │
  └──────────────────────────────┴───────┴───────────────────────────────────────┘

  ---
  2. 数据流说明

  2.1 Create Round（创建球局）

  用户点 "New Round"
    → NewRoundService.activateRound()
      → RoundStore.applyLocalCreate(round, snapshot)
        → putRound() 写 localStorage（立即可用）
        → _bumpLocalVersion(summary)
        → SyncCoordinator.enqueueRoundCreate(roundId, payload)
          → SyncQueue.enqueue({operation:'create', ...})
          → PushEngine.nudge()
            → POST /rounds (idempotent — 同 ID+owner 返回已有)
            → onSuccess → _updateSyncMeta(serverVersion)

  2.2 Score Entry（成绩录入）

  用户输入成绩
    → D.setPlayerGross() / D.adjPlayerGross()
      → scheduleSave(350ms debounce)
        → D.save()
          → RoundStore.flushProgress()
            ① 写 summary 到 localStorage
            ② _markHoleDirty(roundId, holeIdx)
               → dirtyHoles[holeNo]=true, dirtyFlags.score=true
               → _markSyncPending(summary)
            ③ 检查 dirtyFlags，调用:
               SyncCoordinator.onScoreFlush(roundId, summary, dirtyHoles, roundData)
                 → 遍历 dirtyHoles，每洞:
                    _extractHoleScores(roundData, holeNo)
                    enqueueScoreUpsert(roundId, holeNo, scores, serverVersion)
                      → SyncQueue.coalesce() 或 enqueue()
                      → PushEngine.nudge()
            ④ 清除 dirtyFlags + dirtyHoles

  2.3 Push（推送）

  PushEngine drain cycle (2s 间隔):
    → SyncQueue.peek() 取队首 pending 条目
    → markSyncing(changeId)
    → _dispatch(entry) 按 entity_type:operation 路由:
        round:create   → POST /rounds
        round:update   → PATCH /rounds/:id
        round:finish   → POST /rounds/:id/finish
        round:abandon  → PATCH /rounds/:id {status:'abandoned'}
        round:reopen   → POST /rounds/:id/reopen
        round:delete   → DELETE /rounds/:id
        hole_score:upsert_scores → PUT /rounds/:id/scores
    → 成功: markSynced(changeId), 回调 onSuccess
            → _updateSyncMeta(serverVersion, lastSyncedAt)
    → 失败分类:
        0   (network)  → markFailed, 指数退避重试 (2s→30s, max 10次)
        401 (auth)     → stop engine
        409 (conflict) → markConflict, 回调 onConflict → auto-pull
        429 (rate)     → stop engine, 30s 后 restart
        4xx (client)   → markConflict
        5xx (server)   → markFailed, 重试

  2.4 Pull（拉取）

  场景 A — 登录/启动时:
    AuthState.onChange(loggedIn)
      → SyncCoordinator._pullOnLogin()
        → 扫描所有 summary 取最大 lastSyncedAt
        → PullEngine.pullSummaries({updatedAfter, force:true})
          → GET /rounds?limit=100&include_deleted=true&updated_after=X
          → 每条 serverRound → RoundStore.applyRemoteMerge(serverRound)

  场景 B — 打开球局时:
    Shell._enterBroadcast() / SyncCoordinator.onRoundOpen(roundId)
      → PullEngine.pullRoundDetail(roundId)
        → 并行: GET /rounds/:id + GET /rounds/:id/hole-scores
        → RoundStore.applyRemoteMerge(roundDetail)
        → RoundStore.applyRemoteScoreMerge(roundId, holeScores)

  2.5 Conflict Resolution（冲突解决）

  applyRemoteMerge(serverRound):
    ├─ 新 round（本地无）→ 直接创建 summary + data
    └─ 已有 round → ConflictResolver.resolveRoundMeta():
         SERVER_FIELDS（始终服务端胜）:
           status, lockState, endedAt, endedBy, reopenUntil,
           reopenCount, startedAt, visibility, deletedAt
         LWW_FIELDS（dirty+newer 本地胜，否则服务端胜）:
           courseName, routingName, holesPlanned, holesCompleted,
           lastActivityAt, date
         → 更新 sync.serverVersion, lastSyncedAt
         → 如果本地无 dirty，更新 snapshots

  applyRemoteScoreMerge(roundId, serverScores):
    → ConflictResolver.resolveHoleScores():
       逐洞逐 roundPlayerId:
         dirty hole → 本地胜（跳过）
         非 dirty → 比较 updatedAt vs _remoteUpdatedAt
                    服务端更新 → 覆盖本地 gross/notes
    → 所有冲突写入 conflict log（localStorage, max 200 条）

  ---
  3. 当前能力边界

  ┌────────┬───────────────────────────┬─────────────────────────────────┐
  │  维度  │           支持            │             不支持              │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ 存储   │ localStorage only         │ IndexedDB, WebSQL               │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ 推送   │ 单条 FIFO，指数退避       │ 批量推送, WebSocket 实时推      │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ 拉取   │ 登录时摘要 + 开局时详情   │ 实时推送通知, 长轮询, SSE       │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ 冲突   │ 保守 LWW + dirty flag     │ 三路合并, CRDT, 用户手动解决 UI │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ 多设备 │ 刷新后可见对方改动        │ 实时协同编辑, 跨设备即时同步    │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ 离线   │ 完全离线可用，上线后推送  │ Service Worker, 后台同步        │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ 重试   │ 最多 10 次，指数退避      │ 永久队列, 跨会话自动恢复重试    │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ 认证   │ JWT token via AuthState   │ Token 自动刷新, refresh token   │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ 删除   │ 软删除 (deletedAt)        │ 硬删除, 数据清理                │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ 历史   │ conflict log (200 条)     │ 完整操作审计日志, undo/redo     │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ 实体   │ Round + HoleScore         │ Player/Buddy/Club/Course 同步   │
  ├────────┼───────────────────────────┼─────────────────────────────────┤
  │ UI     │ 状态指示器 + debug 控制台 │ 冲突手动解决弹窗, 详细同步历史  │
  └────────┴───────────────────────────┴─────────────────────────────────┘

  ---
  4. 已知技术债与后续建议

  技术债

  ┌─────┬───────────────────────────────────────┬───────────────────────┬───────┐
  │  #  │                 问题                  │         影响          │ 优先  │
  │     │                                       │                       │  级   │
  ├─────┼───────────────────────────────────────┼───────────────────────┼───────┤
  │     │ localStorage 容量上限                 │                       │       │
  │ T1  │ (~5MB)：SyncQueue + RoundStore +      │ 大量离线改动可能撑爆  │ 中    │
  │     │ ConflictLog 共享配额                  │                       │       │
  ├─────┼───────────────────────────────────────┼───────────────────────┼───────┤
  │ T2  │ PushEngine 页面关闭即停：unload 时未  │ pending               │ 低    │
  │     │ 完成的推送丢失（依赖下次打开重试）    │ 条目延迟到下次会话    │       │
  ├─────┼───────────────────────────────────────┼───────────────────────┼───────┤
  │ T3  │ pullSummaries 只取 100 条：超过 100   │ 历史 round 丢失       │ 中    │
  │     │ 个 round 的用户无法全量拉取           │                       │       │
  ├─────┼───────────────────────────────────────┼───────────────────────┼───────┤
  │     │ ConflictResolver 无用户介入           │ 静默丢失本地改动的可  │       │
  │ T4  │ UI：所有冲突自动解决，用户无感知（仅  │ 能                    │ 低    │
  │     │ console 可查）                        │                       │       │
  ├─────┼───────────────────────────────────────┼───────────────────────┼───────┤
  │ T5  │ 版本号缓存破坏：script tag            │ 浏览器缓存旧代码      │ 低    │
  │     │ 版本号手动维护，容易遗漏              │                       │       │
  ├─────┼───────────────────────────────────────┼───────────────────────┼───────┤
  │ T6  │ SyncQueue coalesce 只合并 pending     │ 重试时推送过时数据    │ 低    │
  │     │ 状态：failed 条目不参与合并           │                       │       │
  ├─────┼───────────────────────────────────────┼───────────────────────┼───────┤
  │ T7  │ no token refresh：JWT 过期后          │ 长时间使用后中断同步  │ 中    │
  │     │ PushEngine 停止，需用户手动重新登录   │                       │       │
  └─────┴───────────────────────────────────────┴───────────────────────┴───────┘

  后续建议

  ┌───────────────┬─────────────────────────────────────────────────┬────────────┐
  │     阶段      │                      内容                       │  前置条件  │
  ├───────────────┼─────────────────────────────────────────────────┼────────────┤
  │ v1.1 — 稳固   │ T7 token refresh + T3 分页拉取 + T1             │ 无         │
  │               │ 容量监控告警                                    │            │
  ├───────────────┼─────────────────────────────────────────────────┼────────────┤
  │ v1.2 — 体验   │ T4 冲突通知 toast + 冲突详情查看 UI             │ v1.1       │
  ├───────────────┼─────────────────────────────────────────────────┼────────────┤
  │ v2.0 — 实时   │ WebSocket/SSE 实时推送通知，替代轮询            │ 服务端支持 │
  ├───────────────┼─────────────────────────────────────────────────┼────────────┤
  │ v2.1 —        │ Buddy / Club / Course 同步（复用 SyncQueue +    │ v1.1       │
  │ 扩展实体      │ PushEngine）                                    │            │
  ├───────────────┼─────────────────────────────────────────────────┼────────────┤
  │ v3.0 —        │ Service Worker + IndexedDB + Background Sync    │ 重大重构   │
  │ 离线增强      │ API                                             │            │
  └───────────────┴─────────────────────────────────────────────────┴────────────┘

  ---
  5. 人工验收清单

  前置：部署 server 并确认 API 可达，浏览器打开 GolfHub

  A. 基础登录与指示器

  - A1 未登录状态 → sidebar 底部无 sync indicator，round card 无 sync badge
  - A2 登录 → sidebar 出现 sync indicator，显示 "Synced"（灰点）或
  "Syncing..."（绿色脉冲）
  - A3 登出 → sync indicator 消失

  B. 创建 Round 全流程

  - B1 登录后创建 New Round → round 立即出现在列表，card 显示 PENDING 黄色 badge
  - B2 sidebar indicator 变为 "Syncing 1..."（绿色脉冲）
  - B3 推送成功 → badge 消失（synced），sidebar 回到 "Synced"
  - B4 控制台执行 SyncDebug.rounds() → 该 round syncStatus='synced', serverVer≥1

  C. 成绩录入与推送

  - C1 打开 round，录入 Hole 1 成绩 → 等待 350ms + push cycle
  - C2 SyncDebug.queue() → 出现 hole_score:upsert_scores 条目或已清空
  - C3 推送成功后 SyncDebug.round('<id>') → dirtyHoles 为空，dirtyFlags 均 false

  D. 离线 → 在线恢复

  - D1 断网（DevTools Network → Offline）
  - D2 录入 Hole 2、Hole 3 成绩 → 本地正常保存，card 显示 PENDING
  - D3 sidebar indicator 显示 "N pending"（黄点）或 "N failed"（红点）
  - D4 恢复网络 → PushEngine 自动重试，badge 消失，indicator 回到 "Synced"

  E. Pull 拉取验证

  - E1 在另一浏览器/设备登录同一账户 → 首页可见已同步的 round
  - E2 打开该 round → 成绩数据已拉取到本地（与源设备一致）
  - E3 SyncDebug.round('<id>') → serverVersion > 0, lastSyncedAt 有值

  F. 生命周期操作同步

  - F1 结束 round (End Round) → PENDING → 推送 → synced
  - F2 Grace 期内 Reopen → 推送 reopen → synced
  - F3 删除 round → 推送 soft-delete → 另一设备刷新后该 round 消失

  G. 冲突场景

  - G1 两设备同时改同一洞成绩 → 先推送方成功，后推送方 409
  - G2 409 后自动 pull → 本地数据与服务端一致
  - G3 SyncDebug.conflicts() → 可见冲突日志，包含 field/winner/reason

  H. Debug 工具

  - H1 SyncDebug.status() → 输出表格含 pending/failed/conflicts/running/pulling
  - H2 SyncDebug.queue() → 按状态分组显示（或 "Queue empty"）
  - H3 SyncDebug.retryFailed() → failed 条目重置为 pending 并重新推送
  - H4 SyncDebug.forcePull() → 强制拉取（控制台无报错）
  - H5 SyncDebug.nudge() → 触发 PushEngine drain（控制台确认 "nudged"）

  ---
  Sync v1 scope: done. 8 个新模块，~1670 行新代码，覆盖 create / score / lifecycle /
  push / pull / conflict / UI / debug
  全链路。本地优先架构确保离线完全可用，上线后后台静默同步。
