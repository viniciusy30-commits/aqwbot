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
