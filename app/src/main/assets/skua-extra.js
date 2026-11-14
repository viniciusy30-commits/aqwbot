/* skua-extra.js — completa a API do Skua (membros que o núcleo ainda não tinha).
 * Caminhos do jogo retirados do código original (ObjectBinding/ModuleBinding do Skua.Core).
 * Itens sem equivalente neste cliente existem para o script não quebrar e avisam no log. */
(function () {
  'use strict';
  var W = window, Bot = W.Bot, I = W.SkuaInternal;
  if (!Bot || !I) return;
  var get = Bot.Get, set = Bot.Set, call = Bot.Call, keys = Bot.Keys, sleep = Bot.Sleep, lc = I.lc, check = I.check, opt = I.opt;
  var O = Bot.Options, P = Bot.Player, M = Bot.Map, Q = Bot.Quests, D = Bot.Drops, Wt = Bot.Wait, Inv = Bot.Inventory, Mo = Bot.Monsters;

  function addGet(o, n, fn) { if (!(n in o)) Object.defineProperty(o, n, { get: fn, enumerable: true, configurable: true }); }
  function addProp(o, n, path, conv) { if (!(n in o)) Object.defineProperty(o, n, { get: function () { var v = get(path); return conv ? conv(v) : v; }, set: function (v) { set(path, v); }, enumerable: true, configurable: true }); }
  function addFn(o, n, fn) { if (!(n in o)) o[n] = fn; }
  function dbg(m) { I.Logs.add('debug', m); }
  function nosup(n) { return function () { dbg(n + ': sem efeito neste cliente'); return null; }; }
  function arr(a) { return [].concat.apply([], [].slice.call(a)); }
  function sec(t, d) { return Math.max(1, Math.round((t === undefined || t === null ? d : t))); }
  function tryWait(fn, timeout, ms) { return Wt.ForTrue(fn, sec(timeout, 10), ms || 500); }

  // ---------- Player ----------
  addProp(P, 'ID', 'world.myAvatar.uid');
  addProp(P, 'XP', 'world.myAvatar.objData.intExp');
  addProp(P, 'RequiredXP', 'world.myAvatar.objData.intExpToLevel');
  addProp(P, 'Rank', 'world.myAvatar.objData.iRank');
  addProp(P, 'AccessLevel', 'world.myAvatar.objData.intAccessLevel');
  addProp(P, 'WalkSpeed', 'world.WALKSPEED');
  addProp(P, 'Scale', 'world.SCALE');
  addProp(P, 'ServerIP', 'serverIP', function (v) { return v || ''; });
  addProp(P, 'Password', 'loginInfo.strPassword', function (v) { return v || ''; });
  addGet(P, 'LoggedIn', function () { return Bot.Ready && get('world.myAvatar') !== null; });
  addGet(P, 'Kicked', function () { return false; });
  addGet(P, 'Skills', function () { var o = [], n = get('world.actions.active.length') || 0; for (var i = 0; i < n; i++) o.push(Bot.Snap('world.actions.active.' + i)); return o; });
  addGet(P, 'Stats', function () { return Bot.Snap('world.myAvatar.dataLeaf.sta'); });
  addGet(P, 'Target', function () { return get('world.myAvatar.target') === null ? null : Bot.Snap('world.myAvatar.target.objData'); });
  addGet(P, 'CurrentClass', function () { return Inv.Items.filter(function (i) { return i.Equipped && i.Category === 'Class'; })[0] || null; });
  addGet(P, 'CurrentClassRank', function () {
    var c = P.CurrentClass; if (!c) return 0;
    var cp = call('world.myAvatar.getCPByID', [c.ID]);
    var r = call('world.getRankFromPoints', [cp || 0]);
    return typeof r === 'number' ? Math.min(10, r) : Math.min(10, Math.floor(Math.sqrt((cp || 0) / 100)));
  });
  addFn(P, 'SetSpawnPoint', function () { return call('world.setSpawnPoint'); });
  addFn(P, 'CancelTarget', function () { return call('world.cancelTarget'); });
  addFn(P, 'Equip', function (q) { return Inv.EquipItem(q); });
  addFn(P, 'EquipItem', function (q) { return Inv.EquipItem(q); });
  addFn(P, 'IsMemberOf', function () { return P.IsMember; });
  addFn(P, 'FullyRested', function () { return P.Health >= P.MaxHealth && P.Mana >= P.MaxMana; });
  addFn(P, 'Relogin', nosup('Player.Relogin'));
  addGet(P, 'Position', function () { return { X: P.X, Y: P.Y, x: P.X, y: P.Y }; });

  // ---------- Map ----------
  addGet(M, 'LastMap', function () { return M._last || ''; });
  addGet(M, 'FilePath', function () { return get('world.map.currentScene.sFile') || get('world.strMapFile') || ''; });
  addGet(M, 'FileName', function () { var p = M.FilePath; return p.split('/').pop(); });
  addGet(M, 'FullName', function () { return M.Name + (M.RoomID ? '-' + M.RoomID : ''); });
  addGet(M, 'Players', function () { return keys('world.uoTree').map(function (k) { var o = Bot.Snap('world.uoTree.' + k, ['strUsername', 'strFrame', 'strPad', 'intLevel', 'intHP', 'intHPMax', 'afk']); o.Name = o.strUsername || k; o.Cell = o.strFrame; o.Pad = o.strPad; o.Level = o.intLevel; return o; }); });
  addGet(M, 'CellPlayers', function () { return M.Players.filter(function (p) { return p.Cell === P.Cell; }); });
  addFn(M, 'PlayerExists', function (n) { return M.Players.some(function (p) { return lc(p.Name) === lc(n); }); });
  addFn(M, 'TryGetPlayer', function (n) { return M.Players.filter(function (p) { return lc(p.Name) === lc(n); })[0] || null; });
  addFn(M, 'JoinIgnore', function (m, c, p) { return M.Join(m, c, p, true); });
  addFn(M, 'FindMapItems', function () { return []; });
  addFn(M, 'GetMapItem', M.GetMapItem);
  addFn(M, 'CellExists', function (c) { return M.Cells.some(function (x) { return lc(x) === lc(c); }); });

  // ---------- Monsters ----------
  function mcells(list) { var s = {}; list.forEach(function (m) { if (m.Cell) s[m.Cell] = 1; }); return Object.keys(s); }
  addGet(Mo, 'MapMonstersDataLeaf', function () { var o = [], n = get('world.monsters.length') || 0; for (var i = 0; i < n; i++) o.push(Bot.Snap('world.monsters.' + i + '.dataLeaf')); return o; });
  addGet(Mo, 'MapMonstersWithCurrentData', function () { return Mo.MapMonsters; });
  addFn(Mo, 'MonsterHP', function (q) { return Mo.GetHealth(q); });
  addFn(Mo, 'GetMonsterCells', function (q) { return mcells(Mo.Find(q)); });
  addFn(Mo, 'GetLivingMonsterCells', function (q) { return mcells(Mo.Find(q).filter(function (m) { return m.HP > 0; })); });
  addFn(Mo, 'GetLivingMonsterDataLeafCells', function (q) { return Mo.GetLivingMonsterCells(q); });
  addFn(Mo, 'GetMonstersByCell', function (c) { return Mo.MapMonsters.filter(function (m) { return m.Cell === c; }); });
  addFn(Mo, 'TryGetMonster', function (q) { return Mo.Find(q)[0] || null; });
  addFn(Mo, 'GetMonster', function (q) { return Mo.Find(q)[0] || null; });

  // ---------- Combat ----------
  var C = Bot.Combat;
  addFn(C, 'StopAttacking', function () { call('world.cancelAutoAttack'); return call('world.cancelTarget'); });
  addFn(C, 'ApproachTarget', function () { return call('world.approachTarget'); });
  addFn(C, 'UntargetSelf', function () { return call('world.cancelTarget'); });
  addGet(C, 'StopAttackingNow', function () { return null; });

  // ---------- Hunt ----------
  var H = Bot.Hunt;
  addFn(H, 'ForItems', async function (names, items, qty, tempItem, rejectElse) {
    names = [].concat(names); items = [].concat(items);
    for (var i = 0; i < items.length; i++) { if (rejectElse) D.RejectExcept(items); await H.ForItem(names.join('|'), items[i], qty, tempItem); }
  });
  addFn(H, 'WithPriority', function () { return H; });

  // ---------- Auto ----------
  var A = Bot.Auto;
  addGet(A, 'IsRunning', function () { return !!A.on; });
  addFn(A, 'StartAutoAttack', function (cls, mode) { return A.Attack(cls, mode); });
  addFn(A, 'StartAutoHunt', function (cls, mode, m) { return A.Hunt(cls, mode, m || ''); });
  addFn(A, 'StopAsync', async function () { A.Stop(); });

  // ---------- Stats ----------
  var S = Bot.Stats;
  if (!('QuestsAccepted' in S)) S.QuestsAccepted = 0;
  if (!('Relogins' in S)) S.Relogins = 0;

  // ---------- Events ----------
  addFn(Bot.Events, 'ClearHandlers', function () { Bot.Events.Clear(); });

  // ---------- Reputation / Factions ----------
  function facList() { var o = [], n = get('world.myAvatar.factions.length') || 0; for (var i = 0; i < n; i++) { var p = 'world.myAvatar.factions.' + i; o.push({ ID: get(p + '.FactionID'), Name: get(p + '.sName'), Rank: get(p + '.iRank') || 1, TotalRep: get(p + '.iRep') || 0, SpillRep: get(p + '.iSpillRep') || 0, RepToRank: get(p + '.iRepToRank') || 0 }); } return o; }
  var R = {
    get FactionList() { return facList(); },
    GetRank: function (f) { var x = facList().filter(function (y) { return typeof f === 'number' ? y.ID === f : lc(y.Name) === lc(f); })[0]; return x ? x.Rank : 1; },
    HasRank: function (f, rank) { return R.GetRank(f) >= rank; },
    GetFaction: function (f) { return facList().filter(function (y) { return typeof f === 'number' ? y.ID === f : lc(y.Name) === lc(f); })[0] || null; }
  };
  Bot.Reputation = R; Bot.Factions = R;

  // ---------- Quests: modelo completo (Quest do Skua: Requirements, AcceptRequirements, Rewards, ...) ----------
  function itemBase(path, key, qtyHint) {
    var g = function (k) { return get(path + '.' + k); };
    var id = g('ItemID'); if (id === null || id === undefined) id = parseInt(key, 10);
    var q = g('iQty'); if (q === null || q === undefined) q = g('iQtyNow'); if (q === null || q === undefined) q = qtyHint;
    return { ID: id, Name: g('sName') || '', Quantity: q === null || q === undefined ? 1 : q, Category: g('sType') || '', Temp: !!g('bTemp'), Coins: !!g('bCoins'), Upgrade: !!g('bUpg'), MaxStack: g('iStk'), Description: g('sDesc') || '' };
  }
  function itemDict(path, depth) {
    var out = [], ks = keys(path);
    ks.forEach(function (k) {
      var p2 = path + '.' + k;
      if (get(p2 + '.ItemID') !== null || (depth === 0 && get(p2 + '.sName') !== null)) out.push(itemBase(p2, k));
      else if (depth > 0) out = out.concat(itemDict(p2, depth - 1));
    });
    return out;
  }
  function questModel(k) {
    var p = 'world.questTree.' + k, g = function (n) { return get(p + '.' + n); }, o = { ID: parseInt(k, 10) }, cache = {};
    function L(name, fn) { Object.defineProperty(o, name, { enumerable: true, configurable: true, get: fn }); }
    L('Slot', function () { var v = g('iSlot'); return v === null ? -1 : v; });
    L('Value', function () { return g('iValue') || 0; }); L('Name', function () { return g('sName'); });
    L('Description', function () { return g('sDesc') || ''; }); L('EndText', function () { return g('sEndText') || ''; });
    L('Once', function () { return !!g('bOnce') && g('bOnce') !== '0'; }); L('Field', function () { return g('sField') || ''; });
    L('Index', function () { var v = g('iIndex'); return v === null ? -1 : v; }); L('Upgrade', function () { return !!g('bUpg') && g('bUpg') !== '0'; });
    L('Level', function () { return g('iLvl') || 0; }); L('RequiredClassID', function () { return g('iClass') || 0; });
    L('RequiredClassPoints', function () { return g('iReqCP') || 0; }); L('RequiredFactionId', function () { return g('FactionID') || 0; });
    L('RequiredFactionRep', function () { return g('iReqRep') || 0; }); L('Gold', function () { return g('iGold') || 0; }); L('XP', function () { return g('iExp') || 0; });
    L('Status', function () { return g('status'); }); L('Active', function () { var st = g('status'); return st !== null && st !== undefined; });
    L('AcceptRequirements', function () { return cache.a || (cache.a = itemDict(p + '.oReqd', 0)); });
    L('Requirements', function () {
      if (cache.r) return cache.r;
      var r = itemDict(p + '.oItems', 0), n = get(p + '.turnin.length') || 0;
      for (var i = 0; i < n; i++) { var id = get(p + '.turnin.' + i + '.ItemID'), q = get(p + '.turnin.' + i + '.iQty'); r.forEach(function (x) { if (x.ID === id && q !== null) x.Quantity = q; }); }
      return (cache.r = r);
    });
    L('Rewards', function () { return cache.w || (cache.w = itemDict(p + '.oRewards', 2)); });
    L('SimpleRewards', function () { var n = get(p + '.reward.length') || 0, l = []; for (var i = 0; i < n; i++) l.push({ ID: get(p + '.reward.' + i + '.ItemID'), Quantity: get(p + '.reward.' + i + '.iQty') || 1, Type: get(p + '.reward.' + i + '.sType') }); return l; });
    return o;
  }
  Object.defineProperty(Q, 'Tree', { get: function () { return keys('world.questTree').map(questModel); }, enumerable: true, configurable: true });

  // ---------- Quests ----------
  var regIds = [], regTimer = null, regBusy = false;
  Object.defineProperty(Q, 'RegisterCompleteInterval', { value: 2000, writable: true, enumerable: true, configurable: true });
  function qfind(id) { return Q.Tree.filter(function (q) { return q.ID === id; })[0] || null; }
  addGet(Q, 'Active', function () { return Q.Tree.filter(function (q) { return Q.IsInProgress(q.ID); }); });
  addGet(Q, 'Completed', function () { return Q.Tree.filter(function (q) { return q.Status === 'c'; }); });
  addGet(Q, 'Cached', function () { return []; });
  addGet(Q, 'Registered', function () { return regIds.slice(); });
  addFn(Q, 'TryGetQuest', function (id) { return qfind(id); });
  addFn(Q, 'CanComplete', function (id) { return Q.Completed.some(function (q) { return q.ID === id; }); });
  addFn(Q, 'CanCompleteFullCheck', function (id) {
    if (Q.CanComplete(id)) return true;
    var q = qfind(id); if (!q) return false;
    var reqs = []; var o = get('world.questTree.' + id + '.oItems');
    if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { reqs.push({ ID: +k, Quantity: (o[k] && o[k].iQty) || 1 }); });
    if (!reqs.length) return true;
    return reqs.every(function (r) { return Inv.Contains(r.ID, r.Quantity) || Bot.TempInv.Contains(r.ID, r.Quantity); });
  });
  addFn(Q, 'IsDailyComplete', async function (id) {
    await Q.EnsureLoad(id); var f = get('world.questTree.' + id + '.sField'), ix = get('world.questTree.' + id + '.iIndex');
    var v = call('world.getAchievement', [f, ix]); return typeof v === 'number' && v > 0;
  });
  addFn(Q, 'IsUnlocked', async function (id) {
    await Q.EnsureLoad(id); var q = qfind(id); if (!q || q.Slot === null || q.Slot < 0) return true;
    return (call('world.getQuestValue', [q.Slot]) || 0) >= (q.Value || 0) - 1;
  });
  addFn(Q, 'HasBeenCompleted', async function (id) {
    await Q.EnsureLoad(id); var q = qfind(id); if (!q || q.Slot === null || q.Slot < 0) return true;
    return (call('world.getQuestValue', [q.Slot]) || 0) >= (q.Value || 0);
  });
  addFn(Q, 'IsAvailable', async function (id) {
    await Q.EnsureLoad(id); var q = qfind(id); if (!q) return false;
    var g = function (k) { return get('world.questTree.' + id + '.' + k); };
    if (await Q.IsDailyComplete(id)) return false;
    if (!(await Q.IsUnlocked(id))) return false;
    if (g('bUpg') && !P.IsMember) return false;
    if ((P.Level || 0) < (g('iLvl') || 0)) return false;
    if ((g('iClass') || 0) > 0 && (call('world.myAvatar.getCPByID', [g('iClass')]) || 0) < (g('iReqCP') || 0)) return false;
    if ((g('FactionID') || 0) > 1 && (call('world.myAvatar.getRep', [g('FactionID')]) || 0) < (g('iReqRep') || 0)) return false;
    return true;
  });
  addFn(Q, 'UpdateQuest', async function (id) { await Q.EnsureLoad(id); var q = qfind(id); if (!q) return false; Bot.Send.Packet('%xt%zm%updateQuest%' + M.RoomID + '%' + q.Value + '%' + q.Slot + '%'); return true; });
  addFn(Q, 'LoadCachedQuests', nosup('Quests.LoadCachedQuests'));
  addFn(Q, 'GetCachedQuests', function () { return []; });
  async function regTick() {
    if (regBusy || !P.Playing) return; regBusy = true;
    try {
      for (var i = 0; i < regIds.length; i++) {
        var id = regIds[i];
        if (!Q.IsInProgress(id)) await Q.Accept(id);
        await sleep(O.ActionDelay);
        if (Q.CanComplete(id)) { await Q.Complete(id); S.QuestsAccepted++; }
      }
    } catch (e) { } finally { regBusy = false; }
  }
  addFn(Q, 'RegisterQuests', function () {
    arr(arguments).forEach(function (id) { if (regIds.indexOf(id) < 0) regIds.push(id); });
    if (!regTimer && regIds.length) regTimer = setInterval(regTick, Math.max(500, Q.RegisterCompleteInterval));
  });
  addFn(Q, 'UnregisterQuests', function () { var r = arr(arguments); regIds = regIds.filter(function (x) { return r.indexOf(x) < 0; }); if (!regIds.length && regTimer) { clearInterval(regTimer); regTimer = null; } });
  addFn(Q, 'UnregisterAllQuests', function () { regIds = []; if (regTimer) { clearInterval(regTimer); regTimer = null; } });

  // ---------- Drops ----------
  var dropTimer = null, rejectElse = false;
  Object.defineProperty(D, 'Interval', { value: 1000, writable: true, enumerable: true, configurable: true });
  Object.defineProperty(D, 'RejectElse', { get: function () { return rejectElse; }, set: function (v) { rejectElse = !!v; }, enumerable: true, configurable: true });
  addGet(D, 'Enabled', function () { return !!dropTimer; });
  addGet(D, 'CurrentDropInfos', function () { return D.Current.slice(); });
  addGet(D, 'CurrentDrops', function () { return D.Current.map(function (d) { return d.Name.trim(); }); });
  addGet(D, 'ToPickup', function () { return D.whitelist.slice(); });
  addGet(D, 'ToPickupIDs', function () { return (D._ids || []).slice(); });
  addFn(D, 'Add', function () { arr(arguments).forEach(function (x) { if (typeof x === 'number') { (D._ids = D._ids || []).push(x); } else if (D.whitelist.indexOf(lc(x)) < 0) D.whitelist.push(lc(x)); }); });
  addFn(D, 'Exists', function (q) { return D.Current.some(function (d) { return typeof q === 'number' ? d.ID === q : lc(d.Name) === lc(q); }); });
  addFn(D, 'Remove', D.Remove);
  addFn(D, 'PickupACItems', async function () { var l = D.Current.filter(function (d) { return d.Coins; }); for (var i = 0; i < l.length; i++) { D.PickupId(l[i].ID); await sleep(200); } });
  addFn(D, 'PickupFast', function (q) { var d = D.Current.filter(function (x) { return typeof q === 'number' ? x.ID === q : lc(x.Name) === lc(q); })[0]; if (!d) return false; D.PickupId(d.ID); return true; });
  addFn(D, 'RejectAll', function () { D.Current = []; D.whitelist = []; Bot.Send.Packet('%xt%zm%getDrop%' + M.RoomID + '%0%'); D._rejectAll = true; });
  async function dropTick() {
    var l = D.Current.slice();
    for (var i = 0; i < l.length; i++) {
      var d = l[i], want = (D._ids || []).indexOf(d.ID) > -1 || D.whitelist.indexOf(lc(d.Name)) > -1;
      if (want) { D.PickupId(d.ID); await sleep(200); } else if (rejectElse) D.Remove(d.ID);
    }
  }
  addFn(D, 'Start', function () { if (!dropTimer) dropTimer = setInterval(dropTick, Math.max(300, D.Interval)); });
  addFn(D, 'Stop', function () { if (dropTimer) { clearInterval(dropTimer); dropTimer = null; } });
  addFn(D, 'StopAsync', async function () { D.Stop(); });

  // ---------- Wait ----------
  addFn(Wt, 'WAIT_SLEEP', 500);
  ['OverrideTimeout', 'PlayerActionTimeout', 'DropActionTimeout', 'GameActionTimeout', 'ItemActionTimeout', 'MapActionTimeout', 'MonsterActionTimeout', 'QuestActionTimeout'].forEach(function (n) { if (!(n in Wt)) Wt[n] = 0; });
  addFn(Wt, 'For', function (fn, value, t) { return Wt.ForTrue(async function () { return (await fn()) === value; }, sec(t, 10), 500); });
  addFn(Wt, 'ForAsync', Wt.For);
  addFn(Wt, 'ForTrueAsync', Wt.ForTrue);
  addFn(Wt, 'ForPlayerPosition', function (x, y, t) { return tryWait(function () { return Math.abs((P.X || 0) - x) < 5 && Math.abs((P.Y || 0) - y) < 5; }, t); });
  addFn(Wt, 'ForFullyRested', function (t) { return tryWait(function () { return P.FullyRested(); }, t === undefined || t < 0 ? 60 : t); });
  addFn(Wt, 'ForDrop', function (q, t) { return tryWait(function () { return D.Exists(q); }, t); });
  addFn(Wt, 'ForItemBuy', function (t) { return sleep(O.ActionDelay).then(function () { return true; }); });
  addFn(Wt, 'ForItemSell', function (t) { return sleep(O.ActionDelay).then(function () { return true; }); });
  addFn(Wt, 'ForBankToInventory', function (q, t) { return tryWait(function () { return Inv.Contains(q); }, t === undefined ? 14 : t); });
  addFn(Wt, 'ForBankToHouseInventory', function (q, t) { return tryWait(function () { return Bot.House.Contains(q); }, t === undefined ? 14 : t); });
  addFn(Wt, 'ForInventoryToBank', function (q, t) { return tryWait(function () { return Bot.Bank.Contains(q); }, t === undefined ? 14 : t); });
  addFn(Wt, 'ForHouseInventoryToBank', function (q, t) { return tryWait(function () { return Bot.Bank.Contains(q); }, t === undefined ? 14 : t); });
  addFn(Wt, 'ForBankLoad', function (t) { return tryWait(function () { return Bot.Bank.Loaded; }, t === undefined ? 20 : t); });
  addFn(Wt, 'ForSkillCooldown', function (i, t) { return tryWait(function () { return (get('world.actions.active.' + i + '.ts') || 0) <= 0 || Date.now() >= (get('world.actions.active.' + i + '.ts') || 0); }, t === undefined ? 50 : t, 100); });
  addFn(Wt, 'ForActionCooldown', function () { return sleep(Math.min(O.ActionDelay, 700)).then(function () { return true; }); });
  addFn(Wt, 'ForTrueSync', Wt.ForTrue);

  // ---------- Bank / House ----------
  var B = Bot.Bank;
  if (!('Loaded' in B)) { var bankForced = false; Object.defineProperty(B, 'Loaded', { get: function () { return bankForced || (get('world.bankinfo.items.length') || 0) > 0 || get('world.bankinfo.bLoaded') === true; }, set: function (v) { bankForced = !!v; }, enumerable: true, configurable: true }); }
  addFn(B, 'Load', async function () {
    if (B.Loaded && B.Items && B.Items.length) return true;
    var got = false, h = Bot.Events.On('BankLoaded', function () { got = true; });
    try {
      for (var t = 0; t < 3 && !got && !(B.Items && B.Items.length); t++) {
        Bot.Send.Packet('%xt%zm%loadBank%' + (Bot.Map.RoomID || 1) + '%All%');
        for (var w = 0; w < 16 && !got && !(B.Items && B.Items.length); w++) await sleep(250);
      }
    } finally { Bot.Events.Off('BankLoaded', h); }
    B.Loaded = true;
    try { if (get('ui.mcPopup.currentLabel') === '"Bank"') call('world.toggleBank'); } catch (e) {}
    return true;
  });
  addFn(B, 'EnsureToInventory', async function (q) { await B.Load(); for (var i = 0; i < 5; i++) { if (Inv.Contains(q)) return true; await B.ToInventory(q); await sleep(O.ActionDelay); } return Inv.Contains(q); });
  addFn(B, 'Swap', async function (invItem, bankItem) { await B.Load(); await B.ToInventory(bankItem); await Inv.ToBank(invItem); return true; });
  addFn(B, 'EnsureSwap', B.Swap);
  addFn(B, 'ToHouseInventory', nosup('Bank.ToHouseInventory'));
  var Hs = Bot.House;
  addFn(Hs, 'Contains', function (q, n) { return I.qty(Hs.Items, q) >= (n || 1); });
  addFn(Hs, 'GetQuantity', function (q) { return I.qty(Hs.Items, q); });
  addFn(Hs, 'GetItem', function (q) { return I.find(Hs.Items, q); });
  var T = Bot.TempInv;
  addFn(T, 'GetItem', function (q) { return I.find(T.Items, q); });
  addFn(Inv, 'GetItems', function () { return Inv.Items; });
  addFn(Inv, 'IsEquipped', function (q) { var it = Inv.GetItem(q); return !!(it && it.Equipped); });
  addFn(Inv, 'CheckSpaces', function (n) { return Inv.FreeSlots >= (n || 1); });

  // ---------- Shops ----------
  var Sh = Bot.Shops;
  addGet(Sh, 'IsLoaded', function () { return Sh.ID !== null && Sh.ID !== undefined; });
  addGet(Sh, 'LoadedCache', function () { return []; });
  addFn(Sh, 'LoadHairShop', function (id) { return call('world.sendLoadHairShopRequest', [id]); });
  addFn(Sh, 'LoadArmourCustomizer', function () { return call('openArmorCustomize'); });
  addFn(Sh, 'LoadAndBuyItem', async function (shopId, name, q) { await Sh.Load(shopId); return Sh.BuyItem(name, q); });

  // ---------- Skills ----------
  var K = Bot.Skills;
  addGet(K, 'SkillTimeout', function () { return K.timeout; });
  addGet(K, 'SkillInterval', function () { return K.timeout; });
  addGet(K, 'TimerRunning', function () { return !!K.active; });
  addGet(K, 'SkillUseMode', function () { return K.useMode; });
  addFn(K, 'CanUseSkill', function (i) { var s = Bot.Snap('world.actions.active.' + i, ['cd', 'mp', 'ts', 'isOK']); return s.isOK !== false && (P.Mana >= (s.mp || 0)); });
  addFn(K, 'LoadAdvanced', function (txt) { return K.StartAdvanced ? K.StartAdvanced(txt, K.timeout) : null; });
  addFn(K, 'SetProvider', nosup('Skills.SetProvider'));
  addFn(K, 'UseBaseProvider', nosup('Skills.UseBaseProvider'));
  addFn(K, 'BaseProvider', null);
  addFn(K, 'OverrideProvider', null);

  // ---------- Send ----------
  var Sd = Bot.Send;
  ['ClientEvent', 'ClientGuild', 'ClientModerator', 'ClientServer', 'ClientWarning', 'ClientWhisper', 'ClientZone'].forEach(function (n) {
    addFn(Sd, n, function (msg) { I.Logs.add('script', '[' + n.replace('Client', '') + '] ' + msg); });
  });
  addFn(Sd, 'ClientPacketSpam', Sd.PacketSpam);

  // ---------- Auras ----------
  var Au = Bot.Auras;
  addGet(Au, 'Auras', function () { return Au.Player; });
  addFn(Au, 'HasActiveAura', function (n, target) { return Au.HasAura(n, target); });
  addFn(Au, 'GetAura', function (n, target) { return (target ? Au.Target : Au.Player).filter(function (a) { return lc(a.nam) === lc(n); })[0] || null; });
  addFn(Au, 'TryGetAura', Au.GetAura);
  Au.Self = Au.Self || { get Auras() { return Au.Player; }, HasActiveAura: function (n) { return Au.HasAura(n, false); }, GetAura: function (n) { return Au.GetAura(n, false); } };
  Au.TargetAuras = Au.TargetAuras || { get Auras() { return Au.Target; }, HasActiveAura: function (n) { return Au.HasAura(n, true); }, GetAura: function (n) { return Au.GetAura(n, true); } };

  // ---------- Options extras ----------
  [['AttackWithoutTarget', false], ['AggroMonsters', false], ['AggroAllMonsters', false], ['DisableCollisions', false], ['Magnetise', false], ['RestPackets', false],
   ['SafeRelogin', false], ['AutoReloginAny', false], ['RetryRelogin', true], ['ReloginTries', 5], ['ReloginTryDelay', 800], ['LoginTimeout', 30000], ['LoadTimeout', 30000],
   ['MaximumTries', 10], ['HuntDelay', 1000], ['HuntBuffer', 1], ['HuntPriority', 0], ['ReloginServer', 'Twilly'], ['NameColor', 0xFFFFFF], ['GuildColor', 0xFFFFFF]].forEach(function (d) {
    if (!(d[0] in O)) opt(d[0], d[1], d[0] === 'NameColor' ? function (v) { set('world.myAvatar.pMC.pname.ti.textColor', v); } : d[0] === 'GuildColor' ? function (v) { set('world.myAvatar.pMC.pname.tg.textColor', v); } : null, d[0]);
  });
  addFn(O, 'ResetToDefault', function () { O.Reset(); });
  if (!('DisableDeathAds' in O)) Object.defineProperty(O, 'DisableDeathAds', { get: function () { return O.DisableDeathAd; }, set: function (v) { O.DisableDeathAd = v; }, enumerable: true });

  // ---------- Lite ----------
  var L = Bot.Lite = Bot.Lite || {};
  [['CharacterSelectScreen', 'bCharSelect'], ['CustomDropsUI', 'bCustomDrops'], ['Debugger', 'bDebugger'], ['DisableDamageStrobe', 'bDisDmgStrobe'], ['DisableMonsterAnimation', 'bDisMonAnim'],
   ['DisableSelfAnimation', 'bDisSelfMAnim'], ['DisableSkillAnimation', 'bDisSkillAnim'], ['DisableSkillAnimations', 'bDisSkillAnim'], ['DisableWeaponAnimation', 'bDisWepAnim'],
   ['FreezeMonsterPosition', 'bFreezeMons'], ['HidePlayers', 'bHidePlayers'], ['HideUI', 'bHideUI'], ['InvisibleMonsters', 'bHideMons'], ['ReacceptQuest', 'bReaccept'],
   ['ShowMonsterType', 'bMonsType'], ['SmoothBackground', 'bSmoothBG'], ['UntargetDead', 'bUntargetDead'], ['UntargetSelf', 'bUntargetSelf']].forEach(function (d) { addProp(L, d[0], 'litePreference.data.' + d[1], function (v) { return !!v; }); });
  addProp(L, 'DisableRedWarning', 'litePreference.data.dOptions.disRed', function (v) { return !!v; });
  addFn(L, 'Get', function (n) { return get('litePreference.data.' + n); });
  addFn(L, 'Set', function (n, v) { return set('litePreference.data.' + n, v); });

  // ---------- Boosts (usa os itens de boost do inventário) ----------
  var Bo = Bot.Boosts = Bot.Boosts || {};
  Bo.Enabled = false;
  ['ClassBoostID', 'ExperienceBoostID', 'GoldBoostID', 'ReputationBoostID'].forEach(function (n) { Bo[n] = 0; });
  ['UseClassBoost', 'UseExperienceBoost', 'UseGoldBoost', 'UseReputationBoost'].forEach(function (n) { Bo[n] = false; });
  Bo.SetAllBoostsIDs = function (c, e, g, r) { Bo.ClassBoostID = c; Bo.ExperienceBoostID = e; Bo.GoldBoostID = g; Bo.ReputationBoostID = r; };
  Bo.SetClassBoostID = function (v) { Bo.ClassBoostID = v; }; Bo.SetExperienceBoostID = function (v) { Bo.ExperienceBoostID = v; };
  Bo.SetGoldBoostID = function (v) { Bo.GoldBoostID = v; }; Bo.SetReputationBoostID = function (v) { Bo.ReputationBoostID = v; };
  Bo.GetBoostID = function (n) { return Bo[n + 'BoostID'] || 0; };
  Bo.IsBoostActive = function (n) { return Au.Player.some(function (a) { return lc(a.nam).indexOf(lc(n)) > -1; }); };
  Bo.UseBoost = function (id) { call('world.sendUseItemRequest', [Bot.Snap(((Inv.GetItem(id) || {}).Path) || 'x')]); };
  var boTimer = null;
  Bo.Start = function () { Bo.Enabled = true; if (boTimer) return; boTimer = setInterval(function () { [['Class'], ['Experience'], ['Gold'], ['Reputation']].forEach(function (x) { var id = Bo[x[0] + 'BoostID']; if (Bo['Use' + x[0] + 'Boost'] && id && Inv.Contains(id) && !Bo.IsBoostActive(x[0])) Bo.UseBoost(id); }); }, 3000); };
  Bo.Stop = function () { Bo.Enabled = false; if (boTimer) { clearInterval(boTimer); boTimer = null; } };
  Bo.StopAsync = async function () { Bo.Stop(); };

  // ---------- Servers (somente leitura; login é feito pelo jogo) ----------
  var Sv = Bot.Servers = Bot.Servers || {};
  Sv.CachedServers = []; Sv.ServerList = []; Sv.LastIP = ''; Sv.LastName = '';
  ['SetLoginInfo', 'GetServers', 'Connect', 'ConnectIP', 'Login', 'Logout', 'Reconnect', 'Relogin', 'ReloginIP', 'EnsureRelogin'].forEach(function (n) { Sv[n] = nosup('Servers.' + n); });
  Sv.Logout = function () { return call('logout'); };


  // ---------- contêineres: itens em comum ----------
  [[Inv, 'Inventory'], [B, 'Bank'], [T, 'TempInv'], [Hs, 'House']].forEach(function (x) {
    var c = x[0];
    addFn(c, 'TryGetItem', function (q) { return I.find(c.Items, q) || null; });
    addFn(c, 'GetItem', function (q) { return I.find(c.Items, q) || null; });
    addFn(c, 'IsMaxStack', function (q) { var it = I.find(c.Items, q); return !!it && it.MaxStack > 0 && it.Quantity >= it.MaxStack; });
  });
  addFn(Inv, 'EquipItems', async function () { var l = arr(arguments); for (var i = 0; i < l.length; i++) await Inv.EquipItem(l[i]); });
  addFn(Inv, 'EnsureToBank', async function (q) { await B.Load(); for (var i = 0; i < 5; i++) { if (!Inv.Contains(q)) return true; await Inv.ToBank(q); await sleep(O.ActionDelay); } return !Inv.Contains(q); });
  addFn(Inv, 'BankAllCoinItems', async function () { await B.Load(); var l = Inv.Items.filter(function (i) { return i.Coins && !i.Equipped; }); for (var i = 0; i < l.length; i++) { await Inv.ToBank(l[i].ID); await sleep(O.ActionDelay); } });
  addGet(B, 'FreeSlots', function () { return (B.Slots || 0) - (B.UsedSlots || 0); });
  addFn(B, 'ToBank', function (q) { return Inv.ToBank(q); });
  addFn(B, 'EnsureToBank', function (q) { return Inv.EnsureToBank(q); });
  addFn(B, 'BankAllCoinItems', function () { return Inv.BankAllCoinItems(); });
  addFn(Hs, 'ToBank', nosup('House.ToBank'));
  addFn(Hs, 'EnsureToBank', nosup('House.EnsureToBank'));
  addFn(Hs, 'BankAllCoinItems', nosup('House.BankAllCoinItems'));
  addGet(Hs, 'Slots', function () { return get('world.myAvatar.objData.iHouseSlots') || 0; });
  addGet(Hs, 'UsedSlots', function () { return get('world.myAvatar.houseitems.length') || 0; });
  addFn(Wt, 'IsActionAvailable', function (a) { return true; });
  addFn(Mo, 'new', function () { return Mo; });

  // handlers / flash / manager
  Bot.Handlers = Bot.Handlers || { Add: nosup('Handlers.Add'), Remove: nosup('Handlers.Remove'), Clear: function () {} };
  Bot.Manager = Bot.Manager || { get ScriptRunning() { return W.SkuaRunner.running; }, StopScript: function () { W.SkuaRunner.Stop(); } };
  // ---- recursos usados pelos Core* reais ----
  function auraObj(list) { return list.map(function (a) { return { Name: a.nam, Value: a.val, Stack: a.val, Duration: a.dur, IsPassive: !!a.passive, nam: a.nam }; }); }
  Bot.Self = Bot.Self || { get Auras() { return auraObj(Bot.Auras.Player); }, HasActiveAura: function (n) { return Bot.Auras.HasAura(n, false); } };
  Bot.Target = Bot.Target || {};
  addGet(Bot.Target, 'Auras', function () { return auraObj(Bot.Auras.Target); });
  addFn(Bot.Target, 'HasActiveAura', function (n) { return Bot.Auras.HasAura(n, true); });
  addGet(Hs, 'FreeSlots', function () { return Math.max(0, (Hs.Slots || 0) - (Hs.UsedSlots || 0)); });
  addFn(Hs, 'IsEquipped', function (x) { var it = Hs.Items || []; return it.some(function (i) { return i && i.bEquip && (i.ItemID == x || String(i.sName).toLowerCase() === String(x).toLowerCase()); }); });
  Bot.Random = Bot.Random || { Next: function (a, b) { if (b === undefined) { b = a; a = 0; } if (b === undefined) return Math.floor(Math.random() * 2147483647); return a + Math.floor(Math.random() * (b - a)); }, NextDouble: function () { return Math.random(); } };
  Bot.Stop = Bot.Stop || function () { try { W.SkuaRunner.Stop(); } catch (e) {} };
  Bot.Version = Bot.Version || { ToString: function () { return '1.0.0'; } };
  var HS = [];
  Bot.Handlers = { _h: HS,
    RegisterHandler: function (ms, fn) { var h = { fn: fn, ms: ms, last: Date.now(), once: false }; HS.push(h); return h; },
    RegisterOnce: function (ms, fn) { var h = { fn: fn, ms: ms, last: Date.now(), once: true }; HS.push(h); return h; },
    Add: function (h) { HS.push(h); }, Remove: function (h) { var i = HS.indexOf(h); if (i >= 0) HS.splice(i, 1); }, Clear: function () { HS.length = 0; } };
  var hTimer = setInterval(function () { var now = Date.now(); HS.slice().forEach(function (h) { if (now - h.last >= h.ms) { h.last = now; if (h.once) { var i = HS.indexOf(h); if (i >= 0) HS.splice(i, 1); } try { h.fn(Bot); } catch (e) {} } }); }, 250);
  if (hTimer && hTimer.unref) hTimer.unref();
  Bot.ShowMessageBox = function (m, c) {
    var btns = [].slice.call(arguments, 2);
    if (!btns.length) { Bot.Log('✉ ' + (c ? c + ': ' : '') + m); return { Text: 'OK', Result: true }; }
    var pick = btns.indexOf('None') >= 0 ? 'None' : btns.indexOf('No') >= 0 ? 'No' : btns.indexOf('Cancel') >= 0 ? 'Cancel' : btns[0];
    Bot.Log('✉ ' + (c || 'Aviso') + ': escolhi automaticamente "' + pick + '"');
    return { Text: pick, Result: pick !== 'None' && pick !== 'No' && pick !== 'Cancel' };
  };
  Bot.Manager = Bot.Manager || {};
  addGet(Bot.Manager, 'ScriptRunning', function () { return W.SkuaRunner.running; });
  addFn(Bot.Manager, 'StopScript', function () { W.SkuaRunner.Stop(); });
  addFn(Bot.Manager, 'LoadedScript', 'Scripts/Skua.cs');
  addFn(Bot.Manager, 'CompiledScript', '');
  addFn(Bot.Manager, 'RestartScriptAsync', async function () { Bot.Log('⚠ Reiniciar script: reinicie o bot manualmente'); });
  var CF = Bot.Config;
  if (CF) {
    CF.Options = CF.Options || [];
    // Dictionary<string, List<IOption>>: .Any(kv => kv.Value...), .Count, .Keys, .Values, .ContainsKey
    if (!CF.MultipleOptions || !CF.MultipleOptions.Any) {
      var mo = CF.MultipleOptions || {};
      var meth = { Any: function (f) { var self = this; var es = Object.keys(self).map(function (k) { return { Key: k, Value: self[k] }; }); return f ? es.some(f) : es.length > 0; }, ContainsKey: function (k) { return k in this; }, TryGetValue: function (k) { return k in this ? this[k] : null; } };
      Object.keys(meth).forEach(function (k) { Object.defineProperty(mo, k, { value: meth[k], enumerable: false, configurable: true, writable: true }); });
      Object.defineProperty(mo, 'Count', { get: function () { return Object.keys(this).length; }, enumerable: false, configurable: true });
      Object.defineProperty(mo, 'Keys', { get: function () { return Object.keys(this); }, enumerable: false, configurable: true });
      Object.defineProperty(mo, 'Values', { get: function () { var s2 = this; return Object.keys(this).map(function (k) { return s2[k]; }); }, enumerable: false, configurable: true });
      CF.MultipleOptions = mo;
    }
    CF.Configure = CF.Configure || function () { return true; };
  }
  Bot.Flash = Bot.Flash || { GetArrayObject: function (p, i) { return get(p + '.' + i); }, Call: call, GetGameObject: get, SetGameObject: set, CallGameFunction: call, Get: get, Set: set };
  Bot.InvHelper = Bot.InvHelper || { Check: function (q, n, temp) { return temp ? Bot.TempInv.Contains(q, n) : Inv.Contains(q, n); } };
  if (!('Instance' in Bot)) Bot.Instance = Bot;

  // ---- paridade com a API do Skua (auditoria membro a membro) ----
  function auraByName(list, n) { n = lc(n); var r = list.filter(function (a) { return lc(a.nam || a.Name) === n; })[0]; return r || null; }
  [[Bot.Self, false], [Bot.Target, true]].forEach(function (x) {
    var o = x[0], tgt = x[1];
    o.GetAura = function (n) { return auraByName(tgt ? Bot.Auras.Target : Bot.Auras.Player, n); };
    o.TryGetAura = function (n) { return Bot.Auras.HasAura(n, tgt) ? o.GetAura(n) : null; };
  });
  Au.Self = Bot.Self; Au.TargetAuras = Au.TargetAuras;
  Mo.GetCellMonsters = function () { var d = {}; Mo.MapMonsters.forEach(function (m) { (d[m.Cell] = d[m.Cell] || []).push(m); }); return d; };
  Bot.Initialize = function () {};
  Bot.StopTimerAsync = async function () {};
  Bot.Schedule = async function (delay, action) { await sleep(delay); var r = action(Bot); if (r && typeof r.then === 'function') await r; };
  Bot.GameProxy = { Running: false, Destination: '', Start: function () { this.Running = true; dbg('GameProxy.Start: sem efeito neste cliente'); }, Stop: function () { this.Running = false; } };
  Bot.Manager.StopScriptAsync = async function (runEvent) { W.SkuaRunner.Stop(); };
  Object.defineProperty(Bot.Manager, 'ShouldExit', { get: function () { return Bot.ShouldExit; }, enumerable: true, configurable: true });
  if (!('Config' in Bot.Manager)) Object.defineProperty(Bot.Manager, 'Config', { get: function () { return Bot.Config; }, enumerable: true, configurable: true });
  Bot.Flash.FlashCall = function (fn) { return call.apply(null, arguments); };
  Bot.Flash.FlashCallHandler = function () { return call.apply(null, arguments); };
  Bot.Flash.GetGameObjectStatic = function (p) { return get(p); };
  Bot.Flash.FromFlashXml = function (x) { return x; };
  Object.defineProperty(O, 'OptionDictionary', { get: function () { var d = {}; Object.keys(I.optDefs).forEach(function (k) { d[k] = O[k]; }); return d; }, enumerable: false, configurable: true });
  Object.defineProperty(Q, 'CachedDictionary', { get: function () { var d = {}; Q.Tree.forEach(function (q) { d[q.ID] = q; }); return d; }, enumerable: false, configurable: true });
  Object.defineProperty(Bot.Handlers, 'CurrentHandlers', { get: function () { return HS.slice(); }, enumerable: false, configurable: true });
  W.SkuaExtraLoaded = true;
})();
