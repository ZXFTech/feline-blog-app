# 0018. User Center SDK 0.1.4 接入可行性评估

**Date**: 2026-11-04
**Status**: Proposed
**性质**: 仅评估，未定案，不是可直接执行的开发规格。

后续操作者已选择全新账号、统一 Better Auth/Prisma 模型、维护 CLI 初始化指定 ROOT，以及单账号业务数据备份恢复。最新设计见 [0019](0019-user-center-sdk-rebuild/index.md)，下文保留前期评估的历史前提，不作为旧账号迁移或独立认证 schema 的实施要求。

## Summary

SDK/CLI 0.1.4 的交付物齐全，三个指定文件的 SHA256 与操作者提供的 prompt 一致。项目的 Next、React、Prisma 和 CI 工具链与候选 M2 对应，具备开展本地试接的基础，但 M2 尚无真实通过记录。

在保留现有认证合同的前提下，当前不建议直接替换。项目要求中心用户逐请求在线核验、版本匹配、浏览器会话撤销和退出后重新认证，SDK 的公开合同尚不能覆盖这些要求。

操作者随后提出替代假设：放弃博客现有认证流程，将其视为没有认证能力的宿主。若同时接受 SDK 的标准本地会话语义，则从零接入在方案上可行，旧流程兼容不再是前置条件。既有业务账号、角色和数据的关联，以及真实接入验收仍需完成，详见下方替代前提评估。

本轮只创建分支和本评估记录，没有安装依赖、编写接线、迁移数据库、运行 doctor 或真实认证。

## Context

操作者要求从本地 `master` 切出新分支，根据附件 prompt 评估方案，先不开发。评估基线为 `c3a421bee98bd606afa4af118078ca93719810d3`，分支为 `codex/user-center-sdk-0.1.4-feasibility`。开始时工作树干净。本地 `master` 与缓存的 `origin/master` 指向相同提交，本轮未 fetch，不能据此声明远端当前状态。

目标工程为 `C:\Users\Feline\Desktop\vibeCoding\feline-blog-app`。从相邻目录发现候选交付根 `C:\Users\Feline\Desktop\vibeCoding\user-center`，其目录布局与附件要求相符，产物摘要也相符。仅读取指定交付文档、完整独立样例及发行归档中的公开声明、元数据和许可证，没有使用中心私有实现、中心数据库、历史账号或真实环境文件。

现有认证规则以根 `AGENTS.md`、`src/AGENTS.md`、`docs/auth/user-center.md` 和实际代码为准。已有业务 User ID、角色和数据归属必须保留。此次评估不修改这些规则，也不将 SDK 候选能力视为已获准改变现有认证语义。

## 替代前提：放弃旧认证，从零接入

**判断：方案可行，且比保留全部旧认证合同的兼容迁移明显简单。** 这里假定采用 SDK 规定的认证和会话行为，保留博客的既有业务用户、角色及数据。操作者的问题属于可行性假设，本轮仍不开发、不删除旧流程、不调整项目规则，也未批准实际切换。

拟采用的职责边界是：User Center 完成身份认证，SDK/Better Auth 在博客维护独立本地会话，博客通过业务用户映射和原有角色、资源归属检查决定访问权限。博客仍需提供自己的服务端认证实例、存储和页面/API接线。

| 原评估关注点 | 在替代前提下的处理 |
| --- | --- |
| legacy JWT、旧密码与旧 Cookie 共存 | 新认证可只接受 SDK 会话，切换时明确使旧登录凭据不再获得访问权，无需维持双轨认证 |
| 固定 POST 回调与旧导航桥 | 新流程直接采用 SDK 派生 Provider 的 GET 回调，使用精确登记的新合同 |
| 逐请求中心 introspection、旧 authVersion 和浏览器 epoch | 若不再要求这些旧机制，便不阻挡 SDK 接入；中心撤销对本地会话即时生效也不属于已证实能力 |
| 退出后强制中心重新输入密码 | 采用 SDK 的平台本地退出合同，中心 SSO 会话可能仍然有效；不能保留原有强制重新认证的产品承诺 |
| 原业务 User ID、ROOT 等角色和数据归属 | 继续保留，在服务端将稳定中心身份映射到原业务用户，页面/API统一使用该结果授权 |
| Prisma 模型占用与认证存储 | 仍需解决，放弃认证流程不代表现有 User/Session 模型或业务数据库自动变为空库 |

如果只放弃旧实现、仍坚持逐请求中心核验及退出后强制新认证等原有行为，原评估的 SDK 能力差异仍然存在。方案是否简化，取决于是否明确采用新的会话合同。

保留业务数据时，推荐先允许建立独立认证用户，再只读解析明确的 `(issuer, subject) → 原业务 User ID` 映射。`allow-new` 是建议，尚未被选定，它不等于允许自动创建业务用户。没有映射时拒绝业务访问并进入明确的关联流程，不能按 email 自动认领。可以评估复用可信的既有身份映射；未绑定旧账号的用户仍需要另行设计关联证明和事务。

只有连业务用户与数据关系也确认为全新平台时，才适合使用样例的 `authUserId` 作为业务 ID 简化方式。放弃旧登录流程本身不满足这个条件，也不授权删除数据。`existing-only` 则需要可信预置 Better Auth 用户/账号，不能因为原业务表有 User 就认为首次登录必然可行。

在该替代前提下，后续最小纵向验证可直接聚焦：可信 HTTPS 与专用 Client、隔离认证存储、SDK 登录及回调、既有业务映射、`/profile` 与安全用户 API、页面/API权限一致、刷新和本地退出。仍需对存储唯一约束、并发关联和退出不明等失败分支单独验证。M2 未验收和真实资源待准备的结论不变。

下文保留原评估的差异盘点。其中要求保留旧认证机制的建议适用于原前提，不应被当作此替代方案的额外要求。正式选择替代方案后，实施规格应同步明确新的认证行为、旧入口停用和旧凭据失效方式，并更新对应项目规则。

## 已核对的交付证据

以下必需资料均存在，已读取：

1. `docs/releases/0.1.4.md`。
2. `docs/integration/sdk/README.md` 与 `support-matrix.md`。
3. 完整 `examples/sdk-next-client/`，包括配置、服务端实例、页面/API、客户端操作及迁移脚本。其 `.env.example` 是空占位模板，未读取真实 `.env`。
4. `docs/reviews/2026-11-04-main-0.1.4.md`。
5. `artifacts/integration/0.1.4/` 中两个 tgz、`release-manifest.json` 和 `SHA256SUMS`。

摘要用 `Get-FileHash -Algorithm SHA256` 计算，并与附件 prompt 的固定值直接比较，没有仅依赖归档旁的摘要文件。

| 文件 | 实际 SHA256 | 结果 |
| --- | --- | --- |
| `user-center-next-better-auth-0.1.4.tgz` | `52baddaae186bd7fd797e169324dbd1804de5b7d32595e4e789adc86f793c8e1` | 一致 |
| `user-center-cli-0.1.4.tgz` | `a25bb4ac5691e7d77bb0ae6069d880df5846a2c0de461fe7e804b627965d952d` | 一致 |
| `release-manifest.json` | `c2d8f41c7c3353efb90836903dc18345510a1c5d71d745f621574b0d60161f80` | 一致 |

发行清单仍为 `realIntegrationStatus: NOT_RUN`。交付方报告的 66/66 本地回归和本地修复 Approve 可作为上游基础证据，本轮未复跑，不计作本项目测试或兼容性证明。

归档声明 SDK 精确 peer dependency 为 `better-auth: 1.7.12`，SDK 要求 Node `>=22`，CLI 要求 Node `>=22.21.1`。SDK 依赖 `server-only@0.0.1` 和 `jose@6.2.13`，没有内嵌第二份 Better Auth。许可证为 `UNLICENSED`，明确没有公开分发许可，后续不能未经确认将 tgz 公开提交或发布。

## 运行时与依赖差异

| 项目 | 本工程实际情况 | 判断 |
| --- | --- | --- |
| 模块与路由 | ESM、TypeScript、Next App Router | 符合候选方向 |
| Node | 当前 shell 为 `24.19.0`，项目要求 `22.x`，CI 为 `22.21.1` | 实施前使用任务级 Node 22.21.1，不改变其他工程默认版本 |
| pnpm | 项目与 CI 固定 `10.28.1`；本机命令实际返回 `12.15.0` | 固定版本解析因 `registry.npmmirror.com` DNS 失败，尚未证明本机工具链一致 |
| Next | 声明及已安装均为 `16.3.3` | 对应 M2，不能照搬样例的 `16.4.3` |
| React / React DOM | 声明及已安装均为 `19.2.4` | 对应 M2，不能照搬样例的 `19.3.0` |
| Prisma / Client / PostgreSQL adapter | 已安装均为 `7.3.0` | 保留 PostgreSQL 业务入口和现有 ORM |
| `pg` | 项目声明 `8.16.3` | 样例为 `8.23.1`，不能把样例存储结论移用至本工程 |
| Better Auth | 未安装，锁文件无该依赖 | 未来显式固定 `1.7.12` |
| SDK / CLI | 未接入，锁文件无该依赖 | 后续只消费核验后的 `0.1.4` tgz |
| `server-only` | 已显式安装 `0.0.1` | 已满足该直接依赖要求 |
| 旧认证依赖 | `openid-client@6.8.8` 与自有认证；`next-auth` 未用于运行时 | 不因加入 SDK 就移除仍在使用的旧认证依赖 |

支持矩阵 M2 的目标是 Node 22.21.1、pnpm 10.28.1、Next 16.3.3、React 19.2.4、Better Auth 1.7.12 和 blog Prisma 7.3，状态仍是 NOT RUN。样例属于另一组候选版本，当前没有已验证组合。

已阅读目标安装版本的 Next Route Handler、Cookie 和服务端/客户端边界指南。后续应使用 Node Route Handler、异步 `headers()`/`cookies()`，在 Route Handler 或 Server Action 中修改 Cookie，并保持认证实现只在服务端。

## 现有工程与 SDK 的关键差异

| 关注点 | 工程现状与证据 | SDK 公开合同与影响 |
| --- | --- | --- |
| 业务鉴权入口 | `src/lib/auth/userAuth.ts` 统一提供 `requireAuth`、Todo/Blog/ROOT 守卫 | SDK `getPrincipal` 必须接入同一业务入口，保留角色和资源归属检查；不能只改登录页 |
| legacy 登录 | `center/session.ts` 只接受当前 `authMode=legacy` 且版本相符的 `token` JWT | 可继续保护未绑定用户；SDK 拒绝、映射缺失或依赖故障后不能尝试旧密码或旧 JWT 来放行 center 用户 |
| 中心在线核验 | `center/session.ts`、`protocol.ts` 每次核验中心 grant 的 active、sub、sid、client、exp、scope；确认失效则撤销本地会话 | SDK 身份读取使用平台 Better Auth 会话和关联账号，没有承诺等价的逐请求中心 introspection；这是直接切换的主要阻碍 |
| 本地版本与撤销 | 数据库核对 `authVersion`、浏览器 epoch、会话撤销及到期；绑定后清空旧密码 | SDK Identity 只有 issuer、subject、authUserId、profile，未提供会话版本快照和浏览器 epoch；仅实时读取当前 User 版本，不能自动证明旧 SDK 会话应失效 |
| 退出后认证 | `center/http.ts`、`flows.ts`、`protocol.ts` 使浏览器旧流程失效，下次要求 `prompt=login`、`max_age=0` 并核验 `auth_time` | SDK 只承诺平台本地退出；公开登录参数仅为 returnTo，没有上述重新认证控制，不能声称语义相同 |
| 会话期限 | 现有本地会话不超过中心 grant 到期时间，并且不静默续期 | SDK 默认 86400 秒，可配置 300 至 86400 秒且禁自动刷新，但未承诺由中心 grant 的 exp/sid 限制本地会话；缩短 TTL 也不能替代在线撤销核验 |
| 协议回调 | 固定 `/api/auth/callback/user-center`，使用 POST `form_post`，现有导航校验也固定 client、回调和传输格式 | SDK 使用由 canonical issuer 完整 SHA256 派生的 Provider ID，仅公开 GET callback；需要新的精确登记及导航适配，不能直接复用旧登记或 POST bridge |
| 既有业务身份 | `UserCenterIdentity` 已按 `(issuer, subject)` 唯一映射到既有 `users.id` | 该映射可供只读 resolver 查询；不能按邮箱认领，不能用 authUserId 替换业务 ID |
| 绑定流程 | legacy 会话、旧密码重验、中心认证、用户确认、事务约束共同完成绑定；转换不可逆 | SDK 不负责业务认领。旧绑定流程依赖旧协议凭据及事务合同，不能只把回调换成 SDK 后继续宣称完整保留 |
| 新用户 | 本地注册及 onboarding 当前关闭 | `allow-new` 只代表可新建认证用户；是否允许新建业务 User 是另一项决策，不能因此打开原关闭入口 |
| 故障与状态码 | 已有 `ActionResult`、`actionResponse` 和匿名/权限/临时故障语义 | 业务映射未完成为 403，匿名为 401，依赖或解析故障为 503；保留错误类别，不能全部转换成登录跳转 |

以上 SDK 判断依据接入指南及归档公开导出对应的 `server.d.ts`、`public.d.ts`，未导入私有实现。它暴露 `getAuth()` 供服务端维护，不表示任意修改返回实例、直接挂原始 handler 或临时拼接 grant 逻辑已属于受支持的接入方案。

## 存储可行性与迁移边界

现有 `prisma/postgres/schema.prisma` 的业务 `User` 映射到 `users`，包含业务角色、用户名、authMode、authVersion 和所有业务关系。旧 `Session` 映射到 `sessions`，字段为 sessionToken、expires 等。它们不能直接当作 Better Auth 所需的 User、Session、Account、Verification 模型使用，现有 `feline_auth_*` 表也不是 Better Auth 存储。

SDK 接受宿主 `database/adapter`，但公开 AuthOptions 没有透传任意 user/session/account 的模型名和字段映射配置。因此，不能仅在主 Prisma schema 新增两个表就假定适配完成，也不能强行复用当前 `User`/`Session`。

建议认证存储与业务模型隔离，优先评估保留 Prisma 7 的独立认证 schema/client。独立 client 仍需保持 PostgreSQL 模式、迁移和生成入口可审阅，不能覆盖现有生成目录或绕过本地数据库工具的目标白名单。这一方案能否仅凭 SDK 和适配器公开接口完成模型映射，需要在实施前验证，当前不作为已确认设计。

备选是由宿主提供隔离认证数据库的 `pg.Pool`，业务继续使用原 Prisma。它接近交付样例，但会引入新的连接生命周期及数据库目标管理要求，不能直接宣称通过 M2 Prisma 适配器验证。最终存储拓扑及适配器尚未选择。

无论选择哪种方式，迁移都需要检查 User 主键、Session token 全局唯一、合法外键、Account `(providerId, accountId)` 原子唯一，以及并发关联冲突失败。保留现有业务映射唯一约束、绑定事务、RLS 和限定运行角色。认证表不能因新建而暴露给 Supabase Data API；维护连接不能进入应用运行进程，运行角色不能拥有迁移或认证清理管理权限。

Prisma 适配器的迁移应走项目自己的 Prisma 流程。样例的 `getMigrations()` 与 pg SQL 不能直接复制为 Prisma 迁移。本轮没有设计最终字段、生成 SQL、检查真实库数据或执行迁移；已有认证历史迁移保持不可变。

## Options considered

| 方案 | 收益 | 代价与结论 |
| --- | --- | --- |
| 保留当前实现，暂不接 SDK | 保持已定义的认证合同 | 不能完成 SDK 接入目标，可作为语义缺口解决前的现状 |
| 隔离本地试接，满足现有安全合同后再切换 | 可逐层验证包、存储、映射、页面和 API，保留业务身份 | 推荐方向；先解决在线核验、撤销和绑定合同，不能只做可点击样例就宣布接入完成 |
| 直接替换认证并迁移全部账号 | 表面上减少双套实现 | 当前不建议，涉及会话、账号和协议变更，缺少资源与兼容证据 |

## Decision

建议采用第二项作为后续讨论方向，当前没有批准实施方案。保持现有认证安全合同，先确认 SDK 是否能通过受支持的公开扩展补足差异；如不能，需向交付方提出明确能力缺口，由后续版本解决。本工程不修改 SDK dist、不自行复制 OAuth 协议实现，也不通过弱化 `AGENTS.md` 来消除不兼容。

认证用户策略建议单独确认：若允许建立独立认证记录，可选择 `allow-new`，同时将没有明确业务映射的身份拒绝为 403。若选 `existing-only`，必须先定义认证用户和 Account 的可信预置流程；已有业务 User 不等于已有 Better Auth 用户，直接选择可能导致首次登录在 resolver 之前被拒绝。两者都不能默认开启业务注册或按 email 自动绑定。

实施时的技能依据为 `prisma-orm-v7-skills`、`supabase-postgres-best-practices` 和 `supabase`。本轮只使用其版本、隔离和权限约定进行评估，不执行资源操作。

## 后续最小纵向验证建议

项目采用 Tracer Bullet。获准开发且关键决策确定后，建议先打通一个真实的现有业务页面与 API，再扩大覆盖范围。

1. 先验证 SDK 在公开接口内如何保留中心在线核验、版本撤销、会话期限和退出后重新认证。如果无法保留，停止切换设计，记录上游缺口。
2. 对齐 Node 22.21.1 和 pnpm 10.28.1，消费已核验的两个 tgz，固定 Better Auth 1.7.12。保留目标 Next、React、ORM 和现有业务数据源。
3. 使用独立路由命名空间试接，例如候选 `/api/auth-sdk`，只挂 SDK 的受控四个表面。最终 authBasePath 及回调须通过 `describeRegistration()` 计算并精确登记；当前没有真实 issuer/origin，未计算登记值。
4. 落实宿主认证存储和只读 `(issuer, subject)` 业务映射。新增认证记录与业务账号认领保持明确边界，绑定必须保留可信证明、用户确认、原子唯一约束及旧密码不可恢复规则。
5. 最小业务目标可选现有 `/profile`，配合现有 `/api/auth/me` 的安全用户投影。候选 fallback 为 `/`，初始允许 query 为空；这些是建议，尚未选择。样例的 `/dashboard`、`/projects` 在本工程没有对应页面，不能直接写进 Manifest。
6. 通过 `userAuth.ts` 统一页面、Server Action 和 API 的业务授权，映射到原业务 User ID 和角色。显式选择认证模式，SDK 的失败分支不得触发旧认证回退；同时存在不同身份 Cookie 时的优先级和退出处理需先定案。
7. 补齐缺配置拒绝、映射未完成/失败/超时、非法 returnTo、服务端模块边界、有限错误码、退出未确认、原 Cookie 重放，以及现有 legacy/center 权限与数据隔离回归。

这份建议不授权执行其中任何开发、迁移、登记或真实认证步骤。新的 SDK 会话不能自动转成旧会话，也不能把旧 Cookie 当作 SDK 已认证结果；切换和回滚需要单独设计，尤其不能回到不认识 center 用户的旧代码。

## 缺少的输入与待决项

| 输入或决策 | 当前状态 | 后续所需 |
| --- | --- | --- |
| HOST_REPO | 已知 | 当前目标工程 |
| DELIVERY_ROOT | 已找到与摘要一致的候选目录 | 后续仅从可信交付物消费，不改中心工程 |
| 实际 issuer | 未指定、未核验 | 包含实际 auth base path，不能默认采用旧生产地址 |
| 平台 HTTPS origin | 未指定、未核验 | 明确域名、受信证书、浏览器可达方式；SDK 不接受 HTTP/localhost/回环平台 origin |
| Client ID 与 callback 登记 | 待准备或确认 | 新 Provider ID、GET 回调和 authBasePath 必须与登记一致；旧 `feline-blog` 值不能自动视为可复用 |
| 认证语义 | 有上述差异 | 保留工程合同所需的公开接口与验收方案 |
| authUserPolicy | 未选择 | 明确 allow-new 或 existing-only，不使用隐式默认 |
| 既有业务映射及绑定 | 已有表和旧流程，SDK 适配未设计 | 只读 resolver、账号认领证明、事务及会话切换方案 |
| 存储拓扑及适配器 | 未选择 | 确认 Prisma 隔离模型可行性或明确选择 pg 备选 |
| 凭据配置位置 | 仓库已有忽略规则，未读取实际文件 | 明确本工程忽略配置路径，Client Secret 与独立 sessionSecret 分开，至少 32 字符 |
| 隔离数据库与迁移范围 | 有本地 Postgres 工具，未检查实例状态 | 确认专用目标、角色、允许写入范围，不复用历史夹具或默认连接共享库 |
| returnTo 与 query | 已提出真实页面候选，未选择 | 最终精确路径、前缀、fallback 和允许 query 键 |
| 依赖交付与 CI 可复现性 | tgz 位于工程外，且无公开分发许可 | 明确可信私有制品获取方式及固定摘要，避免只依赖个人绝对路径 |
| 真实认证资源与授权 | 本轮未提供或核验 | 专用 Client、可信 HTTPS、认证存储、受控邮箱及对应执行授权 |

“未核验”不表示资源一定不存在。本轮没有读取真实秘密或探测中心/数据库来补全这些输入。

## 检查结果与验收状态

| 阶段 | 本轮状态 |
| --- | --- |
| 分支创建 | 完成，从指定本地 master 基线创建 |
| 资料及 SHA256 检查 | 完成，三个文件均匹配附件 |
| 目标代码及公开合同静态评估 | 完成，列出差异和待决项 |
| 评估文档格式 | `node node_modules/prettier/bin/prettier.cjs --check docs/specs/0018-user-center-sdk-feasibility.md` 通过 |
| 本地实现 | 未开始，遵循本轮不开发要求 |
| doctor | 未运行，目标工程尚未安装 CLI 或准备 Manifest；没有可报告的实际 check 状态或退出码 |
| lint、typecheck、build、Vitest、Playwright | 未运行，本轮只有文档评估，没有接线代码或认证夹具 |
| 真实存储、迁移、唯一约束及并发 | 待验，本轮未连接数据库 |
| 真实认证、邮件、刷新和退出 | 待验，本轮未发起认证或发送邮件 |
| 生产及 blog 完整接入验收 | 待验，本评估不构成 M2、MVP 或上线通过 |

后续 doctor 只能记录实际安装 CLI 的实际输出。默认不加 `--network`，具体 issuer 的 Discovery/JWKS 检查需另有明确授权。exit 0 不代表上线通过；registration、storage 和真实接线的 NOT_CHECKED 不能写成已验收。

后续代码验证应运行项目的 typecheck、lint、build、Vitest 和具备安全测试账号配置的 Playwright，并对隔离存储及真实浏览器链路单独留证。仅缺配置或 mock 负例通过时，只能声明对应本地失败分支通过。

## Rationale

框架和发行文件没有发现禁止试接的硬性矛盾，业务身份表也具备可复用的稳定键。主要工作量来自宿主的安全会话合同和既有账号迁移，而非安装 SDK。当前适合进入有明确前置条件的设计讨论，不适合直接把附件实施步骤当作已批准方案执行。

评估交叉核对了 Better Auth 官方的 Prisma 适配器、数据库和会话文档。官方说明 Prisma 模型生成与迁移应由 ORM 流程负责，`getMigrations()` 仅适用于内建 Kysely 适配器。这支持“不直接复制 pg 样例迁移”的判断；官方当前文档仍不能替代固定 1.7.12 与本项目实际组合的验证。参见 [Prisma 适配器](https://better-auth.com/docs/adapters/prisma)、[数据库与迁移](https://better-auth.com/docs/concepts/database)、[会话管理](https://better-auth.com/docs/concepts/session-management)。

Supabase 官方说明暴露 schema 内的表需要同时处理权限授予和 RLS，因此新认证表的隔离与授权属于迁移审阅范围。参见 [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)。本轮 changelog Markdown 地址未能被浏览工具解析，未据此推断其他版本能力。
