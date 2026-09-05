# Verify: 接口安全与健壮性修复 · spec 0005

## UI and runtime

- [x] 运行 `pnpm test:e2e`，确认 `api-safety-database.spec.ts` 在 desktop 和 mobile 项目中通过，测试结束后没有残留集成测试数据，covers `AC-1`, `AC-2`, `AC-3`, `AC-6`, `AC-7`, `AC-9`, `AC-10`
- [x] 使用主测试账号登录并访问 `/todo`，确认只显示当前 ROOT 的 Todo，不显示第二账号的 Todo，covers `AC-3`
- [x] 使用主测试账号编辑第二账号拥有的 Blog，确认界面显示“文章不存在”，数据库标题不变，covers `AC-3`, `AC-4`
- [x] 用两个浏览器上下文同时对同一 Blog 点赞，确认只存在一条 `BlogLike`，且 `Blog.likeCount` 等于关系数量，covers `AC-10`
- [x] 用两个浏览器上下文从相反的旧状态操作同一 Blog，确认最终关系数量不超过一条，且缓存计数等于关系数量，covers `AC-10`
- [x] 向登录接口发送畸形 JSON，确认返回 400 和安全响应体，covers `AC-6`, `AC-7`
- [x] 匿名访问 `/api/tag`，确认返回 401；使用 USER 访问确认返回 403；使用 ROOT 访问确认返回 200，covers `AC-2`, `AC-5`, `AC-6`
- [x] 请求 `/api/blog`，确认每个作者对象只包含 `avatar`、`id` 和 `username`，covers `AC-1`, `AC-4`, `AC-15`

## Commands

- [x] `pnpm lint`，预期 0 errors，covers `AC-15`
- [x] `pnpm build`，预期 Next.js 编译和 TypeScript 检查成功，covers `AC-5`, `AC-15`
- [x] `pnpm test`，预期全部 Vitest 测试通过，covers `AC-1` through `AC-16`
- [x] `pnpm test:e2e`，预期全部 Playwright 测试通过，covers `AC-1`, `AC-2`, `AC-3`, `AC-4`, `AC-6`, `AC-7`, `AC-9`, `AC-10`, `AC-13`, `AC-15`

## Data and failure boundaries

- [x] 在真实 MariaDB 事务中先创建标签，再用不存在的用户 ID 创建 Todo，确认事务拒绝且标签数量仍为零，covers `AC-9`
- [x] 让 Blog 互动事务第一次返回 `P2002`，确认完整事务重试并返回请求的目标状态，covers `AC-10`
- [x] 模拟 Route Handler 的所有业务失败，确认分别映射为 400、401、403、404、409 和 503，covers `AC-5`, `AC-6`
- [x] 让 Tag Route Handler 抛出包含令牌和数据库文本的未知错误，确认客户端只收到安全 500，日志只包含允许字段，covers `AC-6`, `AC-14`
- [x] 验证空白字符串、错误运行时类型、无效日期、非法枚举、Unicode code point 上限和 Prompt UTF-8 65,535 字节边界，covers `AC-7`, `AC-8`
- [x] 验证 Blog 与 Todo 标签写入使用同一个 Prisma 事务客户端，父写入失败时没有部分关系更新，covers `AC-9`
- [x] 验证 Todo 列表筛选条件、当前用户总数和已完成数使用规范定义的数据范围，Blog 列表和总数使用相同过滤条件，covers `AC-11`
- [x] 验证 Blog 详情与相邻查询排除软删除记录，并按 `(createdAt, id)` 稳定排序，covers `AC-12`
- [x] 验证认证失效返回 `unauthenticated`，数据库读取失败返回 `temporary_failure`，番茄同步只停止不可重试失败，covers `AC-13`
- [x] 验证注册、Blog、Todo、Daily、Prompt 和 Pomodoro 输入只写入各自允许字段，covers `AC-16`

## Value sourcing

- [x] 使用带首尾空格和大写字母的邮箱注册或登录，确认查询使用去空格并转小写后的邮箱，covers `AC-7`, `AC-8`
- [x] 使用有效 token 和无效 token 请求当前用户，确认身份来自 JWT 用户 ID 和实时 User 查询，covers `AC-2`, `AC-13`
- [x] 读取公开 Blog，确认文章来自 Blog 行，作者来自显式公开投影，covers `AC-1`
- [x] 匿名和登录后读取同一 Blog，确认匿名互动状态为 false，登录状态来自当前用户的唯一关系行，covers `AC-4`
- [x] 用两个账号创建 Todo 和 Tag 数据，确认查询范围来自当前认证用户 ID，covers `AC-3`
- [x] 使用 USER 和 ROOT 访问 Daily 操作，确认访问决定来自实时用户角色，covers `AC-2`
- [x] 用筛选条件读取 Todo 和 Blog 列表，确认计数来源与规范的数据范围一致，covers `AC-11`
- [x] 创建相同时间的多篇 Blog，确认相邻文章来源于时间和 ID 的组合顺序，covers `AC-12`
- [x] 逐一触发解析、认证、已知 Prisma 和未知错误，确认响应状态来自统一失败分类，covers `AC-5`, `AC-6`, `AC-13`
- [x] 捕获包含用户和资源标识的错误日志，确认上下文只来自已验证标识和操作名，covers `AC-14`

## Acceptance criteria coverage

- `AC-1`: 公开作者投影与真实 Blog 响应
- `AC-2`: ROOT、USER 和匿名访问边界
- `AC-3`: Todo、Tag、Blog 和 Pomodoro 用户范围与归属
- `AC-4`: 公开 Blog 与当前用户互动状态
- `AC-5`: 统一 ActionResult 分支
- `AC-6`: HTTP 状态映射、未知 500 和安全响应
- `AC-7`: 规范化、运行时类型、JSON、枚举和日期
- `AC-8`: 字符与数据库字节上限
- `AC-9`: Blog 和 Todo 多步骤事务与真实回滚
- `AC-10`: 目标状态幂等、唯一关系、并发和缓存计数
- `AC-11`: 列表、筛选和计数范围
- `AC-12`: 软删除过滤和稳定相邻顺序
- `AC-13`: 认证失败与临时故障区分
- `AC-14`: 日志与客户端错误脱敏
- `AC-15`: 数据模型和成功响应兼容
- `AC-16`: 客户端可写字段白名单
