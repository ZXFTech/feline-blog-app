# 0019 设计依据

## Context

项目为单仓库 Next App Router、React、TypeScript、Prisma/PostgreSQL 应用。关联 scope 为条目 34，项目采用 Tracer Bullet，本项按 GA 审查。设计基线为 `c3a421bee98bd606afa4af118078ca93719810d3`；2026-11-04 已 fetch，HEAD 不落后 origin/master。本轮未开发、安装依赖、连接数据库或操作实际账号。

操作者最终明确：默认没有旧账号，不考虑账号迁移、关联、认领或维护者审核；采用 SDK 标准本地会话，开放新博客用户。`zxf_tech@outlook.com` 的业务数据先备份，新认证完成后通过数据库操作恢复；无 User 归属的日常/健身、动作库和 Prompt 表全部纳入备份。其他旧账号及数据不纳入此次工作，也不删除。

操作者接受停机，选择统一模型、同一 Prisma 客户端与连接池，选择中心邮箱快照并确认昵称。首位 ROOT 使用维护 CLI 一次性初始化，明确允许将该指定新账号提升 ROOT。上述数据关系已确认。该方向取代早先“保留所有旧账号并审核关联”的 scope 内容，以及独立认证 schema 候选建议。

实际来源、目标、issuer、HTTPS、Client 和账号当前状态均未读取或推断。数据恢复仅是设计，尚无已完成备份。源码中的旧认证用户模式、密码、会话及运维合同仍存在，不代表最终方案需要兼容它们。

## Options considered

| 选项 | 收益 | 代价与判断 |
| --- | --- | --- |
| 统一标准 User/Session/Account/Verification，官方 Prisma adapter | 一个客户端、连接池和迁移链；新用户可直接使用本地认证 ID 作业务 ID | 需调整 User/Session 与权限，接受维护窗口；操作者已选定 |
| 同库独立认证 schema，SDK 走 pg | 保留旧业务模型，减少模型名冲突 | 两个连接入口，额外 schema 权限/重放/导出规则；在最终全新账号前提下不必要 |
| 独立认证数据库或独立 Prisma client | 更强独立生命周期，可保留旧命名 | 配置、连接、生成和迁移管理更多，不符合此次简化目标 |
| 保留全部旧登录和账号关联流程 | 可继续服务原身份 | 与操作者最终决定冲突，维护两套合同且增加认领风险，不采用 |

## Rationale

原项目 User 有 username、role、业务关系，但缺少 Better Auth 标准的 name/emailVerified 等字段；旧 Session 使用 sessionToken/expires。固定 SDK 没有透传模型名配置，固定 Prisma adapter 根据 delegate 名访问数据库。因此保留原结构时，隔离存储是合理候选。

操作者随后允许空账号前提和停机重建，原结构兼容已非目标。让现有 User/Session 成为标准模型的超集，可直接提供官方 adapter 需要的 user/session/account/verification delegate。模型名和运行合同明确后，无需第二个 Prisma client 或 pg 运行连接。业务资料完成标记区分“中心已登录”和“可使用博客”，默认角色以及维护 CLI 分离避免邮箱自动成为提权依据。

指定业务数据只以离线导出、核验、恢复方式进入新账号，源用户 ID 仅用于恢复所有权，不能据此建立旧认证关联。源库不删除，新目标保持维护状态，恢复工具不直接覆盖新 User 行或认证存储。单账号数据的可归属表与无归属共享表显式分开，避免把全表导出伪称为按用户过滤。

## 代码证据

| 来源 | 设计约束 |
| --- | --- |
| `prisma/postgres/schema.prisma` | User/Session 现有字段、业务 FK、角色及共享表范围；删除 User 会对多项业务数据产生级联影响 |
| `20261015000000_user_center/migration.sql` | 旧 User CHECK、不可逆 guard 和身份/会话结构；需要新增迁移处理，不能仅改 TypeScript |
| `scripts/auth/permissions.sql` | 旧运行角色没有任意创建 User 或提升角色权限；不能重放旧 ACL 覆盖新配置 |
| `src/lib/auth/userAuth.ts`、`src/lib/server/actionResult.ts` | 统一角色与失败类别的消费边界可保留，身份来源要替换 |
| `docs/database/README.md`、`prisma.postgres.config.ts` | 单一 PostgreSQL migration 链、dev/shadow/verify 和维护身份边界 |
| `docs/integration/sdk/README.md` 与归档公开声明 | SDK 标准会话、公开路由、只读 resolver、authUserPolicy、错误与 doctor 边界 |

## 交付与版本证据

从可信附件固定摘要核验的交付根为 `C:\Users\Feline\Desktop\vibeCoding\user-center`，只读使用文档、完整独立样例及公开归档，不依赖中心私有源码、数据库或历史账号。

| 文件 | 已核验 SHA256 |
| --- | --- |
| SDK 0.1.4 tgz | `52baddaae186bd7fd797e169324dbd1804de5b7d32595e4e789adc86f793c8e1` |
| CLI 0.1.4 tgz | `a25bb4ac5691e7d77bb0ae6069d880df5846a2c0de461fe7e804b627965d952d` |
| release-manifest.json | `c2d8f41c7c3353efb90836903dc18345510a1c5d71d745f621574b0d60161f80` |

SDK 精确 peer 为 Better Auth 1.7.12；manifest 的 realIntegrationStatus 为 NOT_RUN，M2 仍未真实验收。交付方本地 66/66 和四项修复 Approve 不计作本项目测试。包没有公开分发许可，私有制品消费与 CI 获取路径需落实。

本机先前观测为 Node 24.19.0、pnpm 实际返回 12.15.0，固定 pnpm 解析曾因镜像 DNS 失败。实施前对齐项目 Node 22.21.1、pnpm 10.28.1，不能用当前 shell 的版本声明候选组合通过。

## References

本轮只核验决策所需的官方来源，没有读取中心私有协议实现。固定版本源码支持适配器接口判断；当前官方指南不代替固定组合的实际回归。以下链接供人工查阅，后续设计复核和开发无需重复抓取。

1. [Better Auth v1.7.12 Prisma adapter](https://raw.githubusercontent.com/better-auth/better-auth/v1.7.12/packages/prisma-adapter/src/prisma-adapter.ts)：适配器配置和 Prisma delegate 访问行为。
2. [Better Auth Prisma adapter](https://better-auth.com/docs/adapters/prisma)：公开导出与 ORM 管理 schema/migration 的方式。
3. [Better Auth Database](https://better-auth.com/docs/concepts/database)：核心表及程序化迁移边界，getMigrations 不用于 Prisma adapter。
4. [Prisma v7 database mapping](https://www.prisma.io/docs/orm/v7/prisma-schema/data-model/database-mapping)：数据库表映射不等于 delegate 改名。
5. [Prisma v7 PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql)：类型映射参考。

## 本轮实际检查

只进行代码、交付物、固定公开接口与官方资料核对，并生成设计文档。未运行 SDK/doctor、lint/build/Vitest/Playwright、认证、源数据导出、目标迁移、ROOT 初始化或恢复。规划中的命令名称是拟新增宿主工具，不表示当前 package.json 已提供这些入口。

## 独立复核，2026-11-04

操作者选择另一模型只读复核。复核者为 GPT-6 Astra，读取三份规格、项目规则及必要的本工程模型、迁移、权限和身份代码；没有联网、读取真实环境或中心私有源码、写文件、运行应用或操作数据库。下面保留首次发现，操作者随后明确采纳全部建议，主代理已更新实施合同与验收合同。

**首次结论：暂不定案。** 统一 Prisma 模型、全新账号、维护 CLI 初始化及离线数据恢复方向可以保留。前四项为实施前需关闭的合同缺口，其余为应明确的数据细节。未执行的本轮验收不作为缺陷。此结论保留初次检查时点，当前修订核对结果见下文。

| 项目 | 首次发现 | 操作者已采纳的修订 |
| --- | --- | --- |
| P1 标签关联闭包 | 只导出两端都在范围的标签边，会过滤掉跨范围关系而不一定产生 FK 错误 | 先扫描所有触及所选 Blog/Todo/Tag 的边；任一端越界则记异常并拒绝 complete，不静默筛掉 |
| P1 恢复状态衔接 | 收据写入没有明确同事务更新 restoreRunId/revision，也未明确状态行锁 | 恢复与收据、状态绑定在同一事务完成；统一锁顺序，重放先核对已完成收据再判断目标非空 |
| P1 验收与开放顺序 | 门禁禁止业务操作，又要求先完成被门禁禁止的真实业务验收 | 开放前验证认证/ROOT/只读恢复结果和隔离环境业务演练；开放后执行真实业务冒烟，失败先停止流量而不自动重放备份 |
| P2 维护计划合同 | TTL、摘要覆盖范围、已应用计划标识和验收引用的持久字段未定义 | 统一计划 envelope，15 分钟有效；明确目标/代次/revision/对象/完整输入及时间；保存命令计划 digest 和开放验收引用。摘要用于识别和防误改，维护凭据才是授权来源 |
| P2 邮箱快照生命周期 | SDK 管理的 User.email 与用户确认的业务邮箱快照未区分 | 增加独立的确认快照及确认时间，setup 从服务端 identity 写入；明确重确认和 SDK 资料更新规则，bootstrap 核对当前认证邮箱与确认快照 |
| P2 用户资料历史映射 | 源 User.createdAt/updateAt 与新认证时间发生语义冲突，恢复昵称覆盖新昵称也未明确 | 单列业务创建/更新时间保存旧业务历史，认证时间保持新值；逐列列出映射，恢复旧昵称的变化必须进入恢复计划 |
| P2 健身逻辑引用 | WorkoutItem.exerciseId 没有数据库 FK，仅校验 FK 不能发现缺失 Exercise | 将该逻辑边纳入导出完成与恢复后校验，缺失即停止，不扩大为健身模型重构 |

### 修订后的只读核对

用户明确选择“采纳建议，更新设计草案”。同一独立模型随后只读重新检查 index.md 与 verify.md，确认原 7 项全部覆盖，未发现本次修订范围内仍阻止定案的矛盾，建议接受修订草案。此复验没有写文件、联网、运行应用、数据库或测试，也没有扩大至代码实现复审。

| 原发现 | 已落实位置 |
| --- | --- |
| 标签闭包及健身逻辑引用 | index 的“备份与恢复”、verify 的“指定业务数据备份与恢复” |
| 收据、状态与 revision 原子衔接 | index 的恢复事务及“维护计划与幂等合同”，verify 的故障注入/并发用例 |
| 开放前后验收划分 | AC-10、初始化与开放状态、verify 的 ROOT/维护与目标冒烟步骤 |
| 统一计划与持久字段 | 存储模型表、“维护计划与幂等合同”、Value sourcing 与计划边界验证 |
| 邮箱快照生命周期 | User 的确认快照/时间、“注册与业务授权”、bootstrap 一致性条件 |
| 用户资料历史映射 | 独立业务时间字段、源 User 逐列白名单、昵称覆盖差异及恢复验证 |

复核完成时规格仍为 Proposed，修订采纳和复核本身不代表操作者已确认，也不代表已开发或通过真实验收。

### 操作者最终确认

2026-11-04，操作者选择“确认设计，保持不开发”。设计内容已定案，scope 条目 34 登记实施里程碑并完成设计勾选；功能尚未实现，关联规格按生命周期仍为 Proposed。确认不授权开发、停机、数据备份/恢复、迁移、生产资源创建或部署，本轮没有执行这些操作。
