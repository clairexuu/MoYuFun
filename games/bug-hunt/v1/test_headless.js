// 无头测试：打桩浏览器 API，驱动语料、关卡生成、点击判定和整局流程（不渲染真实画布）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
const ctxStub = new Proxy({}, {
  get: (_, k) => (k === 'measureText' ? s => ({ width: String(s).length * 7 }) : () => {}),
  set: () => true,
});
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const corpusText = html.match(/<script type="text\/plain" id="corpus">([\s\S]*?)<\/script>/)[1];
const canvasStub = { style: {}, addEventListener() {}, getContext: () => ctxStub, width: 0, height: 0 };
const listeners = {};
global.window = global;
global.devicePixelRatio = 1;
global.AudioContext = undefined;
global.webkitAudioContext = undefined;
global.addEventListener = (type, fn) => { (listeners[type] ||= []).push(fn); };
global.requestAnimationFrame = () => {};   // 不驱动 rAF，时间只由 update(dt) 推进
global.setTimeout = () => 0;
const sdkMessages = [];
global.location = { hostname: 'localhost' };
global.parent = { postMessage(message, targetOrigin) { sdkMessages.push({ message, targetOrigin }); } };
const docEl = { clientWidth: 1280, clientHeight: 800 };
global.document = {
  title: '',
  documentElement: docEl,
  getElementById: id => (id === 'corpus' ? { textContent: corpusText } : canvasStub),
};

// ---- 从 index.html 提取主脚本 + 测试驱动 ----
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('未在 index.html 中找到 <script> 块');
const driver = `
;(function runTest() {
  const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const seq = from => sdkMessages.slice(from).map(({ message }) => message.type + (message.key ? ':' + message.key : ''));
  const key = e => listeners.keydown.forEach(fn => fn({ key: e, code: e === 'm' ? 'KeyM' : '', preventDefault() {} }));

  // ---- 加载：ready + disguise，没有 start ----
  assert(same(seq(0), ['ready', 'disguise']), '加载应只发送 ready、disguise: ' + seq(0));
  assert(sdkMessages[0].targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  const dg = sdkMessages[1].message;
  assert(dg.app === 'vscode' && dg.title === TITLE && TITLE.length >= 1 && TITLE.length <= 80 && !/[\\u0000-\\u001f\\u007f]/.test(TITLE), 'disguise 内容错误');
  assert(document.title === TITLE, 'document.title 应为伪装标题');
  assert(state === 'ready' && muted && !boss, '初始应为 ready、静音、非老板模式');
  draw();

  // ---- 语料 ----
  assert(CORPUS.length === 24, '语料应有 24 段，实际 ' + CORPUS.length);
  CORPUS.forEach((lines, k) => {
    assert(lines.length >= 20 && lines.length <= 40, '语料 ' + k + ' 行数 ' + lines.length + ' 不在 20–40');
    for (const line of lines) {
      assert(/^[\\x20-\\x7e]*$/.test(line), '语料 ' + k + ' 含非 ASCII 或制表符: ' + line);
      assert(line.length <= 66, '语料 ' + k + ' 行过长: ' + line);
      assert(tokenize(line).map(t => t.t).join('') === line, '分词不能还原: ' + line);
    }
  });

  // ---- 生成器：确定、不重叠、确实改了、无易混字符 ----
  const LOOK = { '0': 'o', 'O': 'o', 'o': 'o', '1': 'l', 'l': 'l', 'I': 'l', 'i': 'l' };
  const norm = s => [...s].map(c => LOOK[c] || c).join('');
  const opsSeen = new Set();
  for (let n = 1; n <= 14; n++) for (let seed = 1; seed <= 40; seed++) {
    const lv = generateLevel(n, seed);
    assert(same(lv, generateLevel(n, seed)), '关卡不确定 n=' + n + ' seed=' + seed);
    assert(lv.diffs.length === diffCount(n), '改动数错误 n=' + n + ' seed=' + seed + ': ' + lv.diffs.length);
    assert(new Set(lv.diffs.map(d => d.line)).size === lv.diffs.length, '同一行出现两处改动');
    assert(lv.left.length === lv.right.length, '左右行数不同');
    lv.left.forEach((line, i) => {
      const d = lv.diffs.find(x => x.line === i);
      if (!d) return assert(lv.right[i] === line, '未改动的行不同');
      opsSeen.add(d.op);
      assert(lv.right[i] !== line, '改动没有改变文本: ' + d.op);
      assert(line.slice(d.l[0], d.l[1]) === d.from && lv.right[i].slice(d.r[0], d.r[1]) === d.to, '改动区间错误');
      assert(line.slice(0, d.l[0]) === lv.right[i].slice(0, d.r[0]) && line.slice(d.l[1]) === lv.right[i].slice(d.r[1]), '改动外的文本被改');
      assert(norm(d.from) !== norm(d.to), '易混字符改动: ' + d.from + ' → ' + d.to);
      assert(d.to.length - d.from.length <= 9 && d.to.trim() && d.from.trim(), '改动过大或为空白');
    });
    if (n === 1) assert(lv.diffs.every(d => d.tier === 1) && lv.funcs.length === 1, '第 1 关应只有简单改动、1 段代码');
  }
  for (const op of Object.keys(OPS)) assert(opsSeen.has(op), '算子从未出现: ' + op);
  assert(funcCount(6) === 3 && generateLevel(6, 1).left.length > 60, '第 6 关起应为 3 段代码');

  // ---- 布局：并排 / 上下，面板不重叠且在窗口内 ----
  for (const [w, h] of [[1280, 800], [1920, 1080], [900, 600], [600, 900], [375, 667]]) {
    docEl.clientWidth = w; docEl.clientHeight = h; resize();
    const L = layout(liveView);
    const [a, b] = L.panes;
    assert(L.font >= 8 && L.font <= 13 && L.lh > 0, '字号错误 ' + w + 'x' + h);
    assert(b.x + b.w <= w && b.y + b.h <= h && a.x >= 0, '编辑区越界 ' + w + 'x' + h);
    assert(L.stacked ? a.y + a.h <= b.y : a.x + a.w <= b.x, '两栏重叠 ' + w + 'x' + h);
    if (w >= 1280) assert(!L.stacked && L.font >= 10, '宽屏应并排且字号 ≥ 10');
    draw();
  }
  docEl.clientWidth = 1280; docEl.clientHeight = 800; resize();

  // ---- 点击判定：空白不罚，点错扣 3 秒，红波浪线 ----
  newRun(42);
  let before = sdkMessages.length;
  const lv1 = liveView.lv;
  const clean = lv1.left.findIndex((s, i) => !liveView.byLine.has(i) && s.trim().length > 3);
  const ws = liveView.pr[clean].find(t => t.k === 'ws');
  assert(clickCode('r', clean, ws.c + 0.2) === 'none' && state === 'ready', '点空白不应开局');
  const t0 = clock;
  const tok = liveView.pr[clean].find(t => t.k !== 'ws');
  assert(clickCode('r', clean, tok.c + 0.2) === 'wrong', '点没改动的记号应判错');
  assert(state === 'play' && same(seq(before), ['start']), '第一次真实点击应发送 start: ' + seq(before));
  assert(clock === t0 - WRONG_PENALTY && wrongs === 1 && fx.wrong.length === 1, '点错应扣 3 秒并画波浪线');
  update(1.1);
  assert(fx.wrong.length === 0 && Math.abs(clock - (t0 - WRONG_PENALTY - 1.1)) < 1e-9, '波浪线应消失、时钟应走');

  // ---- 通过 handleClick 的真实坐标点中一处改动 ----
  const d0 = lv1.diffs[0];
  setScroll(0);
  const L = layout(liveView), p = L.panes[1];
  setScroll(Math.max(0, d0.line - 3));
  handleClick(p.cx + (d0.r[0] + 0.3) * L.chw, p.cy + (d0.line - scroll + 0.5) * L.lh);
  assert(d0.found && finds === 1 && caret.side === 'r' && caret.line === d0.line, '坐标点击应找到改动');
  assert(clickCode('l', d0.line, d0.l[0]) === 'none' && clock < t0, '已找到的改动再点不罚');

  // ---- Tab 提示：扣 10 秒，指向未找到的改动 ----
  const c1 = clock;
  key('Tab');
  assert(hints === 1 && clock === c1 - HINT_PENALTY && fx.hint && !fx.hint.d.found, 'Tab 提示应扣 10 秒并指向未找到的改动');

  // ---- 老板键：冻结时间、点击无效、绘制普通对比视图 ----
  key('Escape');
  const c2 = clock;
  update(5);
  assert(boss && clock === c2 && clickCode('r', lv1.diffs[1].line, lv1.diffs[1].r[0]) === 'none', '老板模式应冻结并忽略点击');
  draw();
  key('Escape');
  assert(!boss, 'Esc 再按应恢复');
  key('m');
  assert(!muted, 'M 应开启声音');
  key('m');

  // ---- 确定性通关 10 轮：成就顺序 ----
  function clearCurrent(pane) {
    for (const d of liveView.lv.diffs) if (!d.found) {
      const [a] = pane === 'l' ? d.l : d.r;
      assert(clickCode(pane, d.line, a + 0.1) === 'find', '点中改动应判对');
    }
    assert(state === 'clear', '找完应进入本轮完成');
    update(CLEAR_PAUSE + 0.01);
    assert(state === 'play', '停顿后应进入下一轮');
  }
  before = sdkMessages.length;
  const expectFinds = [];
  for (let n = 1; n <= 10; n++) {
    assert(level === n, '轮次错误 ' + level);
    clearCurrent(n % 2 ? 'r' : 'l');
    expectFinds.push(diffCount(n));
  }
  const total = expectFinds.reduce((s, x) => s + x, 0);
  assert(levelsCleared === 10 && finds === total, '应通过 10 轮、找到 ' + total + ' 处');
  update(1e4);
  assert(state === 'over', '时间用完应结束');
  assert(same(seq(before), ['achievement:quick_eye', 'achievement:perfect', 'achievement:level_5', 'achievement:finds_30', 'achievement:level_10', 'stats', 'end']),
    '整局消息顺序错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, levels: 10, finds: total }), 'stats 错误: ' + JSON.stringify(sdkMessages.at(-2).message.stats));
  draw();

  // ---- 结束后：1 秒内点击不重开，之后重开；新局要等真实点击才 start ----
  handleClick(700, 300);
  assert(state === 'over', '结束后 1 秒内不应重开');
  update(1.1);
  key('Enter');
  assert(state === 'ready' && level === 1 && finds === 0 && clock === levelTime(1), 'Enter 应重开一局');
  before = sdkMessages.length;
  update(30);
  assert(clock === levelTime(1) && seq(before).length === 0, 'ready 时时钟不走、不发消息');

  // ---- 点错把时间扣光：stats 后 end，成就不重复 ----
  newRun(7);
  clock = 2;
  const ln = liveView.lv.left.findIndex((s, i) => !liveView.byLine.has(i) && s.trim().length > 3);
  const tk = liveView.pl[ln].find(t => t.k !== 'ws');
  before = sdkMessages.length;
  clickCode('l', ln, tk.c);
  assert(state === 'over' && same(seq(before), ['start', 'stats', 'end']), '时间扣光消息错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, levels: 0, finds: 0 }), '失败 stats 错误');
  assert(clickCode('l', ln, tk.c) === 'none', '结束后点击不应判定');

  // ---- 有错的第 3 轮不给 perfect ----
  newRun(9);
  before = sdkMessages.length;
  clearCurrent('r'); clearCurrent('r');
  const l3 = liveView.lv.left.findIndex((s, i) => !liveView.byLine.has(i) && s.trim().length > 3);
  clickCode('r', l3, liveView.pr[l3].find(t => t.k !== 'ws').c);
  clearCurrent('r');
  assert(!seq(before).includes('achievement:perfect'), '点错过的第 3 轮不应给 perfect');

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
