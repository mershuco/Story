import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as E from '../dist/engine.js';
import {simulateMatch,battleProbability} from '../dist/match-sim.js';
import {buildTimeline} from '../dist/timeline.js';
const data=Object.fromEntries(['teams','players','champions','mastery','meta','international','season'].map(k=>[k,JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${k}.json`,import.meta.url)))]));E.configure(data);
const roles=['TOP','JGL','MID','BOT','SUP'];
const roster=['B','R'].flatMap(team=>roles.map(role=>({team,role,player:team+role,champion:team+role})));
const input={blue:'B',red:'R',bluePower:80,redPower:80,roster};
function seeded(seed){return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const run=(seed,options={})=>simulateMatch({...input,...options},seeded(seed));
test('2026LCK independent turn sequence is3bans each,1/2/2/1picks,2bans each,1/2/1picks forboth mapcolors',()=>{
 const expected=[['first','ban'],['second','ban'],['first','ban'],['second','ban'],['first','ban'],['second','ban'],['first','pick'],['second','pick'],['second','pick'],['first','pick'],['first','pick'],['second','pick'],['second','ban'],['first','ban'],['second','ban'],['first','ban'],['second','pick'],['first','pick'],['first','pick'],['second','pick']];
 for(const firstColor of ['blue','red']){
  const s=E.newGame('T1',10),m={id:'sequence',phase:'CUP_FINAL',teams:['T1','GEN'],sets:[],score:[0,0],competition:'CUP'},d=E.newDraft(s,m,`both:${firstColor}:first`);assert.equal(d.firstPickSide,firstColor);
  for(let i=0;i<20;i++){
   const turn=E.draftTurn(d),[order,kind]=expected[i];assert.equal(turn.kind,kind);assert.equal(turn.side,order==='first'?firstColor:firstColor==='blue'?'red':'blue');
   if([7,8,9,10,17,18].includes(i)){const status=E.draftStatus(d);assert.equal(status.count,2);assert.equal(status.index,[8,10,18].includes(i)?2:1);}
   E.draftAction(s,d,E.legalChampions(s,d)[0].id);assert([...d.picks.blue,...d.picks.red].every(p=>p.role===null));
  }
  assert.equal(d.bans.blue.length,5);assert.equal(d.bans.red.length,5);assert.equal(d.picks.blue.length,5);assert.equal(d.picks.red.length,5);assert.equal(E.draftStatus(d).id,'assignment');
 }
});
test('save/load in the middle of a2pick block preserves the next choice and phase',()=>{
 const s=E.newGame(),m={id:'sequence-save',teams:['T1','GEN'],sets:[],score:[0,0],competition:'CUP'},d=E.newDraft(s,m);for(let i=0;i<8;i++)E.draftAction(s,d,E.legalChampions(s,d)[0].id);
 const restored=JSON.parse(JSON.stringify(d));E.migrateDraft(restored);assert.equal(E.draftStatus(restored).count,2);assert.equal(E.draftStatus(restored).index,2);assert.deepEqual(E.draftTurn(restored),E.draftTurn(d));assert.deepEqual(restored.history,d.history);
});
test('gold, strength and scaling alterfight probabilities without making eitherteam certain towin',()=>{
 const even=battleProbability(),ahead=battleProbability({lead:6000}),behind=battleProbability({lead:-6000});assert.equal(even,.5);assert(behind<even&&ahead>even);assert(Math.abs(ahead+behind-1)<1e-12);assert(battleProbability({powerGap:8})>even);assert(battleProbability({scaleGap:3,minute:35})>battleProbability({scaleGap:3,minute:5}));for(const lead of [-100000,-12000,0,12000,100000]){const p=battleProbability({lead,powerGap:20});assert(p>=.02&&p<=.98);}
});
test('changing only future random events can change thewinner after anidentical opening',()=>{
 const outcomes=[];for(let suffix=1;suffix<=24;suffix++){const prefix=seeded(251),later=seeded(suffix);let calls=0;outcomes.push(simulateMatch(input,()=>++calls<=80?prefix():later()));}assert.equal(new Set(outcomes.map(x=>x.winner)).size,2);for(const out of outcomes)assert.deepEqual(out.events.slice(0,2),outcomes[0].events.slice(0,2));
});
test('equalteams, favorites and6Kcomebacks coexist across1000seeded matches',()=>{
 for(const gap of [0,8,-8]){let blueWins=0,comebacks=0,comebacks6K=0,swings=0;for(let seed=1;seed<=1000;seed++){const x=run(seed,{bluePower:80+gap});blueWins+=x.winner==='B';comebacks+=x.comeback.winnerMaxDeficit>=3000;comebacks6K+=x.comeback.winnerMaxDeficit>=6000;swings+=x.comeback.leadChanges;}assert(comebacks>40&&comebacks<500);assert(comebacks6K>=5&&comebacks6K<200);assert(swings>100);if(!gap)assert(blueWins>400&&blueWins<600);else if(gap>0)assert(blueWins>650&&blueWins<900);else assert(blueWins>100&&blueWins<350);}
});
test('gold, objectives, casualties, assists andfinaloutcome allderive from thesame eventlog',()=>{
 for(let seed=1;seed<=80;seed++){
  const x=run(seed),end=x.events.at(-1),kills=x.events.flatMap(e=>e.kills);assert.equal(end.kind,'nexus');assert.equal(end.team,x.winner);assert.equal(end.minute,x.duration);assert.deepEqual(end.gold,x.finalGold);assert.equal(end.lead,x.finalGold.B-x.finalGold.R);
  for(const [i,e] of x.events.entries()){assert.equal(e.lead,e.gold.B-e.gold.R);assert(e.gold.B>=2500&&e.gold.R>=2500);if(i)assert(e.second>x.events[i-1].second);assert.equal(new Set(e.kills.map(k=>k.victim)).size,e.kills.length);for(const k of e.kills){assert(!k.assists.includes(k.killer));assert.equal(new Set(k.assists).size,k.assists.length);assert.notEqual(roster.find(p=>p.player===k.killer).team,roster.find(p=>p.player===k.victim).team);}}
  for(const p of x.stats){assert.equal(p.k,kills.filter(k=>k.killer===p.player).length);assert.equal(p.d,kills.filter(k=>k.victim===p.player).length);assert.equal(p.a,kills.filter(k=>k.assists.includes(p.player)).length);}
 }
});
test('saved simulation renders theexact comeback/goldtrace withoutinventing favorable events orconsuming RNG',()=>{
 let x;for(let seed=1;seed<200;seed++){const candidate=run(seed);if(candidate.comeback.winnerMaxDeficit>=6000){x=candidate;break;}}assert(x);const set={...x,blue:'B',red:'R',number:1,picks:roster.map(({player,...pick})=>pick),simulationVersion:3},before=JSON.stringify(set),timeline=buildTimeline(set);assert.equal(JSON.stringify(set),before);assert.equal(timeline.length,set.events.length);assert.deepEqual(timeline.map(e=>e.lead),set.events.map(e=>e.lead));assert.deepEqual(timeline.map(e=>e.gold),set.events.map(e=>e.gold));assert.deepEqual(timeline.map(e=>e.objective),set.events.map(e=>e.objective));assert.deepEqual(timeline,buildTimeline(JSON.parse(before)));
});

test('AI match replays reconstruct realfightandgold events from the saved seed without saving asecondlarge log',()=>{
 const s=E.newGame('T1',1234),m={id:'2026-ai-replay',competition:'CUP',teams:['GEN','DK'],bestOf:1,date:s.date,sets:[],score:[0,0],status:'scheduled'};const d=E.completeDraft(s,E.newDraft(s,m));E.autoAssignDraft(s,d);E.confirmDraftAssignments(d);const set=E.resolveDraft(s,m,d),rng=s.rng;assert.deepEqual(set.events,[]);assert.equal(set.simulationReplay.model,'event-v12');const timeline=buildTimeline(set);assert.equal(s.rng,rng);assert(timeline.every(e=>e.gold));assert.deepEqual(timeline.at(-1).gold,set.finalGold);const kills=timeline.flatMap(e=>e.kills);for(const p of set.stats){assert.equal(p.k,kills.filter(k=>k.killer===p.player).length);assert.equal(p.d,kills.filter(k=>k.victim===p.player).length);}assert.deepEqual(timeline,buildTimeline(JSON.parse(JSON.stringify(set))));
});
