# MoYuFun

无需下载安装、打开浏览器即可游玩的 HTML5 小游戏站。

当前实现、部署架构和开发约定见 [DEV.md](DEV.md)，待办事项与执行顺序见 [TODO.md](TODO.md)。

## 部署地址

[www.moyufuns.com](https://www.moyufuns.com)

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

Supabase 数据库迁移、权限和服务端环境变量见 [supabase/README.md](supabase/README.md)。

## 检查

```bash
pnpm test
pnpm lint
pnpm build --webpack
node games/games/slash/v1/test_headless.js
```
