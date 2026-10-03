// 无头测试：打桩浏览器 API，驱动规则函数与整局流程（不渲染真实 DOM）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
const ctxStub = new Proxy({}, {
  get: () => () => ctxStub,   // 方法返回自身，createLinearGradient().addColorStop() 也能调用
  set: () => true,
});
function makeEl(id) {
  return {
    id,
    style: { transform: '', setProperty() {} },
    classList: { toggle() {}, add() {}, remove() {}, contains: () => false },
    addEventListener() {},
    appendChild(c) { return c; },
    remove() {},
    animate: () => ({}),
    getContext: () => ctxStub,
    innerHTML: '',
    textContent: '',
    value: '5',
    disabled: false,
    offsetLeft: 0,
  };
}
const domEls = {};
global.window = global;
global.AudioContext = undefined;
global.webkitAudioContext = undefined;
global.addEventListener = () => {};
global.requestAnimationFrame = () => {};   // 不驱动 rAF，时间只靠 update(dt)
global.setTimeout = () => 0;
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
  documentElement: { clientWidth: 540, clientHeight: 960 },
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
  const throws = fn => { try { fn(); return false; } catch (e) { return true; } };
  const seq = from => sdkMessages.slice(from).map(({ message }) => message.type + (message.key ? ':' + message.key : ''));

  // ---- 加载 ----
  assert(sdkMessages[0]?.message.type === 'ready', 'SDK 未发送 ready');
  assert(sdkMessages[0]?.targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  assert(sdkMessages.length === 1, '页面加载只应发送 ready，start 等「开张」');
  assert(document.getElementById('stage').style.transform.includes('scale(1)'), 'resize 未缩放舞台');
  render();   // 开张画面冒烟

  // ---- 生成器 ----
  rng = mulberry32(1);
  for (let d = 1; d <= 7; d++) for (let k = 0; k < 10000; k++) {
    const it = makeItem(d), w = WORKSHOPS[it.workshop];
    assert(same(findFlaws(it), it.flaws) && it.fake === it.flaws.length > 0, 'flaws 与 findFlaws 不一致');
    if (!it.fake) assert(!it.planted.length, '真品不应有瑕疵');
    else assert(it.flaws.length >= 1 && it.flaws.length <= 2 && same(it.flaws, it.planted), '赝品瑕疵应等于 planted: ' + it.flaws + ' / ' + it.planted);
    if (it.flaws.includes('mark')) assert(it.mark !== w.mark, '假印记与真印记相同');
    if (it.flaws.includes('motto')) {
      assert(it.motto.length === 4 && [...it.motto].filter((c, i) => c !== w.motto[i]).length === 1, '假铭文应只差一个字: ' + it.motto);
    }
    if (it.flaws.includes('gem')) assert(!MINES[it.mine].colours.includes(it.gem), '假宝石颜色在矿脉列表里');
    if (it.flaws.includes('material')) assert(!w.materials.includes(it.material), '假材质在工坊列表里');
    assert(it.listValue >= 50 && it.listValue <= 480, 'listValue 超出 50–480: ' + it.listValue);
  }
  const CROWN = { type: '王冠', workshop: '星斗', mine: '霜岭', material: '秘银', gem: '苍', mark: '斗', motto: '斗转星移' };
  const FAKE_MARK = { type: '长剑', workshop: '山根', mine: '熔喉', material: '黑铁', gem: '赤', mark: '出', motto: '稳如磐石' };
  const RING = { type: '戒指', workshop: '月匠', mine: '晨崖', material: '银', gem: '琥', mark: '月', motto: '清辉满庭' };
  assert(buildItem(CROWN).listValue === 480 && !buildItem(CROWN).fake, '王冠应为真品，行情 480');
  assert(same(buildItem(FAKE_MARK).flaws, ['mark']), '印记「出」应是山根的瑕疵');

  // ---- 谈判 ----
  function fresh(ask, patience, spec) {
    rng = mulberry32(3); startRound(); update(1);
    Object.assign(hero, { ask, floor: Math.round(ask * 0.8 / 5) * 5, patience, item: buildItem(spec || CROWN) });
    return gold;
  }
  let g0 = fresh(100, 2);
  assert(offer(100) === 'deal' && gold === g0 - 100 && loans.length === 1 && loans[0].loan === 100, 'offer(100) 应成交');
  fresh(100, 2);
  assert(offer(70) === 'counter' && hero.ask === 85 && hero.patience === 1, 'offer(70) 应还价 85');
  g0 = gold; acceptCounter();
  assert(loans[0].loan === 85 && gold === g0 - 85, 'acceptCounter 应按 85 成交');
  fresh(100, 2);
  assert(offer(70) === 'counter' && offer(80) === 'walked' && loans.length === 0, '两次低价应走人');
  fresh(100, 2);
  assert(offer(45) === 'walked', 'patience 2 时侮辱应走人');
  fresh(100, 3);
  assert(offer(45) === 'insulted' && hero.ask === 100 && hero.patience === 1, 'patience 3 时应 insulted 且 ask 不变');
  fresh(100, 2, FAKE_MARK);
  toggleMark('mark');
  assert(confront() === 'caught' && hero.ask === 40 && hero.floor === 30 && hero.caught && fakesCaught === 1, '识破应降到 40 / 30');
  assert(throws(() => confront()), 'confront 每位顾客只能一次');
  fresh(100, 2);
  assert(throws(() => confront()), '没有标记时 confront 应抛出');
  toggleMark('gem'); toggleMark('mark'); toggleMark('gem');
  assert(same(hero.marks, ['mark']), 'toggleMark 应能取消');
  assert(confront() === 'offended' && hero.ask === 110 && hero.patience === 1 && falseAccusations === 1, '冤枉好人应 ask 110、patience 1');
  fresh(100, 2);
  assert(throws(() => offer(485)) && throws(() => offer(0)), '超出 listValue 的出价应抛出');
  gold = 60;
  assert(throws(() => offer(65)) && offer(60) === 'counter', '超出金币的出价应抛出');
  assert(throws(() => acceptCounter()), '金币不够时不能接受还价');
  render();

  // ---- 夜晚 ----
  function atNight(spec, p, caught) {
    rng = mulberry32(5); startRound();
    gold = 1000; interest = 0;
    loans = [{ hero: { ...hero, p, item: buildItem(spec) }, loan: 100, caught }];
    const r = endDay(); render(); return r;
  }
  atNight(RING, 1, false);
  assert(gold === 1150 && interest === 50 && hoard.length === 0, '真品存活应还 150、利息 50');
  atNight(FAKE_MARK, 1, true);
  assert(gold === 1150 && interest === 50, '识破的赝品存活也应还 150');
  let r = atNight(FAKE_MARK, 1, false);
  assert(gold === 1000 && interest === 0 && hoard.length === 0 && r.rows[0].kind === 'abscond', '没识破的赝品应卷款溜走');
  atNight(RING, 0, false);
  assert(hoard.length === 1 && hoardValue() === buildItem(RING).listValue && !fakeInHoard, '死者的真品应入库');
  atNight(FAKE_MARK, 0, false);
  assert(hoard.length === 1 && hoardValue() === 0 && fakeInHoard, '死者的赝品应以 0 入库');
  assert(phase === 'night', 'endDay 后应为夜晚');

  // ---- 蜡烛 ----
  rng = mulberry32(9); startRound();
  const h1 = hero;
  update(70);
  assert(candle === 0 && hero === h1 && phase === 'day', '蜡烛燃尽时当前顾客应留下');
  refuse();
  assert(phase === 'night' && queue.length === 5 && night && night.rows.length === 0, '蜡烛燃尽后 refuse 应直接入夜');
  render();

  // ---- 确定性整局 ----
  rng = mulberry32(7);
  let before = sdkMessages.length;
  startRound();
  for (let k = 0; k < 5; k++) {
    hero.item = buildItem(FAKE_MARK);
    toggleMark('mark');
    assert(confront() === 'caught', '第 ' + (k + 1) + ' 位应被识破');
    refuse();
  }
  hero.item = buildItem(CROWN); hero.ask = 300; hero.p = 0;
  assert(offer(300) === 'deal', '王冠应成交');
  assert(phase === 'night' && night.rows.length === 1 && night.rows[0].kind === 'dead' && gold === 470, '第 1 夜应有 1 件入库，金币 470: ' + gold);
  render();
  nextDay();
  assert(day === 2 && gold === 440, '第 2 天应扣租金到 440');
  interest = 490;
  hero.item = buildItem(RING); hero.ask = 40; hero.p = 1;
  assert(offer(40) === 'deal', '戒指应成交');
  while (phase === 'day') refuse();
  assert(night.rows[0].repay === 60 && interest === 510, '第 2 夜应还 60，利息 510');
  for (let d = 3; d <= 7; d++) {
    nextDay();
    assert(day === d && phase === 'day', '应进入第 ' + d + ' 天');
    while (phase === 'day') refuse();
  }
  hoard.push(buildItem(CROWN), buildItem(CROWN));
  assert(hoardValue() === 1440, '宝库应为 1440');
  nextDay();
  assert(phase === 'over' && endReason === 'win', '应获胜');
  assert(same(seq(before), ['start', 'achievement:sharp_eye', 'achievement:first_hoard', 'achievement:big_haul', 'achievement:loan_shark',
    'achievement:win', 'achievement:clean_win', 'stats', 'end']), '整局消息顺序错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 1, fakes: 5, hoard: 1440 }), 'stats 错误: ' + JSON.stringify(sdkMessages.at(-2).message.stats));
  render();
  assert(document.getElementById('endTitle').textContent === '富可敌国', '获胜画面标题错误');

  // ---- 破产 ----
  rng = mulberry32(11);
  before = sdkMessages.length;
  startRound();
  gold = 20;
  while (phase === 'day') refuse();
  nextDay();
  assert(phase === 'over' && endReason === 'bust', '应破产');
  assert(same(seq(before), ['start', 'stats', 'end']), '破产消息顺序错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 0, fakes: 0, hoard: 0 }), '破产 stats 错误');
  render();
  assert(document.getElementById('endTitle').textContent === '关门大吉', '破产画面标题错误');

  // ---- 平衡：两种机器人各 200 局 ----
  function play(seed, bot) {
    rng = mulberry32(seed); startRound();
    while (phase !== 'over') {
      if (phase === 'night') { nextDay(); continue; }
      const it = hero.item, V = it.listValue;
      let terms = bot(it, hero);
      if (!terms) { refuse(); continue; }
      let o = round5(terms.open * V), res;
      for (;;) {
        o = Math.min(o, maxOffer());
        if (o < 5) { refuse(); break; }
        res = offer(o);
        if (res === 'deal' || res === 'walked') break;
        if (hero.ask <= terms.cap * V && hero.ask <= gold) { acceptCounter(); break; }
        o = round5(o + 0.1 * V);
      }
    }
    return endReason === 'win';
  }
  const naive = () => ({ open: 0.6, cap: 0.85 });
  const expert = (it, h) => {
    if (!it.fake) return { open: 0.55, cap: 0.85 };
    toggleMark(it.flaws[0]);
    assert(confront() === 'caught', '专家应识破赝品');
    return h.p >= 0.7 ? { open: 0.2, cap: 0.4 } : null;
  };
  const rate = bot => { let w = 0; for (let s = 1; s <= 200; s++) w += play(s, bot); return w / 200; };
  const n = rate(naive), e = rate(expert);
  console.log('平衡：专家胜率 ' + (e * 100).toFixed(1) + '%，不验货 ' + (n * 100).toFixed(1) + '%');
  assert(e >= 0.6, '专家胜率应 ≥ 60%');
  assert(n <= 0.15, '不验货胜率应 ≤ 15%');

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
