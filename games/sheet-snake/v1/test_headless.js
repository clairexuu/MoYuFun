// 无头测试：打桩浏览器 API，驱动规则函数、整局流程、按键与两套外壳的绘制（不渲染真实画布）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
// ctx：属性可读写，方法都是空函数；measureText 按每字 7 px 估算。
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? s => ({ width: String(s).length * 7 }) : k in t ? t[k] : () => {}),
  set: (t, k, v) => { t[k] = v; return true; },
});
const listeners = {};
const canvasStub = {
  style: {}, width: 0, height: 0, getContext: () => ctxStub,
  addEventListener: (type, fn) => { listeners['canvas:' + type] = fn; },
};
global.window = global;
global.devicePixelRatio = 1;
global.AudioContext = undefined;
global.webkitAudioContext = undefined;
global.addEventListener = (type, fn) => { listeners[type] = fn; };
global.requestAnimationFrame = () => {};   // 不驱动 rAF，时间只走 update(dt)
global.setTimeout = () => 0;
const sdkMessages = [];
global.location = { hostname: 'localhost' };
global.parent = {
  postMessage(message, targetOrigin) {
    sdkMessages.push({ message, targetOrigin });
  },
};
global.document = { getElementById: () => canvasStub, documentElement: { clientWidth: 1280, clientHeight: 720 } };

// ---- 从 index.html 提取内联脚本 + 测试驱动 ----
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('未在 index.html 中找到 <script> 块');
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'game.json'), 'utf8'));
const code = match[1];
const driver = `
;(function runTest() {
  const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const seq = from => sdkMessages.slice(from).map(({ message }) => message.type + (message.key ? ':' + message.key : message.app ? ':' + message.app : ''));
  const key = (k, extra) => listeners.keydown(Object.assign({ key: k, code: k, preventDefault() {} }, extra));
  const XL_TITLE = '2026年度区域销售汇总_v3_终版.xlsx - Excel';
  const VS_TITLE = 'report.service.ts - moyufun-admin - Visual Studio Code';

  // ---- 加载：ready 后紧跟 disguise，没有 start ----
  assert(same(seq(0), ['ready', 'disguise:excel']), '加载消息错误: ' + seq(0));
  assert(sdkMessages[0].targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  assert(sdkMessages[1].message.title === XL_TITLE, 'Excel 标题错误');
  assert(muted === true && skin === 'excel' && g.state === 'ready', '初始状态错误');

  // ---- 网格大小：按窗口在开局时定下 ----
  assert(g.cols === 17 && g.rows === 22, '1280×720 Excel 网格应为 17×22，实际 ' + g.cols + '×' + g.rows);
  assert(same(gridSize('vscode', layoutBox()), { cols: 40, rows: 21 }), '1280×720 VS Code 网格错误: ' + JSON.stringify(gridSize('vscode', layoutBox())));
  for (const [w, h] of [[375, 667], [320, 400], [2560, 1440], [960, 600]]) {
    for (const s of ['excel', 'vscode']) {
      const box = { x: 0, y: 0, w, h }, gs = gridSize(s, box);
      assert(gs.cols >= 8 && gs.rows >= 8 && gs.cols <= 40 && gs.rows <= 30, s + ' ' + w + '×' + h + ' 网格越界');
      const r = s === 'excel' ? excelContentRect(box) : vscodeContentRect(box);
      assert(r.w > 0 && r.h > 0, s + ' ' + w + '×' + h + ' 内容区为空');
    }
  }
  assert(excelColName(0) === 'A' && excelColName(25) === 'Z' && excelColName(26) === 'AA', 'excelColName 错误');
  const rect = { x: 40, y: 100, w: 1000, h: 300 };
  const last = excelCellRect(rect, 7, 9, 6, 8);
  assert(last.x + last.w === 1040 && last.y + last.h === 400, '单元格没有铺满内容区');
  assert(SHEET.length === 30 && SHEET.every(r => r.length === 26), '表格数据应为 30×26');

  // ---- 规则 ----
  rng = mulberry32(1);
  let s = newGame(10, 8);
  assert(same(s.snake, [{ x: 5, y: 4 }, { x: 4, y: 4 }, { x: 3, y: 4 }]) && s.state === 'ready', 'newGame 蛇位置错误');
  assert(s.food && !s.snake.some(c => c.x === s.food.x && c.y === s.food.y), '食物不应在蛇身上');
  assert(turn(s, -1, 0) && s.snake[0].x === 3 && same(s.dir, { x: -1, y: 0 }), '开局前掉头应把蛇反过来');
  s.state = 'play';
  assert(!turn(s, 1, 0) && !turn(s, -1, 0), '游戏中不能掉头或重复方向');
  assert(turn(s, 0, 1) && turn(s, 1, 0) && turn(s, 0, -1) && !turn(s, 0, 1) && s.queue.length === 3, '转向队列最多 3 个');
  s = newGame(10, 8); s.state = 'play'; s.food = { x: 0, y: 0 };
  assert(step(s) === 'move' && s.snake[0].x === 6 && s.snake.length === 3, 'step 移动错误');
  s.food = { x: 7, y: 4 };
  assert(step(s) === 'eat' && s.snake.length === 4 && s.score === 10 && s.interval === intervalFor(1) && s.food, '吃食物错误');
  s.food = { x: 0, y: 0 };
  assert(step(s) === 'move' && step(s) === 'move' && step(s) === 'wall' && s.snake[0].x === 9, '撞右墙应返回 wall 且蛇头留在最后一格');
  s = newGame(10, 8); s.state = 'play'; s.food = { x: 0, y: 0 };
  s.snake = [{ x: 5, y: 4 }, { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 4 }, { x: 6, y: 5 }]; s.dir = { x: 1, y: 0 };
  assert(step(s) === 'self', '撞到自己应返回 self');
  s = newGame(10, 8); s.state = 'play'; s.food = { x: 0, y: 0 };
  s.snake = [{ x: 5, y: 4 }, { x: 5, y: 3 }, { x: 6, y: 3 }, { x: 6, y: 4 }]; s.dir = { x: 1, y: 0 };
  assert(step(s) === 'move', '追着尾巴走不算撞');
  // 限时奖励：每第 4 个普通食物后出现，分数随剩余时间递减
  s = newGame(20, 8); s.state = 'play';
  for (let k = 1; k <= 4; k++) {
    s.food = { x: s.snake[0].x + 1, y: s.snake[0].y };
    assert(step(s) === 'eat', '第 ' + k + ' 个食物没吃到');
    assert(!!s.bonus === (k === 4), '第 ' + k + ' 个食物后奖励出现与否错误');
  }
  assert(s.bonus.ttl === BONUS_TTL && bonusPoints(s.bonus) === 50 && bonusPoints({ ttl: 0.4 }) === 25, '奖励分数错误');
  s.bonus.x = s.snake[0].x + 1; s.bonus.y = s.snake[0].y; s.bonus.ttl = 3.2; s.food = { x: 0, y: 0 };
  assert(step(s) === 'bonus' && s.score === 40 + 40 && s.bonusEaten === 1 && !s.bonus && s.eaten === 4, '吃奖励错误');
  // 填满：4×2 只剩两个空格
  s = newGame(4, 2); s.state = 'play';
  s.snake = [{ x: 1, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 1 }, { x: 2, y: 1 }, { x: 3, y: 1 }];
  s.dir = { x: 1, y: 0 }; s.food = { x: 2, y: 0 };
  assert(step(s) === 'eat' && same(s.food, { x: 3, y: 0 }), '倒数第二格应把食物放到最后一格');
  assert(step(s) === 'full' && s.food === null && s.snake.length === 8, '填满应返回 full');
  // 随机乱走：蛇身不重叠、不出界、食物不在蛇身上
  for (let round = 0; round < 200; round++) {
    s = newGame(8 + round % 10, 8 + round % 7); s.state = 'play';
    for (let k = 0; k < 2000; k++) {
      if (rng() < 0.3) turn(s, ...[[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)]);
      const ev = step(s);
      if (ev === 'wall' || ev === 'self' || ev === 'full') break;
      const cells = new Set(s.snake.map(c => c.y * s.cols + c.x));
      assert(cells.size === s.snake.length, '蛇身重叠');
      assert(s.snake.every(c => c.x >= 0 && c.y >= 0 && c.x < s.cols && c.y < s.rows), '蛇出界');
      for (const f of [s.food, s.bonus]) assert(!f || !cells.has(f.y * s.cols + f.x), '食物在蛇身上');
    }
  }

  // ---- 整局：确定性成就顺序 ----
  function free(x, y) { return x >= 0 && y >= 0 && x < g.cols && y < g.rows && !g.snake.slice(0, -1).some(c => c.x === x && c.y === y); }
  function nextDir() { return g.queue[0] || g.dir; }
  function steer() {
    const h = g.snake[0], d = nextDir();
    if (free(h.x + d.x, h.y + d.y)) return;
    for (const [x, y] of [[0, 1], [0, -1], [-1, 0], [1, 0]]) {
      if (!(x === -d.x && y === -d.y) && free(h.x + x, h.y + y)) { g.queue = [{ x, y }]; return; }
    }
    throw new Error('无路可走');
  }
  // 把食物（或奖励）放到蛇头下一格，再走一步。
  function feed(kind) {
    steer();
    const h = g.snake[0], d = nextDir(), c = { x: h.x + d.x, y: h.y + d.y }, at = o => o && o.x === c.x && o.y === c.y;
    if (kind === 'bonus') { g.bonus.x = c.x; g.bonus.y = c.y; if (at(g.food)) { g.food = null; g.food = freeCell(g); } }
    else { g.food = c; if (at(g.bonus)) Object.assign(g.bonus, freeCell(g)); }
    const before = g.snake.length;
    update(g.interval);
    assert(g.snake.length === before + 1, kind + ' 没吃到');
  }
  let before = sdkMessages.length;
  key('ArrowDown');
  assert(g.state === 'play' && same(seq(before), ['start']), '第一次方向键应发送 start');
  key('ArrowDown');
  assert(seq(before).length === 1, 'start 每局只发一次');
  for (let k = 1; k <= 24; k++) {
    feed('food');
    if (k % 4 === 0) feed('bonus');
  }
  assert(g.eaten === 24 && g.bonusEaten === 6 && g.score === 24 * 10 + 6 * 50, '整局分数错误: ' + g.score);
  assert(g.interval === MIN_INTERVAL, '吃 24 个食物后应为最高速度');
  const t = excelTexts();
  assert(t.statusRight.at(-1) === '求和: 540' && t.nameBox === excelColName(g.snake[0].x) + (g.snake[0].y + 1), 'Excel 状态栏 / 名称框错误');
  draw(0); setSkin('vscode'); draw(0);
  assert(vscodeTexts().warnings === 540 && vscodeTexts().errors === 0, 'VS Code 问题数应为分数');
  setSkin('excel');
  // 直走到死（不再放食物）
  g.food = null; g.bonus = null;
  while (g.state === 'play') update(g.interval);
  assert(g.cause === 'wall' || g.cause === 'self', '应撞墙或撞到自己');
  assert(same(seq(before), ['start', 'achievement:len_10', 'achievement:bonus_3', 'achievement:len_30', 'achievement:full_speed',
    'achievement:score_500', 'disguise:vscode', 'disguise:excel', 'stats', 'end']), '整局消息顺序错误: ' + seq(before));
  const stats = sdkMessages.at(-2).message.stats;
  assert(same(stats, { rounds: 1, foods: 30, bonus: 6 }), 'stats 错误: ' + JSON.stringify(stats));
  for (const st of manifest.stats) assert(stats[st.key] <= st.maxPerRound, 'stats ' + st.key + ' 超过上限');
  assert(same(Object.keys(stats), manifest.stats.map(st => st.key)), 'stats 键与 game.json 不一致');
  assert(excelTexts().nameBox && (g.cause !== 'wall' || excelTexts().formula === '=SUM(#REF!)'), '撞墙后编辑栏应显示 #REF!');
  assert(vscodeTexts().errors === 1 && vscodeTexts().terminal.some(l => /Error/.test(l.text)), '死亡时终端应显示报错');
  assert(best === 540, 'best 错误');
  draw(0); setSkin('vscode'); draw(0); setSkin('excel');
  update(1);
  assert(g.state === 'over', '结束后不应再动');
  before = sdkMessages.length;
  key('ArrowUp');
  assert(sdkMessages.length === before && g.state === 'over', '结束后方向键不应重开');

  // ---- 空格重来 ----
  key(' ', { code: 'Space' });
  assert(g.state === 'ready' && g.score === 0 && g.cols === 17 && roundAchievements.size === 0, '空格应开新一局');
  before = sdkMessages.length;
  key(' ', { code: 'Space' });
  assert(g.state === 'play' && same(seq(before), ['start']), '准备状态下空格应开始');

  // ---- 撞墙：不吃东西直走 ----
  before = sdkMessages.length;
  g.food = { x: 0, y: 0 }; g.bonus = null;
  while (g.state === 'play') update(g.interval);
  assert(g.cause === 'wall' && same(seq(before), ['stats', 'end']), '撞墙消息错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, foods: 0, bonus: 0 }), '空局 stats 错误');

  // ---- 奖励过期 ----
  key(' ', { code: 'Space' }); key('ArrowRight');
  g.bonus = { x: 0, y: 0, ttl: 0.05 };
  update(0.06);
  assert(g.bonus === null && g.snake[0].x === Math.floor(g.cols / 2), '奖励应过期且蛇不动');

  // ---- 老板键：冻结并隐藏 ----
  const head = { ...g.snake[0] }, tt = g.t;
  key('Escape');
  assert(boss, 'Esc 应进入老板键');
  update(5); key('ArrowDown'); key(' ', { code: 'Space' });
  assert(same(g.snake[0], head) && g.t === tt && g.queue.length === 0, '老板键时应冻结且不接受操作');
  const bx = excelTexts(), bv = vscodeTexts();
  assert(bx.nameBox === 'A1' && bx.statusLeft === '就绪' && bx.statusRight.length === 0 && !/SUM/.test(bx.formula), '老板键时 Excel 不应有游戏信息');
  assert(bv.warnings === 0 && bv.errors === 0 && !bv.terminal.some(l => /Tests|✓ (?!Ready)/.test(l.text)), '老板键时 VS Code 不应有游戏信息');
  draw(0); setSkin('vscode'); draw(0); setSkin('excel');
  key('Escape');
  assert(!boss && paused, '退出老板键后应暂停');
  update(1);
  assert(same(g.snake[0], head), '暂停时不应移动');
  key('ArrowDown');
  assert(!paused, '方向键应继续');
  update(g.interval);
  assert(g.snake[0].y === head.y + 1, '继续后应向下走');

  // ---- 失焦暂停 ----
  listeners.blur();
  assert(paused, '失焦应暂停');
  key('KeyD');
  assert(!paused, 'WASD 应继续');

  // ---- F2 换皮肤：发送 disguise ----
  before = sdkMessages.length;
  key('F2');
  assert(skin === 'vscode' && same(seq(before), ['disguise:vscode']) && sdkMessages.at(-1).message.title === VS_TITLE, 'F2 应切到 VS Code');
  assert(g.state === 'play' && g.cols === 17, '局中换皮肤不应改变网格');
  draw(0);
  key('F2');
  assert(skin === 'excel' && sdkMessages.at(-1).message.title === XL_TITLE, 'F2 应切回 Excel');

  // ---- M 静音 ----
  key('m', { code: 'KeyM' });
  assert(muted === false, 'M 应打开声音');
  key('m', { code: 'KeyM' });
  assert(muted === true, 'M 应关闭声音');

  // ---- 触摸：滑动转向，轻点重来 ----
  while (g.state === 'play') update(g.interval);
  listeners['canvas:pointerdown']({ clientX: 10, clientY: 10 }); listeners['canvas:pointerup']({});
  assert(g.state === 'ready', '结束后轻点应重开');
  before = sdkMessages.length;
  listeners['canvas:pointerdown']({ clientX: 100, clientY: 100 });
  listeners['canvas:pointermove']({ clientX: 104, clientY: 130 });
  assert(g.state === 'play' && same(g.queue, [{ x: 0, y: 1 }]) && same(seq(before), ['start']), '下滑应转向并开始');
  listeners['canvas:pointermove']({ clientX: 70, clientY: 132 });
  assert(same(g.queue.at(-1), { x: -1, y: 0 }), '继续左滑应再转向');
  listeners['canvas:pointerup']({});
  assert(g.state === 'play', '滑动后抬手不应当作轻点');

  // ---- VS Code 皮肤下开局：网格按 VS Code 布局 ----
  while (g.state === 'play') update(g.interval);
  key('F2'); key(' ', { code: 'Space' });
  assert(g.cols === 40 && g.rows === 21, 'VS Code 新局网格应为 40×21');
  draw(0);
  key('F2');
  assert(g.cols === 17 && g.rows === 22, '准备状态下换皮肤应按新布局重排');

  // ---- 窄屏绘制冒烟 ----
  document.documentElement.clientWidth = 375; document.documentElement.clientHeight = 667;
  resize();
  assert(g.state === 'ready' && same({ cols: g.cols, rows: g.rows }, gridSize('excel', layoutBox())), '准备状态下缩放应重排网格');
  draw(0); setSkin('vscode'); draw(0); setSkin('excel');

  // ---- 消息形状 ----
  for (const { message } of sdkMessages) {
    const keys = Object.keys(message).sort().join(',');
    assert(message.source === 'moyufun-game' && message.version === 1, 'SDK 协议版本错误');
    if (message.type === 'achievement') assert(keys === 'key,source,type,version' && manifest.achievements.some(a => a.key === message.key), '成就消息错误');
    else if (message.type === 'stats') assert(keys === 'source,stats,type,version', 'stats 消息字段不精确');
    else if (message.type === 'disguise') assert(keys === 'app,source,title,type,version' && message.title.length <= 80, 'disguise 消息字段不精确');
    else assert(keys === 'source,type,version', 'SDK 消息字段不精确');
  }
  console.log('全部断言通过 ✅');
})();
`;
eval(code + driver);
