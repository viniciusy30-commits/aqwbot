/* skua.js — port do núcleo do Skua (Bot.*) para o launcher mobile.
 * Roda sobre a ponte window.aqw (aqwGet/aqwSet/aqwCall) do cliente modificado.
 * Caminhos e chamadas foram tirados do código original do Skua (Skua.Core + Skua.AS3).
 * Scripts são JS assíncrono:  await Bot.Kill.Monster("Slime");
 */
(function () {
  'use strict';
  var W = window;
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var run = { stop: false };

  // ---------------- ponte ----------------
  function ok() { return !!(W.aqw && W.aqw.ok()); }
  function get(p) { try { var v = W.aqw.get(p); return v === undefined ? null : v; } catch (e) { return null; } }
  function set(p, v) { try { W.aqw.set(p, v); return true; } catch (e) { return false; } }
  function call(p, a) { try { return W.aqw.call(p, a || []); } catch (e) { return null; } }
  function keys(p) { try { return W.aqw.keys(p) || []; } catch (e) { return []; } }
  function snap(p, fields) { // copia um objeto do jogo para um objeto JS simples
    var o = {}, ks = fields || keys(p);
    ks.forEach(function (k) { var v = get(p + '.' + k); if (v !== null) o[k] = v; });
    return o;
  }
  function check() { if (run.stop) throw new Error('__SKUA_STOP__'); }
  function log(m) { Logs.add('script', m); }
  function lc(s) { return String(s === null || s === undefined ? '' : s).toLowerCase(); }

  // ---------------- logs ----------------
  var Logs = {
    buf: { script: [], debug: [], flash: [] }, subs: [],
    add: function (ch, m) {
      var b = Logs.buf[ch] || (Logs.buf[ch] = []);
      var line = { t: Date.now(), m: String(m) };
      b.push(line); if (b.length > 400) b.shift();
      Logs.subs.forEach(function (f) { try { f(ch, line); } catch (e) {} });
      if (ch === 'script') { try { (W.hostLog || console.log)('[script] ' + m); } catch (e) {} }
    },
    sub: function (f) { Logs.subs.push(f); }
  };

  // ---------------- eventos ----------------
  var Events = {
    h: {},
    // ctx: o "this" do script (métodos passados como handler: Bot.Events.X += Metodo). Off acha o handler pela função original.
    On: function (n, f, ctx) {
      var h = f;
      if (ctx !== undefined && ctx !== null && typeof f === 'function') { h = function () { return f.apply(ctx, arguments); }; h.orig = f; }
      (Events.h[n] = Events.h[n] || []).push(h); return h;
    },
    Off: function (n, f) { Events.h[n] = (Events.h[n] || []).filter(function (x) { return x !== f && x.orig !== f; }); },
    emit: function (n) { var a = [].slice.call(arguments, 1); (Events.h[n] || []).slice().forEach(function (f) { try { f.apply(null, a); } catch (e) { Logs.add('debug', 'evento ' + n + ': ' + e.message); } }); },
    Clear: function () { Events.h = {}; if (W.SkuaWaitRehook) W.SkuaWaitRehook(); }
  };

  // ---------------- estatísticas ----------------
  var Stats = {
    Kills: 0, Drops: 0, Deaths: 0, QuestsCompleted: 0, start: 0,
    Reset: function () { Stats.Kills = Stats.Drops = Stats.Deaths = Stats.QuestsCompleted = 0; Stats.start = Date.now(); },
    get Elapsed() { return Stats.start ? Date.now() - Stats.start : 0; }
  };

  // ---------------- configuração (CoreBots Options) ----------------
  var Config = {
    data: {},
    Load: function () { try { Config.data = JSON.parse(localStorage.getItem('skua.config') || '{}'); } catch (e) { Config.data = {}; } },
    Save: function () { try { localStorage.setItem('skua.config', JSON.stringify(Config.data)); } catch (e) {} },
    Get: function (k, d) { return k in Config.data ? Config.data[k] : d; },
    Set: function (k, v) { Config.data[k] = v; Config.Save(); }
  };
  Config.Load();

  // ---------------- opções (como ScriptOption do Skua) ----------------
  var Options = {};
  var optDefs = {};
  function opt(name, def, onSet, label, kind) {
    var val = def;
    optDefs[name] = { def: def, label: label || name, kind: kind || (typeof def === 'boolean' ? 'bool' : typeof def === 'number' ? 'int' : 'string'), onSet: onSet };
    Object.defineProperty(Options, name, {
      enumerable: true,
      get: function () { return val; },
      set: function (v) { val = v; if (onSet && ok()) { try { onSet(v); } catch (e) { Logs.add('debug', 'opção ' + name + ': ' + e.message); } } }
    });
  }
  var magTimer = null;
  opt('SafeTimings', true, null, 'Safe Timings');
  opt('ActionDelay', 800, null, 'Action Delay (ms)');
  opt('JoinMapTries', 3, null, 'Join Map Tries');
  opt('QuestAcceptAndCompleteTries', 30, null, 'Quest Accept/Complete Tries');
  opt('PrivateRooms', false, null, 'Private Rooms');
  opt('PrivateNumber', -1, null, 'Private Number');
  opt('ExitCombatBeforeQuest', false, null, 'Exit Combat Before Quest');
  opt('AcceptACDrops', false, function (v) { Drops.Start(); }, 'Accept AC Drops');
  opt('AcceptAllDrops', false, function (v) { Drops.Start(); }, 'Accept All Drops');
  opt('RejectAllDrops', false, function (v) { Drops.Start(); }, 'Reject All Drops');
  opt('SkipCutscenes', false, function (v) { if (v) Skip(); }, 'Skip Cutscenes');
  opt('InfiniteRange', false, function (v) { if (v) for (var i = 0; i < 6; i++) set('world.actions.active.' + i + '.range', 20000); }, 'Infinite Range');
  opt('LagKiller', false, function (v) { set('world.visible', !v); }, 'Lag Killer');
  opt('DisableDeathAd', false, function (v) { set('userPreference.data.bDeathAd', !v); }, 'Disable Death Ad');
  opt('MagnetizeTarget', false, function (v) {
    clearInterval(magTimer); magTimer = null;
    if (v) magTimer = setInterval(function () {
      if (get('world.myAvatar.target') === null) return;
      set('world.myAvatar.target.pMC.x', get('world.myAvatar.pMC.x'));
      set('world.myAvatar.target.pMC.y', get('world.myAvatar.pMC.y'));
    }, 400);
  }, 'Magnetize Target');
  opt('HidePlayers', false, function (v) { set('litePreference.data.bHidePlayers', v); }, 'Hide Players');
  opt('DisableFX', false, function (v) { set('litePreference.data.bDisSkillAnim', v); set('litePreference.data.bDisMonAnim', v); set('litePreference.data.bDisDmgStrobe', v); }, 'Disable FX');
  opt('ShowFPS', false, function (v) { set('ui.mcFPS.visible', v); }, 'Show FPS');
  opt('WalkSpeed', 8, function (v) { set('world.WALKSPEED', v); }, 'Walk Speed');
  opt('SetFPS', 30, function (v) { set('stage.frameRate', v); }, 'Frame Rate');
  opt('CustomName', '', function (v) { if (v) { set('world.myAvatar.objData.strUsername', v); set('world.myAvatar.pMC.pname.ti.text', v); } }, 'Custom Name');
  opt('CustomGuild', '', function (v) { if (v) set('world.myAvatar.pMC.pname.tg.text', v); }, 'Custom Guild');
  opt('AutoRelogin', false, null, 'Auto Relogin');
  Options.Defaults = function () { var o = {}; Object.keys(optDefs).forEach(function (k) { o[k] = optDefs[k].def; }); return o; };
  Options.Describe = function () { return Object.keys(optDefs).map(function (k) { return { name: k, label: optDefs[k].label, kind: optDefs[k].kind }; }); };
  Options.Save = function () { try { var o = { _v: 2 }; Object.keys(optDefs).forEach(function (k) { o[k] = Options[k]; }); localStorage.setItem('skua.options', JSON.stringify(o)); } catch (e) {} };
  Options.Load = function () { try { var o = JSON.parse(localStorage.getItem('skua.options') || '{}'); if (o._v !== 2) { ['ActionDelay', 'JoinMapTries', 'QuestAcceptAndCompleteTries', 'SetFPS'].forEach(function (k) { delete o[k]; }); } /* v2: padrões do Skua (800/3/30/30) */ Object.keys(o).forEach(function (k) { if (k in optDefs) Options[k] = o[k]; }); } catch (e) {} };
  Options.Reset = function () { var d = Options.Defaults(); Object.keys(d).forEach(function (k) { Options[k] = d[k]; }); };
  Options.ReapplyAll = function () { Object.keys(optDefs).forEach(function (k) { var d = optDefs[k]; if (d.onSet && Options[k] !== d.def) { try { d.onSet(Options[k]); } catch (e) {} } }); };
  Object.defineProperty(Options, 'ApplyAll', { value: Options.ReapplyAll });
  Options.Load();

  function Skip() {
    var n = 0;
    while ((get('mcExtSWF.numChildren') || 0) > 0 && n++ < 20) call('mcExtSWF.removeChildAt', [0]);
    call('showInterface');
  }

  // ---------------- pacotes ----------------
  var Send = {
    Packet: function (pkt, type) { return call('sfc.send' + (type || 'String'), [pkt]); },
    ClientPacket: function (pkt, type) { Logs.add('debug', 'ClientPacket (injeção) não é suportado neste cliente: ' + pkt); },
    Whisper: function (name, msg) { return Send.Packet('%xt%zm%whisper%1%' + msg + '%' + name + '%'); },
    PacketSpam: async function (pkt, type, delay, count) {
      for (var i = 0; (count ? i < count : true) && !run.stop; i++) { Send.Packet(pkt, type); await sleep(delay || 100); }
    }
  };

  var Packets = {
    log: [], subs: [], inBuf: '', outBuf: '', capture: false, intercept: [],
    sub: function (f) { Packets.subs.push(f); },
    feed: function (dir, chunk) { // dir: '>>' cliente->servidor, '<<' servidor->cliente
      var key = dir === '>>' ? 'outBuf' : 'inBuf';
      var s = Packets[key] + chunk, parts = s.split('\u0000');
      Packets[key] = parts.pop();
      parts.forEach(function (p) {
        if (!p) return;
        Packets.log.push({ t: Date.now(), d: dir, m: p }); if (Packets.log.length > 600) Packets.log.shift();
        Packets.subs.forEach(function (f) { try { f(dir, p); } catch (e) {} });
        if (dir === '>>') { try { clientPacket(p); } catch (e) { Logs.add('debug', 'pacote>>: ' + e.message); } }
        if (dir === '<<') { try { handlePacket(p); } catch (e) { Logs.add('debug', 'pacote: ' + e.message); } }
        if (dir === '<<' && Events.h.ExtensionPacketReceived && Events.h.ExtensionPacketReceived.length) {
          try {
            if (p.charAt(0) === '{') { var pj = JSON.parse(p); if (pj && pj.t === 'xt' && pj.b) Events.emit('ExtensionPacketReceived', { params: { type: 'json', dataObj: pj.b.o } }); }
            else if (p.charAt(0) === '%') { var ps = p.split('%'); Events.emit('ExtensionPacketReceived', { params: { type: 'str', dataObj: ps.slice(2, ps.length - 1) } }); }
          } catch (e) {}
        }
      });
    }
  };
  W.onPacket = function (dir, txt) { Packets.feed(dir, txt); };

  // eventos gerados por pacotes enviados pelo cliente (igual ao ScriptInterface do Skua)
  function clientPacket(p) {
    if (p.charAt(0) !== '%') return;
    var q = p.split('%'), c = q[3];
    if (c === 'moveToCell') Events.emit('CellChanged', Map.Name, q[5], q[6]);
    else if (c === 'acceptQuest') { Stats.QuestsAccepted = (Stats.QuestsAccepted || 0) + 1; Events.emit('QuestAccepted', parseInt(q[5], 10)); }
    else if (c === 'buyItem') Events.emit('TryBuyItem', parseInt(q[6], 10), parseInt(q[5], 10), parseInt(q[7], 10));
    else if (c === 'cmd' && q[5] === 'logout') Events.emit('Logout');
  }
  function handlePacket(raw) {
    var cmd = null, o = null, str = null;
    if (raw.charAt(0) === '{') {
      var j = JSON.parse(raw);
      o = j && j.b && j.b.o; if (!o) return; cmd = o.cmd;
    } else if (raw.charAt(0) === '%') {
      str = raw.split('%'); cmd = str[2];
    } else return;
    switch (cmd) {
      case 'moveToArea':
        // ScriptInterface: reaplica nome/guilda personalizados, guarda arquivo e nome do mapa
        try { if (Options.CustomName) Options.CustomName = Options.CustomName; if (Options.CustomGuild) Options.CustomGuild = Options.CustomGuild; } catch (e) {}
        if (o) { Map.FilePath = String(o.strMapFileName || ''); Map.LastMap = String(o.strMapName || ''); }
        Events.emit('MapChanged', o && o.strMapName); break;
      case 'event':
        if (o && o.args && o.args.zoneSet) Events.emit('RunToArea', o.args.zoneSet); break;
      case 'uotls':
        if (str && lc(str[4] || '') === lc(Player.Username || '') && str[5] === 'afk:true') Events.emit('PlayerAFK'); break;
      case 'ct':
        var me = lc(Player.Username);
        if (o && o.p && o.p[me] && o.p[me].intHP === 0) { Stats.Deaths++; Events.emit('PlayerDeath'); }
        if (o && o.anims && o.anims[0] && o.anims[0].msg && /prepares a counter attack!/.test(o.anims[0].msg)) Events.emit('CounterAttack', false);
        if (o && o.a) o.a.forEach(function (a) { if (a && a.aura && a.aura.nam === 'Counter Attack') Events.emit('CounterAttack', true); });
        break;
      case 'addGoldExp':
        if (o && o.typ === 'm') { Stats.Kills++; Events.emit('MonsterKilled', o.id); } break;
      case 'ccqr':
        if (o && o.bSuccess === 1) { Stats.QuestsCompleted++; Events.emit('QuestTurnin', o.QuestID); Events.emit('QuestTurnedIn', o.QuestID); } break;
      case 'dropItem':
        if (o && o.items) {
          var k = Object.keys(o.items)[0], it = o.items[k]; if (!it) return;
          Drops._onDrop(it);
        } break;
      case 'getDrop':
        if (o && o.bSuccess === 1) Stats.Drops += (o.iQty || 1);
        if (o && (o.bBank === true || o.bBank === 'true' || o.bBank === 1)) Events.emit('ItemAddedToBank', Bank.Items.filter(function (x) { return x.ID === o.ItemID; })[0] || { ID: o.ItemID }, o.iQtyNow);
        break;
      case 'addItems':
        if (o && o.items) {
          var id = Object.keys(o.items)[0];
          var iid = parseInt(id, 10), qn = (o.items[id] && o.items[id].iQtyNow) || 0, found = null;
          Inventory.Items.concat(TempInv.Items).forEach(function (x) { if (!found && x.ID === iid) found = x; });
          if (!found) { var bk = Bank.Items.filter(function (x) { return x.ID === iid; })[0]; if (bk) { Events.emit('ItemAddedToBank', bk, bk.Quantity); break; } found = { ID: iid, Name: '', Temp: false }; }
          if (!found.Temp) Stats.Drops++;
          Events.emit('ItemDropped', found, true, qn);
        } break;
      case 'buyItem': if (o && o.bitSuccess === 1) Events.emit('ItemBought', o.CharItemID); break;
      case 'sellItem': if (o) Events.emit('ItemSold', o.CharItemID, o.iQty, o.iQtyNow, o.intAmount, o.bCoins === 1); break;
      case 'loadShop': Events.emit('ShopLoaded'); break;
      case 'loadBank': Events.emit('BankLoaded'); break;
    }
  }

  // ---------------- espera ----------------
  var Wait = {
    // Réplica do ScriptWait do Skua (mesmos timeouts, intervalos e condições)
    WAIT_SLEEP: 250, OverrideTimeout: false,
    PlayerActionTimeout: 15, MonsterActionTimeout: 15, MapActionTimeout: 25, DropActionTimeout: 10, ItemActionTimeout: 14, QuestActionTimeout: 14, GameActionTimeout: 40,
    _ev: { buy: 0, sell: 0, bank: 0 },
    _t: function (ov, d) { return Wait.OverrideTimeout ? ov : d; },
    // ForTrue(pred, timeout, sleep) ou ForTrue(pred, loopFn, timeout, sleep). timeout <= 0 = sem limite
    ForTrue: async function (fn, a, b, c) {
      var loop = null, tries, ms;
      if (typeof a === 'function') { loop = a; tries = b; ms = c; } else { tries = a; ms = b; }
      if (ms === undefined || ms === null || ms === -1) ms = Wait.WAIT_SLEEP;
      var n = 0;
      while (!(await fn())) {
        check();
        if (tries > 0 && n >= tries) return false;
        if (loop) await loop();
        await sleep(ms); n++;
      }
      return true;
    },
    ForPlayerPosition: function (x, y, t) { return Wait.ForTrue(function () { return !Player.Playing || (Player.X == x && Player.Y == y); }, Wait._t(Wait.PlayerActionTimeout, t === undefined ? 10 : t)); },
    ForCombatExit: function (t) { return Wait.ForTrue(function () { return !Player.Playing || !Player.InCombat; }, Wait._t(Wait.PlayerActionTimeout, t === undefined ? 10 : t)); },
    ForMonsterDeath: function (t) {
      return Wait.ForTrue(function () { return !Player.Playing || !Player.HasTarget; }, function () { return Combat.UntargetSelf(); }, t === undefined ? -1 : t, Math.floor(Wait.WAIT_SLEEP / 5));
    },
    ForMonsterSpawn: function (n, t) { return Wait.ForTrue(function () { return !Player.Playing || Monsters.Exists(n); }, Wait._t(Wait.MonsterActionTimeout, t === undefined ? 10 : t)); },
    ForFullyRested: function (t) { return Wait.ForTrue(function () { return !Player.Playing || (Player.Health >= Player.MaxHealth && Player.Mana >= Player.MaxMana); }, t === undefined ? -1 : t); },
    ForMapLoad: async function (name, t) {
      var clean = String(name).split('-')[0].toLowerCase(); t = t === undefined ? 20 : t;
      var r = await Wait.ForTrue(function () { return lc(Map.Name) === clean; }, Wait._t(Wait.MapActionTimeout, t));
      return r && await Wait.ForTrue(function () { return !Player.Playing || Map.Loaded; }, Wait._t(Wait.MapActionTimeout, t));
    },
    ForCellChange: function (name) { return Wait.ForTrue(function () { return !Player.Playing || Player.Cell === name; }, Wait._t(Wait.MapActionTimeout, Math.floor(Wait.WAIT_SLEEP / 4))); },
    ForPickup: function (q, t) { return Wait.ForTrue(function () { return !Player.Playing || !Drops.Exists(q); }, Wait._t(Wait.DropActionTimeout, t === undefined ? 10 : t)); },
    ForDrop: function (q, t) { return Wait.ForTrue(function () { return !Player.Playing || Drops.Exists(q); }, Wait._t(Wait.DropActionTimeout, t === undefined ? 10 : t)); },
    _evWait: async function (k, t) {
      var end = Date.now() + t * Wait.WAIT_SLEEP;
      while (Date.now() < end) { check(); if (Wait._ev[k] > 0) { Wait._ev[k] = 0; return true; } await sleep(25); }
      return false;
    },
    ForItemBuy: function (t) { return Wait._evWait('buy', Wait._t(Wait.ItemActionTimeout, t === undefined ? 10 : t)); },
    ForItemSell: function (t) { return Wait._evWait('sell', Wait._t(Wait.ItemActionTimeout, t === undefined ? 10 : t)); },
    ForBankLoad: function (t) { return Wait._evWait('bank', t === undefined ? 20 : t); },
    ForItemEquip: function (q, t) {
      return Wait.ForTrue(function () {
        if (!Player.Playing) return true;
        var it = Inventory.TryGetItem ? Inventory.TryGetItem(q) : null;
        return typeof q === 'number' ? !!(it && it.Equipped) : (!it || !!it.Equipped);
      }, Wait._t(Wait.ItemActionTimeout, t === undefined ? 10 : t));
    },
    ForBankToInventory: function (q, t) { return Wait.ForTrue(function () { return !Player.Playing || Inventory.Contains(q); }, Wait._t(Wait.ItemActionTimeout, t === undefined ? 14 : t), Math.floor(Wait.WAIT_SLEEP / 2)); },
    ForBankToHouseInventory: function (q, t) { return Wait.ForTrue(function () { return !Player.Playing || House.Contains(q); }, Wait._t(Wait.ItemActionTimeout, t === undefined ? 14 : t), Math.floor(Wait.WAIT_SLEEP / 2)); },
    ForInventoryToBank: function (q, t) { return Wait.ForTrue(function () { return !Player.Playing || !Inventory.Contains(q); }, Wait._t(Wait.ItemActionTimeout, t === undefined ? 14 : t), Math.floor(Wait.WAIT_SLEEP / 2)); },
    ForHouseInventoryToBank: function (q, t) { return Wait.ForTrue(function () { return !Player.Playing || !House.Contains(q); }, Wait._t(Wait.ItemActionTimeout, t === undefined ? 14 : t), Wait.WAIT_SLEEP); },
    ForQuestAccept: function (id, t) { return Wait.ForTrue(function () { return !Player.Playing || Quests.IsInProgress(id); }, Wait._t(Wait.QuestActionTimeout, t === undefined ? 14 : t), Math.floor(Wait.WAIT_SLEEP / 2)); },
    ForQuestComplete: function (id, t) { return Wait.ForTrue(function () { return !Player.Playing || !Quests.IsInProgress(id); }, Wait._t(Wait.QuestActionTimeout, t === undefined ? 10 : t), Math.floor(Wait.WAIT_SLEEP / 2)); },
    ForSkillCooldown: function (i, t) { return Wait.ForTrue(function () { return Skills.CanUseSkill(i); }, t === undefined ? 50 : t, Wait.WAIT_SLEEP); },
    For: function (fn, v, t) { return Wait.ForTrue(async function () { return (await fn()) === v; }, t === undefined ? 10 : t); },
    IsActionAvailable: function (a) {
      if (!Player.Playing) return false;
      var ts = get('world.lock.' + a + '.ts'), cd = get('world.lock.' + a + '.cd');
      if (ts === null || cd === null || ts === undefined) return false;
      return Date.now() - ts >= cd;
    },
    ForActionCooldown: function (a, t) {
      var map = { LoadShop: 'loadShop', LoadEnhShop: 'loadEnhShop', LoadHairShop: 'loadHairShop', EquipItem: 'equipItem', UnequipItem: 'unequipItem', BuyItem: 'buyItem', SellItem: 'sellItem', GetMapItem: 'getMapItem', TryQuestComplete: 'tryQuestComplete', AcceptQuest: 'acceptQuest', DoIA: 'doIA', Rest: 'rest', Who: 'who', Transfer: 'tfer' };
      var name = map[a] || a;
      return Wait.ForTrue(function () { return Wait.IsActionAvailable(name); }, Wait._t(Wait.GameActionTimeout, t === undefined ? 40 : t));
    }
  };
  Wait.ForAsync = Wait.For; Wait.ForTrueAsync = Wait.ForTrue; Wait.ForTrueSync = Wait.ForTrue;
  Events.On('ItemBought', function () { Wait._ev.buy = 1; });
  Events.On('ItemSold', function () { Wait._ev.sell = 1; });
  Events.On('BankLoaded', function () { Wait._ev.bank = 1; });
  W.SkuaWaitRehook = function () { Events.On('ItemBought', function () { Wait._ev.buy = 1; }); Events.On('ItemSold', function () { Wait._ev.sell = 1; }); Events.On('BankLoaded', function () { Wait._ev.bank = 1; }); };

  // ---------------- jogador ----------------
  var Player = {
    // Skua: Playing => LoggedIn && Alive  (LoggedIn = sfc.isConnected, Alive = State > 0)
    get Playing() { return Player.LoggedIn && Player.Alive; },
    get LoggedIn() {
      if (!ok()) return false;
      var c = get('sfc.isConnected');
      if (c === null || c === undefined) return get('world.myAvatar') !== null; // sfc ilegível: cai para "tem avatar"
      return c === true;
    },
    get Kicked() { return get('mcLogin.warning.visible') === true; },
    get Username() { return get('world.myAvatar.objData.strUsername') || ''; },
    get Level() { return get('world.myAvatar.dataLeaf.intLevel'); },
    get Gold() { return get('world.myAvatar.objData.intGold'); },
    get Health() { return get('world.myAvatar.dataLeaf.intHP') || 0; },
    get MaxHealth() { return get('world.myAvatar.dataLeaf.intHPMax') || 0; },
    get Mana() { return get('world.myAvatar.objData.intMP') || 0; },
    get MaxMana() { return get('world.myAvatar.dataLeaf.intMPMax') || 0; },
    get Exp() { return get('world.myAvatar.objData.intExp'); },
    get ExpToLevel() { return get('world.myAvatar.objData.intExpToLevel'); },
    get Guild() { return get('world.myAvatar.objData.guild.Name') || ''; },
    get State() { return get('world.myAvatar') === null ? 0 : (get('world.myAvatar.dataLeaf.intState') || 0); },
    get Alive() { return Player.State > 0; },
    get InCombat() { return Player.State === 2; },
    get Cell() { return get('world.strFrame') || ''; },
    get Pad() { return get('world.strPad') || ''; },
    get X() { return get('world.myAvatar.pMC.x'); },
    get Y() { return get('world.myAvatar.pMC.y'); },
    get AFK() { return !!get('world.myAvatar.dataLeaf.afk'); },
    get HasTarget() {
      if (get('world.myAvatar.target') === null) return false;
      var hp = get('world.myAvatar.target.dataLeaf.intHP');
      return hp === null || hp > 0;
    },
    get IsMember() { return (get('world.myAvatar.objData.iUpgDays') || -1) >= 0; },
    // Skua: items.length > 0 && !mapLoadInProgress && pMC.artLoaded()
    get Loaded() {
      if ((get('world.myAvatar.items.length') || 0) <= 0 || get('world.mapLoadInProgress')) return false;
      var art = call('world.myAvatar.pMC.artLoaded');
      return art === null || art === undefined ? true : !!art; // chamada indisponível: não bloqueia
    },
    Rest: async function (full) {
      if (Options.SafeTimings) await Wait.ForActionCooldown('Rest');
      call('world.rest');
      if (full) await Wait.ForTrue(function () { return Player.Health >= Player.MaxHealth && Player.Mana >= Player.MaxMana; }, 20);
    },
    WalkTo: async function (x, y, speed) {
      speed = (speed === undefined || speed === 8) ? (get('world.WALKSPEED') || 8) : speed;
      call('world.myAvatar.pMC.walkTo', [x, y, speed]);
      call('world.moveRequest', [{ mc: null, tx: x, ty: y, sp: speed }]);
      if (Options.SafeTimings) await Wait.ForPlayerPosition(x, y);
    },
    Jump: function (c, p) { return Map.Jump(c, p); },
    Join: function (m, c, p) { return Map.Join(m, c, p); },
    Goto: function (name) { return Send.Packet('%xt%zm%cmd%' + Map.RoomID + '%goto%' + name + '%'); },
    Logout: function () { return call('logout'); },
    HasActiveBoost: function () { return false; }
  };

  // ---------------- mapa ----------------
  var Map = {
    get Name() { return get('world.strMapName') || ''; },
    get RoomID() { return get('world.curRoom'); },
    get Loaded() { return !get('world.mapLoadInProgress') && get('mcConnDetail.stage') === null; },
    get PlayerNames() { return keys('world.uoTree'); },
    get PlayerCount() { return get('world.areaUsers.length') || 0; },
    get Cells() { return keys('world.map.currentScene.labels').length ? snapNames('world.map.currentScene.labels') : []; },
    JoinPacket: function (map, cell, pad) { Send.Packet('%xt%zm%cmd%' + Map.RoomID + '%tfer%' + Player.Username + '%' + map + '%' + (cell || 'Enter') + '%' + (pad || 'Spawn') + '%'); },
    LastMap: '', FilePath: '',
    Join: async function (map, cell, pad, ignoreCheck, autoCorrect) {
      cell = cell || 'Enter'; pad = pad || 'Spawn';
      var base = String(map).split('-')[0];
      Map.LastMap = base;
      if (!Player.Playing || !Player.Loaded) return;
      if (!ignoreCheck && lc(Map.Name) === lc(map)) return;
      var tries = 0;
      while (lc(Map.Name) !== lc(base) && !run.stop && ++tries < Options.JoinMapTries) {
        var m = map;
        if ((Options.PrivateRooms && String(m).indexOf('-') < 0) || String(m).indexOf('-1e9') >= 0)
          m = base + (Options.PrivateNumber !== -1 ? '-' + Options.PrivateNumber : '-100000');
        if (Options.SafeTimings) await Wait.ForActionCooldown('Transfer');
        Map.JoinPacket(m, cell, pad);
        if (Options.SafeTimings) {
          var okLoad = await Wait.ForMapLoad(m, 20);
          if (!okLoad && !run.stop) await Map.Jump(Player.Cell, Player.Pad, autoCorrect);
          else await Map.Jump(cell, pad, autoCorrect);
          await sleep(Options.ActionDelay);
        } else await sleep(Options.ActionDelay);
      }
    },
    // Main.as jumpCorrectRoom: com autoCorrect (padrão) escolhe o pad de quem já está na cela e depois acerta o pad ("Left")
    _arr: function (p) { var n = get(p + '.length') || 0, o = []; for (var i = 0; i < n; i++) o.push(get(p + '.' + i)); return o; },
    _jumpCorrectRoom: function (cell, pad, autoCorrect, clientOnly) {
      if (autoCorrect === false) { call('world.moveToCell', [cell, pad, !!clientOnly]); return; }
      var me = lc(Player.Username);
      var users = Map._arr('world.areaUsers').filter(function (u) { return lc(u) !== me; }).sort();
      if (users.length <= 1) call('world.moveToCell', [cell, pad, !!clientOnly]);
      else {
        var usersPad = 'Left';
        for (var i = 0; i < users.length; i++) {
          var uc = get('world.uoTree.' + users[i] + '.strFrame'), up = get('world.uoTree.' + users[i] + '.strPad');
          if (up !== null) usersPad = up;
          if (cell === uc && pad !== up) break;
        }
        call('world.moveToCell', [cell, usersPad, !!clientOnly]);
      }
      setTimeout(function () { try { Map._jumpCorrectPad(cell, !!clientOnly); } catch (e) {} }, 50);
    },
    _jumpCorrectPad: function (cell, clientOnly) {
      var names = ['Left', 'Spawn', 'Center', 'Right', 'Up', 'Down', 'Top', 'Bottom'], pick = null;
      for (var i = 0; i < names.length && !pick; i++) { var c = call('world.map.getChildByName', [names[i]]); if (c !== null && c !== undefined) pick = names[i]; }
      if (!pick || get('world.strPad') === pick) return;
      call('world.moveToCell', [cell, pick, clientOnly]);
    },
    Jump: async function (cell, pad, autoCorrect, clientOnly) {
      pad = pad || 'Spawn';
      Map._jumpCorrectRoom(cell, pad, autoCorrect, clientOnly);
      await sleep(Options.ActionDelay);
      if (Options.SafeTimings) await Wait.ForCellChange(cell);
    },
    Reload: function () { return call('world.reloadCurrentMap'); },
    GetMapItem: async function (id) {
      if (Options.SafeTimings) { await Wait.ForActionCooldown('GetMapItem'); await sleep(Options.ActionDelay); }
      call('world.getMapItem', [id]);
    },
    SetSpawnPoint: function () { return call('world.setSpawnPoint'); },
    GetPlayer: function (name) { return snap('world.uoTree.' + lc(name)); }
  };
  function snapNames(p) { return keys(p).map(function (k) { return get(p + '.' + k + '.name'); }).filter(Boolean); }

  // ---------------- monstros ----------------
  var Monsters = {
    get MapMonsters() {
      var out = [], n = get('world.monsters.length') || 0;
      for (var i = 0; i < n; i++) {
        var d = 'world.monsters.' + i;
        out.push({
          Index: i, Name: get(d + '.objData.strMonName'), ID: get(d + '.objData.MonID'),
          MapID: get(d + '.dataLeaf.MonMapID') || get(d + '.objData.MonMapID'),
          Cell: get(d + '.dataLeaf.strFrame'), HP: get(d + '.dataLeaf.intHP'),
          MaxHP: get(d + '.dataLeaf.intHPMax'), State: get(d + '.dataLeaf.intState'),
          Race: get(d + '.objData.sRace')
        });
      }
      return out;
    },
    get CurrentMonsters() { var c = Player.Cell; return Monsters.MapMonsters.filter(function (m) { return m.Cell === c; }); },
    // availableMonstersInCell (Main.as): monstros da cela atual que têm pMC (estão na tela)
    get CurrentAvailableMonsters() {
      var c = Player.Cell;
      return Monsters.MapMonsters.filter(function (m) { return m.Cell === c && get('world.monsters.' + m.Index + '.pMC.x') !== null; });
    },
    // getMonster/attackMonsterByName (Main.as): contém o texto (sem diferenciar maiúsculas) ou '*'
    _match: function (m, q) {
      if (typeof q === 'number') return m.MapID === q;
      var s = lc(q);
      return s === '*' || lc(m.Name).indexOf(s) > -1;
    },
    _byId: function (id) {
      return Monsters.MapMonsters.filter(function (m) { return m.MapID === id && get('world.monsters.' + m.Index + '.pMC.x') !== null; })[0] || null;
    },
    Find: function (q) { return Monsters.MapMonsters.filter(function (m) { return Monsters._match(m, q); }); },
    // IScriptMonster.Exists: nome EXATO (sem espaços nas pontas) ou '*'; número = ID ou MapID
    Exists: function (q) {
      var list = Monsters.CurrentAvailableMonsters;
      if (typeof q === 'number') return list.some(function (m) { return m.ID === q || m.MapID === q; });
      var t = String(q).trim();
      return list.some(function (m) { return q === '*' || String(m.Name || '').trim() === t; });
    },
    MonsterHP: function (q) {
      var m = typeof q === 'number' ? Monsters._byId(q) : Monsters.CurrentAvailableMonsters.filter(function (x) { return Monsters._match(x, q); })[0];
      return m ? (m.HP || 0) : 0;
    },
    GetHealth: function (q) { return Monsters.MonsterHP(q); }
  };

  // ---------------- combate ----------------
  var Combat = {
    StopAttacking: false, _target: null,
    _attackTarget: function (m) {
      if (m && get('world.monsters.' + m.Index + '.pMC.x') !== null) {
        try { W.aqw.target(m.Index); } catch (e) { return false; }
        call('world.approachTarget');
        return true;
      }
      return false;
    },
    // attackMonsterName / attackMonsterID do Skua
    Attack: async function (q) {
      if (Combat.StopAttacking) { await Combat.CancelTarget(); return false; }
      var m = typeof q === 'number' ? Monsters._byId(q) : (Monsters.CurrentMonsters.filter(function (x) { return Monsters._match(x, q) && get('world.monsters.' + x.Index + '.pMC.x') !== null; })[0] || null);
      return Combat._attackTarget(m);
    },
    AttackPlayer: function (name) { Logs.add('debug', 'AttackPlayer não suportado neste cliente (' + name + ')'); return false; },
    UntargetSelf: function () { if (get('world.myAvatar.target') !== null && get('world.myAvatar.target.isMyAvatar') === true) return call('world.cancelTarget'); },
    CancelTarget: async function () { call('world.cancelTarget'); if (Options.SafeTimings) await Wait.ForMonsterDeath(); },
    CancelAutoAttack: function () { return call('world.cancelAutoAttack'); },
    Approach: function () { return call('world.approachTarget'); },
    Exit: async function () {
      if (Player.State === 1) return;
      Combat.CancelAutoAttack();
      await Combat.CancelTarget();
      await Map.Jump(Player.Cell, Player.Pad);
      await sleep(300);
      await Map.Jump(Player.Cell, Player.Pad);
      await Wait.ForCombatExit();
    }
  };
  // Skua: ScriptCombat reage a PlayerDeath / CounterAttack / fim do script
  function hookCombat() {
    Events.On('PlayerDeath', function () { Combat.StopAttacking = false; });
    Events.On('CounterAttack', function (faded) {
      if (faded) {
        Combat.StopAttacking = false;
        if (Combat._target !== null) Combat.Attack(Combat._target);
        Combat._target = null; return;
      }
      Combat.StopAttacking = true;
      var mid = get('world.myAvatar.target.objData.MonMapID'); Combat._target = mid === null ? get('world.myAvatar.target.dataLeaf.MonMapID') : mid;
      if (Combat._target === null) Combat._target = null;
      Combat.CancelAutoAttack(); Combat.CancelTarget();
    });
  }
  hookCombat();
  function hookSkills() { Events.On('CounterAttack', function (faded) { if (faded) Skills._ca = true; }); }
  hookSkills();
  var oldRehook = W.SkuaWaitRehook; W.SkuaWaitRehook = function () { oldRehook(); hookCombat(); hookSkills(); };

  // ---------------- skills (Advanced Skills do Skua) ----------------
  var Skills = {
    _timer: null, _cmd: null, _idx: 0, active: false, timeout: 250, useMode: 'UseIfAvailable',
    SkillInfo: function (i) {
      return snap('world.actions.active.' + i, ['ts', 'cd', 'mp', 'auto', 'isOK', 'OldCD', 'skillLock', 'lock', 'nam', 'icon', 'range']);
    },
    CanUse: function (i) {
      var s = Skills.SkillInfo(i);
      var hp = get('world.myAvatar.target.dataLeaf.intHP');
      if (get('world.myAvatar.target') === null || !(hp > 0 || hp === null)) return false;
      if (s.auto) { if (get('world.autoActionTimer.running') === true) return false; }
      else {
        var now = Date.now(), tha = get('world.myAvatar.dataLeaf.sta.$tha') || 0;
        var haste = 1 - Math.min(Math.max(tha, -1), 0.5);
        if (now - (get('world.GCDTS') || 0) < (get('world.GCD') || 0)) return false;
        var cd = Math.round((s.OldCD != null ? s.OldCD : s.cd) * haste);
        if (now - (s.ts || 0) < cd) return false;
      }
      return s.isOK !== false && (!s.skillLock || !s.lock);
    },
    CanUseSkill: function (i) { return Skills.CanUse(i); },
    Use: function (i) { var k = i <= 9 ? 48 + i : i; try { return W.aqw.cast(String(k)); } catch (e) { return null; } },
    UseSkill: function (i) { return Skills.Use(i); },
    // "3 | 4 S | 1 H<50 | 2 W500" — mesma sintaxe do Skua
    Parse: function (str) {
      var out = [];
      String(str).toLowerCase().split('|').forEach(function (c) {
        c = c.trim(); if (!/^\d/.test(c)) return;
        var n = parseInt(c.charAt(0), 10), rest = c.slice(1).trim(), rules = [];
        var skip = rest.length > 0 && rest.charAt(rest.length - 1) === 's';
        rest.split(/\s+/).filter(Boolean).forEach(function (r) {
          var v = parseInt(r.replace(/[^0-9]/g, ''), 10);
          if (r.indexOf('h') > -1) rules.push({ t: 'h', gt: r.indexOf('>') > -1, v: v, skip: skip });
          else if (r.indexOf('m') > -1) rules.push({ t: 'm', gt: r.indexOf('>') > -1, v: v, skip: skip });
          else if (r.indexOf('w') > -1) rules.push({ t: 'w', v: v, skip: skip });
        });
        out.push({ skill: n, rules: rules });
      });
      return out;
    },
    // ---- ScriptSkill / AdvancedSkillProvider do Skua ----
    SkillInterval: 100, SkillTimeout: -1, SkillUseMode: 'UseIfAvailable', TimerRunning: false,
    _prov: null, _over: null, _base: null, _tok: null, _ca: false,
    _load: function (str) { return { cmds: Skills.Parse(str), i: 0 }; },
    _next: function (p) { var i = p.i, c = p.cmds[i]; p.i = (p.i + 1) >= p.cmds.length ? 0 : p.i + 1; return { index: i, skill: c.skill }; },
    _should: async function (p, idx, can) { // AdvancedSkillCommand.ShouldUse (true / false / null)
      var c = p.cmds[idx];
      if (!p.cmds.length || !c.rules.length) return true;
      var should = true;
      for (var r = 0; r < c.rules.length; r++) {
        var u = c.rules[r];
        if (!Player.Alive) return false;
        if (u.t === 'h') { if (Player.Health === 0 || Player.MaxHealth === 0) should = false; else { var ratio = Math.floor(Player.Health / Player.MaxHealth * 100); should = u.gt ? ratio >= u.v : ratio <= u.v; } }
        else if (u.t === 'm') should = u.gt ? Player.Mana >= u.v : Player.Mana <= u.v;
        else if (u.t === 'w') { if (u.skip && !can) return null; await sleep(u.v); }
        if (u.skip && !should) return null;
        if (!should) break;
      }
      return should;
    },
    LoadAdvanced: function (a, b, c) {
      if (typeof b === 'boolean') { // (className, autoEquip, useMode)
        var cls = String(a);
        var done = function (txt, to, mode) { Skills._over = Skills._load(txt); if (to !== undefined) Skills.SkillTimeout = to; if (mode) Skills.SkillUseMode = mode; };
        if (lc(cls) === 'generic') { done('1 | 2 | 3 | 4', undefined, 'UseIfAvailable'); return; }
        var list = Skills.Library.filter(function (x) { return lc(x.cls) === lc(cls); });
        if (!list.length) { done('1 | 2 | 3 | 4', undefined, 'UseIfAvailable'); return; }
        var e = list.filter(function (x) { return lc(x.mode) === lc(c || 'Base'); })[0] || list[0];
        var num = parseInt(String(e.timeout).replace(/[^0-9]/g, ''), 10);
        var wait = !isNaN(num);
        done(e.skills, wait ? num : 250, wait ? 'WaitForCooldown' : 'UseIfAvailable');
        return;
      }
      Skills.SkillTimeout = b === undefined ? -1 : b; Skills.SkillUseMode = c || 'UseIfAvailable';
      Skills._over = Skills._load(String(a));
    },
    Start: function (seq) {
      if (seq !== undefined && seq !== null && typeof seq !== 'function') {
        Skills.LoadAdvanced(String(seq).split(/[\s,|]+/).filter(Boolean).join(' | '), -1, 'UseIfAvailable');
      }
      if (!Skills._base) Skills._base = Skills._load('1 | 2 | 3 | 4');
      Skills._prov = Skills._over || Skills._base;
      if (Skills.TimerRunning) return;
      Skills.TimerRunning = true; Skills.active = true;
      var tok = Skills._tok = {};
      (async function () {
        try {
          while (Skills._tok === tok) {
            if (Combat.StopAttacking) {
              Skills._ca = false; var t0 = Date.now();
              while (!Skills._ca && Date.now() - t0 < 10000 && Skills._tok === tok) await sleep(50);
              Combat.StopAttacking = false;
            }
            if (Options.AttackWithoutTarget || Player.HasTarget) await Skills._poll(tok);
            await sleep(Skills.SkillInterval);
          }
        } catch (e) { Logs.add('debug', 'skills: ' + e.message); }
        finally { if (Skills._tok === tok || Skills._tok === null) { Skills.TimerRunning = false; Skills.active = false; } }
      })();
    },
    _use: async function (skill, tok) {
      if (Skills.SkillUseMode === 'UseIfAvailable') {
        if ((Options.AttackWithoutTarget || Skills.CanUse(skill)) && !Combat.StopAttacking) Skills.Use(skill);
      } else {
        var ok2 = Options.AttackWithoutTarget;
        if (!ok2 && skill !== -1) {
          var n = 0, to = Skills.SkillTimeout;
          while (!Skills.CanUse(skill)) { if (Skills._tok !== tok || run.stop || (to > 0 && n >= to)) break; await sleep(Skills.SkillInterval); n++; }
          ok2 = Skills.CanUse(skill) && !Combat.StopAttacking && Skills._tok === tok;
        }
        if (ok2) Skills.Use(skill);
      }
    },
    _poll: async function (tok) {
      var p = Skills._prov; if (!p || !p.cmds.length) return;
      var n = Skills._next(p);
      var res = await Skills._should(p, n.index, Skills.CanUse(n.skill));
      if (Skills._tok !== tok) return;
      if (res === true) await Skills._use(n.skill, tok);
      else if (res === null) { var m = Skills._next(p); await Skills._use(m.skill, tok); }
    },
    StartAdvanced: function (str, timeout, mode) {
      Skills.Stop();
      Skills.LoadAdvanced(String(str), timeout === undefined ? -1 : timeout, mode || 'UseIfAvailable');
      if (!Skills._over.cmds.length) { log('skills inválidas: ' + str); return; }
      Skills.Start();
    },
    Stop: function () {
      if (Skills._prov) { Combat.CancelAutoAttack(); call('world.cancelTarget'); Skills._prov.i = 0; }
      Skills._tok = null; Skills.TimerRunning = false; Skills.active = false;
    },
    SetProvider: function () {}, UseBaseProvider: function () { Skills._over = null; },
    Library: [],
    LoadLibrary: function (txt) {
      Skills.Library = String(txt).split(/\r?\n/).map(function (l) {
        var p = l.split(' = '); if (p.length < 4) return null;
        return { mode: p[0].trim(), cls: p[1].trim(), skills: p[2].trim(), timeout: p[3].trim() };
      }).filter(Boolean);
      return Skills.Library;
    },
    UseLibrary: function (cls, mode) {
      if (!Skills.Library.some(function (x) { return lc(x.cls) === lc(cls); })) return false;
      Skills.Stop(); Skills.LoadAdvanced(cls, false, mode); Skills.Start(); return true;
    }
  };

  // ---------------- inventário / banco ----------------
  function itemsAt(path) {
    var out = [], n = get(path + '.length') || 0;
    for (var i = 0; i < n; i++) {
      var p = path + '.' + i;
      out.push({
        ID: get(p + '.ItemID'), CharItemID: get(p + '.CharItemID'), Name: get(p + '.sName'),
        Quantity: get(p + '.iQty') || 0, MaxStack: get(p + '.iStk'), Category: get(p + '.sType'),
        Equipped: !!get(p + '.bEquip'), Upgrade: !!get(p + '.bUpg'), Coins: !!get(p + '.bCoins'),
        Temp: !!get(p + '.bTemp'), Path: p
      });
    }
    return out;
  }
  function find(list, q) { return list.filter(function (i) { return typeof q === 'number' ? i.ID === q : lc(i.Name) === lc(q); })[0]; }
  function qty(list, q) { return list.filter(function (i) { return typeof q === 'number' ? i.ID === q : lc(i.Name) === lc(q); }).reduce(function (s, i) { return s + i.Quantity; }, 0); }
  var Inventory = {
    get Items() { return itemsAt('world.myAvatar.items'); },
    get Slots() { return get('world.myAvatar.objData.iBagSlots'); },
    get UsedSlots() { return get('world.myAvatar.items.length') || 0; },
    get FreeSlots() { return (Inventory.Slots || 0) - Inventory.UsedSlots; },
    Contains: function (q, n) { return qty(Inventory.Items, q) >= (n || 1); },
    GetQuantity: function (q) { return qty(Inventory.Items, q); },
    GetItem: function (q) { return find(Inventory.Items, q); },
    EquipItem: async function (q) {
      var it = find(Inventory.Items, q); if (!it) return false;
      call('world.sendEquipItemRequest', [snap(it.Path)]);
      await sleep(Options.ActionDelay); return true;
    },
    ToBank: async function (q) {
      var it = find(Inventory.Items, q); if (!it) return false;
      call('world.sendBankFromInvRequest', [snap(it.Path)]);
      await sleep(Options.ActionDelay); return true;
    }
  };
  var Bank = {
    get Items() { return itemsAt('world.bankinfo.items'); },
    get Slots() { return get('world.myAvatar.objData.iBankSlots'); },
    get UsedSlots() { return get('world.myAvatar.iBankCount'); },
    Open: function () { return call('world.toggleBank'); },
    Contains: function (q, n) { return qty(Bank.Items, q) >= (n || 1); },
    GetQuantity: function (q) { return qty(Bank.Items, q); },
    ToInventory: async function (q) {
      var it = find(Bank.Items, q); if (!it) return false;
      call('world.sendBankToInvRequest', [snap(it.Path)]);
      await sleep(Options.ActionDelay); return true;
    }
  };
  var TempInv = {
    get Items() { return itemsAt('world.myAvatar.tempitems'); },
    Contains: function (q, n) { return qty(TempInv.Items, q) >= (n || 1); },
    GetQuantity: function (q) { return qty(TempInv.Items, q); }
  };
  var House = { get Items() { return itemsAt('world.myAvatar.houseitems'); } };
  function has(item, n, temp) { return temp ? TempInv.Contains(item, n) : Inventory.Contains(item, n); }

  // ---------------- drops ----------------
  var Drops = {
    Current: [], ToPickup: [], ToPickupIDs: [], RejectElse: false, Interval: 0, _tok: null,
    get CurrentDropInfos() { return Drops.Current; },
    get CurrentDrops() { return Drops.Current.map(function (d) { return String(d.Name).trim(); }); },
    get Enabled() { return Drops._tok !== null; },
    // ScriptDrop.AddDrop: a lista só recebe drops que NÃO foram direto ao inventário
    _onDrop: function (it) {
      var d = { ID: it.ItemID, Name: it.sName, Quantity: it.iQty || 1, Coins: !!it.bCoins, Temp: !!it.bTemp, Upgrade: !!it.bUpg, t: Date.now() };
      var ex = Drops.Current.filter(function (x) { return x.ID === d.ID; })[0];
      if (ex) ex.Quantity += d.Quantity; else Drops.Current.push(d);
      Events.emit('ItemDropped', d, false, 0);
    },
    Remove: function () { // Remove(params nomes|ids) da lista ToPickup; com 1 número também limpa o drop (uso interno)
      var a = [].concat.apply([], [].slice.call(arguments));
      Drops.ToPickup = Drops.ToPickup.filter(function (x) { return a.indexOf(x) < 0; });
      Drops.ToPickupIDs = Drops.ToPickupIDs.filter(function (x) { return a.indexOf(x) < 0; });
    },
    _drop: function (id) { Drops.Current = Drops.Current.filter(function (d) { return d.ID !== id; }); },
    PickupId: function (id) { Send.Packet('%xt%zm%getDrop%' + Map.RoomID + '%' + id + '%'); Drops._drop(id); },
    _pickOne: function (q) {
      var d = Drops.Current.filter(function (x) { return typeof q === 'number' ? x.ID === q : lc(String(x.Name).trim()) === lc(q); })[0];
      if (!d) return false;
      Drops.PickupId(d.ID); return true;
    },
    Pickup: async function () {
      var a = [].concat.apply([], [].slice.call(arguments));
      for (var i = 0; i < a.length; i++) {
        Drops._pickOne(a[i]);
        if (Options.SafeTimings) await Wait.ForPickup(a[i]);
      }
    },
    PickupACItems: function () { return Drops.Pickup.apply(null, Drops.Current.filter(function (d) { return d.Coins; }).map(function (d) { return d.Name; })); },
    PickupAll: async function (skipWait) {
      Drops.Current.slice().forEach(function (d) { Drops._pickOne(d.ID); });
      Drops.Current = [];
      if (Options.SafeTimings && !skipWait) await Wait.ForPickup('*');
    },
    // rejectExcept do Skua: tira da lista (e da tela) tudo que não está na lista
    RejectExcept: async function () {
      var a = [].concat.apply([], [].slice.call(arguments)).map(function (x) { return typeof x === 'number' ? x : lc(x); });
      if (Options.AcceptACDrops) await Drops.PickupACItems();
      Drops.Current = Drops.Current.filter(function (d) { return a.indexOf(lc(d.Name)) > -1 || a.indexOf(d.ID) > -1; });
    },
    RejectAll: async function () { if (Options.AcceptACDrops) await Drops.PickupACItems(); Drops.Current = []; },
    Add: function () { var a = [].concat.apply([], [].slice.call(arguments)); a.forEach(function (x) { var L = typeof x === 'number' ? Drops.ToPickupIDs : Drops.ToPickup; if (L.indexOf(x) < 0) L.push(x); }); },
    Clear: function () { Drops.ToPickup = []; Drops.ToPickupIDs = []; Drops.whitelist = []; },
    Start: function () {
      if (Drops._tok) return;
      var tok = Drops._tok = {};
      (async function () {
        while (Drops._tok === tok) {
          await sleep(1000);
          if (Drops._tok !== tok) break;
          if (!Player.Playing) continue;
          try {
            if (Drops.Interval > 0) await sleep(Drops.Interval);
            if (Options.AcceptAllDrops) { await Drops.PickupAll(); continue; }
            if (Options.AcceptACDrops) await Drops.PickupACItems();
            if (Options.RejectAllDrops) { await Drops.RejectAll(); continue; }
            if (Drops.ToPickupIDs.length) await Drops.Pickup.apply(null, Drops.ToPickupIDs.slice());
            if (Drops.ToPickup.length) await Drops.Pickup.apply(null, Drops.ToPickup.slice());
            if (Drops.RejectElse) await Drops.RejectExcept.apply(null, Drops.ToPickup.slice());
          } catch (e) { if (String(e && e.message) === '__SKUA_STOP__') break; }
        }
      })();
    },
    Stop: function () { Drops._tok = null; },
    StopAsync: async function () { Drops._tok = null; },
    Exists: function (q) { return typeof q === 'number' ? Drops.Current.some(function (d) { return d.ID === q; }) : ((q === '*' && Drops.Current.length > 0) || Drops.CurrentDrops.some(function (n) { return lc(n) === lc(q); })); }
  };
  Events.On('Logout', function () { Drops.Current = []; });

  // ---------------- quests ----------------
  var Quests = {
    get Tree() {
      return keys('world.questTree').map(function (k) {
        return { ID: parseInt(k, 10), Name: get('world.questTree.' + k + '.sName'), Status: get('world.questTree.' + k + '.status'), Slot: get('world.questTree.' + k + '.iSlot'), Value: get('world.questTree.' + k + '.iValue') };
      });
    },
    Load: async function () {
      var ids = [].slice.call(arguments).reduce(function (a, b) { return a.concat(b); }, []);
      if (ids.length < 30) { call('world.showQuests', [ids.join(','), 'q']); return; }
      for (var i = 0; i < ids.length; i += 30) { call('world.showQuests', [ids.slice(i, i + 30).join(','), 'q']); await sleep(Options.ActionDelay); }
    },
    EnsureLoad: async function (id) {
      await Wait.ForTrue(function () { return Quests.Tree.some(function (q) { return q.ID === id; }); }, function () { return Quests.Load(id); }, 20, 1000);
      return Quests.Tree.filter(function (q) { return q.ID === id; })[0];
    },
    IsInProgress: function (id) { return call('world.isQuestInProgress', [id]) === true; },
    Accept: async function (id) {
      if (Options.SafeTimings) await Wait.ForActionCooldown('AcceptQuest');
      call('world.acceptQuest', [id]);
      if (Options.SafeTimings) await Wait.ForQuestAccept(id);
      return Quests.IsInProgress(id);
    },
    EnsureAccept: async function () {
      var ids = [].slice.call(arguments), res = true;
      for (var k = 0; k < ids.length; k++) {
        var id = ids[k];
        for (var i = 0; i < Options.QuestAcceptAndCompleteTries; i++) {
          check(); await Quests.Accept(id);
          if (Quests.IsInProgress(id)) break;
          await sleep(Options.ActionDelay);
        }
        res = res && Quests.IsInProgress(id); await sleep(Options.ActionDelay);
      }
      return res;
    },
    Complete: async function (id, itemId, special) {
      if (Options.ExitCombatBeforeQuest) await Combat.Exit();
      if (Options.SafeTimings) await Wait.ForActionCooldown('TryQuestComplete');
      call('world.tryQuestComplete', [id, itemId === undefined ? -1 : itemId, !!special]);
      if (Options.SafeTimings) await Wait.ForQuestComplete(id);
      return !Quests.IsInProgress(id);
    },
    EnsureComplete: async function (id, itemId, special) {
      for (var i = 0; i < Options.QuestAcceptAndCompleteTries; i++) {
        check(); await Quests.Complete(id, itemId, special);
        if (!Quests.IsInProgress(id)) break;
        await sleep(Options.ActionDelay);
      }
      return !Quests.IsInProgress(id);
    }
  };

  // ---------------- lojas ----------------
  var Shops = {
    get ID() { return get('world.shopinfo.ShopID'); },
    get Name() { return get('world.shopinfo.sName') || ''; },
    get Items() {
      var out = [], n = get('world.shopinfo.items.length') || 0;
      for (var i = 0; i < n; i++) { var p = 'world.shopinfo.items.' + i; out.push({ ID: get(p + '.ItemID'), ShopItemID: get(p + '.ShopItemID'), Name: get(p + '.sName'), Cost: get(p + '.iCost'), Coins: !!get(p + '.bCoins'), Category: get(p + '.sType'), Path: p }); }
      return out;
    },
    Load: async function (id) {
      call('world.sendLoadShopRequest', [id]);
      return Wait.ForTrue(function () { return Shops.ID === id; }, 20, 400);
    },
    _buy: function (it, q) {
      var o = snap(it.Path);
      if (q === undefined || q === -1) call('world.sendBuyItemRequest', [o]);
      else { o.iSel = snap(it.Path); o.iSel.iQty = q; o.iQty = q; o.accept = 1; call('world.sendBuyItemRequestWithQuantity', [o]); }
    },
    BuyItem: async function (name, q) {
      var it = Shops.Items.filter(function (i) { return lc(i.Name) === lc(name); })[0]; if (!it) return false;
      Shops._buy(it, q); await sleep(Options.ActionDelay); return true;
    },
    BuyItemById: async function (id, shopItemId, q) {
      var it = Shops.Items.filter(function (i) { return i.ID === id && (!shopItemId || i.ShopItemID === shopItemId); })[0]; if (!it) return false;
      Shops._buy(it, q); await sleep(Options.ActionDelay); return true;
    },
    SellItem: async function (name) {
      var it = Inventory.GetItem(name); if (!it) return false;
      call('world.sendSellItemRequest', [snap(it.Path)]); await sleep(Options.ActionDelay); return true;
    }
  };

  // ---------------- auras ----------------
  var Auras = {
    _read: function (p) {
      var out = [], n = get(p + '.length') || keys(p).length;
      keys(p).forEach(function (k) { var a = snap(p + '.' + k, ['nam', 'val', 'ts', 'dur', 'passive']); if (a.nam) out.push(a); });
      return out;
    },
    get Player() { return Auras._read('world.myAvatar.dataLeaf.auras'); },
    get Target() { return Player.HasTarget ? Auras._read('world.myAvatar.target.dataLeaf.auras') : []; },
    HasAura: function (n, target) { return (target ? Auras.Target : Auras.Player).some(function (a) { return lc(a.nam) === lc(n); }); }
  };

  // ---------------- kill / hunt ----------------
  var Kill = {
    _saveCell: '', _savePad: '', _item: null, _cts: null,
    _wait: async function (tok) { // WaitMonsterDeathOrCancellation
      while (!(!Player.Playing || !Player.HasTarget) && !(tok && tok.cancelled)) { check(); Combat.UntargetSelf(); await sleep(Math.floor(Wait.WAIT_SLEEP / 5)); }
      Combat.CancelAutoAttack(); await Combat.CancelTarget();
    },
    Monster: async function (q, tok) {
      if (q && typeof q === 'object') q = q.MapID;
      if (Options.SafeTimings) await Wait.ForMonsterSpawn(q);
      if (await Combat.Attack(q)) {
        await sleep(Options.ActionDelay);
        if (!tok) { await Wait.ForMonsterDeath(); return; }
        await Kill._wait(tok);
      }
    },
    ForItem: async function (name, item, qty, temp) {
      if (Array.isArray(name)) name = name.join('|');
      temp = !!temp;
      if (has(item, qty, temp)) return;
      var cell = Player.Cell, pad = Player.Pad, tok = { cancelled: false }, names = String(name).split('|');
      Kill._item = { name: item, quantity: qty, temp: temp };
      var onCell = Events.On('CellChanged', function (map, c) { if (c !== cell) Map.Jump(cell, pad); });
      var onDrop = Events.On('ItemDropped', function (it, added, qNow) {
        if (!it || it.Name !== item) return;
        if (added && !it.Temp && qNow >= qty) { tok.cancelled = true; return; }
        Drops.Pickup(it.Name);
        var q = temp ? TempInv.GetQuantity(it.Name) : Inventory.GetQuantity(it.Name);
        if (q >= qty) tok.cancelled = true;
      });
      try {
        if (name === '*') {
          while (!run.stop && !tok.cancelled) {
            check();
            var list = Monsters.CurrentAvailableMonsters.slice();
            for (var i = 0; i < list.length; i++) { if (tok.cancelled) break; await Kill.Monster(list[i], tok); await sleep(Options.ActionDelay); }
            if (!list.length) await sleep(100);
          }
        } else {
          while (!run.stop && !tok.cancelled) {
            check();
            for (var j = 0; j < names.length; j++) { if (tok.cancelled) break; await Kill.Monster(names[j], tok); await sleep(Options.ActionDelay); }
          }
        }
      } finally { Events.Off('CellChanged', onCell); Events.Off('ItemDropped', onDrop); Kill._item = null; }
    },
    ForItems: async function (name, items, qtys, temp) {
      if (items.length !== qtys.length || (Array.isArray(temp) && items.length !== temp.length)) { log('Item count does not match quantity/temp item count.'); return; }
      for (var i = 0; i < items.length; i++) { check(); await Kill.ForItem(name, items[i], qtys[i], Array.isArray(temp) ? temp[i] : !!temp); }
    },
    Player: async function (name) { Combat.AttackPlayer(name); if (Options.SafeTimings) await Wait.ForMonsterDeath(); }
  };
  var Hunt = {
    Monster: async function (name) {
      var names = String(name).split('|');
      for (var i = 0; i < names.length; i++) {
        var m = Monsters.Find(names[i]).filter(function (x) { return x.HP > 0; })[0];
        if (m) { if (m.Cell !== Player.Cell) await Map.Jump(m.Cell, 'Left'); await Kill.Monster(names[i]); return true; }
      }
      return false;
    },
    ForItem: async function (name, item, n, temp) {
      var names = String(name).split('|');
      while (!run.stop && !has(item, n, temp)) {
        var found = null, fname = null;
        for (var i = 0; i < names.length && !found; i++) { found = Monsters.Find(names[i]).filter(function (x) { return x.HP > 0; })[0]; if (found) fname = names[i]; }
        if (!found) { await sleep(1000); continue; }
        if (found.Cell !== Player.Cell) await Map.Jump(found.Cell, 'Left');
        await Kill.Monster(fname); await sleep(Options.ActionDelay);
        if (Drops.Current.length) await Drops.PickupAll();
      }
    }
  };

  // ---------------- auto (Auto Attack / Auto Hunt) ----------------
  var Auto = {
    on: false, mode: null,
    Attack: async function (cls, mode) {
      if (Auto.on) return; Auto.on = true; Auto.mode = 'attack'; run.stop = false;
      if (cls) Skills.UseLibrary(cls, mode); else Skills.Start('1 2 3 4', 250);
      log('Auto Attack ligado');
      while (Auto.on) {
        try {
          if (Player.Alive && !Player.HasTarget) {
            var m = Monsters.CurrentAvailableMonsters[0];
            if (m) await Combat.Attack(m.MapID);
          }
        } catch (e) {}
        await sleep(350);
      }
    },
    Hunt: async function (cls, mode, name) {
      if (Auto.on) return; Auto.on = true; Auto.mode = 'hunt'; run.stop = false;
      if (cls) Skills.UseLibrary(cls, mode); else Skills.Start('1 2 3 4', 250);
      log('Auto Hunt ligado: ' + (name || '*'));
      while (Auto.on) {
        try {
          if (Player.Alive && !Player.HasTarget) {
            var q = name || '*', ms = Monsters.Find(q).filter(function (x) { return x.HP > 0 && x.State !== 0; });
            if (ms.length) { if (ms[0].Cell !== Player.Cell) await Map.Jump(ms[0].Cell, 'Left'); await Combat.Attack(ms[0].MapID); }
          }
        } catch (e) {}
        await sleep(500);
      }
    },
    Stop: function () { Auto.on = false; Auto.mode = null; Skills.Stop(); log('Auto parado'); }
  };

  // ---------------- raiz ----------------
  var Bot = {
    Options: Options, Send: Send, Packets: Packets, Wait: Wait, Player: Player, Map: Map, Monsters: Monsters,
    Combat: Combat, Skills: Skills, Kill: Kill, Hunt: Hunt, Inventory: Inventory, Bank: Bank, TempInv: TempInv,
    House: House, Drops: Drops, Quests: Quests, Shops: Shops, Auras: Auras, Auto: Auto, Events: Events,
    Stats: Stats, Config: Config, Logs: Logs,
    Sleep: sleep, Log: log, Skip: Skip,
    get ShouldExit() { return run.stop; },
    get Ready() { return ok(); },
    // bridge cru (para o Grabber/Console)
    Get: get, Set: set, Call: call, Keys: keys, Snap: snap
  };

  // ---------------- executor ----------------
  var Runner = {
    running: false, name: '', subs: [],
    sub: function (f) { Runner.subs.push(f); },
    _notify: function () { Runner.subs.forEach(function (f) { try { f(Runner.running); } catch (e) {} }); },
    Start: async function (code, name) {
      if (Runner.running) { log('já existe um script rodando'); return; }
      if (!ok()) { log('Cliente modificado indisponível: ligue "Cliente modificado" em Options > Application, recarregue e entre num mapa'); return; }
      if (Options.AcceptAllDrops || Options.AcceptACDrops || Options.RejectAllDrops) Drops.Start();
      // ScriptManager.StartScriptAsync: Handlers.Clear() ao iniciar; guarda o script para o Auto Relogin reiniciar
      Runner.lastCode = code; Runner.lastName = name || 'script';
      try { if (Bot.Handlers && Bot.Handlers.Clear) Bot.Handlers.Clear(); } catch (e) {}
      run.stop = false; Runner.running = true; Runner.name = name || 'script'; Stats.Reset(); Runner._notify();
      try { W.AqwNative.keepOn(true); } catch (e) {}
      log('▶ "' + Runner.name + '" iniciado');
      try {
        var sl = code.indexOf('/*SKUA:SLOPPY*/') === 0; var fn = new Function('Bot', 'sleep', 'log', 'return (async function(){' + (sl ? '' : '"use strict";') + '\n' + code + '\n})();');
        await fn(Bot, sleep, log);
        log('✔ "' + Runner.name + '" finalizado');
      } catch (e) {
        if (String(e && e.message) === '__SKUA_STOP__') log('■ "' + Runner.name + '" parado');
        else { Runner.err = e; log('✖ ERRO: ' + (e && e.message ? e.message : e)); }
      } finally {
        try { Events.emit('ScriptStopping', Runner.err || null); } catch (e) {} Runner.err = null; Combat.StopAttacking = false; Runner.running = false; Skills.Stop(); Drops.Stop(); Events.Clear();
        // ScriptOption.ScriptStopped: desliga o que o script ligou
        try { Options.AutoRelogin = false; Options.LagKiller = false; Options.AggroAllMonsters = false; Options.AggroMonsters = false; Options.SkipCutscenes = false; } catch (e) {}
        if (!Auto.on) { try { W.AqwNative.keepOn(false); } catch (e) {} }
        Runner._notify();
      }
    },
    Stop: function () { run.stop = true; Skills.Stop(); }
  };

  W.Bot = Bot; W.SkuaRunner = Runner; W.SkuaInternal = { run: run, snap: snap, opt: opt, optDefs: optDefs, check: check, lc: lc, itemsAt: itemsAt, find: find, qty: qty, Logs: Logs, Events: Events };
})();
