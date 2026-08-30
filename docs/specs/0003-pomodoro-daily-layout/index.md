# 0003. 番茄钟按日布局与历史浏览

**Date**: 2026-08-30
**Status**: Accepted

## Summary

番茄钟页面使用 `Content` 的自适应三段布局。历史按所选本地日期展示，日历控制所选日期，计时器继续保持现有内部布局和单一控制器。宽度不足时，两个侧栏先合并到右侧，再移动到主区下方，所有能力始终可访问。

## Requirements

**User stories**:

1. 作为登录用户，我希望从日历选择日期并只查看当天记录，以便快速回顾某一天的专注与休息。
2. 作为登录用户，我希望计时器保持页面视觉中心，同时历史和日期操作各有稳定区域。
3. 作为不同窗口宽度下的用户，我希望日历、历史和计时操作始终可访问，而不是被布局断点隐藏。

**Acceptance criteria**:

1. **AC-1**: `Content` 默认根据自身可用宽度使用三种布局。空间充足时显示左栏、主区和右栏。空间不足以完整容纳三栏时，主区在左，右栏内容与左栏内容按此顺序在右侧纵向排列。空间继续缩小时，主区、右栏内容和左栏内容按此顺序单列排列。
2. **AC-2**: `Content` 的文档顺序为主区、右栏、左栏。宽屏只改变视觉网格位置，不改变键盘和屏幕阅读器顺序。现有调用接口、HTML 属性落点、主区 `className` 和 `id="content"` 保持兼容。只有主区、主区加左栏、主区加右栏和三栏四种组合都不留下空轨道。
3. **AC-3**: 历史日期标题和状态在宽屏与双列布局中保持可见，历史列表独立滚动。单列布局改用页面自然滚动，避免嵌套滚动。主区内容能够容纳时水平和垂直居中，内容过高时从顶部开始并允许滚动。
4. **AC-4**: 页面首次打开默认选择固定会话 IANA 时区的今天。规范日期使用 `YYYY-MM-DD`，规范月份使用 `{ year, monthIndex }`。`selectedDateKey` 与 `visibleMonth` 分离并由父层控制。点击本月或相邻月份日期会选择该日，相邻月份日期同时切换可见月份。月份箭头只改变可见月份，不改变所选日期。
5. **AC-5**: `Calendar` 底部右侧显示带 `CalendarDays` 图标和“回到今天”文字的按钮。只有所选日期是今天且可见月份也是今天所在月时按钮禁用。点击时同时选择今天并回到今天所在月份。
6. **AC-6**: 历史继续按月调用 0001 的 `getTomatoHistory`。服务端记录与当前用户本地待同步项先按事件标识合并，再按 `endAt` 的本地日期筛选。左栏展示所选日 00:00 到下一日 00:00 的全部专注、短休和长休记录，按 `startAt` 倒序稳定排列。日历只标记当天至少有一条 `FOCUS` 且 `COMPLETED` 的日期。
7. **AC-7**: 左栏显示完整日期和相对称呼。相对称呼只使用今天、昨天和明天。左栏摘要分别显示待同步、失败和冲突数量，以及暂停原因。失败历史继续显示 `lastError`。无记录时保留日期标题并显示按日空状态。日历标记读取可见月份，左栏记录与载入状态读取所选日期所在月份。翻月不会让左栏进入载入状态。读取失败时显示错误，只展示目标月份可用的缓存或本地记录。
8. **AC-8**: 查看过去或未来日期时，新完成的计时不会改变所选日期。跨过本地午夜也不自动改变选择，原今天会变成昨天。当前会话固定使用挂载时取得的 IANA 时区，刷新后才采用新时区。`todayKey` 在该时区本地午夜、页面重新可见和窗口重新获得焦点时刷新。刷新页面始终重新选择今天。
9. **AC-9**: 未登录时只显示登录提示，不渲染日历、历史或番茄钟工作区。登录用户只能读取自己的服务端记录和本地待同步项，继续遵守 0001 的用户隔离、幂等、冲突和离线恢复契约。
10. **AC-10**: 计时器、计时设置及开始、暂停、继续、跳过和停止按钮保持当前内部布局。页面协调层只创建一次 `usePomodoro` 控制器，并把同一状态与动作传给主区、历史区和操作区。
11. **AC-11**: 新操作面板位于日历之后，只包含“立即同步”和冲突处理。“立即同步”只强制处理当前用户的 pending 项，没有可重试项、离线或已有同步运行时禁用。多条冲突显示为列表，每项展示可换行的本地值与服务端值，采用按钮位于信息之后并右对齐。左栏历史行只展示冲突状态，不包含操作按钮。
12. **AC-12**: 日期网格使用单一 Tab 停靠点。方向键移动日期，Home 和 End 移动到周首尾，Page Up 和 Page Down 翻月，Enter 和 Space 选择。相邻月选日后焦点落到新的选中日期，月份箭头和“回到今天”保留自身焦点。左栏日期、载入结果和错误通过礼貌级 live region 宣告。所有日期和操作按钮具备明确名称、可见焦点和至少 44 乘 44 的目标尺寸。颜色不单独承担状态含义。
13. **AC-13**: `Content` 的新默认布局在所有现有调用页面中保持内容、交互与主题可用。番茄钟页面在常用桌面宽度、双列宽度和单列宽度下完成真实页面验证，并为日期筛选、受控日历、月份竞态、布局顺序和冲突操作提供可重复测试。

## Decision

**Chosen option**: 扩展现有 `Content`，使用容器查询与受控日期状态完成原地调整

保留现有月查询、计时控制器和记录模型。`Content` 的默认布局改为自适应网格，番茄钟页面使用一个客户端协调层把主区、日历、历史和操作面板接到同一份状态。

**Implementation skills**: `typescript-react-patterns` (`asyrafhussin/agent-skills`, `.agents/skills/typescript-react-patterns/`)

## Feature design

### Page composition

| Region              | Content                                                    | Behaviour                                    |
| ------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Main                | 现有计时器、计时设置、计时按钮、存储错误和恢复提示         | 能容纳时水平和垂直居中，过高时顶部对齐并滚动 |
| Left display region | 所选日期、相对日期、同步数量、冲突数量、读取状态、按日历史 | 标题与状态固定，列表在宽屏与双列时独立滚动   |
| Right action region | 受控日历、底部“回到今天”、立即同步、冲突操作列表           | 日历在前，操作面板在后                       |

### Responsive layout contract

`Content` 使用两层结构。外层 `.content-container` 接收剩余 HTML 属性并声明 `container-type: inline-size`。内层 `.content-grid` 根据外层宽度切换网格。主区继续接收调用方 `className` 并保留 `id="content"`。容器查询只改变内层后代，不能让容器查询自身。

### Layout tokens

| Token                              | Value                                                         | Source                                              |
| ---------------------------------- | ------------------------------------------------------------- | --------------------------------------------------- |
| Main preferred width               | 700px                                                         | 现有 `Content` 主区宽度                             |
| Left minimum width                 | 280px                                                         | 日期标题、状态和历史信息的最小可读宽度              |
| Right minimum width                | 356px                                                         | 七个 44px 日期目标、六个 4px 间距和两侧 12px 内边距 |
| Region gap                         | 32px                                                          | 现有 `gap-8`                                        |
| Three region threshold             | 1400px                                                        | 280 + 700 + 356 + 64                                |
| Main plus rail threshold           | 1088px                                                        | 700 + 356 + 32                                      |
| Region block size, wide and double | 100dvh with existing top and bottom padding inside border box | 保持现有页面壳高度                                  |

右栏在单列容器小于 356px 时保持 356px 的日历最小内容宽度，并只让日历包装层横向滚动，避免缩小 44px 操作目标。宽屏与双列时，主区和侧栏各自拥有纵向滚动。左栏标题与状态位于历史滚动容器之外。单列时 `.content-grid` 是页面纵向滚动拥有者，各区域使用自然高度，不再创建嵌套纵向滚动。

| Available shape        | Visual grid                                     | Document order    |
| ---------------------- | ----------------------------------------------- | ----------------- |
| Three regions fit      | left, main, right                               | main, right, left |
| Main plus one rail fit | main, then right rail containing right and left | main, right, left |
| One column             | main, right, left                               | main, right, left |

区域组合使用以下规则：

| Present regions      | Wide or double layout                                    | Single layout     |
| -------------------- | -------------------------------------------------------- | ----------------- |
| Main only            | 700px 内居中                                             | 主区占满可用宽度  |
| Main and right       | 主区加右侧 356px rail                                    | main, right       |
| Main and left        | 主区加右侧 280px rail                                    | main, left        |
| Main, right and left | 三栏时 left, main, right，双列时 main 加右侧 right, left | main, right, left |

没有内容的区域不占网格。默认行为覆盖所有 `Content` 页面，因此实现必须逐页检查现有布局，而不是只检查番茄钟。

### State model

| State                 | Source                                             | Rules                                                                   |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------------------------- |
| `selectedDateKey`     | 页面协调层，`YYYY-MM-DD`                           | 刷新重置，翻月不改变，选日与回到今天改变                                |
| `visibleMonth`        | 页面协调层，`{ year, monthIndex }`                 | 月份算术只修改年月，不携带日字段                                        |
| `todayKey`            | 固定会话时区中的当前日期键                         | 本地午夜、页面可见和窗口 focus 时刷新                                   |
| `timeZone`            | `Intl.DateTimeFormat().resolvedOptions().timeZone` | 当前挂载期间固定                                                        |
| `sessionGeneration`   | 当前认证会话递增值                                 | 用户变化时清空可见数据并递增，阻止旧响应提交                            |
| `monthHistoryByKey`   | 当前会话内存                                       | 键为 `userId + timeZone + YYYY-MM`，不持久化                            |
| `monthLoadStateByKey` | 当前会话内存                                       | 每个完整缓存键记录 idle、loading、loaded 或 error，以及最新 `requestId` |
| merged history        | 月服务端结果加当前用户 outbox                      | 按事件标识合并，本地项可以覆盖相同事件                                  |
| selected day history  | merged history                                     | `localDateKey(endAt, timeZone)` 等于所选日期键                          |

日历标记选择器读取 `visibleMonth` 的完整缓存键。左栏记录与状态选择器读取 `selectedDateKey` 所在月份的完整缓存键。相邻月份格在尚未切换前不显示记录标记，点击后切换月份并读取对应标记。

月份变为可见或所选月份尚未读取时发起查询。每个请求捕获 `userId`、`timeZone`、月份、`sessionGeneration` 和递增 `requestId`，全部仍匹配且该请求仍是同键最新请求时才可提交。同月旧请求不能覆盖新请求。

`usePomodoro` 接受可选 `onRecordSettled` 回调。`created` 或 `already_exists` 的规范服务端记录在 outbox 项删除前通过回调写入正确月份。跨标签页发现项被删除时，页面从上一个 outbox 快照取得 `endAt` 并刷新对应月份，在刷新完成前保留已有展示。失败不会用另一个月份的数据冒充结果。

### Data model

本次没有数据库迁移。

| Entity or state      | Key values                                                | Relationship and constraints                  |
| -------------------- | --------------------------------------------------------- | --------------------------------------------- |
| `User`               | `id`                                                      | 一个用户拥有多条 `PomodoroRecord`             |
| `PomodoroRecord`     | 0001 的现有字段                                           | `userId` 指向当前用户，归档继续依据 `endAt`   |
| `PomodoroOutboxItem` | 0001 的现有本地字段                                       | 与服务端记录按 `eventId` 合并，只处理当前用户 |
| Page date state      | `selectedDateKey`, `visibleMonth`, `todayKey`, `timeZone` | 仅存在于当前挂载，不写数据库或本地存储        |

### Component interfaces

| Surface          | Inputs                                                                  | Outputs and rules                                                              |
| ---------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Content`        | 现有 `children`, `leftSideBar`, `rightSideBar`, HTML div props          | API 保持兼容，默认使用新的容器布局与文档顺序                                   |
| Page coordinator | 当前认证用户与 `onRecordSettled`                                        | 创建一次 `usePomodoro`，拥有日期、月数据、请求身份和载入状态                   |
| `Calendar`       | `selectedDateKey`, `visibleMonth`, `todayKey`, `recordDate`             | 通过 `onDateSelect` 和 `onVisibleMonthChange` 报告规范键值，不保留重复月份状态 |
| Timer surface    | controller state and actions                                            | 保持现有布局和行为，不再次调用 `usePomodoro`                                   |
| Daily history    | selected date, records, load state                                      | 只展示状态和记录，不拥有冲突操作                                               |
| Operation panel  | pending count, online state, `isSyncing`, conflicts, controller actions | 立即同步区域横向排列，冲突使用逐项列表与右对齐按钮                             |

### Server interface

`getTomatoHistory({ startUtc, endUtc })` 保持不变。每次输入一个本地月份转换后的 UTC 包含起点和排他终点，服务端通过 `requireAuth` 取得当前用户并按 `endAt` 查询。页面不增加单日 Server Action，也不改变 0001 的保存、冲突或重试接口。

### Value sourcing

| Value                     | Source                                                                           |
| ------------------------- | -------------------------------------------------------------------------------- |
| 初始今天与动态 `todayKey` | 固定会话时区中的挂载时间，本地午夜定时器，visibilitychange 和 focus              |
| IANA 时区                 | 挂载时的 `Intl.DateTimeFormat().resolvedOptions().timeZone`                      |
| 所选日期键                | 规范 `YYYY-MM-DD`，不从 UTC 字符串截断                                           |
| 可见月份键                | `{ year, monthIndex }` 格式化为 `YYYY-MM`                                        |
| 月查询范围                | 0001 的 `monthUtcRange`                                                          |
| 历史日期归属              | `localDateKey(record.endAt, timeZone)`                                           |
| 日历标记                  | 合并记录中 `type=FOCUS` 且 `endReason=COMPLETED` 的本地结束日期                  |
| 日期与时间文案            | `Intl.DateTimeFormat("zh-CN", { timeZone, ... })`，标题、历史和冲突共用          |
| 相对日期标签              | `selectedDateKey` 与动态 `todayKey` 比较                                         |
| 同步摘要                  | 当前用户 outbox 中 pending 加 syncing、failed、conflict 的独立数量和 `lastError` |
| 立即同步可用性            | pending 数量、online 状态和 controller `isSyncing`                               |
| 冲突项信息                | 本地 outbox payload 与 `serverRecord`，两者都使用固定时区 formatter              |
| 同步结算记录              | `onRecordSettled` 的规范服务端记录和被结算 outbox 项                             |

### Key invariants

1. 页面协调层只创建一个 `usePomodoro` 实例。
2. `selectedDateKey` 与 `visibleMonth` 不使用同一个状态值。
3. 日期归属只依据当前会话 IANA 时区中的 `endAt`。
4. 日区间语义为本地 00:00 到下一日本地 00:00，不假设固定 24 小时。
5. 月份请求结果只能写入同用户、同时区、同月份、同会话代次和同一最新请求标识的缓存键。
6. 服务端和本地记录先按状态优先级合并，再按所选日期筛选。
7. 左栏不提供写操作。日历内部只保留日历自身的回到今天操作。
8. 未登录时不发起历史读取，也不渲染私人工作区。
9. 0001 的幂等、用户隔离、排序、离线和冲突语义保持有效。

### Merge and ordering

| Local status             | Canonical fields and date ownership      | Display state                                 |
| ------------------------ | ---------------------------------------- | --------------------------------------------- |
| pending, syncing, failed | 使用本地 payload                         | 叠加对应同步状态和 `lastError`                |
| conflict                 | 使用 `serverRecord` 的规范字段与 `endAt` | 叠加 conflict，操作面板同时展示本地与服务端值 |
| no local item            | 使用服务端记录                           | synced                                        |

旧服务端记录使用数据库 `id`，其他记录使用 `eventId` 合并。结果先按 `startAt` 倒序，再按 `eventId ?? id` 降序作确定性并列排序。采用服务端记录前，规范服务端记录必须已经进入对应月份缓存。

### Immediate sync contract

按钮始终显示。它只对当前用户的 pending 项执行一次强制重试，并只绕过 `nextAttemptAt`，不重试 failed 或 conflict。pending 为零、浏览器离线或 controller `isSyncing` 时按钮禁用并显示原因。同步结果继续通过左栏摘要、历史状态和现有 live region 反馈。

### Failure and empty states

| Case                             | Behaviour                                                                |
| -------------------------------- | ------------------------------------------------------------------------ |
| No records                       | 保留日期标题并显示该日暂无记录                                           |
| Visible month loading            | 日历标记显示载入状态，左栏仅在所选月份也缺少数据时显示载入               |
| Month load error                 | 显示错误，展示目标月份已有缓存和当前本地记录，没有可用数据时显示错误空态 |
| Rapid or repeated month requests | 完整缓存键加最新 requestId 共同裁决结果                                  |
| Local pending item               | 立即出现在其 `endAt` 所属日期并显示同步状态                              |
| Conflict                         | 左栏显示冲突状态，右栏操作面板显示对应记录信息与采用按钮                 |
| Storage failure                  | 主区保留 0001 的阻塞与恢复提示                                           |
| Local midnight or browser sleep  | 午夜定时器、visibilitychange 和 focus 重算 todayKey，所选日期不变        |
| Time zone changes                | 当前挂载不重归档，刷新后采用新时区                                       |
| User switch during request       | 清空可见数据并增加 sessionGeneration，旧缓存和响应不可见                 |

### Security and privacy

所有历史读取继续使用 `requireAuth`。客户端不提交用户标识，也不合并其他用户的 outbox。未登录页面不发起私人查询。错误和布局日志不得记录历史载荷、Cookie 或令牌。

### Configuration required

没有新的环境变量、凭据、功能开关、依赖或数据库迁移。

### Critical test scenarios

1. 宽屏、双列和单列的区域顺序、缺失侧栏和滚动行为，verifies **AC-1**, **AC-2**, **AC-3**, **AC-13**
2. 现有 `Content` 页面在四个主题和关键桌面宽度下保持内容与操作可用，verifies **AC-2**, **AC-13**
3. 默认今天、月末翻月、同月选日、相邻月选日、单独翻月、回到今天和未来日期，verifies **AC-4**, **AC-5**, **AC-8**
4. 所选日包含专注和休息，跨午夜记录按 `endAt` 归档，日历只标记完成专注，verifies **AC-6**
5. 服务端记录与 pending、failed 和 conflict 本地项合并后再按日筛选，verifies **AC-6**, **AC-7**, **AC-9**
6. 快速跨月、同月重复请求、用户切换产生迟到响应与读取失败，验证缓存身份和结果不会串写，verifies **AC-7**, **AC-9**
7. 新结果、跨午夜和时区会话固定规则不抢走当前选择，verifies **AC-8**
8. 未登录时只有登录提示且没有历史请求，登录和用户切换后数据严格隔离，verifies **AC-9**
9. 计时器内部布局、设置与控制行为保持不变，且页面只有一个控制器实例，verifies **AC-10**
10. 立即同步禁用条件、多个冲突项、冲突跨日、采用服务端记录和结算不闪退，verifies **AC-11**
11. roving tabindex、方向键、周首尾、翻月、焦点恢复、live region 和最窄宽度目标尺寸，verifies **AC-12**

## Build plan

1. 建立第一条端到端路径。让页面协调层创建唯一控制器和受控日期状态，把现有计时器放入 `Content` 主区，把当天历史放入左栏，把受控日历放入右栏。继续用现有月查询与 outbox 合并，再按 `endAt` 本地日期筛选，satisfies **AC-4**, **AC-6**, **AC-9**, **AC-10**
2. 完成 `Content` 的全局自适应网格。使用容器查询实现三栏、主区加右侧纵列和单列布局，调整文档顺序、空槽位、居中和滚动规则，并逐页修复真实回归，satisfies **AC-1**, **AC-2**, **AC-3**, **AC-13**
3. 收口日历和月份状态。使用日期键和年月值让 `Calendar` 完全受控，支持相邻月份日期、独立翻月、动态今天、键盘网格，以及按用户与请求标识隔离的月数据，satisfies **AC-4**, **AC-5**, **AC-7**, **AC-8**, **AC-9**, **AC-12**
4. 收口历史与操作边界。实现状态化合并、规范结算回调、固定时区格式化、按日状态和 live region。把立即同步与逐条冲突操作移入右栏操作面板，保持计时器内部布局不变，satisfies **AC-6**, **AC-7**, **AC-9**, **AC-10**, **AC-11**, **AC-12**
5. 增加 `Content`、受控日历、日期筛选、月份竞态、操作面板和认证边界测试。运行 lint、build、Vitest、真实页面验证、`/check verify` 与 `/test`，satisfies **AC-1** through **AC-13**

## Consequences

**Positive**:

1. 日历、历史和计时器拥有清楚且一致的职责。
2. 同月切换日期不增加网络请求，离线记录继续立即可见。
3. 中等和窄窗口不再因侧栏隐藏而失去核心能力。
4. 受控日历消除选中日期与可见月份漂移。

**Negative**:

1. `Content` 默认行为改变会扩大到所有现有页面，需要完整回归验证。
2. 月份内存数据和并发请求状态比当前单月数组更复杂。
3. 宽屏视觉顺序与文档顺序不同，CSS 网格实现必须避免焦点和阅读顺序混乱。

**Neutral**:

1. 数据库、Server Action、认证和 0001 的计时与同步契约不变。
2. 不持久化所选日期和月份缓存，刷新后回到今天。

## Follow-up

- [ ] 实现前记录 `Content` 当前全部生产调用页面，作为全局布局回归清单。

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
