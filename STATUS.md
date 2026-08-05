# MoYuFun 实现状态

> 记录当前实现与下一步，不作为更新日志。长期方案见 [IDEA.md](IDEA.md)，本地运行方式见 [README.md](README.md)。

## 当前阶段

本地最小可玩链路已完成：`/` → `/games/slash` → `/play/slash`。下一阶段是部署主站与游戏文件，打通线上链路。

## 已实现

- Next.js 门户：首页、游戏详情页、iframe 游玩页和定制 404。
- 强类型本地游戏目录，页面不直接依赖未来的 Supabase 数据源。
- iframe 加载、超时提示、重试、全屏及必要的 sandbox、CSP 限制。
- 响应式深色街机界面；移动端提示使用电脑，但不阻止游玩。
- `slash` 由独立本地静态服务提供，游戏代码未改动。

## 当前约束

- 暂无登录、广告、Supabase、统计和 Game SDK。
- 单个游戏发布包不超过 30 MB；当前游戏以键鼠操作为主。
- 初版部署固定使用 Vercel、Supabase、S3 和 CloudFront，不按用户所在地分流。

## 验证状态

- `pnpm lint`：通过。
- `pnpm build --webpack`：通过；受控环境中 Turbopack 生产构建因内部端口权限受限。
- `node games/slash/test_headless.js`：通过。
- 桌面与手机视口、页面跳转、iframe、重试、全屏和未知 slug：已手动验证。

## 下一里程碑：线上可玩

1. 创建并配置 Vercel、S3 和 CloudFront。
2. 上传 `slash`，配置 CORS 与 `frame-ancestors`。
3. 设置生产环境 `GAMES_ORIGIN`，部署并验证三页线上链路。
4. 线上链路稳定后，再迁移 Supabase 游戏目录并接入 SDK/统计。

## 维护规则

每完成一个里程碑，只更新当前状态、验证结果和下一步；及时删除失效内容，不追加时间线式记录。
