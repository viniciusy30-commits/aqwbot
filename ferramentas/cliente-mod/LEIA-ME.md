# Cliente modificado (Game.swf)
Rodar na pasta com o Game original: `python3 patch.py Game4000r8.swf Game4000r8.patched.swf`
Injeta na classe Game as funções aqwGet/aqwSet/aqwCall/aqwKeys/aqwDescribe/aqwPing (registradas via ExternalInterface em Game.onAddedToStage).
`sim.py` valida a lógica num interpretador de mentira. O resultado vai em app/src/main/assets/game-mod.swf.
Se o jogo atualizar, rode de novo com o novo Game e troque o SHA/tamanho em MainActivity.kt (modOrigSha/modOrigSize).
