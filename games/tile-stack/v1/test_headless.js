// 无头测试：打桩浏览器 API，驱动生成器与规则函数（不渲染真实画布）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
const ctxStub = new Proxy({}, {
  get: () => () => {},
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
global.requestAnimationFrame = () => {};   // 不驱动 rAF，gameT 保持冻结
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
  assert(sdkMessages.length === 1, '页面加载只应发送 ready');
  draw();   // 开始画面冒烟

  // ---- 生成器 ----
  for (const n of [1, 2]) {
    const a = generateLevel(n);
    assert(same(a, generateLevel(n)), '第 ' + n + ' 关生成不确定');
    const count = {};
    for (const t of a.tiles) count[t.type] = (count[t.type] || 0) + 1;
    assert(Object.values(count).every(c => c % 3 === 0), '第 ' + n + ' 关牌数不是 3 的倍数');
    if (n === 1) assert(a.tiles.length === 18 && Object.keys(count).length === 3, '第 1 关应为 3 种 18 张');
    if (n === 2) assert(a.tiles.length === 108 && Object.keys(count).length === 12 && Object.values(count).every(c => c === 9), '第 2 关应为 12 种各 9 张');
    assert(same([...a.solution].sort((x, y) => x - y), a.tiles.map(t => t.id)), '第 ' + n + ' 关解法未覆盖所有牌');
  }

  // ---- 按解法通关：确定性成就顺序 ----
  function replay(n, beforeLast) {
    startLevel(n);
    solution.forEach((id, k) => {
      if (k === solution.length - 1 && beforeLast) beforeLast();
      assert(pick(id), '第 ' + n + ' 关解法第 ' + k + ' 步不可点');
      assert(tray.length <= 6, '按解法槽位超过 6 张');
    });
    assert(screen === 'won' && over, '第 ' + n + ' 关按解法未通关');
  }
  let before = sdkMessages.length;
  replay(1);
  assert(triples === 6, '第 1 关应消除 6 组');
  assert(same(seq(before), ['start', 'achievement:combo_5', 'achievement:tutorial', 'stats', 'end']), '第 1 关消息顺序错误: ' + seq(before));
  update(1); draw();   // 结算画面冒烟

  before = sdkMessages.length;
  replay(2);
  assert(trayPeak <= 6, '按解法 trayPeak 应 ≤ 6');
  before = sdkMessages.length;
  replay(2, () => { trayPeak = 6; });
  assert(same(seq(before), ['start', 'achievement:combo_5', 'achievement:clear', 'achievement:no_props', 'achievement:close_call', 'stats', 'end']), '第 2 关消息顺序错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 1, tiles: 108 }), 'stats 错误: ' + JSON.stringify(sdkMessages.at(-2).message.stats));

  // ---- 随机点击：第 2 关必定分出胜负，槽位不超过 7 ----
  let seed = 7, wins = 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let round = 0; round < 20; round++) {
    startLevel(2);
    while (!over) {
      const free = tiles.filter(clickable);
      assert(free.length, '还没结束却无牌可点');
      pick(free[Math.floor(rnd() * free.length)].id);
      assert(tray.length <= 7, '槽位超过 7');
    }
    if (screen === 'won') wins++;
    update(1); draw();
  }
  console.log('20 局随机点击第 2 关，胜 ' + wins + ' 局');

  // ---- 道具 ----
  assert(!useProp('撤回') && (startLevel(1), !useProp('洗牌')), '第 1 关道具应不可用');
  startLevel(2);
  const first = tiles[solution[0]];
  pick(first.id);
  assert(useProp('撤回') && first.where === 'board' && tray.length === 0 && clickable(first), '撤回未恢复');
  assert(!useProp('撤回'), '撤回每关只能用一次');
  before = sdkMessages.length;
  solution.forEach(id => assert(pick(id), '撤回后按解法不可点'));
  assert(screen === 'won' && !seq(before).includes('achievement:no_props'), '用过道具不应发送 no_props: ' + seq(before));

  startLevel(2);
  for (let k = 0; tray.length < 3; k++) pick(solution[k]);
  const moved = tray.slice(0, 3);
  assert(useProp('移出') && same(hold, moved) && tray.length === 0, '移出未放入暂存行');
  assert(moved.every(id => tiles[id].where === 'hold' && clickable(tiles[id])), '暂存行的牌应可点');
  assert(pick(moved[0]) && tray.length === 1 && hold.length === 2, '暂存行的牌未回到槽位');

  startLevel(2);
  const types = tiles.filter(t => t.where === 'board').map(t => t.type).sort();
  assert(useProp('洗牌') && same(tiles.map(t => t.type).sort(), types), '洗牌应只交换类型');

  // ---- 失败：7 种不同的牌放满槽位 ----
  startLevel(2);
  const free = tiles.filter(clickable).slice(0, 7);
  assert(free.length === 7, '开局可点的牌少于 7 张');
  free.forEach((t, k) => { t.type = TYPES[k]; });
  before = sdkMessages.length;
  free.forEach(t => pick(t.id));
  assert(screen === 'lost' && same(seq(before), ['stats', 'end']), '失败消息错误: ' + seq(before));
  assert(sdkMessages.at(-2).message.stats.wins === 0, '失败 wins 应为 0');
  assert(!pick(tiles.find(clickable)?.id ?? 0), '结束后不应能点牌');

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
