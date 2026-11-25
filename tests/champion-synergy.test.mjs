import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {activeChampionSynergies, CHAMPION_SYNERGIES, synergyKey} from '../dist/champion-synergy.js';
import {draftSynergies, observedSynergies} from '../dist/draft-synergies.js';
import {compositionProfile} from '../dist/composition.js';
import {createMatchState, objectivePreview, replayMatch, SIMULATION_MODEL} from '../dist/match-sim.js';

const read = name => JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${name}.json`, import.meta.url)));
const champMap = Object.fromEntries(read('champions').map(ch => [ch.id,ch]));
const records = read('draft-meta').records;
const roles = ['TOP','JGL','MID','BOT','SUP'];
const picks = (ids,team) => ids.map((champion,i) => ({champion,role:roles[i],player:team+roles[i],team}));
const blue = picks(['Camille','Vi','Ahri','Lucian','Milio'],'B');
const red = picks(['Gnar','Viego','Viktor','Ashe','Seraphine'],'R');
const input = {blue:'B', red:'R', bluePower:80, redPower:80, roster:[...blue,...red], seed:17,
 compositionBlue:compositionProfile(blue,champMap), compositionRed:compositionProfile(red,champMap)};

test('all observed allied pairs are counted once per team, for historical evidence', () => {
 const observed = observedSynergies(records);
 assert.equal(observed.size,3212);
 assert.equal([...observed.values()].reduce((total,pair)=>total+pair.games,0),records.length*20);
 for (const [a,b,count] of [['Ahri','Vi',23],['Lucian','Milio',75],['Camille','Galio',8],['Ashe','Seraphine',76]]) {
  assert.equal(observed.get(synergyKey(a,b)).games,count);
 }
 assert(CHAMPION_SYNERGIES.every(combo=>combo.champions.every(id=>champMap[id])));
});

test('draft recommendations require a skill interaction and current meta roles, regardless of co-pick count', () => {
 const cup = {records:records.filter(game=>game.event==='LCK_CUP'), patch:'16.1.1'};
 const playoffs = {records:records.filter(game=>game.event==='LCK_PLAYOFFS'), patch:'16.16.1'};
 const opening = draftSynergies(cup);
 assert.equal(opening.games,51);
 assert.equal(opening.patchSample,true);
 assert(opening.rows.length<=12);
 assert(opening.rows.every(row=>row.roles[0]!==row.roles[1]&&row.description));
 assert(opening.rows.some(row=>row.key==='JarvanIV+Rumble'&&row.games===0));
 assert(!opening.rows.some(row=>row.key==='Lucian+Milio'));
 assert(!opening.rows.some(row=>row.key==='Rengar+Ivern'));

 const later = draftSynergies(playoffs);
 for (const key of ['Ahri+Vi','Lucian+Milio','Camille+Galio','Ashe+Seraphine']) {
  assert(later.rows.some(row=>row.key===key),key);
 }
 const focus = draftSynergies(playoffs,{picked:['Milio'],available:id=>id==='Lucian'});
 assert.deepEqual(focus.rows.map(row=>row.key),['Lucian+Milio']);
 const window = draftSynergies({...cup,records:cup.records.slice(0,7)});
 assert.equal(window.sufficient,false);
 assert.deepEqual(window.rows,[]);
 const fallback = draftSynergies({...cup,patch:'16.4.1'});
 assert.equal(fallback.patchSample,false);
 assert.equal(fallback.games,125);
});

test('co-play and wins change the reference counts without changing the recommendation ranking', () => {
 const cup = records.filter(game=>game.event==='LCK_CUP');
 const before = draftSynergies({records:cup,patch:'16.1.1'});
 // Swapping the teams' supported roles preserves pick/ban and role meta, but changes pair records.
 const changed = cup.map(game=>{
  const [blue,red]=game.lineups;
  return {...game,lineups:[[...blue.slice(0,3),...red.slice(3)],[...red.slice(0,3),...blue.slice(3)]]};
 });
 const after = draftSynergies({records:changed,patch:'16.1.1'});
 assert.deepEqual(before.rows.map(row=>row.key),after.rows.map(row=>row.key));
 assert(before.rows.some((row,index)=>row.games!==after.rows[index].games));
});

test('requested synergies activate with both champions and the right fight timing, with a cap on stacking', () => {
 const mid=['TOP','MID','JGL'];
 const midPair=[['Ahri','MID'],['Vi','JGL']];
 assert.equal(activeChampionSynergies(midPair,4,'gank',{roles:mid}).score,0);
 assert(activeChampionSynergies(midPair,10,'gank',{roles:mid}).score>1);
 assert.equal(activeChampionSynergies(midPair,10,'gank',{roles:['JGL','BOT','SUP']}).score,0);
 assert.equal(activeChampionSynergies(midPair,10,'gank',{roles:mid,absent:['Vi']}).score,0);
 const bot=[['Lucian','BOT'],['Milio','SUP']];
 assert(activeChampionSynergies(bot,8,'skirmish').score>activeChampionSynergies(bot,42,'teamfight').score);
 assert(activeChampionSynergies([['Camille','TOP'],['Galio','MID'],['Viego','JGL'],['Varus','BOT'],['Braum','SUP']],30,'teamfight').score>1);
 assert(activeChampionSynergies([['Ashe','BOT'],['Seraphine','SUP']],25,'dragon').score>1);
 const comp=[['Camille','TOP'],['Vi','JGL'],['Galio','MID'],['Yasuo','BOT'],['Rell','SUP']];
 const result=activeChampionSynergies(comp,30,'teamfight');
 assert(result.matches.length>3);
 assert.equal(result.score,2.2);
 assert.deepEqual(activeChampionSynergies([...comp].reverse(),30,'teamfight'),result);
});

test('new match odds and recorded combat use the bonuses, with exact old replay compatibility', () => {
 const current=createMatchState({...input,model:SIMULATION_MODEL},17);
 const legacy=createMatchState({...input,model:'event-v11'},17);
 for(const state of [current,legacy]){
  state.clock=10;
  state.pending={kind:'dragon',minute:10,roles:['JGL','MID','BOT','SUP']};
 }
 assert(objectivePreview(current).fightChance>objectivePreview(legacy).fightChance);
 const before=objectivePreview(current).fightChance;
 current.respawnAt.BJGL=11;
 assert(objectivePreview(current).fightChance<before);
 const old=replayMatch({...input,model:'event-v11'});
 assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),
  'cd162f32593d563b92b2c2a87bd35db85c8f0e08f81485f3de3405656e1a1967');
 const result=replayMatch({...input,model:SIMULATION_MODEL});
 assert.equal(result.model,'event-v12');
 assert(result.events.some(event=>event.championSynergies?.some(combo=>combo.key===synergyKey('Ahri','Vi'))));
 assert(result.events.some(event=>event.championSynergies?.length&&event.text.includes('조합 연계')));
 assert.deepEqual(replayMatch({...input,model:SIMULATION_MODEL}),result);
});
