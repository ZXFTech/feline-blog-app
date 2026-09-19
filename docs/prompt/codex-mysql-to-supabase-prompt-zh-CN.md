# 工程任务：从 MySQL 渐进迁移到 Supabase PostgreSQL

你是此仓库的资深后端工程师与数据库迁移负责人。请直接检查当前仓库并完成本轮允许的代码、配置、测试和文档修改，不要只输出建议。

## 1. 目标与本轮范围

我要采用分阶段迁移，而不是一次性替换：

1. 先接入 Supabase PostgreSQL，完成连接、Prisma、环境变量、构建、测试及开发约束；现有 MySQL 功能保持可用。
2. 从接入完成开始，新增业务能力和新表使用 PostgreSQL，不再扩展 MySQL 作为新功能的数据源。
3. PostgreSQL 经真实环境验证稳定后，按业务模块及其依赖分批迁移现有 MySQL 数据。
4. 一个模块完成数据核验和正式切换后，该模块的全部业务读写与后续开发只使用 PostgreSQL。
5. 所有模块迁移并验收后，清理 MySQL 的工程与部署残留，最终只保留 PostgreSQL 业务数据库。

本轮只执行“仓库审计 + PostgreSQL 基础接入 + 新开发边界约束 + 测试与文档”。
后续数据迁移和下线流程本轮只制定计划，不执行真实旧数据搬迁、不切换旧模块、不删除旧库。
不要因为阶段一测试通过，就自行宣称系统已稳定或自动开始下一阶段。

## 2. 已知背景：先核对，不盲目假设

此前项目使用 Next.js、TypeScript、pnpm、Prisma 7、@prisma/adapter-mariadb，并部署到 Vercel。
可能存在 src/db/client.ts、prisma.config.mjs、generated/prisma/client、generated/prisma/enums，以及 NextAuth 认证代码。
此前发生过 Prisma 生成文件缺失、构建读取不到 DATABASE_URL、TLS 证书校验错误。
以上仅用于定位；以当前 package.json、lockfile、代码和配置为准。

先阅读 AGENTS.md 及相关目录规则，再检查：
- 实际依赖版本、Node 版本、构建命令、CI、Vercel 配置和未提交修改。
- Prisma schema、配置、迁移历史、生成目录、所有客户端及枚举/类型导入。
- 数据库环境变量的名称与加载优先级，尤其 CLI 与运行时是否使用不同配置。
- 全部数据库访问入口，包括认证、Server Actions、API、后台任务、定时任务、脚本和原生 SQL。
- 实际业务模块、共享实体、关联表、事务边界、删除级联和跨模块依赖。

保留用户已有修改，不做无关重构、自动升级整个技术栈或替换 ORM。
使用仓库锁定版本的 Prisma API；不要执行 prisma@latest 等命令引入未经评估的大版本升级。

## 3. 数据归属：必须遵守的架构规则

采用临时双库共存，但每个业务实体在同一环境、同一阶段只能有一个权威业务写入库。

归属规则：
- 尚未迁移的旧模块：业务读写继续使用 MySQL。
- 全新模块和新表：业务读写使用 PostgreSQL。
- 已切换模块：业务读写只使用 PostgreSQL，不能继续写入旧表。
- 迁移期间向目标库导入数据属于受控迁移操作，不是业务请求双写。

特别注意：
- “后续新功能用 PostgreSQL”不等于“旧模块所有新产生的记录立即改写 PostgreSQL”。
  例如用户模块尚未迁移时，既有注册流程仍将新用户写入其唯一权威库 MySQL。
- MySQL 仅允许必要的旧功能维护和安全修复；不要为新功能新增 MySQL 表或随手扩展旧库字段。
- 新需求需要扩展旧实体时，应安排该业务实体及依赖一起迁移，或设计明确归属 PostgreSQL 的独立扩展实体；不得无计划拆分同一实体的权威数据。
- 本轮遇到这种依赖时记录为后续迁移前置项，不擅自迁移认证或其他共享基础模块。

禁止：
- 业务请求同时写 MySQL 和 PostgreSQL。
- PostgreSQL 报错或查不到数据时自动 fallback 到 MySQL。
- 在 MySQL 与 PostgreSQL 之间声明普通 Prisma relation，或伪装成同一个本地事务。
- 在每个接口中随意判断数据库来源，或用一个全局开关一次切换整个应用。
- 将一个 PrismaClient 通过更换 URL 同时承担两种数据库 provider。

为过渡期建立明确的数据归属清单，按实际环境记录模块、实体/表、读库、写库、依赖、迁移状态、切换证据和待办。不能仅在文档中标记完成而让代码仍走旧库。

## 4. 本轮实现 A：分离 Prisma 和数据库入口

为 PostgreSQL 新增独立 schema、Prisma 配置、生成目录和迁移历史，保留现有 MySQL 对应内容。
不要直接将现有 schema 的 mysql 改成 postgresql，也不要删除、覆盖或在新库执行旧 MySQL migration SQL。

可以采用以下组织方式，或遵循仓库已有结构提供等价实现：
- prisma/postgres/schema.prisma
- prisma/postgres/migrations/
- prisma.postgres.config.ts
- generated/prisma-postgres/
- src/db/postgres/client.ts
- 显式命名的 legacy MySQL 客户端入口

具体要求：
1. 新库使用 provider = "postgresql"，按当前 Prisma 版本接入匹配的 PostgreSQL adapter/driver；若仍为 Prisma 7，使用兼容的 @prisma/adapter-pg 与 pg。
2. 两个客户端及其生成输出互不覆盖；修正必要导入，不靠手写生成文件通过编译。
3. 优先保留旧客户端生成路径，减少对旧模块的机械破坏。
4. 新的默认数据库开发入口只导出 PostgreSQL。旧入口明确标记 legacy/deprecated。
5. 不得把已有 src/db/client.ts 的含义偷偷从 MySQL 换成 PostgreSQL，让未迁移调用方误切库。需要调整旧调用方时，应显式迁到 legacy 入口并验证行为不变。
6. 应用层通过清晰的服务/仓储边界访问数据库，不引入没有实际需要的通用双库 ORM 框架。
7. 每个数据库独立管理客户端与连接池；开发热更新可复用，避免逐请求创建或断开整个 PrismaClient。
8. 避免导入 PostgreSQL 入口时初始化 MySQL，反之亦然。数据库代码不得被客户端组件或不兼容的 Edge 路径引用。
9. 不把 Supabase 的 auth、storage 等托管 schema 纳入应用的 Prisma 迁移管理范围。

PostgreSQL 应拥有可验证的最小初始 schema。不要为了接入而批量复制全部旧业务模型或发明新业务功能。
确实需要模型验证 Prisma CRUD 时，可建立仅内部使用的最小连接探针模型，并说明用途、权限和清理方式。

## 5. 本轮实现 B：环境变量、连接、安全与权限

保留现有 MySQL 环境变量语义，不直接把其 DATABASE_URL 替换为 PostgreSQL。
新库建议使用以下明确名称；已有规范时可调整，但必须给出映射：
- POSTGRES_DATABASE_URL：应用运行时连接。
- POSTGRES_MIGRATION_URL：Prisma CLI / 结构迁移连接。
- POSTGRES_SHADOW_DATABASE_URL：仅在开发迁移确实需要时使用的独立影子库。

要求：
1. 检查并明确本地、CI、Vercel Development/Preview/Production 的环境变量加载方式。测试和 Preview 不得默认复用生产写入库。
2. 运行时与迁移连接必须指向同一目标环境的正确数据库及应用 schema；不同角色权限可以分离。
3. 从 Supabase Connect 面板提供的实际连接信息配置，不根据项目名或 region 猜测 host、用户名或端口。
4. Vercel 服务端运行时优先评估 Supavisor transaction pooler；Prisma migration 使用 direct connection，IPv4 限制下评估受支持的 session pooler。
5. 根据当前 Prisma adapter 与 pg 的实际行为配置连接池上限、连接/查询超时及事务池兼容性。不要机械照抄旧版 Prisma 的 pgbouncer=true、connection_limit 等参数并假定生效。
6. 显式核对 TLS 与证书信任链；禁止用 NODE_TLS_REJECT_UNAUTHORIZED=0、rejectUnauthorized=false 绕过验证。注意 URL 中 SSL 参数与 driver ssl 对象的覆盖关系。
7. 使用专用运行时数据库角色及必要最小权限；结构迁移角色与运行时权限分开评估，不为省事给运行时永久 DDL、CREATEDB 或 BYPASSRLS 权限。
8. 只把连接信息写入未跟踪的本地环境文件或平台 secret。示例文件必须使用占位符，不记录密码、完整连接串、token 或用户数据。
9. 不使用 NEXT_PUBLIC_* 保存数据库连接串、密码或服务端密钥。数据库密码不是 Supabase API key。
10. 更新 .env.example、忽略规则和部署说明。缺少凭证时完成代码并列出缺失变量，不伪造已连接成功。
11. 配置错误需要明确失败，不能静默使用 localhost、测试库或旧 MySQL 作为替代。
12. 影子库不得指向生产库或任何业务数据所在数据库。

本任务只把 Supabase 当作托管 PostgreSQL 使用：
- 保留现有 NextAuth/登录注册、密码哈希、session 和权限逻辑，不顺便迁移 Supabase Auth。
- 不额外接入 Supabase Storage、Realtime 或前端直连数据 API。
- 检查目标项目是否已有 Data API 使用者。未使用时记录关闭 Data API 的设置；需要保留时，应用内部表使用非暴露 schema/最小授权等隔离措施。
- 对必须暴露的表核对 grants 与 RLS，不假定 Prisma 新建的表自动安全，也不假定现有登录 session 会自动传递到 PostgreSQL RLS。
- 需要用户在控制台完成的步骤，输出准确操作清单，标明“尚未完成”，不假装已代为修改。

## 6. 本轮实现 C：构建与可重复验证

新增并真正实现清晰的 pnpm scripts，命名可适配现有规范，但必须区分数据库与操作：
- 生成 PostgreSQL client、生成 legacy client、生成全部 client。
- 校验 schema。
- PostgreSQL 只读连接检查、MySQL 只读连接检查。
- PostgreSQL 开发迁移、部署迁移、迁移状态检查。
- PostgreSQL 显式写入 smoke test。
- 数据库依赖边界检查。

要求：
1. Prisma 命令使用明确的 config/schema，不能误操作另一套数据库。
2. 干净环境下安装依赖并构建时，应先生成两套所需 client，再执行应用构建。
3. 单纯生成 client 不应依赖真实数据库在线；按当前版本正确处理配置加载及缺失环境变量，不给真实运行/迁移伪造默认连接串。
4. 构建、postinstall、应用启动和普通 CI 不得自动执行历史数据迁移、生产写入 smoke test、数据库 reset 或 MySQL 清理。
5. 生产结构迁移使用明确、受控的部署步骤，不在每个 Preview 构建中自动修改同一个生产库。
6. smoke test 必须使用真实 PostgreSQL 客户端验证创建、读取、更新及清理/回滚，并带环境检查和显式写入许可；只操作专用探针数据，不碰用户业务数据。
7. 只读健康检查不得写入探针或迁移状态，不向公网暴露连接信息和内部错误。
8. 回归原有 MySQL 业务及认证路径；新增 PG 连接失败不能偷偷切库或破坏未迁移旧模块。
9. 尽可能执行 lint、typecheck、测试、Prisma validate/generate 和 production build，区分原有错误与本次引入错误。
10. 报告中区分“代码/构建已验证”“本地真实数据库已验证”“Vercel 部署已验证”；没有实际执行的步骤不得写成通过。

## 7. 本轮实现 D：确保后续开发不再回到 MySQL

不能只在本次回答里写一句“以后用 PostgreSQL”。请落实到仓库：

1. 保留原有内容，在 AGENTS.md 中追加简短、明确的数据库规则，并引用本次新增文档：
   - 新功能、新表、新仓储默认使用 PostgreSQL。
   - 旧模块按归属清单继续运行，禁止双写和自动回退。
   - 修改旧模块前先检查该模块及实体的迁移状态。
   - 不允许新功能直接导入 legacy client、legacy 生成类型或 MySQL 驱动。
   - 已迁移模块不得重新引入 MySQL。
2. 根据审计结果建立显式 legacy 允许名单，不使用 src/** 等过宽范围。
3. 用现有 lint、架构测试或轻量检查脚本拦截新增的 legacy 依赖，覆盖路径别名、相对路径、re-export 和直接驱动导入；加入 CI，并编写正反例测试证明规则有效。
4. 跨域共享的业务类型使用稳定契约，避免把 MySQL 生成类型继续泄漏给新 PostgreSQL 模块；不为此重写整个项目。
5. 提供一个最小 PostgreSQL 仓储/测试参考，让下一个功能能沿用明确入口。
6. 每迁移一个模块，更新归属清单并收缩 legacy 允许名单。

共享身份必须单独处理：
- 新功能可沿用现有认证获得的稳定 userId，不强制把旧整数/string ID 改成 UUID。
- 用户数据尚在 MySQL 时，只能经明确的身份/权限服务边界获取必要信息，不能让新模块直接访问 legacy 表。
- 跨库阶段可使用明确标记的外部标量 ID，服务端校验归属并记录删除/关联完整性策略；不能凭空声明跨库外键。
- 不为规避关联问题新建第二套独立用户账号，不假装存在跨库原子事务。强一致依赖应作为整体迁移单元规划。

## 8. 后续阶段计划：本轮记录，不执行旧数据迁移

### 阶段二：观察与迁移准备

用可核验的标准定义“稳定”：目标环境连接成功、部署通过、核心路径与权限回归通过、连接池与错误日志无未解决异常。
不要用“等几天”或测试未报错代替真实验收；记录实际观察结果，不虚构线上指标。

为每个迁移单元制定依赖顺序、结构适配、备份恢复验证、切换步骤与回滚边界。
按事务和关系依赖决定迁移单元，不简单按单表拆分。

### 阶段三：按迁移单元搬迁与切换

收到明确的模块迁移任务后，再实现和运行对应迁移工具。规划中必须包含：
- dry-run、verify-only、显式 apply、批次大小、稳定游标、幂等和断点续跑。
- dry-run/verify-only 不写目标库，也不偷偷更新 checkpoint。
- 每批导入与 checkpoint 的一致性、失败退出、脱敏报告和受控重跑。
- 保留 ID、关系、业务时间、密码哈希及必要元数据；必要的 ID 映射必须显式持久化，不能静默重建主键。
- 检查 MySQL/PostgreSQL 的原生类型、枚举、JSON、Decimal/BigInt、布尔值、时区、无效日期、排序规则、大小写唯一性及 NULL 行为差异。
- 导入显式自增 ID 后处理 PostgreSQL sequence/identity，并验证后续插入不冲突。
- 检查 PostgreSQL 已有新数据与历史导入的主键、业务唯一键冲突；禁止盲目 upsert 覆盖新库数据。
- 核验记录数、主键集合、关键字段、关联完整性、业务汇总与代表性流程，而不只比对行数。

默认采用“按迁移单元短暂停写”的可控切换，不自建复杂双写/CDC 系统：
1. 在隔离环境演练并核验备份可恢复。
2. 暂停该迁移单元的所有写入，包括旧部署实例、后台任务、队列、webhook、定时任务和脚本，并等待在途操作结束。
3. 在无并发写入的前提下完成最终一致性导入及核验。
4. 在同一切换计划中更新该单元的全部业务读写入口，处理缓存并恢复 PostgreSQL 写入。
5. 阻断旧代码和旧凭证对已迁移数据的写入，防止旧实例继续写 MySQL；未迁移模块仍需保持可用。
6. 验证 MySQL 已迁移部分不再变化，更新状态和证据。

若需要边运行边预复制，最终切换前必须补齐期间的新增、修改与删除；不能仅凭 updatedAt 增量查询假定所有变更已覆盖。
无法接受停写时，应单独提出增量同步方案和前置条件，不擅自升级为复杂同步架构。

回滚必须诚实区分：
- PostgreSQL 尚未接受新的业务写入时，可依据已验证的计划回退。
- PostgreSQL 已接受新写入后，直接切回旧 MySQL 会遗漏新数据；必须有经验证的反向对账/补偿方案，否则保持新库并修复，不能承诺一键无损回滚。

### 阶段四：全面验收与清理

必须先确认全部模块迁移完成、归属清单无 MySQL 业务所有者，并在撤去 MySQL 连接配置/网络访问的测试或 staging 环境中证明应用可独立运行。

清理范围包括：
- legacy 客户端、兼容入口、旧仓储实现和 MySQL 专属生成代码引用。
- @prisma/adapter-mariadb 及仅为旧库存在的驱动依赖。
- 旧 schema、旧迁移运行入口、旧数据库脚本与迁移期路由/允许名单。
- 部署环境、CI、定时任务中的旧连接变量、secret、证书配置和健康检查。
- 文档中的旧默认开发方式。迁移审计和必要历史记录可归档，不需要改写 Git 历史。

实际删除 MySQL 数据库、云实例或不可恢复备份，需要另一次明确授权，并核对具体目标、保留策略及备份恢复证据。本轮不得执行。

## 9. 本轮必须交付的结果

优先复用现有文档目录；缺少规范时创建：
- docs/database/README.md：当前架构、连接、环境变量和开发/部署命令。
- docs/database/migration-plan.md：分阶段计划、依赖、风险、切换与回滚流程。
- docs/database/migration-status.md：按环境的模块归属、验证证据及未完成项。
- 更新后的 AGENTS.md、.env.example、pnpm scripts、测试和 CI 边界检查。

文档不得写入 secret、数据库导出或用户信息。不要一次性实现所有未来模块迁移器。

开始前给出简短实施计划，然后执行本轮允许的工作。能从仓库判断的事项自行核实并推进，不反复询问。
缺少凭证、控制台权限或已确认的安全测试目标时，继续完成不依赖这些条件的工程工作，最后集中列出阻塞项；不得绕过权限。
只允许对已确认的开发/测试目标执行本轮必要的非破坏性初始化。生产 DDL、生产测试写入、真实旧数据搬迁、旧模块切换和删库均不在本轮授权范围。
禁止执行 migrate reset、db push --accept-data-loss、DROP DATABASE、TRUNCATE 等破坏性操作。
不要自动提交、推送或发布生产，除非已有单独明确授权。

最终报告应包含：
1. 当前真实技术栈和本轮改动文件。
2. 新旧数据库入口、生成目录、环境变量映射及模块归属。
3. 实际执行的命令与结果，明确未执行、失败和阻塞项。
4. 需要我在 Supabase/Vercel 完成的准确设置，不展示 secret。
5. 本轮验收是否完成，以及进入下一阶段仍缺哪些条件。

现在从仓库审计开始，只实施阶段一，不迁移旧数据。

## 官方资料核对入口

实现时以当前安装版本和对应官方文档为准，不照搬其他 Prisma 大版本示例：
- Prisma 文档索引：https://www.prisma.io/docs/llms.txt
- Supabase Prisma：https://supabase.com/docs/guides/database/prisma
- Supabase 连接方式：https://supabase.com/docs/guides/database/connecting-to-postgres
- Supabase Data API 安全：https://supabase.com/docs/guides/api/securing-your-api
- node-postgres SSL：https://node-postgres.com/features/ssl
- Codex AGENTS.md：https://developers.openai.com/codex/guides/agents-md/
