import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {activeChampionSynergies, CHAMPION_SYNERGIES, synergyKey, synergySpikeLabel} from '../dist/champion-synergy.js';
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

test('all observed allied pairs are counted once per team, with current-event filters and legal pick ordering', () => {
 const observed = observedSynergies(records);
 assert.equal(observed.size,3336);
 assert.equal([...observed.values()].reduce((total,pair)=>total+pair.games,0),records.length*20);
 for (const [a,b,count] of [['Ahri','Vi',23],['Lucian','Milio',85],['Camille','Galio',11],['Ashe','Seraphine',88]]) {
  assert.equal(observed.get(synergyKey(a,b)).games,count);
 }
 const cup = records.filter(game=>game.event==='LCK_CUP');
 const lane = draftSynergies(cup,{champion:'Milio',picked:['Milio'],available:id=>id==='Lucian'});
 assert.equal(lane[0].key,synergyKey('Lucian','Milio'));
 assert.equal(lane[0].games,4);
 assert(lane.slice(1).every(pair=>!pair.playable));
 assert.equal(draftSynergies(cup,{mode:'observed',champion:'Ahri'}).some(pair=>pair.key===synergyKey('Ahri','Vi')),false);
 assert(CHAMPION_SYNERGIES.every(combo=>combo.champions.every(id=>champMap[id])));
});

test('both views require a same-team appearance in the selected event, including one-off and older-patch pairs', () => {
 const cup = records.filter(game=>game.event==='LCK_CUP');
 const road = records.filter(game=>game.event==='LCK_ROAD');
 const cupSkills = draftSynergies(cup);
 assert(cupSkills.every(row=>row.games>0&&row.skill));
 assert(cupSkills.some(row=>row.key==='Orianna+Vi'&&row.games===1));
 assert(!cupSkills.some(row=>row.key==='Ahri+Vi'||row.key==='JarvanIV+Rumble'));
 assert(draftSynergies(road).some(row=>row.key==='Ahri+Vi'&&row.games===1));
 for (const mode of ['skills','observed']) assert.deepEqual(draftSynergies([],{mode}),[]);
 assert.equal(draftSynergies(cup,{mode:'observed'}).length,observedSynergies(cup).size);
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
 assert.equal(result.score,3.3);
 assert.deepEqual(activeChampionSynergies([...comp].reverse(),30,'teamfight'),result);
});

test('each duo gains additional fight odds only during its timing and fight context', () => {
 const cases = [
  { pair:[['Lucian','BOT'],['Milio','SUP']], time:8, late:24, kind:'skirmish', other:'baron', roles:['BOT','SUP','JGL'] },
  { pair:[['Ahri','MID'],['Vi','JGL']], time:12, late:37, kind:'gank', other:'siege', roles },
  { pair:[['Camille','TOP'],['Galio','MID']], time:20, late:40, kind:'teamfight', other:'gank', roles },
  { pair:[['Ashe','BOT'],['Seraphine','SUP']], time:18, late:36, kind:'dragon', other:'siege', roles },
  { pair:[['Jinx','BOT'],['Lulu','SUP']], time:31, late:15, kind:'teamfight', other:'gank', roles }
 ];
 for (const {pair,time,late,kind,other,roles:availableRoles} of cases) {
  const members = [...pair,...availableRoles.filter(r=>!pair.some(([,role])=>role===r)).map(r=>['unknown-'+r,r])];
  const extra = (minute,fight,options={}) =>
   activeChampionSynergies(members,minute,fight,{roles:availableRoles,...options}).score -
   activeChampionSynergies(members,minute,fight,{roles:availableRoles,...options,spikes:false}).score;
  assert(extra(time,kind)>.7,pair);
  assert.equal(extra(late,kind),0);
  assert.equal(extra(time,other),0);
  assert.equal(extra(time,kind,{absent:[pair[0][0]]}),0);
 }
});

test('new match odds and recorded combat use the bonuses, with exact old replay compatibility', () => {
 const current=createMatchState({...input,model:SIMULATION_MODEL},17);
 const legacy=createMatchState({...input,model:'event-v12'},17);
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
 const oldSynergies=replayMatch({...input,model:'event-v12'});
 assert.equal(createHash('sha256').update(JSON.stringify(oldSynergies)).digest('hex'),
  'b3b04d5405c782b643360f3bc079ed84837db849cb962870450b8a8a5ee6f275');
 const result=replayMatch({...input,model:SIMULATION_MODEL});
 assert.equal(result.model,'event-v18');
 assert(result.events.some(event=>event.championSynergies?.some(combo=>combo.key===synergyKey('Ahri','Vi'))));
 assert(result.events.some(event=>event.championSynergies?.some(combo=>combo.powerSpike)&&event.text.includes('강한 구간')));
 assert.deepEqual(replayMatch({...input,model:SIMULATION_MODEL}),result);
});

test('added skill chains have 2026 appearances and improve the intended fights without changing archived replays', () => {
 const observed=observedSynergies(records);
 const added=CHAMPION_SYNERGIES.slice(-20);
 assert(added.every(pair=>observed.has(pair.key)));
 const cup=records.filter(game=>game.event==='LCK_CUP');
 const cupSkills=draftSynergies(cup);
 for(const [key,games,time] of [['Nocturne+Orianna',6,'12~29분'],['Ambessa+Vi',2,'8~26분']]){
  const pair=cupSkills.find(row=>row.key===key);
  assert.equal(pair.games,games);
  assert(synergySpikeLabel(pair.skill).startsWith(time));
 }
 assert(!cupSkills.some(row=>row.key==='Camille+Galio'));
 assert(draftSynergies(records.filter(game=>game.event==='LCK_ROAD')).some(row=>row.key==='Camille+Galio'&&row.games===1));

 const expandedBlue=picks(['Ambessa','Vi','Orianna','Caitlyn','Bard'],'B');
 const expandedRed=picks(['Gnar','Nocturne','Taliyah','Ashe','Seraphine'],'R');
 const expandedInput={...input,roster:[...expandedBlue,...expandedRed],
  compositionBlue:compositionProfile(expandedBlue,champMap),compositionRed:compositionProfile(expandedRed,champMap)};
 const legacy=createMatchState({...expandedInput,model:'event-v13'},17);
 const current=createMatchState({...expandedInput,model:SIMULATION_MODEL},17);
 for (const state of [legacy,current]) {
  state.clock=16;
  state.pending={kind:'dragon',minute:16,roles};
 }
 assert(objectivePreview(current).fightChance>objectivePreview(legacy).fightChance);
 const expandedComp=picks(['Camille','Nocturne','Orianna','Jinx','Lulu'],'B').map(p=>[p.champion,p.role]);
 const findPair=(minute,kind,absent=[])=>activeChampionSynergies(expandedComp,minute,kind,{absent}).matches.find(row=>row.key==='Nocturne+Orianna');
 assert(findPair(20,'baron').spike>1);
 assert.equal(findPair(20,'gank').spike,0);
 assert.equal(findPair(38,'baron').spike,0);
 assert.equal(findPair(20,'baron',['Orianna']),undefined);
 for(const [model,expected] of [
  ['event-v12','ba0141a5f1daf2a56d7cdab11d765ebe55eee9073ca7c6b50472f8a6497bcc0d'],
  ['event-v13','5b767a64a5b1159326779ad94a318fb7cabc685c2084d45f7282783bb0c72065']
 ]){
  const previous=replayMatch({...expandedInput,model});
  assert.equal(createHash('sha256').update(JSON.stringify(previous)).digest('hex'),expected);
 }
});
