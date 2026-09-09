# MoYuFun 实现状态

> 记录当前实现与下一步，不作为更新日志。长期方案见 [IDEA.md](IDEA.md)，本地运行方式见 [README.md](README.md)。

## 当前阶段

线上最小可玩链路已完成：[www.moyufuns.com](https://www.moyufuns.com) 的 `/` → `/games/slash` → `/play/slash` 已可正常游玩。下一阶段是接入 Supabase 与最小统计链路。

## 已实现

- Next.js 门户：首页、游戏详情页、iframe 游玩页和定制 404。
- 门户部署于 Vercel，游戏文件通过 `games.moyufuns.com`、Cloudflare CDN 和 R2 分发。
- 强类型本地游戏目录，页面不直接依赖未来的 Supabase 数据源。
- iframe 加载、超时提示、重试、全屏及必要的 sandbox、CSP 限制。
- `slash` 使用不可变版本路径发布；CDN 长期缓存、CORS、`frame-ancestors` 和 `nosniff` 已配置。
- 响应式深色街机界面；移动端提示使用电脑，但不阻止游玩。

## 当前约束

- 暂无登录、广告、Supabase、统计和 Game SDK。
- 单个游戏发布包不超过 30 MB；当前游戏以键鼠操作为主。
- 初版部署固定使用 Vercel、Supabase、Cloudflare R2 和 Cloudflare CDN，不按用户所在地分流。

## 验证状态

- `pnpm lint`：通过。
- `pnpm build --webpack`：通过；受控环境中 Turbopack 生产构建因内部端口权限受限。
- `node games/slash/test_headless.js`：通过。
- 桌面与手机视口、页面跳转、iframe、重试、全屏和未知 slug：已手动验证。
- 生产环境三页跳转、R2 加载和全屏：浏览器验收通过。
- 游戏响应的 CORS、安全头和 Cloudflare 缓存：验收通过。

## 下一里程碑：数据与统计闭环

1. 创建 Supabase 项目及 `games`、`game_versions`、`events` 表。
2. 将静态游戏目录迁移到 Supabase，保持现有页面接口不变。
3. 接入最小 Game SDK、`/api/events` 和核心验证指标。

## 维护规则

每完成一个里程碑，只更新当前状态、验证结果和下一步；及时删除失效内容，不追加时间线式记录。
