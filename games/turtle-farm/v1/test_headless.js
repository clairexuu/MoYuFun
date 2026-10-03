// 无头测试：打桩浏览器 API，驱动航线生成、生长规则、平衡机器人和 SDK 消息（不渲染真实画布）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
// 任何方法调用都返回桩本身，所以 createRadialGradient(...).addColorStop(...) 也能跑。
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
global.document = {
  getElementById: () => canvasStub,
  documentElement: { clientWidth: 480, clientHeight: 800 },
  addEventListener() {},
  hidden: false,
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
  const lastStats = () => sdkMessages.filter(m => m.message.type === 'stats').at(-1).message.stats;

  // ---- 加载：startRound 之前只发 ready ----
  assert(sdkMessages[0]?.message.type === 'ready', 'SDK 未发送 ready');
  assert(sdkMessages[0]?.targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  assert(sdkMessages.length === 1, '页面加载只应发送 ready');
  update(1); draw();   // 标题画面冒烟
  assert(sdkMessages.length === 1, '标题画面不应发送消息');

  // ---- 航线 ----
  for (let s = 1; s <= 50; s++) {
    const a = genRoute(mulberry32(s)), b = genRoute(mulberry32(s));
    assert(same(a, b), '种子 ' + s + ' 航线不确定');
    const { route, markets } = a;
    assert(route.length === 31, '航线应有 30 天');
    for (let d = 1; d <= 30; d++) assert((route[d] === 'market') === MARKET_DAYS.includes(d), '集市日错误: 种子 ' + s + ' 第 ' + d + ' 天');
    assert(same(Object.keys(markets).map(Number), MARKET_DAYS), '集市表错误');
    for (const d of MARKET_DAYS) {
      const m = markets[d];
      assert(m.hot !== m.cold && m.hot >= 0 && m.hot < 8 && m.cold >= 0 && m.cold < 8, '热销和滞销应不同');
    }
    assert(route[1] === 'grass' && route[2] === 'grass', '前两天应为草原');
    // 连续同一地形的一段长 2–3 天；挨着集市或终点的段可以被截短。
    let start = 1;
    for (let d = 2; d <= 31; d++) {
      if (d <= 30 && route[d] === route[start]) continue;
      if (route[start] !== 'market') {
        const len = d - start, cut = route[start - 1] === 'market' || d > 30 || route[d] === 'market';
        assert(len <= 3 && (cut ? len >= 1 : len >= 2), '种子 ' + s + ' 第 ' + start + ' 天起的地形段长 ' + len);
      }
      start = d;
    }
    // 相邻两段不同：去掉集市日后，同一地形最多连续 3 天（两段相同会连成 4–6 天）。
    const lands = route.filter((b, d) => d && b !== 'market');
    let run = 1;
    for (let k = 1; k < lands.length; k++) {
      run = lands[k] === lands[k - 1] ? run + 1 : 1;
      assert(run <= 3, '种子 ' + s + ' 相邻两段地形相同');
    }
  }

  // ---- 生长规则（手设航线） ----
  function fresh(land) {
    startRound();
    state.route = [null].concat(Array(30).fill(land));
    state.markets = {};
    state.coins = 1000;
  }
  const C = key => CROPS.findIndex(c => c.key === key);
  fresh('snow');
  assert(plant(0, C('radish')), '应能种萝卜');
  update(12); assert(!state.plots[0].ripe, '萝卜在雪原 1 天不应成熟');
  update(12); assert(state.plots[0].ripe, '萝卜在雪原 2 天应成熟');
  update(12); update(12); assert(state.plots[0]?.ripe, '成熟后第 2 个日终不应烂');
  update(12); assert(state.plots[0] === null && state.lost === 1, '成熟作物放 3 个日终应烂掉');

  fresh('rain');
  plant(0, C('melon'));
  update(12); assert(!state.plots[0].withered && state.plots[0].harm === 1, '西瓜应撑过 1 个雨林日终');
  update(12); assert(state.plots[0].withered && state.lost === 1, '西瓜第 2 个雨林日终应枯萎');
  update(12); assert(state.plots[0] === null, '枯萎的地应在下一个日终清掉');

  fresh('grass');
  plant(0, C('icegrape'));
  update(12); assert(state.plots[0].withered, '冰葡萄第 1 个草原日终应枯萎');

  for (const land of ['grass', 'rain', 'desert', 'snow', 'market']) {
    fresh(land);
    plant(0, C('potato'));
    for (let k = 0; k < 3; k++) update(12);
    assert(!state.plots[0].ripe, '土豆 3 天不应成熟（' + land + '）');
    update(12); assert(state.plots[0].ripe, '土豆 4 天应成熟（' + land + '）');
  }

  fresh('grass');
  update(11.9); assert(state.day === 1, '不满一天不应换天');
  update(0.1); assert(state.day === 2, 'update(12) 应正好跑一个日终');
  state.speed = 2; update(6); assert(state.day === 3, '2× 下 update(6) 应正好跑一个日终');
  state.paused = true; update(100); assert(state.day === 3 && state.dayT === 0, '暂停时 update 不应推进');
  state.paused = false; state.speed = 1;
  state.coins = 1; assert(!plant(2, C('radish')) && state.plots[2] === null && state.coins === 1, '金币不够不应能种');
  assert(!harvest(3) && sell(0) === 0, '空地不能收；非集市日不能卖');
  draw();

  // ---- 平衡机器人 ----
  function predict(c, d, K) {
    const route = state.route, X = CROPS[c];
    let pts = 0, harm = 0;
    for (let t = d; t <= DAYS; t++) {
      const r = t <= d + K ? relation(c, route[t]) : 1;
      if (r === 2) pts += 3; else if (r === 1) pts += 2;
      else if (++harm > X.tough) return -1;
      if (pts >= 2 * X.days) return t;
    }
    return 99;
  }
  function forecastPick(K) {
    return d => {
      let best = 0, pick = -1;
      CROPS.forEach((X, c) => {
        if (X.cost > state.coins) return;
        const rd = predict(c, d, K);
        if (rd < 0 || rd >= DAYS) return;
        const m = MARKET_DAYS.find(x => x > rd);
        const value = m && m <= d + K ? price(c, m) : X.sell;
        const score = (value - X.cost) / (rd - d + 1);
        if (score > best) { best = score; pick = c; }
      });
      return pick;
    };
  }
  function play(seed, bot) {
    rng = mulberry32(seed);
    const br = mulberry32(seed ^ 0x9e37);
    const pick = bot === 'random'
      ? d => {
        const ok = CROPS.map((X, c) => c).filter(c => CROPS[c].cost <= state.coins && d + CROPS[c].days <= DAYS);
        return ok.length ? ok[Math.floor(br() * ok.length)] : -1;
      }
      : bot === 'potato' ? d => (CROPS[7].cost <= state.coins && d + 4 <= DAYS ? 7 : -1)
        : forecastPick(bot);
    const before = sdkMessages.length;
    startRound();
    while (state.phase === 'play') {
      const d = state.day;
      for (let i = 0; i < 16; i++) { const p = state.plots[i]; if (p && (p.ripe || p.withered)) harvest(i); }
      if (isMarketDay()) for (let c = 0; c < 8; c++) {
        if (typeof bot === 'number' && c === state.markets[d].cold && d < DAYS) continue;
        sell(c);
      }
      for (let i = 0; i < 16; i++) if (!state.plots[i]) { const c = pick(d); if (c >= 0) plant(i, c); }
      assert(state.coins >= 0 && state.barn.every(n => n >= 0), '金币或仓库为负');
      update(12);
    }
    assert(same(seq(before).slice(-2), ['stats', 'end']), '航程应以 stats, end 结束');
    return state.coins;
  }
  const bands = [['forecastBot(5)', 5, r => r >= 0.85], ['forecastBot(0)', 0, r => r <= 0.05],
    ['potatoBot', 'potato', r => r <= 0.05], ['randomBot', 'random', r => r <= 0.05]];
  for (const [name, bot, ok] of bands) {
    const coins = [];
    for (let s = 1; s <= 200; s++) coins.push(play(s, bot));
    coins.sort((a, b) => a - b);
    const rate = coins.filter(c => c >= TARGET).length / 200;
    console.log(name.padEnd(15), '≥800:', (rate * 100).toFixed(1) + '%', ' ≥1500:', (coins.filter(c => c >= TYCOON).length / 2).toFixed(1) + '%', ' 中位数', coins[100]);
    assert(ok(rate), name + ' 胜率越界: ' + rate);
  }

  // ---- 确定性航程 ----
  rng = mulberry32(1);
  let before = sdkMessages.length;
  startRound();
  state.route = [null];
  for (let d = 1; d <= 30; d++) state.route.push(MARKET_DAYS.includes(d) ? 'market' : d <= 2 ? 'snow' : d <= 5 ? 'desert' : 'grass');
  state.markets = {};
  for (const d of MARKET_DAYS) state.markets[d] = d === 6 ? { hot: 0, cold: 7 } : { hot: 1, cold: 2 };
  for (let i = 0; i < 5; i++) assert(plant(i, 0), '种萝卜失败');
  assert(plant(5, 4) && plant(6, 7) && state.coins === 1, '第 1 天种完应剩 1 金币: ' + state.coins);
  update(12); update(12);
  assert(state.day === 3 && [0, 1, 2, 3, 4].every(i => state.plots[i].ripe), '萝卜应在第 2 天末成熟');
  assert(state.plots[5].withered, '西瓜应在雪原枯萎');
  for (let i = 0; i < 5; i++) assert(harvest(i), '收萝卜失败');
  assert(same(seq(before), ['start', 'achievement:thrive']), '第一次收获应发送 thrive: ' + seq(before));
  update(12); update(12);
  assert(state.day === 5 && state.plots[6].ripe, '土豆应在第 4 天末成熟');
  assert(harvest(6), '收土豆失败');
  update(12);
  assert(state.day === 6 && isMarketDay(), '应到第 6 天集市');
  assert(sellAll() === 53 && state.coins === 54, '集市卖出后应为 54 金币: ' + state.coins);
  draw();
  state.coins = 1600;
  let n = 0;
  while (state.phase !== 'end') { update(12); n++; }
  assert(n === 25, '应再过 25 天结束: ' + n);
  assert(same(seq(before), ['start', 'achievement:thrive', 'achievement:hot_seller', 'achievement:voyage', 'achievement:tycoon', 'stats', 'end']), '确定性航程消息顺序错误: ' + seq(before));
  assert(same(lastStats(), { rounds: 1, wins: 1, harvests: 6, coins: 1600 }), 'stats 错误: ' + JSON.stringify(lastStats()));
  update(1); draw();   // 结算画面冒烟

  // ---- 干净的胜利 ----
  before = sdkMessages.length;
  startRound(); state.coins = 800;
  for (let k = 0; k < 30; k++) { update(12); if (k % 7 === 0) draw(); }
  assert(same(seq(before), ['start', 'achievement:voyage', 'achievement:no_loss', 'stats', 'end']), '干净胜利消息错误: ' + seq(before));
  assert(same(lastStats(), { rounds: 1, wins: 1, harvests: 0, coins: 800 }), '干净胜利 stats 错误');

  // ---- 失败与重新开始 ----
  before = sdkMessages.length;
  startRound();
  for (let k = 0; k < 30; k++) update(12);
  assert(same(seq(before), ['start', 'stats', 'end']), '失败消息错误: ' + seq(before));
  assert(same(lastStats(), { rounds: 1, wins: 0, harvests: 0, coins: 20 }), '失败 stats 错误');
  assert(!plant(0, 0) && sell(0) === 0, '结束后不应能操作');

  startRound(); update(30); state.paused = true; draw();
  before = sdkMessages.length;
  restart();
  assert(same(seq(before), ['stats', 'end']) && lastStats().wins === 0, '中途重新开始应发送 stats, end: ' + seq(before));
  assert(state.phase === 'title', '重新开始应回到标题');
  before = sdkMessages.length;
  restart();
  assert(sdkMessages.length === before, '标题画面 restart 不应发送消息');

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
