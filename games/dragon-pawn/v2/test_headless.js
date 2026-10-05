// 无头测试：打桩浏览器 API，驱动规则函数、update(dt) 与整局流程（不渲染真实画布）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 40 }) : () => {}),
  set: () => true,
});
const canvasStub = { style: {}, addEventListener() {}, getContext: () => ctxStub, focus() {} };
const store = {};
global.window = global;
global.devicePixelRatio = 1;
global.AudioContext = undefined;
global.webkitAudioContext = undefined;
global.addEventListener = () => {};
global.requestAnimationFrame = () => {};   // 不驱动 rAF，时间只靠 update(dt)
global.setTimeout = () => 0;               // 0.5/2/5 秒的重复 ready 不触发
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
  const key = k => onKey({ key: k, preventDefault() {} });

  // ---- 加载：ready + disguise，首帧是冻结的台账 ----
  assert(same(seq(0), ['ready', 'disguise']), '加载应只发送 ready 和 disguise: ' + seq(0));
  assert(sdkMessages[0].targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  const dg = sdkMessages[1].message;
  assert(Object.keys(dg).sort().join() === 'app,source,title,type,version' && dg.app === 'excel' && dg.title === TITLE, 'disguise 消息错误');
  assert(TITLE.length <= 80 && BOSS_TITLE.length <= 80, '标题超过 80 字');
  assert(phase === 'day' && day === 1 && rows.length === 1 && !started, '首帧应是第 1 天、一行待处理、未开始');
  draw();
  update(30);
  assert(rows.length === 1 && clock === 0, '第一次处理之前时间不走');

  // ---- 生成器 ----
  for (const seed of [1, 2, 3]) {
    rng = mulberry32(seed); closed = pick(WORKSHOPS);
    for (let d = 1; d <= DAYS; d++) {
      const active = rulesFor(d), planted = new Set(), count = { 收: 0, 压价: 0, 拒: 0 };
      for (let i = 0; i < 3000; i++) {
        const r = makeRow(d), seen = judge(r, active), truth = judge(r, RULES);
        assert(seen.verdict === r.truth && truth.verdict === r.truth, '当天规则与全部规则的判断不一致');
        assert(r.value >= 50 && r.value <= 480 && r.ask >= 5 && r.ask % 5 === 0, '行情或要价越界');
        count[r.truth]++;
        if (r.truth === '拒') {
          assert(seen.broken.includes(r.planted), '赝品没有违反所伪造的那条规则');
          assert(rulesFor(d).some(x => x.id === r.planted), '伪造了还没公布的规则');
          planted.add(r.planted);
        } else {
          assert(truth.broken.length === 0, '真品违反了规则');
          assert(r.mark === r.workshop[0] && r.gem === r.mine[0] && r.motto.length === 4 && r.workshop !== closed, '真品字段不合规');
          assert(Math.abs(r.ask - seen.limit * r.value) >= 0.05 * r.value && Math.abs(r.ask - truth.limit * r.value) >= 0.05 * r.value, '要价离压价线太近，2 秒内看不出: ' + r.ask + ' / ' + r.value);
        }
        if (d < 3) assert(r.workshop !== closed, '停业工坊在规则公布前出现');
      }
      const fakeIds = active.filter(x => x.kind === 'fake').map(x => x.id);
      assert(same([...planted].sort((a, b) => a - b), fakeIds), '第 ' + d + ' 天没有覆盖每条规则的赝品: ' + [...planted]);
      assert(Math.abs(count['拒'] / 3000 - FAKE_RATE[d - 1]) < 0.04, '赝品比例偏离');
      if (d >= 4) {
        // 秘银例外确实出现：秘银真品要价在一半到七成之间时应当照收
        let hit = 0;
        for (let i = 0; i < 3000; i++) { const r = makeRow(d); if (r.truth === '收' && r.material === '秘银' && r.ask > r.value / 2) hit++; }
        assert(hit > 0, '秘银例外从不出现');
      }
    }
  }

  // ---- 结算 ----
  const S = (truth, ask, d) => settle({ value: 200, ask, truth }, d);
  assert(same(S('收', 80, '收'), { paid: 80, profit: 120, best: 120, missed: 0 }), '收 公道真品');
  assert(same(S('收', 80, '压价'), { paid: 0, profit: 0, walked: true, best: 120, missed: 120 }), '压价 公道真品应谈崩');
  assert(same(S('收', 80, '拒'), { paid: 0, profit: 0, best: 120, missed: 120 }), '拒 公道真品');
  assert(same(S('收', 80, '超时'), { paid: 0, profit: -FINE, best: 120, missed: 120 }), '超时');
  assert(same(S('压价', 150, '收'), { paid: 150, profit: 50, best: 110, missed: 60 }), '收 虚高真品');
  assert(same(S('压价', 150, '压价'), { paid: 90, profit: 110, best: 110, missed: 0 }), '压价 虚高真品');
  assert(same(S('拒', 150, '收'), { paid: 150, profit: -150, best: 0, missed: 0 }), '收 赝品');
  assert(same(S('拒', 150, '压价'), { paid: 90, profit: -90, best: 0, missed: 0 }), '压价 赝品');
  assert(same(S('拒', 150, '拒'), { paid: 0, profit: 0, best: 0, missed: 0 }), '拒 赝品');

  // ---- 积压：超过 5 行待处理，最早的一行超时 ----
  rng = mulberry32(3); startRound();
  let before = sdkMessages.length;
  key('3');
  assert(started && same(seq(before), ['start']), '第一次处理应发送 start');
  for (let i = 0; i < 400 && rows.length < PLAN[0].n; i++) { update(0.25); assert(pending().length <= BACKLOG, '待处理超过上限'); }
  const timedOut = rows.filter(r => r.decision === '超时');
  assert(timedOut.length === PLAN[0].n - 1 - BACKLOG && timedOut[0].n === 2 && timedOut[0].profit === -FINE, '积压溢出应让最早的行超时');

  // ---- 键盘选行、点击命中 ----
  const p = pending();
  assert(selected() === p[0], '默认选中最早的待处理行');
  key('ArrowDown'); assert(selected() === p[1], '↓ 选下一行');
  key('2'); assert(p[1].decision === '压价' && selected() === p[0], '按 2 压价选中行，然后回到最早的行');
  const L = layout(currentModel()), at = L.rows.findIndex(x => x.r && x.r.key === p[2].n);
  const chip = CHIPS.find(c => c.d === '收');
  onPointer((L.xs[10] + chip.x + 5) * L.z, TOP + (CH_H + at * RH + RH / 2) * L.z);
  assert(p[2].decision === '收', '点击「收」应处理那一行');
  onPointer((L.xs[1] + 5) * L.z, TOP + (CH_H + L.rows.findIndex(x => x.r && x.r.key === p[3].n) * RH + RH / 2) * L.z);
  assert(selected() === p[3] && !p[3].decision, '点击行的其他单元格只选中');
  draw();

  // ---- 老板键：隐藏、冻结时间、改标题 ----
  before = sdkMessages.length;
  const t0 = clock, n0 = rows.length;
  key('Escape');
  assert(boss && same(sdkMessages.at(-1).message, { source: 'moyufun-game', version: 1, type: 'disguise', app: 'excel', title: BOSS_TITLE }), '老板键应改伪装标题');
  update(20); key('1');
  assert(clock === t0 && rows.length === n0 && !p[3].decision, '老板键期间时间冻结、按键无效');
  draw();
  key('Escape');
  assert(!boss && sdkMessages.at(-1).message.title === TITLE, '再按 Esc 恢复');

  // ---- 声音默认关 ----
  assert(muted, '声音默认关闭'); key('m'); assert(!muted, 'M 打开声音'); key('M'); assert(muted, 'M 关闭声音');

  // ---- 机器人：通过 update(dt) 和真实函数玩完整一个月 ----
  function play(seed, policy, react) {
    rng = mulberry32(seed); startRound();
    let busy = 0, guard = 0, time = 0, timeouts = 0;
    while (phase !== 'over') {
      assert(guard++ < 20000, '对局没有结束');
      if (phase === 'recon') { nextDay(); continue; }
      busy -= 0.25;
      if (busy <= 0 && selected()) { decide(selected(), policy(selected())); busy = react; }
      if (started) { update(0.25); time += 0.25; }
    }
    for (const s of log) timeouts += s.timeouts;
    return { net: total, timeouts, time, correct: log.reduce((a, s) => a + s.correct, 0), n: log.reduce((a, s) => a + s.n, 0) };
  }
  const ruleBot = r => judge(r, rules).verdict;

  // ---- 确定性整局：守规机器人，消息顺序 ----
  before = sdkMessages.length;
  const g = play(7, ruleBot, 0);
  assert(g.correct === g.n && g.timeouts === 0, '守规机器人应全部正确');
  const got = seq(before);
  assert(same(got, ['start', 'achievement:clean_day', 'achievement:sharp_eye', 'achievement:bargain', 'achievement:full_month', 'achievement:target', 'achievement:perfect', 'stats', 'end']), '整局消息顺序错误: ' + got);
  const st = sdkMessages.at(-2).message.stats;
  assert(same(Object.keys(st), ['rounds', 'wins', 'fakes', 'profit']) && st.rounds === 1 && st.wins === 1 && st.profit === total && st.fakes === fakesCaught, 'stats 错误: ' + JSON.stringify(st));
  assert(JSON.parse(store[BEST_KEY]) === total, '历史最佳未保存');
  draw();
  before = sdkMessages.length;
  key('Enter');
  assert(phase === 'day' && day === 1 && !started && seq(before).length === 0, 'Enter 新建下月台账，start 等第一次处理');

  // ---- 失败局：全收 ----
  before = sdkMessages.length;
  const a = play(7, () => '收', 0);
  const aSeq = seq(before);
  assert(aSeq[0] === 'start' && aSeq.includes('achievement:full_month') && !aSeq.includes('achievement:target') && aSeq.slice(-2).join() === 'stats,end', '全收局消息错误: ' + aSeq);
  assert(sdkMessages.at(-2).message.stats.wins === 0 && sdkMessages.at(-2).message.stats.profit === Math.max(0, a.net), '全收局 stats 错误');

  // ---- 平衡：同一种子下，守规机器人明显胜过全收和随机 ----
  const N = 200, sum = { rule: 0, accept: 0, random: 0, noisy: 0 }, beat = { accept: 0, random: 0 };
  let noisyWins = 0;
  for (let seed = 1; seed <= N; seed++) {
    const rule = play(seed, ruleBot, 0).net;
    const accept = play(seed, () => '收', 0).net;
    const br = mulberry32(seed + 1000);
    const random = play(seed, () => DECISIONS_ALL[Math.floor(br() * 3)], 0).net;
    const bn = mulberry32(seed + 2000);
    const noisy = play(seed, r => bn() < 0.15 ? DECISIONS_ALL[Math.floor(bn() * 3)] : ruleBot(r), 0).net;
    sum.rule += rule; sum.accept += accept; sum.random += random; sum.noisy += noisy;
    if (rule > accept) beat.accept++;
    if (rule > random) beat.random++;
    if (noisy >= TARGET) noisyWins++;
  }
  const mean = k => Math.round(sum[k] / N);
  console.log('平均净利润（' + N + ' 局）：守规 ' + mean('rule') + ' · 失误 15% ' + mean('noisy') + '（达标 ' + noisyWins + ' 局）· 全收 ' + mean('accept') + ' · 随机 ' + mean('random'));
  assert(beat.accept === N && beat.random === N, '守规机器人应在每个种子都赢: ' + JSON.stringify(beat));
  assert(mean('rule') >= 3 * Math.max(mean('accept'), mean('random'), 1), '守规机器人领先不够明显');
  assert(mean('rule') > TARGET * 1.3 && mean('accept') < TARGET / 2, '月度目标应在守规与全收之间');

  // ---- 时间压力：3.5 秒一行不会超时，8 秒一行会 ----
  let fast = 0, slow = 0, time = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const f = play(seed, ruleBot, 3.5); fast += f.timeouts; time += f.time;
    slow += play(seed, ruleBot, 8).timeouts;
  }
  console.log('每局营业时间约 ' + Math.round(time / 20) + ' 秒；3.5 秒一行超时 ' + fast + ' 次，8 秒一行超时 ' + slow + ' 次（20 局）');
  assert(fast === 0 && slow > 20, '时间压力不对');
  assert(time / 20 > 270 && time / 20 < 360, '一局营业时间应在 4.5–6 分钟');

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
eval(code + "\nconst DECISIONS_ALL = ['收', '压价', '拒'];\n" + driver);
