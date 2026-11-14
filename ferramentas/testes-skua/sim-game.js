/* sim-game.js — "jogo de mentira" para testar bots do Skua sem o AQW.
 * Implementa a ponte window.aqw (get/set/call/keys/target/cast) em cima de um mundo simulado (mapas, celas, monstros,
 * drops, quests, inventário, banco, loja) e injeta os mesmos pacotes que o servidor mandaria (window.onPacket).
 * O tempo é virtual: setTimeout/setInterval/Date.now andam sozinhos até o próximo evento, então horas de bot rodam em segundos
 * e um bot "travado" aparece como: nenhum evento novo / script que nunca termina.
 *
 * uso:  const sim = require('./sim-game'); sim.install(global); ...  await sim.run(promiseDoScript, {maxSeconds: 3600})
 */
'use strict';
const T = { now: 1700000000000, q: [], seq: 0, steps: 0 };

function installClock(g) {
  g.Date = class extends Date { constructor(...a) { if (a.length) super(...a); else super(T.now); } static now() { return T.now; } };
  g.setTimeout = function (fn, ms, ...a) { const id = ++T.seq; T.q.push({ id, t: T.now + Math.max(0, +ms || 0), seq: id, fn: () => fn(...a) }); return id; };
  g.clearTimeout = function (id) { T.q = T.q.filter(x => x.id !== id); };
  g.setInterval = function (fn, ms, ...a) {
    const id = ++T.seq; const per = Math.max(1, +ms || 1);
    const sched = () => { T.q.push({ id, t: T.now + per, seq: ++T.seq, fn: () => { sched(); fn(...a); } }); };
    sched(); return id;
  };
  g.clearInterval = g.clearTimeout;
}

function install(g, opts) {
  opts = opts || {};
  installClock(g);
  g.window = g;
  g.location = { origin: 'https://appassets.local' };
  const store = {}; g.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  const S = { log: [], packetsOut: [], kills: 0, drops: 0, calls: {} };
  const user = opts.user || 'tester';

  // ---------------------------------------------------------------- mundo
  const MAPS = opts.maps || {
    battleon: { cells: { Enter: [], r2: [] }, mons: [] },
    slime: { cells: { Enter: [], r1: [] }, mons: [{ name: 'Slime', cell: 'r1', n: 3, hp: 600, drops: { 'Slime Drop': 0.6 }, temp: false }, { name: 'Boss Slime', cell: 'r2', n: 1, hp: 1500, drops: { 'Boss Token': 1 }, temp: false }] },
    yulgar: { cells: { Enter: [], Spawn: [] }, mons: [] }
  };
  let itemId = 5000, charItemId = 1000;
  const W = {
    myAvatar: {
      uid: 1, items: [], tempitems: [], houseitems: [], target: null, iBankCount: 0, factions: [],
      objData: { strUsername: user, intGold: 1000, intMP: 100, intExp: 0, intExpToLevel: 1000, iBagSlots: 60, iBankSlots: 100, iUpgDays: 30, iRank: 10, guild: { Name: 'G' }, intAccessLevel: 1 },
      dataLeaf: { intHP: 5000, intHPMax: 5000, intMPMax: 100, intLevel: 100, intState: 1, afk: false, sta: { $tha: 0 }, auras: [], strFrame: 'Enter' },
      pMC: { x: 100, y: 100, pname: { ti: { text: user }, tg: { text: '' } } }, isMyAvatar: true
    },
    strMapName: '', curRoom: 1, strFrame: 'Enter', strPad: 'Spawn', mapLoadInProgress: false, areaUsers: [user.toLowerCase()],
    uoTree: {}, monsters: [], questTree: {}, shopinfo: { items: [] }, bankinfo: { items: [] }, WALKSPEED: 8, SCALE: 1, visible: true,
    actions: { active: [0, 1, 2, 3, 4, 5].map(i => ({ ts: 0, cd: i === 0 ? 0 : 3000, mp: i === 0 ? 0 : 10, auto: i === 0, isOK: true, nam: 's' + i, range: 300 })) },
    lock: {}, GCDTS: 0, GCD: 0, autoActionTimer: { running: false }, map: { currentScene: { labels: [] }, children: { Left: 1, Spawn: 1, Center: 1 } }
  };
  ['loadShop', 'loadEnhShop', 'loadHairShop', 'equipItem', 'unequipItem', 'buyItem', 'sellItem', 'getMapItem', 'tryQuestComplete', 'acceptQuest', 'doIA', 'rest', 'who', 'tfer'].forEach(k => { W.lock[k] = { ts: 0, cd: 0 }; });
  const G = { world: W, sfc: { isConnected: true, myUserName: user.toLowerCase() }, mcConnDetail: { stage: null, txtDetail: { text: '' } }, litePreference: { data: { dOptions: {} } }, userPreference: { data: {} }, ui: { mcPopup: { currentLabel: '' }, mcFPS: { visible: false } }, stage: { frameRate: 30 }, serialCmd: { servers: [{ sName: 'Twilly', sIP: '1.2.3.4', iPort: 5588, iChat: 2, bOnline: 1, sLang: 'en', iCount: 10, bUpg: 0, iMax: 500, iLevel: 0 }] }, mcLogin: { warning: { visible: false } } };
  const lockCd = k => { if (W.lock[k]) { W.lock[k].ts = T.now; W.lock[k].cd = 300; } };

  // ---------------------------------------------------------------- utilidades de caminho
  function walk(path) {
    const parts = String(path).split('.'); let o = G;
    for (const p of parts) { if (o === null || o === undefined) return undefined; o = typeof o === 'function' ? undefined : o[p]; }
    return o;
  }
  function parent(path) { const parts = String(path).split('.'); const last = parts.pop(); let o = G; for (const p of parts) { if (o == null) return [null, last]; o = o[p]; } return [o, last]; }
  const ret = v => (v === undefined || v === null ? null : (typeof v === 'object' || typeof v === 'function') ? '@' + Object.prototype.toString.call(v) : v);

  // ---------------------------------------------------------------- pacotes
  function toClient(o) { g.onPacket && g.onPacket('<<', JSON.stringify({ t: 'xt', b: { r: -1, o } }) + '\u0000'); }
  function toClientStr(parts) { g.onPacket && g.onPacket('<<', '%xt%' + parts.join('%') + '%\u0000'); }
  function fromClient(p) { S.packetsOut.push(p); g.onPacket && g.onPacket('>>', p + '\u0000'); }

  // ---------------------------------------------------------------- inventário
  const ITEMS = opts.items || {};
  function itemDef(name) { return ITEMS[name] || (ITEMS[name] = { ItemID: itemId++, sName: name, sType: 'Item', iStk: 1000 }); }
  function addItem(name, qty, temp) {
    const d = itemDef(name), list = temp ? W.myAvatar.tempitems : W.myAvatar.items;
    let it = list.find(x => x.ItemID === d.ItemID);
    if (it) it.iQty = Math.min(d.iStk, it.iQty + qty);
    else { it = { ItemID: d.ItemID, CharItemID: charItemId++, sName: name, iQty: qty, iStk: d.iStk, sType: d.sType, bEquip: 0, bUpg: 0, bCoins: 0, bTemp: temp ? 1 : 0 }; list.push(it); }
    return it;
  }
  function removeItem(name, qty) {
    for (const list of [W.myAvatar.items, W.myAvatar.tempitems]) {
      const it = list.find(x => x.sName === name); if (!it) continue;
      it.iQty -= qty; if (it.iQty <= 0) list.splice(list.indexOf(it), 1); return true;
    }
    return false;
  }
  const qtyOf = name => [...W.myAvatar.items, ...W.myAvatar.tempitems].filter(x => x.sName === name).reduce((s, x) => s + x.iQty, 0);

  // ---------------------------------------------------------------- mapa / monstros
  function spawnMonsters(mapName) {
    W.monsters = []; const def = MAPS[mapName] || { mons: [], cells: { Enter: [] } }; let id = 1;
    def.mons.forEach(m => { for (let i = 0; i < m.n; i++) { const mid = id++; W.monsters.push({ spawn: m, objData: { strMonName: m.name, MonID: 100 + mid, MonMapID: mid, strFrame: m.cell, sRace: 'x' }, dataLeaf: { intHP: m.hp, intHPMax: m.hp, intState: 1, strFrame: m.cell, MonMapID: mid }, pMC: { x: 50 } }); } });
  }
  function joinMap(full, cell, pad) {
    const base = String(full).split('-')[0].toLowerCase();
    W.mapLoadInProgress = true; G.mcConnDetail.stage = {}; G.mcConnDetail.txtDetail.text = 'loading map';
    const delay = opts.loadMs || 1500;
    g.setTimeout(() => {
      if (opts.hangOnMap === base && !S.hungOnce) { S.hungOnce = true; return; } // simula "loading map" eterno 1x
      W.strMapName = base; W.curRoom = 1000 + Math.floor(T.now / 1000) % 9000; W.strFrame = cell || 'Enter'; W.strPad = pad || 'Spawn'; W.myAvatar.dataLeaf.strFrame = W.strFrame;
      spawnMonsters(base); W.myAvatar.target = null; W.mapLoadInProgress = false; G.mcConnDetail.stage = null;
      toClient({ cmd: 'moveToArea', strMapName: base, strMapFileName: base + '.swf', areaId: W.curRoom });
    }, delay);
  }
  function moveToCell(cell, pad) {
    lockCd('tfer'); W.strFrame = cell; W.strPad = pad || 'Spawn'; W.myAvatar.dataLeaf.strFrame = cell;
    fromClient('%xt%zm%moveToCell%' + W.curRoom + '%' + cell + '%' + W.strPad + '%');
  }

  // ---------------------------------------------------------------- combate
  function hasTarget() { return W.myAvatar.target && W.myAvatar.target.dataLeaf.intHP > 0; }
  function killMon(m) {
    m.dataLeaf.intHP = 0; m.dataLeaf.intState = 0; S.kills++;
    toClient({ cmd: 'ct', p: {}, m: { [m.objData.MonMapID]: { intHP: 0, intState: 0 } } });
    toClient({ cmd: 'addGoldExp', typ: 'm', id: m.objData.MonMapID });
    for (const [name, chance] of Object.entries(m.spawn.drops || {})) {
      if (Math.random() > chance) continue;
      const d = itemDef(name); S.drops++;
      if (m.spawn.temp) { const it = addItem(name, 1, true); toClient({ cmd: 'addItems', items: { [d.ItemID]: { iQtyNow: it.iQty } } }); }
      else toClient({ cmd: 'dropItem', items: { [d.ItemID]: { ItemID: d.ItemID, sName: name, iQty: 1, bCoins: 0, bTemp: 0, bUpg: 0 } } });
    }
    if (W.myAvatar.target === m && G.litePreference.data.bUntargetDead) W.myAvatar.target = null;
    W.myAvatar.dataLeaf.intState = 1;
    g.setTimeout(() => { m.dataLeaf.intHP = m.dataLeaf.intHPMax; m.dataLeaf.intState = 1; }, 4000);
  }
  function doSkill(i) {
    const a = W.actions.active[i]; if (!a) return 'noact';
    if (!hasTarget()) return 'notarget';
    if (T.now - a.ts < a.cd) return 'cd';
    a.ts = T.now; W.myAvatar.dataLeaf.intState = 2; W.GCDTS = T.now; W.GCD = 500;
    const t = W.myAvatar.target; t.dataLeaf.intHP = Math.max(0, t.dataLeaf.intHP - (i === 0 ? 150 : 400));
    if (t.dataLeaf.intHP === 0) killMon(t);
    return 'ok';
  }

  // ---------------------------------------------------------------- servidor: pacotes do cliente
  function serverRecv(pkt) {
    const q = pkt.split('%'); const cmd = q[3];
    if (cmd === 'cmd' && q[5] === 'tfer') { lockCd('tfer'); joinMap(q[7], q[8], q[9]); }
    else if (cmd === 'getDrop') {
      const id = +q[5]; const name = Object.keys(ITEMS).find(n => ITEMS[n].ItemID === id); if (!name) return;
      const it = addItem(name, 1, false);
      toClient({ cmd: 'getDrop', bSuccess: 1, ItemID: id, iQty: 1, iQtyNow: it.iQty, bBank: false });
      toClient({ cmd: 'addItems', items: { [id]: { iQtyNow: it.iQty } } });
    } else if (cmd === 'restRequest') { W.myAvatar.dataLeaf.intHP = W.myAvatar.dataLeaf.intHPMax; W.myAvatar.objData.intMP = 100; if (W.myAvatar.dataLeaf.intState === 2 && !hasTarget()) W.myAvatar.dataLeaf.intState = 1; }
    else if (cmd === 'loadBank') toClient({ cmd: 'loadBank' });
    else if (cmd === 'afk') W.myAvatar.dataLeaf.afk = q[5] === 'true';
  }

  // ---------------------------------------------------------------- quests
  const QUESTS = opts.quests || {}; const accepted = new Set();
  function questNode(id) {
    const d = QUESTS[id] || { name: 'Quest ' + id, need: {}, reward: {} };
    return { sName: d.name, status: '', iSlot: -1, iValue: 0, oItems: d.need, bUpg: 0, iLvl: 1, iClass: 0, iReqCP: 0, FactionID: 1, iReqRep: 0, sField: '', iIndex: -1 };
  }
  function canComplete(id) { const d = QUESTS[id]; if (!d) return true; return Object.entries(d.need).every(([n, q]) => qtyOf(n) >= q); }
  function refreshQuest(id) { const n = W.questTree[id]; if (n) n.status = accepted.has(id) && canComplete(id) ? 'c' : (accepted.has(id) ? 'p' : ''); }

  // ---------------------------------------------------------------- chamadas do jogo (aqw.call)
  const FN = {
    'world.moveToCell': a => { moveToCell(a[0], a[1]); },
    'world.rest': () => { lockCd('rest'); W.myAvatar.dataLeaf.intHP = W.myAvatar.dataLeaf.intHPMax; },
    'world.cancelTarget': () => { W.myAvatar.target = null; },
    'world.cancelAutoAttack': () => { W.autoActionTimer.running = false; },
    'world.approachTarget': () => { },
    'world.reloadCurrentMap': () => { joinMap(W.strMapName, W.strFrame, W.strPad); },
    'world.setSpawnPoint': () => { },
    'world.showQuests': a => { String(a[0]).split(',').forEach(s => { const id = +s; if (!W.questTree[id]) W.questTree[id] = questNode(id); }); },
    'world.isQuestInProgress': a => accepted.has(+a[0]),
    'world.acceptQuest': a => { lockCd('acceptQuest'); const id = +a[0]; if (!W.questTree[id]) W.questTree[id] = questNode(id); accepted.add(id); refreshQuest(id); fromClient('%xt%zm%acceptQuest%' + W.curRoom + '%' + id + '%'); },
    'world.tryQuestComplete': a => {
      lockCd('tryQuestComplete'); const id = +a[0]; if (!accepted.has(id)) return;
      if (!canComplete(id)) { toClient({ cmd: 'ccqr', bSuccess: 0, QuestID: id }); return; }
      const d = QUESTS[id]; if (d) { Object.entries(d.need).forEach(([n, q]) => removeItem(n, q)); Object.entries(d.reward || {}).forEach(([n, q]) => { const it = addItem(n, q, false); toClient({ cmd: 'addItems', items: { [it.ItemID]: { iQtyNow: it.iQty } } }); }); }
      accepted.delete(id); refreshQuest(id); toClient({ cmd: 'ccqr', bSuccess: 1, QuestID: id });
    },
    'world.getMapItem': a => { lockCd('getMapItem'); const nm = (opts.mapItems || {})[a[0]]; if (nm) { const it = addItem(nm.name, 1, nm.temp !== false); toClient({ cmd: 'addItems', items: { [it.ItemID]: { iQtyNow: it.iQty } } }); } },
    'world.myAvatar.pMC.artLoaded': () => true,
    'world.myAvatar.pMC.walkTo': a => { W.myAvatar.pMC.x = a[0]; W.myAvatar.pMC.y = a[1]; },
    'world.moveRequest': () => { },
    'world.map.getChildByName': a => (W.map.children[a[0]] ? {} : null),
    'world.aggroAllMon': () => { },
    'world.sendLoadShopRequest': a => { lockCd('loadShop'); W.shopinfo = { ShopID: a[0], sName: 'Shop' + a[0], items: (opts.shops || {})[a[0]] || [] }; toClient({ cmd: 'loadShop' }); },
    'world.sendBuyItemRequest': a => { lockCd('buyItem'); const it = a[0]; const added = addItem(it.sName, 1, false); toClient({ cmd: 'buyItem', bitSuccess: 1, CharItemID: added.CharItemID }); },
    'world.sendEquipItemRequest': a => { lockCd('equipItem'); const it = W.myAvatar.items.find(x => x.ItemID === a[0].ItemID); if (it) it.bEquip = 1; },
    'world.sendBankFromInvRequest': a => { const it = W.myAvatar.items.find(x => x.ItemID === a[0].ItemID); if (it) { W.myAvatar.items.splice(W.myAvatar.items.indexOf(it), 1); W.bankinfo.items.push(it); W.myAvatar.iBankCount++; } },
    'world.sendBankToInvRequest': a => { const it = W.bankinfo.items.find(x => x.ItemID === a[0].ItemID); if (it) { W.bankinfo.items.splice(W.bankinfo.items.indexOf(it), 1); W.myAvatar.items.push(it); W.myAvatar.iBankCount--; } },
    'world.toggleBank': () => { },
    'sfc.sendString': a => { fromClient(a[0]); serverRecv(a[0]); },
    'login': () => { G.mcLogin.logged = true; },
    'logout': () => { G.sfc.isConnected = false; }, 'gotoAndPlay': () => { },
    'connectTo': () => { G.sfc.isConnected = true; joinMap('battleon', 'Enter', 'Spawn'); },
    'logoutNow': () => { }
  };

  g.aqw = {
    ok: () => true,
    get: p => { const v = walk(p); if (v === undefined) throw new Error('!sem caminho ' + p); return ret(v); },
    set: (p, v) => { const [o, k] = parent(p); if (o == null) throw new Error('!' + p); o[k] = v; return true; },
    keys: p => { const v = walk(p); return v && typeof v === 'object' ? Object.keys(v) : []; },
    call: (p, a) => { S.calls[p] = (S.calls[p] || 0) + 1; const f = FN[p]; if (!f) { if (opts.strict) throw new Error('!chamada sem simulação ' + p); return null; } return ret(f(a || [])); },
    target: i => { const m = W.monsters[i]; if (m) W.myAvatar.target = m; return true; },
    cast: k => { const idx = +k - 48; W.autoActionTimer.running = false; return doSkill(idx); }
  };
  // 'get' do port trata exceção como null; aqw.get em caminho inexistente lança, igual ao jogo ('!erro')
  const origGet = g.aqw.get; g.aqw.get = p => { const v = walk(p); return v === undefined ? null : ret(v); };
  void origGet;

  // entra no mapa inicial
  W.strMapName = 'battleon'; W.mapLoadInProgress = false; spawnMonsters('battleon'); W.myAvatar.items.length = 0;
  addItem('Dummy', 1, false);
  const sim = { S, W, G, T, addItem, qtyOf, QUESTS, ITEMS, accepted, joinMap, toClient, itemDef };
  g.__sim = sim; return sim;
}

// avança o relógio virtual até a promise resolver / estourar o tempo virtual / não ter mais eventos
async function run(promise, o) {
  o = o || {}; const maxMs = (o.maxSeconds || 3600) * 1000; const t0 = T.now; let done = false, res, err;
  promise.then(v => { done = true; res = v; }, e => { done = true; err = e; });
  let idle = 0;
  while (!done) {
    await new Promise(r => setImmediate(r));
    if (done) break;
    if (!T.q.length) { if (++idle > 3) return { status: 'deadlock', virtualSeconds: (T.now - t0) / 1000 }; continue; }
    idle = 0;
    T.q.sort((a, b) => a.t - b.t || a.seq - b.seq);
    const ev = T.q.shift(); if (ev.t > T.now) T.now = ev.t;
    if (T.now - t0 > maxMs) return { status: 'timeout', virtualSeconds: (T.now - t0) / 1000 };
    if (++T.steps > (o.maxSteps || 4e6)) return { status: 'steps', virtualSeconds: (T.now - t0) / 1000 };
    try { ev.fn(); } catch (e) { /* erros de timers não derrubam o teste */ }
  }
  return err ? { status: 'error', error: err, virtualSeconds: (T.now - t0) / 1000 } : { status: 'done', value: res, virtualSeconds: (T.now - t0) / 1000 };
}

module.exports = { install, run, T };
