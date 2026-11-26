import test from 'node:test';
import assert from 'node:assert/strict';
import {damageArchetype, estimateChampionDamage, resultDamageRows} from '../dist/champion-damage.js';
import {createMatchState, advanceMatch, matchOutcome, replayMatch} from '../dist/match-sim.js';

const roles = ['TOP','JGL','MID','BOT','SUP'];
const champions = [['Ornn','Sejuani','Ahri','Ezreal','Karma'],['Gnar','Vi','Taliyah','Yunara','Alistar']];
const roster = ['B','R'].flatMap((team,i) => roles.map((role,j) => ({
 team, role, champion:champions[i][j], player:team+role,
})));
const base = {blue:'B',red:'R',bluePower:80,redPower:80,objectiveEra:2026,patch:'16.9.1',roster,seed:32};
const score = roster.map(p => ({...p,k:2,d:2,a:5,gold:10500,cs:190}));

test('duration, personal KDA and overall match kills affect otherwise identical champion damage', () => {
 const player = 3;
 const at = (rows, time=32) => estimateChampionDamage(rows,time)[player];
 const change = (i, stats) => score.map((p,j) => i===j ? {...p,...stats} : p);
 assert(at(score,43)>at(score,28)*1.3);
 assert(at(change(player,{k:7}))>at(score)*1.15);
 assert(at(change(player,{a:13}))>at(score)*1.07);
 assert(at(change(player,{d:7}))<at(score));
 assert(at(change(8,{k:12}))>at(score));
 assert(at(change(player,{k:0,a:0}))>0);
 assert.deepEqual(estimateChampionDamage(score,32),estimateChampionDamage(structuredClone(score),32));
});

test('damage classes distinguish frontliners, carry champions and support styles at a fixed duration', () => {
 assert.equal(damageArchetype('TOP','KSante'),'tank');
 assert.equal(damageArchetype('TOP','Gnar'),'damage');
 assert.equal(damageArchetype('SUP','Alistar'),'engage');
 assert.equal(damageArchetype('SUP','Lulu'),'utility');
 assert.equal(damageArchetype('SUP','Karma'),'poke');
 const med = (role,champion) => {
  const rows = [...score];
  const index = roles.indexOf(role);
  const values = Array.from({length:60},(_,i)=>{
   rows[index]={...score[index],champion,cs:175+i};
   return estimateChampionDamage(rows,32)[index];
  }).sort((a,b)=>a-b);
  return values[30];
 };
 assert(med('TOP','Gnar')>med('TOP','Ornn')*1.2);
 assert(med('SUP','Karma')>med('SUP','Alistar')*1.35);
 assert(med('BOT','Ezreal')>med('SUP','Lulu')*2);
 const scraps=score.map(p=>({...p,k:5,a:15}));
 assert(estimateChampionDamage(scraps,32)[4]<17000);
 assert(estimateChampionDamage(scraps,32)[9]<12000);
});

test('new and legacy matches preserve decisions, economy and combat while scoreboards use calibrated damage', () => {
 const archived = replayMatch({...base,model:'event-v15'});
 const current = replayMatch({...base,model:'event-v16'});
 assert.deepEqual(current.events,archived.events);
 assert.deepEqual(current.finalGold,archived.finalGold);
 assert.equal(current.winner,archived.winner);
 assert.deepEqual(current.stats.map(({damage,...rest})=>rest),archived.stats.map(({damage,...rest})=>rest));
 assert.notDeepEqual(current.stats.map(p=>p.damage),archived.stats.map(p=>p.damage));
 assert.deepEqual(current.stats.map(p=>p.damage),estimateChampionDamage(current.stats,current.duration));
 const live=createMatchState({...base,model:'event-v16'},base.seed);
 advanceMatch(live,{maxEvents:4});
 const resumed=JSON.parse(JSON.stringify(live));
 advanceMatch(resumed,{auto:true});
 assert.deepEqual(matchOutcome(resumed),current);
 const previousSet={...archived,patch:base.patch,simulationVersion:15};
 assert.deepEqual(resultDamageRows(previousSet),current.stats);
 assert.equal(previousSet.stats,archived.stats);
 assert.equal(resultDamageRows({...previousSet,patch:'12.1.1'}),archived.stats);
});
