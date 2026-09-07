# 0006. 番茄钟全局响应式状态

**Date**: 2026-09-06
**Status**: Accepted

## Summary

番茄钟控制器提升到认证上下文内的全局 Provider，成为每个浏览器标签页中唯一的计时状态源。站内导航不再中断计时、结算和同步，导航栏通过一个共享组件显示当前状态。现有 reducer、用户存储、离线队列、服务端幂等、历史和日历契约继续保留。

## Requirements

**User stories**:

1. 作为登录用户，我希望切换站内页面后番茄钟继续运行，以便专注过程不依赖 `/tomato` 页面保持挂载。
2. 作为登录用户，我希望在其他页面的导航栏看到当前阶段和剩余时间，并能进入完整番茄钟页面。
3. 作为登录用户，我希望番茄钟在其他页面到期后仍自动保存，并获得声音和站内 Toast 反馈。

**Acceptance criteria**:

1. **AC-1**: `AuthProviders` 内始终挂载一个 `PomodoroProvider`。每个浏览器标签页只创建一个番茄钟控制器，`/tomato` 页面和导航栏都消费该控制器，不创建第二个 `usePomodoro` 实例。
2. **AC-2**: Provider 明确暴露未认证、恢复中和就绪生命周期。恢复期间导航栏只显示图标，完整番茄钟页面不允许基于默认状态执行控制动作。恢复成功后，当前用户的持久化状态成为唯一状态。恢复失败时进入带 `storageError` 的就绪状态，有可读快照时展示快照，没有快照时明确显示状态无法恢复，不能把默认状态当作恢复结果。
3. **AC-3**: 登录用户在除 `/tomato` 之外的页面看到共享导航组件。运行或暂停时组件显示阶段和 `MM:SS` 剩余时间，暂停时有文字状态。停止状态只显示番茄钟图标。组件始终链接到 `/tomato`。
4. **AC-4**: 导航空间不足时，共享组件收缩为番茄钟图标。图标保留可访问名称和当前运行或暂停状态，不依赖颜色表达状态。未登录时不显示组件，`/tomato` 页面不重复显示它。
5. **AC-5**: Provider 使用分离且强类型的状态 Context 与操作 Context。状态 Hook、操作 Hook 和结算订阅 Hook 在 Provider 外调用时抛出清楚错误。操作 Context 保持引用稳定，首版共享导航组件不渲染控制按钮，但全部现有操作仍可供以后复用。
6. **AC-6**: 站内导航不会重置、暂停或重新创建当前计时。运行时间继续由现有 `endAt` 推导。普通 `TICK` 只更新内存，不写 `localStorage`；开始、暂停、继续、停止、跳过、设置、到期结算、结果确认和远端有效状态变化继续安全持久化。
7. **AC-7**: 在任何站内页面到期时，现有状态机生成一次结果，先进入当前用户 outbox，再自动调用现有保存操作。在线成功时记录只写入一次；离线或临时失败时继续使用现有退避重试，不需要用户手动同步。浏览器冻结时不承诺准点执行，恢复执行后的首次校准按原 `endAt` 只结算一次，不按唤醒时间延长时长。
8. **AC-8**: 当前标签页自然到期，或登录恢复时发现当前阶段已经到期，均通过现有 Toaster 显示一次中文 Toast。Toast 只用于 `COMPLETED`，以 `userId + eventId` 去重，远端 `storage` 同步到已结算状态时不重放。声音继续遵守现有插件规则，多个活动标签页都可能播放。其他页面保持自己的标题，`/tomato` 页面继续显示现有倒计时标题。
9. **AC-9**: 导航组件对存储错误、同步失败或冲突显示小型状态标记和可访问文本，点击后进入 `/tomato` 处理。错误详情、立即同步和冲突操作仍只在番茄钟页面展示。
10. **AC-10**: 番茄钟页面先建立强类型订阅，再发起月份查询，并接收挂载后的 `created`、`already_exists` 和 `conflict` 结算。订阅不重放页面离开期间的事件。查询期间收到的规范记录按 `eventId` 保留并与响应合并，较旧查询不得覆盖它。重新进入页面时，现有月份查询和 outbox 合并必须恢复完整历史，不重复插入记录。
11. **AC-11**: 退出登录时，Provider 隐藏旧用户状态并停止该用户同步，但不删除或停止持久化计时。原用户再次登录后恢复；若原定结束时间已过，只补记当前阶段一次，并按完整目标时长记录 `COMPLETED`。切换用户时，旧请求、事件和错误不得进入新用户界面。重试定时器和队列任务必须在发起保存或写本地存储前验证捕获的用户与会话代次；已经发出的旧请求可以完成，但不能影响新会话。
12. **AC-12**: 现有多标签页 `storage` 同步、损坏数据隔离、不可写存储阻塞、用户隔离、服务端幂等、冲突处理、时间设置、计时控制、按日历史、月份缓存和时区归档行为保持可用。
13. **AC-13**: Provider、Context、共享导航组件、结算订阅和持久化策略有可重复组件测试。真实页面验证覆盖运行中跨路由导航、后台到期、离线恢复、退出与重新登录、用户切换、窄导航和 `/tomato` 回归。

## Decision

**Chosen option**: Option 1: 原地提升现有控制器

将现有 `usePomodoro` 控制器封装进 Pomodoro 专用 Provider。Provider 放在 `AuthProviders` 内并包裹导航栏和页面内容。它不是通用应用 Store，其他业务需要全局状态时应使用自己的领域 Provider。

**Implementation skills**: `typescript-react-patterns` (`asyrafhussin/agent-skills`, `.agents/skills/typescript-react-patterns/`)

## Feature design

### Component ownership

| Component | Owns | Must not own |
| --- | --- | --- |
| `PomodoroProvider` | 唯一控制器、认证生命周期、插件、持久化、outbox 同步、结算订阅 | 月份历史、所选日期、导航样式 |
| State Context | 生命周期、计时状态、同步状态、错误和 outbox 的只读快照 | 操作函数 |
| Actions Context | 稳定的开始、暂停、继续、停止、跳过、设置、重试和采用服务端记录操作 | 可变状态 |
| Settlement Context | 稳定的订阅函数 | 事件历史或重放缓存 |
| `PomodoroGlobalStatus` | 导航栏展示、响应式收缩、错误标记、`/tomato` 链接 | 计时或同步逻辑 |
| `PomodoroWorkspace` | 日期、时区、月份缓存、历史合并和页面布局 | 创建控制器 |
| Tomato title bridge | `/tomato` 挂载期间的倒计时标题投影 | 全局计时、声音或同步 |

### Data model

本次没有数据库迁移，也没有新的持久化实体。

| Entity or state | Identity | Relationship and constraints |
| --- | --- | --- |
| `User` | `id` | 一个用户拥有多条 `PomodoroRecord`，客户端状态按用户隔离 |
| `PomodoroRecord` | 数据库 `id`，可选 `eventId` | 保留现有字段和 `userId + eventId` 幂等约束 |
| `PomodoroTimerEnvelope` | 用户对应的版本化存储键 | 每个用户保存一份现有 `PomodoroState` |
| `PomodoroOutboxItem` | `userId + eventId` | 每个结果独立保存，保留现有状态和重试规则 |
| Provider runtime | 当前认证用户和标签页实例 | 只存在内存，每个标签页一个，不跨设备共享 |
| Page date state | `userId + timeZone + month` | 只由 `/tomato` 页面拥有，不提升到 Provider |

Provider 不拥有时区。计时和结算继续保存绝对 `startAt` 与 `endAt`。`/tomato` 页面在挂载时取得 IANA 时区，并按 spec 0003 将绝对结束时间归档到历史日期和月份。

### Provider lifecycle

| Lifecycle | Entry | Behaviour | Exit |
| --- | --- | --- | --- |
| `signed_out` | 没有认证用户 | 使用初始内存状态，不展示、不读取、不同步 | 用户登录 |
| `hydrating` | 用户登录或切换 | 探测存储，读取该用户计时与 outbox，阻止控制动作 | 恢复成功或恢复失败 |
| `ready` | 当前用户恢复完成 | 运行计时、持久化、插件和同步 | 用户变化或 Provider 卸载 |

恢复失败也进入 `ready`，同时设置当前用户的 `storageError`。有可读快照时继续展示快照。没有快照时使用明确的不可恢复状态，不把 `initialState` 标记为真实恢复结果。控制和同步继续使用 0001 的存储阻塞规则，后续存储探测成功并完成恢复后才能解除错误。

用户变化时增加会话代次。重试定时器和队列任务在发起服务端保存或本地写入前先验证捕获的用户与代次。异步结果、订阅通知和状态写入也只有在捕获的用户与代次仍匹配时才能提交到当前界面。已经发出的旧请求可以完成服务端裁决，但不能改变新会话。退出只清理内存运行资源和可见状态，不删除用户存储。

### State transitions and persistence

现有 reducer 和 `Action` 判别联合保持计时状态的唯一转换入口。

| Transition | Memory | Persist timer | Outcome handling |
| --- | --- | --- | --- |
| `START`, `PAUSE`, `RESUME`, `STOP`, `SKIP`, `SET_SETTINGS` | 立即更新 | 写入有效新状态 | `STOP` 和部分 `SKIP` 可以生成 outcome |
| 未到期 `TICK` | 更新 `remainingMs` | 不写入 | 无 |
| 到期 `TICK` | 进入下一阶段的停止状态 | 按 0001 顺序持久化 | 先确保 outcome 进入 outbox，再确认 outcome |
| 登录恢复 `HYDRATE` | 根据 `endAt` 校准或结算 | 不回写未变化的远端快照 | 过期时只结算当前阶段一次 |
| 多标签页恢复 | 采用当前用户的有效存储状态 | 不回写同一快照 | 保留现有事件幂等裁决 |
| `ACK_OUTCOME` | 清除已安全入队的 outcome | 写入清除后的状态 | 启动或继续自动同步 |

运行中持久化快照的 `remainingMs` 可以滞后，因为恢复值始终从持久化 `endAt` 和当前时间重新计算。暂停状态必须保存当时计算后的 `remainingMs`，因为暂停后没有 `endAt`。

### Client interface

| Surface | Inputs | Outputs | Failure contract |
| --- | --- | --- | --- |
| `PomodoroProvider` | `children`，认证 Context | 三个稳定 Context | 无 Provider 时消费 Hook 抛出明确错误 |
| `usePomodoroState` | 无 | 生命周期、`PomodoroState`、outbox、错误、在线和同步状态 | 恢复中不伪装为就绪 |
| `usePomodoroActions` | 无 | 全部现有操作 | 未认证、恢复中、存储阻塞或 pending outcome 时沿用现有保护 |
| `usePomodoroSettlement` | 强类型 listener | 自动注册并在卸载时取消 | listener 异常不能阻止 outbox 清理或其他 listener |
| `PomodoroGlobalStatus` | 当前路径与 Context | 图标、阶段、时间、暂停和错误状态，链接 `/tomato` | 未认证或位于 `/tomato` 时不渲染 |
| Tomato title bridge | 计时状态 | 当前 `/tomato` 的倒计时标题 | 卸载后不再写标题，目标路由元数据恢复标题 |
| `savePomodoroRecord` | 现有 `SavePomodoroInput` | 现有 `SavePomodoroResult` | 接口和错误分类保持不变 |

订阅 listener 接收现有 `PomodoroSettlement`。番茄钟页面先注册 listener，再启动月份查询。Provider 在删除成功 outbox 项之前通知当前会话 listener。`conflict` 也通知规范服务端记录，再保留冲突项。查询进行期间收到的规范记录进入页面的同月暂存集合，并在查询响应提交时按 `eventId` 合并，旧响应不能覆盖它。Provider 不保留用于重放的结算数组。

### Plugin ownership

| Plugin or effect | Owner | Rule |
| --- | --- | --- |
| Tick | Provider | 只在 `ready` 且 running 时运行，保留可见和隐藏间隔 |
| Audio | Provider | 保留当前标签页的现有声音规则 |
| Completion Toast | Provider | 自然到期和登录恢复补记的 `COMPLETED` 按 `userId + eventId` 显示一次，不等待网络成功；远端恢复、停止和跳过不显示 |
| Title | `/tomato` title bridge | 只在完整番茄钟页面更新，其余路由不由番茄钟写标题 |
| Outbox sync | Provider | 只同步当前认证用户，保留网络、可见性和退避触发器 |

Toast 使用现有 Toaster，不增加浏览器通知权限。统一文案说明本阶段已完成且记录将自动保存，避免在通知时猜测网络结果。一次性去重依据当前标签页 runtime 中的 `userId + eventId`，不建立持久化通知历史。远端 `storage` 恢复到已结算状态不显示 Toast。

### Value sourcing

| Action or display | Value produced or displayed | Source |
| --- | --- | --- |
| Provider 初始化 | 当前用户与生命周期 | `useCtxAuth().user` 和用户变化触发的会话代次 |
| 计时显示 | 阶段与运行状态 | Provider 中的现有 `PomodoroState` |
| 剩余时间 | `MM:SS` | running 时由 `endAt` 和当前时间经 reducer 计算，其余状态使用 `remainingMs` |
| 响应式导航状态 | 完整文本或图标 | 当前容器宽度、运行状态和现有格式化函数 |
| 路由可见性 | 是否渲染共享组件 | 当前认证状态和 Next.js 当前路径 |
| 错误标记 | 存储、失败或冲突状态 | `storageError` 和当前用户 outbox 状态 |
| 控制动作 | 下一计时状态 | 现有 reducer、当前时间和开始时生成的 `crypto.randomUUID()` |
| 持久化键 | 当前计时和 outbox 键 | 当前认证用户 `id` 和现有版本化键函数 |
| 到期结果 | 类型、原因、时间和时长 | 现有 reducer 的活动阶段、`startAt`、`endAt`、设置和 `eventId` |
| 历史归档时区 | 本地日期和月份 | `/tomato` 挂载时的 IANA 时区和绝对 `endAt`，Provider 不计算本地日期 |
| Toast | 完成阶段和一次性身份 | 本地自然到期或登录恢复补记产生的 `COMPLETED`，以及 runtime 的 `userId + eventId` 去重集合 |
| 声音 | 当前声音规则和音量 | Provider 中的现有 Audio plugin 与 `PomodoroState.settings` |
| 同步结果 | 规范记录和状态 | 现有 `savePomodoroRecord` 判别联合 |
| 结算订阅 | listener 收到的 settlement | 当前用户 outbox 项和服务端规范记录 |
| 历史恢复 | 月份记录和本地未同步结果 | 现有 `getTomatoHistory` 与 outbox 合并逻辑 |
| 页面标题 | `/tomato` 倒计时标题 | Tomato title bridge 挂载状态和当前计时状态 |

### Key invariants

1. 每个浏览器标签页最多存在一个 Pomodoro 控制器、一个 tick interval 和一个 outbox 同步循环。
2. Provider 是 Pomodoro 专用边界，不接收 Todo、Daily 或其他领域状态。
3. Context 使用 `createContext<T | null>(null)` 和带空值保护的强类型消费 Hook，不提供伪默认值。
4. 状态 Context 与操作 Context 分离，操作值使用稳定引用。
5. 普通 tick 不持久化。所有影响恢复、用户操作或 outcome 安全性的转换必须持久化。
6. UI 不直接写 reducer 状态、存储或 Prisma，只调用 Context 操作。
7. 页面结算 listener 没有事件所有权。数据库和 outbox 才是页面离开期间的完整来源。
8. Toast 和声音失败不能阻止计时结算、持久化或同步。Toast 只响应本地自然到期和登录恢复补记的 `COMPLETED`。
9. 用户切换后，旧会话的状态、回调、错误和异步结果不能提交到新会话。
10. spec 0001 和 spec 0003 的数据、幂等、离线、冲突、日期、时区和布局契约继续有效。
11. Provider 只处理绝对时间，页面浏览时区和归档规则继续由 `/tomato` 页面拥有。

### Security model

1. Provider 只对 `useCtxAuth` 给出的当前认证用户读取和写入本地键。
2. Server Action 继续通过 `requireAuth` 取得服务端用户，不信任客户端用户标识。
3. 未登录时不读取私人 outbox，不运行同步，也不展示番茄钟状态。
4. 订阅 settlement 包含用户身份，页面先验证它仍属于当前会话再更新月份缓存。
5. 日志不得记录 Cookie、令牌、完整计时载荷或历史正文。

### Configuration required

没有新的环境变量、凭据、依赖、数据库迁移或功能开关。

### Critical test scenarios

1. 登录恢复期间只显示图标且完整页面不能误操作，恢复后显示真实状态，验证 **AC-1**, **AC-2**。
2. 在 Todo 页面运行和暂停计时，导航到 Blog 再回到 Tomato，确认控制器身份、`endAt`、剩余时间和操作一致，验证 **AC-1**, **AC-3**, **AC-6**。
3. 宽导航显示阶段与时间，窄导航收缩为有可访问名称的图标，未登录和 `/tomato` 不重复显示，验证 **AC-3**, **AC-4**。
4. 只读取操作 Context 的测试消费者不随 tick 重渲染，Provider 外调用三个 Hook 都抛出明确错误，验证 **AC-5**。
5. 连续普通 tick 不写存储，暂停、继续和到期仍留下可恢复快照与安全 outbox，验证 **AC-6**, **AC-7**。
6. 在非 Tomato 页面在线到期，确认一次声音、一次 Toast、一次服务端记录和下一阶段状态，且当前路由标题不变；停止、跳过和远端恢复不显示 Toast，验证 **AC-7**, **AC-8**。
7. 断网到期后立即出现待同步结果，联网后自动只写入一次，不要求手动同步，验证 **AC-7**, **AC-12**。
8. 存储不可写、同步失败和冲突只在导航显示状态标记，完整详情和操作仍在 Tomato 页面，验证 **AC-9**, **AC-12**。
9. Tomato 页面先订阅再查询，在查询响应返回前注入 settlement，确认旧响应不能覆盖规范记录；页面离开期间完成后重新进入，通过月查询或 outbox 恢复且不重复，验证 **AC-10**。
10. 计时中退出后状态隐藏且同步停止。原用户在结束前重新登录时继续剩余时间，在结束后登录时只补记完整目标时长一次并显示一次 Toast，验证 **AC-8**, **AC-11**。
11. 重试即将发起和请求已经发出两个时点分别切换用户，确认旧任务不发起新写入，已发请求的状态、错误、Toast 和 settlement 不进入新用户界面，验证 **AC-11**, **AC-12**。
12. 两个标签页分别停留在任意路由，验证暂停、继续、到期和 outbox 变化保持现有跨标签页语义，数据库仍按事件幂等，验证 **AC-8**, **AC-12**。
13. 冻结或暂停浏览器执行直到原 `endAt` 之后，再恢复并确认只按原结束时间结算当前阶段一次，验证 **AC-7**, **AC-12**, **AC-13**。
14. 运行现有 reducer、存储、Hook、历史、日历、操作面板和页面测试，并完成真实路由流程，验证 **AC-12**, **AC-13**。

## Build plan

1. 建立第一条真实跨页面路径。新增 Pomodoro 专用 Provider 和分离的强类型 Context，将唯一现有控制器挂到认证上下文内，让 `/tomato` 改为消费相同状态，并在导航栏接入只读共享组件，满足 **AC-1**, **AC-2**, **AC-3**, **AC-5**。
2. 收口全局生命周期与持久化。实现用户代次、恢复门槛、退出与切换隔离，并让普通 tick 只更新内存而所有有效转换继续安全持久化，满足 **AC-2**, **AC-6**, **AC-11**, **AC-12**。
3. 接通全局完成反馈与页面结算。把 tick、声音、Toast 和同步放入 Provider，把标题留在 Tomato 页面，新增无重放的强类型 settlement 订阅并让月份历史继续使用现有恢复来源，满足 **AC-7**, **AC-8**, **AC-10**, **AC-12**。
4. 完成导航状态组件。实现运行、暂停、空闲、恢复、错误和窄宽度状态，保持中文文案、键盘操作、焦点与非颜色提示，满足 **AC-3**, **AC-4**, **AC-9**。
5. 增加 Provider、Context、持久化、订阅和导航组件测试。运行 lint、build、Vitest、需要账号环境的 Playwright、真实跨路由验证、`/check verify` 与 `/test`，满足 **AC-1** 到 **AC-13**。

## Consequences

**Positive**:

1. 页面导航不再决定计时、声音和自动同步是否运行。
2. 其他页面使用同一状态，后续增加暂停或继续按钮只需调整共享组件。
3. 普通 tick 不再持续写同步存储，降低全站常驻控制器的主线程开销。
4. 现有数据库和恢复格式不变，回滚不需要处理数据。

**Negative and tradeoffs**:

1. Provider 成为全站登录会话的常驻客户端逻辑，生命周期错误会影响所有番茄钟入口。
2. 状态 Context 的消费者仍会按 tick 频率更新，消费范围必须保持小且明确。
3. 分离 Context 和 settlement 订阅比页面内单一 Hook 多一层接口。
4. 多标签页仍可能各自播放声音和 Toast，这是维持现有协调范围的已接受结果。

**Neutral**:

1. 不支持跨设备活动计时同步。
2. 不把月份历史和日期选择提升为全局状态。
3. 首版导航组件只读，但操作 Context 已保留以后扩展所需动作。

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
