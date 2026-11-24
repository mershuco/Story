import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';import{createHash}from'node:crypto';
import*as E from'../dist/engine.js';
import{createMatchState,advanceMatch,matchOutcome,objectivePreview,simulateMatch,matchRandom,replayMatch}from'../dist/match-sim.js';
import{simulateMatch as simulateV4}from'../dist/match-sim-v4.js';
import{objectiveChances,secureTools,macroProfile}from'../dist/macro-objectives.js';
import{buildTimeline}from'../dist/timeline.js';
const roles=['TOP','JGL','MID','BOT','SUP'],roster=['B','R'].flatMap(team=>roles.map(role=>({team,role,player:team+role,champion:role==='JGL'?'LeeSin':'Annie'}))),base={blue:'B',red:'R',bluePower:80,redPower:80,roster};
const data=Object.fromEntries(['teams','players','champions','mastery','meta','international','season'].map(k=>[k,JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${k}.json`,import.meta.url)))]));E.configure(data);
const near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);
function setup(seed=42,distressed=false){const s=E.newGame('T1',seed),m={id:'objective-test',teams:['T1','GEN'],competition:'CUP',bestOf:1,date:s.date,sets:[],score:[0,0],status:'scheduled'};s.matches.push(m);if(distressed){for(const p of E.lineup(s,'T1'))p.ovr=45;for(const p of E.lineup(s,'GEN'))p.ovr=99;}s.activeDraft=E.completeDraft(s,E.newDraft(s,m));E.autoAssignDraft(s,s.activeDraft);E.confirmDraftAssignments(s.activeDraft);if(distressed){let found=false;for(let seed=1;seed<=100;seed++){const trial=structuredClone(s);trial.rng=seed;E.startLiveMatch(trial);if(trial.activeMatch){s.rng=seed;found=true;break;}}assert(found,'distress fixture must reach a real 4500G choice');}return{s,m};}

test('objective odds respond to fight/gold control, smite skill, champion burst, setup and surviving participants',()=>{
 const input={blue:'B',red:'R',roster,skills:[75,75]};near(objectiveChances({...input,fightChance:.5}).blueChance,.5);assert(objectiveChances({...input,fightChance:.75}).blueChance>.5);assert(objectiveChances({...input,skills:[95,60]}).blueChance>.5);
 for(const champion of ['Xayah','Kalista','Pantheon','Chogath','Nunu']){const r=structuredClone(roster);r.find(p=>p.team==='B'&&p.role==='TOP').champion=champion;const withBurst=objectiveChances({...input,roster:r});assert(withBurst.blueChance>.5,champion);const dead=objectiveChances({...input,roster:r,dead:['BTOP']});assert(dead.blueChance<withBurst.blueChance);}
 assert(objectiveChances({...input,dead:['BJGL']}).blueChance<.5);assert(objectiveChances({...input,dead:roster.filter(p=>p.team==='B').map(p=>p.player)}).blueChance===0);
 const r=structuredClone(roster);r.find(p=>p.player==='BBOT').champion='Kalista';const full=objectiveChances({...input,roster:r}),top=objectiveChances({...input,roster:r,roles:['TOP','JGL','MID']});assert(full.blueChance>top.blueChance);assert(secureTools(r,'B',[],[],null,1).bonus>secureTools(r,'B',[],[],null,.2).bonus);
});
test('objective probability is symmetric when both sides and their skills/abilities are exchanged',()=>{
 const r=structuredClone(roster);r.find(p=>p.player==='BBOT').champion='Kalista';const a=objectiveChances({blue:'B',red:'R',roster:r,skills:[90,70],fightChance:.7}),b=objectiveChances({blue:'R',red:'B',roster:r,skills:[70,90],fightChance:.3});near(a.blueChance+b.blueChance,1);
});
test('dragon soul, Elder transition, three grubs, and spawn/respawn times remain coherent across variable matches',()=>{
 for(let seed=1;seed<=100;seed++){
  const out=simulateMatch(base,matchRandom(seed));assert(out.winner);const totals={B:0,R:0},grubs={B:0,R:0},last={};let soul=null,soulAt=0;
  for(const e of out.events){if(!e.objective||e.objective.kind==='nexus'||e.objective.kind==='tower')continue;const o=e.objective;
   if(o.kind==='dragon'){assert(!soul);assert(e.minute>=5);if(last.dragon)assert(e.minute-last.dragon>=5);last.dragon=e.minute;totals[o.team]++;if(totals[o.team]===4){soul=o.team;soulAt=e.minute;}}
   if(o.kind==='elder'){assert(soul);assert(e.minute>=soulAt+6);}
   if(o.kind==='grubs'){assert(e.minute>=8&&e.minute<=14.8);assert.equal(o.allocation.B+o.allocation.R,3);for(const id of ['B','R'])grubs[id]+=o.allocation[id];}
   if(o.kind==='baron'){assert(e.minute>=20);if(last.baron)assert(e.minute-last.baron>=6);last.baron=e.minute;}
   if(o.kind==='herald')assert(e.minute>=15&&e.minute<=19.8);
  }
  assert(grubs.B+grubs.R<=3);assert.deepEqual(out.finalObjectives.dragons,totals);assert.deepEqual(out.finalObjectives.grubs,grubs);
 }
});
test('manual objective pauses reveal only the prefix and choosing trade grants gold while conceding the objective',()=>{
 const s=createMatchState(base,123);advanceMatch(s,{controlledTeam:'B'});assert(s.pending);assert.equal(s.finished,false);assert.equal(s.winner,null);assert(!s.events.some(e=>e.kind==='nexus'));const before=structuredClone(s.events),pending={...s.pending};
 advanceMatch(s,{controlledTeam:'B',action:'trade'});assert.deepEqual(s.events.slice(0,before.length),before);const e=s.events.slice(before.length).find(e=>e.kind===pending.kind);assert.equal(e.decisions.B,'trade');assert.equal(e.objective.team,'R');assert.equal(e.kills.length,0);assert.equal(e.objectiveMode,'uncontested');
 const alternative=createMatchState(base,123);advanceMatch(alternative,{controlledTeam:'B'});advanceMatch(alternative,{controlledTeam:'B',action:'contest'});assert.deepEqual(alternative.events.slice(0,before.length),before);const fought=alternative.events.slice(before.length).find(e=>e.kind===pending.kind);assert(fought.kills.length>0);assert.equal(fought.decisions.B,'contest');
});
test('saved mid-game decisions and RNG resume identically; previews and invalid commands never reroll',()=>{
 const s=createMatchState(base,271);advanceMatch(s,{controlledTeam:'B'});const clone=JSON.parse(JSON.stringify(s)),before=JSON.stringify(s);objectivePreview(s);objectivePreview(s);assert.equal(JSON.stringify(s),before);assert.throws(()=>advanceMatch(s,{controlledTeam:'B',action:'bad'}));assert.equal(JSON.stringify(s),before);
 advanceMatch(s,{controlledTeam:'B',action:'trade'});advanceMatch(clone,{controlledTeam:'B',action:'trade'});assert.deepEqual(s,clone);advanceMatch(s,{auto:true});advanceMatch(clone,{auto:true});assert.deepEqual(matchOutcome(s),matchOutcome(clone));
 const result=matchOutcome(s),replayed=replayMatch({...base,seed:271,model:'event-v7',decisionOverrides:result.decisionOverrides});assert.deepEqual(replayed,result);
});
test('engine live play commits no winner or series score early, locks rosters, and completes exactly once',()=>{
 const{s,m}=setup(42,true);E.startLiveMatch(s);assert.equal(m.sets.length,0);assert.deepEqual(m.score,[0,0]);assert(E.activeMatchSet(s).pending);assert(!E.activeMatchSet(s).winner);
 for(const mutate of [()=>E.advanceDays(s,1),()=>E.signPlayer(s,'lucid'),()=>E.setStarter(s,'guti'),()=>E.releasePlayer(s,'guti'),()=>E.requestTrade(s,'faker','chovy')])assert.throws(mutate);
 const clone=JSON.parse(JSON.stringify(s));E.advanceOwnMatch(s,'trade');E.advanceOwnMatch(clone,'trade');assert.deepEqual(s,clone);if(s.activeMatch)E.advanceOwnMatch(s,'auto',true);assert.equal(s.activeMatch,null);assert.equal(m.sets.length,1);assert.equal(m.status,'done');assert.equal(m.score.reduce((a,b)=>a+b),1);assert.throws(()=>E.advanceOwnMatch(s,'auto',true));assert.equal(m.sets.length,1);
 const timeline=buildTimeline(m.sets[0]);assert.deepEqual(timeline.at(-1).gold,m.sets[0].finalGold);assert.equal(timeline.at(-1).team,m.winner);
});
test('automatic completion of a live match is identical to the full automatic path, including final RNG',()=>{
 const {s,m}=setup(68),other=structuredClone(s);E.commitOwnDraft(other);E.startLiveMatch(s);if(s.activeMatch)E.advanceOwnMatch(s,'auto',true);assert.deepEqual(m.sets,other.matches[0].sets);assert.equal(s.rng,other.rng);assert.deepEqual(s.players,other.players);
});
test('macro schedules vary with seed, team personality and draft without changing deterministic replay',()=>{
 const signatures=new Set();for(let seed=1;seed<=24;seed++){const out=simulateMatch(base,matchRandom(seed));signatures.add(out.events.filter(e=>e.kind!=='objective-setup').map(e=>e.kind+':'+e.location).join('|'));assert.deepEqual(out,simulateMatch(base,matchRandom(seed)));}assert(signatures.size>20);
 const mixed={members:[['Fiora','TOP'],['Nocturne','JGL'],['Leblanc','MID'],['Ezreal','BOT'],['Pyke','SUP']],engage:1,poke:1};assert(macroProfile('KT',mixed).split>macroProfile('HLE',mixed).split);assert(macroProfile('DK',mixed,'early').aggression>macroProfile('GEN',mixed,'late').aggression);
 const a={...base,blue:'T1',red:'GEN',roster:roster.map(p=>({...p,team:p.team==='B'?'T1':'GEN'}))},b={...a,blueStrategy:'late'},x=simulateMatch(a,matchRandom(19)),y=simulateMatch(b,matchRandom(19));assert.notDeepEqual(x.events.map(e=>[e.minute,e.kind,e.location]),y.events.map(e=>[e.minute,e.kind,e.location]));
});
test('event-v4 archived combat, gold and outcomes replay exactly after live macro changes',()=>{
 const old=simulateV4(base,matchRandom(93)),digest=createHash('sha256').update(JSON.stringify(old)).digest('hex');assert.equal(digest,'5b27ff8e2f1d586b2ab9eef0659bce31dfe8a838e3c1e818399a142cb517e8cc');assert.deepEqual(replayMatch({...base,seed:93,model:'event-v4'}),old);
});
test('compact saves retain live prefixes and reconstruct completed manual decisions, objectives and gold losslessly',()=>{
 const{s,m}=setup(919,true);E.startLiveMatch(s);const pending=JSON.parse(E.serializeSave(s));assert.deepEqual(pending.activeMatch.simulation.events,JSON.parse(JSON.stringify(s.activeMatch.simulation.events)));assert.deepEqual(pending.activeMatch.simulation.pending,s.activeMatch.simulation.pending);
 E.advanceOwnMatch(s,'trade');if(s.activeMatch)E.advanceOwnMatch(s,'auto',true);const before=JSON.stringify(m.sets[0]),full=buildTimeline(m.sets[0]),saved=JSON.parse(E.serializeSave(s)),set=saved.matches[0].sets[0];assert.equal(JSON.stringify(m.sets[0]),before);assert.deepEqual(set.events,[]);const replay=buildTimeline(set);assert.deepEqual(replay,full);assert.deepEqual(replay.at(-1).grubs,full.at(-1).grubs);assert.deepEqual(replay.at(-1).gold,set.finalGold);assert(set.simulationReplay.decisionOverrides.length>0);
});
