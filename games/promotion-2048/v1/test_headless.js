// 无头测试：打桩浏览器 API，驱动规则函数与整局流程（不渲染真实 DOM）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
function makeEl(id) {
  return {
    id,
    style: { setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {},
    appendChild() {},
    innerHTML: '',
    textContent: '',
    disabled: false,
  };
}
const domEls = {};
global.window = global;
global.AudioContext = undefined;
global.webkitAudioContext = undefined;
global.addEventListener = () => {};
global.setTimeout = () => 0;   // 不驱动动画与提示计时
global.clearTimeout = () => {};
const sdkMessages = [];
global.location = { hostname: 'localhost' };
global.parent = {
  postMessage(message, targetOrigin) {
    sdkMessages.push({ message, targetOrigin });
  },
};
global.document = {
  getElementById: id => (domEls[id] ||= makeEl(id)),
  createElement: () => makeEl('div'),
};

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
  assert(sdkMessages[0]?.message.type === 'ready', 'SDK 未发送 ready');
  assert(sdkMessages[0]?.targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  assert(sdkMessages.length === 1, '页面加载只应发送 ready，start 等第一次移动');

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

  // ---- 模拟：20 局随机移动直到无路可走 ----
  let seed = 42;
  rng = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const dirs = ['left', 'right', 'up', 'down'];
  let best = 0;
  for (let round = 0; round < 20; round++) {
    startGame();
    for (let n = 0; !over; n++) {
      assert(n < 100000, '模拟未结束');
      move(dirs[Math.floor(rng() * 4)]);
      assert(board.length === 16 && board.every(lv => Number.isInteger(lv) && lv >= 0 && lv <= 11), '棋盘非法: ' + board);
      assert(board.filter(lv => !lv).length + board.filter(lv => lv).length === 16, '格子计数错误');
    }
    assert(same(seq(sdkMessages.length - 2), ['stats', 'end']), '每局应以 stats, end 结束');
    best = Math.max(best, ...board);
  }
  console.log('20 局随机模拟完成，最高职位：' + TITLES[best].name);

  // ---- 确定性一局：成就顺序与 stats ----
  const realSpawn = spawn;
  spawn = () => { if (board[15]) return -1; board[15] = 1; return 15; };
  const rows = (...rs) => { const b = Array(16).fill(0); rs.forEach((r, i) => r.forEach((v, k) => b[i * 4 + k] = v)); return b; };
  let before = sdkMessages.length;
  startGame();
  board = rows([4, 4, 0, 0]); move('left');
  board = rows([5, 5, 0, 0], [5, 5, 0, 0]); move('left');
  board = rows([8, 8, 0, 0]); move('left');
  board = rows([10, 10, 0, 0]); move('left');
  assert(won && overlayOpen && !over, '财务自由后应打开弹窗且本局未结束');
  retire();
  const expected = ['start', 'achievement:manager', 'achievement:double', 'achievement:ceo', 'achievement:no_undo', 'achievement:freedom', 'stats', 'end'];
  assert(same(seq(before), expected), '成就消息顺序错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 1, merges: 5 }), 'stats 错误: ' + JSON.stringify(sdkMessages.at(-2).message.stats));

  // ---- 撤回 ----
  startGame();
  board = rows([1, 1, 0, 0]); score = 7;
  const snap = board.slice();
  move('left');
  assert(score === 11, '合并后分数应为 11');
  undo();
  assert(same(board, snap) && score === 7, '撤回未精确恢复棋盘和分数');
  assert(domEls.undo.textContent === '背锅侠 ×0' && domEls.undo.disabled, '撤回按钮未更新');
  move('left'); undo();
  assert(score === 11, '每局只能撤回一次');
  before = sdkMessages.length;
  board = rows([8, 8, 0, 0]); move('left');
  assert(same(seq(before), ['achievement:ceo']), '撤回后合成 CEO 应只发送 ceo: ' + seq(before));

  // ---- 重开：有移动则先结算，无移动什么都不发 ----
  before = sdkMessages.length;
  startGame();
  assert(same(seq(before), ['stats', 'end']), '中途重开应发送 stats, end: ' + seq(before));
  assert(sdkMessages.at(-2).message.stats.wins === 0, '未财务自由的局 wins 应为 0');
  before = sdkMessages.length;
  startGame();
  assert(sdkMessages.length === before, '未移动就重开不应发送消息: ' + seq(before));
  move('left'); move('right');
  assert(same(seq(before), ['start']), '新一局第一次移动才发送 start: ' + seq(before));
  spawn = realSpawn;

  for (const { message } of sdkMessages) {
    const keys = Object.keys(message).sort().join(',');
    assert(message.source === 'moyufun-game' && message.version === 1, 'SDK 协议版本错误');
    if (message.type === 'achievement') assert(keys === 'key,source,type,version', '成就消息字段不精确');
    else if (message.type === 'stats') assert(keys === 'source,stats,type,version', 'stats 消息字段不精确');
    else assert(keys === 'source,type,version', 'SDK 消息字段不精确');
  }
  console.log('全部断言通过 ✅');
})();
`;
eval(code + driver);
