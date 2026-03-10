GolfHub 订场系统前端产品蓝图 v1

## 一、产品定位

GolfHub 的订场系统不是单纯的“球场时间列表”，而是一个：

**统一订场入口 + 会员/公众混合可见 + 可承接球局创建的前端工作台**

一句话理解：

> 用户在 GolfHub 里，可以看到自己“有资格看到”的全部 TeeTimes，并快速完成订场或发起球局。

它同时支持：

* Public TeeTimes
* Member TeeTimes
* 多球会身份视图
* 与 Round 的联动承接

---

# 二、设计目标

前端第一阶段要达成 5 个目标：

### 1. 一眼找到可打的时间

不是先看球场资料，而是先看“可行动的 TeeTime”。

### 2. 统一视图

public 和 member 的场次不分裂成多个系统，而是在同一结果流里展示。

### 3. 订场与球局天然衔接

每个 TeeTime 不只是“订”，还可以“以此创建 Round”。

### 4. 结构稳定

即使第一阶段是占位页或半手工数据，也要把未来结构定对。

### 5. 前端先赢体验

哪怕第一阶段还没打通真实后台，搜索、比较、进入下一步这部分体验也要像完整产品。

---

# 三、前端信息架构

## 1. 顶层模块位置

登录后左侧导航里：

```text
GolfHub
[ + New ]

Search

Home
TeeTimes
Rounds
Buddies
Teams
Clubs
Broadcast

Recent

System
  Settings
  Course Management

Language
User
```

其中：

**TeeTimes 是一级导航模块。**

---

## 2. TeeTimes 模块在系统中的角色

前端上，TeeTimes 是一个独立工作区，但它会和这几个模块形成关系：

* **Rounds**：从 TeeTime 创建球局
* **Clubs**：查看球会与会员背景
* **Buddies**：邀请球友
* **Home**：展示 upcoming tee times
* **Search**：全局查找 tee times / clubs / rounds

---

# 四、TeeTimes 前端核心页面结构

我建议第一阶段前端先定 5 个页面层级。

## 1. TeeTimes 首页 / 搜索页

路由建议：

```text
#/teetimes
```

作用：

* 订场系统主入口
* 条件筛选
* 展示结果流

这是最重要的一页。

---

## 2. TeeTime 结果详情抽屉 / 详情页

路由建议可选：

```text
#/teetimes/:id
```

作用：

* 查看这个时间的完整信息
* 价格与资格说明
* 可执行动作

第一阶段可以先做右侧抽屉，不一定独立全页。

---

## 3. Club 详情承接

已有 Clubs 模块承接：

```text
#/clubs/:id
```

从 TeeTime 卡片点击球场名可跳过去。

---

## 4. 以 TeeTime 创建 Round

建议承接到：

```text
#/rounds/new?teetime=xxx
```

作用：

* 预填球场
* 预填时间
* 预填日期

这是订场到球局的关键转化路径。

---

## 5. Booking Intent / External Booking 承接页

如果第一阶段还没做真实下单：

可以有一个轻承接层，告诉用户：

* 这是 public 还是 member tee time
* 当前预订方式是什么
* 下一步去哪里

可直接做成弹窗或抽屉，不一定独立页。

---

# 五、TeeTimes 首页页面框架

这是最核心的页面。建议采用：

## 左侧轻筛选 + 右侧结果流

或者更现代一点：

## 顶部意图区 + 中部筛选条 + 下方结果流

我更推荐第二种。

---

## 页面结构建议

```text
TeeTimes
Find and book tee times across clubs
```

### A. 顶部意图区

4 个核心输入：

* Where：城市 / 区域 / 指定球场
* When：日期
* Who：人数
* Access：全部 / Public / Member

建议是轻量胶囊或选择器，而不是大表单。

---

### B. 二级筛选条

包括：

* 时间段：早 / 上午 / 下午 / 晚些
* 价格区间
* 距离
* 剩余名额
* 球会
* 排序方式

排序建议支持：

* Recommended
* Earliest
* Lowest Price
* Closest

---

### C. 结果流

结果实体必须是：

**TeeTime Card**

而不是 Club Card。

用户要的是“我能不能打”，不是“球场百科”。

---

# 六、TeeTime Card 设计

每张卡片建议展示这些信息：

### 必须字段

* 球场名
* 场别 / routing
* 日期
* 时间
* 剩余名额
* 对当前用户显示的价格
* access label
* 主要操作按钮

---

## 展示示意

```text
Shahe Golf Club
A / B Course
Sat · 08:00
2 spots left
Member · ¥520

[ Book ]   [ Start Round ]
```

或者 public：

```text
Mission Hills
Course 3
Sat · 09:12
3 spots left
Public · ¥1280

[ Book ]   [ Start Round ]
```

---

## access label 设计

这是 GolfHub 和普通订场系统最大的差异点之一。

建议使用轻标签区分：

* Public
* Shahe Member
* Xili Member
* Member + Guests
* Limited Access

用户不应该先切 tab 再看不同身份场次，而应该在统一结果流中看到差异。

---

# 七、前端用户视图逻辑

前端必须按“当前用户可见视图”来工作，而不是简单列所有数据。

也就是：

> 同一个 TeeTime，对不同用户看到的价格、标签、可操作按钮可能不同。

前端至少要处理这三层信息：

## 1. Visibility

用户能不能看见

## 2. Eligibility

用户能不能订

## 3. Display Pricing

用户该看到什么价格

---

## 举例

你作为沙河 + 西丽会员，打开结果页时，前端应该能混合展示：

* public tee times
* shahe member tee times
* xili member tee times

而不是分裂成 3 个入口。

---

# 八、前端操作路径设计

每张 TeeTime Card 至少要有两个主动作：

## 1. Book

当前阶段可能是：

* 跳转外部系统
* 打开 booking intent 抽屉
* 电话 / 微信 / 外链
* 将来升级为真实下单

---

## 2. Start Round

这个动作非常重要。

它表示：

> 我先锁定打球计划，再组织人。

这是 GolfHub 的核心差异化。

---

## Start Round 路径

点击：

```text
Start Round
```

进入：

```text
#/rounds/new?teetime=xxx
```

预填：

* club
* course
* date
* time

然后用户补：

* 球友
* format
* teams
* scoring mode

---

# 九、第一阶段前端状态设计

为了后面不重构，TeeTimes 前端建议明确 4 种页面状态：

## 1. Empty State

没有查询结果

```text
No tee times found
Try another date or expand your filters
```

---

## 2. Loading State

骨架屏 / shimmer

---

## 3. Result State

正常结果流

---

## 4. Coming Soon State

如果当前数据源尚未真正接通，也要有清晰占位表达

但我建议不要整页只有“Coming soon”，最好至少有页面框架和 demo cards。

---

# 十、第一阶段 MVP 建议

如果现在只是做前端框架，我建议 **MVP 不要一步到位做复杂订场引擎**，而是：

## MVP-A：结构先定

做出完整页面壳子：

* 搜索框架
* 筛选条
* 结果卡片
* Book / Start Round 两个动作入口
* 用户视图标签体系

---

## MVP-B：数据先静态或 mock

哪怕先用：

* mock json
* 本地 store
* 手工导入

也没问题。

关键是把体验做出来。

---

## MVP-C：Book 先做轻承接

先不强求完整支付闭环。

Book 可先支持：

* External Link
* Contact Club
* Member Portal
* Booking Request

---

# 十一、前端模块拆分建议

从组件层面，我建议至少拆这些：

## 页面级

* `TeeTimesPage`
* `TeeTimeDetailDrawer`
* `TeeTimeBookingIntentModal`

## 区块级

* `TeeTimesHero`
* `TeeTimesFilterBar`
* `TeeTimesResults`
* `TeeTimesEmptyState`

## 卡片级

* `TeeTimeCard`
* `AccessBadge`
* `PriceBlock`
* `AvailabilityBlock`

---

# 十二、筛选逻辑建议

前端筛选建议分两层：

## 核心筛选

* date
* club / area
* player count
* access type

## 辅助筛选

* time bucket
* price range
* slots
* sort

这样页面不会一开始就显得很重。

---

# 十三、首页与 TeeTimes 的联动

GolfHub Home Dashboard 未来应该有一个模块：

## Upcoming TeeTimes

展示：

* 即将到来的 tee times
* 最近看过的 tee times
* 快速进入 TeeTimes 搜索

这样用户不需要总是先点侧栏。

---

# 十四、与 Clubs 模块的边界

你前面说得对，`Course Management` 暂时放 System 里。
所以前台用户视角里：

* **TeeTimes** 负责找时间
* **Clubs** 负责看球会
* **System > Course Management** 只是后台管理入口

这三者边界要清晰，不要混。

---

# 十五、与 Search 的联动

GolfHub 的全局 Search 以后要能搜到：

* club
* round
* buddy
* team
* tee time

但第一阶段 `TeeTimesPage` 内部仍然应该有自己的场景化搜索与筛选，不依赖 global search。

也就是说：

* **Global Search**：全局跳转入口
* **TeeTimes Search**：订场工作流入口

两者职责不同。

---

# 十六、移动端思路

虽然当前以桌面工作台为主，但前端框架最好兼容移动端。

移动端 TeeTimes 页面建议：

* 顶部简化意图输入
* 筛选改为抽屉
* 结果仍以卡片流展示
* Book / Start Round 作为底部双按钮

不过第一阶段可以先以桌面端为主。

---

# 十七、视觉气质建议

TeeTimes 模块的视觉不应像传统酒店 OTA，也不要像后台表格工具。

我建议气质是：

* 清晰
* 节奏快
* 面向行动
* 高尔夫感但不过度装饰

重点是：

> “快速决策”而不是“慢慢浏览”。

---

# 十八、3-5 年视角下这套前端为什么成立

因为未来无论你接入：

* 更多球会
* public / member 双通道
* 动态价格
* 拼组逻辑
* 真正的 booking 引擎

前端顶层结构都不会变：

```text
意图输入
→ 筛选
→ TeeTime 结果流
→ Book / Start Round
```

所以这是一套稳定架构。

---

# 十九、给 Claude 的简版执行方向

如果你要把这份交给 Claude，可以用下面这段作为开头：

```text
请基于 GolfHub 的整体产品结构，设计 TeeTimes 模块的前端框架，不写后端逻辑，重点完成以下内容：

1. TeeTimes 首页页面结构
2. 订场搜索与筛选框架
3. TeeTime 结果卡片设计
4. public / member 混合展示逻辑
5. Book / Start Round 双动作承接
6. 与 Rounds / Clubs 的跳转关系
7. MVP 先使用 mock 或占位数据即可

注意：
- TeeTimes 必须是一级模块
- 结果实体以 TeeTime 为中心，而不是 Club
- 要体现 GolfHub 的差异化：订场与球局联动
- 页面风格要符合 GolfHub 当前 workspace 式左右结构
```

---


---

