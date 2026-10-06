// 无头测试：打桩浏览器 API，驱动模型与游戏函数（不渲染真实画布）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
// 任何方法调用都返回桩本身，所以 measureText(...).width 之类的链式调用也能跑。
const ctxStub = new Proxy({}, {
  get: () => () => ctxStub,
  set: () => true,
});
const canvasStub = { id: 'game', style: {}, addEventListener() {}, getContext: () => ctxStub, width: 0, height: 0 };
global.window = global;
global.devicePixelRatio = 1;
global.AudioContext = undefined;
global.webkitAudioContext = undefined;
global.addEventListener = () => {};
global.requestAnimationFrame = () => {};
global.setTimeout = () => 0;
const store = {};
global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
const sdkMessages = [];
global.location = { hostname: 'localhost' };
global.parent = {
  postMessage(message, targetOrigin) {
    sdkMessages.push({ message, targetOrigin });
  },
};
global.document = { getElementById: () => canvasStub, documentElement: { clientWidth: 1280, clientHeight: 800 } };

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
  assert(sdkMessages[0]?.targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  assert(same(seq(0), ['ready', 'disguise']), '加载时应发送 ready 后跟 disguise: ' + seq(0));
  const dg = sdkMessages[1].message;
  assert(dg.app === 'excel' && dg.title === '实验数据_生态系统稳定性.xlsx - Excel' && Object.keys(dg).length === 5, 'disguise 消息错误');
  rng = mulberry32(1);
  draw();   // 第一帧：配置表

  const parse = str => { const s = { algae: 0, plant: 0, moss: 0, shrimp: 0, snail: 0, spring: 0, bact: 0, sand: 0, char: 0, light: 'window' };
    for (const kv of str.split(' ')) { const [k, v] = kv.split(':'); s[k] = isNaN(+v) ? v : +v; } return s; };
  // 「看见警告就干预」的机器人：每小时看一次当前值。
  function bot(j, use) {
    const p = j.history[j.history.length - 1];
    if (j.O < 5 && use('vent')) return;
    if (j.algae > 40 && j.O > 8 && use('dark')) return;
    if ((j.plant + j.moss < 15 || j.plant + j.moss < 0.5 * (p.plant + p.moss)) && use('plant')) return;
  }
  function sim(d, s, withBot, everyHour) {
    const j = createJar(s, d.events);
    for (;;) {
      stepHour(j);
      if (everyHour) everyHour(j);
      if (j.hour % 24 === 0) { const o = outcome(d, j); if (o) return { j, o }; }
      if (withBot) bot(j, k => act(j, k));
    }
  }
  function sane(name) {
    return j => {
      assert(Math.abs(j.O + j.C - 20) <= 1e-9, name + ' 第 ' + j.hour + ' 小时 O + C ≠ 20');
      const nums = [...Object.values(j), ...Object.values(j.cause)].filter(v => typeof v === 'number');
      assert(nums.every(v => Number.isFinite(v) && v >= 0), name + ' 第 ' + j.hour + ' 小时出现负数或非有限值');
    };
  }

  // ---- v1 参考配置：没有扰动、不干预时 v2 模型与 v1 一致 ----
  const V1 = { days: 100, goals: [], events: [] };
  const REF1 = [
    ['稳定瓶', 'algae:2 plant:3 moss:2 shrimp:3 snail:2 spring:1 bact:2 sand:1', 100, null],
    ['背阴小瓶', 'plant:3 moss:2 spring:2 bact:1 light:shade', 100, null],
    ['动物园', 'algae:1 shrimp:8 snail:6 bact:2', 4, 'hypo'],
    ['灯下藻华', 'algae:2 plant:3 snail:1 bact:2 light:lamp', 11, 'bloom'],
    ['无人打扫', 'algae:2 plant:2 shrimp:3 snail:2', 18, 'tox'],
  ];
  for (const [name, str, day, diag] of REF1) {
    const { j, o } = sim(V1, parse(str), false, sane(name));
    assert(o.day === day && o.diagnosis === diag && (o.stars > 0) === !diag, name + ' 结局错误: ' + JSON.stringify(o));
    if (name === '稳定瓶') assert(j.healthy === 93 && speciesAlive(j) === 7, '稳定瓶健康天数应为 93');
    if (name === '背阴小瓶') assert(j.healthy === 100, '背阴小瓶健康天数应为 100');
  }

  // ---- 战役参考配置：同一配置，不干预 vs 看见警告就干预 ----
  const REF2 = [
    ['algae:1 plant:1 shrimp:2 snail:1 spring:2 bact:2 sand:1 light:lamp', 52, 1, 60, 3, ['plant']],
    ['algae:1 plant:1 moss:3 shrimp:3 snail:1 spring:1 bact:1 sand:1 light:window', 68, 0, 66, 3, ['vent']],
    ['algae:4 plant:3 moss:1 shrimp:2 snail:1 bact:2 sand:1 light:lamp', 75, 0, 11, 3, ['dark', 'vent']],
    ['plant:3 moss:2 snail:3 spring:2 bact:1 sand:2 light:lamp', 79, 0, 39, 3, ['plant', 'vent']],
    ['algae:1 plant:1 moss:3 shrimp:4 snail:2 spring:1 bact:1 sand:2 char:1 light:lamp', 97, 0, 45, 3, ['plant', 'vent']],
  ];
  let starsNo = 0, starsBot = 0;
  REF2.forEach(([str, cost, noStars, noDay, botStars, used], i) => {
    const d = JARS[i], s = parse(str);
    assert(costOf(s) === cost && setupProblem(d, s) === '', '实验' + (i + 1) + ' 参考配置无效');
    const a = sim(d, s, false, sane('实验' + (i + 1)));
    const b = sim(d, s, true, sane('实验' + (i + 1) + '+干预'));
    assert(a.o.stars === noStars && a.o.day === noDay, '实验' + (i + 1) + ' 不干预应 ' + noStars + ' 星 / 第 ' + noDay + ' 天: ' + JSON.stringify(a.o));
    assert(b.o.stars === botStars && b.o.day === d.days, '实验' + (i + 1) + ' 干预后应 ' + botStars + ' 星: ' + JSON.stringify(b.o));
    assert(same(Object.keys(b.j.used).sort(), used.slice().sort()), '实验' + (i + 1) + ' 干预种类错误: ' + JSON.stringify(b.j.used));
    starsNo += a.o.stars; starsBot += b.o.stars;
    console.log('实验' + (i + 1), '不干预', JSON.stringify(a.o), '| 干预', JSON.stringify(b.o), JSON.stringify(b.j.used));
  });
  assert(starsNo === 1 && starsBot === 15, '参考配置总星数应为 1 / 15');

  // ---- 配置规则 ----
  assert(selectJar(1) && jarIdx === 1, '切换到实验2失败');
  assert(!adjust('shrimp', -1) && setup().shrimp === 3, '实验2 小虾不能少于 3');
  assert(!setLight('lamp') && setup().light === 'window', '实验2 光照固定');
  assert(setupProblem(JARS[1], setup()) === '至少放一种动物和一种植物', '只放小虾不能开始');
  let before = sdkMessages.length;
  assert(!run() && phase === 'setup' && sdkMessages.length === before, '无效配置不应开始');
  selectJar(0);
  assert(adjust('char', 1) && !adjust('char', 1), '炭最多 1 块');
  for (let n = 0; n < 9; n++) adjust('shrimp', 1);
  assert(costOf(setup()) <= 60 && !adjust('plant', 1), '超预算应拒绝');
  setups[0] = parse(REF2[0][0]);
  assert(setLight('window') && setup().light === 'window' && setLight('lamp'), '实验1 光照可选');
  assert(!intervene('vent'), '配置阶段不能干预');
  for (let i = 0; i < 5; i++) { selectJar(i); draw(); }
  selectJar(0); dropdown = true; draw(); dropdown = false;

  // ---- 时间 ----
  assert(run() && phase === 'run' && speed === 1, '开始后速度应为 1×');
  for (let i = 0; i < 10; i++) update(0.1);
  assert(jar.hour === 40, '1× 下 1 秒应推进 40 小时，实际 ' + jar.hour);
  update(5);
  assert(jar.hour === 44, 'update 应把 dt 限制在 0.1 秒，实际 ' + jar.hour);
  setSpeed(4);
  for (let i = 0; i < 10; i++) update(0.1);
  assert(jar.hour === 44 + 160, '4× 下 1 秒应推进 160 小时，实际 ' + jar.hour);
  togglePause();
  for (let i = 0; i < 10; i++) update(0.1);
  assert(jar.hour === 204 && speed === 0, '暂停时不应推进');
  togglePause();
  assert(speed === 4, '继续应回到暂停前的速度');
  toggleBoss(); draw();
  for (let i = 0; i < 10; i++) update(0.1);
  assert(jar.hour === 204, '老板键时时间冻结');
  toggleBoss();
  assert(!selectJar(2) && jarIdx === 0, '实验中不能切换实验');
  assert(intervene('dark') && !intervene('dark'), '每种干预只能用一次');
  draw();

  // ---- 游戏循环与纯模型一致（干预经由 intervene()，每次 update 推进 1 小时） ----
  function play(i, str, withBot) {
    if (phase === 'end') again();
    if (jarIdx !== i) selectJar(i);
    setups[i] = parse(str);
    const from = sdkMessages.length;
    assert(run(), '实验' + (i + 1) + ' 无法开始');
    let n = 0;
    while (phase === 'run') {
      update(1 / 40);
      if (phase === 'run' && withBot) bot(jar, k => intervene(k));
      if (++n % 500 === 0) draw();
    }
    draw();
    return { seq: seq(from), stats: sdkMessages[sdkMessages.length - 2].message.stats };
  }
  // 上面那局还没结束：先结束它（不计入后面的断言）
  while (phase === 'run') update(0.1);
  let r = play(1, REF2[1][0], true);
  const pure = sim(JARS[1], parse(REF2[1][0]), true);
  assert(JSON.stringify(jar.history) === JSON.stringify(pure.j.history), '游戏循环的 history 与纯模型不同');
  assert(result.stars === 3, '实验2 干预后应 3 星');
  assert(same(r.seq, ['start', 'achievement:first_star', 'achievement:full_marks', 'stats', 'end']), '实验2 消息顺序错误: ' + r.seq);
  assert(same(r.stats, { rounds: 1, wins: 1, stars: 3, days: 100 }), '实验2 stats 错误: ' + JSON.stringify(r.stats));
  assert(best[1] === 3 && JSON.parse(store['moyufun:terrarium:v2'])[1] === 3, '最佳星数应保存');

  r = play(1, REF2[1][0], false);
  assert(same(r.seq, ['start', 'stats', 'end']) && same(r.stats, { rounds: 1, wins: 0, stars: 0, days: 66 }), '实验2 不干预应失败: ' + r.seq + JSON.stringify(r.stats));
  assert(best[1] === 3, '更差的成绩不应覆盖最佳');
  assert(again() && phase === 'setup' && same(setup(), parse(REF2[1][0])), '再做一次应保留配置');

  r = play(4, REF2[4][0], true);
  assert(same(r.seq, ['start', 'achievement:first_star', 'achievement:full_marks', 'achievement:finale', 'stats', 'end']), '实验5 消息顺序错误: ' + r.seq);

  r = play(0, 'algae:1 plant:2 shrimp:2 snail:1 spring:2 bact:2 sand:1 light:lamp', false);
  assert(same(r.seq, ['start', 'achievement:first_star', 'achievement:full_marks', 'achievement:hands_off', 'stats', 'end']), '实验1 无干预满分消息顺序错误: ' + r.seq);
  assert(same(r.stats, { rounds: 1, wins: 1, stars: 3, days: 60 }), '实验1 stats 错误');

  // 绝处逢生：O₂ 低于 4 时的干预会记下 rescued
  const jr = createJar(parse('algae:1 shrimp:8 snail:6 bact:2'), []);
  while (jr.O >= ENV.Olow) stepHour(jr);
  assert(act(jr, 'vent') && jr.rescued, 'O₂ < 4 时干预应记为 rescued');
  // 三管齐下：开局就把三种干预都用掉
  again(); setups[0] = parse(REF2[0][0]);
  let from = sdkMessages.length;
  run(); intervene('plant'); intervene('vent'); intervene('dark');
  while (phase === 'run') update(0.1);
  const s3 = seq(from);
  assert(s3.includes('achievement:all_hands') === (result.stars > 0), '三种干预都用且达标应解锁 all_hands: ' + s3);

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
