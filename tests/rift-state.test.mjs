import {buildTimeline,sceneClock} from '../dist/timeline.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMatchState,advanceMatch,matchOutcome,simulateMatch,replayMatch,matchRandom,objectivePreview} from '../dist/match-sim.js';
import * as v6 from '../dist/match-sim-v6.js';
import {creditTeam,creditPlayer,nextBuilding,attackStructures,towerCount,gainVision,visionControl,visionFightGap,waveclear,superPressure,tickRift} from '../dist/rift-state.js';
import {grantTemporaryBuff} from '../dist/objective-effects.js';
import {goldRows,structurePosition} from '../dist/broadcast-hud.js';
const roles=['TOP','JGL','MID','BOT','SUP'],roster=['B','R'].flatMap(team=>roles.map(role=>({team,role,player:team+role,champion:role==='JGL'?'LeeSin':'Annie'}))),input={blue:'B',red:'R',bluePower:80,redPower:80,roster};
const checkLedger=s=>{for(const id of s.teams)assert.equal(s.stats.filter(p=>p.team===id).reduce((n,p)=>n+p.gold,0),s.gold[id]);};
test('player economy conserves team gold across farm, kills, assists, objective/trade and structure rewards',()=>{
 const s=createMatchState(input,14);checkLedger(s);creditTeam(s,'B',1001,{kind:'farm'});const before=s.stats.find(p=>p.player==='BMID').gold;creditPlayer(s,'BMID',700);checkLedger(s);assert.equal(s.stats.find(p=>p.player==='BMID').gold-before,700);
 for(let seed=1;seed<=80;seed++){
  const out=simulateMatch(input,matchRandom(seed));for(const id of ['B','R'])assert.equal(out.stats.filter(p=>p.team===id).reduce((n,p)=>n+p.gold,0),out.finalGold[id]);
  for(const e of out.events)for(const id of ['B','R'])assert.equal(out.stats.map((p,i)=>p.team===id?e.rift.players[i][0]:0).reduce((a,b)=>a+b),e.gold[id]);
 }
});
test('buildings require lane order, retain damage, pay once and unlock opponent jungle control',()=>{
 const s=createMatchState(input,2),rng=matchRandom(1);assert.equal(nextBuilding(s,'B','top').index,0);
 const initialVision=visionControl(s,'B','top'),a=attackStructures(s,'B',{lane:'top',rng,forceDamage:1000});assert(!a.structures[0].destroyed);assert.equal(a.gold,0);assert.equal(nextBuilding(s,'B','top').hp,1700);
 const b=attackStructures(s,'B',{lane:'top',rng,forceDamage:1700});assert(b.structures[0].destroyed);assert.equal(b.gold,750);assert.equal(towerCount(s,'B'),1);assert.equal(nextBuilding(s,'B','top').index,1);assert(visionControl(s,'B','top')>initialVision);checkLedger(s);
 attackStructures(s,'B',{lane:'top',rng,forceDamage:3200});attackStructures(s,'B',{lane:'top',rng,forceDamage:3600});assert.equal(nextBuilding(s,'B','top').kind,'inhibitor');assert.equal(s.structures.R.nexus,5000);
});
test('inhibitor creates five-minute super pressure; nexus is gated by a live inhibitor and both nexus turrets',()=>{
 const s=createMatchState(input,3),rng=matchRandom(1);s.clock=30;s.structures.R.lanes.mid.towers=[0,0,0];attackStructures(s,'B',{lane:'mid',rng,forceDamage:4000});assert.equal(superPressure(s,'B'),1);assert.equal(s.structures.R.lanes.mid.inhibitorUntil,35);assert.equal(nextBuilding(s,'B','mid').kind,'nexusTower');
 attackStructures(s,'B',{lane:'mid',rng,forceDamage:3000});assert.equal(nextBuilding(s,'B','mid').index,1);assert.equal(s.structures.R.nexus,5000);tickRift(s,35);assert.equal(s.structures.R.lanes.mid.inhibitor,4000);assert.equal(nextBuilding(s,'B','mid').kind,'inhibitor');assert.equal(superPressure(s,'B'),0);
});
test('vision responds to macro ability and cleared territory, affects local fight odds and expires rather than staying maxed',()=>{
 const s=createMatchState(input,4);advanceMatch(s,{controlledTeam:'B'});const before=objectivePreview(s).fightChance,rng=s.rng;s.macros[0].vision=.95;s.macros[1].vision=.3;gainVision(s,'B','dragon',40);const after=objectivePreview(s).fightChance;assert(after>before);assert.equal(s.rng,rng);assert(visionFightGap(s,'dragon')>0);assert(s.wards.some(w=>w.team==='B'));tickRift(s,s.clock+4);assert.equal(s.wards.length,0);
});
test('waveclear champions stall real siege damage, death removes their defense, Baron waves resist clearing',()=>{
 const defender=champion=>{const s=createMatchState(input,5);s.clock=30;s.stats.find(p=>p.player==='RMID').champion=champion;return s;},weak=defender('Yuumi'),strong=defender('Anivia');assert(waveclear(strong,'R')>waveclear(weak,'R'));assert(waveclear(strong,'R','mid',['RMID'])<waveclear(strong,'R'));
 const a=attackStructures(weak,'B',{lane:'mid',rng:()=>.5}),b=attackStructures(strong,'B',{lane:'mid',rng:()=>.5});assert(b.damage<a.damage);
 for(const z of [weak,strong]){z.structures.R.lanes.mid.towers=[0,0,0];z.structures.R.lanes.mid.inhibitor=0;z.structures.R.lanes.mid.inhibitorUntil=35;z.structures.R.nexusTowers=[0,0];z.structures.R.nexus=1800;}
 attackStructures(weak,'B',{lane:'mid',rng:()=>.5});attackStructures(strong,'B',{lane:'mid',rng:()=>.5});assert.equal(weak.structures.R.nexus,0);assert(strong.structures.R.nexus>0,'waveclear must be able to stop a would-be game-ending push');
 const baron=defender('Anivia');grantTemporaryBuff(baron,'baron','B');const c=attackStructures(baron,'B',{lane:'mid',rng:()=>.5});assert(c.baron);assert(c.damage>b.damage);
});
test('trade reward is shown as a real side push with vision and an exact total, without duplicate tower rewards',()=>{
 const s=createMatchState(input,9);advanceMatch(s,{controlledTeam:'B'});const p=objectivePreview(s),length=s.events.length;s.input.decisionOverrides=[[p.id,'R','contest']];advanceMatch(s,{controlledTeam:'B',action:'trade'});const events=s.events.slice(length),push=events.find(e=>e.kind==='trade-push');assert(push);assert(push.push.structures.length);assert.equal(push.tradeGold.B,p.tradeGold);assert(push.rift.wards.some(w=>w.team==='B'));checkLedger(s);assert(!events.find(e=>e.kind===p.kind).tradeGold.B);
});
test('future random fights can change winners; every finished game has a destroyed nexus and legal persistent building history',()=>{
 for(let seed=1;seed<=80;seed++){
  const o=simulateMatch(input,matchRandom(seed)),last=o.events.at(-1),loser=o.winner==='B'?'R':'B';assert.equal(last.rift.structures[loser].nexus,0);assert(o.events.slice(0,-1).some(e=>e.push?.structures.some(b=>b.kind==='nexus'&&b.destroyed)));assert(last.rift.towers[o.winner]>=5);
  for(let i=1;i<o.events.length;i++){const a=o.events[i-1],b=o.events[i];assert(b.second>a.second);for(const id of ['B','R'])assert(b.rift.towers[id]>=a.rift.towers[id]);}
 }
 const s=createMatchState(input,30);s.clock=75;s.nextMacro=75;s.timers={dragon:80,grubs:null,herald:null,baron:81,elder:null};advanceMatch(s,{controlledTeam:'B'});assert(!s.finished);assert.equal(s.winner,null);assert(s.pending);
});
test('HUD shows real per-position gold gaps; animation begins with prior snapshot and map positions are symmetric',()=>{
 const set={blue:'B',red:'R',stats:roster},current={rift:{players:roster.map((p,i)=>[500+i*100,20+i,6])}},rows=goldRows(set,current,null,1);assert.equal(rows[0].gold-rows[5].gold,-500);assert.equal(rows[1].cs,21);const start=goldRows(set,current,null,0);assert(start.every(p=>p.gold===500));assert.equal(goldRows(set,{},null,0),null);assert.deepEqual(structurePosition('red','top','tower',0),[240,80]);
});
test('v6 archived outcomes, gold and objective bonuses remain unchanged and active saves finish with original rules',()=>{
 const out=v6.simulateMatch(input,matchRandom(93));assert.equal(createHash('sha256').update(JSON.stringify(out)).digest('hex'),'8131379f02fabe367ca1cec344450a46cd4b5cddaf2de9ef26b2696c8782a06a');assert.deepEqual(replayMatch({...input,model:'event-v6',seed:93}),out);
 const s=v6.createMatchState(input,24);v6.advanceMatch(s,{controlledTeam:'B'});const clone=structuredClone(s);advanceMatch(s,{auto:true});v6.advanceMatch(clone,{auto:true});assert.deepEqual(s,clone);assert.deepEqual(matchOutcome(s),v6.matchOutcome(clone));
});

test('consecutive siege highlights keep the broadcast clock monotone and recently killed defenders stay dead',()=>{
 const out=simulateMatch(input,matchRandom(9)),set={...out,blue:'B',red:'R',number:1,picks:roster,simulationVersion:7},timeline=buildTimeline(set);let carried=false;
 for(let i=0;i<timeline.length-1;i++){const a=timeline[i],b=timeline[i+1];assert(sceneClock(a,1)<=sceneClock(b,0));if(b.second-a.second<20&&a.kills.length){for(const k of a.kills){const actor=b.actors.find(p=>p.id===k.victim);assert(actor.alreadyDead);carried=true;}}}
 assert(carried);
});
