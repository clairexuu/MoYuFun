// 无头测试：打桩浏览器 API，驱动关卡规则、录制解法和整局流程（不渲染真实画布）
const fs = require('fs');
const path = require('path');

// ---- 浏览器 API 打桩 ----
const ctxStub = new Proxy({}, {
  get: (_, k) => k === 'measureText' ? () => ({ width: 0 }) : () => ({ addColorStop() {} }),
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
global.requestAnimationFrame = () => {};   // 不驱动 rAF，由测试手动 tick / update
global.setTimeout = () => 0;
const sdkMessages = [];
global.location = { hostname: 'localhost', search: '' };
global.parent = {
  postMessage(message, targetOrigin) {
    sdkMessages.push({ message, targetOrigin });
  },
};
global.document = { getElementById: () => canvasStub, documentElement: { clientWidth: 960, clientHeight: 540 } };

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
  function mulberry32(a) {
    return function () {
      a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  rng = mulberry32(1);
  // 每帧一次 tick，经过 DOM 处理函数写入的同一个 input 对象；离开 play 就停。返回跑了多少帧。
  function runInputs(runs, dropLamp) {
    let n = 0;
    for (const [frames, keys, lamp] of runs) for (let k = 0; k < frames; k++) {
      if (phase !== 'play') return n;
      input.left = keys.includes('L'); input.right = keys.includes('R');
      if (k === 0 && keys.includes('J')) input.jump = true;
      if (k === 0 && lamp != null && !dropLamp) input.lampTarget = lamp * railLength(LV.rail);
      tick(); n++;
    }
    input.left = input.right = false;
    return n;
  }

  // ---- 加载 ----
  assert(sdkMessages[0]?.message.type === 'ready', 'SDK 未发送 ready');
  assert(sdkMessages[0]?.targetOrigin === 'http://localhost:3000', 'SDK targetOrigin 错误');
  assert(sdkMessages.length === 1, '页面加载只应发送 ready');
  draw();   // 标题画面冒烟
  update(0.5); draw();
  assert(sdkMessages.length === 1, '第一次操作前只应发送 ready');

  // ---- 纯函数 ----
  assert(railLength([[0, 0], [3, 4], [3, 10]]) === 11, 'railLength 错误');
  assert(same(lampPos([[0, 0], [10, 0], [10, 10]], 15), [10, 5]), 'lampPos 错误');
  assert(nearestOnRail([[0, 0], [10, 0], [10, 10]], 30, 5) === 15, 'nearestOnRail 错误');
  assert(medalFor(0, 15) === 'gold' && medalFor(0, 15.1) === 'silver' && medalFor(0, 31) === 'bronze', 'medalFor 错误');

  // ---- 关卡规则 ----
  LEVELS.forEach((lv, i) => {
    const tag = '第 ' + (i + 1) + ' 关';
    assert(lv.name && lv.hint && lv.gold > 0 && lv.silver > lv.gold, tag + ' 缺名称 / 提示 / 标准时间');
    for (const p of lv.props) {
      for (let tk = 0; tk <= 720; tk += 15) {
        const poly = propPoly(p, tk / 60);
        for (let e = 0; e < 4; e++) {
          const a = poly[e], b = poly[(e + 1) % 4];
          assert(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 8 - 1e-9, tag + ' 道具边短于 8 px');
        }
      }
    }
    const len = railLength(lv.rail), g = buildGrid(lv, lampPos(lv.rail, lv.lampStart * len), 0);
    assert(boxFree(g, lv.spawn[0], lv.spawn[1]), tag + ' 出生点被挡住');
    assert(!boxFree(g, lv.spawn[0], lv.spawn[1] + 1), tag + ' 出生点脚下不是实心');
    for (let tk = 0; tk <= 720; tk++) for (const p of lv.props) {
      const poly = propPoly(p, tk / 60);
      for (let sv = 0; sv <= len; sv += 2) {
        const [x, y] = lampPos(lv.rail, sv);
        assert(!inside(poly, x, y), tag + ' 轨道穿过道具 s=' + sv + ' tick=' + tk);
      }
    }
  });

  // ---- 录制解法：恰好在最后一帧过关且不超过金牌时间；不动灯笼则过不了 ----
  startRound();
  const ticks = [];
  LEVELS.forEach((lv, i) => {
    const total = SOLUTIONS[i].reduce((n, r) => n + r[0], 0);
    loadLevel(i);
    const n = runInputs(SOLUTIONS[i]);
    assert(phase === 'clear' && n === total, '第 ' + (i + 1) + ' 关解法未在最后一帧过关: ' + phase + ' ' + n + '/' + total);
    assert(levelT <= lv.gold, '第 ' + (i + 1) + ' 关解法超过金牌时间');
    ticks.push(n);
    draw();   // 过关画面冒烟
    loadLevel(i);
    runInputs(SOLUTIONS[i], true);
    assert(phase !== 'clear', '第 ' + (i + 1) + ' 关不动灯笼也能过关');
  });
  console.log('解法帧数: ' + ticks.join(', '));

  // ---- 完整一局 ----
  startRound();
  let before = sdkMessages.length;
  for (let i = 0; i < 10; i++) {
    assert(li === i && phase === 'play', '整局第 ' + (i + 1) + ' 关未加载');
    runInputs(SOLUTIONS[i]);
    assert(phase === 'clear', '整局第 ' + (i + 1) + ' 关未过关');
    update(1.6);
  }
  assert(phase === 'end' && endKind === 'won', '整局未赢');
  assert(same(seq(before), ['start', 'achievement:gold_5', 'achievement:halfway', 'achievement:clear', 'achievement:deathless', 'stats', 'end']),
    '整局消息顺序错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 1, levels: 10, golds: 10 }), '整局 stats 错误: ' + JSON.stringify(sdkMessages.at(-2).message.stats));
  update(1); draw();   // 结束画面冒烟

  // ---- 挤扁 ----
  startRound(); loadLevel(6);
  before = sdkMessages.length;
  const crushAt = runInputs([[1, '', 1], [300, '']]);
  assert(phase === 'dead' && deathCause === 'crush' && crushAt <= 208, '第 7 关灯笼扫过出生点应挤扁: ' + phase + ' ' + crushAt);
  draw();
  quitRound();
  assert(same(seq(before), ['start', 'achievement:crushed', 'stats', 'end']), '挤扁消息顺序错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 0, levels: 0, golds: 0 }), '挤扁 stats 错误');

  // ---- 掉落、重来、跳过 ----
  startRound();
  before = sdkMessages.length;
  for (let k = 0; k < 3; k++) {
    assert(!canSkip(), '掉落 ' + k + ' 次时不应能跳过');
    const n = runInputs([[45, 'R'], [1, 'RJ'], [120, 'R']]);
    assert(phase === 'dead' && deathCause === 'fall' && n === 159, '第 1 关应在第 159 帧掉落: ' + n);
    const lt = levelT;
    update(0.7);
    assert(phase === 'play' && px === LEVELS[0].spawn[0] && py === LEVELS[0].spawn[1] && t === 0 && s === 0 && target === 0, '死亡后未复位');
    assert(levelT === lt && levelT > 0, '关卡计时不应在死亡后清零');
  }
  assert(canSkip() && deaths === 3, '掉落 3 次后应能跳过');
  draw();
  skipLevel();
  assert(li === 1 && phase === 'play' && medals[0] === 'skip' && !canSkip(), '跳过后应进入第 2 关');
  quitRound();
  assert(same(seq(before), ['start', 'stats', 'end']), '跳过后放弃消息错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 0, levels: 0, golds: 0 }), '跳过后放弃 stats 错误');
  assert(endKind === 'quit', '放弃应显示「今天先到这里」');

  // ---- 跳过最后一关：走完但不算赢 ----
  startRound();
  before = sdkMessages.length;
  for (let i = 0; i < 9; i++) { runInputs(SOLUTIONS[i]); update(1.6); }
  levelT = 61; skipLevel();
  assert(phase === 'end' && endKind === 'skipped', '跳过第 10 关应结束本局');
  assert(same(seq(before), ['start', 'achievement:gold_5', 'achievement:halfway', 'stats', 'end']), '跳过结束消息错误: ' + seq(before));
  assert(same(sdkMessages.at(-2).message.stats, { rounds: 1, wins: 0, levels: 9, golds: 9 }), '跳过结束 stats 错误');

  // ---- 第一次操作前放弃 ----
  before = sdkMessages.length;
  startRound(); quitRound();
  assert(sdkMessages.length === before && phase === 'title', '第一次操作前放弃不应发送消息');

  // ---- R 重来不算死亡 ----
  startRound(); runInputs([[30, 'R']]); restartLevel();
  assert(deaths === 0 && px === LEVELS[0].spawn[0], '重来应复位且不计跌落');

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
