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

账号流程需要本地 Supabase（Docker）：

```bash
pnpm supabase start
```

Supabase 数据库迁移、权限和服务端环境变量见 [supabase/README.md](supabase/README.md)，账号与成就见 [docs/design/accounts-achievements.md](docs/design/accounts-achievements.md)。

## 检查

```bash
pnpm test
pnpm lint
pnpm build --webpack
node games/slash/v3/test_headless.js
```

数据库函数与权限（需 `pnpm supabase start` 且迁移已应用）：

```bash
docker exec -i supabase_db_MoYuFun psql -U postgres -v ON_ERROR_STOP=1 < supabase/tests/achievements.sql
```
