# 0005. 接口安全与健壮性契约

**Date**: 2026-09-05
**Status**: Accepted

## Summary

所有 Route Handler 和 Server Action 使用同一套输入、身份、权限、结果和日志规则。公开文章保持公开，私人工作台只允许 ROOT 访问。修复保持现有成功数据结构，避免敏感字段、跨用户数据、重复计数和临时故障误判。

## Requirements

**User stories**:

- 作为公开读者，我希望读取文章时只收到公开信息。
- 作为 ROOT，我希望私人工具只访问我的数据，并在失败后得到可行动的提示。
- 作为维护者，我希望同类错误具有稳定状态，重试不会破坏数据。

**Acceptance criteria**:

- **AC-1**: 公开博客列表和详情不返回密码哈希、邮箱及其他未明确允许的用户字段。
- **AC-2**: 日常记录的读取和写入以及 Prompt 保存仅允许有效 ROOT 用户，未登录返回 `unauthenticated`，非 ROOT 返回 `forbidden`。
- **AC-3**: Todo、Tag、Blog 编辑和 Pomodoro 不再回退到 `testUserId`，资源读取和写入均使用当前用户与资源归属条件。DailyStat 和 Prompt 是所有 ROOT 共享的私有资源，因为当前表没有用户归属字段。
- **AC-4**: 公开文章读取不要求登录；点赞和收藏状态仅在登录后按当前用户计算，未登录时均为 false。
- **AC-5**: Server Action 使用统一判别联合表达 `success`、`unauthenticated`、`forbidden`、`invalid_input`、`not_found`、`conflict` 和 `temporary_failure`，并保持现有成功数据字段兼容。
- **AC-6**: Route Handler 将输入、身份和业务失败映射为 400、401、403、404、409、503，未知错误返回 500；响应不包含数据库错误和堆栈。
- **AC-7**: 邮箱去除首尾空格并转小写；用户名、标题、Todo 和标签去除首尾空格；正文不改写；空白、错误类型、畸形 JSON、非法枚举和无效日期返回 `invalid_input` 或 400。
- **AC-8**: 邮箱最多 254 字符，密码最多 128 字符，用户名最多 50 字符，文章标题最多 191 字符，Todo 最多 500 字符，标签最多 50 字符，Prompt 内容不得超过数据库字段能力。
- **AC-9**: 文章或 Todo 与标签的多步骤写入在一个 Prisma 事务内完成，失败时不留下孤立标签或部分关系更新。
- **AC-10**: 点赞、收藏、Todo 软删除和番茄事件按目标状态幂等；重复请求不重复改变计数，不产生重复关系，也不会把计数降为负数。并发相反操作的最终状态以最后提交的事务为准。
- **AC-11**: Todo 列表使用当前筛选条件，`total` 表示当前 ROOT 的全部未删除 Todo 数，`finished` 表示其中已完成的数量；博客总数与列表使用相同的内容搜索和软删除条件。
- **AC-12**: 文章详情和相邻文章忽略软删除记录；相邻顺序按 `(createdAt, id)`，`prev` 是最近的更早文章，`next` 是最近的更新文章。
- **AC-13**: 认证失效与数据库临时故障保持可区分，番茄同步只把真实认证或输入失败标记为不可重试。
- **AC-14**: 日志只记录操作名、错误类别、资源 ID 和用户 ID，不记录密码、令牌、正文、完整请求体或数据库内部错误给客户端。
- **AC-15**: 本次不新增数据库实体、字段、分页或查询量限制，并保持现有界面主流程和成功响应字段兼容。
- **AC-16**: 公开注册只接受 email、password 和 username，角色固定由服务端写为 USER；归属、计数、时间戳和权限字段均由服务端控制。

## Decision

**Chosen option**: 统一结果契约并原地修复现有接口

采用共享的输入校验、认证授权、结果状态、错误映射和脱敏日志边界。现有接口在同一功能改动中迁移，数据库结构保持不变。

**Implementation skills**: `prisma-orm-v7-skills` (`gocallum/nextjs16-agent-skills`, `.agents/skills/prisma-orm-v7-skills/`)

## Standard definition

**Canonical result**:

```ts
type ActionResult<T> =
  | { status: 'success'; data: T }
  | { status: 'unauthenticated'; message: string }
  | { status: 'forbidden'; message: string }
  | { status: 'invalid_input'; message: string; fields?: Record<string, string> }
  | { status: 'not_found'; message: string }
  | { status: 'conflict'; message: string }
  | { status: 'temporary_failure'; message: string };
```

现有领域需要额外成功状态时可以扩展成功分支，例如番茄记录的 `created` 和 `already_exists`。失败状态及含义保持一致。

**Canonical server flow**:

```ts
export async function updateResource(input: unknown): Promise<ActionResult<ResourceView>> {
  const parsed = parseResourceInput(input);
  if (!parsed.ok) return { status: 'invalid_input', message: '输入内容无效' };

  const auth = await resolveCurrentUser();
  if (auth.status !== 'success') return auth;
  if (auth.data.role !== Role.ROOT) return { status: 'forbidden', message: '没有权限' };

  try {
    const resource = await db.resource.update({
      where: { id: parsed.data.id, userId: auth.data.id },
      data: pickAllowedFields(parsed.data),
    });
    return { status: 'success', data: toResourceView(resource) };
  } catch (error) {
    logger.error('updateResource failed', safeErrorContext(error, auth.data.id));
    return { status: 'temporary_failure', message: '暂时无法保存，请稍后重试' };
  }
}
```

**Replaces**:

- String exceptions built by concatenating raw Error values.
- Direct Prisma records returned without an explicit public or private projection.
- Optional user IDs and `testUserId` fallback inside production data operations.
- Multi statement writes split across `Promise.all` and later parent mutations.
- Create or delete interaction logic that treats a repeated target state as an error.

**Public projections**:

- Blog 作者只允许 `id`、`username` 和 `avatar`。
- 其他用户字段默认不公开，新增公开字段必须显式加入投影。
- Server Action 更新数据前从运行时输入中挑选允许字段，不把输入对象直接展开给 Prisma。

**Writable field allowlist**:

| Operation             | Client writable fields                                                      | Server controlled fields                                  |
| --------------------- | --------------------------------------------------------------------------- | --------------------------------------------------------- |
| Register              | `email`, `password`, `username`                                             | `id`, `role = USER`, `createdAt`, `updateAt`              |
| Create or update Blog | `title`, `content`, `tags`                                                  | `id`, `authorId`, timestamps, counters, soft delete state |
| Create or update Todo | `content`, `finished`, `tags`                                               | `id`, `userId`, timestamps, soft delete state             |
| Update DailyStat      | `date`, `typingCount`, `stepCount`, `workouts`                              | IDs, timestamps and relationships                         |
| Save Prompt           | prompt item `originId`, `content`, `mark`; platform from the supported enum | database ID and any future ownership fields               |
| Update Pomodoro       | `summary` only                                                              | `id`, `userId`, event fields, durations and timestamps    |

**Authentication and authorization**:

- `resolveCurrentUser` 区分无令牌、无效令牌、用户不存在和数据库临时故障。
- 日常记录读取和写入、Prompt 保存、Todo 与 Tag 操作只允许 ROOT。DailyStat 与 Prompt 是所有 ROOT 共享的私有资源，本次不承诺多个 ROOT 账号间的数据隔离。
- Prompt 没有公开或客户端读取接口。
- Blog 创建和编辑只允许 ROOT，编辑查询同时包含文章归属条件。
- 公开 Blog 读取不使用固定用户，也不要求登录。
- 点赞和收藏需要登录，关系只属于当前用户。

**Validation and normalization**:

- 所有服务端入口在认证和数据库调用前验证运行时类型。
- 字符串按 AC-7 和 AC-8 规范化和限制。
- ID 必须为对应格式的正整数或非空字符串。
- 日期必须是严格有效的 ISO 日历日期或带明确时区偏移的 ISO 时间，禁止自动滚动无效日期；范围必须满足开始早于结束。
- `orderBy`、`countBy`、角色和状态只接受明确枚举。
- Route Handler 捕获 JSON 解析错误并返回 400。
- 字符长度按 Unicode code point 计算。Prompt `content` 使用 UTF-8 字节长度且不得超过 65,535 字节，以匹配 MariaDB `TEXT`。
- 可选字段缺失表示不修改，`null` 仅在目标字段明确可空时接受，空字符串按该字段的必填规则处理。
- 新注册和登录查询都使用规范化邮箱。实现前确认现有 email 列的大小写比较规则；若旧的混合大小写邮箱无法匹配，停止并提出单独的数据迁移，不在本次静默改写账号。

**HTTP mapping**:

| Result              | HTTP status           |
| ------------------- | --------------------- |
| `success`           | 200，创建操作可用 201 |
| `invalid_input`     | 400                   |
| `unauthenticated`   | 401                   |
| `forbidden`         | 403                   |
| `not_found`         | 404                   |
| `conflict`          | 409                   |
| `temporary_failure` | 503                   |
| 未分类异常          | 500                   |

**Failure classification**:

| Condition                                                 | Server Action                   | Route Handler |
| --------------------------------------------------------- | ------------------------------- | ------------- |
| Missing, invalid or deleted user credentials              | `unauthenticated`               | 401           |
| Authenticated user lacks required role                    | `forbidden`                     | 403           |
| Owned resource is absent or belongs to another user       | `not_found`                     | 404           |
| Invalid input or malformed JSON                           | `invalid_input`                 | 400           |
| Unique conflict with different immutable content          | `conflict`                      | 409           |
| Known connection, timeout or transaction retry exhaustion | `temporary_failure`             | 503           |
| Unexpected programming or invariant defect                | throw sanitized framework error | 500           |

**Data model**:

| Entity                    | Ownership and relationships                           | Contract                                                                  |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------- |
| User                      | owns Blog, Todo, Tag, interactions and PomodoroRecord | identity comes from verified JWT plus live user lookup                    |
| Blog                      | `authorId` references User                            | public read uses safe projection; mutation checks ROOT and ownership      |
| Todo                      | `userId` references User                              | ROOT private read and write with identical query scope                    |
| Tag                       | `userId` references User                              | ROOT private access; preserve unique `userId + content`                   |
| DailyStat                 | global unique date in current schema                  | shared by all ROOT accounts, ROOT private read and write                  |
| Prompt                    | no user relation in current schema                    | shared by all ROOT accounts, ROOT only write, no read surface             |
| BlogLike and BlogFavorite | relate Blog and User                                  | preserve unique `blogId + userId`; target state is idempotent             |
| PomodoroRecord            | `userId` references User                              | preserve unique `userId + eventId`; retry classification remains explicit |

**Transactions and idempotency**:

- Tag upsert, parent write and join replacement execute in one interactive Prisma transaction.
- BlogLike and BlogFavorite relation rows are authoritative. Each target state operation runs in a serializable transaction for the Blog, changes the relation if needed, recounts authoritative rows, and writes the cached counter before commit.
- Retry a serialization conflict for the complete transaction at most twice, then return `temporary_failure`. The response reports the state and count at that transaction's commit. For opposing concurrent requests, the last committed transaction defines the final state.
- Removing an absent relation and deleting an already soft deleted Todo return the requested final state.
- Unique constraint conflicts caused by concurrent target state requests resolve by reading the final state rather than exposing a database error.

**Logging**:

- Log operation name, stable error category, resource ID and user ID when known.
- Do not log password, JWT, cookie, email credential payload, article or Prompt content, complete request body, or raw response body.
- Raw Error values are passed only through a named serializer that emits an allowlist of error class, stable code and sanitized stack frames. It must remove message, cause, query and submitted values before logging.

**Enforcement**:

- A shared TypeScript result type and exhaustive switch helper provide compile time coverage for Server Action callers.
- Shared input parsers and safe projection functions centralize runtime boundaries.
- Tests assert public response keys, ownership filters, result variants, HTTP mapping, transaction rollback and idempotent retries.
- Existing lint, typecheck and build gates remain in force. No new linter or library is added.

**Rollout**:

One coordinated code change, ordered as Tracer Bullet slices. Establish the shared contract, move one complete public and private path first, then move the remaining actions while keeping each slice runnable. No database migration is required.

**Exceptions**:

- Public Blog reads may return success without a user.
- Domain specific success states may extend the common success branch.
- No exception may bypass runtime validation, safe projection, ownership checks on private data, or log redaction.

## Value sourcing

| Action                   | Value produced or displayed                | Source                                                                        |
| ------------------------ | ------------------------------------------ | ----------------------------------------------------------------------------- |
| Login and register       | normalized email                           | validated request email, trimmed and lowercased                               |
| Authentication           | current user and role                      | token cookie claims confirmed by User lookup                                  |
| Public Blog read         | article and public author                  | Blog row plus explicit User projection                                        |
| Blog interaction state   | liked and favorite flags                   | current user ID plus unique interaction rows; false without a user            |
| Todo and Tag operations  | owner scope                                | authenticated ROOT user ID                                                    |
| Daily operations         | access decision                            | authenticated live User role                                                  |
| List totals              | total and finished counts                  | the same Prisma where object used by the visible list                         |
| Adjacent Blog navigation | previous and next article                  | current article timestamp and ID plus visible Blog filter and stable ordering |
| Error response           | result status and safe message             | parser, auth result, known Prisma code, or unknown failure fallback           |
| Log context              | operation, category, resource and user IDs | server operation and already validated identifiers                            |

## Interface inventory

Compatibility means existing successful domain fields remain inside the returned `data`. Callers migrate from direct values or thrown strings to the common result envelope. Existing `actionResponse` keeps its current HTTP JSON envelope.

| Surface                   | Input source                        | Access                     | Success data source                              | Failure contract                           |
| ------------------------- | ----------------------------------- | -------------------------- | ------------------------------------------------ | ------------------------------------------ |
| `POST /api/auth/register` | register parser                     | public                     | safe projection of created User                  | HTTP mapping table                         |
| `POST /api/auth/login`    | login parser                        | public                     | safe projection of matched User                  | HTTP mapping table                         |
| `POST /api/auth/logout`   | none                                | public                     | null                                             | HTTP mapping table                         |
| `GET /api/auth/me`        | token cookie                        | optional auth              | safe live User projection                        | HTTP mapping table                         |
| `GET /api/blog`           | search and order parser             | public                     | Blog list, tags and safe author projection       | HTTP mapping table                         |
| `GET /api/tag`            | count and order parser              | ROOT                       | Tag projection and relation counts               | HTTP mapping table                         |
| Blog actions              | Blog input parsers                  | public read, ROOT mutation | existing Blog views from explicit Prisma selects | `ActionResult`                             |
| Todo actions              | Todo input parsers                  | ROOT                       | existing Todo views and defined totals           | `ActionResult`                             |
| Tag actions               | Tag input parsers                   | ROOT                       | existing Tag views                               | `ActionResult`                             |
| Daily actions             | strict date and DailyStatus parsers | ROOT                       | existing DailyStat view                          | `ActionResult`                             |
| Prompt save               | prompt list and platform parser     | ROOT                       | existing completion data                         | `ActionResult`                             |
| Pomodoro actions          | existing Pomodoro parsers           | authenticated owner        | existing record and history views                | domain success states plus common failures |

`created` maps to HTTP 201 if exposed through HTTP. `already_exists` maps to HTTP 200 and returns the immutable stored record.

## Retry disposition

| Result                                         | Client disposition                                                           |
| ---------------------------------------------- | ---------------------------------------------------------------------------- |
| `success`, `created`, `already_exists`         | acknowledge and remove queued work                                           |
| `invalid_input`, `forbidden`, `not_found`      | reject the item and show a safe actionable message                           |
| `unauthenticated`                              | pause synchronization and ask the user to log in again                       |
| `conflict`                                     | pause that item and retain both local input and server record for resolution |
| `temporary_failure`, network failure, HTTP 500 | retry with the existing bounded backoff                                      |

Pomodoro `eventId` is generated once by the existing client event creation flow, persisted in the local outbox and reused unchanged for every retry. The same ID with identical content returns `already_exists`; the same ID with different immutable content returns `conflict` and the original server record.

For an optional authentication lookup on a public Blog read, an absent, invalid or deleted user token is treated as anonymous. A transient live user or interaction lookup failure returns `temporary_failure` rather than reporting false interaction state.

## Critical test scenarios

- Public article JSON contains only allowed author keys, verifies **AC-1**.
- Anonymous and USER access to Daily and Prompt operations is denied, ROOT succeeds, verifies **AC-2**.
- Two users cannot read or mutate each other's Todo, Tag, Blog mutation or Pomodoro records; DailyStat and Prompt remain shared among ROOT users, verifies **AC-3**, **AC-4**.
- Every result variant is handled exhaustively and maps to the expected HTTP response, verifies **AC-5**, **AC-6**.
- Malformed JSON, wrong runtime types, whitespace only values, invalid dates and every maximum boundary return stable validation results, verifies **AC-7**, **AC-8**.
- Parent write failure rolls back tag creation and relation changes, verifies **AC-9**.
- Concurrent repeated like, favorite, delete and Pomodoro requests reach one final state with correct counts, verifies **AC-10**.
- Concurrent opposing like and favorite operations serialize, return their committed states and leave cached counts equal to relation counts, verifies **AC-10**.
- Filtered and soft deleted records produce matching lists and totals, verifies **AC-11**.
- Deleted articles never appear in details or adjacent navigation and ties remain deterministic, verifies **AC-12**.
- Database lookup failure remains retryable while invalid authentication stops retry, verifies **AC-13**.
- Captured logs and client messages contain no forbidden fields or database details, verifies **AC-14**.
- Existing success consumers continue to receive their current data fields, verifies **AC-15**.
- Registration ignores or rejects client supplied role and server controlled fields, verifies **AC-16**.
- Synthetic errors containing password, token, article content and nested causes are removed by the log serializer, verifies **AC-14**.

## Build plan

- [x] Define the shared result types, runtime validation helpers, HTTP and failure mapping, writable field allowlists, safe projections and sanitized logger, then migrate registration plus one public Blog read and one ROOT private read as the first complete thread, satisfies **AC-1**, **AC-2**, **AC-4**, **AC-5**, **AC-6**, **AC-7**, **AC-8**, **AC-13**, **AC-14**, **AC-15**, **AC-16**.
- [x] Migrate Blog, Todo, Tag, Daily and Prompt reads and writes to current user scope, ownership conditions and compatible success views, satisfies **AC-2**, **AC-3**, **AC-4**, **AC-5**, **AC-11**, **AC-12**, **AC-15**.
- [x] Move tag plus parent mutations into transactions and make interaction, soft delete and Pomodoro retries target state idempotent, satisfies **AC-9**, **AC-10**, **AC-13**.
- [x] Add focused route, action and data boundary tests, then run lint, build, Vitest and the affected authenticated Playwright flows, satisfies **AC-1** through **AC-16**. Database integration coverage verifies ownership, rollback, concurrent interaction counts and live HTTP boundaries with isolated test data.

## Migration plan

**Strategy**: Fix in place through one coordinated code change. The successful response fields remain compatible, so no parallel API version or data migration is needed.

**Phases**:

1. Add shared contracts and move one public Blog path plus one ROOT private path to prove the full boundary.
2. Move the remaining routes, actions and callers, then remove the `testUserId` runtime fallback from production paths.
3. Run focused regression tests and the affected browser flows before release.

**Rollback**: Revert the coordinated code change. There is no schema or stored data transformation to reverse.

**Risks**: A caller that still expects thrown strings may fail to display an error, and an ownership filter may expose an empty state where old fixed user data was previously shown. Exhaustive result handling and authenticated browser checks guard both cases.

## Consequences

**Positive**:

- Callers can distinguish user action from retryable infrastructure failure.
- Public and private data boundaries become explicit and testable.
- Concurrent retries no longer corrupt relationship counts or leave partial data.

**Negative and tradeoffs**:

- Existing Server Action callers require coordinated result handling changes.
- A single migration change touches several domains and needs focused regression testing.
- No pagination is added, so large Todo and Tag result sets remain future work.

**Neutral**:

- No database migration, dependency or new environment variable is required.
- Audit storage and external monitoring remain under the separate monitoring scope item.

## Follow-up

- [ ] Revisit pagination only after real result sizes show a problem.
- [ ] Design audit persistence and external error monitoring with scope item 14 rather than coupling it to this repair.

## Rationale

Reasoning and options: see [rationale.md](rationale.md).
