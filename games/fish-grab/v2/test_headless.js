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
  const types = from => sdkMessages.slice(from).map(({ message }) => message.type + (message.key ? ':' + message.key : '')).join(',');
  const lastStats = () => sdkMessages.at(-2).message.stats;
  if (sdkMessages[0]?.message.type !== 'ready') throw new Error('SDK 未发送 ready');
  if (sdkMessages[0]?.targetOrigin !== 'http://localhost:3000') throw new Error('SDK targetOrigin 错误');
  render(); // 菜单帧

  // 友伤检测 + 拾鱼计数
  const realApplyDamage = applyDamage;
  applyDamage = (src, tgt, def, angle) => {
    if (src && src.team === tgt.team) throw new Error('友伤：' + src.name + ' -> ' + tgt.name);
    return realApplyDamage(src, tgt, def, angle);
  };
  const realPickUp = pickUpFish;
  let pickups = 0;
  pickUpFish = e => { pickups++; return realPickUp(e); };

  loadout[0] = 'quick'; loadout[1] = 'heavy';
  refreshMenu();
  startGame();
  if (sdkMessages.at(-1)?.message.type !== 'start') throw new Error('SDK 未发送 start');
  if (phase !== 'play' || entities.length !== 6) throw new Error('开局状态错误');
  if (entities.filter(e => e.team === 0).length !== 3) throw new Error('每队应有 3 人');
  render();

  // 模拟：玩家随机输入，最多 8 分钟
  const keyPool = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
  let frames = 0;
  while (frames < 60 * 480 && phase !== 'over') {
    if (frames % 45 === 0) {
      for (const k of keyPool) keys[k] = Math.random() < 0.4;
      mouse.L = Math.random() < 0.8;
      mouse.R = Math.random() < 0.4;
      mouse.x = Math.random() * 1100;
      mouse.y = Math.random() * 700;
    }
    update(1 / 60);
    if (frames % 600 === 0) render();
    for (const e of entities) {
      if (Number.isNaN(e.x) || Number.isNaN(e.y) || Number.isNaN(e.hp)) throw new Error(e.name + ' 出现 NaN');
    }
    if (Number.isNaN(fish.x) || Number.isNaN(fish.y)) throw new Error('金鱼坐标 NaN');
    frames++;
  }
  console.log('模拟 ' + (gameT).toFixed(1) + 's 后 phase =', phase, '比分', teamScore.join(':'), '拾鱼', pickups, '次');
  for (const e of entities) console.log('  ' + e.name.padEnd(3, '　') + ' 队' + e.team + ' 送鱼/击倒/阵亡 = ' + e.scores + '/' + e.kills + '/' + e.deaths + ' 斩击: ' + e.slots.join('+'));
  if (phase !== 'over') throw new Error('8 分钟内未结束');
  if (Math.max(...teamScore) !== 5 && gameT < 300) throw new Error('结束时比分异常');
  if (teamScore[0] === teamScore[1]) throw new Error('不应平局结束');
  if (pickups < 3) throw new Error('金鱼被拾取次数过少: ' + pickups);
  render();
  if (sdkMessages.at(-1)?.message.type !== 'end' || sdkMessages.at(-2)?.message.type !== 'stats') throw new Error('结算应为 stats, end');
  applyDamage = realApplyDamage; pickUpFish = realPickUp;

  // 确定性一局：成就顺序
  loadout[0] = 'wave'; loadout[1] = 'thrust';
  startGame();
  const before = sdkMessages.length;
  const enemy = entities.find(e => e.team === 1);
  const ally = entities.find(e => e.team === 0 && !e.isPlayer);
  fish.carrier = player; score(player);
  fish.carrier = enemy; enemy.invulnT = 0;
  applyDamage(player, enemy, SLASHES.quick, 0);
  if (fish.carrier !== null || stealUntil === 0) throw new Error('受击未掉鱼');
  pickUpFish(player);
  score(player);
  fish.carrier = ally;
  kill(player, enemy); kill(player, enemy); kill(player, enemy);
  score(player);
  score(player); score(player);
  const expected = 'achievement:first_score,achievement:steal,achievement:escort,achievement:hat_trick,achievement:first_win,achievement:shutout,stats,end';
  if (types(before) !== expected) throw new Error('成就消息顺序错误: ' + types(before));
  if (JSON.stringify(lastStats()) !== JSON.stringify({ rounds: 1, wins: 1, scores: 5, kills: 3 })) throw new Error('stats 数值错误: ' + JSON.stringify(lastStats()));
  for (const { message } of sdkMessages) {
    const k = Object.keys(message).sort().join(',');
    if (message.source !== 'moyufun-game' || message.version !== 1) throw new Error('SDK 协议版本错误');
    if (message.type === 'achievement' && k !== 'key,source,type,version') throw new Error('成就消息字段不精确');
    if (message.type === 'stats' && k !== 'source,stats,type,version') throw new Error('stats 消息字段不精确');
    if (message.type !== 'achievement' && message.type !== 'stats' && k !== 'source,type,version') throw new Error('SDK 消息字段不精确');
  }
  render();

  // 持鱼者无法使用右槽
  startGame();
  fish.carrier = player;
  tryCast(player, 1);
  if (player.casting) throw new Error('持鱼时不应能用右槽');
  tryCast(player, 0);
  if (!player.casting) throw new Error('持鱼时应能用左槽');

  // 败局
  startGame();
  const foe = entities.find(e => e.team === 1);
  for (let i = 0; i < 5; i++) score(foe);
  if (phase !== 'over' || JSON.stringify(lastStats()) !== JSON.stringify({ rounds: 1, wins: 0, scores: 0, kills: 0 })) throw new Error('败局 stats 错误: ' + JSON.stringify(lastStats()));

  // 加时：5:00 平分不结束，下一次得分结束
  startGame();
  score(player); score(entities.find(e => e.team === 1));
  freezeT = 0; gameT = 300;
  update(1 / 60);
  if (phase !== 'play') throw new Error('平分时 5:00 不应结束');
  render();
  score(entities.find(e => e.team === 1));
  if (phase !== 'over' || winnerTeam !== 1) throw new Error('加时得分应结束本局');
  // 5:00 领先方直接获胜
  startGame();
  score(player);
  freezeT = 0; gameT = 300;
  update(1 / 60);
  if (phase !== 'over' || winnerTeam !== 0) throw new Error('5:00 领先方应获胜');

  // 鱼掉落 10 秒无人碰回到中央
  startGame();
  for (const e of entities) { e.alive = false; e.respawnT = 999; }
  fish.x = 200; fish.y = 600;
  for (let i = 0; i < 60 * 10.2; i++) update(1 / 60);
  if (fish.x !== 550 || fish.y !== 350) throw new Error('金鱼未回到中央');

  // 中途返回菜单不发送消息
  startGame();
  const beforeMenu = sdkMessages.length;
  backToMenu();
  render();
  if (phase !== 'menu' || entities.length !== 0) throw new Error('返回菜单失败');
  if (sdkMessages.length !== beforeMenu) throw new Error('中途返回菜单不应发送任何消息');
  console.log('全部断言通过 ✅');
})();
`;
eval(code + driver);
