# MoYuFun 开发说明

面向接手开发者的代码与部署索引。当前已上线「乱刃」，完成首页 → 详情 → 游玩链路；后续执行顺序见 [TODO.md](TODO.md)，启动命令见 [README.md](README.md)。

## 1. 代码结构与功能入口

主站采用 Next.js 16.3 App Router、React 19.2、TypeScript 和 Tailwind CSS 4；`@/` 指向 `src/`。游戏采用原生 JavaScript + Canvas，单独作为静态文件运行。

| 位置（相对仓库根目录） | 职责 |
| --- | --- |
| `src/app/page.tsx` | `/` 首页，读取游戏目录并渲染卡片 |
| `src/app/games/[slug]/page.tsx` | 详情页：封面、简介、标签、操作说明、开始按钮及页面元信息 |
| `src/app/play/[slug]/page.tsx` | 游玩页：查找游戏、生成文件 URL、向播放器传入 `src/title/detailHref`；设置 `noindex/nofollow` |
| `src/app/layout.tsx`、`globals.css`、`not-found.tsx` | 全站标题模板、字体与样式，以及定制 404 |
| `src/lib/database.ts` | 服务端 PostgreSQL 连接，校验主站角色并适配 Transaction Pooler |
| `src/lib/games.ts` | `Game` 类型、数据库行映射、JSON 校验和缓存读取接口，是游戏目录的唯一数据入口 |
| `src/app/api/revalidate/games/route.ts` | 受 Bearer secret 保护的游戏目录缓存失效入口 |
| `src/components/game-player.tsx` | 客户端播放器：iframe、加载状态、重试、返回、全屏、移动端提示 |
| `src/components/game-card.tsx`、`game-cover.tsx` | 卡片与封面；封面由符号和配色绘制 |
| `src/components/site-header.tsx`、`site-footer.tsx` | 共用页头、页脚 |
| `games/games/slash/v1/` | `index.html` 为完整游戏；同目录含玩法 README 和 `test_headless.js` |
| `supabase/migrations/` | Supabase 数据库结构和「乱刃」初始数据迁移 |
| `supabase/README.md` | 数据库部署、服务端角色和权限验收说明 |
| `next.config.ts` | 游玩页 CSP 响应头，允许指定游戏来源 |

游戏脚本按注释分为输入、状态、战斗、AI、碰撞、更新、渲染和菜单；`SLASHES` 定义招式，`startGame()` 开局，`update(dt)` 推进逻辑，`phase` 区分菜单、游玩与结算。

## 2. 数据与加载行为

`games.ts` 的异步接口从 Supabase 联表读取 `games` 和当前 `game_versions`，只返回 `is_listed=true` 且存在当前版本的记录。数据库 snake_case 行在模块内转换为 `Game`，其中 `controls` 和 `cover` 会在运行时验证后才交给页面。`getGames()` 按排序值和 slug 升序返回，`getGameBySlug()` 查单款，`getGameUrl()` 将当前版本入口拼到 `GAMES_ORIGIN` 的域名上，仅接受 HTTP(S)。

目录查询通过 Next.js 数据缓存复用，缓存标签为 `game-catalog`，每 5 分钟兜底刷新。发布端写入目录或切换当前版本后，应以 `Authorization: Bearer <MOYUFUN_REVALIDATE_SECRET>` 调用 `POST /api/revalidate/games` 立即使标签过期；缺少或错误凭据返回 401，主站未配置 secret 返回 503。

详情页与游玩页通过 `generateStaticParams()` 预生成构建时已有路径，同时保留 `dynamicParams=true` 和显式 `notFound()`。因此新增已上架游戏可在首次请求时生成，无需重新部署；未知、未上架或没有当前版本的 slug 返回 404。

播放器同时等待 iframe 的 `onLoad` 与跨域 `fetch(src)` 完成，再移除加载遮罩；请求失败或等待 10 秒显示提示。重试清空状态并重建 iframe，全屏通过 Fullscreen API 控制播放器容器。移动端提示使用键鼠，仍允许进入。

当前加载判定未检查 HTTP 状态码，也未接收游戏自身的就绪消息；它表示文件加载信号，不代表游戏逻辑已准备完成。SDK 与真实就绪统计属于下一阶段。

## 3. 部署链路与配置

```text
浏览器 → www.moyufuns.com → Vercel 返回主站页面
       → iframe 请求 games.moyufuns.com/games/slash/v1/index.html
         → Cloudflare CDN（命中直接返回，未命中从 R2 读取）
         → 浏览器执行游戏 HTML / CSS / JavaScript
```

| 服务 | 当前用途与入口 |
| --- | --- |
| Vercel | Next.js 主站：[www.moyufuns.com](https://www.moyufuns.com) · [控制台](https://vercel.com/dashboard) |
| Cloudflare R2 + CDN | 游戏存储与分发：[乱刃 v1](https://games.moyufuns.com/games/slash/v1/index.html) · [控制台](https://dash.cloudflare.com/) |
| Supabase | 托管 PostgreSQL，保存游戏、版本和统计事件；迁移与权限说明见 `supabase/README.md` |

主站生产环境设置 `GAMES_ORIGIN=https://games.moyufuns.com`、Transaction Pooler 的 `MOYUFUN_WEB_DATABASE_URL`，以及与发布环境约定一致的 `MOYUFUN_REVALIDATE_SECRET`。这些变量均为服务端配置；数据库连接和刷新 secret 不得使用 `NEXT_PUBLIC_` 前缀。`GAMES_ORIGIN` 同时决定游戏 URL 和 CSP，变更后重新构建部署。游戏文件独立上传到 R2，部署主站不会自动发布游戏。

主站 `/play/*` 的 CSP 为 `frame-src 'self' <游戏来源>`。iframe 使用 `sandbox="allow-scripts allow-same-origin allow-pointer-lock"`、`allow="fullscreen; autoplay"` 和 `strict-origin-when-cross-origin` referrer policy。

现有部署记录已验收 CDN 长期缓存、CORS、`frame-ancestors` 与 `nosniff`。生产配置约定：CORS 允许主站 GET/HEAD，游戏响应以 `frame-ancestors https://www.moyufuns.com` 限制嵌入，文件使用正确 MIME 类型。Cloudflare 配置在平台侧维护，仓库没有部署脚本或配置快照。

## 4. 本地开发、发布与验证

使用 Node.js 24、pnpm 9.15.9；主站和游戏服务分别运行在 3000、4000 端口。`GAMES_ORIGIN` 默认 `http://localhost:4000`，环境示例见 `.env.example`。本地静态服务以外层 `games/` 为根目录并开启 CORS：

| 本地文件 | URL 路径 / R2 对象键 |
| --- | --- |
| `games/games/slash/v1/index.html` | `/games/slash/v1/index.html` / `games/slash/v1/index.html` |

新增游戏时，在 `games/games/<slug>/<version>/` 放入文件，并通过发布角色登记游戏及版本。先验证本地链路，再将运行文件按同一路径上传 R2；确认可访问后，在事务中上架或切换当前版本，随后调用受保护的目录缓存失效接口。新版本使用新目录，回滚时切回已保留的旧版本并再次失效缓存。单包上限 30 MB，凭据保存在服务端或发布环境；自动包检查与发布脚本见 TODO。

检查命令统一见 README。已有通过记录包括 lint、`pnpm build --webpack` 和游戏冒烟测试；受控环境的 Turbopack 构建存在端口权限限制。冒烟测试模拟浏览器 API 和战斗逻辑，不验证真实画面；人工验收覆盖桌面／移动端、三页跳转、未知 slug、加载、重试、全屏及线上响应头与缓存。

## 5. 下一阶段与维护

Supabase 托管 PostgreSQL 已初始化：`games`、`game_versions`、`events` 表、约束、查询索引和 RLS 已部署，并已导入「乱刃」v1。首页、详情页和游玩页已迁移到数据库目录，使用 5 分钟兜底刷新和受保护的按需失效。匿名与登录客户端均无直接表权限；`moyufun_web` 只读取已上架目录及写入事件，`moyufun_publisher` 只管理目录和不可变版本，两者使用独立服务端凭据。

指标与测试口径的已完成部分和待定决策见 [METRICS.md](METRICS.md)。下一步通过 Game SDK → 主站 → `/api/events` → 数据库实现匿名统计。仍需处理消息校验、事件去重、限流和指标查询；原始事件计划保留 90 天，日汇总长期保存。当前 SDK、统计接口、登录和广告均未实现。

后续完成发布自动化、隐私政策与条款、SEO 和多游戏验收，按 TODO 推进。MVP 固定采用 Vercel、Supabase、R2 与 CDN，由内部发布游戏；搜索、社区互动、云存档和第三方上传不在本轮范围。完成任务后更新本文现状并勾选 TODO。
