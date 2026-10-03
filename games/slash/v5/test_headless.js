// 无头冒烟测试：打桩浏览器 API，驱动游戏逻辑（不渲染真实画布）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
const ctxStub = new Proxy({}, {
  get: (t, prop) => (...args) => {},
  set: () => true,
});
function makeEl(id) {
  return {
    id,
    style: { setProperty() {} },
    dataset: {},
    classList: { toggle() {}, add() {}, remove() {} },
    addEventListener() {},
    appendChild() {},
    querySelector() { return { textContent: '' }; },
    querySelectorAll() { return { forEach() {} }; },
    innerHTML: '',
    textContent: '',
    disabled: false,
  };
}
const canvasStub = Object.assign(makeEl('game'), {
  getContext: () => ctxStub,
  width: 0, height: 0,
});
global.window = global;
global.devicePixelRatio = 1;
global.innerWidth = 1280;
global.innerHeight = 800;
global.AudioContext = undefined;
global.webkitAudioContext = undefined;
global.addEventListener = () => {};
global.requestAnimationFrame = () => {};   // 不驱动 rAF，手动驱动 update
const sdkMessages = [];
global.location = { hostname: 'localhost' };
global.parent = {
  postMessage(message, targetOrigin) {
    sdkMessages.push({ message, targetOrigin });
  },
};
global.document = {
  getElementById: id => (id === 'game' ? canvasStub : makeEl(id)),
  createElement: () => makeEl('div'),
  querySelectorAll: () => ({ forEach() {} }),
};

// ---- 从 index.html 提取内联脚本 + 测试驱动 ----
const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const match = html.match(/<script>([\s\S]*?)<\/script>/);
if (!match) throw new Error('未在 index.html 中找到 <script> 块');
const code = match[1];
const driver = `
;(function runTest() {
  if (sdkMessages[0]?.message.type !== 'ready') throw new Error('SDK 未发送 ready');
  if (sdkMessages[0]?.targetOrigin !== 'http://localhost:3000') throw new Error('SDK targetOrigin 错误');
  // 渲染一帧菜单（phase='menu'，entities 为空）
  render();

  loadout[0] = 'quick'; loadout[1] = 'heavy';
  refreshMenu();
  startGame();
  if (sdkMessages.at(-1)?.message.type !== 'start') throw new Error('SDK 未发送 start');
  if (phase !== 'play') throw new Error('startGame 后 phase 应为 play');
  if (entities.length !== 6) throw new Error('应有 6 个实体，实际 ' + entities.length);
  if (!player.isPlayer) throw new Error('player 标记错误');
  for (const e of entities) {
    if (!e.isPlayer && e.slots[0] === e.slots[1]) throw new Error('AI 携带了重复斩击');
  }
  render(); // 渲染一帧战斗画面

  // 模拟玩家输入：随机移动 + 按住左键
  const keyPool = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  let frames = 0, maxFrames = 60 * 240; // 最多模拟 4 分钟
  while (frames < maxFrames && phase !== 'over') {
    if (frames % 45 === 0) {
      for (const k of keyPool) keys[k] = Math.random() < 0.4;
      mouse.L = Math.random() < 0.8;
      mouse.R = Math.random() < 0.4;
      mouse.x = Math.random() * 1100;
      mouse.y = Math.random() * 700;
    }
    update(1 / 60);
    if (frames % 600 === 0) render();
    frames++;
  }
  console.log('模拟 ' + (frames / 60).toFixed(1) + 's 后 phase =', phase);
  const totalKills = entities.reduce((s, e) => s + e.kills, 0);
  console.log('总击杀数 =', totalKills);
  for (const e of entities) {
    console.log('  ' + e.name.padEnd(4, '　') + ' K/D = ' + e.kills + '/' + e.deaths +
      ' 斩击: ' + e.slots.join('+') + ' hp=' + Math.round(e.hp) + ' alive=' + e.alive);
    if (Number.isNaN(e.x) || Number.isNaN(e.y)) throw new Error(e.name + ' 坐标出现 NaN');
    if (e.alive && (e.x < 0 || e.x > 1100 || e.y < 0 || e.y > 700)) throw new Error(e.name + ' 越界');
  }
  if (totalKills === 0) throw new Error('模拟 4 分钟无任何击杀，AI 战斗可能失效');
  if (phase === 'over') {
    if (!winner || winner.kills < 10) throw new Error('winner 状态异常');
    console.log('胜者:', winner.name, winner.kills + ' 杀');
    render(); // 渲染结算横幅
  }
  // 测试重开与返回菜单
  if (phase !== 'over') {
    player.kills = 9;
    kill(player, entities.find(e => !e.isPlayer));
  }
  if (sdkMessages.at(-1)?.message.type !== 'end') throw new Error('SDK 未发送 end');
  if (sdkMessages.at(-2)?.message.type !== 'stats') throw new Error('end 之前必须发送 stats');
  for (const { message } of sdkMessages) {
    if (message.type !== 'achievement' && message.type !== 'stats' && Object.keys(message).sort().join(',') !== 'source,type,version') throw new Error('SDK 消息字段不精确');
    if (message.source !== 'moyufun-game' || message.version !== 1) throw new Error('SDK 协议版本错误');
  }
  // 成就：新一局确定性验证发送顺序，结算成就必须在 end 之前
  loadout[0] = 'wave'; loadout[1] = 'thrust';
  refreshMenu();
  const before = sdkMessages.length;
  startGame();
  if (phase !== 'play' || entities.length !== 6) throw new Error('重开失败');
  const ai = entities.find(e => !e.isPlayer);
  player.streak = 4;
  kill(player, ai);
  kill(player, ai);                       // 同一局重复击杀不重复发送 first_blood / rampage
  player.kills = 9;
  kill(player, ai);
  const round = sdkMessages.slice(before).map(({ message }) => message.type + (message.key ? ':' + message.key : ''));
  const expected = ['start', 'achievement:first_blood', 'achievement:rampage', 'achievement:first_win', 'achievement:flawless', 'achievement:swift', 'achievement:ranged', 'stats', 'end'];
  if (round.join(',') !== expected.join(',')) throw new Error('成就消息顺序错误: ' + round.join(','));
  const stats = sdkMessages.at(-2).message.stats;
  if (JSON.stringify(stats) !== JSON.stringify({ rounds: 1, wins: 1, kills: 10 })) throw new Error('stats 数值错误: ' + JSON.stringify(stats));
  for (const { message } of sdkMessages.slice(before)) {
    const keys = Object.keys(message).sort().join(',');
    if (message.type === 'achievement' && keys !== 'key,source,type,version') throw new Error('成就消息字段不精确');
    if (message.type === 'stats' && keys !== 'source,stats,type,version') throw new Error('stats 消息字段不精确');
    if (message.type !== 'achievement' && message.type !== 'stats' && keys !== 'source,type,version') throw new Error('SDK 消息字段不精确');
  }
  // AI 获胜：rounds 计 1、wins 计 0、kills 为玩家本局击杀数
  startGame();
  const rival = entities.find(e => !e.isPlayer);
  kill(player, rival);
  rival.kills = 9;
  kill(rival, player);
  const lost = sdkMessages.at(-2).message;
  if (lost.type !== 'stats' || JSON.stringify(lost.stats) !== JSON.stringify({ rounds: 1, wins: 0, kills: 1 })) throw new Error('败局 stats 错误: ' + JSON.stringify(lost));
  if (sdkMessages.at(-1)?.message.type !== 'end') throw new Error('败局未发送 end');
  startGame();
  kill(player, entities.find(e => !e.isPlayer));
  if (sdkMessages.at(-1)?.message.key !== 'first_blood') throw new Error('新一局应重新发送 first_blood');
  const beforeMenu = sdkMessages.length;
  backToMenu();
  if (phase !== 'menu' || entities.length !== 0) throw new Error('返回菜单失败');
  if (sdkMessages.length !== beforeMenu) throw new Error('中途返回菜单不应发送任何消息');
  console.log('全部断言通过 ✅');
})();
`;
eval(code + driver);
