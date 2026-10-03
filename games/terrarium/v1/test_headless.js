// 无头测试：打桩浏览器 API，驱动模型与游戏函数（不渲染真实画布）
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
global.requestAnimationFrame = () => {};
global.setTimeout = () => 0;
const sdkMessages = [];
global.location = { hostname: 'localhost' };
global.parent = {
  postMessage(message, targetOrigin) {
    sdkMessages.push({ message, targetOrigin });
  },
};
global.document = { getElementById: () => canvasStub, documentElement: { clientWidth: 480, clientHeight: 800 } };

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
  rng = mulberry32(1);
  const full = s => ({ ...blankSetup(), ...s });
  const REF = {
    稳定瓶: { setup: full({ algae: 2, plant: 3, moss: 2, shrimp: 3, snail: 2, spring: 1, bact: 2, sand: 1, light: 'window' }), cost: 90, win: true },
    背阴小瓶: { setup: full({ plant: 3, moss: 2, spring: 2, bact: 1, light: 'shade' }), cost: 48, win: true },
    动物园: { setup: full({ algae: 1, shrimp: 8, snail: 6, bact: 2, light: 'window' }), cost: 89, win: false, day: 4, diagnosis: 'hypo' },
    灯下藻华: { setup: full({ algae: 2, plant: 3, snail: 1, bact: 2, light: 'lamp' }), cost: 43, win: false, day: 11, diagnosis: 'bloom' },
    无人打扫: { setup: full({ algae: 2, plant: 2, shrimp: 3, snail: 2, light: 'window' }), cost: 50, win: false, day: 18, diagnosis: 'tox' },
  };
  function run(s, everyHour) {
    const j = createJar(s);
    let o = null;
    while (!o) { stepHour(j); if (everyHour) everyHour(j); if (j.hour % 24 === 0) o = outcome(j); }
    return { j, o };
  }

  // ---- 加载：封瓶前只发 ready ----
  update(0.1); draw();
  for (let i = 0; i < 3; i++) { assert(adjust('plant', 1), '加水草失败'); update(0.1); draw(); }
  setLight('lamp'); update(0.5); draw();
  assert(sdkMessages.every(m => m.message.type === 'ready'), '封瓶前只应发送 ready: ' + seq(0));
  setup = blankSetup();

  // ---- 模型：守恒、非负、结局 ----
  for (const [name, ref] of Object.entries(REF)) {
    assert(costOf(ref.setup) === ref.cost, name + ' 花费应为 ' + ref.cost + '，实际 ' + costOf(ref.setup));
    const { j, o } = run(ref.setup, j => {
      assert(Math.abs(j.O + j.C - 20) <= 1e-9, name + ' 第 ' + j.hour + ' 小时 O + C ≠ 20');
      const nums = [...Object.values(j), ...Object.values(j.cause)].filter(v => typeof v === 'number');
      assert(nums.every(v => Number.isFinite(v) && v >= 0), name + ' 第 ' + j.hour + ' 小时出现负数或非有限值');
    });
    assert(o.win === ref.win, name + ' 胜负错误: ' + JSON.stringify(o));
    assert(j.history.length === o.day + 1 && j.history[0].day === 0, name + ' history 行数错误');
    const sc = scoreOf(j);
    if (ref.win) assert(o.day === 100 && o.diagnosis === null, name + ' 应撑到第 100 天');
    else {
      assert(o.diagnosis === ref.diagnosis, name + ' 诊断应为 ' + ref.diagnosis + '，实际 ' + o.diagnosis);
      assert(Math.abs(o.day - ref.day) <= 1, name + ' 崩溃日应约为 ' + ref.day + '，实际 ' + o.day);
    }
    if (name === '稳定瓶') assert(sc.species === 7 && sc.healthy >= 85 && sc.healthy < 100, '稳定瓶物种/健康天数错误: ' + JSON.stringify(sc));
    if (name === '背阴小瓶') assert(sc.species === 4 && sc.healthy === 100 && sc.score === 700, '背阴小瓶物种/健康天数错误: ' + JSON.stringify(sc));
    console.log(name.padEnd(5), JSON.stringify(o), JSON.stringify(sc));
  }
  const good = REF.稳定瓶.setup;
  let neighbours = 0;
  for (const it of ITEMS) for (const d of [-1, 1]) {
    const s = { ...good, [it.key]: good[it.key] + d };
    if (s[it.key] < 0 || s[it.key] > it.max || costOf(s) > BUDGET) continue;
    neighbours++;
    assert(run(s).o.win, '稳定瓶邻居 ' + it.key + (d > 0 ? '+1' : '-1') + ' 应撑到第 100 天');
  }
  assert(neighbours === 17, '稳定瓶应有 17 个邻居，实际 ' + neighbours);

  // ---- 确定性：rng 不进模型 ----
  const h1 = JSON.stringify(run(good).j.history);
  assert(h1 === JSON.stringify(run(good).j.history), '同一配置两次 history 不同');
  rng = mulberry32(2);
  setup = { ...good };
  assert(seal(), '稳定瓶应可封瓶');
  let frames = 0;
  while (phase === 'run') { update(0.1); if (++frames % 50 === 0) draw(); }
  assert(JSON.stringify(jar.history) === h1, '经过游戏循环与精灵更新后 history 不同');
  assert(sprites.length > 0, '精灵没有生成');
  for (let i = 0; i < 30; i++) { update(0.1); draw(); }   // 结算画面冒烟
  assert(backToSetup(), 'backToSetup 失败');
  rng = mulberry32(1);

  // ---- 配置规则 ----
  setup = blankSetup();
  assert(adjust('char', 1) && !adjust('char', 1), '炭最多 1 块');
  assert(adjust('char', -1) && !adjust('char', -1), '数量不能小于 0');
  setup = full({ plant: 6, char: 1, sand: 2, moss: 4 });
  assert(costOf(setup) === 98, '构造花费应为 98');
  assert(!adjust('algae', 1) && setup.algae === 0, '超预算应拒绝');
  assert(adjust('moss', -1) && adjust('algae', 1) && costOf(setup) === 95, '退一份苔藓后应能加藻类');
  assert(!adjust('plant', 1), '水草最多 6 份');
  for (const s of [full({ algae: 2 }), full({ shrimp: 2 }), full({ bact: 3, sand: 1 }), blankSetup()])
    assert(sealProblem(s) === '至少放一种动物和一种植物', 'sealProblem 应拒绝 ' + JSON.stringify(s));
  assert(sealProblem(full({ moss: 1, spring: 1 })) === '', 'sealProblem 应接受苔藓 + 跳虫');
  setup = full({ bact: 2 });
  let before = sdkMessages.length;
  assert(!seal() && phase === 'setup' && sdkMessages.length === before, '无效配置不应封瓶');

  // ---- 时间 ----
  setup = { ...good };
  assert(seal() && speed === 1, '封瓶后速度应为 1×');
  for (let i = 0; i < 10; i++) update(0.1);
  assert(jar.hour === 24, '1× 下 1 秒应推进 24 小时，实际 ' + jar.hour);
  update(5);
  assert(jar.hour === 26, 'update 应把 dt 限制在 0.1 秒，实际 ' + jar.hour);
  setSpeed(4);
  for (let i = 0; i < 10; i++) update(0.1);
  assert(jar.hour === 26 + 96, '4× 下 1 秒应推进 96 小时，实际 ' + jar.hour);
  setSpeed(0);
  for (let i = 0; i < 10; i++) update(0.1);
  assert(jar.hour === 122, '暂停时不应推进');
  togglePause();
  assert(speed === 4, '继续应回到暂停前的速度');
  draw();
  skipToEnd();
  assert(phase === 'end' && result && result.win && jar.day === 100, 'skipToEnd 应到达结局');
  assert(!adjust('algae', 1), '结算时不能改配置');
  backToSetup();

  // ---- 消息顺序 ----
  function play(s) {
    setup = { ...s };
    const from = sdkMessages.length;
    assert(seal(), '封瓶失败');
    skipToEnd();
    update(0.5); draw();
    return { seq: seq(from), stats: sdkMessages.at(-2).message.stats };
  }
  let r = play(good);
  assert(same(r.seq, ['start', 'achievement:sealed_100', 'achievement:full_house', 'stats', 'end']), '稳定瓶消息顺序错误: ' + r.seq);
  assert(same(r.stats, { rounds: 1, wins: 1, days: 100, species: 7 }), '稳定瓶 stats 错误: ' + JSON.stringify(r.stats));
  backToSetup();
  r = play(REF.背阴小瓶.setup);
  assert(same(r.seq, ['start', 'achievement:sealed_100', 'achievement:frugal', 'achievement:shade_win', 'achievement:calm', 'stats', 'end']), '背阴小瓶消息顺序错误: ' + r.seq);
  assert(same(r.stats, { rounds: 1, wins: 1, days: 100, species: 4 }), '背阴小瓶 stats 错误: ' + JSON.stringify(r.stats));
  backToSetup();
  r = play(REF.动物园.setup);
  assert(same(r.seq, ['start', 'stats', 'end']), '动物园消息顺序错误: ' + r.seq);
  assert(same(r.stats, { rounds: 1, wins: 0, days: 4, species: 2 }), '动物园 stats 错误: ' + JSON.stringify(r.stats));
  assert(result.diagnosis === 'hypo', '动物园诊断应为 hypo');
  assert(backToSetup() && same(setup, REF.动物园.setup), 'backToSetup 后配置应保持不变');
  draw();
  before = sdkMessages.length;
  assert(seal() && same(seq(before), ['start']), '第二次封瓶应再发 start');

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
