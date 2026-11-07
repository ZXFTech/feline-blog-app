# SDK 0.1.10 registry 与 CI 接线

2026-11-07，宿主代码升级为官方 npm registry 的 SDK/CLI 精确 0.1.10。Better Auth 1.7.12、server-only 0.0.1、Node 22.21.1、pnpm 10.28.1 保持。公开试用版本不等于正式兼容认证，registry 的 next/latest 不参与本工程版本选择。

本次不部署、不修改生产环境变量，不执行真实中心认证或现有数据库维护。已上线的博客仍以 [2026-11-06 发布记录](../reviews/2026-11-06-sdk-production-restoration.md) 的 0.1.6 为证，不能将代码依赖升级推定为线上升级。

本次干净 Linux 安装、双迁移链回放、1099 项测试和生产构建的实际结果见 [0.1.10 CI 验证报告](../reviews/2026-11-07-sdk-0.1.10-clean-ci.md)。

## 安装与本地检查

更新依赖的操作已完成，后续新工作站或 CI 使用：

```sh
pnpm install --frozen-lockfile --ignore-scripts
pnpm auth:sdk:check-installed
pnpm auth:sdk:test-registry
pnpm prisma:validate
pnpm prisma:generate
pnpm typecheck
pnpm lint
pnpm test:ci
pnpm auth:sdk:test-env
pnpm build
```

安装不依赖忽略目录中的 tgz，也不读取生产 Secret。生成客户端是显式构建步骤，不运行 migrate、备份或恢复。`auth:sdk:check-installed` 核对宿主固定版本、实际 SDK 公开版本与 CLI 元数据；`test-registry` 加载五个公开入口并以合成 Manifest 检查 CLI JSON/人读输出，不访问真实网络或数据库。当前矩阵为空时，doctor 的 COMBINATION_UNVERIFIED/exit 2 是明确保留的结果，不写成正式通过。

`auth:sdk:check-local` 继续读取操作者明确指定的本地配置，但检查实际安装版本，不再要求旧归档。`auth:rebuild prepare` 与 contracts.ts 的 0.1.6 摘要是历史交付封存工具，不作为当前 CI 安装前置，也不覆盖旧制品。

## 临时数据库重放

Verify 与 Staging 的 verify job 只使用 job 自带的 PostgreSQL 17 服务。公开迁移链在 feline_ci_verify 重放，独立 namespace 链在同一临时实例的空 postgres 数据库中重放。

namespace fixture 只能从 CI_SDK_DATABASE_URL 读取无密码的 127.0.0.1:5432/postgres，另要求 CI=true 和 CI_SDK_REPLAY=1。它不读取 dotenv 或应用/维护连接，并拒绝既有用户 schema、public 对象、额外扩展/角色/数据库。它仅为临时服务创建合成角色与 schema，复用原迁移和校验 ledger、初始化状态、全局 Account 唯一索引及运行身份的权限边界。不要手动设置这些开关对本地常驻库运行。

两条迁移链同时纳入历史不可变检查；程序化 SQL 只按精确路径、迁移名和固定摘要分类，内容有任何变化即拒绝。0.1.10 升级没有新增或改写迁移。

## Vercel 与外部交付边界

根 vercel.json 与上次隔离发布的 install/build 一致，没有 crons，不会将普通构建变成数据库维护。现有清理接口没有被删除或调用，定时任务若将来需要启用，仍须单独确定范围。

原 staging 工作流的 candidate job 明确禁用，其下游外部迁移、部署、域名提升及恢复链不会执行。原因是原命名为 feline-blog-staging 的项目当前承载正式博客，旧 APP_ENV 接线也不能代替 SDK runtime/target。只保留验证；恢复自动交付需要先审阅真正隔离的 staging 资源、profiles 和授权范围。此配置不更改 Vercel 项目本身或其 Git 集成设置。

profiles 的服务端静态打包与 PrismaPg 共用 pg.Pool 的 attachDatabasePool 保留。Vercel Secret/环境变量按环境注入，不上传本地 env；Preview 环境与 SDK runtime/target 必须显式映射，不能把 preview 传入 SDK 或复用生产 Client、库和会话密钥。需要真实认证的 Preview 应使用独立登记的固定 HTTPS origin。

## 验收边界

干净验证不复制真实 env、node_modules、generated、.next 或旧 SDK 归档；仓库中的非敏感 env 示例可保留。依赖安装、合成诊断、临时数据库重放、类型、lint、单测与 build 分别记录结果。GitHub Actions 的实际远程运行需提交后触发，不能用本地容器结果冒充远程 run。

新版本的真实登录、回调、退出、长期连接及业务权限仍需后续目标环境验收。本次不重新初始化 ROOT、不重放业务备份，不把此前 0.1.6 的生产结果记为 0.1.10 认证结果。
