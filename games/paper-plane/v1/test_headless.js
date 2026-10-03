// 无头测试：打桩浏览器 API，驱动模型与游戏函数（不渲染真实画布）
// node test_headless.js            跑全部断言
// node test_headless.js --record   用束搜索重新录制三条输入脚本并打印（见设计文档 Recorded scripts）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
// 任何方法调用都返回桩本身，所以 createLinearGradient(...).addColorStop(...) 也能跑。
const ctxStub = new Proxy({}, {
  get: () => () => ctxStub,
  set: () => true,
});
function makeEl(id) {
  return { id, style: {}, addEventListener() {} };
}
const canvasStub = Object.assign(makeEl('game'), { getContext: () => ctxStub, width: 0, height: 0 });
global.window = global;
global.devicePixelRatio = 1;
global.AudioContext = undefined;
global.webkitAudioContext = undefined;
global.addEventListener = () => {};
global.requestAnimationFrame = () => {};   // 不驱动 rAF
global.setTimeout = () => 0;
const sdkMessages = [];
global.location = { hostname: 'localhost' };
global.parent = {
  postMessage(message, targetOrigin) {
    sdkMessages.push({ message, targetOrigin });
  },
};
global.document = { getElementById: () => canvasStub, documentElement: { clientWidth: 960, clientHeight: 540 } };
global.RECORD = process.argv.includes('--record');

// ---- 从 index.html 提取内联脚本 + 测试驱动 ----
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('未在 index.html 中找到 <script> 块');
const code = match[1];
const driver = `
;(function runTest() {
  const assert = (ok, msg) => { if (!ok) throw new Error(msg); };
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const near = (a, b, eps) => Math.abs(a - b) <= eps;
  const seq = from => sdkMessages.slice(from).map(({ message }) => message.type + (message.key ? ':' + message.key : ''));
  rng = mulberry32(1);

  if (RECORD) {
    // 束搜索：每 0.1 秒决定按住或松开；带安全余量模拟，撞毁或漏信的分支丢弃。
    const hex = bits => { let h = ''; for (let i = 0; i < bits.length; i += 4) h += (bits[i] * 8 + (bits[i + 1] || 0) * 4 + (bits[i + 2] || 0) * 2 + (bits[i + 3] || 0)).toString(16); return h; };
    COURSES.forEach((c, ri) => {
      let beam = [{ r: newRun(c), bits: [] }], found = null;
      for (let d = 0; d < 3000 && !found; d++) {
        const kids = [];
        for (const s of beam) for (const h of [0, 1]) {
          const r = { ...s.r, mail: s.r.mail.slice() };
          for (let i = 0; i < 12 && !r.done; i++) stepRun(r, h === 1, 12);
          if (r.crashes || r.misses) continue;
          kids.push({ r, bits: s.bits.concat(h) });
        }
        assert(kids.length, '第 ' + (ri + 1) + ' 程录制失败：所有分支都撞毁或漏信');
        found = kids.find(k => k.r.done);
        const buckets = new Map();
        for (const k of kids) {
          k.s = k.r.x - 220 * k.r.pen + (k.r.y + k.r.v * k.r.v / 600);
          const key = [Math.round(k.r.y / 12), Math.round(k.r.v / 12), Math.round(k.r.th / 0.07), Math.round(k.r.x / 30)].join();
          const o = buckets.get(key); if (!o || o.s < k.s) buckets.set(key, k);
        }
        beam = [...buckets.values()].sort((a, b) => b.s - a.s).slice(0, 400);
      }
      assert(found, '第 ' + (ri + 1) + ' 程录制超时');
      const bits = found.bits, r = newRun(c);
      for (let s = 0; !r.done && s < 300 * 120; s++) stepRun(r, bits[Math.floor(s / 12)] === 1);
      console.log('第 ' + (ri + 1) + ' 程', routeTime(r).toFixed(2) + ' 秒', '撞毁 ' + r.crashes, '漏信 ' + r.misses);
      console.log("  '" + hex(bits) + "',");
    });
    return;
  }

  // ---- 加载：只发 ready ----
  assert(sdkMessages[0]?.message.type === 'ready', 'SDK 未发送 ready');
  assert(sdkMessages[0]?.targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  assert(sdkMessages.length === 1, '页面加载只应发送 ready');
  draw();   // 开始画面冒烟

  // ---- 线路派生值（防抄错） ----
  const TABLE = [
    { n: 41, finish: 12300, start: [0, 380], m: [1190, 3240, 5310, 8220, 10290], c: [[3240,310],[6470,330],[9400,390]], t: 15, script: 47.09, medals: [52, 62, 75], cap: 135 },
    { n: 45, finish: 14120, start: [0, 400], m: [1830, 3910, 5350, 6840, 8950, 10690, 13050], c: [[3610,330],[7490,310],[11000,290]], t: 16, script: 63.28, medals: [70, 84, 100], cap: 160 },
    { n: 50, finish: 16120, start: [0, 440], m: [2100, 3930, 6260, 7530, 10210, 11390, 13830, 15290], c: [[3930,310],[8130,510],[11990,490]], t: 17, script: 81.26, medals: [90, 106, 130], cap: 190 },
  ];
  COURSES.forEach((c, i) => {
    const e = TABLE[i], name = '第 ' + (i + 1) + ' 程';
    assert(c.b.length === e.n, name + ' 楼数 ' + c.b.length);
    assert(c.finish === e.finish, name + ' 终点 ' + c.finish);
    assert(same([c.start.x, c.start.y], e.start), name + ' 起点 ' + JSON.stringify(c.start));
    assert(same(c.m.map(m => m.x), e.m), name + ' 邮筒 ' + c.m.map(m => m.x));
    assert(same(c.c.map(p => [p.x, p.y]), e.c), name + ' 检查点 ' + JSON.stringify(c.c.map(p => [p.x, p.y])));
    assert(c.t.length === e.t, name + ' 炊烟数 ' + c.t.length);
    assert(same(c.medals, e.medals) && c.cap === e.cap, name + ' 奖牌时间错误');
    assert(e.script < e.medals[0], name + ' 脚本时间应低于金牌');
  });

  // ---- 线路规则 ----
  COURSES.forEach((c, i) => {
    const name = '第 ' + (i + 1) + ' 程', s = c.src, n = c.b.length;
    for (let k = 1; k < n; k++) assert(c.b[k].x - (c.b[k - 1].x + c.b[k - 1].w) >= 40, name + ' 楼间距 < 40：' + k);
    assert(!s.t.at.some(k => s.m.includes(k)), name + ' 有楼同时有烟囱和邮筒');
    const idx = [...s.t.at, ...s.m, ...s.c, ...Object.keys(s.t.riseAt).map(Number)];
    assert(idx.every(k => Number.isInteger(k) && k >= 0 && k < n), name + ' 下标越界');
    for (const p of [c.start, ...c.c]) assert(!hits({ course: c, x: p.x, y: p.y }), name + ' 出生点会撞：' + JSON.stringify([p.x, p.y]));
    const inside = x => x >= 0 && x <= c.finish;
    assert(c.w.every(w => inside(w[0]) && inside(w[2])), name + ' 电线越界');
    assert(c.l.every(l => inside(l[0])), name + ' 灯笼越界');
    assert(c.z.every(z => inside(z[0]) && inside(z[1])), name + ' 风区越界');
  });

  // ---- 飞行模型 ----
  const empty = { b: [], t: [], m: [], c: [], w: [], l: [], z: [], poles: [], start: { x: 0, y: 500 }, finish: 1e9 };
  let r = newRun(empty);
  for (let s = 0; s < 240; s++) stepRun(r, false);
  assert(r.th === DOWN_TARGET, '松开 240 步后机头应正好 −30°：' + r.th / DEG);
  assert(near(r.v, 328.39, 0.01), '松开 240 步后速度应为 328.39：' + r.v);
  r = newRun(empty);
  let stallAt = 0, recoverAt = 0;
  for (let s = 1; s <= 360; s++) {
    const was = r.stalled, ev = stepRun(r, true);
    if (ev.some(e => e.e === 'stall') && !stallAt) stallAt = s;
    if (was && !r.stalled && !recoverAt) recoverAt = s;
  }
  assert(stallAt === 91 && recoverAt === 194, '按住应在第 91 步失速、第 194 步恢复：' + stallAt + ' / ' + recoverAt);

  // ---- 录制脚本：回放到终点、零撞毁、全部送达、时间吻合 ----
  function replay(ri, onStep) {
    const bits = decodeScript(SCRIPTS[ri]);
    let s = 0;
    while (screen === 'fly' && s < 300 * 120) { tick(bits[Math.floor(s / 12)] === 1); s++; if (onStep) onStep(s); }
  }
  for (let ri = 0; ri < 3; ri++) {
    startRound(); route = ri; showIntro();
    const before = sdkMessages.length;
    let updraftAt = 0;
    launch();
    replay(ri, s => { if (!updraftAt && seq(before).includes('achievement:updraft')) updraftAt = s; });
    const t = routeTime(run), name = '第 ' + (ri + 1) + ' 程脚本';
    assert(run.done, name + ' 未到终点');
    assert(run.crashes === 0 && run.misses === 0 && run.delivered === COURSES[ri].m.length, name + ' 撞毁 ' + run.crashes + ' 漏信 ' + run.misses);
    assert(near(t, TABLE[ri].script, 0.01), name + ' 时间 ' + t.toFixed(3) + '，应为 ' + TABLE[ri].script);
    assert(medalFor(ri, t) === 'gold', name + ' 应为金牌');
    if (ri === 0) assert(updraftAt === 781, '脚本 1 应在第 781 步发送 updraft：' + updraftAt);
    console.log(name + '：' + t.toFixed(2) + ' 秒');
    update(0.6); draw();   // 结算画面冒烟
    restart();
  }

  // ---- 完整一天 ----
  startRound();
  let before = sdkMessages.length;
  for (let ri = 0; ri < 3; ri++) {
    assert(screen === 'intro' && route === ri, '第 ' + (ri + 1) + ' 程应先显示开场');
    draw();
    launch();
    replay(ri, s => { if (s % 900 === 0) { update(0); draw(); } });   // 飞行画面冒烟（update(0) 不推进模型）
    if (ri < 2) { assert(screen === 'routeDone', '第 ' + (ri + 1) + ' 程完成后应显示结算'); update(0.6); draw(); nextRoute(); }
  }
  assert(screen === 'won', '三程完成后应获胜');
  update(0.6); draw();
  assert(same(seq(before), ['start', 'achievement:updraft', 'achievement:deliver_all', 'achievement:gold', 'achievement:all_gold', 'achievement:flawless', 'stats', 'end']), '完整一天消息顺序错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 1, letters: 20, golds: 3 }), '完整一天 stats 错误: ' + JSON.stringify(sdkMessages.at(-2).message.stats));

  // ---- 加载后到第一次起飞前只发 ready（在新的一天上重复检查 startRound 不发消息） ----
  before = sdkMessages.length;
  startRound(); nextRoute(); startRound();
  assert(sdkMessages.length === before, 'startRound 不应发送消息');

  // ---- 失败：一直松开，撞自己的起飞屋顶直到天黑 ----
  startRound();
  before = sdkMessages.length;
  launch();
  while (screen === 'fly') { tick(false); }
  assert(screen === 'lost', '一直松开应以天黑告终：' + screen);
  assert(run.crashes >= 20 && run.cpi === -1 && routeTime(run) >= 135, '应反复撞毁在起点附近：' + run.crashes);
  update(0.6); draw();
  assert(same(seq(before), ['start', 'stats', 'end']), '失败消息顺序错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 0, letters: 0, golds: 0 }), '失败 stats 错误: ' + JSON.stringify(sdkMessages.at(-2).message.stats));

  // ---- 罚时：第 1 程一直按住 60 秒 ----
  startRound(); launch();
  for (let s = 0; s < 60 * 120 && screen === 'fly'; s++) tick(true);
  assert(run.pen === 5 * run.misses + 3 * run.crashes && run.misses >= 1, '罚时应为 5×漏信 + 3×撞毁：' + JSON.stringify({ pen: run.pen, m: run.misses, c: run.crashes }));
  restart();

  // ---- 重来 ----
  startRound(); launch();
  for (let s = 0; s < 120; s++) tick(true);
  before = sdkMessages.length;
  restart();
  assert(same(seq(before), ['stats', 'end']) && sdkMessages.at(-2).message.stats.wins === 0, '起飞后重来应发送 stats(wins 0)、end: ' + seq(before));
  assert(screen === 'intro' && route === 0, '重来后应回到第 1 程开场');
  before = sdkMessages.length;
  restart();
  assert(sdkMessages.length === before, '起飞前重来不应发送消息');

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
