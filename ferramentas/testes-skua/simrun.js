// Roda um script do Scripts-Skua (ou um .cs seu) no jogo simulado e diz se terminou, travou ou deu erro.
//   node simrun.js <pasta Scripts-Skua> <script.cs relativo à pasta, ou caminho> [segundos virtuais] [cenario.js]
// Os arquivos skua*.js são lidos de ../../app/src/main/assets (ou da pasta atual, se existirem).
process.on('unhandledRejection', () => {}); // no WebView é só um aviso no console
const fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2] || '.'), rel = process.argv[3], maxS = +process.argv[4] || 1800;
const scenario = process.argv[5] ? require(path.resolve(process.argv[5])) : {};
const sim = require('./sim-game');
const S = sim.install(global, scenario.opts || {});
const A = fs.existsSync('skua.js') ? '.' : path.join(__dirname, '../../app/src/main/assets');
for (const f of ['skua.js', 'skua-extra.js', 'skua-runtime.js', 'skua-cs.js']) (0, eval)(fs.readFileSync(path.join(A, f), 'utf8'));
if (scenario.setup) scenario.setup(S);
if (process.env.OVL) { const o = global.__ovl; SkuaCS.install(); const o2 = global.__ovl; global.__ovl = function (t, a) { const r = o2(t, a); console.log('OVL', r.f, JSON.stringify(a).slice(0, 120)); return r; }; const inst = SkuaCS.install; SkuaCS.install = function () { inst(); const x = global.__ovl; global.__ovl = function (t, a) { const r = x(t, a); if (process.env.OVL === '1' || r.f.indexOf(process.env.OVL) >= 0) console.log('OVL', r.f, JSON.stringify(a).slice(0, 120)); return r; }; }; }
const hot = {}; // quem mais chama Bot.Sleep / Wait.ForTrue (mostra onde o bot está "girando")
if (process.env.HOT) {
  const wrap = (obj, name, label) => { const f = obj[name]; obj[name] = function () { const st = new Error().stack.split('\n').slice(2, 6).map(l => (l.match(/<anonymous>:(\d+):\d+/) || [])[1] ? 'L' + l.match(/<anonymous>:(\d+):\d+/)[1] + ' ' + (l.match(/at (?:async )?([\w.$]+)/) || [])[1] : '').filter(Boolean).join(' < '); const k = label + ' ' + st; hot[k] = (hot[k] || 0) + 1; return f.apply(this, arguments); }; };
  wrap(Bot, 'Sleep', 'Sleep'); wrap(Bot.Wait, 'ForTrue', 'ForTrue');
}
if (process.env.TRACE) { // imprime as primeiras chamadas de métodos do Bot: TRACE=Combat.Attack,Map.Jump
  process.env.TRACE.split(',').forEach(n => { const [a, b] = n.split('.'); const o = a === 'Bot' ? Bot : Bot[a]; const f = o[b]; let c = 0; o[b] = function () { const r = f.apply(this, arguments); if (c++ < 8) Promise.resolve(r).then(v => console.log('TRACE', n, JSON.stringify([].slice.call(arguments)), '=>', JSON.stringify(v))); return r; }; });
}
const prof = {};
if (process.env.PROF) { const og = aqw.get; aqw.get = function (p) { const st = new Error().stack.split('\n').slice(2, 12).map(l => (l.match(/at (?:async )?(?:Object\.|Proxy\.|get )?([\w.$ ]+?) \(/) || [])[1]).filter(n => n && !/^(get|call|snap|keys|set|itemsAt|ok)$/.test(n)); const k = st.slice(0, 3).join(' < '); prof[k] = (prof[k] || 0) + 1; return og.apply(this, arguments); }; }
const logs = []; SkuaInternal.Logs.sub((ch, l) => { if (ch === 'script' || process.env.DEBUG) logs.push(Math.round((sim.T.now - 1700000000000) / 1000) + 's [' + ch + '] ' + l.m); });
(async () => {
  const file = fs.existsSync(path.join(root, rel)) ? path.join(root, rel) : rel;
  const r = await SkuaCS.compileFull(fs.readFileSync(file, 'utf8'), async p => fs.readFileSync(path.join(root, p), 'utf8'), null, rel);
  if (process.env.DUMP) fs.writeFileSync(process.env.DUMP, r.code);
  const p = SkuaRunner.Start(r.code, rel);
  const res = await sim.run(p, { maxSeconds: maxS });
  console.log('RESULTADO:', res.status, '| tempo virtual', Math.round(res.virtualSeconds) + 's', '| kills', S.S.kills, 'drops', S.S.drops, '| mapa', S.W.strMapName, S.W.strFrame);
  if (res.error) console.log('ERRO:', res.error && res.error.stack);
  console.log('Inventário:', S.W.myAvatar.items.map(i => i.sName + 'x' + i.iQty).join(', '), '| temp:', S.W.myAvatar.tempitems.map(i => i.sName + 'x' + i.iQty).join(', '));
  if (process.env.ERRS) { const e = logs.filter(l => /✖ ERRO/.test(l)).map(l => l.replace(/^\d+s \[script\] /, '')); console.log('ERRS:' + (e[0] || 'nenhum')); }
  if (process.env.HOT) console.log('mais chamados:\n' + Object.entries(hot).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => v + 'x ' + k).join('\n'));
  if (process.env.RATE) console.log('chamadas/s ao jogo: get', Math.round(S.S.gets / res.virtualSeconds), 'set', Math.round(S.S.sets / res.virtualSeconds), 'keys', Math.round(S.S.keysN / res.virtualSeconds), '(gets/s)');
  if (process.env.PROF) console.log('quem chama get:\n' + Object.entries(prof).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => Math.round(v / res.virtualSeconds) + '/s ' + k).join('\n'));
  console.log('skills usadas (índice: vezes):', JSON.stringify(S.S.casts || {}));
  if (process.env.CALLS) console.log('chamadas ao jogo:', JSON.stringify(S.S.calls), '| skills rodando:', Bot.Skills.TimerRunning, '| tem alvo:', Bot.Player.HasTarget, '| celas:', S.W.strFrame, '| estado:', Bot.Player.State);
  const n = +process.env.LINES || 25; console.log('--- últimas linhas do log ---\n' + logs.slice(-n).join('\n'));
  process.exit(res.status === 'done' ? 0 : 2);
})().catch(e => { console.log('FALHA', e.stack); process.exit(1); });
