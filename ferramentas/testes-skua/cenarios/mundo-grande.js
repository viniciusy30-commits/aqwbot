// mundo "pesado": 90 itens no inventário, 200 quests carregadas, 40 monstros — mede o custo das consultas ao jogo
module.exports = { setup(S) {
  for (let i = 0; i < 90; i++) S.addItem('Item ' + i, 3, false);
  for (let i = 0; i < 200; i++) S.W.questTree[10000 + i] = { sName: 'Q' + i, status: '', iSlot: -1, iValue: 0, oItems: {}, bUpg: 0 };
  S.W.monsters.push(...Array.from({ length: 40 }, (_, i) => ({ spawn: { name: 'X', drops: {} }, objData: { strMonName: 'X' + i, MonID: 900 + i, MonMapID: 900 + i, strFrame: 'Enter', sRace: 'x' }, dataLeaf: { intHP: 100, intHPMax: 100, intState: 1, strFrame: 'Enter', MonMapID: 900 + i }, pMC: { x: 1 } })));
} };
