Golfhub Core Architecture v1

* README
* 产品设计文档
* Notion / 飞书
* Git 仓库 `/docs`

以后我们所有设计都以这个为基础。

---

# Golfhub Core Architecture v1

## 1. Product Name

**Golfhub**

定位：

Golfhub 是一个连接 **订场、球局、球友、球会、球队与赛事转播** 的高尔夫平台。

一句话：

**Golfhub — where every round begins.**

---

# 2. Top Level Modules

Golfhub 顶层模块结构：

```
Golfhub
├─ TeeTimes
├─ Rounds
├─ Buddies
├─ Clubs
├─ Teams
├─ Broadcast
└─ Settings
```

说明：

| 模块        | 作用        |
| --------- | --------- |
| TeeTimes  | 订场系统      |
| Rounds    | 球局与比赛     |
| Buddies   | 球友网络      |
| Clubs     | 球会与会员     |
| Teams     | 球队        |
| Broadcast | 视频转播与画面支持 |
| Settings  | 系统设置      |

---

# 3. TeeTimes Module

负责统一订场系统。

支持：

* Public tee time
* Member tee time
* 多球会订场

核心对象：

```
TeeTimes
 ├─ TeeSheet
 ├─ TeeTime
 └─ Booking
```

关键字段示例：

```
TeeTime
id
clubId
courseId
date
time
capacity
availableSlots
price
inventorySource
visibilityRule
bookingRule
```

---

# 4. Rounds Module

Rounds 是 Golfhub 的核心模块。

负责：

* 创建球局
* 邀请球友
* 记分
* 比赛

结构：

```
Round
├─ Players
├─ TeeTime
├─ Scores
├─ Format
└─ Status
```

### Format（玩法）

玩法在 Round 内部定义，例如：

```
Stroke Play
Match Play
8421
Nassau
Skins
Team Match
```

关系：

```
Round + Format = Competition
```

---

# 5. Buddies Module

Buddies 负责球友关系。

核心对象：

```
Buddy
Player Profile
Contact
```

功能：

* 添加球友
* 查找球友
* 邀请打球
* 常打伙伴

---

# 6. Clubs Module

Clubs 负责球会系统。

结构：

```
Clubs
├─ Club
├─ Course
└─ Membership
```

示例：

```
Shahe Golf Club
 ├─ A Course
 ├─ B Course
 └─ Membership
```

Membership 示例：

```
User
 ├─ Shahe Member
 └─ Xili Member
```

用途：

* 会员身份识别
* 会员价
* 会员 tee time 可见性

---

# 7. Teams Module

Teams 负责球队体系。

结构：

```
Team
├─ Team Members
├─ Team Events
└─ Team Rankings
```

用途：

* 球队组织
* 团体比赛
* 球队统计

---

# 8. Broadcast Module

Broadcast 是 **视频画面支持系统**。

作用：

为比赛、球局、直播提供实时画面信息。

结构：

```
Broadcast
├─ Templates
├─ Data Binding
├─ Live Control
└─ Output
```

### Templates

画面模板：

* 比分条
* 球员卡
* 洞信息
* 排名板
* 对阵信息

### Data Binding

绑定数据：

```
Round
Player
Score
Team
Hole
```

### Live Control

导播控制：

* 切换球员
* 更新比分
* 切换洞
* 展示排名

### Output

输出：

* OBS
* 直播推流
* 视频录制

---

# 9. Settings Module

系统设置模块。

包含：

```
Account
Notification
Language
Permissions
Preferences
```

---

# 10. Core Domain Objects

Golfhub 核心对象：

```
User
Buddy
Club
Course
Membership
TeeTime
Round
Team
Score
Broadcast
```

对象关系：

```
Club → TeeTime
TeeTime → Round
Round → Score
Round → Broadcast

User → Buddy
User → Team
User → Membership
```

---

# 11. Two Core Product Flows

Golfhub 有两条主线。

### Play Flow（打球）

```
TeeTimes
   ↓
Round
   ↓
Score
```

用户行为：

```
订场
创建球局
邀请球友
比赛
记分
```

---

### Media Flow（媒体）

```
Round / Score / Team
          ↓
       Broadcast
          ↓
直播 / 视频 / 转播
```

---

# 12. Long Term Vision

Golfhub 的长期目标：

```
订场
球局
球友
球队
赛事
转播
```

成为：

**Golfhub — The Operating System for Golf**

---


很好 👍 Pack，我们把 **Golfhub 的 Domain Model（领域模型）**正式整理出来。这一张图其实就是整个系统的**骨架**，以后不管加多少功能，只要不破坏这层结构，系统就不会乱。

我会给你三层：

1️⃣ 核心对象（Core Entities）
2️⃣ 对象关系（Relationships）
3️⃣ 核心数据流（Core Flows）

你可以把这段直接保存为：

```
docs/architecture/golfhub-domain-model.md
```

---

# Golfhub Domain Model v1

## 1. Core Entities（核心对象）

Golfhub 的核心对象只有这些：

```text
User
Buddy
Club
Course
Membership
TeeTime
Booking
Round
Score
Team
Broadcast
```

说明：

| Entity     | 含义   |
| ---------- | ---- |
| User       | 用户   |
| Buddy      | 球友关系 |
| Club       | 球会   |
| Course     | 球场   |
| Membership | 会员身份 |
| TeeTime    | 开球时间 |
| Booking    | 订场记录 |
| Round      | 一局球  |
| Score      | 记分   |
| Team       | 球队   |
| Broadcast  | 转播信息 |

---

# 2. Core Structure（核心结构）

整个 Golfhub 的结构其实是这样：

```text
Golfhub
│
├── Users
│
├── Clubs
│     ├── Courses
│     └── Memberships
│
├── TeeTimes
│     └── Bookings
│
├── Rounds
│     ├── Players
│     ├── Scores
│     └── Format
│
├── Teams
│
├── Buddies
│
└── Broadcast
```

---

# 3. Entity Relationships（对象关系）

## 用户关系

```text
User
 ├── Buddies
 ├── Teams
 └── Memberships
```

说明：

一个用户可以：

* 有很多球友
* 加入多个球队
* 拥有多个球会会员身份

例如：

```text
Pack
 ├─ Buddy → Jerry
 ├─ Buddy → Free
 ├─ Team → 百佬汇
 ├─ Membership → Shahe
 └─ Membership → Xili
```

---

## 球会关系

```text
Club
 ├── Courses
 └── Memberships
```

例如：

```text
Shahe Golf Club
 ├─ A Course
 ├─ B Course
 └─ Membership Types
```

---

## TeeTime 关系

```text
Course
  └── TeeTime
        └── Booking
```

例如：

```text
Shahe A Course
  └─ TeeTime 08:00
        └─ Booking
```

---

## Round 关系

```text
Round
 ├── Players
 ├── Scores
 └── Format
```

Format 就是玩法：

```text
8421
Nassau
Match Play
Stroke Play
```

---

## Round 与 TeeTime

```text
TeeTime
   ↓
Round
```

例如：

```text
Shahe 08:00
   ↓
Round #123
```

---

## Team 关系

```text
Team
 ├── Members
 └── Team Rounds
```

例如：

```text
百佬汇
 ├─ Pack
 ├─ Jerry
 └─ Free
```

---

## Broadcast 关系

```text
Round
  ↓
Broadcast
```

Broadcast 使用 Round 数据生成画面：

```text
Round
Score
Players
Teams
```

用于：

```text
直播
视频
赛事转播
```

---

# 4. Core Data Flow（核心数据流）

Golfhub 的核心流程只有两条。

---

# Flow 1：Play Flow（打球）

```text
Clubs
   ↓
TeeTimes
   ↓
Booking
   ↓
Round
   ↓
Score
```

用户行为：

```text
找时间
订场
创建球局
邀请球友
记分
```

---

# Flow 2：Media Flow（媒体）

```text
Round
   ↓
Score
   ↓
Broadcast
   ↓
直播 / 视频
```

---

# 5. Membership Context

会员身份会影响：

```text
TeeTime Visibility
Pricing
Booking Eligibility
```

例如：

```text
User
 ├─ Shahe Member
 └─ Xili Member
```

搜索 TeeTimes 时：

系统会返回：

```text
Public TeeTimes
Shahe Member TeeTimes
Xili Member TeeTimes
```

统一展示。

---

# 6. TeeTime Booking Logic

订场逻辑：

```text
User
   ↓
Search TeeTimes
   ↓
Eligibility Check
   ↓
Booking
```

检查：

```text
Membership
Slots
Rules
```

---

# 7. Round Competition Logic

每一局可以定义玩法：

```text
Round
 └─ Format
```

例如：

```text
8421
Nassau
Skins
Match Play
```

玩法只作用于该 Round。

---

# 8. Broadcast Data Source

Broadcast 的数据来源：

```text
Round
Score
Player
Team
Hole
```

输出：

```text
Overlay Graphics
Live Broadcast
Video Recording
```

---

# 9. Long Term Architecture

未来 Golfhub 会变成：

```text
Golfhub
│
├─ Play System
│    ├─ TeeTimes
│    └─ Rounds
│
├─ Social System
│    ├─ Buddies
│    └─ Teams
│
├─ Club System
│    └─ Clubs / Memberships
│
└─ Media System
     └─ Broadcast
```

---

# 10. Core Principle

Golfhub 的设计原则：

**真实世界对象 → 系统对象**

```text
Golfer → User
Golf Friend → Buddy
Golf Club → Club
Tee Time → TeeTime
Golf Round → Round
Golf Team → Team
Broadcast Graphics → Broadcast
```

---

如果你愿意，我下一步可以帮你做一个**非常关键的升级设计**：

👉 **Golfhub 的 ID 系统（GolfID）**

这个设计会影响：

* Buddies
* Membership
* Round Player
* TeeTime Booking
* 全球用户系统

很多系统做到后面都因为 ID 设计不好而重构。
但如果一开始设计好，你这个平台未来可以支持 **全球球员网络**。
