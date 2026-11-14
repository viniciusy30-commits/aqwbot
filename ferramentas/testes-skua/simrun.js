// Roda um script do Scripts-Skua (ou um .cs seu) no jogo simulado e diz se terminou, travou ou deu erro.
//   node simrun.js <pasta Scripts-Skua> <script.cs relativo à pasta, ou caminho> [segundos virtuais] [cenario.js]
// Os arquivos skua*.js são lidos de ../../app/src/main/assets (ou da pasta atual, se existirem).
const fs = require('fs'), path = require('path');
const root = path.resolve(process.argv[2] || '.'), rel = process.argv[3], maxS = +process.argv[4] || 1800;
const scenario = process.argv[5] ? require(path.resolve(process.argv[5])) : {};
const sim = require('./sim-game');
const S = sim.install(global, scenario.opts || {});
const A = fs.existsSync('skua.js') ? '.' : path.join(__dirname, '../../app/src/main/assets');
for (const f of ['skua.js', 'skua-extra.js', 'skua-runtime.js', 'skua-cs.js']) (0, eval)(fs.readFileSync(path.join(A, f), 'utf8'));
if (scenario.setup) scenario.setup(S);
const hot = {}; // quem mais chama Bot.Sleep / Wait.ForTrue (mostra onde o bot está "girando")
if (process.env.HOT) {
  const wrap = (obj, name, label) => { const f = obj[name]; obj[name] = function () { const st = new Error().stack.split('\n').slice(2, 6).map(l => (l.match(/<anonymous>:(\d+):\d+/) || [])[1] ? 'L' + l.match(/<anonymous>:(\d+):\d+/)[1] + ' ' + (l.match(/at (?:async )?([\w.$]+)/) || [])[1] : '').filter(Boolean).join(' < '); const k = label + ' ' + st; hot[k] = (hot[k] || 0) + 1; return f.apply(this, arguments); }; };
  wrap(Bot, 'Sleep', 'Sleep'); wrap(Bot.Wait, 'ForTrue', 'ForTrue');
}
if (process.env.TRACE) { // imprime as primeiras chamadas de métodos do Bot: TRACE=Combat.Attack,Map.Jump
  process.env.TRACE.split(',').forEach(n => { const [a, b] = n.split('.'); const o = a === 'Bot' ? Bot : Bot[a]; const f = o[b]; let c = 0; o[b] = function () { const r = f.apply(this, arguments); if (c++ < 8) Promise.resolve(r).then(v => console.log('TRACE', n, JSON.stringify([].slice.call(arguments)), '=>', JSON.stringify(v))); return r; }; });
}
const logs = []; SkuaInternal.Logs.sub((ch, l) => { if (ch === 'script' || process.env.DEBUG) logs.push(Math.round((sim.T.now - 1700000000000) / 1000) + 's [' + ch + '] ' + l.m); });
(async () => {
  const file = fs.existsSync(path.join(root, rel)) ? path.join(root, rel) : rel;
  const r = await SkuaCS.compileFull(fs.readFileSync(file, 'utf8'), async p => fs.readFileSync(path.join(root, p), 'utf8'), null, rel);
  const p = SkuaRunner.Start(r.code, rel);
  const res = await sim.run(p, { maxSeconds: maxS });
  console.log('RESULTADO:', res.status, '| tempo virtual', Math.round(res.virtualSeconds) + 's', '| kills', S.S.kills, 'drops', S.S.drops, '| mapa', S.W.strMapName, S.W.strFrame);
  if (res.error) console.log('ERRO:', res.error && res.error.stack);
  console.log('Inventário:', S.W.myAvatar.items.map(i => i.sName + 'x' + i.iQty).join(', '), '| temp:', S.W.myAvatar.tempitems.map(i => i.sName + 'x' + i.iQty).join(', '));
  if (process.env.ERRS) { const e = logs.filter(l => /✖ ERRO/.test(l)).map(l => l.replace(/^\d+s \[script\] /, '')); console.log('ERRS:' + (e[0] || 'nenhum')); }
  if (process.env.HOT) console.log('mais chamados:\n' + Object.entries(hot).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => v + 'x ' + k).join('\n'));
  if (process.env.CALLS) console.log('chamadas ao jogo:', JSON.stringify(S.S.calls), '| skills rodando:', Bot.Skills.TimerRunning, '| tem alvo:', Bot.Player.HasTarget, '| celas:', S.W.strFrame, '| estado:', Bot.Player.State);
  const n = +process.env.LINES || 25; console.log('--- últimas linhas do log ---\n' + logs.slice(-n).join('\n'));
  process.exit(res.status === 'done' ? 0 : 2);
})().catch(e => { console.log('FALHA', e.stack); process.exit(1); });
