TeeTimes Frontend Blueprint v1.1

## 一、TeeTimes 模块目标重述

TeeTimes 模块不是“球场信息浏览器”，而是：

**一个以时间为中心、以行动为导向的订场工作台。**

用户进入 TeeTimes，应该快速完成三件事之一：

* 找到可打的时间
* 判断自己能不能订
* 以这个时间发起一局球

所以前端的第一原则是：

> **先给可行动的 TeeTime，再给更多信息。**

---

# 二、TeeTimes 首页框架

## 页面层级

建议路由：

```text
#/teetimes
```

页面结构建议为：

```text
TeeTimes Page
├ Hero / Intent Bar
├ Quick Filters
├ Result Summary
├ TeeTime Result List
└ Detail Drawer (on demand)
```

---

## 1. 页面头部

不要太重，但要清楚。

建议：

```text
TeeTimes
Find and book tee times across clubs
```

右侧可保留一个轻帮助入口：

```text
How it works
```

第一阶段没有也可以。

---

## 2. Intent Bar（第一屏最核心）

这是用户进入后最先操作的地方。
建议 4 个核心输入，保持克制。

### 核心字段

#### Where

* 城市
* 区域
* 指定球场

展示形式建议：

* 一个组合输入
* 默认显示当前城市 / 上次使用区域
* 支持 club 搜索建议

#### When

* Today
* Tomorrow
* This Weekend
* 自定义日期

建议先给快捷选项，再允许日历展开。

#### Players

* 1
* 2
* 3
* 4

不要做复杂人数输入。

#### Access

* All
* Public
* Member

这个很关键，因为你系统支持 public + member 混合视图。

---

## 3. Quick Filters（次级筛选）

Intent Bar 下面是一排轻筛选胶囊。

建议包括：

* Morning
* Midday
* Afternoon
* Evening
* Price
* Distance
* Spots
* Club
* Sort

第一阶段不必全部展开复杂面板。

### 推荐默认筛选顺序

```text
Time Bucket | Access | Spots | Price | Sort
```

因为最符合订场心智。

---

## 4. Result Summary

在结果列表上方给一行摘要，帮助用户建立上下文。

示例：

```text
24 tee times · Saturday, Shenzhen · 2 players · All access
```

右侧：

```text
Sort: Recommended
```

这行非常重要，能让用户知道系统正在怎么为他筛结果。

---

## 5. Result List

结果必须以 **TeeTime Cards** 组成纵向流。

不要先列 Clubs 再点进去看时间。
因为用户真正决策的是：

> 哪个时间最适合我现在订 / 开局。

---

# 三、TeeTime Card 设计（重点）

这是整个订场系统前端最重要的组件。

## 1. 卡片信息层级

每张卡片建议分成 4 层：

### 第一层：主识别

* 球场名
* 路线 / 场别
* 时间

### 第二层：行动关键

* 日期
* 剩余名额
* access label
* 当前用户看到的价格

### 第三层：辅助判断

* 区域 / 距离
* 价格说明
* 预订方式提示

### 第四层：动作区

* Book
* Start Round

---

## 2. 建议字段清单

### 必须展示字段

* `clubName`
* `courseName` 或 routing
* `date`
* `time`
* `availableSlots`
* `displayPrice`
* `accessLabel`
* `bookingChannelLabel`

### 推荐展示字段

* `district` / `distanceKm`
* `pricingNote`
* `memberContextNote`
* `statusTag`

---

## 3. 卡片布局示意

### 桌面版建议

```text
┌──────────────────────────────────────────────────────────────┐
│ Shahe Golf Club                               Member · ¥520 │
│ A / B Course                                      2 spots   │
│ Sat · Mar 14 · 08:00                                      │
│ Nanshan · 8.4 km                     Book via Member Portal │
│                                                              │
│ [ Book ]                                   [ Start Round ]  │
└──────────────────────────────────────────────────────────────┘
```

---

## 4. 视觉层级建议

### 左侧重点放：

* 球场
* 时间

### 右侧重点放：

* 价格
* access
* 名额

### 底部重点放：

* 动作按钮

这样用户从左到右一眼就能完成判断：

```text
这是哪儿 → 什么时候 → 我能不能订 → 多少钱 → 接下来做什么
```

---

## 5. Access Label 体系

这里建议定一套统一标签规范。

### 标签类型

* `Public`
* `Member`
* `Shahe Member`
* `Xili Member`
* `Member + Guests`
* `Limited`
* `Invitation Only`

第一阶段不用全做，但结构先定。

### 展示原则

* 用轻标签，不要抢价格和时间
* 标签语义清楚，不做内部术语
* 标签优先体现用户视角，不是系统视角

例如优先写：

```text
Shahe Member
```

而不是：

```text
Restricted Visibility Rule 03
```

---

## 6. 价格区块设计

价格不要只是一个数字。

建议显示为：

### 主价格

当前用户适用价格

### 副说明

为什么是这个价格 / 是否可带 guest

示例：

```text
¥520
Member rate
```

或者：

```text
¥1280
Public rate
```

或者：

```text
¥520
Member · up to 3 guests
```

---

## 7. 名额区块设计

剩余名额是订场决策的重要因素，建议明确表达。

示例：

* `4 spots`
* `2 spots left`
* `1 spot left`
* `Full`

如果以后支持拼组，可以扩展：

* `Good for 2 players`
* `Open to pairing`

但第一阶段先别做复杂匹配文案。

---

## 8. 动作按钮设计

### Book

主预订动作

### Start Round

GolfHub 差异化动作

建议两个按钮都保留，但视觉层级要明确。

#### 建议层级

* Book：主按钮
* Start Round：次主按钮

但如果某些 tee time 当前不能真实 Book，也可以反过来：

* Start Round：主按钮
* Book：次按钮 / 外链

这个要看第一阶段你更想强调什么。

我个人建议：

### 第一阶段

如果 Book 还不完整，建议：

* `Start Round` 作为更稳定的主动作
* `Book` 作为具体预订承接动作

---

# 四、TeeTimes 搜索与筛选交互细化

## 1. 用户心智顺序

搜索应该按这个顺序构建：

```text
Where → When → Who → Access
```

因为这最像真实订场思考过程。

---

## 2. Date 设计

不要一开始就强迫用户开日历。

建议：

### 快捷选项

* Today
* Tomorrow
* This Weekend

### 高级选项

* Pick a Date

点击后展开 date picker。

---

## 3. Access 设计

这是 GolfHub 的独特之处。

建议 Access 默认值：

```text
All
```

让用户先看到自己全部有资格看的时间。

然后再按需筛成：

* Public only
* Member only

不要默认只给 member 或只给 public，会破坏“统一视图”。

---

## 4. Sort 设计

第一阶段推荐 4 个排序：

* Recommended
* Earliest
* Lowest Price
* Closest

### Recommended 规则建议

按前端展示逻辑先简单组合：

* 时间匹配
* 用户资格匹配
* 距离
* 价格
* 可用名额

后端可以后再优化，前端先保留这个概念。

---

## 5. Empty State 文案

这是非常重要的体验点。

建议：

```text
No tee times found
Try another date, area, or access filter
```

下面给两个动作：

* Clear Filters
* Browse Clubs

---

# 五、TeeTime 详情抽屉 / 详情页

第一阶段我建议优先做：

**右侧详情抽屉**

这样最适合 workspace 风格。

## 详情抽屉打开方式

点击卡片任意非按钮区域，或点击：

```text
View Details
```

打开右侧 drawer。

---

## 抽屉内容结构

```text
TeeTime Detail
├ Header
├ Booking Summary
├ Access & Pricing
├ Booking Method
├ About the Club / Course
└ Actions
```

---

## 1. Header

展示：

* Club Name
* Course / Routing
* Date + Time

---

## 2. Booking Summary

展示：

* Capacity
* Available Slots
* Player Count Recommendation
* Status

例如：

```text
4-player tee time
2 spots left
```

---

## 3. Access & Pricing

解释：

* 为什么我能看到这条
* 为什么价格是这个
* 是否可带 guests

例如：

```text
Visible to Shahe members
Your member rate applies
Guests allowed: up to 3
```

---

## 4. Booking Method

明确下一步怎么订。

例如：

* Book through member portal
* Contact club directly
* External booking link
* Booking request only

这块非常关键，因为第一阶段未必有完整 booking engine。

---

## 5. About the Club / Course

轻量展示：

* district / location
* club link
* course link

不要把详情页做成球场百科页。

---

## 6. Actions

抽屉底部固定动作区：

* Book
* Start Round
* Maybe Save / Share（未来）

---

# 六、Book / Start Round 行为链细化

## 1. Book 行为

Book 的前端要支持多种 channel。

建议前端字段：

* `bookingMethod`
* `bookingUrl`
* `bookingLabel`
* `bookingHint`

### 第一阶段支持这些类型

* `external_link`
* `member_portal`
* `phone`
* `wechat`
* `request_only`
* `coming_soon`

### 前端表现示例

* 打开外链
* 弹出说明
* 复制联系方式
* 打开意向表单

这样不会卡死在“必须先做完整支付”。

---

## 2. Start Round 行为

这是 GolfHub 的核心转化。

点击：

```text
Start Round
```

进入：

```text
#/rounds/new?teetime=tt_001
```

预填：

* club
* course
* date
* time
* maybe player count suggestion

### 在 New Round 页的提示建议

顶部显示：

```text
Starting from TeeTime:
Shahe Golf Club · Mar 14 · 08:00
```

用户会觉得整个系统是连着的。

---

## 3. 用户路径示意

### 路径 A：先订场

TeeTimes → Book → 成功 / 外链承接

### 路径 B：先组织局

TeeTimes → Start Round → 邀请 Buddies → 再落实预订

这个 B 路径正是 GolfHub 与其他订场系统最不一样的地方。

---

# 七、TeeTimes 的前端对象模型

为了前端稳定，我建议先定义一个统一显示对象：

## TeeTimeListItem

```json
{
  "id": "tt_shahe_2026_03_14_0800",
  "clubId": "club_shahe",
  "clubName": "Shahe Golf Club",
  "courseId": "course_ab",
  "courseName": "A / B Course",
  "date": "2026-03-14",
  "time": "08:00",
  "district": "Nanshan",
  "distanceKm": 8.4,
  "availableSlots": 2,
  "capacity": 4,
  "accessLabel": "Shahe Member",
  "displayPrice": 520,
  "currency": "CNY",
  "pricingNote": "Member rate",
  "bookingMethod": "member_portal",
  "bookingLabel": "Book via Member Portal",
  "bookable": true,
  "canStartRound": true,
  "status": "open"
}
```

前端列表页只依赖这个展示对象，不直接耦合复杂后端原始结构。

---

# 八、页面状态设计

## 1. Loading

建议骨架屏包括：

* 顶部筛选骨架
* 3–5 张 card 骨架

## 2. Empty

如前面所说，清楚但不消极。

## 3. Partial / Demo

如果第一阶段是 mock 数据，可用轻提示：

```text
Early access preview
More clubs coming soon
```

比整页写 `Coming Soon` 更高级。

## 4. Error

建议：

```text
Unable to load tee times
Please try again
```

并提供 Retry。

---

# 九、首页 Dashboard 与 TeeTimes 联动细化

我建议 Home 页里至少有一个 TeeTimes 模块：

## Upcoming TeeTimes

展示用户最近相关场次：

* booked
* started round from tee time
* saved / viewed recently（未来）

### 卡片建议

只展示 2–3 条，不做大列表。

同时给一个入口：

```text
Browse TeeTimes
```

直接跳 `#/teetimes`

---

# 十、MVP 页面建议顺序

如果要让 Claude 真正落地，我建议分 3 步：

## Phase A：壳子先做对

* TeeTimesPage
* Intent Bar
* Filter Row
* Result Cards

## Phase B：动作先打通

* Book action 占位逻辑
* Start Round 跳转逻辑
* Detail Drawer

## Phase C：身份感做出来

* Public / Member 混合展示
* access labels
* price notes
* booking method differences

---

# 十一、给 Claude 的可执行版说明

你可以直接把下面这段发给 Claude：

```text
请继续细化并设计 GolfHub 的 TeeTimes 前端模块，不写后端逻辑，重点完成以下内容：

1. TeeTimes 首页完整页面结构
   - 页面头部
   - Intent Bar（Where / When / Players / Access）
   - Quick Filters
   - Result Summary
   - TeeTime Result List

2. TeeTime Card 组件设计
   - 以 TeeTime 为结果实体，而不是 Club
   - 必须展示 club、course、date/time、spots、price、access label
   - 必须支持两个动作：Book / Start Round

3. TeeTime Detail Drawer
   - 从列表卡片进入
   - 展示 access、pricing、booking method、summary
   - 底部固定 actions

4. Book / Start Round 行为链
   - Book 先支持占位或外部 channel
   - Start Round 跳转到 #/rounds/new?teetime=...

5. public / member 混合展示体验
   - 同一结果流中展示
   - 通过 access label 和 price note 区分
   - 不要拆成多个独立系统

6. 先使用 mock / placeholder data 即可，但组件结构和页面框架要稳定，适合未来接真实数据。
```

---
