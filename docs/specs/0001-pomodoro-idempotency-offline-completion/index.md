# 0001. 番茄钟记录幂等与离线完成

**Date**: 2026-08-26
**Status**: Accepted

## Summary

每个真正开始运行的番茄阶段获得稳定事件标识。客户端先把结束结果写入独立的本地事件项，服务端再用数据库唯一约束保证重复提交只产生一条记录。页面关闭期间只补记已经到期的当前阶段，不推演后续多个周期。

## Requirements

**User stories**:

1. 作为登录用户，我希望完成、跳过或停止一个番茄阶段后只看到一条历史，以便相信统计结果。
2. 作为登录用户，我希望关闭页面期间到期的当前阶段在回来后自动补记，以便专注结果不会丢失。
3. 作为登录用户，我希望断网时仍能看到待同步结果，并在恢复联网后自动完成同步。

**Acceptance criteria**:

1. **AC-1**: 专注、短休息和长休息自然结束时各生成一条 `COMPLETED` 记录。跳过和停止分别生成一条 `SKIPPED` 或 `STOPPED` 记录。暂停时间不计入 `actualDurationMs`。
2. **AC-2**: 同一阶段在重复请求、刷新、React 重复执行和多标签页并发提交时，数据库中最多存在一条记录。
3. **AC-3**: 页面关闭或切走期间当前运行阶段到期后，下次恢复会按原定结束时间补记一次，并进入下一个停止状态。系统不推演后续多个周期。
4. **AC-4**: 请求未到达服务端或服务端、数据库暂时不可用时，结果立即进入历史并标记待同步。页面恢复、重新联网、标签页重新可见或新结果入队时会自动重试，成功后状态变为已同步。
5. **AC-5**: 认证、校验和内容冲突会暂停自动重试并显示可处理状态。冲突项可以采用服务端首次记录并从本地队列清除。
6. **AC-6**: 月历使用浏览器当前 IANA 时区，并按 `endAt` 所在的本地日期归属结果。当天至少完成一次专注时显示日期标记，跳过、停止和休息只在历史中显示。
7. **AC-7**: 登录用户只能写入和读取自己的番茄记录。当前计时、待同步项和错误状态都按用户隔离。退出后隐藏并停止同步，同一用户再次登录后恢复。
8. **AC-8**: 本地存储不可用时不能开始新的计时，并显示明确原因。运行中发生写入失败时保留内存结果、阻止下一阶段并持续恢复。损坏或无法迁移的内容会被隔离，界面恢复为空闲状态并显示恢复提示。
9. **AC-9**: 历史每次只查询 `endAt` 位于所选本地月份的结果，按 `startAt` 倒序显示，并与当前用户的本地待同步项按事件标识合并。

## Decision

**Chosen option**: Option 1: 扩展现有记录并使用本地待同步队列

现有记录表承载最终结果。版本化本地计时状态和独立事件项承载恢复与重试，MariaDB 组合唯一约束提供最终幂等保证。

**Implementation skills**: `typescript-react-patterns` (`asyrafhussin/agent-skills`, `.agents/skills/typescript-react-patterns/`) · `prisma-orm-v7-skills` (`gocallum/nextjs16-agent-skills`, `.agents/skills/prisma-orm-v7-skills/`)

## Feature design

### Data model sketch

| Entity               | Key fields                                                                                                        | Rules and relationships                                                                                                                |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `User`               | `id`                                                                                                              | 一个用户拥有多条 `PomodoroRecord`                                                                                                      |
| `PomodoroRecord`     | 现有字段；新增 `eventId String?`；新增 `endReason PomodoroEndReason?`                                             | `userId` 指向 `User`；`userId + eventId` 组合唯一；`startAt` 与 `endAt` 明确为 `@db.DateTime(3)`；旧记录允许新字段为空；新写入必须完整 |
| `PomodoroState`      | 现有字段；新增 `activeEventId`；新增 `storageVersion`                                                             | 按用户保存；只有 `running` 或 `paused` 状态持有 UUID；`startAt` 保留第一次开始时间；暂停、刷新和恢复沿用；结果产生后清空               |
| `PomodoroOutboxItem` | `schemaVersion`、`userId`、`eventId`、完整载荷、`createdAt`、`retryCount`、`nextAttemptAt`、`lastError`、`status` | 每个事件使用独立本地键；成功后删除；冲突时保留到用户采用服务端记录                                                                     |

`PomodoroEndReason` 包含 `COMPLETED`、`SKIPPED` 和 `STOPPED`。它替换当前未被记录模型使用的 `PomodoroStatus`，避免保留含义重叠的枚举。现有 `finished` 保留，并由结束原因推导。旧记录的 `eventId` 与 `endReason` 保持为空，不伪造历史含义。

### Local persistence

计时状态使用 `pomodoro:v2:timer:<userId>`。每个待同步事件使用 `pomodoro:v2:outbox:<userId>:<eventId>`。不同标签页写入不同事件时不会发生整包覆盖，同一事件的重复写入只会覆盖同一个键。

阶段产生结果时先写独立事件项，再写新的计时状态，最后更新界面。若浏览器在中间关闭，恢复流程会从旧计时状态推导同一个事件标识，并幂等重写同一个事件项。`storage` 事件用于让其他标签页重新读取相关键，但数据库仍是最终并发裁决者。

初始化时通过一次写入和删除探测 `localStorage` 能力。损坏或不支持的版本移动到 `pomodoro:v2:quarantine:<userId>:<timestamp>`，不自动发送。版本 1 只迁移能够通过类型和时间校验的当前状态，不能证明身份归属的旧待同步内容不迁移。

若开始前写入失败，新的计时不能开始。若运行中产生结果时写入失败，结果保留在内存，界面停留在阻塞恢复状态，同时重试本地保存和服务端同步。保存或同步至少一项成功前不能开始下一阶段。

### State transitions

| Current state           | Trigger                               | Result                                                                  | Record outcome |
| ----------------------- | ------------------------------------- | ----------------------------------------------------------------------- | -------------- |
| `idle` or stopped phase | Start                                 | 当前阶段进入 `running`，从当前设置取得目标时长并生成 `activeEventId`    | none           |
| `running`               | Pause                                 | 保留事件标识和剩余时间，进入 `paused`                                   | none           |
| `paused`                | Resume                                | 沿用事件标识和第一次 `startAt`，根据 `remainingMs` 重新计算原定结束时间 | none           |
| `running` or `paused`   | Skip before deadline                  | 当前事件入队，进入下一个停止阶段并清空事件标识                          | `SKIPPED`      |
| `running` or `paused`   | Stop before deadline                  | 当前事件入队，进入空闲状态                                              | `STOPPED`      |
| `running`               | Tick or recovery at or after deadline | 当前事件按原定结束时间入队，进入下一个停止阶段并清空事件标识            | `COMPLETED`    |

当用户操作时间已经达到原定结束时间时，`COMPLETED` 优先。恢复只结算当前持久化阶段一次，不根据离线时长继续推演自动开始的阶段。

暂停状态关闭期间不会消耗剩余时间，也不会补记。下一阶段类型继续由 reducer 根据当前阶段、`completedFocus` 和 `longBreakEvery` 计算。完成专注时更新 `completedFocus`，跳过专注沿用现有递增语义。

### API surface

| Surface                            | Method | Key inputs                                                                            | Key outputs                                            | Auth          | Key errors                                                            |
| ---------------------------------- | ------ | ------------------------------------------------------------------------------------- | ------------------------------------------------------ | ------------- | --------------------------------------------------------------------- |
| `savePomodoroRecord` Server Action | call   | `eventId`、`type`、`endReason`、`startAt`、`endAt`、`targetDurationMs`、`remainingMs` | 判别联合返回值；成功、重复和冲突都携带规范化服务端记录 | `requireAuth` | `unauthenticated`、`invalid_payload`、`conflict`、`temporary_failure` |
| `getTomatoHistory` Server Action   | call   | UTC 月份起点与排他结束点                                                              | 当前用户记录，按 `startAt` 倒序                        | `requireAuth` | `unauthenticated`、`invalid_range`、`temporary_failure`               |

`savePomodoroRecord` 不接受 `userId`。服务端从认证会话得到用户，校验 UUID、阶段类型、结束原因、时间顺序、目标时长和剩余时长。目标时长必须大于零且不超过 24 小时。剩余时长必须位于零到目标时长之间。实际时长由目标时长减去剩余时长推导，因此暂停时间不计入。`finished` 由结束原因推导。

服务端先尝试创建记录。遇到组合唯一约束冲突后，读取首次记录并比较规范化内容。相同组合键且内容一致时返回 `already_exists`。内容不一致时保留首次记录，并返回带首次记录的 `conflict`。规范化时间统一到数据库保存的毫秒精度。

`getTomatoHistory` 移除可选 `userId`，固定读取当前认证用户。时间条件使用 `endAt >= startUtc` 与 `endAt < endUtc`。旧 `addTomatoHistory` 暂时保留，但番茄钟不再调用它。

### Value sourcing

| Action           | Value produced or displayed     | Source                                                                           |
| ---------------- | ------------------------------- | -------------------------------------------------------------------------------- |
| Start phase      | `activeEventId`                 | 浏览器 `crypto.randomUUID()`                                                     |
| Start phase      | `type`                          | reducer 当前阶段                                                                 |
| Start phase      | `startAt`                       | `START` 动作的浏览器当前时间                                                     |
| Start phase      | `targetDurationMs`              | 当前阶段和 `PomodoroSettings` 通过 `durationMsFor` 推导                          |
| Pause and resume | `remainingMs`                   | reducer 在暂停时根据原定 `endAt` 计算，暂停期间保持不变                          |
| Complete phase   | `endReason=COMPLETED`           | 当前时间达到持久化 `endAt`                                                       |
| Complete phase   | 记录 `endAt`                    | 持久化计时状态的原定 `endAt`                                                     |
| Skip or stop     | 结束原因                        | 用户动作；到期边界由持久化 `endAt` 覆盖为 `COMPLETED`                            |
| Skip or stop     | 记录 `endAt`                    | 用户动作时间                                                                     |
| Advance phase    | 下一阶段和 `completedFocus`     | reducer 当前阶段、`completedFocus` 与 `longBreakEvery`                           |
| Save record      | `userId`                        | `requireAuth` 解析 `token` Cookie                                                |
| Save record      | `actualDurationMs`              | 服务端根据 `targetDurationMs - remainingMs` 计算                                 |
| Save record      | `finished`                      | 服务端根据 `endReason === COMPLETED` 推导                                        |
| Queue record     | 本地 `userId`                   | `useCtxAuth` 中已经完成认证检查的 `user.id`                                      |
| Retry record     | 请求载荷                        | 当前用户的 `PomodoroOutboxItem`                                                  |
| Retry result     | 同步状态与暂停原因              | `savePomodoroRecord` 的判别联合返回值和网络错误分类                              |
| Retry schedule   | `retryCount` 与 `nextAttemptAt` | 上次尝试结果和 1 秒到 5 分钟指数退避规则                                         |
| Restore timer    | 当前阶段与原定结束时间          | 版本化 `PomodoroState`                                                           |
| Month query      | 所选月份                        | 月历组件当前选择状态，默认浏览器当前月份                                         |
| Month query      | IANA 时区                       | `Intl.DateTimeFormat().resolvedOptions().timeZone`                               |
| Month query      | UTC 时间范围                    | 所选本地月份与 IANA 时区转换，起点包含，终点排除                                 |
| Calendar marker  | 完成专注日期                    | 服务端记录与本地队列中 `type=FOCUS` 且 `endReason=COMPLETED` 的 `endAt` 本地日期 |
| History row      | 阶段、结果、时间和同步状态      | 服务端规范化记录与本地队列按 `userId + eventId` 合并；旧记录使用数据库 `id`      |
| History order    | 列表顺序                        | 合并后按 `startAt` 倒序，再按 `eventId` 或数据库 `id` 稳定排序                   |

### Key invariants

1. 一个非空闲阶段只有一个稳定 `activeEventId`。
2. 数据库中 `userId + eventId` 最多对应一条记录。
3. 同一事件的首次规范化内容不可被重试覆盖。
4. 幂等内容比较使用阶段类型、结束原因、数据库毫秒精度的开始与结束时间、目标时长和剩余时长。服务端推导字段不参与客户端比较。
5. 自然结束使用原定结束时间。跳过和停止使用用户操作时间，除非该时间已经达到原定结束时间。
6. `startAt` 始终是该阶段第一次开始时间。暂停和继续不会改写它，`actualDurationMs` 不包含暂停时间。
7. 阶段结果先写独立事件项，再更新按用户隔离的计时状态。
8. 网络错误、超时、数据库连接或超时错误和未分类的服务端暂时故障可以重试。认证、校验和冲突错误保留本地项并暂停重试。
9. 重试使用从 1 秒开始且最大 5 分钟的指数退避。页面恢复、重新联网、标签页可见和新项入队可以立即触发一次重试。
10. 多标签页可以并发提交。数据库返回 `created` 或 `already_exists` 时，本地项都视为同步成功。
11. 设备时间异常导致负时长或超过 24 小时时暂停恢复并提示，不提交记录。

### Security model

番茄记录是私人数据。所有读写都需要 `requireAuth`，服务端只能使用当前认证用户的标识。客户端不能指定记录所有者，读取接口移除可选 `userId`，不能读取其他用户。

当前计时、队列和错误状态都按 `useCtxAuth.user.id` 隔离。退出后隐藏当前用户状态并停止同步。另一用户登录时只能看到和同步自己的内容。原用户再次登录时恢复原计时和队列。服务端日志只记录写入结果、事件标识、当前用户标识和错误分类，不记录完整载荷、Cookie 或令牌。

### User interface states

番茄钟页面顶部显示待同步数量、暂停原因和存储恢复提示。历史行显示已同步、待同步、同步失败或冲突状态。冲突行显示服务端首次记录，并提供采用服务端记录的操作。采用后删除本地冲突项并刷新对应月份。

历史与月历立即合并本地结果。成功删除事件项后，使用 Server Action 返回的规范化记录立即替换本地行，再刷新对应月份。月历只标记按 `endAt` 归属的完成专注。每次历史读取只查询所选月份，不额外分页。

### Configuration required

不需要新的环境变量、凭据或功能开关。

### Critical test scenarios

1. Happy path: 完成专注、短休息和长休息，并验证对应结果和月历规则，verifies **AC-1**, **AC-6**
2. Outcome path: 在到期前分别跳过和停止，并穿插多次暂停与继续，验证结束原因、第一次开始时间和不含暂停的实际时长，verifies **AC-1**
3. Idempotency: 同一事件并发和重复提交，验证数据库只有一条记录；不同内容返回带首次记录的冲突，verifies **AC-2**, **AC-5**
4. Offline recovery: 关闭页面直到当前阶段到期，再恢复并验证只补记当前阶段一次且下一阶段停止，verifies **AC-3**
5. Retry: 先模拟断网，再恢复联网，验证本地结果立即可见且最终只同步一次，verifies **AC-4**
6. Cross tab: 两个标签页同时结束不同事件，验证独立事件键不互相覆盖并最终各写入一次，verifies **AC-2**, **AC-4**
7. Auth: 退出和切换用户，验证当前计时、队列、错误状态及历史读写边界，verifies **AC-7**
8. Storage failure: 在开始前和运行结束时分别模拟不可写，再模拟损坏和不支持版本，验证阻塞状态与安全恢复提示，verifies **AC-8**
9. Month boundary: 创建跨午夜与月末完成的记录，验证按浏览器时区的 `endAt` 归属、排他查询终点、排序和合并，verifies **AC-6**, **AC-9**

## Build plan

1. 建立第一条真实端到端路径。给 Prisma 模型增加可空 `eventId`、可空 `endReason` 和组合唯一约束，提交迁移并重新生成客户端。新增幂等 Server Action，然后让一次自然完成的专注使用 UUID 写入并刷新当前月历史与月历，satisfies **AC-1**, **AC-2**, **AC-6**, **AC-7**, **AC-9**
2. 建立按用户隔离的版本化计时状态和按事件隔离的待同步项。让跳过、停止、暂停、恢复和离线到期沿用稳定事件标识，并实现安全迁移、隔离和运行中写入失败阻塞，satisfies **AC-1**, **AC-3**, **AC-7**, **AC-8**
3. 增加同步协调器。实现错误分类、指数退避、页面与网络触发器、多标签页重复成功处理，以及认证和冲突暂停，satisfies **AC-2**, **AC-4**, **AC-5**, **AC-7**
4. 把服务端月历史与本地队列合并到页面。移除历史读取的可选用户参数，增加顶部同步摘要、历史状态、冲突处理和基于浏览器 IANA 时区及 `endAt` 的月份查询，satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-9**
5. 增加 reducer、存储迁移、Server Action、并发幂等和真实页面流程测试，并运行 lint、build、`/check verify` 与 `/test`，satisfies **AC-1**, **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-9**

## Consequences

**Positive**:

1. 重试、刷新和多标签页不再产生重复历史。
2. 离线结束和临时写入失败不会丢失当前阶段结果。
3. 旧历史与旧写入方法可以继续存在，迁移风险较低。

**Negative and tradeoffs**:

1. 客户端需要维护版本化存储、独立事件项、跨标签页刷新和更多可见错误状态。
2. `localStorage` 是同步 API。虽然本功能数据很小，写入仍发生在浏览器主线程。
3. 旧记录无法区分跳过与停止，新字段会保持为空。
4. 退出后本地项会继续占用该设备存储，直到原用户再次登录并同步或用户清除站点数据。

**Neutral**:

1. 自动开始只在页面活跃时推进。离线恢复不会虚构多个后续周期。
2. 多标签页不使用浏览器锁，数据库承担最终并发裁决。

## Migration plan

**Strategy**: strangler

**Phases**:

1. 把未使用的 `PomodoroStatus` 替换为 `PomodoroEndReason`，添加可空字段、明确毫秒时间精度和组合唯一约束，部署兼容旧记录的新读取与幂等写入。
2. 切换番茄钟到按用户保存的版本化计时状态、独立事件项和新写入方法，保留旧 `addTomatoHistory` 供未迁移调用方使用。
3. 验证没有旧调用方后，再单独决定是否删除旧方法。旧历史字段不回填。

**Rollback**: 回退客户端和新 Server Action 调用。新增可空列和唯一索引可以暂时保留，不影响旧读取。

**Risks**: 若迁移前已有无法识别的重复历史，它们不会被自动合并。若客户端存储迁移失败，系统会隔离旧内容并要求用户重新开始计时。
