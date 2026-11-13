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
    On: function (n, f) { (Events.h[n] = Events.h[n] || []).push(f); return f; },
    Off: function (n, f) { Events.h[n] = (Events.h[n] || []).filter(function (x) { return x !== f; }); },
    emit: function (n, d) { (Events.h[n] || []).slice().forEach(function (f) { try { f(d); } catch (e) { Logs.add('debug', 'evento ' + n + ': ' + e.message); } }); },
    Clear: function () { Events.h = {}; }
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
  opt('ActionDelay', 700, null, 'Action Delay (ms)');
  opt('JoinMapTries', 10, null, 'Join Map Tries');
  opt('QuestAcceptAndCompleteTries', 20, null, 'Quest Accept/Complete Tries');
  opt('PrivateRooms', false, null, 'Private Rooms');
  opt('PrivateNumber', -1, null, 'Private Number');
  opt('ExitCombatBeforeQuest', false, null, 'Exit Combat Before Quest');
  opt('AcceptACDrops', false, null, 'Accept AC Drops');
  opt('AcceptAllDrops', false, null, 'Accept All Drops');
  opt('RejectAllDrops', false, null, 'Reject All Drops');
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
  opt('SetFPS', 24, function (v) { set('stage.frameRate', v); }, 'Frame Rate');
  opt('CustomName', '', function (v) { if (v) { set('world.myAvatar.objData.strUsername', v); set('world.myAvatar.pMC.pname.ti.text', v); } }, 'Custom Name');
  opt('CustomGuild', '', function (v) { if (v) set('world.myAvatar.pMC.pname.tg.text', v); }, 'Custom Guild');
  opt('AutoRelogin', false, null, 'Auto Relogin');
  Options.Defaults = function () { var o = {}; Object.keys(optDefs).forEach(function (k) { o[k] = optDefs[k].def; }); return o; };
  Options.Describe = function () { return Object.keys(optDefs).map(function (k) { return { name: k, label: optDefs[k].label, kind: optDefs[k].kind }; }); };
  Options.Save = function () { try { var o = {}; Object.keys(optDefs).forEach(function (k) { o[k] = Options[k]; }); localStorage.setItem('skua.options', JSON.stringify(o)); } catch (e) {} };
  Options.Load = function () { try { var o = JSON.parse(localStorage.getItem('skua.options') || '{}'); Object.keys(o).forEach(function (k) { if (k in optDefs) Options[k] = o[k]; }); } catch (e) {} };
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
        if (dir === '<<') { try { handlePacket(p); } catch (e) { Logs.add('debug', 'pacote: ' + e.message); } }
        if (dir === '<<' && p.charAt(0) === '{' && Events.h.ExtensionPacketReceived && Events.h.ExtensionPacketReceived.length) { try { var pj = JSON.parse(p); if (pj && pj.t === 'xt' && pj.b) Events.emit('ExtensionPacketReceived', { params: { type: 'json', dataObj: pj.b.o } }); } catch (e) {} }
      });
    }
  };
  W.onPacket = function (dir, txt) { Packets.feed(dir, txt); };

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
        Events.emit('MapChanged', o && o.strMapName); break;
      case 'ct':
        var me = lc(Player.Username);
        if (o && o.p && o.p[me] && o.p[me].intHP === 0) { Stats.Deaths++; Events.emit('PlayerDeath'); }
        if (o && o.anims && o.anims[0] && o.anims[0].msg && /prepares a counter attack!/.test(o.anims[0].msg)) Events.emit('CounterAttack', false);
        if (o && o.a) o.a.forEach(function (a) { if (a && a.aura && a.aura.nam === 'Counter Attack') Events.emit('CounterAttack', true); });
        break;
      case 'addGoldExp':
        if (o && o.typ === 'm') { Stats.Kills++; Events.emit('MonsterKilled', o.id); } break;
      case 'ccqr':
        if (o && o.bSuccess === 1) { Stats.QuestsCompleted++; Events.emit('QuestTurnin', o.QuestID); } break;
      case 'dropItem':
        if (o && o.items) {
          var k = Object.keys(o.items)[0], it = o.items[k]; if (!it) return;
          Drops._onDrop(it);
        } break;
      case 'getDrop':
        if (o && o.bSuccess === 1) Stats.Drops += (o.iQty || 1); break;
      case 'addItems':
        if (o && o.items) {
          var id = Object.keys(o.items)[0];
          Events.emit('ItemAdded', { ID: parseInt(id, 10), QtyNow: o.items[id] && o.items[id].iQtyNow });
        } break;
      case 'buyItem': if (o && o.bitSuccess === 1) Events.emit('ItemBought', o.CharItemID); break;
      case 'sellItem': Events.emit('ItemSold', o); break;
      case 'loadShop': Events.emit('ShopLoaded'); break;
      case 'loadBank': Events.emit('BankLoaded'); break;
    }
  }

  // ---------------- espera ----------------
  var Wait = {
    ForTrue: async function (fn, tries, ms) {
      tries = tries || 20; ms = ms || 500;
      for (var i = 0; i < tries; i++) { check(); if (await fn()) return true; await sleep(ms); }
      return false;
    },
    ForMapLoad: function (map, tries) {
      return Wait.ForTrue(function () { return Map.Loaded && (!map || lc(Map.Name) === lc(String(map).split('-')[0])); }, tries || 40, 500);
    },
    ForCellChange: function (cell) { return Wait.ForTrue(function () { return Player.Cell === cell; }, 20, 300); },
    ForMonsterSpawn: function (n) { return Wait.ForTrue(function () { return Monsters.Exists(n); }, 30, 400); },
    ForMonsterDeath: async function () {
      var t0 = Date.now();
      while (Date.now() - t0 < 180000) {
        check();
        if (!Player.HasTarget || !Player.Alive) break;
        await sleep(250);
      }
    },
    ForPlayerDeath: function () { return Wait.ForTrue(function () { return !Player.Alive; }, 120, 500); },
    ForQuestAccept: function (id) { return Wait.ForTrue(function () { return Quests.IsInProgress(id); }, 10, 400); },
    ForQuestComplete: function (id) { return Wait.ForTrue(function () { return !Quests.IsInProgress(id); }, 10, 400); },
    ForCombatExit: function () { return Wait.ForTrue(function () { return !Player.InCombat; }, 30, 400); },
    ForPickup: function (name) { return Wait.ForTrue(function () { return Inventory.Contains(name) || TempInv.Contains(name); }, 15, 300); },
    ForItemEquip: function (name) { return Wait.ForTrue(function () { return Inventory.Items.some(function (i) { return lc(i.Name) === lc(name) && i.Equipped; }); }, 15, 300); }
  };

  // ---------------- jogador ----------------
  var Player = {
    get Playing() { return ok() && get('world.myAvatar') !== null; },
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
    get State() { return get('world.myAvatar.dataLeaf.intState'); },
    get Alive() { var s = Player.State; return s !== null && s !== 0; },
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
    get Loaded() { return (get('world.myAvatar.items.length') || 0) > 0 && !get('world.mapLoadInProgress'); },
    Rest: function () { return call('world.rest'); },
    WalkTo: function (x, y, speed) {
      speed = (speed === undefined || speed === 8) ? (get('world.WALKSPEED') || 8) : speed;
      call('world.myAvatar.pMC.walkTo', [x, y, speed]);
      call('world.moveRequest', [{ mc: null, tx: x, ty: y, sp: speed }]);
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
    get Loaded() { return !get('world.mapLoadInProgress'); },
    get PlayerNames() { return keys('world.uoTree'); },
    get PlayerCount() { return get('world.areaUsers.length') || 0; },
    get Cells() { return keys('world.map.currentScene.labels').length ? snapNames('world.map.currentScene.labels') : []; },
    JoinPacket: function (map, cell, pad) { Send.Packet('%xt%zm%cmd%' + Map.RoomID + '%tfer%' + Player.Username + '%' + map + '%' + (cell || 'Enter') + '%' + (pad || 'Spawn') + '%'); },
    Join: async function (map, cell, pad, ignoreCheck) {
      cell = cell || 'Enter'; pad = pad || 'Spawn';
      var base = String(map).split('-')[0];
      if (!Player.Playing || !Player.Loaded) return;
      if (!ignoreCheck && lc(Map.Name) === lc(map)) return;
      var tries = 0;
      while (lc(Map.Name) !== lc(base) && !run.stop && ++tries < Options.JoinMapTries) {
        var m = map;
        if ((Options.PrivateRooms && String(m).indexOf('-') < 0) || String(m).indexOf('-1e9') >= 0)
          m = base + (Options.PrivateNumber !== -1 ? '-' + Options.PrivateNumber : '-100000');
        Map.JoinPacket(m, cell, pad);
        if (Options.SafeTimings) {
          var okLoad = await Wait.ForMapLoad(m, 20);
          if (!okLoad && !run.stop) await Map.Jump(Player.Cell, Player.Pad);
          else await Map.Jump(cell, pad);
          await sleep(Options.ActionDelay);
        } else await sleep(Options.ActionDelay);
      }
    },
    Jump: async function (cell, pad) {
      pad = pad || 'Spawn';
      call('world.moveToCell', [cell, pad]);
      await sleep(Options.ActionDelay);
      if (Options.SafeTimings) await Wait.ForCellChange(cell);
    },
    Reload: function () { return call('world.reloadCurrentMap'); },
    GetMapItem: async function (id) {
      call('world.getMapItem', [id]);
      if (Options.SafeTimings) await sleep(Options.ActionDelay);
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
    get CurrentAvailableMonsters() { return Monsters.CurrentMonsters.filter(function (m) { return m.HP > 0 && m.State !== 0; }); },
    _match: function (m, q) {
      if (typeof q === 'number') return m.MapID === q;
      var s = lc(q);
      return s === '*' || lc(m.Name).indexOf(s) > -1;
    },
    Find: function (q) { return Monsters.MapMonsters.filter(function (m) { return Monsters._match(m, q); }); },
    Exists: function (q) { return Monsters.CurrentAvailableMonsters.some(function (m) { return Monsters._match(m, q); }); },
    GetHealth: function (q) { var m = Monsters.Find(q)[0]; return m ? m.HP : -1; }
  };

  // ---------------- combate ----------------
  var Combat = {
    Attack: async function (q) {
      var m = Monsters.CurrentAvailableMonsters.filter(function (x) { return Monsters._match(x, q); })[0];
      if (!m) return false;
      try { W.aqw.target(m.Index); } catch (e) { return false; }
      call('world.approachTarget');
      return true;
    },
    AttackPlayer: function (name) { Logs.add('debug', 'AttackPlayer não suportado neste cliente (' + name + ')'); return false; },
    CancelTarget: function () { return call('world.cancelTarget'); },
    CancelAutoAttack: function () { return call('world.cancelAutoAttack'); },
    Approach: function () { return call('world.approachTarget'); },
    Exit: async function () {
      if (!Player.InCombat) return;
      var c = Player.Cell, p = Player.Pad;
      await Map.Jump(c === 'Enter' ? 'Blank' : 'Enter', 'Spawn');
      await Wait.ForCombatExit();
      await Map.Jump(c, p);
    }
  };

  // ---------------- skills (Advanced Skills do Skua) ----------------
  var Skills = {
    _timer: null, _cmd: null, _idx: 0, active: false, timeout: 250, useMode: 'UseIfAvailable',
    SkillInfo: function (i) {
      return snap('world.actions.active.' + i, ['ts', 'cd', 'mp', 'auto', 'isOK', 'OldCD', 'skillLock', 'lock', 'nam', 'icon', 'range']);
    },
    CanUse: function (i) {
      var s = Skills.SkillInfo(i);
      if (!Player.HasTarget) return false;
      if (s.auto) return true;
      var now = Date.now(), tha = get('world.myAvatar.dataLeaf.sta.$tha') || 0;
      var haste = 1 - Math.min(Math.max(tha, -1), 0.5);
      if (now - (get('world.GCDTS') || 0) < (get('world.GCD') || 0)) return false;
      var cd = Math.round((s.OldCD != null ? s.OldCD : s.cd) * haste);
      if (now - (s.ts || 0) < cd) return false;
      if (s.mp > Player.Mana) return false;
      return s.isOK !== false && (!s.skillLock || !s.lock);
    },
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
    StartAdvanced: function (str, timeout, mode) {
      Skills.Stop();
      Skills._cmd = Skills.Parse(str); if (!Skills._cmd.length) { log('skills inválidas: ' + str); return; }
      Skills._idx = 0; Skills.timeout = Math.max(100, timeout || 250); Skills.useMode = mode || 'UseIfAvailable'; Skills.active = true;
      var busy = false;
      Skills._timer = setInterval(async function () {
        if (busy || run.stop && !Auto.on) return; busy = true;
        try {
          if (!Player.Alive || !Player.HasTarget) return;
          var c = Skills._cmd[Skills._idx % Skills._cmd.length], can = Skills.CanUse(c.skill);
          var should = true;
          for (var r = 0; r < c.rules.length; r++) {
            var u = c.rules[r];
            if (u.t === 'h') { var ratio = Player.MaxHealth ? Math.floor(Player.Health / Player.MaxHealth * 100) : 0; should = u.gt ? ratio >= u.v : ratio <= u.v; }
            else if (u.t === 'm') should = u.gt ? Player.Mana >= u.v : Player.Mana <= u.v;
            else if (u.t === 'w') { if (u.skip && !can) { should = null; break; } await sleep(u.v); }
            if (u.skip && !should) { should = null; break; }
            if (!should) break;
          }
          if (should === null) { Skills._idx++; return; }
          if (!should) return;
          if (Skills.useMode === 'WaitForCooldown') { var t0 = Date.now(); while (!Skills.CanUse(c.skill) && Date.now() - t0 < 5000 && Player.HasTarget) await sleep(50); }
          else if (!can) return;
          Skills.Use(c.skill); Skills._idx++;
        } finally { busy = false; }
      }, Skills.timeout);
    },
    Start: function (seq, ms) {
      var s = String(seq || '1 2 3 4').split(/[\s,|]+/).filter(Boolean).join(' | ');
      Skills.StartAdvanced(s, ms || 250, 'UseIfAvailable');
    },
    Stop: function () { if (Skills._timer) clearInterval(Skills._timer); Skills._timer = null; Skills.active = false; },
    Library: [],
    LoadLibrary: function (txt) {
      Skills.Library = String(txt).split(/\r?\n/).map(function (l) {
        var p = l.split(' = '); if (p.length < 4) return null;
        return { mode: p[0].trim(), cls: p[1].trim(), skills: p[2].trim(), timeout: p[3].trim() };
      }).filter(Boolean);
      return Skills.Library;
    },
    UseLibrary: function (cls, mode) {
      var e = Skills.Library.filter(function (x) { return lc(x.cls) === lc(cls) && (!mode || lc(x.mode) === lc(mode)); })[0] ||
              Skills.Library.filter(function (x) { return lc(x.cls) === lc(cls); })[0];
      if (!e) return false;
      var wait = /^use/i.test(e.timeout);
      Skills.StartAdvanced(e.skills, wait ? 150 : parseInt(e.timeout, 10) || 250, wait ? 'UseIfAvailable' : 'WaitForCooldown');
      return true;
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
    Current: [], whitelist: [],
    _onDrop: function (it) {
      var d = { ID: it.ItemID, Name: it.sName, Quantity: it.iQty || 1, Coins: !!it.bCoins, Temp: !!it.bTemp, Upgrade: !!it.bUpg, t: Date.now() };
      Drops.Current.push(d); if (Drops.Current.length > 100) Drops.Current.shift();
      Events.emit('ItemDropped', d);
      if (Options.RejectAllDrops) { Drops.Remove(d.ID); return; }
      var want = Options.AcceptAllDrops || (Options.AcceptACDrops && d.Coins) ||
        (Drops.whitelist.length && Drops.whitelist.indexOf(lc(d.Name)) > -1);
      if (want) setTimeout(function () { Drops.PickupId(d.ID); }, 300);
    },
    Remove: function (id) { Drops.Current = Drops.Current.filter(function (d) { return d.ID !== id; }); },
    PickupId: function (id) { Send.Packet('%xt%zm%getDrop%' + Map.RoomID + '%' + id + '%'); Drops.Remove(id); },
    Pickup: async function (q) {
      var d = Drops.Current.filter(function (x) { return typeof q === 'number' ? x.ID === q : lc(x.Name) === lc(q); })[0];
      if (!d) return false;
      Drops.PickupId(d.ID); await sleep(Options.ActionDelay); return true;
    },
    PickupAll: async function () { var l = Drops.Current.slice(); for (var i = 0; i < l.length; i++) { Drops.PickupId(l[i].ID); await sleep(200); } },
    RejectExcept: function (names) { Drops.whitelist = [].concat(names).map(lc); },
    Clear: function () { Drops.whitelist = []; }
  };

  // ---------------- quests ----------------
  var Quests = {
    get Tree() {
      return keys('world.questTree').map(function (k) {
        return { ID: parseInt(k, 10), Name: get('world.questTree.' + k + '.sName'), Status: get('world.questTree.' + k + '.status'), Slot: get('world.questTree.' + k + '.iSlot'), Value: get('world.questTree.' + k + '.iValue') };
      });
    },
    Load: async function () {
      var ids = [].slice.call(arguments).reduce(function (a, b) { return a.concat(b); }, []);
      for (var i = 0; i < ids.length; i += 30) { Send.Packet('%xt%zm%getQuests%' + (Map.RoomID || 1) + '%' + ids.slice(i, i + 30).join(',') + '%'); if (ids.length > 30) await sleep(Options.ActionDelay); }
    },
    EnsureLoad: async function (id) {
      await Wait.ForTrue(function () { return Quests.Tree.some(function (q) { return q.ID === id; }); }, 20, 1000).then(function (x) { return x; }, function () {});
      return Quests.Tree.filter(function (q) { return q.ID === id; })[0];
    },
    IsInProgress: function (id) { return call('world.isQuestInProgress', [id]) === true; },
    Accept: async function (id) {
      if (Options.SafeTimings) await sleep(300);
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
      if (Options.SafeTimings) await sleep(300);
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
    Monster: async function (q) {
      if (Options.SafeTimings) await Wait.ForMonsterSpawn(q);
      if (await Combat.Attack(q)) {
        await sleep(Options.ActionDelay);
        await Wait.ForMonsterDeath();
      }
    },
    ForItem: async function (name, item, n, temp) {
      if (has(item, n, temp)) return;
      var cell = Player.Cell, pad = Player.Pad, names = String(name).split('|');
      while (!run.stop && !has(item, n, temp)) {
        if (Player.Cell !== cell) await Map.Jump(cell, pad);
        var list = name === '*' ? Monsters.CurrentAvailableMonsters.map(function (m) { return m.MapID; }) : names;
        if (!list.length) { await sleep(500); continue; }
        for (var i = 0; i < list.length; i++) {
          check(); if (has(item, n, temp)) break;
          await Kill.Monster(list[i]);
          await sleep(Options.ActionDelay);
          if (Drops.Current.length) { await Drops.PickupAll(); }
        }
      }
    },
    ForItems: async function (name, items, qtys, temp) {
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
      run.stop = false; Runner.running = true; Runner.name = name || 'script'; Stats.Reset(); Runner._notify();
      try { W.AqwNative.keepOn(true); } catch (e) {}
      log('▶ "' + Runner.name + '" iniciado');
      try {
        var sl = code.indexOf('/*SKUA:SLOPPY*/') === 0; var fn = new Function('Bot', 'sleep', 'log', 'return (async function(){' + (sl ? '' : '"use strict";') + '\n' + code + '\n})();');
        await fn(Bot, sleep, log);
        log('✔ "' + Runner.name + '" finalizado');
      } catch (e) {
        if (String(e && e.message) === '__SKUA_STOP__') log('■ "' + Runner.name + '" parado');
        else log('✖ ERRO: ' + (e && e.message ? e.message : e));
      } finally {
        try { Events.emit('ScriptStopping'); } catch (e) {} Runner.running = false; Skills.Stop(); Events.Clear();
        if (!Auto.on) { try { W.AqwNative.keepOn(false); } catch (e) {} }
        Runner._notify();
      }
    },
    Stop: function () { run.stop = true; Skills.Stop(); }
  };

  W.Bot = Bot; W.SkuaRunner = Runner; W.SkuaInternal = { run: run, snap: snap, opt: opt, optDefs: optDefs, check: check, lc: lc, itemsAt: itemsAt, find: find, qty: qty, Logs: Logs, Events: Events };
})();
