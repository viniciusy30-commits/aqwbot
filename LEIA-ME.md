# AQW Bot

App Android: abre o AQW numa WebView, carrega o Ruffle (emulador de Flash) e aperta as teclas configuradas em sequência, num intervalo fixo.
Botões: Iniciar, Parar, Testar; a linha de status mostra se o Ruffle carregou e achou o jogo.
Atualização pelo próprio app (Configurações > Verificar atualização), via Releases do GitHub: viniciusy30-commits/aqwbot.

Limites: é um teste de viabilidade. O jogo pode não rodar bem no Ruffle e o bot só aperta teclas (não lê vida/mana/monstros). Automação pode render banimento: use conta descartável.
Não foi compilado aqui (sem Android SDK); o primeiro build no GitHub é a prova final.

## Continuação (13/11/2026)
- Adicionado app/aqwbot.keystore (o build referenciava e não existia; senha aqwbot123, alias aqwbot).
- Removido _incoming/aqwbot-continuacao.zip: era de outro projeto (Masmorras) e sobrescreveria MainActivity/host.html com versões antigas.
- Removido código alheio (com.vinicius.meular: Avatar/Creator/Cute), sem uso no AqwBot.
- Criado assets/novidades.txt do AqwBot (o existente era de outro projeto).
- skua-cs.js: adicionados String.AsSpan/AsMemory (ArmyAllRep e outros quebravam em getRoomNr).
- Testes: 1789/1789 scripts do Scripts-Skua transpilam e passam no parse; amostra de scripts Army roda na simulação sem erro.
- Testes em ferramentas/testes-skua: copie/linke skua*.js dos assets para a pasta e rode `node bulk.js <pasta Scripts-Skua>`.
- Não compilado aqui (sem Android SDK): o primeiro build do GitHub é a prova final.

## Paridade com o Skua (14/11/2026)
Causas de "o bot para no meio e trava" encontradas comparando com o código do Skua e corrigidas:
- **Runtime ausente** (`assets/skua-runtime.js`, novo): equivalente ao timer do `ScriptInterface` do Skua. Aplica as opções (`RestPackets`, `AggroMonsters`, `AggroAllMonsters`, `InfiniteRange`, `SkipCutscenes`, `WalkSpeed`, `LagKiller`, `Magnetise`), força `Lite.UntargetSelf/UntargetDead`, destrava tela de "loading map", detecta "connection lost" e faz o **Auto Relogin** (usuário/senha só em memória, capturados do login do jogo). Handlers com ticks de 20 ms e remoção ao devolver `false`.
- **Sobrecargas do C#** (`CheckInventory`, `KillMonster`, `Join`...): o JS guardava só a última; agora o transpilador gera um despachante que escolhe pela tipagem dos argumentos.
- **Métodos de extensão** (`FormatForCompare`...), `params` recebendo array, handlers de evento ligados ao `this` do script, argumentos nomeados entre arquivos (compilação em 2 passadas), `new StringBuilder(int)` (fazia `FormatForCompare("slime")` virar "5slime" e o bot atacar um monstro inexistente para sempre), LINQ em Dictionary, `Array.*`, `JsonConvert`, `EqualityComparer`, `ClientFileSources` etc.
- **Player/Map iguais ao Skua**: `Playing = LoggedIn && Alive`, `Loaded` (artLoaded), `Rest(full)`, `WalkTo` com espera, `Jump` com `jumpCorrectRoom`, `LastMap`, modelo completo de `Quest` (Requirements/Rewards), padrões das opções (ActionDelay 800, JoinMapTries 3...).
- **Android**: `webView.onPause()` congelava o bot ao sair do app; agora há serviço em primeiro plano + WakeLock/WifiLock enquanto um script roda.
- **Teste sem o jogo**: `ferramentas/testes-skua/sim-game.js` (mundo simulado com tempo virtual) e `simrun.js`:
  `node simrun.js <pasta Scripts-Skua> <script.cs> [segundos] ` (`ERRS=1`, `HOT=1`, `CALLS=1`, `TRACE=Combat.Attack`, `DUMP=arquivo`). Cenários em `cenarios/`.
- Limites conhecidos: o app não consegue clicar "Não" nas caixas de drop (`Drops.RejectExcept` só limpa a lista); funções que dependem da web (`Badges`, `WebClient`) e o FFDec (`FindMapItems`) não existem no celular. Kotlin/AndroidManifest não foram compilados aqui; o primeiro build do GitHub é a prova.
