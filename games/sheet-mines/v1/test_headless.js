// 无头测试：打桩浏览器 API，驱动纯规则、求解器、整局流程和输入（不渲染真实画布）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? s => ({ width: String(s).length * 7 }) : () => {}),
  set: () => true,
});
const canvasHandlers = {}, windowHandlers = {}, timers = [];
const canvasStub = {
  style: {}, width: 0, height: 0, getContext: () => ctxStub,
  addEventListener: (type, fn) => { canvasHandlers[type] = fn; },
};
global.window = global;
global.devicePixelRatio = 1;
global.AudioContext = undefined;
global.webkitAudioContext = undefined;
global.addEventListener = (type, fn) => { windowHandlers[type] = fn; };
global.requestAnimationFrame = () => {};   // 不驱动 rAF，时间只由 update(dt) 推进
global.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return 0; };
const sdkMessages = [];
global.location = { hostname: 'localhost' };
global.parent = { postMessage(message, targetOrigin) { sdkMessages.push({ message, targetOrigin }); } };
global.document = { getElementById: () => canvasStub, documentElement: { clientWidth: 1280, clientHeight: 720 } };

// ---- 从 index.html 提取内联脚本 + 测试驱动 ----
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('未在 index.html 中找到 <script> 块');
const driver = `
;(function runTest() {
  const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const seq = from => sdkMessages.slice(from).map(({ message }) => message.type + (message.key ? ':' + message.key : ''));

  // ---- 加载：ready + disguise，0.5/2/5 s 重复，不发 start ----
  assert(same(seq(0), ['ready', 'disguise']), '加载消息错误: ' + seq(0));
  assert(sdkMessages[0].targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  const d = sdkMessages[1].message;
  assert(d.app === 'excel' && d.title === TITLE && d.title.length <= 80 && Object.keys(d).length === 5, 'disguise 消息错误');
  assert(same(timers.map(t => t.ms), [500, 2000, 5000]), 'ready 重发时间错误');
  timers.forEach(t => t.fn());
  assert(same(seq(0), Array(4).fill(['ready', 'disguise']).flat()), 'ready 重发后应跟 disguise: ' + seq(0));
  assert(muted === true, '声音默认应关闭');
  draw();   // 首帧冒烟

  // ---- 纯规则 ----
  assert(same(neighbors(9, 9, 0), [1, 9, 10]) && neighbors(9, 9, 40).length === 8, 'neighbors 错误');
  assert(colName(0) === 'A' && colName(25) === 'Z' && colName(26) === 'AA' && colName(31) === 'AF', 'colName 错误');
  // 2×3 盘，首击 0，唯一的雷在 4 或 5：两个 1 对称，是真正的五五开，求解器必须放弃。
  assert(!solves(2, 3, Uint8Array.from([0, 0, 0, 0, 1, 0]), 0), '五五开盘面不应判为可解');
  assert(solves(2, 3, Uint8Array.from([0, 0, 0, 0, 1, 1]), 0), '全局雷数规则应能解开');
  for (const [L, lv] of LEVELS.map((L, k) => [L, k])) {
    for (let seed = 1; seed <= 15; seed++) {
      const r = mulberry32(seed), b = makeBoard(lv), first = Math.floor(r() * L.cols * L.rows);
      generateBoard(b, first, r);
      const m = b.mine.reduce((s, v) => s + v, 0);
      assert(m === L.mines, L.name + ' 雷数错误');
      assert(b.noGuess && b.attempts <= MAX_ATTEMPTS, L.name + ' 未生成无猜盘面');
      assert(!b.mine[first] && b.adj[first] === 0, L.name + ' 首击不是 0');
      assert(neighbors(L.cols, L.rows, first).every(j => !b.mine[j]), L.name + ' 首击周围有雷');
      assert(solves(L.cols, L.rows, b.mine, first), L.name + ' 生成的盘面求解器解不开');
      const opened = openCells(b, first);
      assert(opened.length > 1 && opened[0][0] === first && opened[0][1] === 0, L.name + ' 首击没有展开一片');
    }
  }
  // 上限兜底：五五开的盘面永远解不开，用最后一盘，noGuess = false。
  const tiny = { cols: 2, rows: 3, mines: 1, st: new Uint8Array(6), opened: 0, flags: 0, hit: -1 };
  generateBoard(tiny, 0, mulberry32(1), 5);
  assert(tiny.attempts === 5 && !tiny.noGuess && tiny.mine.reduce((s, v) => s + v, 0) === 1, '兜底生成错误');

  // ---- 整局：按雷图翻开所有安全格 ----
  function clearAll() {
    for (let i = 0; i < board.st.length && phase === 'play'; i++) if (!board.mine[i] && board.st[i] === 0) assert(act(i), '翻格失败 ' + i);
  }
  const startAt = (lv, c, r) => { newRound(lv); setSeed(lv + 11); return act(idx(c, r)); };

  // 初级：没插旗、0 秒 → win_easy, quick_easy（no_flags 只算中级/高级）
  let before = sdkMessages.length;
  assert(!flag(idx(0, 0)), 'idle 时不应能标记');
  assert(startAt(0, 4, 4) && phase === 'play', '首击未开局');
  assert(same(seq(before), ['start']), '首击应只发 start: ' + seq(before));
  clearAll();
  assert(phase === 'won', '初级应获胜');
  assert(board.flags === board.mines && statusRight().includes('计数: 0'), '获胜后雷应全部标出');
  assert(same(seq(before), ['start', 'achievement:win_easy', 'achievement:quick_easy', 'stats', 'end']), '初级消息错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 1, cells: 71 }), '初级 stats 错误');
  update(1); draw();
  assert(statusLeft().includes('核对完成'), '获胜状态栏错误');
  assert(act(0) && phase === 'idle' && level === 0, '结束后单击应新开一局');

  // 中级：不插旗 → win_medium, no_flags
  before = sdkMessages.length;
  startAt(1, 8, 8); clearAll();
  assert(same(seq(before), ['start', 'achievement:win_medium', 'achievement:no_flags', 'stats', 'end']), '中级消息错误: ' + seq(before));

  // 高级：插旗、超时 → 只有 win_hard
  before = sdkMessages.length;
  startAt(2, 15, 8);
  const someMine = board.mine.findIndex((m, i) => m && board.st[i] === 0);
  assert(flag(someMine) && board.st[someMine] === 2 && statusRight().includes('计数: 98'), '标记失败');
  assert(!act(someMine), '标记的格子不应能翻开');
  assert(flag(someMine) && board.st[someMine] === 0 && flag(someMine), '取消标记失败');
  update(301);
  assert(statusRight().includes('求和: 301'), '计时错误: ' + statusRight());
  clearAll();
  assert(same(seq(before), ['start', 'achievement:win_hard', 'stats', 'end']), '高级消息错误: ' + seq(before));
  assert(sdkMessages.at(-2).message.stats.cells === 30 * 16 - 99, '高级 cells 错误');

  // 高级：和弦 15 次 → batch（局中发），之后 win_hard, quick_hard
  before = sdkMessages.length;
  startAt(2, 15, 8);
  for (let guard = 0; chords < 15 && guard < 500; guard++) {
    const i = board.st.findIndex((s, i) => s === 1 && board.adj[i] && neighbors(board.cols, board.rows, i).some(j => board.st[j] === 0 && !board.mine[j]));
    assert(i >= 0, '找不到可和弦的数字');
    for (const j of neighbors(board.cols, board.rows, i)) if (board.mine[j] && board.st[j] === 0) flag(j);
    assert(act(i), '和弦失败');
  }
  assert(chords === 15 && same(seq(before), ['start', 'achievement:batch']), 'batch 错误: ' + seq(before));
  clearAll();
  assert(same(seq(before), ['start', 'achievement:batch', 'achievement:win_hard', 'achievement:quick_hard', 'stats', 'end']), '和弦局消息错误: ' + seq(before));

  // 和弦条件不满足 → 不动
  startAt(0, 4, 4);
  const num = board.st.findIndex((s, i) => s === 1 && board.adj[i]);
  assert(!act(num) && chordCells(board, num) === null, '未满足的和弦不应生效');

  // 失败：翻到雷 → stats(wins 0), end；#N/A
  before = sdkMessages.length;
  const boom = board.mine.findIndex(Boolean);
  assert(act(boom) && phase === 'lost' && board.hit === boom, '翻雷未判负');
  assert(same(seq(before), ['stats', 'end']) && sdkMessages.at(-2).message.stats.wins === 0, '失败消息错误: ' + seq(before));
  assert(!act(0) && phase === 'lost', '刚结束 0.4 s 内单击不应重开');
  update(1);
  const bc = boom % board.cols, br = Math.floor(boom / board.cols);
  assert(gameCell(bc + 1, br + 2).text === '#N/A', '踩中的雷应显示 #N/A');
  sel = { c: bc, r: br }; assert(formula() === '=NA()', '编辑栏应显示 =NA()');
  draw();

  // 错误标记 + 和弦踩雷
  newRound(0); setSeed(31); act(idx(4, 4));
  const safeHidden = i => neighbors(board.cols, board.rows, i).filter(j => board.st[j] === 0 && !board.mine[j]);
  const n2 = board.st.findIndex((s, i) => s === 1 && board.adj[i] && safeHidden(i).length >= board.adj[i]);
  assert(n2 >= 0, '找不到可以错标的数字');
  const wrong = safeHidden(n2).slice(0, board.adj[n2]);
  wrong.forEach(flag);
  assert(act(n2) && phase === 'lost', '错误标记后和弦应踩雷');
  update(1);
  assert(gameCell(wrong[0] % board.cols + 1, Math.floor(wrong[0] / board.cols) + 2).text === '#REF!', '错误标记应显示 #REF!');

  // 中途换表：已开局 → stats(wins 0) + end；未开局换表不发消息
  before = sdkMessages.length;
  startAt(0, 4, 4);
  switchLevel(1);
  assert(level === 1 && phase === 'idle' && same(seq(before), ['start', 'stats', 'end']), '中途换表消息错误: ' + seq(before));
  before = sdkMessages.length;
  switchLevel(2); switchLevel(2); switchLevel(9);
  assert(level === 2 && seq(before).length === 0, '未开局换表不应发消息');

  // ---- 老板键：冻结计时、隐藏棋盘、屏蔽操作 ----
  startAt(0, 4, 4);
  windowHandlers.keydown({ key: 'Escape', code: 'Escape', preventDefault() {} });
  assert(boss, 'Esc 应进入老板模式');
  const t0 = gameT; update(5);
  assert(gameT === t0, '老板模式应冻结计时');
  assert(!act(idx(0, 0)) && !flag(idx(0, 0)), '老板模式应屏蔽操作');
  assert(address() === 'A1' && !formula().includes('VLOOKUP') && statusLeft() === '就绪' && !statusRight().includes('求和: 0'), '老板模式应显示普通文档');
  draw();
  windowHandlers.keydown({ key: 'Escape', code: 'Escape', preventDefault() {} });
  update(1);
  assert(!boss && gameT === t0 + 1, 'Esc 再按应恢复');

  // ---- 键盘 ----
  const key = (k, code) => windowHandlers.keydown({ key: k, code: code || '', preventDefault() {} });
  newRound(1); sel = { c: 0, r: 0 };
  key('ArrowLeft'); key('ArrowUp');
  assert(sel.c === 0 && sel.r === 0, '选区应限制在棋盘内');
  key('ArrowRight'); key('ArrowRight'); key('ArrowDown');
  assert(sel.c === 2 && sel.r === 1 && address() === 'D4', '方向键 / 名称框错误: ' + address());
  key(' ');
  assert(phase === 'play' && board.st[idx(2, 1)] === 1, '空格应翻开');
  const hid = board.st.findIndex(s => s === 0);
  sel = { c: hid % board.cols, r: Math.floor(hid / board.cols) };
  key('f', 'KeyF');
  assert(board.st[hid] === 2, 'F 应标记');
  key('m', 'KeyM');
  assert(muted === false && statusLeft() === '声音: 开', 'M 应切换声音');
  key('m', 'KeyM');
  key('PageDown');
  assert(level === 2 && phase === 'idle', 'PageDown 应切到下一张表');

  // ---- 指针：点击、右键、长按、标签页；命中测试用当前布局 ----
  const at = (c, r) => { const q = cellRect(c, r); return { clientX: q.x + q.w / 2, clientY: q.y + q.h / 2 }; };
  newRound(0);
  canvasHandlers.pointerdown({ ...at(3, 3), button: 0, pointerType: 'mouse' });
  canvasHandlers.pointerup(at(3, 3));
  assert(phase === 'play' && board.st[idx(3, 3)] === 1 && sel.c === 3 && sel.r === 3, '左键点击应翻开');
  const h1 = board.st.findIndex(s => s === 0), hc = h1 % board.cols, hr = Math.floor(h1 / board.cols);
  canvasHandlers.pointerdown({ ...at(hc, hr), button: 2, pointerType: 'mouse' });
  assert(board.st[h1] === 2, '右键应标记');
  canvasHandlers.pointerup(at(hc, hr));
  assert(board.st[h1] === 2, '右键松开不应翻开');
  canvasHandlers.pointerdown({ ...at(hc, hr), button: 0, pointerType: 'touch' });
  update(0.5);
  assert(board.st[h1] === 0, '长按应取消标记');
  canvasHandlers.pointerup(at(hc, hr));
  assert(board.st[h1] === 0, '长按后松开不应翻开');
  canvasHandlers.pointerdown({ ...at(hc, hr), button: 0, pointerType: 'touch' });
  windowHandlers.blur();
  update(1);
  canvasHandlers.pointerup(at(hc, hr));
  assert(board.st[h1] === 0, '失焦应释放按住的输入');
  canvasHandlers.pointerdown({ ...at(hc, hr), button: 0, pointerType: 'mouse' });
  update(1);
  assert(board.st[h1] === 0, '鼠标按住不应触发长按标记');
  canvasHandlers.pointerup({ clientX: -50, clientY: -50 });
  assert(board.st[h1] === 0, '拖出格子松开不应翻开');
  before = sdkMessages.length;
  canvasHandlers.pointerdown({ clientX: TAB_X + TAB_W * 2 + 5, clientY: view.h - BOTTOM + 14, button: 0, pointerType: 'mouse' });
  assert(level === 2 && same(seq(before), ['stats', 'end']), '点高级标签应换表并结束当前局');

  // ---- 任意窗口大小：棋盘完整放进表格区 ----
  for (const [w, h] of [[1280, 720], [1100, 620], [800, 600], [375, 667], [1920, 1080], [320, 240]]) {
    document.documentElement.clientWidth = w; document.documentElement.clientHeight = h;
    resize();
    for (let lv = 0; lv < 3; lv++) {
      newRound(lv);
      const g = geom(), q = cellRect(board.cols - 1, board.rows - 1, g);
      assert(g.z >= 0.1 && g.z <= 1.4, '缩放越界');
      if (h >= 400) assert(q.x + q.w <= w && q.y + q.h <= h - BOTTOM, LEVELS[lv].name + ' 在 ' + w + '×' + h + ' 放不下');
      const hit = cellAt(q.x + q.w / 2, q.y + q.h / 2);
      assert(hit && hit.c === board.cols - 1 && hit.r === board.rows - 1, '命中测试错误 ' + w + '×' + h);
      draw();
    }
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
eval(match[1] + driver);
