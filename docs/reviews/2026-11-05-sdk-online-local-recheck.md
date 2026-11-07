# 线上中心联调启动前复核

2026-11-05，北京时间。用户告知线上中心已补 production 声明、专用 Client ID/Secret 已填写，授权条件满足后启动独立本地环境并继续登录/回调/退出。不允许初始化 ROOT、恢复业务数据或部署。

## 本次实际结果

| 检查 | 结果 |
| --- | --- |
| 本地配置 | 19:09 PASS、missing=[]；development / production；独立 session secret 与本地54332绑定正确 |
| 独立本地 PostgreSQL | TLS1.3、owner/身份/最小权限、原博客/中心资源和配置摘要检查通过 |
| 离线 doctor | 配置、命名空间、跳转、Client/Session秘密项 PASS；候选组合仍 COMBINATION_UNVERIFIED，未把存在性当作Client有效性 |
| 公开 metadata 预检 | BLOCKED / ENVIRONMENT_MISMATCH，user_center_environment 缺失 |
| 独立 HTTPS 无缓存复核 | 19:10:19 HTTP200、TLS校验成功、issuer匹配；Age=0、x-vercel-cache=MISS，根级字段仍缺失 |
| SDK 0.1.6 public ready | 19:11:56 实际返回 ENVIRONMENT_MISMATCH，与预检一致 |
| 本地安装状态 | 19:13:43 awaiting_root、revision0，ROOT/恢复/开放字段均为空 |
| 新库认证数据 | User=0、Account=0、Session=0 |
| 启动决定 | 3445未启动；未发起线上授权、回调换码或退出 |

没有修改本地检查来容忍缺失声明，没有删去 environment 或降低 TLS 校验。当前阻断发生在真实授权前，因此本次不能验证 Client ID/Secret 是否被中心接受、是否已登记正确回调，也不能宣称线上认证通过。

## 需中心侧核对的实际地址

```text
https://auth.zhaosie.com/api/auth/.well-known/openid-configuration
```

该地址的 JSON 根级必须实际返回：

```json
{
  "issuer": "https://auth.zhaosie.com/api/auth",
  "user_center_environment": "production"
}
```

本次无缓存请求仍读到缺字段响应，不是只沿用先前结果。Vercel MISS/Age0 不能证明所有应用缓存或部署别名都正确，中心侧应核对域名指向的实际生产部署、具体路由及缓存；不要只核对源码、环境变量或另一个 metadata 路径。也不能在博客侧把 target 改成 development 规避这一检查。

本地 Client 字段无需重复生成或贴入聊天。公开响应符合要求后，重新运行专用 metadata/check 命令，再启动3445并由用户输入中心密码/验证码，继续真实回调和退出验证。

## 证据与边界

私有去敏记录位于 `.feline-blog/auth-rebuild/local-to-production-0.1.6/`：offline-check.json、metadata-check.json、metadata-direct-check.json、sdk-readiness.json、recheck-before-start.json 和 postgres/verification.json。SDK public ready 使用现有公开导出和宿主集成实例，独立 Node22 带 react-server 条件，不导入中心私有实现。

本地新库仅做 READ ONLY 审计，没有应用迁移或写入业务数据。线上仅 GET 公开 Discovery，缺环境声明后没有继续获取 JWKS，没有携 Cookie/Client Secret 访问中心，也没有直连中心数据库。生产、来源、中心及旧模式受保护配置摘要保持。此前记录的无关项目容器变化仍单独标注，不冒充全部 daemon 容器均未变。

本轮没有改应用代码或依赖，未重跑或累加上一轮测试计数；没有初始化 ROOT、恢复、提交、推送或部署。新 target 的真实登录、回调和退出继续待公开声明生效后验证。
