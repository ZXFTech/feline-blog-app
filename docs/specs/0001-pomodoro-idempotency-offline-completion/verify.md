# Verify: 番茄钟核心闭环 · spec 0001 · updated 2026-08-26

_Steps derived from spec 0001 acceptance criteria. `/check verify` runs these; `/test` locks the durable ones._

## UI / manual

- [x] 登录后开始专注，确认阶段来自当前 reducer 状态，事件标识来自 `crypto.randomUUID()`，目标时长来自当前设置。 → AC-1, AC-2, AC-7
- [x] 暂停后等待再继续，确认首次 `startAt` 不变，`remainingMs` 暂停期间保持，实际时长不包含暂停。 → AC-1
- [x] 让专注、短休和长休自然到期，确认各生成一条 `COMPLETED`，记录 `endAt` 使用原定结束时间。 → AC-1
- [x] 到期前分别跳过和停止，确认结束原因来自用户操作，记录 `endAt` 使用操作时间。 → AC-1
- [x] 在原定结束时间边界点击跳过或停止，确认 `COMPLETED` 优先。 → AC-1
- [x] 完成专注后确认下一阶段由当前阶段、`completedFocus` 和 `longBreakEvery` 推导，并保持停止状态。 → AC-1, AC-3
- [x] 关闭页面直到当前运行阶段到期，再打开页面，确认只补记当前阶段一次，不推演后续周期。 → AC-3
- [x] 断网完成一次阶段，确认本地历史立即显示待同步，联网、页面可见或新结果入队时自动重试并最终显示已同步。 → AC-4
- [x] 让重试持续失败，确认 `retryCount` 和 `nextAttemptAt` 按一秒到五分钟指数退避变化。 → AC-4
- [x] 制造认证或校验失败，确认自动重试暂停并显示可处理错误。 → AC-5, AC-7
- [x] 制造同一事件不同内容的冲突，确认显示服务端首次记录，采用后本地冲突项被清除。 → AC-5
- [x] 在两个标签页分别完成不同事件，确认事件独立保存，`storage` 变化可见，最终各写入一次。 → AC-2, AC-4
- [x] 退出并切换用户，确认计时、队列、错误和历史隐藏且按认证用户 id 隔离，原用户再次登录后恢复。 → AC-7
- [x] 禁用本地存储后尝试开始，确认开始被阻止并显示原因。 → AC-8
- [x] 在运行结束时模拟本地写入失败，确认内存结果保留，下一阶段被阻止并持续恢复。 → AC-8
- [x] 放入损坏或不支持版本的数据，确认内容移动到隔离键，计时恢复为空闲并显示提示。 → AC-8
- [x] 切换所选月份和浏览器 IANA 时区，确认 UTC 范围来自所选本地月份，起点包含且终点排除。 → AC-6, AC-9
- [x] 创建跨午夜和月末记录，确认按 `endAt` 的本地日期归档，月历只标记完成专注。 → AC-6
- [x] 确认服务端历史和当前用户本地队列按事件标识合并，旧记录按数据库 id 保留，并按 `startAt` 倒序稳定排列。 → AC-4, AC-9

## Commands

- [x] `pnpm prisma:dev migrate status` → database schema is up to date，且迁移包含用户和事件组合唯一索引。 → AC-2
- [x] `pnpm exec tsc --noEmit` → 无 TypeScript 错误。 → AC-1, AC-4, AC-7
- [x] `pnpm lint` → 无新增 lint 错误。 → AC-1, AC-4
- [x] `pnpm build` → 生产构建通过并包含 `/tomato`。 → AC-1, AC-6, AC-9

## Acceptance criteria coverage

- AC-1 covered by UI steps 1 through 6
- AC-2 covered by UI steps 1 and 12, command 1
- AC-3 covered by UI steps 6 and 7
- AC-4 covered by UI steps 8, 9, 12, and 19
- AC-5 covered by UI steps 10 and 11
- AC-6 covered by UI steps 17 and 18
- AC-7 covered by UI steps 1, 10, and 13
- AC-8 covered by UI steps 14 through 16
- AC-9 covered by UI steps 17 and 19
