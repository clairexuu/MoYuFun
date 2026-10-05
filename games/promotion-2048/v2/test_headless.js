// 无头测试：打桩浏览器 API，驱动规则函数、整局流程与绘制冒烟（不渲染真实画布）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? s => ({ width: String(s).length * 7 }) : () => {}),
  set: () => true,
});
const canvasStub = { id: 'game', style: {}, width: 0, height: 0, addEventListener() {}, getContext: () => ctxStub };
global.window = global;
global.devicePixelRatio = 1;
global.AudioContext = undefined;
global.webkitAudioContext = undefined;
global.addEventListener = () => {};
global.requestAnimationFrame = () => {};   // 不驱动 rAF，测试手动调用 update/draw
global.setTimeout = () => 0;
const store = {};
global.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); } };
const sdkMessages = [];
global.location = { hostname: 'localhost' };
global.parent = {
  postMessage(message, targetOrigin) {
    sdkMessages.push({ message, targetOrigin });
  },
};
const docEl = { clientWidth: 1280, clientHeight: 720 };
global.document = { getElementById: () => canvasStub, documentElement: docEl };

// ---- 从 index.html 提取内联脚本 + 测试驱动 ----
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('未在 index.html 中找到 <script> 块');
const code = match[1];
const driver = `
;(function runTest() {
  const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const seq = from => sdkMessages.slice(from).map(({ message }) => message.type + (message.key ? ':' + message.key : ''));
  const key = code => ({ code, key: code, preventDefault() {} });
  assert(sdkMessages[0]?.targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  assert(same(seq(0), ['ready', 'disguise']), '页面加载只应发送 ready, disguise：' + seq(0));
  assert(sdkMessages[1].message.app === 'excel' && sdkMessages[1].message.title === 'Q4预算测算_财务部_v7.xlsx - Excel', 'disguise 内容错误');
  assert(muted, '默认应静音');
  draw();   // 首帧冒烟

  // ---- slide 表：同一行放进四条线，按四个方向各测一遍 ----
  const at = {
    left: (line, k) => line * 4 + k,
    right: (line, k) => line * 4 + 3 - k,
    up: (line, k) => k * 4 + line,
    down: (line, k) => (3 - k) * 4 + line,
  };
  const cases = [
    { input: [1, 1, 1, 1], output: [2, 2, 0, 0], merged: [2, 2] },
    { input: [1, 1, 2, 0], output: [2, 2, 0, 0], merged: [2] },
    { input: [2, 0, 0, 2], output: [3, 0, 0, 0], merged: [3] },
    { input: [1, 2, 1, 2], output: [1, 2, 1, 2], merged: [] },
  ];
  for (const dir of Object.keys(at)) {
    for (const c of cases) {
      const b = Array(16).fill(0), want = Array(16).fill(0);
      for (let line = 0; line < 4; line++) for (let k = 0; k < 4; k++) {
        b[at[dir](line, k)] = c.input[k]; want[at[dir](line, k)] = c.output[k];
      }
      const copy = b.slice(), r = slide(b, dir);
      assert(same(b, copy), 'slide 修改了输入棋盘');
      assert(same(r.board, want), dir + ' ' + c.input + ' → ' + r.board);
      assert(same(r.merged, [].concat(c.merged, c.merged, c.merged, c.merged)), dir + ' merged 错误: ' + r.merged);
      assert(r.moved === (c.merged.length > 0 || c.input.join() !== c.output.join()), dir + ' moved 错误');
      assert(r.gain === r.merged.reduce((s, lv) => s + 2 ** lv, 0), dir + ' gain 错误');
    }
  }
  assert(!canMove([1,2,1,2, 2,1,2,1, 1,2,1,2, 2,1,2,1]), 'canMove 应为 false');
  assert(canMove([1,2,1,2, 2,1,2,1, 1,2,1,2, 2,1,2,2]), 'canMove 应为 true');
  assert(scaleColor(1) === '#ffffff' && scaleColor(6) === '#ffeb84' && scaleColor(11) === '#63be7b' && scaleColor(13) === '#63be7b', '色阶端点错误');

  // ---- 模拟：20 局随机移动直到无路可走，每步推进动画并绘制 ----
  let seed = 42;
  rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const dirs = ['left', 'right', 'up', 'down'];
  let bestLv = 0;
  for (let round = 0; round < 20; round++) {
    startGame();
    for (let n = 0; !over; n++) {
      assert(n < 100000, '模拟未结束');
      move(dirs[Math.floor(rng() * 4)]);
      if (n % 7 === 0) { update(0.05); draw(); update(0.05); draw(); update(0.5); draw(); }
      assert(board.length === 16 && board.every(lv => Number.isInteger(lv) && lv >= 0 && lv <= 11), '棋盘非法: ' + board);
    }
    assert(dialog === 'over', '无路可走应弹出「无法完成此操作」');
    draw();
    assert(same(seq(sdkMessages.length - 2), ['stats', 'end']), '每局应以 stats, end 结束');
    bestLv = Math.max(bestLv, ...board);
  }
  console.log('20 局随机模拟完成，最大值：' + 2 ** bestLv);
  assert(Number(store['moyufun:promotion-2048:best']) === best && best > 0, '历史最佳未保存');

  // ---- 弹窗按钮：确定重开（点击命中当前帧的区域） ----
  draw();
  const ok = ui.find(b => b.act === 'restart');
  assert(ok, '弹窗应有确定按钮');
  clickAt(ok.x + 5, ok.y + 5);
  assert(!over && !dialog && !hasMoved, '确定应开新局');

  // ---- 确定性一局：成就顺序与 stats ----
  const realSpawn = spawn;
  spawn = () => { if (board[15]) return -1; board[15] = 1; return 15; };
  const rows = (...rs) => { const b = Array(16).fill(0); rs.forEach((r, i) => r.forEach((v, k) => b[i * 4 + k] = v)); return b; };
  let before = sdkMessages.length;
  startGame();
  board = rows([4, 4, 0, 0]); move('left');
  assert(same(active, { name: 'C4', formula: '=C4+D4' }), '合并后选中框应跳到合并格: ' + JSON.stringify(active));
  board = rows([5, 5, 0, 0], [5, 5, 0, 0]); move('left');
  board = rows([8, 8, 0, 0]); move('left');
  board = rows([10, 10, 0, 0]); move('left');
  assert(won && dialog === 'win' && !over, '合成 2048 后应打开弹窗且本局未结束');
  draw();
  move('right');
  assert(board[0] === 11, '弹窗打开时不应移动');
  onKey(key('KeyS'));
  assert(over && dialog === 'saved', '停止(S) 应结束本局');
  const expected = ['start', 'achievement:manager', 'achievement:double', 'achievement:ceo', 'achievement:no_undo', 'achievement:freedom', 'stats', 'end'];
  assert(same(seq(before), expected), '成就消息顺序错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 1, merges: 5 }), 'stats 错误: ' + JSON.stringify(sdkMessages.at(-2).message.stats));
  onKey(key('Enter'));
  assert(!over && !dialog, '确定（Enter）应开新局');

  // ---- 继续(C) ----
  board = rows([10, 10, 0, 0]); move('left');
  onKey(key('KeyC'));
  assert(!dialog && !over, '继续(C) 应关闭弹窗继续本局');
  move('down');
  assert(board[12] === 11, '继续后应能移动');

  // ---- 撤销：Ctrl+Z / Cmd+Z，每局一次 ----
  startGame();
  board = rows([1, 1, 0, 0]); score = 7;
  const snap = board.slice();
  move('left');
  assert(score === 11, '合并后分数应为 11');
  onKey(Object.assign(key('KeyZ'), { metaKey: true }));
  assert(same(board, snap) && score === 7 && undoUsed, 'Cmd+Z 未精确恢复棋盘和分数');
  move('left'); onKey(Object.assign(key('KeyZ'), { ctrlKey: true }));
  assert(score === 11, '每局只能撤销一次');
  before = sdkMessages.length;
  board = rows([8, 8, 0, 0]); move('left');
  assert(same(seq(before), ['achievement:ceo']), '撤销后合成 512 应只发送 ceo: ' + seq(before));

  // ---- 老板键：冻结动画、隐藏状态、屏蔽输入 ----
  board = rows([1, 1, 0, 0]); move('left');
  const t0 = anim.t, b0 = board.slice();
  onKey(key('Escape'));
  assert(boss, 'Esc 应进入老板模式');
  update(1); draw();
  assert(anim && anim.t === t0, '老板模式应冻结动画');
  onKey(key('ArrowRight')); onKey(Object.assign(key('KeyZ'), { ctrlKey: true })); clickAt(0, 0);
  assert(same(board, b0), '老板模式应屏蔽输入');
  assert(!ui.some(b => b.act === 'restart' || b.act === 'continue'), '老板模式不画弹窗');
  onKey(key('Escape'));
  assert(!boss, '再按 Esc 恢复');
  update(1);
  assert(anim === null && shownScore === score, '恢复后动画结束、计数到位');

  // ---- 方向键与 WASD；带 Ctrl 的 WASD 不移动 ----
  board = rows([0, 0, 0, 1]); onKey(Object.assign(key('KeyA'), { ctrlKey: true }));
  assert(board[3] === 1, 'Ctrl+A 不应移动');
  onKey(key('KeyA'));
  assert(board[0] === 1, 'A 应向左移动');
  onKey(key('KeyM'));
  assert(!muted, 'M 应打开声音');
  onKey(key('KeyM'));

  // ---- 新建：Ctrl+N 与功能区按钮 ----
  before = sdkMessages.length;
  onKey(Object.assign(key('KeyN'), { ctrlKey: true }));
  assert(same(seq(before), ['stats', 'end']) && !hasMoved, '中途 Ctrl+N 应结算并开新局: ' + seq(before));
  assert(sdkMessages.at(-2).message.stats.wins === 0, '未合成 2048 的局 wins 应为 0');
  before = sdkMessages.length;
  draw();
  const nb = ui.find(b => b.act === 'new');
  clickAt(nb.x + 3, nb.y + 3);
  assert(sdkMessages.length === before, '未移动就新建不应发送消息: ' + seq(before));
  move('left'); move('right');
  assert(same(seq(before), ['start']), '新一局第一次移动才发送 start: ' + seq(before));
  spawn = realSpawn;

  // ---- 任意窗口尺寸都能绘制 ----
  for (const [w, h] of [[320, 260], [375, 667], [800, 600], [1920, 1080], [3000, 400]]) {
    docEl.clientWidth = w; docEl.clientHeight = h; resize();
    assert(view.zoom >= 0.6 && view.zoom <= 1.5, '缩放越界: ' + view.zoom);
    dialog = 'over'; draw(); dialog = null; draw();
  }

  for (const { message } of sdkMessages) {
    const keys = Object.keys(message).sort().join(',');
    assert(message.source === 'moyufun-game' && message.version === 1, 'SDK 协议版本错误');
    if (message.type === 'achievement') assert(keys === 'key,source,type,version', '成就消息字段不精确');
    else if (message.type === 'stats') assert(keys === 'source,stats,type,version', 'stats 消息字段不精确');
    else if (message.type === 'disguise') assert(keys === 'app,source,title,type,version', 'disguise 消息字段不精确');
    else assert(keys === 'source,type,version', 'SDK 消息字段不精确');
  }
  console.log('全部断言通过 ✅');
})();
`;
eval(code + driver);
