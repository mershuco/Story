import * as legacyV5 from '../dist/match-sim-v5.js';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import * as E from '../dist/engine.js';
import {draftCounterThreat} from '../dist/draft-matchups.js';
import {createMatchState,advanceMatch,matchOutcome,simulateMatch,matchRandom,replayMatch} from '../dist/match-sim.js';
const data=Object.fromEntries(['teams','players','champions','mastery','meta','international','season'].map(k=>[k,JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${k}.json`,import.meta.url)))]));E.configure(data);
function round(set,seed=77,first='blue'){
 const s=E.newGame('T1',seed),m={id:'policy-draft',teams:['T1','GEN'],competition:'CUP',sets:[],score:[0,0]};
 for(let n=1;n<set;n++){const d=E.completeDraft(s,E.newDraft(s,m));m.sets.push({picks:[...d.picks.blue,...d.picks.red],loser:n%2?'T1':'GEN'});}
 const d=E.newDraft(s,m);d.firstPickSide=first;return{s,m,d};
}
function pendingFixture(deficit,myTeam='T1'){
 return {myTeam,activeMatch:{simulation:{teams:['T1','GEN'],gold:{T1:20000,GEN:20000+(myTeam==='T1'?deficit:-deficit)},pending:{kind:'dragon'},finished:false}}};
}
test('objective manual prompt starts exactly at 4500 enemy gold advantage and never for an own-team lead',()=>{
 assert.equal(E.OBJECTIVE_CHOICE_DEFICIT,4500);
 for(const team of ['T1','GEN'])for(const [gap,expected]of[[-10000,false],[-4500,false],[0,false],[4499,false],[4500,true],[8000,true]])assert.equal(E.needsObjectiveChoice(pendingFixture(gap,team)),expected,`${team} gap=${gap}`);
 assert.equal(E.needsObjectiveChoice({myTeam:'T1'}),false);const s=pendingFixture(7000);s.activeMatch.simulation.finished=true;assert.equal(E.needsObjectiveChoice(s),false);
});
test('balanced or favored live play skips noncritical objective prompts and stays identical to full auto',()=>{
 const s=E.newGame('T1',108),m={id:'policy-match',teams:['T1','GEN'],competition:'CUP',bestOf:1,date:s.date,sets:[],score:[0,0],status:'scheduled'};s.matches.push(m);
 for(const p of E.lineup(s,'T1'))p.ovr=95;for(const p of E.lineup(s,'GEN'))p.ovr=55;
 s.activeDraft=E.completeDraft(s,E.newDraft(s,m));E.autoAssignDraft(s,s.activeDraft);E.confirmDraftAssignments(s.activeDraft);const auto=structuredClone(s);E.commitOwnDraft(auto);E.startLiveMatch(s);
 if(s.activeMatch){assert(E.needsObjectiveChoice(s));E.advanceOwnMatch(s,'auto',true);}assert.deepEqual(m.sets,auto.matches[0].sets);assert.equal(s.rng,auto.rng);
 assert(!s.activeMatch);assert(m.sets[0].events.some(e=>e.kind==='dragon'));assert(!m.sets[0].simulationReplay.decisionOverrides);
});
test('old saves paused below threshold migrate forward without a reroll or duplicate score',()=>{
 const s=E.newGame('T1',55),m={id:'legacy-pause',teams:['T1','GEN'],competition:'CUP',bestOf:1,date:s.date,sets:[],score:[0,0],status:'scheduled'};s.matches.push(m);
 const roles=E.ROLES,roster=m.teams.flatMap(team=>roles.map(role=>({team,role,player:s.teams[team].lineup[role],champion:'Annie'}))),input={blue:'T1',red:'GEN',bluePower:95,redPower:55,roster,model:'event-v5',seed:17};
 const sim=legacyV5.createMatchState(input,17);advanceMatch(sim,{controlledTeam:'T1'});assert(sim.pending);assert(!E.needsObjectiveChoice({myTeam:'T1',activeMatch:{simulation:sim}}));
 const d={set:1,blue:'T1',red:'GEN',patch:'16.1.1',picks:{blue:roster.filter(p=>p.team==='T1'),red:roster.filter(p=>p.team==='GEN')},bans:{blue:[],red:[]},history:[]};s.activeMatch={matchId:m.id,draft:d,simulation:sim};s.viewing={matchId:m.id,setIndex:0};
 const direct=legacyV5.simulateMatch(input,matchRandom(17));E.resumeLiveMatch(s);if(s.activeMatch){assert(E.needsObjectiveChoice(s));E.advanceOwnMatch(s,'auto',true);}
 assert.equal(m.sets.length,1);assert.equal(m.winner,direct.winner);assert.deepEqual(m.sets[0].stats,direct.stats);assert.deepEqual(m.sets[0].finalGold,direct.finalGold);assert.equal(m.score.reduce((a,b)=>a+b),1);
 const before=JSON.stringify(s);E.resumeLiveMatch(s);assert.equal(JSON.stringify(s),before);
});
test('prior manual decisions made below the new threshold still replay using the recorded v5 overrides',()=>{
 const roles=E.ROLES,roster=['B','R'].flatMap(team=>roles.map(role=>({team,role,player:team+role,champion:'Annie'}))),input={blue:'B',red:'R',bluePower:80,redPower:80,roster},z=legacyV5.createMatchState(input,123);
 advanceMatch(z,{controlledTeam:'B'});advanceMatch(z,{controlledTeam:'B',action:'trade'});advanceMatch(z,{auto:true});const out=matchOutcome(z);
 assert.deepEqual(replayMatch({...input,model:'event-v5',seed:123,decisionOverrides:out.decisionOverrides}),out);
});
test('late-set AI opens usable power picks for its own acquisition/trade and preserves flexible legal picks',()=>{
 for(const set of [1,2,3,4,5])for(const first of ['blue','red']){
  const{s,d}=round(set,98,first),plan=E.draftOpeningPlan(s,d),open=[...plan.openings];assert.equal(open.length,set===1?0:2);if(set>=2)assert.equal(plan.reserveCount,set>=3?2:1);assert(open.every(id=>!d.used.includes(id)));
  while(d.step<6)E.autoOne(s,d);assert(open.every(id=>![...d.bans.blue,...d.bans.red].includes(id)));assert(open.every(id=>E.legalChampions(s,d).some(c=>c.id===id)));
  while(d.step<12)E.autoOne(s,d);if(open.length)assert([...d.picks.blue,...d.picks.red].some(p=>open.includes(p.champion)));
  while(d.step<20){const n=d.history.length;E.autoOne(s,d);assert.equal(d.history.length,n+1);assert(open.every(id=>![...d.bans.blue,...d.bans.red].includes(id)));}
  assert.equal(new Set([...d.picks.blue,...d.picks.red].map(p=>p.champion)).size,10);assert([...d.picks.blue,...d.picks.red].every(p=>p.role===null));
 }
});
test('saved opening plans and partially played picks resume identically; opponent bans get legal replacement openings',()=>{
 const{s,d}=round(4,208),plan=E.draftOpeningPlan(s,d),blocked=plan.openings[0];E.draftAction(s,d,blocked);E.autoOne(s,d);assert(!d.aiOpeningPlan.openings.includes(blocked));assert.equal(d.aiOpeningPlan.openings.length,Math.min(d.aiOpeningPlan.target,d.aiOpeningPlan.powerPool.length-1));
 const saved=JSON.parse(JSON.stringify({s,d})),prefix=structuredClone(d.history);E.autoOne(s,d);E.autoOne(saved.s,saved.d);assert.deepEqual(d,saved.d);assert.equal(s.rng,saved.s.rng);assert.deepEqual(d.history.slice(0,prefix.length),prefix);
});

test('AI counterbans protect its intended OP instead of banning that OP or protecting an enemy-owned pick',()=>{
 for(let seed=1;seed<=20;seed++){
  const s=E.newGame('T1',seed),m={id:'protect-ambessa',teams:['T1','GEN'],competition:'CUP',sets:[],score:[0,0]},d=E.newDraft(s,m);d.set=3;d.firstPickSide='blue';
  d.aiOpeningPlan={version:2,target:2,reserveCount:1,openings:['Ambessa','Orianna'],powerPool:['Ambessa','Orianna','Yunara'],firstPickSide:'blue',designated:{blue:'Ambessa',red:'Orianna'},claims:{blue:[],red:[]}};
  E.autoOne(s,d);const ban=d.history.at(-1);assert.equal(ban.protects,'Ambessa');assert(draftCounterThreat(data.champions.find(c=>c.id==='Ambessa'),data.champions.find(c=>c.id===ban.champion)).weight>0);assert(!d.aiOpeningPlan.openings.includes(ban.champion));assert(ban.reason.includes('확보·활용 보호'));
  // Once OPs are taken, second-phase protection must follow actual ownership.
  while(d.step<6)E.autoOne(s,d);E.draftAction(s,d,'Ambessa');while(d.step<12)E.autoOne(s,d);
  while(d.step<16){const turn=E.draftTurn(d),enemyPicks=new Set(d.picks[turn.side==='blue'?'red':'blue'].map(p=>p.champion));E.autoOne(s,d);const h=d.history.at(-1);if(h.protects)assert(!enemyPicks.has(h.protects));}
 }
});
