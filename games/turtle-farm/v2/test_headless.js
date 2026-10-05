// 无头测试：打桩浏览器 API，驱动航线生成、生长规则、集市暂停、收购商、平衡机器人和 SDK 消息（不渲染真实画布）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
// 任何方法调用都返回桩本身，所以 ctx.save().restore() 之类也能跑。
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
  documentElement: { clientWidth: 1000, clientHeight: 625 },
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
  const seq = from => sdkMessages.slice(from).filter(({ message }) => message.type !== 'disguise')
    .map(({ message }) => message.type + (message.key ? ':' + message.key : ''));
  const lastStats = () => sdkMessages.filter(m => m.message.type === 'stats').at(-1).message.stats;
  const DS = DAY_SECONDS;

  // ---- 加载：ready + disguise，第一次播种前不发 start ----
  assert(same(sdkMessages.map(m => m.message.type), ['ready', 'disguise']), '加载应发送 ready, disguise: ' + sdkMessages.map(m => m.message.type));
  assert(sdkMessages[0].targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  const dg = sdkMessages[1].message;
  assert(dg.app === 'excel' && dg.title === WINDOW_TITLE && dg.title.length <= 80, 'disguise 内容错误');
  assert(state.phase === 'ready' && state.route.length === 31, '打开就应是生成好航线的表格');
  update(100); draw();
  assert(state.phase === 'ready' && state.day === 1 && sdkMessages.length === 2, 'ready 阶段时钟不走、不发消息');
  selectSeed(3); assert(state.selected === 3 && sdkMessages.length === 2, '选种子不算开局');
  state.selected = 0;
  assert(plant(0, 0) && state.phase === 'play' && same(seq(0), ['ready', 'start']), '第一次播种应发送 start');
  update(DS); assert(state.day === 2, '开局后时钟应走');

  // ---- 航线（与 v1 相同的生成规则） ----
  for (let s = 1; s <= 50; s++) {
    const a = genRoute(mulberry32(s)), b = genRoute(mulberry32(s));
    assert(same(a, b), '种子 ' + s + ' 航线不确定');
    const { route, markets } = a;
    assert(route.length === 31, '航线应有 30 天');
    for (let d = 1; d <= 30; d++) assert((route[d] === 'market') === MARKET_DAYS.includes(d), '集市日错误: 种子 ' + s + ' 第 ' + d + ' 天');
    for (const d of MARKET_DAYS) assert(markets[d].hot !== markets[d].cold, '热销和滞销应不同');
    assert(route[1] === 'grass' && route[2] === 'grass', '前两天应为草原');
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
  update(DS); assert(!state.plots[0].ripe, '萝卜在雪原 1 天不应成熟');
  update(DS); assert(state.plots[0].ripe, '萝卜在雪原 2 天应成熟');
  update(DS); update(DS); assert(state.plots[0]?.ripe, '成熟后第 2 个日终不应烂');
  update(DS); assert(state.plots[0] === null && state.lost === 1, '成熟作物放 3 个日终应烂掉');

  fresh('rain');
  plant(0, C('melon'));
  update(DS); assert(!state.plots[0].withered && state.plots[0].harm === 1, '西瓜应撑过 1 个雨林日终');
  update(DS); assert(state.plots[0].withered && state.lost === 1, '西瓜第 2 个雨林日终应枯萎');
  update(DS); assert(state.plots[0] === null, '枯萎的地应在下一个日终清掉');

  fresh('grass');
  plant(0, C('icegrape'));
  update(DS); assert(state.plots[0].withered, '冰葡萄第 1 个草原日终应枯萎');

  for (const land of ['grass', 'rain', 'desert', 'snow']) {
    fresh(land);
    plant(0, C('potato'));
    for (let k = 0; k < 3; k++) update(DS);
    assert(!state.plots[0].ripe, '土豆 3 天不应成熟（' + land + '）');
    update(DS); assert(state.plots[0].ripe, '土豆 4 天应成熟（' + land + '）');
  }

  fresh('grass');
  update(DS - 0.1); assert(state.day === 1, '不满一天不应换天');
  update(0.1); assert(state.day === 2, 'update(DAY_SECONDS) 应正好跑一个日终');
  state.paused = true; update(100); assert(state.day === 2 && state.dayT === 0, '暂停时 update 不应推进');
  state.paused = false;
  toggleBoss(); update(100); assert(state.day === 2 && boss, '老板键时 update 不应推进'); draw();
  toggleBoss(); assert(!boss, 'Esc 再按一次应恢复');
  state.coins = 1; assert(!plant(2, C('radish')) && state.plots[2] === null && state.coins === 1, '金币不够不应能种');
  assert(!harvest(3) && sell(0) === 0, '空地不能收；没有库存不能卖');

  // ---- 收购商：任何一天都按售价一半收 ----
  fresh('grass');
  state.barn[C('banana')] = 3; state.coins = 0;
  assert(sell(C('banana')) === 39 && state.coins === 39 && state.barn[C('banana')] === 0, '收购商应按 26/2 × 3 = 39 收');
  assert(price(C('radish'), 1) === 2, '萝卜收购价应为 floor(5/2) = 2');

  // ---- 集市：时钟停住，离开集市才结束这一天 ----
  startRound();
  for (let k = 0; k < 5; k++) update(DS);
  assert(state.day === 6 && isMarketDay(), '第 5 个日终后应到第 6 天集市');
  plant(5, C('potato'));
  update(1000); assert(state.day === 6 && state.dayT === 0 && state.plots[5].pts === 0, '集市日时钟应停住');
  const m6 = state.markets[6];
  state.barn[m6.hot] = 2; state.barn[m6.cold] = 2;
  const other = [0, 1, 2, 3, 4, 5, 6, 7].find(c => c !== m6.hot && c !== m6.cold);
  state.barn[other] = 1;
  const exp = CROPS[m6.hot].sell * 2 * 2 + Math.floor(CROPS[m6.cold].sell / 2) * 2 + CROPS[other].sell;
  assert(sellAll() === exp, '集市行情价错误');
  draw();
  assert(leaveMarket() && state.day === 7 && state.plots[5].pts === 2, '离开集市应跑完第 6 天（平 +2）');
  assert(!leaveMarket(), '非集市日不能离开集市');
  // 一次溢出的大 dt 也会停在集市门口
  startRound(); update(DS * 20);
  assert(state.day === 6 && isMarketDay(), '大 dt 不应越过集市');

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
      if (isMarketDay()) leaveMarket(); else update(DS);
    }
    assert(same(seq(before).slice(-2), ['stats', 'end']), '航程应以 stats, end 结束');
    return state.coins;
  }
  // 机器人只在集市卖：收购商半价对土豆是保本，只是兜底，不是策略。
  const bands = [['forecastBot(5)', 5, r => r >= 0.95], ['forecastBot(0)', 0, r => r <= 0.05],
    ['potatoBot', 'potato', r => r <= 0.05], ['randomBot', 'random', r => r <= 0.05]];
  for (const [name, bot, ok] of bands) {
    const coins = [];
    for (let s = 1; s <= 200; s++) coins.push(play(s, bot));
    coins.sort((a, b) => a - b);
    const rate = coins.filter(c => c >= TARGET).length / 200;
    console.log(name.padEnd(15), '≥' + TARGET + ':', (rate * 100).toFixed(1) + '%', ' ≥' + TYCOON + ':', (coins.filter(c => c >= TYCOON).length / 2).toFixed(1) + '%', ' 中位数', coins[100]);
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
  assert(plant(5, 4) && plant(6, 7) && state.coins === 21, '第 1 天种完应剩 21 金币: ' + state.coins);
  update(DS); update(DS);
  assert(state.day === 3 && [0, 1, 2, 3, 4].every(i => state.plots[i].ripe), '萝卜应在第 2 天末成熟');
  assert(state.plots[5].withered, '西瓜应在雪原枯萎');
  for (let i = 0; i < 5; i++) assert(harvest(i), '收萝卜失败');
  assert(same(seq(before), ['start', 'achievement:thrive']), '第一次收获应发送 thrive: ' + seq(before));
  update(DS); update(DS);
  assert(state.day === 5 && state.plots[6].ripe, '土豆应在第 4 天末成熟');
  assert(harvest(6), '收土豆失败');
  update(DS);
  assert(state.day === 6 && isMarketDay(), '应到第 6 天集市');
  assert(sellAll() === 53 && state.coins === 74, '集市卖出后应为 74 金币: ' + state.coins);
  draw();
  state.coins = 1600;
  let n = 0;
  while (state.phase !== 'end') { if (isMarketDay()) leaveMarket(); else update(DS); n++; }
  assert(n === 25, '应再过 25 天结束: ' + n);
  assert(same(seq(before), ['start', 'achievement:thrive', 'achievement:hot_seller', 'achievement:voyage', 'achievement:tycoon', 'stats', 'end']), '确定性航程消息顺序错误: ' + seq(before));
  assert(same(lastStats(), { rounds: 1, wins: 1, harvests: 6, coins: 1600 }), 'stats 错误: ' + JSON.stringify(lastStats()));
  update(1); draw();   // 结算对话框冒烟
  assert(!plant(0, 0) && sell(0) === 0 && !leaveMarket(), '结束后不应能操作');
  newRound(); assert(state.phase === 'ready' && seq(before).at(-1) === 'end', '新建计划回到 ready，不发消息');

  // ---- 干净的胜利 ----
  before = sdkMessages.length;
  startRound(); state.coins = 800;
  for (let k = 0; k < 30; k++) { if (isMarketDay()) leaveMarket(); else update(DS); if (k % 7 === 0) draw(); }
  assert(same(seq(before), ['start', 'achievement:voyage', 'achievement:no_loss', 'stats', 'end']), '干净胜利消息错误: ' + seq(before));
  assert(same(lastStats(), { rounds: 1, wins: 1, harvests: 0, coins: 800 }), '干净胜利 stats 错误');

  // ---- 失败 ----
  before = sdkMessages.length;
  startRound();
  for (let k = 0; k < 30; k++) { if (isMarketDay()) leaveMarket(); else update(DS); }
  assert(same(seq(before), ['start', 'stats', 'end']), '失败消息错误: ' + seq(before));
  assert(same(lastStats(), { rounds: 1, wins: 0, harvests: 0, coins: START_COINS }), '失败 stats 错误');

  // ---- 布局：任何窗口大小都能画，田块单元格能点中 ----
  for (const [w, h] of [[1000, 625], [800, 500], [1440, 820], [375, 667], [320, 240]]) {
    view.w = w; view.h = h;
    const F = frame();
    assert(F.z >= 0.5 && F.z <= 1.6, '缩放越界 ' + w + 'x' + h);
    const x = (F.colX[2] + F.colX[3]) / 2, y = (F.rowY[ROW.field0 + 1] + F.rowY[ROW.field0 + 2]) / 2;
    if (y < F.by) { const cell = cellAt(F, x, y); assert(cell && fieldIndex(cell.c, cell.r) === 5, '田块点击测试错误 ' + w + 'x' + h); }
    draw();
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
