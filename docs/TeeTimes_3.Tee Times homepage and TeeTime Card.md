TeeTimes 首页 和 TeeTime Card

我会分 4 部分展开：

1️⃣ TeeTimes 首页完整线框图
2️⃣ TeeTime Card 视觉层级
3️⃣ Detail Drawer 结构
4️⃣ 组件拆分（方便 Claude 实现）

---

# 一、TeeTimes 首页线框图（Desktop）

这是推荐的桌面结构。

```text
┌─────────────────────────────────────────────────────────────┐
│ TeeTimes                                                     │
│ Find and book tee times across clubs                        │
│                                                             │
│ Where        When        Players        Access              │
│ [Shenzhen ▼] [Sat ▼]     [2 ▼]          [All ▼]              │
│                                                             │
│ Morning  Midday  Afternoon  Price  Distance  Spots  Sort ▼  │
│                                                             │
│ 24 tee times · Sat · Shenzhen · 2 players                   │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Shahe Golf Club                             Member · ¥520   │
│ A / B Course                                2 spots left    │
│ Sat · Mar 14 · 08:00                                       │
│ Nanshan · 8.4 km                        Book via Member     │
│                                                             │
│ [ Book ]                               [ Start Round ]     │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ Mission Hills                              Public · ¥1280   │
│ Course 3                                    3 spots left    │
│ Sat · Mar 14 · 09:12                                       │
│ Bao'an · 24 km                            External booking  │
│                                                             │
│ [ Book ]                               [ Start Round ]     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

关键原则：

```text
先看时间
再看价格
最后执行动作
```

---

# 二、Intent Bar（核心输入区）

Intent Bar 是订场体验的核心。

建议结构：

```text
Where | When | Players | Access
```

### Where

```text
[ Shenzhen ▼ ]
```

点击展开：

* 搜索 club
* 区域
* 城市

支持输入：

```text
shahe
```

直接找到：

```text
Shahe Golf Club
```

---

### When

默认快捷：

```text
Today
Tomorrow
This Weekend
Pick Date
```

点击 `Pick Date` 才打开日历。

---

### Players

简单 selector：

```text
1
2
3
4
```

不要复杂输入。

---

### Access

```text
All
Public
Member
```

默认：

```text
All
```

这样用户能看到：

* public tee times
* member tee times

混合展示。

---

# 三、Quick Filters（轻筛选）

Intent Bar 下面一排轻筛选。

```text
Morning  Midday  Afternoon  Price  Distance  Spots  Sort ▼
```

点击：

### Morning

```text
05:00 – 09:00
```

### Midday

```text
09:00 – 13:00
```

### Afternoon

```text
13:00 – 18:00
```

---

### Price

弹出 slider：

```text
0 — 2000
```

---

### Distance

```text
<10km
<20km
Any
```

---

### Spots

```text
2+
3+
4
```

---

### Sort

```text
Recommended
Earliest
Lowest Price
Closest
```

---

# 四、TeeTime Card 视觉层级

每张卡片必须让用户 **2 秒完成判断**。

建议四层信息结构。

---

# Layer 1：主信息

最醒目的两件事：

```text
Club
Time
```

示例：

```text
Shahe Golf Club
Sat · 08:00
```

---

# Layer 2：场地信息

```text
A / B Course
Mar 14
```

---

# Layer 3：决策信息

```text
2 spots left
Member · ¥520
```

或者：

```text
3 spots left
Public · ¥1280
```

---

# Layer 4：辅助信息

```text
Nanshan · 8.4 km
Book via Member Portal
```

---

# Layer 5：动作

```text
[ Book ]
[ Start Round ]
```

---

# 五、Access Label 设计

统一标签体系：

```text
Public
Member
Shahe Member
Xili Member
Guest Allowed
```

示例：

```text
Member · ¥520
```

或：

```text
Public · ¥1280
```

---

# 六、Book / Start Round 行为

两个按钮非常关键。

### Book

行为取决于 booking channel。

可能是：

* external link
* member portal
* contact club

---

### Start Round

点击：

```text
Start Round
```

跳转：

```text
#/rounds/new?teetime=xxx
```

预填：

```text
club
course
date
time
```

用户继续：

* 邀请 buddies
* 选择 format

---

# 七、TeeTime Detail Drawer

点击 card 打开。

```text
┌────────────────────────────────────┐
│ Shahe Golf Club                    │
│ A / B Course                       │
│ Sat · Mar 14 · 08:00               │
│                                    │
│ 4 player tee time                  │
│ 2 spots left                       │
│                                    │
│ Member access                      │
│ Your member rate applies           │
│ Price: ¥520                        │
│                                    │
│ Booking method                     │
│ Member portal booking              │
│                                    │
│ Nanshan · Shenzhen                 │
│                                    │
│ [ Book ]                           │
│ [ Start Round ]                    │
└────────────────────────────────────┘
```

抽屉优点：

* 不离开列表
* 快速决策

---

# 八、组件拆分建议（Claude）

建议组件：

### 页面

```text
TeeTimesPage
```

---

### Intent

```text
IntentBar
WhereSelector
DateSelector
PlayerSelector
AccessSelector
```

---

### Filters

```text
FilterBar
TimeBucketFilter
PriceFilter
DistanceFilter
SortSelector
```

---

### Results

```text
TeeTimeList
TeeTimeCard
```

---

### Drawer

```text
TeeTimeDetailDrawer
BookingMethodBlock
AccessBlock
```

---

# 九、移动端结构

移动端建议：

```text
Intent Bar
Result Cards
```

Filters 改为：

```text
Filter Drawer
```

卡片仍然保持同样结构。

---

# 十、用户完整路径

典型用户行为：

### 路径 A

```text
Home
→ TeeTimes
→ Book
```

---

### 路径 B

```text
TeeTimes
→ Start Round
→ Invite Buddies
```

---

### 路径 C

```text
TeeTimes
→ View Club
```

---

# 十一、为什么这个结构适合未来

因为未来不论：

* 接入多少球会
* public / member 混合
* 动态价格
* 拼组

核心结构都不会变：

```text
Intent
→ Filters
→ TeeTime Cards
→ Book / Start Round
```

---

# 十二、给 Claude 的执行说明

可以发给 Claude：

```text
请设计 GolfHub TeeTimes 模块前端 UI，重点实现：

1. TeeTimes 首页结构
2. Intent Bar（Where / When / Players / Access）
3. Quick Filters
4. TeeTime Card
5. Detail Drawer
6. Book / Start Round 行为

注意：

- 结果实体是 TeeTime，不是 Club
- 同一列表中混合 public / member tee times
- 使用 access label 区分
- Start Round 必须跳转到 rounds/new 并预填 tee time
- 先用 mock data 实现
```

---

