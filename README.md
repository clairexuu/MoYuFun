# MoYuFun

无需下载安装、打开浏览器即可游玩的 HTML5 小游戏站。

当前实现和下一步见 [STATUS.md](STATUS.md)。

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
GAMES_ORIGIN=https://games.example.com
```

## 检查

```bash
pnpm lint
pnpm build
node games/slash/test_headless.js
```
