# GolfHub 环境隔离与发布体系

## 1. 为什么需要环境隔离

GolfHub 当前已有云同步（Sync v1），前端直接对接后端 API。如果 dev/staging/production 共用同一数据库和 API：
- 开发测试数据污染生产环境
- 前端调试可能破坏真实用户数据
- 无法安全验证数据迁移和 schema 变更
- localStorage key 冲突导致本地数据混乱

---

## 2. 建议的四环境模型

| 环境 | 用途 | API | 数据库 | 状态 |
|------|------|-----|--------|------|
| local-dev | 本地开发，无需网络 | localhost:3000 | SQLite 或本地 PostgreSQL | **部分已实现** |
| cloud-dev | 联调测试，可远程访问 | dev.api.golfhub.xxx | 独立 PostgreSQL | 未实现 |
| staging | 预发布验证，数据接近生产 | staging.api.golfhub.xxx | 独立 PostgreSQL | 未实现 |
| production | 真实用户 | api.golfhub.xxx | 生产 PostgreSQL | **已实现** |

### 当前已实现的部分

- **local-dev**：`server/` 目录下可本地启动 Express + Prisma，连接本地 PostgreSQL
- **production**：服务端已部署，前端通过 `apiClient.js` 中的 baseUrl 指向生产 API
- **前端**：纯静态文件，浏览器直接打开 `index.html`，无构建步骤

### 尚未实现的部分

- cloud-dev 和 staging 环境
- 前端环境切换机制（apiClient.js 中 baseUrl 目前硬编码）
- CI/CD pipeline
- 环境变量管理

---

## 3. 数据隔离原则

### 3.1 数据库隔离

每个环境必须使用独立的 PostgreSQL 实例或独立的 database：
- 不同环境的 Round/HoleScore/User 数据完全隔离
- Schema migration 先在 dev → staging 验证，再应用到 production
- 禁止跨环境共享连接字符串

### 3.2 localStorage Key 隔离

当前所有 localStorage key 无环境前缀。如果同一浏览器访问不同环境的前端，数据会冲突。

**建议方案**（尚未实现）：

```javascript
// 当前：
'golf_v6_round_summaries'
'golf_v7_sync_queue'

// 建议：加环境前缀
'golf_dev_v6_round_summaries'
'golf_prod_v6_round_summaries'
```

或通过 `apiClient.js` 的 baseUrl hash 自动区分。

### 3.3 JWT 隔离

每个环境使用不同的 JWT secret：
- dev token 不能在 production 使用
- 防止测试账号误操作生产数据

---

## 4. Feature Flags 建议

当前 GolfHub 无 feature flag 系统。建议在以下场景引入：

| 场景 | Flag | 说明 |
|------|------|------|
| 新同步实体 | `sync_buddy_enabled` | Buddy 同步上线前可灰度 |
| 实时推送 | `realtime_push_enabled` | WebSocket 上线前可降级到轮询 |
| 新 UI 组件 | `conflict_ui_enabled` | 冲突手动解决 UI |

**建议实现方式**（尚未实现）：
- 简单版：localStorage 中的 `golf_feature_flags` JSON 对象
- 进阶版：服务端下发，登录时获取

---

## 5. 发布路径建议

### 当前发布方式

1. 修改代码
2. 更新 `VERSION` 文件
3. 更新 `README.md` Changelog
4. Git commit + push
5. GitHub Pages 自动部署前端（静态文件）
6. 服务端手动部署

### 建议发布流程（尚未实现）

```
开发 → PR → Code Review → Merge to main
                              ↓
                    自动部署到 staging
                              ↓
                    验证通过 → 手动触发 production 部署
```

### 版本号规则（已实现）

项目使用 Semantic Versioning：`MAJOR.MINOR.PATCH`

| 类型 | 触发条件 |
|------|---------|
| PATCH | UI 微调、小修复、不改变行为 |
| MINOR | 新增功能但向后兼容 |
| MAJOR | 破坏兼容或重大架构改动（如 localStorage key 变更） |

每次代码修改后必须：
1. 升级 `VERSION` 文件
2. 在 `README.md` Changelog 插入新条目
3. 输出建议的 git commit message（格式：`vX.Y.Z: 描述`）

### Script Tag 版本号

index.html 中的 `<script src="xxx.js?v=X.Y.Z">` 用于缓存破坏。当前手动维护，存在遗漏风险。

---

## 6. 当前还没完全落地的部分

| 项目 | 状态 | 优先级 |
|------|------|--------|
| local-dev 环境 | 已可用（手动启动 server） | — |
| production 部署 | 已可用 | — |
| cloud-dev 环境 | 未实现 | 中 |
| staging 环境 | 未实现 | 中 |
| 前端环境切换 | 未实现（baseUrl 硬编码） | 高 |
| localStorage key 环境前缀 | 未实现 | 中 |
| JWT secret 隔离 | 未实现（依赖多环境部署） | 中 |
| CI/CD pipeline | 未实现 | 低 |
| Feature flags | 未实现 | 低 |
| Script tag 版本号自动化 | 未实现 | 低 |

---

## 7. 推荐的后续实施顺序

1. **前端环境切换**：`apiClient.js` 根据 hostname/hash 自动选择 baseUrl
2. **localStorage key 前缀**：防止同浏览器多环境数据冲突
3. **cloud-dev 部署**：独立 API + DB，用于联调
4. **staging 部署**：预发布验证环境
5. **CI/CD**：自动化构建 → 部署 → 验证流程
6. **Feature flags**：按需引入
