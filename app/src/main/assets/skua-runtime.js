/* skua-runtime.js — o que o Skua faz "por baixo" enquanto o bot roda (ScriptInterface + ScriptHandlers + ScriptServers).
 *
 * No Skua original existe uma thread (ScriptInterface.ScriptTimer, 20 ms) que:
 *   - aplica as opções (RestPackets, AggroMonsters, AggroAllMonsters, InfiniteRange, SkipCutscenes, WalkSpeed,
 *     LagKiller, Magnetise) e força Lite.UntargetSelf / Lite.UntargetDead;
 *   - vigia a tela de "loading" (travou? recarrega o mapa; "connection lost"? faz o Auto Relogin);
 *   - roda os Handlers registrados pelo script (RegisterHandler, ticks de 20 ms; devolver false remove).
 * Sem isso os bots "param no meio e travam": ninguém cura o personagem fora de combate, ninguém destrava o loading
 * e ninguém reloga quando a conexão cai. Este arquivo devolve esse comportamento, com os mesmos tempos do Skua.
 */
(function () {
  'use strict';
  var W = window, Bot = W.Bot, I = W.SkuaInternal;
  if (!Bot || !I || W.SkuaRuntimeLoaded) return;
  var get = Bot.Get, set = Bot.Set, call = Bot.Call, keys = Bot.Keys, sleep = Bot.Sleep, lc = I.lc;
  var O = Bot.Options, P = Bot.Player, M = Bot.Map, S = Bot.Send, Ev = Bot.Events, St = Bot.Stats;
  var Runner = W.SkuaRunner;
  function log(m) { I.Logs.add('script', m); }
  function dbg(m) { I.Logs.add('debug', m); }
  function lim(k, ms, fn) { var n = Date.now(); if (lim.t[k] === undefined || n - lim.t[k] >= ms) { lim.t[k] = n; fn(); } }
  lim.t = {};
  function isTrue(v) { return v === true || v === 'true' || v === 1; }

  // ====================================================================================================
  // Handlers (ScriptHandlers): ticks de 20 ms; a função devolvendo false remove o handler
  // ====================================================================================================
  var HS = [], hseq = 0;
  function Handler(name, ticks, fn) { this.Name = name; this.Ticks = ticks; this.Function = fn; this.last = Date.now(); this.busy = false; }
  var Handlers = {
    get CurrentHandlers() { return HS.slice(); },
    RegisterHandler: function (ticks, fn, name) {
      if (typeof ticks === 'function') { var t = ticks; ticks = fn; fn = t; }
      var h = new Handler(name === undefined || name === null ? String(hseq++) : String(name), ticks, function (b) { var r = fn(b); return r === undefined ? true : r; });
      HS.push(h); return h;
    },
    RegisterOnce: function (ticks, fn, name) {
      var h = new Handler(name === undefined || name === null ? String(hseq++) : String(name), ticks, function (b) {
        var r = fn(b); if (r && typeof r.then === 'function') return r.then(function () { return false; }); return false;
      });
      HS.push(h); return h;
    },
    Add: function (h) { HS.push(h); },
    Remove: function (x) {
      if (Array.isArray(x)) { var n = HS.length; HS = HS.filter(function (h) { return x.indexOf(h) < 0; }); return HS.length < n; }
      var before = HS.length;
      HS = HS.filter(function (h) { return typeof x === 'string' ? h.Name !== x : h !== x; });
      return HS.length < before;
    },
    Clear: function () { HS.length = 0; }
  };
  Bot.Handlers = Handlers;
  function runHandlers() {
    if (!HS.length) return;
    var now = Date.now();
    HS.slice().forEach(function (h) {
      if (h.busy || now - h.last < h.Ticks * 20) return;
      h.last = now; h.busy = true;
      var done = function (r) { h.busy = false; if (r === false) Handlers.Remove(h); };
      try {
        var r = h.Function(Bot);
        if (r && typeof r.then === 'function') r.then(done, function (e) { h.busy = false; dbg('handler ' + h.Name + ': ' + (e && e.message)); });
        else done(r);
      } catch (e) { h.busy = false; dbg('handler ' + h.Name + ': ' + e.message); }
    });
  }

  // ====================================================================================================
  // Servers (ScriptServers): logout / login / connectTo — as mesmas funções do jogo que o Skua chama
  // ====================================================================================================
  var Sv = Bot.Servers = Bot.Servers || {};
  var creds = { user: '', pass: '' }, lastUser = '';
  function loginInfo() {
    var cap = W.AqwLoginCapture || {};
    var user = creds.user || cap.user || P.Username || lastUser || '';
    var pass = creds.pass || cap.pass || (get('loginInfo.strPassword') || '');
    return { user: user, pass: pass };
  }
  function srvFrom(path) {
    return {
      Name: get(path + '.sName'), IP: get(path + '.sIP'), Port: get(path + '.iPort'), ChatLevel: get(path + '.iChat') || 0,
      Online: isTrue(get(path + '.bOnline')) || get(path + '.bOnline') === 1, Lang: get(path + '.sLang'),
      PlayerCount: get(path + '.iCount') || 0, Upgrade: isTrue(get(path + '.bUpg')) || get(path + '.bUpg') === 1,
      MaxPlayers: get(path + '.iMax') || 0, Level: get(path + '.iLevel') || 0, _path: path
    };
  }
  function serverList() {
    var n = get('serialCmd.servers.length') || 0, o = [];
    for (var i = 0; i < n; i++) o.push(srvFrom('serialCmd.servers.' + i));
    return o;
  }
  Object.defineProperty(Sv, 'ServerList', { get: serverList, enumerable: true, configurable: true });
  Sv.CachedServers = Sv.CachedServers || [];
  Sv.LastIP = Sv.LastIP || ''; Sv.LastName = Sv.LastName || '';
  Sv.GetServers = async function (force) {
    if (Sv.CachedServers.length > 0 && !force) return Sv.CachedServers;
    try {
      var r = await fetch(location.origin + '/p/game.aq.com/game/api/data/servers');
      var j = await r.json();
      if (Array.isArray(j) && j.length) {
        Sv.CachedServers = j.map(function (x) { return { Name: x.sName, IP: x.sIP, Port: x.iPort, ChatLevel: x.iChat, Online: x.bOnline === '1' || x.bOnline === 1 || x.bOnline === true, Lang: x.sLang, PlayerCount: x.iCount, Upgrade: x.bUpg === '1' || x.bUpg === 1 || x.bUpg === true, MaxPlayers: x.iMax, Level: x.iLevel }; });
        return Sv.CachedServers;
      }
    } catch (e) { dbg('GetServers: ' + e.message); }
    var l = serverList(); if (l.length) Sv.CachedServers = l;
    return Sv.CachedServers;
  };
  Sv.SetLoginInfo = function (u, p) { creds.user = u || ''; creds.pass = p || ''; };
  Sv.Logout = function () { call('logout'); return call('gotoAndPlay', ['Login']); };
  Sv.Login = async function (u, p) {
    var li = loginInfo(); u = u || li.user; p = p || li.pass;
    if (!u || !p) { log('Relogin: sem usuário/senha guardados (entre uma vez pela tela de login do jogo)'); return false; }
    call('login', [u, p]);
    return true;
  };
  function playingAndLoaded() { return P.Playing && get('world') !== null; }
  async function waitReady(tries, ms) {
    for (var i = 0; i < tries && !I.run.stop; i++) { if (playingAndLoaded()) return true; await sleep(ms); }
    return playingAndLoaded();
  }
  // espera a resposta do login (lista de servidores/objLogin) antes de entrar no servidor
  async function waitLoginResponse() {
    for (var i = 0; i < 40; i++) { if (get('objLogin') !== null || (get('serialCmd.servers.length') || 0) > 0) return true; await sleep(250); }
    return false;
  }
  Sv.ConnectIP = async function (ip, port) {
    var list = serverList(), s = list.filter(function (x) { return x.IP === ip && (!port || x.Port === port); })[0];
    if (s) { try { set('objServerInfo', Bot.Snap(s._path)); set('chatF.iChat', s.ChatLevel); } catch (e) {} }
    call('connectTo', port ? [ip, port] : [ip, s ? s.Port : 5588]);
    await waitReady(120, 250);
    return P.Playing;
  };
  Sv.Connect = async function (srv) {
    var s = srv;
    if (typeof srv === 'string') { s = serverList().filter(function (x) { return x.Name === srv; })[0] || serverList().filter(function (x) { return lc(x.Name).indexOf(lc(srv)) > -1; })[0] || Sv.CachedServers.filter(function (x) { return lc(x.Name).indexOf(lc(srv)) > -1; })[0]; }
    if (!s) return false;
    await waitLoginResponse();
    return Sv.ConnectIP(s.IP, s.Port);
  };
  Sv.Reconnect = async function (srv, loginDelay) {
    await Sv.Login(); await sleep(loginDelay === undefined ? 2000 : loginDelay);
    return Sv.Connect(srv);
  };
  Sv.Relogin = async function (srv) {
    var autoRelog = O.AutoRelogin; O.AutoRelogin = false;
    try {
      if (srv === undefined || srv === null) {
        await Sv.GetServers(true);
        var live = serverList();
        srv = O.AutoReloginAny ? (live.filter(function (x) { return x.IP !== Sv.LastIP; })[0] || live[0]) : (Sv.CachedServers.filter(function (x) { return x.Name === O.ReloginServer; })[0] || live[0]);
      }
      Sv.Logout(); St.Relogins = (St.Relogins || 0) + 1;
      await sleep(1000);
      var okLogin = await Sv.Login();
      if (!okLogin) return false;
      await Sv.Connect(srv);
      await waitReady(120, 250);
    } finally { O.AutoRelogin = autoRelog; }
    return P.Playing;
  };
  Sv.ReloginIP = async function (ip) { var s = Sv.CachedServers.filter(function (x) { return x.IP === ip; })[0] || serverList().filter(function (x) { return x.IP === ip; })[0]; return Sv.Relogin(s || { IP: ip, Port: 5588, Name: ip }); };
  // EnsureRelogin(nome) do Skua: tenta até ReloginTries vezes
  Sv.EnsureRelogin = async function (name) {
    var tries = 0;
    await Sv.GetServers(true);
    var target = name || O.ReloginServer || 'Twilly';
    while (!I.run.stop && !P.Playing && ++tries <= O.ReloginTries) {
      var srv = Sv.CachedServers.filter(function (x) { return lc(x.Name) === lc(target); })[0] || serverList().filter(function (x) { return lc(x.Name) === lc(target); })[0] || serverList()[0] || Sv.CachedServers[0];
      if (await Sv.Relogin(srv)) break;
      await sleep(O.ReloginTryDelay);
    }
    return P.Playing;
  };
  addAlias(Sv, 'EnsureReloginAsync', Sv.EnsureRelogin);
  function addAlias(o, n, f) { if (!(n in o)) o[n] = f; }
  Object.defineProperty(P, 'Password', { get: function () { return loginInfo().pass; }, enumerable: true, configurable: true });

  // ====================================================================================================
  // Auto Relogin (ScriptInterface.OnLogout / Relogin)
  // ====================================================================================================
  var relog = { waiting: false };
  async function waitScriptStopped(ms) { var t0 = Date.now(); while (Runner.running && Date.now() - t0 < ms) await sleep(100); return !Runner.running; }
  async function onLogout() {
    if (!O.AutoRelogin || relog.waiting) return;
    relog.waiting = true;
    log('Autorelogin triggered.');
    var wasRunning = Runner.running, code = Runner.lastCode, name = Runner.lastName;
    try {
      if (wasRunning) { Runner.Stop(); await waitScriptStopped(30000); }
      var kicked = P.Kicked;
      Ev.emit('ReloginTriggered', kicked);
      var delay = (!O.SafeRelogin && !kicked) ? O.ReloginTryDelay : 70000;
      Sv.Logout();
      log('Waiting ' + delay + 'ms for relogin.');
      await sleep(delay);
      St.Relogins = (St.Relogins || 0) + 1;
      var okr = await Sv.EnsureRelogin();
      log('Relogin was ' + (okr ? 'successful' : 'cancelled or unsuccessful') + '.');
      if (okr && wasRunning && code) { await sleep(3000); if (!Runner.running) Runner.Start(code, name); }
    } catch (e) { dbg('relogin: ' + e.message); }
    finally { relog.waiting = false; }
  }
  W.SkuaRelogin = { trigger: onLogout, get waiting() { return relog.waiting; } };
  Ev.On('Logout', function () { onLogout(); });
  var oldRehook = W.SkuaWaitRehook;
  W.SkuaWaitRehook = function () { if (oldRehook) oldRehook(); Ev.On('Logout', function () { onLogout(); }); };

  // ====================================================================================================
  // Timer (ScriptInterface.ScriptTimer)
  // ====================================================================================================
  var lastConnChange = Date.now(), lastConnDetail = '', unstickBusy = false;
  function checkOptions() {
    if (O.LagKiller) set('world.visible', false);
    if (!P.Playing) return;
    var L = Bot.Lite || {};
    if (O.Magnetise && get('world.myAvatar.target') !== null) { set('world.myAvatar.target.pMC.x', get('world.myAvatar.pMC.x')); set('world.myAvatar.target.pMC.y', get('world.myAvatar.pMC.y')); }
    if (O.InfiniteRange) for (var i = 0; i < 6; i++) set('world.actions.active.' + i + '.range', 20000);
    if (O.AggroMonsters) call('world.aggroAllMon');
    if (O.AggroAllMonsters) { var ids = Bot.Monsters.MapMonsters.map(function (m) { return m.MapID; }); if (ids.length) S.Packet('%xt%zm%aggroMon%' + M.RoomID + '%' + ids.join('%') + '%'); }
    if (O.SkipCutscenes) Bot.Skip();
    if (O.WalkSpeed !== 8) set('world.WALKSPEED', O.WalkSpeed);
    try { if (!L.UntargetSelf) L.UntargetSelf = true; if (!L.UntargetDead) L.UntargetDead = true; } catch (e) {}
  }
  function connDetail() {
    if (get('mcConnDetail.stage') === null) return 'null';
    var t = get('mcConnDetail.txtDetail.text');
    return t === null || t === undefined ? 'null' : String(t);
  }
  async function unstick(detail) {
    unstickBusy = true;
    try {
      if (detail.indexOf('loading map') > -1) {
        log('Travado em "loading map" há ' + Math.round(O.LoadTimeout / 1000) + 's: recarregando o mapa');
        await M.Join('battleon'); M.Reload();
        await sleep(10000);
        if (get('mcConnDetail.txtDetail.text') === 'loading map') { Sv.Logout(); onLogout(); }
        else if (M.LastMap) await M.Join(M.LastMap);
      } else { log('Travado na tela "' + detail + '": voltando ao login'); Sv.Logout(); onLogout(); }
    } catch (e) { dbg('unstick: ' + e.message); }
    finally { unstickBusy = false; lastConnChange = Date.now(); }
  }
  function checkStuck() {
    var d = connDetail(), now = Date.now();
    if (d === 'null') { lastConnChange = now; lastConnDetail = d; return; }
    if (d.indexOf('has been lost') > -1 && !relog.waiting) onLogout();
    else if (now - lastConnChange >= O.LoadTimeout && d === lastConnDetail && !relog.waiting && !unstickBusy) unstick(d);
    if (d !== lastConnDetail) { lastConnChange = now; lastConnDetail = d; }
  }
  var playing = false;
  function tick() {
    try {
      if (!Bot.Ready) return;
      // "jogando?" custa várias chamadas ao Flash: consulta a cada 250 ms e reaproveita nos outros testes
      lim('play', 250, function () { playing = get('world') !== null && P.Playing; if (playing) { var u = P.Username; if (u) lastUser = u; Sv.LastIP = get('serverIP') || Sv.LastIP; } });
      if (playing) {
        if (O.RestPackets && !P.InCombat) lim('rest', 1200, function () { S.Packet('%xt%zm%restRequest%1%%'); });
        lim('opts', 250, checkOptions);
      }
      lim('conn', 200, checkStuck);
      if (Runner.running) runHandlers();
    } catch (e) { dbg('timer: ' + e.message); }
  }
  var timer = setInterval(tick, 100);
  W.SkuaRuntime = { tick: tick, handlers: Handlers, stop: function () { clearInterval(timer); } };
  W.SkuaRuntimeLoaded = true;
})();
