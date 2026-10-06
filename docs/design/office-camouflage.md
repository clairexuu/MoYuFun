# Office camouflage

**Status:** In progress: everything but M6 done 2026-10-05; the site's camouflage mode reaches production when `main` is pushed (M6). Milestones: M1 ☑ · M2 ☑ · M3 ☑ · M4 ☑ · M5 ☑ · M6 ☐ · M7 ☑

MoYuFun games are played at work, so they should look like work. A camouflaged game draws itself as office software (an Excel sheet or a VS Code window), hides behind a boss key, and stays silent until asked. The site adds a 伪装 mode on the play page: the game fills the browser window with no MoYuFun chrome, and the browser tab's title and icon match the disguise. Games that can't be disguised (real-time action) keep working as before.

Read first: `DEV.md` §1–3, `docs/design/accounts-achievements.md` → Game protocol, `docs/design/game-release.md`, `src/lib/game-events.ts`, `src/components/game-player.tsx`, `scripts/game-release.mts`, `games/prototype-skins/index.html` (the approved look: variants C and D).

## Decisions

| # | Decision | Why |
| --- | --- | --- |
| D1 | The game draws the disguise (spreadsheet or editor chrome, data, status bar). The site only removes its own chrome and sets the tab title and icon. | The site can't draw inside a cross-origin iframe, and games can't share files. The game knows what it looks like at every moment. |
| D2 | New SDK message, five keys: `{ source: "moyufun-game", version: 1, type: "disguise", app, title }`. `app` is `"excel"` or `"vscode"`. `title` is 1–80 characters with no control characters. A game sends it right after every `ready`, and again whenever its window title or skin changes. | The site needs to know whether the game can be disguised and what the tab should say. Older site builds drop unknown message types, so games can ship before the site does. |
| D3 | The play page shows a `伪装` button in the toolbar only after the game has sent a valid `disguise`. Turning it on or off saves `moyufun:camouflage` = `"1"` / `"0"` in `localStorage`. With `"1"` saved, the page enters camouflage automatically on the first `disguise`. | Players who use it once want it every time. A game that never sends `disguise` never offers the mode. Storage failures fall back to off. |
| D4 | Camouflage mode: the player becomes `position: fixed; inset: 0` above everything, the toolbar and mobile note are hidden, achievement popups are not shown (unlocks and stats are still saved), `document.title` = the latest disguise title, and the tab icon becomes a built-in SVG for `app`. The Fullscreen API is not used. | Fullscreen shows a browser banner, exits on Esc (the boss key) and is itself conspicuous. A popup with a trophy is exactly what a passer-by would notice. |
| D5 | Leaving camouflage: a 6 px strip along the top of the window reveals, on hover, a slim grey bar with the game name, `退出伪装` and `返回详情`. Leaving restores the page title and icons. | Keyboard focus is inside the iframe, so the parent can't catch a shortcut. A hover strip is invisible until wanted. |
| D6 | Disguised-game conventions: **Esc** is the boss key (freeze, hide every game element, show a plain document; Esc again resumes). Sound is off until `M` turns it on. There is no title screen: the first frame is a plausible document, with a short hint in the status bar. The game's name never appears large. | A boss key that needs the mouse is too slow. A silent, unbranded first frame is safe to open at a desk. |
| D7 | Two chrome specs, shared by copy: **Excel** (green `#217346` title bar, ribbon tabs 文件 开始 插入 页面布局 公式 数据 审阅 视图 帮助, name box + `fx` formula bar, column letters / row numbers on `#f3f3f3`, gridlines `#e1e1e1`, sheet tabs, green status bar with 就绪 and 平均值/计数/求和, 100%) and **VS Code** (Dark+: activity bar `#333`, explorer `#252526`, editor `#1e1e1e`, tabs `#2d2d2d`, Menlo/Consolas 13 px, terminal panel, blue status bar `#007acc` with branch, problems and 行/列). `games/sheet-snake/v1/index.html` is the reference implementation; later games copy its chrome code. | Consistent, believable chrome is what makes the disguise work; one reference keeps it from drifting. |
| D8 | Conditional-format colours carry the game state in Excel skins: good `#c6efce` / `#006100`, bad `#ffc7ce` / `#9c0006`, neutral `#ffeb9c` / `#9c5700`, and 3-colour scales for numbers. In VS Code skins: selection `#264f78`, errors as red squiggles `#f14c4c`, warnings yellow `#cca700`. | These are the colours real files are full of, so game state reads as ordinary formatting. |
| D9 | No vendor logos or product icons are drawn. The window title text may name the app (`… - Excel`) the way a real window does. The tab icons are simple generic marks (a green grid, a blue `{}`). | Believable at a glance without copying anyone's artwork. |
| D10 | Unlisting is a release command: `pnpm game unlist <slug> [--yes]` sets `is_listed = false` and `updated_at = now()`, then revalidates the catalog. A later `publish` lists the game again. Nothing is deleted. | The publisher role can already update `games`; RLS already hides unlisted games, including by URL. Stats and achievements stay for a possible return. |

## Out of scope

Disguising games that are real-time action (乱刃, 影子行者, 摸了个鱼 stay as they are), Word/PowerPoint/Outlook skins, a site-wide camouflaged catalog page, a parent-page keyboard shortcut, user-chosen tab titles, mobile-specific disguises.

## Architecture

### Protocol (`src/lib/game-events.ts`)

```ts
export type DisguiseApp = "excel" | "vscode";
export type GameMessage =
  | { type: "ready" | "start" | "end" }
  | { type: "achievement"; key: string }
  | { type: "stats"; stats: StatsReport }
  | { type: "disguise"; app: DisguiseApp; title: string };
```

`parseGameMessage` accepts `disguise` with exactly five keys, `app` in the set, and `title` a string of 1–80 characters matching `/^[^\u0000-\u001f\u007f]+$/`. `createGameLifecycle().message()` ignores `disguise` (it is not an analytics event). `GamePlayer` handles it before handing the message to the lifecycle.

Game SDK helper, next to `emitMoYuFunEvent`:

```js
function emitMoYuFunDisguise(app, title) {
  parent.postMessage({ source: 'moyufun-game', version: 1, type: 'disguise', app, title }, MOYUFUN_PARENT_ORIGIN);
}
```

Games call it after each `ready` (load, 0.5 s, 2 s, 5 s) and on every skin or title change.

### Site (`src/components/game-player.tsx`, `src/lib/camouflage.ts`)

- `src/lib/camouflage.ts` (pure, unit-tested): `readCamouflagePreference(storage)`, `writeCamouflagePreference(storage, on)` (both swallow storage errors), and `disguiseIconHref(app)` returning an SVG data URI: `excel` a white grid on `#217346`, `vscode` white `{}` on `#007acc`.
- `GamePlayer` state: `disguise?: { app, title }` (latest valid message) and `camouflaged: boolean`.
  - On `disguise`: store it; if the preference is on and not yet camouflaged, enter camouflage.
  - Entering: set `camouflaged`, remember the current `document.title` and every `link[rel~="icon"]` `href`, set the title and point every icon link at `disguiseIconHref(app)`. While camouflaged, later `disguise` messages update the title and icon.
  - Leaving (button, unmount, or navigation): restore the remembered title and hrefs.
  - Toolbar button `伪装` (shown only when `disguise` is set), between the title and `全屏`. Clicking it enters camouflage and saves `"1"`; `退出伪装` leaves and saves `"0"`.
  - In camouflage the `<section>` gets `game-player--camouflage` (`position: fixed; inset: 0; z-index: 50; background: #fff`), the toolbar and mobile note get `hidden`, the frame fills the window with no border radius, popups are not rendered, and the hover strip is rendered: a 6 px transparent `div` at the top; on hover it expands to a 32 px `#f3f3f3` bar with `{title}` on the left and `返回详情` / `退出伪装` on the right, collapsing when the pointer leaves.
- `globals.css`: `.game-player--camouflage` and its `.game-frame-wrap` sizing.

### Release (`scripts/game-release.mts`)

`unlist` command: confirm (D9 of game-release), `update games set is_listed = false, updated_at = now() where slug = $1 returning id` (error if no row), revalidate, then smoke-test that `GET ${SITE_URL}/play/<slug>` answers 404 (retried 5 × 3 s). Usage line and `game-release.md` → Commands updated.

### Games

| Slug | Name | Skin | Kind | Milestone |
| --- | --- | --- | --- | --- |
| `sheet-snake` | 表格贪吃蛇 | Excel + VS Code (`F2` switches) | new, from the prototype | M3 |
| `promotion-2048` v2 | 表格 2048 | Excel | reskin of 升官记 | M4 |
| `sheet-mines` | 表格扫雷 | Excel | new | M5 |
| `bug-hunt` | 代码找不同 | VS Code | new | M5 |
| `turtle-farm` v2, `terrarium` v2, `dragon-pawn` v2 | — | Excel | rework | M7 |
| `paper-plane`, `fish-grab` | — | — | unlisted | M2 |

Each game gets its own `docs/games/<slug>.md` written before or with its code, following this doc's conventions.

### Rework directions (M7)

- **玄武农场 v2:** the field is a cell block, the forecast is a header row, the 仓库 is a table. Fixes: a market day stops the clock until the player presses `离开集市`; start with 40 金; a 收购商 buys any crop at half price on any day, so the player is never stuck with no coins; days are 8 s.
- **生态瓶 v2:** setup is a sheet (organism, 数量, 单价, 小计), the run is an Excel-style dashboard (line charts, KPI cells with conditional formats). Adds agency: three one-time interventions during the run (补种水草, 开盖通气, 遮光一天) and a campaign of five jars with different budgets, light and required species, rated by stars.
- **龙的当铺 v2:** an Excel ledger that scrolls: each hero is a new row (item, 工坊, 矿脉, 印记, 铭文, 宝石, 材质, 要价). Rules live in a frozen header and grow each day. The player marks each row 收 / 拒 / 压价 under time pressure, like an audit. Wrong calls show up in the night's 对账 sheet.

## Milestones

Each milestone ends with `pnpm test`, `pnpm lint` and the touched games' headless tests passing.

**M1 · Protocol and camouflage mode.** `disguise` parsing and tests, `camouflage.ts` and tests, `GamePlayer` camouflage, CSS, docs (`accounts-achievements.md` Game protocol, `DEV.md`).
Done when: with a disguised game on local `/play/<slug>`, `伪装` appears, the window shows only the game, the tab title and icon change, the hover strip leaves camouflage and restores both, and the preference survives a reload.

**M2 · Unlisting.** `unlist` command, docs, then `pnpm game unlist paper-plane` and `pnpm game unlist fish-grab` locally and in production.
Done when: both are gone from the catalog, `/play/<slug>` answers 404, and the other games are unaffected.

**M3 · 表格贪吃蛇.** `games/sheet-snake/v1` from the prototype, both skins, D6 conventions, achievements and stats. The prototype is then removed from the working tree (kept on branch `prototype/office-skins`).
Done when: it ships through `check`, local release and production publish, and camouflage mode works with it.

**M4 · 表格 2048.** `promotion-2048` v2 in the Excel skin.
Done when: same as M3.

**M5 · 表格扫雷 and 代码找不同.**
Done when: same as M3, for both.

**M6 · Site release.** Push `main` so Vercel deploys the camouflage mode.
Done when: production `/play/sheet-snake` offers `伪装` and it works end to end.

**M7 · Reworks.** 玄武农场, 生态瓶, 龙的当铺 as new versions, each with its doc updated first.
Done when: each ships as in M3.

## Open items

- Whether the site's own home and detail pages should also get a plain, office-coloured look. Owner, after M6.
