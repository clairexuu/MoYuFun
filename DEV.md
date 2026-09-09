# MoYuFun 开发说明

本文作为项目开发的统一依据，记录当前实现与后续方向；执行清单见 [TODO.md](TODO.md)。

## 项目与当前实现

MoYuFun 是打开浏览器即可游玩的 H5 小游戏站，采用 Next.js、React、TypeScript 和 Tailwind CSS。已上线「乱刃 · 斩击大乱斗」，完成首页、游戏详情页、iframe 游玩页和定制 404，形成 `/` → `/games/slash` → `/play/slash` 的线上链路。

播放器已支持加载提示、超时提示、重试和全屏，移动端显示键鼠操作提示。游戏采用原生 JavaScript 与 Canvas，独立于门户运行。当前游戏目录保存在代码中，统一提供名称、介绍、标签、操作说明、封面和入口路径。

## 部署与运行

| 服务 | 已部署职责与地址 |
| --- | --- |
| Vercel | 托管 Next.js 主站：[www.moyufuns.com](https://www.moyufuns.com) |
| Cloudflare R2 | 保存游戏静态文件，通过游戏自定义域名提供访问 |
| Cloudflare CDN | 通过 [games.moyufuns.com](https://games.moyufuns.com) 缓存分发 R2 文件 |

当前游戏入口为 [乱刃 v1](https://games.moyufuns.com/games/slash/v1/index.html)，生产环境设置 `GAMES_ORIGIN=https://games.moyufuns.com`。游戏使用不可变版本路径；CDN 长期缓存、CORS、CSP 的 iframe 来源与嵌入限制、`nosniff` 和 iframe sandbox 已配置。

本地静态服务以仓库 `games/` 为根目录，文件 `games/games/slash/v1/index.html` 对应 `http://localhost:4000/games/slash/v1/index.html`。主站使用端口 3000；环境要求、启动和检查命令见 [README.md](README.md)。

已有验证记录包括 lint、`pnpm build --webpack`、游戏冒烟测试、桌面与手机视口、页面跳转、重试、全屏和未知游戏路径；线上游戏加载、CORS、安全头与 CDN 缓存已验收。受控环境中的 Turbopack 生产构建存在端口权限限制。

## 下一阶段

下一阶段接入 Supabase 托管 PostgreSQL，保存游戏目录、版本和统计事件，支持目录更新、版本切换和指标查询。数据库接入同时落实页面缓存刷新与服务端访问权限。

Supabase 承担结构化数据管理，R2 继续保存游戏文件，Vercel 接口负责业务校验与写入。采用托管数据库减少运维工作，并用统一数据源管理游戏上线状态和当前版本。当前数据库与统计链路尚待接入，现有游戏仍通过代码中的目录运行。

通过 Game SDK → 主站 → `/api/events` → 数据库建立统计链路，记录访问、加载、开始、结束和游玩心跳，查询转化率、加载成功率、加载耗时、有效游玩率和回访率。

随后完成发布脚本与回滚、隐私政策和使用条款、基础 SEO、多游戏验收及可选错误监控。隐私说明与统计开发同步准备，具体优先级按 TODO 执行。

## 开发约定

MVP 采用 Vercel、Supabase、Cloudflare R2 与 CDN 的固定部署方案，由内部开发者发布游戏，单个发布包不超过 30 MB。新版本使用新路径，保留旧版本用于回滚；密钥由服务端或发布环境管理。

统计采用匿名访客和会话标识，计划保留原始事件 90 天、长期保存日汇总，应用不主动持久化原始 IP。MVP 聚焦展示、游玩、发布和统计；搜索、社区互动、云存档及第三方上传属于范围外。

完成事项后同步更新本文的当前状态与 TODO 的完成标记，及时替换失效内容，保持简洁的现状说明。
