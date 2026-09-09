# MoYuFun

无需下载安装、打开浏览器即可游玩的 HTML5 小游戏站。

当前实现、部署架构和开发约定见 [DEVELOPMENT.md](DEVELOPMENT.md)，待办事项与执行顺序见 [TODO.md](TODO.md)。

## 当前部署

| 服务 | 用途 | 地址 |
| --- | --- | --- |
| Vercel | 托管 Next.js 主站 | [www.moyufuns.com](https://www.moyufuns.com) · [管理控制台](https://vercel.com/dashboard) |
| Cloudflare R2 | 存储游戏静态文件，通过自定义域名访问 | [games.moyufuns.com](https://games.moyufuns.com) · [管理控制台](https://dash.cloudflare.com/) |
| Cloudflare CDN | 缓存并分发 R2 中的游戏文件 | [games.moyufuns.com](https://games.moyufuns.com) |

R2 和 CDN 共用游戏域名；具体游戏需访问完整文件路径，例如 [乱刃 v1](https://games.moyufuns.com/games/slash/v1/index.html)。主站生产环境设置 `GAMES_ORIGIN=https://games.moyufuns.com`。

## 本地开发

项目要求 Node.js 24 和 pnpm 9.15.9。安装依赖：

```bash
pnpm install
```

分别在两个终端启动主站与游戏静态服务：

```bash
pnpm dev
```

```bash
pnpm dev:games
```

主站地址为 `http://localhost:3000`，游戏文件地址为 `http://localhost:4000`。

如需修改游戏文件来源，设置环境变量：

```bash
GAMES_ORIGIN=https://games.moyufuns.com
```

## 检查

```bash
pnpm lint
pnpm build
node games/games/slash/v1/test_headless.js
```
