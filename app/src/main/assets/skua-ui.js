/* skua-ui.js — interface do Skua para celular (menu superior, Jump, Auto e janela do Bot com gaveta). */
(function () {
  'use strict';
  var D = document, W = window;
  function $(i) { return D.getElementById(i); }
  function h(tag, props) {
    var e = D.createElement(tag), kids = [].slice.call(arguments, 2);
    for (var k in (props || {})) {
      var v = props[k];
      if (k === 'class') e.className = v;
      else if (k === 'style') e.style.cssText = v;
      else if (k.slice(0, 2) === 'on') e[k] = v;
      else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'selected') e[k] = v;
      else e.setAttribute(k, v);
    }
    (function add(a) { a.forEach(function (c) { if (Array.isArray(c)) add(c); else if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : D.createTextNode(String(c))); }); })(kids);
    return e;
  }
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) {} return null; }
  function jget(k, d) { try { var v = JSON.parse(ls(k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } }
  function jset(k, v) { ls(k, JSON.stringify(v)); }
  function esc(s) { return String(s === null || s === undefined ? '' : s); }
  function toast(m) { var t = $('toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(function () { t.classList.remove('on'); }, 2200); }
  function fmtT(ms) { var s = Math.floor(ms / 1000), hh = Math.floor(s / 3600), mm = Math.floor(s % 3600 / 60); return (hh ? hh + 'h ' : '') + mm + 'm ' + (s % 60) + 's'; }
  function need() { if (!W.Bot || !W.Bot.Ready) { toast('Cliente modificado indisponível: ligue em Options › Application e entre num mapa'); return false; } return true; }
  function dl(name, text) { try { W.AqwNative.saveText(name, text); toast('Salvo: ' + name + ' (Exportar arquivos do jogo)'); } catch (e) { toast('Não foi possível salvar'); } }

  // ---------- tema ----------
  var THEMES = { 'BlueGrey': '#607D8B', 'Indigo': '#3F51B5', 'Teal': '#009688', 'DeepPurple': '#673AB7', 'Green': '#4CAF50', 'Amber': '#FFA000', 'Red': '#E53935', 'Pink': '#D81B60' };
  function applyTheme() {
    var t = jget('skua.theme', { primary: 'BlueGrey', dark: true }), r = D.documentElement.style;
    r.setProperty('--pri', THEMES[t.primary] || THEMES.BlueGrey);
    D.body.classList.toggle('light', !t.dark);
  }

  // ---------- CSS ----------
  D.head.append(h('style', {}, `
:root{--pri:#607D8B;--acc:#F44336;--bg:#303030;--card:#424242;--card2:#383838;--txt:#fff;--mut:#bdbdbd;--line:#5a5a5a;--ok:#66BB6A}
body.light{--bg:#fafafa;--card:#fff;--card2:#eee;--txt:#212121;--mut:#616161;--line:#ccc}
html,body{background:var(--bg);color:var(--txt);font:14px Roboto,system-ui,sans-serif}
body{display:flex;flex-direction:column;position:relative}
.chrome{flex:none}
#topbar{display:flex;align-items:center;background:var(--pri);color:#fff;height:46px;box-shadow:0 2px 4px #0006;z-index:20}
#topbar .ttl{font-weight:600;font-size:17px;margin:0 8px 0 2px}
#menus{display:flex;overflow-x:auto;flex:1;scrollbar-width:none}#menus::-webkit-scrollbar{display:none}
.mb{background:none;border:0;color:#fff;padding:0 11px;height:46px;font:500 13px Roboto,sans-serif;white-space:nowrap;letter-spacing:.4px;text-transform:uppercase}
.mb:active{background:#fff3}.ib{background:none;border:0;color:#fff;width:42px;height:46px;font-size:21px}
#quick{display:flex;gap:6px;align-items:center;padding:5px 6px;background:var(--card2);overflow-x:auto;border-bottom:1px solid var(--line);scrollbar-width:none}
#quick::-webkit-scrollbar{display:none}
#quick select,#quick input,.fld{background:var(--card);color:var(--txt);border:1px solid var(--line);border-radius:4px;padding:6px;font-size:13px}
#quick select{max-width:96px}#quick input{width:70px}
.btn{background:var(--pri);color:#fff;border:0;border-radius:4px;padding:8px 13px;font:500 13px Roboto,sans-serif;text-transform:uppercase;letter-spacing:.4px;white-space:nowrap;box-shadow:0 1px 3px #0005}
.btn:active{filter:brightness(1.25)}.btn.red{background:var(--acc)}.btn.ghost{background:none;color:var(--pri);box-shadow:none;border:1px solid var(--pri)}.btn.sm{padding:5px 9px;font-size:12px}
.btn[disabled]{opacity:.45}
#game{flex:1;min-height:0}
#popup{position:fixed;z-index:60;background:var(--card);color:var(--txt);min-width:170px;border-radius:4px;box-shadow:0 5px 18px #000a;padding:6px 0;display:none}
#popup div{padding:11px 18px;font-size:14px}#popup div:active{background:var(--card2)}
#shade{position:fixed;inset:0;z-index:50;background:#0008;display:none}
#sheet{position:fixed;left:0;right:0;bottom:0;top:46px;z-index:40;background:var(--bg);display:none;flex-direction:column;box-shadow:0 -3px 10px #000a}
#sheet.on{display:flex}
#shead{display:flex;align-items:center;background:var(--pri);color:#fff;height:46px;flex:none}
#shead .t{flex:1;font-size:16px;font-weight:500;padding-left:6px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#sbody{flex:1;overflow:auto;padding:12px;-webkit-overflow-scrolling:touch}
#drawer{position:fixed;top:0;bottom:0;left:0;width:78%;max-width:320px;z-index:70;background:var(--card);transform:translateX(-102%);transition:transform .2s;display:flex;flex-direction:column;box-shadow:3px 0 14px #000a}
#drawer.on{transform:none}
#dlist{overflow:auto;flex:1}#dlist div{padding:13px 22px;font-size:14px}#dlist div.sel{background:var(--pri);color:#fff}#dlist div:active{background:var(--card2)}
#toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:#212121;color:#fff;padding:10px 16px;border-radius:4px;z-index:99;opacity:0;pointer-events:none;transition:opacity .2s;max-width:88%;text-align:center;font-size:13px}
#toast.on{opacity:1}
.card{background:var(--card);border-radius:4px;padding:12px;margin-bottom:10px;box-shadow:0 1px 3px #0005}
.card h3{margin:0 0 8px;font:500 14px Roboto,sans-serif;color:var(--pri);text-transform:uppercase;letter-spacing:.5px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:6px 0}.row>.grow{flex:1;min-width:100px}
.fld{width:100%;box-sizing:border-box}textarea.fld{font:12px monospace;resize:vertical}
.lbl{color:var(--mut);font-size:12px}
.sw{display:flex;justify-content:space-between;align-items:center;padding:9px 2px;border-bottom:1px solid var(--line)}
.sw input{width:42px;height:22px;accent-color:var(--pri)}
.tbl{width:100%;border-collapse:collapse;font-size:12px}.tbl td,.tbl th{padding:6px 5px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
.tbl tr.sel td{background:#607d8b44}
.bar{height:14px;background:var(--card2);border-radius:7px;overflow:hidden;margin:3px 0}.bar i{display:block;height:100%}
.hp i{background:#E53935}.mp i{background:#1E88E5}
pre.log{margin:0;white-space:pre-wrap;word-break:break-word;font:11px monospace;max-height:none}
.log .e{color:#ef9a9a}.log .w{color:#ffe082}
.tabs{display:flex;gap:2px;margin-bottom:8px;overflow-x:auto}.tabs button{flex:none;background:var(--card2);color:var(--txt);border:0;padding:9px 14px;border-bottom:2px solid transparent}
.tabs button.on{border-bottom-color:var(--pri);color:var(--pri)}
.sec{margin:14px 0 4px;color:var(--mut);font-size:12px;text-transform:uppercase}
#stash{display:none}
#sheet #bar,#sheet #adv{display:flex!important;flex-wrap:wrap;background:none;padding:0}
#sheet #bar>*,#sheet #adv>*{margin:3px}
body.fs .chrome,body.fs #sheet{display:none!important}
body.fs #game{position:fixed;inset:0;z-index:5}
`));

  // ---------- estado da UI ----------
  var views = [], cur = 0, timers = [], sheetOpen = false;
  function every(ms, fn) { fn(); timers.push(setInterval(fn, ms)); }
  function clearTimers() { timers.forEach(clearInterval); timers = []; }
  function V(id, title, render) { views.push({ id: id, title: title, render: render }); }
  function vi(id) { for (var i = 0; i < views.length; i++) if (views[i].id === id) return i; return 0; }

  function openView(id) {
    cur = typeof id === 'number' ? id : vi(id);
    clearTimers(); closePop(); closeDrawer();
    var v = views[cur], b = $('sbody');
    $('stitle').textContent = v.title; b.innerHTML = '';
    sheetOpen = true; $('sheet').classList.add('on');
    try { v.render(b); } catch (e) { b.append(h('pre', { class: 'log' }, 'Erro na tela: ' + e.message)); }
    b.scrollTop = 0; renderDrawer();
  }
  function closeSheet() { clearTimers(); sheetOpen = false; $('sheet').classList.remove('on'); closePop(); closeDrawer(); }
  function openDrawer() { $('drawer').classList.add('on'); $('shade').style.display = 'block'; $('shade').onclick = function () { closeDrawer(); closePop(); }; $('dsearch').value = ''; renderDrawer(); }
  function closeDrawer() { $('drawer').classList.remove('on'); if (!$('popup').style.display || $('popup').style.display === 'none') $('shade').style.display = 'none'; }
  function renderDrawer() {
    var q = ($('dsearch').value || '').toLowerCase(), l = $('dlist'); l.innerHTML = '';
    views.forEach(function (v, i) { if (q && v.title.toLowerCase().indexOf(q) < 0) return; l.append(h('div', { class: i === cur && sheetOpen ? 'sel' : '', onclick: function () { openView(i); } }, v.title)); });
  }
  function closePop() { $('popup').style.display = 'none'; if (!$('drawer').classList.contains('on')) $('shade').style.display = 'none'; }
  function pop(anchor, items) {
    var p = $('popup'); p.innerHTML = '';
    items.forEach(function (it) { p.append(h('div', { onclick: function () { closePop(); it[1](); } }, it[0])); });
    var r = anchor.getBoundingClientRect(); p.style.display = 'block';
    p.style.left = Math.max(4, Math.min(r.left, innerWidth - p.offsetWidth - 4)) + 'px'; p.style.top = r.bottom + 'px';
    $('shade').style.display = 'block'; $('shade').onclick = function () { closePop(); closeDrawer(); };
  }
  W.skuaBack = function () {
    if ($('popup').style.display === 'block') { closePop(); return true; }
    if ($('drawer').classList.contains('on')) { closeDrawer(); return true; }
    if (sheetOpen) { closeSheet(); return true; }
    return false;
  };

  // ---------- shell ----------
  function build() {
    var stash = h('div', { id: 'stash' });
    ['bar', 'adv', 'log'].forEach(function (i) { var e = $(i); if (e) stash.append(e); });
    D.body.prepend(h('div', { id: 'toast' }), h('div', { id: 'shade' }), h('div', { id: 'popup' }), stash);

    $('game').classList.add('gamearea');
    var menus = h('div', { id: 'menus' });
    function mbtn(label, act) { var b = h('button', { class: 'mb' }, label); b.onclick = function () { act(b); }; menus.append(b); }
    mbtn('Scripts', function () { openView('scripts'); });
    mbtn('Options ▾', function (b) { pop(b, [['Game', function () { openView('game'); }], ['Application', function () { openView('app'); }], ['CoreBots', function () { openView('corebots'); }], ['Application Themes', function () { openView('themes'); }]]); });
    mbtn('Helpers ▾', function (b) { pop(b, [['Runtime', function () { openView('runtime'); }], ['Fast Travel', function () { openView('travel'); }], ['Current Drops', function () { openView('drops'); }]]); });
    mbtn('Tools ▾', function (b) { pop(b, [['Loader', function () { openView('loader'); }], ['Grabber', function () { openView('grabber'); }], ['Stats', function () { openView('stats'); }], ['Console', function () { openView('console'); }]]); });
    mbtn('Skills', function () { openView('skills'); });
    mbtn('Packets ▾', function (b) { pop(b, [['Spammer', function () { openView('spammer'); }], ['Logger', function () { openView('logger'); }]]); });
    mbtn('Bank', function () { if (need()) W.Bot.Bank.Open(); });
    mbtn('Logs', function () { openView('logs'); });
    mbtn('Plugins ▾', function (b) { pop(b, pluginMenu()); });

    D.body.insertBefore(h('div', { id: 'topbar', class: 'chrome' },
      h('button', { class: 'ib', onclick: function () { openDrawer(); } }, '☰'),
      h('span', { class: 'ttl' }, 'Skua'), menus,
      h('button', { class: 'ib', title: 'Tela cheia', onclick: function () { $('fs').click(); } }, '⛶')), $('game'));

    // barra rápida: script, Jump e Auto
    var cell = h('input', { id: 'jcell', placeholder: 'Cell', value: 'Enter' }), pad = h('input', { id: 'jpad', placeholder: 'Pad', value: 'Spawn' });
    var cls = h('select', { id: 'acls' }, h('option', { value: '' }, 'Class...'));
    var mode = h('select', { id: 'amode' }, ['Base', 'Atk', 'Def', 'Farm', 'Solo', 'Supp'].map(function (m) { return h('option', { value: m }, m); }));
    var run = h('button', { class: 'btn', id: 'qrun' }, '▶ Script');
    run.onclick = function () { if (W.SkuaRunner.running) W.SkuaRunner.Stop(); else runCurrentScript(); };
    D.body.insertBefore(h('div', { id: 'quick', class: 'chrome' }, run,
      h('span', { class: 'lbl' }, 'Jump'), cell, pad,
      h('button', { class: 'btn sm', onclick: function () { if (need()) W.Bot.Map.Jump(cell.value || 'Enter', pad.value || 'Spawn'); } }, 'Go'),
      h('span', { class: 'lbl' }, 'Auto'), cls, mode,
      h('button', { class: 'btn sm', onclick: function () { if (need()) W.Bot.Auto.Attack(cls.value, mode.value); } }, 'Attack'),
      h('button', { class: 'btn sm', onclick: function () { if (need()) W.Bot.Auto.Hunt(cls.value, mode.value, ''); } }, 'Hunt'),
      h('button', { class: 'btn sm red', onclick: function () { W.Bot.Auto.Stop(); } }, 'Stop')), $('game'));

    // janela do Bot
    D.body.append(
      h('div', { id: 'sheet' },
        h('div', { id: 'shead' },
          h('button', { class: 'ib', onclick: openDrawer }, '☰'),
          h('button', { class: 'ib', onclick: function () { if (cur > 0) openView(cur - 1); } }, '←'),
          h('button', { class: 'ib', onclick: function () { if (cur < views.length - 1) openView(cur + 1); } }, '→'),
          h('button', { class: 'ib', onclick: function () { openView(0); } }, '⌂'),
          h('div', { class: 't', id: 'stitle' }, ''),
          h('button', { class: 'ib', onclick: closeSheet }, '✕')),
        h('div', { id: 'sbody' })),
      h('div', { id: 'drawer' },
        h('div', { style: 'padding:14px 16px 6px;font-size:18px;font-weight:600;color:var(--pri)' }, 'Skua'),
        h('input', { id: 'dsearch', class: 'fld', placeholder: 'Search', style: 'width:auto;margin:6px 14px', oninput: renderDrawer }),
        h('div', { id: 'dlist' })));
    W.SkuaRunner.sub(function (r) { var b = $('qrun'); b.textContent = r ? '■ Stop' : '▶ Script'; b.classList.toggle('red', r); });
    fetch('skills.txt').then(function (r) { return r.text(); }).then(function (t) {
      var lib = W.Bot.Skills.LoadLibrary(t), seen = {}, sel = $('acls');
      lib.forEach(function (e) { if (!seen[e.cls]) { seen[e.cls] = 1; sel.append(h('option', { value: e.cls }, e.cls)); } });
      (jget('skua.userSkills', [])).forEach(function (e) { W.Bot.Skills.Library.push(e); if (!seen[e.cls]) { seen[e.cls] = 1; sel.append(h('option', { value: e.cls }, e.cls)); } });
    }).catch(function () {});
  }

  // ---------- helpers de UI ----------
  function card(title) { var c = h('div', { class: 'card' }); if (title) c.append(h('h3', {}, title)); for (var i = 1; i < arguments.length; i++) c.append(arguments[i]); return c; }
  function sw(label, checked, on) { var i = h('input', { type: 'checkbox', checked: !!checked }); i.onchange = function () { on(i.checked); }; return h('label', { class: 'sw' }, h('span', {}, label), i); }
  function btn(t, f, cls) { return h('button', { class: 'btn ' + (cls || ''), onclick: f }, t); }
  function tabs(host, names, render) {
    var bar = h('div', { class: 'tabs' }), body = h('div', {}); host.append(bar, body);
    function sel(i) { [].forEach.call(bar.children, function (b, j) { b.classList.toggle('on', i === j); }); clearTimers(); body.innerHTML = ''; render(i, body); }
    names.forEach(function (n, i) { bar.append(h('button', { onclick: function () { sel(i); } }, n)); }); sel(0);
  }

  // ---------- Scripts ----------
  var EX = {
    'Matar monstros (loop)': "// Mata tudo na cela atual, em loop\nBot.Skills.Start('1 2 3 4', 250);\nwhile (!Bot.ShouldExit) {\n  await Bot.Kill.Monster('*');\n  await Bot.Sleep(300);\n}",
    'Farm de item': "// Troque monstro, item e quantidade\nawait Bot.Map.Join('battleon', 'Enter', 'Spawn');\nBot.Skills.Start('1 2 3 4', 250);\nBot.Drops.RejectExcept(['Slime Goo']);\nawait Bot.Kill.ForItem('Slime', 'Slime Goo', 10);\nBot.Log('Feito! Slime Goo: ' + Bot.Inventory.GetQuantity('Slime Goo'));",
    'Missão (aceitar → farm → entregar)': "const Q = 0; // ID da missão\nawait Bot.Quests.EnsureAccept(Q);\nBot.Skills.Start('1 2 3 4', 250);\nawait Bot.Kill.ForItem('*', 'Item da missão', 1);\nawait Bot.Quests.EnsureComplete(Q);\nBot.Log('Missão entregue');",
    'Class do Skua (Advanced Skills)': "// Usa o set de skills da biblioteca do Skua\nBot.Skills.UseLibrary('ArchPaladin', 'Solo');\nwhile (!Bot.ShouldExit) { await Bot.Kill.Monster('*'); }"
  };
  function scriptsStore() { return jget('skua.scripts', { 'Meu script': EX['Matar monstros (loop)'] }); }
  function runCurrentScript() { var s = scriptsStore(), n = ls('skua.curScript') || Object.keys(s)[0]; if (!s[n]) return toast('Nenhum script selecionado'); W.SkuaRunner.Start(s[n], n); }
  V('scripts', 'Scripts', function (b) {
    var st = scriptsStore(), name = ls('skua.curScript'); if (!st[name]) name = Object.keys(st)[0];
    var sel = h('select', { class: 'fld' }), nm = h('input', { class: 'fld', placeholder: 'Nome do script' }), ta = h('textarea', { class: 'fld', rows: 16, spellcheck: 'false' });
    function fill() { sel.innerHTML = ''; Object.keys(st).forEach(function (k) { sel.append(h('option', { value: k, selected: k === name }, k)); }); nm.value = name || ''; ta.value = st[name] || ''; }
    sel.onchange = function () { name = sel.value; ls('skua.curScript', name); nm.value = name; ta.value = st[name]; };
    function save() { var n = nm.value.trim() || 'Sem nome'; if (n !== name && st[name] !== undefined && sel.value === name && false) delete st[name]; st[n] = ta.value; name = n; jset('skua.scripts', st); ls('skua.curScript', n); fill(); toast('Salvo'); }
    var file = h('input', { type: 'file', accept: '.js,.txt,text/plain', style: 'display:none' });
    file.onchange = function () { var f = file.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { nm.value = f.name.replace(/\.[^.]+$/, ''); ta.value = r.result; save(); }; r.readAsText(f); };
    var ex = h('select', { class: 'fld' }, h('option', { value: '' }, 'Exemplos...'), Object.keys(EX).map(function (k) { return h('option', { value: k }, k); }));
    ex.onchange = function () { if (ex.value) { nm.value = ex.value; ta.value = EX[ex.value]; ex.value = ''; } };
    b.append(
      card('Script', h('div', { class: 'row' }, h('div', { class: 'grow' }, sel), btn('Novo', function () { nm.value = 'Novo script'; ta.value = '// escreva seu script\nawait Bot.Sleep(100);'; }, 'ghost sm')),
        h('div', { class: 'row' }, h('div', { class: 'grow' }, nm), h('div', { class: 'grow' }, ex)), ta,
        h('div', { class: 'row' },
          btn('▶ Start', function () { save(); W.SkuaRunner.Start(ta.value, nm.value); }), btn('■ Stop', function () { W.SkuaRunner.Stop(); }, 'red'),
          btn('Salvar', save, 'ghost'), btn('Importar', function () { file.click(); }, 'ghost'),
          btn('Excluir', function () { if (Object.keys(st).length < 2) return toast('Mantenha ao menos um script'); delete st[name]; jset('skua.scripts', st); name = Object.keys(st)[0]; ls('skua.curScript', name); fill(); }, 'ghost'),
          btn('Exportar', function () { dl((nm.value || 'script') + '.js', ta.value); }, 'ghost')), file),
      card('Referência rápida', h('pre', { class: 'log' }, 'Bot.Player  Bot.Map  Bot.Monsters  Bot.Combat  Bot.Kill  Bot.Hunt\nBot.Skills  Bot.Quests  Bot.Shops  Bot.Inventory  Bot.Bank  Bot.TempInv\nBot.Drops  Bot.Wait  Bot.Auras  Bot.Auto  Bot.Events  Bot.Options  Bot.Config\n\nawait Bot.Map.Join("battleon","Enter","Spawn")\nawait Bot.Kill.Monster("Slime")\nawait Bot.Kill.ForItem("Slime","Slime Goo",10)\nawait Bot.Quests.EnsureAccept(123)\nBot.Skills.StartAdvanced("3 | 1 H<50 | 2 W500", 250)\nBot.Events.On("MonsterKilled", id => Bot.Log("morreu "+id))')));
    fill();
  });

  // ---------- Get Scripts ----------
  V('getscripts', 'Get Scripts', function (b) {
    var url = h('input', { class: 'fld', placeholder: 'https://raw.githubusercontent.com/.../script.js' });
    b.append(card('Importar de uma URL (script em JavaScript)', url, h('div', { class: 'row' }, btn('Baixar e salvar', function () {
      if (!url.value) return;
      fetch(url.value).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); }).then(function (t) {
        var st = scriptsStore(), n = decodeURIComponent(url.value.split('/').pop().split('?')[0]).replace(/\.[^.]+$/, '') || 'importado'; st[n] = t; jset('skua.scripts', st); ls('skua.curScript', n); toast('Importado: ' + n);
      }).catch(function (e) { toast('Falhou: ' + e.message); });
    }))), card('Observação', h('div', { class: 'lbl' }, 'Os scripts do Skua original são em C# (.cs) e não rodam aqui. Scripts para este app são JavaScript assíncrono usando o objeto Bot.')));
    b.append(card('Exemplos prontos', Object.keys(EX).map(function (k) {
      return h('div', { class: 'row' }, h('div', { class: 'grow' }, k), btn('Adicionar', function () { var st = scriptsStore(); st[k] = EX[k]; jset('skua.scripts', st); toast('Adicionado'); }, 'sm'));
    })));
  });

  // ---------- Game Options ----------
  V('game', 'Game Options', function (b) {
    var O = W.Bot.Options;
    var grid = card('Opções');
    O.Describe().forEach(function (d) {
      if (d.kind === 'bool') grid.append(sw(d.label, O[d.name], function (v) { O[d.name] = v; }));
      else { var i = h('input', { class: 'fld', style: 'width:110px;text-align:right', value: O[d.name], type: d.kind === 'int' ? 'number' : 'text' }); i.onchange = function () { O[d.name] = d.kind === 'int' ? (parseInt(i.value, 10) || 0) : i.value; }; grid.append(h('div', { class: 'sw' }, h('span', {}, d.label), i)); }
    });
    b.append(h('div', { class: 'row' }, btn('Salvar', function () { O.Save(); toast('Opções salvas'); }), btn('Resetar', function () { O.Reset(); openView('game'); }, 'ghost'), btn('Reload Map', function () { if (need()) W.Bot.Map.Reload(); }, 'ghost')), grid,
      card('Nome (cores)', sw('Upgrade (azul)', false, function (v) { if (need()) W.Bot.Set('world.myAvatar.pMC.pname.ti.textColor', v ? 0x8CD5FF : 0xFFFFFF); }), sw('Staff (dourado)', false, function (v) { if (need()) W.Bot.Set('world.myAvatar.pMC.pname.ti.textColor', v ? 0xFECB38 : 0xFFFFFF); })),
      h('div', { class: 'lbl' }, 'Opções marcadas como Lite (Hide Players, Disable FX) dependem do cliente expor "litePreference"; no Game original podem não ter efeito.'));
  });

  // ---------- Application Options ----------
  V('app', 'Application Options', function (b) {
    b.append(card('Jogo (Ruffle)', $('bar')), card('Atualização do app', h('div', { class: 'row' }, btn('Verificar atualização / Configurações', function () { try { W.AqwNative.openSettings(); } catch (e) { toast('Indisponível'); } }))),
      card('Diagnóstico avançado', h('div', { class: 'lbl' }, 'Leitura de caminhos, dump e captura estão em Diagnostics.'), h('div', { class: 'row' }, btn('Abrir Diagnostics', function () { openView('diag'); }, 'ghost'))));
  });

  // ---------- CoreBots Options (configuração para scripts) ----------
  V('corebots', 'CoreBots Options', function (b) {
    var C = W.Bot.Config, list = h('div', {});
    function draw() {
      list.innerHTML = '';
      Object.keys(C.data).forEach(function (k) {
        var v = C.data[k];
        if (typeof v === 'boolean') list.append(sw(k, v, function (x) { C.Set(k, x); }));
        else { var i = h('input', { class: 'fld', style: 'width:140px', value: v }); i.onchange = function () { C.Set(k, typeof v === 'number' ? (Number(i.value) || 0) : i.value); }; list.append(h('div', { class: 'sw' }, h('span', {}, k), h('span', {}, i, h('button', { class: 'btn sm red', style: 'margin-left:6px', onclick: function () { delete C.data[k]; C.Save(); draw(); } }, '✕')))); }
      });
      if (!Object.keys(C.data).length) list.append(h('div', { class: 'lbl' }, 'Nenhuma opção. Adicione abaixo e leia no script com Bot.Config.Get("chave", padrão).'));
    }
    var k = h('input', { class: 'fld', placeholder: 'chave' }), v = h('input', { class: 'fld', placeholder: 'valor' }), t = h('select', { class: 'fld' }, ['texto', 'número', 'sim/não'].map(function (x) { return h('option', {}, x); }));
    b.append(card('Valores para seus scripts', list), card('Adicionar', h('div', { class: 'row' }, h('div', { class: 'grow' }, k), h('div', { class: 'grow' }, v), t, btn('Adicionar', function () {
      if (!k.value) return; C.Set(k.value, t.value === 'número' ? Number(v.value) || 0 : t.value === 'sim/não' ? /^(1|sim|true|s)$/i.test(v.value) : v.value); k.value = v.value = ''; draw();
    }))));
    draw();
  });

  // ---------- Themes ----------
  V('themes', 'Application Themes', function (b) {
    var t = jget('skua.theme', { primary: 'BlueGrey', dark: true });
    var c = card('Cor primária');
    Object.keys(THEMES).forEach(function (n) { c.append(h('div', { class: 'row' }, h('div', { style: 'width:28px;height:28px;border-radius:50%;background:' + THEMES[n] }), h('div', { class: 'grow' }, n), btn(t.primary === n ? '✔' : 'Usar', function () { t.primary = n; jset('skua.theme', t); applyTheme(); openView('themes'); }, 'sm ' + (t.primary === n ? '' : 'ghost')))); });
    b.append(c, card('Base', sw('Tema escuro', t.dark, function (v) { t.dark = v; jset('skua.theme', t); applyTheme(); })));
  });

  // ---------- Runtime ----------
  V('runtime', 'Runtime', function (b) {
    var el = h('div', {}); b.append(el);
    every(800, function () {
      var B = W.Bot; el.innerHTML = '';
      if (!B.Ready) { el.append(card('', h('div', {}, 'Cliente modificado indisponível. Ligue em Options › Application, recarregue e entre num mapa.'))); return; }
      var P = B.Player, hp = P.MaxHealth ? Math.round(P.Health / P.MaxHealth * 100) : 0, mp = P.MaxMana ? Math.round(P.Mana / P.MaxMana * 100) : 0;
      el.append(card('Jogador', h('div', {}, P.Username + '  •  Lv ' + esc(P.Level) + '  •  ' + esc(P.Gold) + ' gold'),
        h('div', { class: 'lbl' }, 'HP ' + P.Health + '/' + P.MaxHealth), h('div', { class: 'bar hp' }, h('i', { style: 'width:' + hp + '%' })),
        h('div', { class: 'lbl' }, 'MP ' + P.Mana + '/' + P.MaxMana), h('div', { class: 'bar mp' }, h('i', { style: 'width:' + mp + '%' })),
        h('div', { class: 'lbl' }, 'Mapa: ' + B.Map.Name + ' (sala ' + esc(B.Map.RoomID) + ')  •  Cela: ' + P.Cell + '/' + P.Pad + '  •  Jogadores: ' + B.Map.PlayerCount),
        h('div', { class: 'lbl' }, 'Estado: ' + (P.Alive ? (P.InCombat ? 'em combate' : 'vivo') : 'morto') + '  •  Alvo: ' + (P.HasTarget ? 'sim' : 'não'))));
      var ms = B.Monsters.CurrentMonsters; var t = h('table', { class: 'tbl' }, h('tr', {}, h('th', {}, 'Monstro'), h('th', {}, 'HP'), h('th', {}, 'ID')));
      ms.forEach(function (m) { t.append(h('tr', {}, h('td', {}, esc(m.Name)), h('td', {}, esc(m.HP) + '/' + esc(m.MaxHP)), h('td', {}, esc(m.MapID)))); });
      el.append(card('Monstros na cela (' + ms.length + ')', t));
      var sk = h('table', { class: 'tbl' }, h('tr', {}, h('th', {}, '#'), h('th', {}, 'Skill'), h('th', {}, 'Pronta')));
      for (var i = 1; i <= 5; i++) { var s = B.Skills.SkillInfo(i); if (s.nam || s.cd) sk.append(h('tr', {}, h('td', {}, i), h('td', {}, esc(s.nam || '—')), h('td', {}, B.Skills.CanUse(i) ? '✔' : '…'))); }
      el.append(card('Skills', sk));
    });
  });

  // ---------- Fast Travel ----------
  V('travel', 'Fast Travel', function (b) {
    var DEF = [['Battleon', 'battleon', 'Enter', 'Spawn'], ['Yulgar\'s Inn', 'yulgar', 'Enter', 'Spawn'], ['Swordhaven', 'swordhaven', 'Enter', 'Spawn'], ['Dwarfhold', 'dwarfhold', 'Enter', 'Spawn'], ['Shadowfall', 'shadowfall', 'Enter', 'Spawn'], ['Sandsea', 'sandsea', 'Enter', 'Spawn']];
    var list = jget('skua.travel', DEF), host = h('div', {});
    function save() { jset('skua.travel', list); draw(); }
    function draw() {
      host.innerHTML = '';
      list.forEach(function (e, i) { host.append(h('div', { class: 'row' }, h('div', { class: 'grow' }, h('div', {}, e[0]), h('div', { class: 'lbl' }, e[1] + ' / ' + e[2] + ' / ' + e[3])), btn('Go', function () { if (need()) W.Bot.Map.Join(e[1], e[2], e[3]); }, 'sm'), btn('✕', function () { list.splice(i, 1); save(); }, 'sm red'))); });
    }
    var n = h('input', { class: 'fld', placeholder: 'Nome' }), m = h('input', { class: 'fld', placeholder: 'mapa (ex: battleon ou battleon-12345)' }), c = h('input', { class: 'fld', placeholder: 'cela', value: 'Enter' }), p = h('input', { class: 'fld', placeholder: 'pad', value: 'Spawn' });
    b.append(card('Locais', host), card('Adicionar', n, m, h('div', { class: 'row' }, h('div', { class: 'grow' }, c), h('div', { class: 'grow' }, p)), btn('Adicionar', function () { if (!m.value) return; list.push([n.value || m.value, m.value, c.value || 'Enter', p.value || 'Spawn']); n.value = m.value = ''; save(); })), card('', sw('Salas privadas (Private Rooms)', W.Bot.Options.PrivateRooms, function (v) { W.Bot.Options.PrivateRooms = v; })));
    draw();
  });

  // ---------- Current Drops ----------
  V('drops', 'Current Drops', function (b) {
    var O = W.Bot.Options, D2 = W.Bot.Drops, host = h('div', {});
    var wl = h('input', { class: 'fld', placeholder: 'Aceitar só estes (separados por vírgula)', value: D2.whitelist.join(', ') });
    b.append(card('Automático', sw('Accept AC drops', O.AcceptACDrops, function (v) { O.AcceptACDrops = v; }), sw('Accept all drops', O.AcceptAllDrops, function (v) { O.AcceptAllDrops = v; }), sw('Reject all drops', O.RejectAllDrops, function (v) { O.RejectAllDrops = v; }),
      wl, h('div', { class: 'row' }, btn('Aplicar lista', function () { D2.RejectExcept(wl.value.split(',').map(function (x) { return x.trim(); }).filter(Boolean)); toast('Lista aplicada'); }, 'sm'), btn('Limpar', function () { D2.Clear(); wl.value = ''; }, 'sm ghost'))),
      card('Drops atuais', host, h('div', { class: 'row' }, btn('Pegar todos', function () { if (need()) D2.PickupAll(); }))));
    every(900, function () {
      host.innerHTML = '';
      if (!D2.Current.length) host.append(h('div', { class: 'lbl' }, 'Nenhum drop pendente.'));
      D2.Current.forEach(function (d) { host.append(h('div', { class: 'row' }, h('div', { class: 'grow' }, d.Name + ' x' + d.Quantity), btn('Pegar', function () { D2.PickupId(d.ID); }, 'sm'), btn('✕', function () { D2.Remove(d.ID); }, 'sm red'))); });
    });
  });

  // ---------- Loader ----------
  V('loader', 'Loader', function (b) {
    var type = h('select', { class: 'fld' }, ['Shop', 'Hair Shop', 'Quest', 'Armor Customize'].map(function (x) { return h('option', {}, x); })), id = h('input', { class: 'fld', type: 'number', placeholder: 'ID' });
    b.append(card('Carregar', type, id, h('div', { class: 'row' }, btn('Load', function () {
      if (!need()) return; var B = W.Bot, n = parseInt(id.value, 10);
      if (type.value === 'Shop') B.Shops.Load(n); else if (type.value === 'Hair Shop') B.Call('world.sendLoadHairShopRequest', [n]);
      else if (type.value === 'Quest') B.Quests.Load(n); else B.Call('openArmorCustomize');
      toast('Enviado: ' + type.value + ' ' + (n || ''));
    }))), h('div', { class: 'lbl' }, 'Fecha esta janela (✕) para ver a loja/missão aberta no jogo.'));
  });

  // ---------- Grabber ----------
  V('grabber', 'Grabber', function (b) {
    var cats = ['Quests', 'Inventory', 'Temp Inventory', 'Bank', 'Shop', 'Monsters', 'Map Cells'], sel = {}, rows = [], cat = 'Inventory';
    var c = h('select', { class: 'fld' }, cats.map(function (x) { return h('option', { selected: x === cat }, x); })), q = h('input', { class: 'fld', placeholder: 'Filtrar' }), tbl = h('div', {}), act = h('div', { class: 'row' }), cnt = h('div', { class: 'lbl' });
    function grab() {
      if (!need()) return; var B = W.Bot; sel = {};
      rows = cat === 'Quests' ? B.Quests.Tree.map(function (x) { return { k: x.ID, a: x.ID, b: x.Name, c: x.Status }; }) :
        cat === 'Inventory' ? B.Inventory.Items.map(function (x) { return { k: x.Name, a: x.ID, b: x.Name, c: 'x' + x.Quantity + (x.Equipped ? ' ✔' : ''), o: x }; }) :
        cat === 'Temp Inventory' ? B.TempInv.Items.map(function (x) { return { k: x.Name, a: x.ID, b: x.Name, c: 'x' + x.Quantity, o: x }; }) :
        cat === 'Bank' ? B.Bank.Items.map(function (x) { return { k: x.Name, a: x.ID, b: x.Name, c: 'x' + x.Quantity, o: x }; }) :
        cat === 'Shop' ? B.Shops.Items.map(function (x) { return { k: x.Name, a: x.ID, b: x.Name, c: x.Cost + (x.Coins ? ' AC' : 'g'), o: x }; }) :
        cat === 'Monsters' ? B.Monsters.MapMonsters.map(function (x) { return { k: x.Name, a: x.MapID, b: x.Name, c: x.Cell, o: x }; }) :
        B.Map.Cells.map(function (x) { return { k: x, a: '', b: x, c: '' }; });
      draw(); actions();
    }
    function draw() {
      var f = q.value.toLowerCase(), t = h('table', { class: 'tbl' }, h('tr', {}, h('th', {}, ''), h('th', {}, 'ID'), h('th', {}, 'Nome'), h('th', {}, '')));
      var shown = rows.filter(function (r) { return !f || (r.b + ' ' + r.a).toLowerCase().indexOf(f) > -1; });
      shown.forEach(function (r) { var tr = h('tr', { class: sel[r.k] ? 'sel' : '', onclick: function () { sel[r.k] = !sel[r.k]; tr.classList.toggle('sel', !!sel[r.k]); } }, h('td', {}, sel[r.k] ? '☑' : '☐'), h('td', {}, esc(r.a)), h('td', {}, esc(r.b)), h('td', {}, esc(r.c))); t.append(tr); });
      tbl.innerHTML = ''; tbl.append(t); cnt.textContent = shown.length + ' itens';
    }
    function chosen() { return rows.filter(function (r) { return sel[r.k]; }); }
    function actions() {
      var B = W.Bot; act.innerHTML = '';
      function each(fn) { var l = chosen(); if (!l.length) return toast('Selecione linhas'); (async function () { for (var i = 0; i < l.length; i++) { await fn(l[i]); await B.Sleep(B.Options.ActionDelay); } toast('Concluído'); })(); }
      var A = { 'Quests': [['Open', function (r) { B.Quests.Load(r.a); }], ['Accept', function (r) { return B.Quests.Accept(r.a); }]],
        'Inventory': [['Equip', function (r) { return B.Inventory.EquipItem(r.a); }], ['Sell', function (r) { return B.Shops.SellItem(r.a); }], ['To Bank', function (r) { return B.Inventory.ToBank(r.a); }]],
        'Bank': [['To Inventory', function (r) { return B.Bank.ToInventory(r.a); }]],
        'Shop': [['Buy', function (r) { return B.Shops.BuyItemById(r.a, r.o.ShopItemID, 1); }]],
        'Monsters': [['Kill', function (r) { return B.Kill.Monster(r.a); }], ['Teleport To', function (r) { return B.Map.Jump(r.o.Cell, 'Left'); }]] }[cat] || [];
      A.forEach(function (a) { act.append(btn(a[0], function () { each(a[1]); }, 'sm')); });
      act.append(btn('Selecionar tudo', function () { rows.forEach(function (r) { sel[r.k] = true; }); draw(); }, 'sm ghost'), btn('Copiar JSON', function () {
        var txt = JSON.stringify(rows.map(function (r) { return r.o || { id: r.a, name: r.b, info: r.c }; }), null, 1);
        try { navigator.clipboard.writeText(txt); toast('Copiado'); } catch (e) { dl('grabber-' + cat + '.json', txt); }
      }, 'sm ghost'));
    }
    c.onchange = function () { cat = c.value; grab(); }; q.oninput = draw;
    b.append(card('Grabber', c, q, h('div', { class: 'row' }, btn('Grab', grab)), cnt, act), card('', tbl));
    grab();
  });

  // ---------- Stats ----------
  V('stats', 'Stats', function (b) {
    var el = h('div', {}); b.append(el, h('div', { class: 'row' }, btn('Resetar', function () { W.Bot.Stats.Reset(); }, 'red')));
    every(1000, function () {
      var S = W.Bot.Stats, hr = S.Elapsed / 3600000; el.innerHTML = '';
      el.append(card('Sessão', h('table', { class: 'tbl' },
        [['Tempo', S.start ? fmtT(S.Elapsed) : '—'], ['Mortes de monstros', S.Kills + (hr > 0.0005 ? '  (' + Math.round(S.Kills / hr) + '/h)' : '')], ['Drops', S.Drops + (hr > 0.0005 ? '  (' + Math.round(S.Drops / hr) + '/h)' : '')], ['Missões entregues', S.QuestsCompleted], ['Suas mortes', S.Deaths]].map(function (r) { return h('tr', {}, h('td', {}, r[0]), h('td', {}, r[1])); }))));
    });
  });

  // ---------- Console ----------
  V('console', 'Console', function (b) {
    var out = h('pre', { class: 'log' }), inp = h('textarea', { class: 'fld', rows: 3, placeholder: 'Bot.Player.Health   |   await Bot.Map.Join("battleon")', spellcheck: 'false' }), hist = jget('skua.hist', []), hi = hist.length;
    function print(s, c) { out.append(h('div', { class: c || '' }, s)); out.parentNode.parentNode.scrollTop = 1e9; }
    function runIt() {
      var code = inp.value.trim(); if (!code) return; hist.push(code); hist = hist.slice(-40); hi = hist.length; jset('skua.hist', hist); print('> ' + code, 'w'); inp.value = '';
      var wrap = function (c) { return new Function('Bot', 'sleep', 'return (async function(){ return (' + c + '\n); })();'); }, wrap2 = function (c) { return new Function('Bot', 'sleep', 'return (async function(){ ' + c + '\n })();'); }, fn;
      try { fn = wrap(code); } catch (e) { fn = wrap2(code); }
      fn(W.Bot, W.Bot.Sleep).then(function (r) { if (r !== undefined) { var s; try { s = typeof r === 'string' ? r : JSON.stringify(r, null, 1); } catch (e) { s = String(r); } print(s); } }, function (e) { print('ERRO: ' + e.message, 'e'); });
    }
    b.append(card('Console (JavaScript com Bot)', out), card('', inp, h('div', { class: 'row' }, btn('Executar', runIt), btn('↑', function () { if (hi > 0) inp.value = hist[--hi]; }, 'ghost sm'), btn('↓', function () { if (hi < hist.length - 1) inp.value = hist[++hi]; else { hi = hist.length; inp.value = ''; } }, 'ghost sm'), btn('Limpar', function () { out.innerHTML = ''; }, 'ghost sm'))));
  });

  // ---------- Advanced Skills ----------
  V('skills', 'Advanced Skills', function (b) {
    var B = W.Bot, S = B.Skills, q = h('input', { class: 'fld', placeholder: 'Buscar classe' }), host = h('div', {}), cur2 = null;
    var cls = h('input', { class: 'fld', placeholder: 'Classe' }), sk = h('input', { class: 'fld', placeholder: '3 | 4 S | 1 H<50 | 2 W500' }), to = h('input', { class: 'fld', type: 'number', placeholder: 'Timeout ms (vazio = Use if Available)' }), md = h('select', { class: 'fld' }, ['Base', 'Atk', 'Def', 'Farm', 'Solo', 'Supp'].map(function (x) { return h('option', {}, x); }));
    function draw() {
      var f = q.value.toLowerCase(); host.innerHTML = '';
      S.Library.filter(function (e) { return !f || e.cls.toLowerCase().indexOf(f) > -1; }).slice(0, 80).forEach(function (e) {
        host.append(h('div', { class: 'row', onclick: function () { cls.value = e.cls; sk.value = e.skills; to.value = /^use/i.test(e.timeout) ? '' : e.timeout; md.value = e.mode; } }, h('div', { class: 'grow' }, h('div', {}, e.cls + ' [' + e.mode + ']'), h('div', { class: 'lbl' }, e.skills + ' = ' + e.timeout))));
      });
    }
    q.oninput = draw;
    b.append(card('Set atual', cls, md, sk, to, h('div', { class: 'row' },
      btn('Usar', function () { if (!need()) return; S.StartAdvanced(sk.value, parseInt(to.value, 10) || 150, to.value ? 'WaitForCooldown' : 'UseIfAvailable'); toast('Skills ativas'); }),
      btn('Parar', function () { S.Stop(); toast('Skills paradas'); }, 'red'),
      btn('Salvar set', function () { if (!cls.value || !sk.value) return; var u = jget('skua.userSkills', []); var e = { mode: md.value, cls: cls.value, skills: sk.value, timeout: to.value || 'Use if Available' }; u.push(e); jset('skua.userSkills', u); S.Library.push(e); draw(); toast('Salvo'); }, 'ghost'))),
      card('Biblioteca do Skua (' + S.Library.length + ' sets) — toque para carregar', q, host), h('div', { class: 'lbl' }, 'Sintaxe: skill 1–5; "S" no fim = pular se indisponível; H<50 / H>50 vida %; M<30 mana; W500 espera 500 ms.'));
    draw();
  });

  // ---------- Packets ----------
  V('spammer', 'Packet Spammer', function (b) {
    var pk = h('textarea', { class: 'fld', rows: 3, placeholder: '%xt%zm%...%' }), ty = h('select', { class: 'fld' }, ['String', 'Json', 'Xml'].map(function (x) { return h('option', {}, x); })), dl2 = h('input', { class: 'fld', type: 'number', value: 500 }), cnt = h('input', { class: 'fld', type: 'number', placeholder: 'vezes (vazio = infinito)' }), state = h('div', { class: 'lbl' }, 'Parado');
    b.append(card('Enviar ao servidor (sfc.send)', pk, h('div', { class: 'row' }, h('div', { class: 'grow' }, ty), h('div', { class: 'grow' }, dl2), h('div', { class: 'grow' }, cnt)),
      h('div', { class: 'row' }, btn('Enviar 1x', function () { if (need()) W.Bot.Send.Packet(pk.value, ty.value); }),
        btn('Spam', function () { if (!need()) return; W.SkuaInternal.run.stop = false; state.textContent = 'Spam...'; W.Bot.Send.PacketSpam(pk.value, ty.value, parseInt(dl2.value, 10) || 500, parseInt(cnt.value, 10) || 0).then(function () { state.textContent = 'Parado'; }); }, 'ghost'),
        btn('Parar', function () { W.SkuaRunner.Stop(); state.textContent = 'Parado'; }, 'red')), state));
  });
  V('logger', 'Packet Logger', function (b) {
    var P = W.Bot.Packets, out = h('pre', { class: 'log' }), q = h('input', { class: 'fld', placeholder: 'Filtrar (ex: getDrop)' }), last = 0, paused = false;
    try { W.AqwNative.forward(true); } catch (e) {}
    b.append(card('Logger  (>> enviado, << recebido)', q, h('div', { class: 'row' }, btn('Pausar', function (e) { paused = !paused; e.target.textContent = paused ? 'Continuar' : 'Pausar'; }, 'sm ghost'), btn('Limpar', function () { P.log.length = 0; out.innerHTML = ''; last = 0; }, 'sm ghost'),
      btn('Salvar', function () { dl('packets.txt', P.log.map(function (p) { return p.d + ' ' + p.m; }).join('\n')); }, 'sm ghost')), out));
    every(700, function () {
      if (paused) return; var f = q.value.toLowerCase(), cut = P.log.slice(-250);
      out.textContent = cut.filter(function (p) { return !f || p.m.toLowerCase().indexOf(f) > -1; }).map(function (p) { return p.d + ' ' + p.m.slice(0, 500); }).join('\n');
    });
  });

  // ---------- Logs ----------
  V('logs', 'Logs', function (b) {
    var L = W.Bot.Logs; tabs(b, ['Script', 'Debug'], function (i, host) {
      var ch = i === 0 ? 'script' : 'debug', out = h('pre', { class: 'log' }); host.append(h('div', { class: 'row' }, btn('Limpar', function () { L.buf[ch].length = 0; }, 'sm ghost'), btn('Salvar', function () { dl('log-' + ch + '.txt', L.buf[ch].map(function (l) { return new Date(l.t).toLocaleTimeString() + ' ' + l.m; }).join('\n')); }, 'sm ghost')), out);
      every(800, function () { out.textContent = L.buf[ch].slice(-200).map(function (l) { return new Date(l.t).toLocaleTimeString() + '  ' + l.m; }).join('\n'); });
    });
  });

  // ---------- Plugins ----------
  var pluginMenus = [];
  function pluginMenu() { var m = [['View Plugins', function () { openView('plugins'); }]]; pluginMenus.forEach(function (x) { m.push([x[0], x[1]]); }); return m; }
  function loadPlugins() {
    pluginMenus = [];
    jget('skua.plugins', []).forEach(function (p) {
      if (!p.on) return;
      try { new Function('Bot', 'Skua', p.code)(W.Bot, { addMenu: function (t, f) { pluginMenus.push([t, f]); }, toast: toast, open: openView }); } catch (e) { W.Bot.Logs.add('debug', 'plugin ' + p.name + ': ' + e.message); }
    });
  }
  V('plugins', 'Plugins', function (b) {
    var list = jget('skua.plugins', []), host = h('div', {});
    function save() { jset('skua.plugins', list); draw(); }
    function draw() {
      host.innerHTML = ''; if (!list.length) host.append(h('div', { class: 'lbl' }, 'Nenhum plugin instalado.'));
      list.forEach(function (p, i) { host.append(sw(p.name, p.on, function (v) { p.on = v; jset('skua.plugins', list); toast('Reinicie o app para aplicar'); }), h('div', { class: 'row' }, btn('Excluir', function () { list.splice(i, 1); save(); }, 'sm red'))); });
    }
    var nm = h('input', { class: 'fld', placeholder: 'Nome do plugin' }), code = h('textarea', { class: 'fld', rows: 8, spellcheck: 'false', placeholder: "Skua.addMenu('Meu botão', () => Bot.Log('oi'));" });
    b.append(card('Instalados', host), card('Novo plugin (JavaScript)', nm, code, btn('Instalar', function () { if (!nm.value || !code.value) return; list.push({ name: nm.value, code: code.value, on: true }); save(); loadPlugins(); toast('Instalado'); })),
      h('div', { class: 'lbl' }, 'API: Bot (a mesma dos scripts) e Skua.addMenu(texto, função), Skua.toast(msg), Skua.open(idDaTela).'));
  });

  // ---------- Diagnostics ----------
  V('diag', 'Diagnostics', function (b) { b.append(card('Ponte com o jogo', $('adv')), card('Log do app', $('log'))); $('log').style.display = 'block'; });

  // ---------- About ----------
  V('about', 'About', function (b) {
    b.append(card('Skua Mobile', h('div', {}, 'Port em JavaScript do Skua (BotWindow, menu, Jump, Auto, Grabber, Loader, Advanced Skills, Packets) para o launcher AQW.'),
      h('div', { class: 'lbl', style: 'margin-top:8px' }, 'API e lógica baseadas no código do Skua. Funciona sobre a ponte do cliente modificado (aqwGet/aqwSet/aqwCall).'),
      h('div', { class: 'lbl', style: 'margin-top:8px' }, 'Automação pode render banimento: use conta descartável.')));
  });

  // ---------- init ----------
  function init() {
    applyTheme(); build();
    var tries = 0; (function wait() { if (W.Bot) { loadPlugins(); return; } if (tries++ < 50) setTimeout(wait, 100); })();
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', init); else init();
})();
