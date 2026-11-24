import test from 'node:test';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import{createMatchState,advanceMatch,simulateMatch,matchRandom,replayMatch,upgradeMatchState}from'../dist/match-sim.js';
import * as v10 from '../dist/match-sim-v10.js';
import{creditTeam,finishingPlan}from'../dist/rift-state.js';import{deathTimerSeconds}from'../dist/death-timer.js';import{grantTemporaryBuff}from'../dist/objective-effects.js';import{buildTimeline,sampleScene}from'../dist/timeline.js';
const roles=['TOP','JGL','MID','BOT','SUP'],roster=['B','R'].flatMap(team=>roles.map(role=>({team,role,player:team+role,champion:role==='JGL'?'LeeSin':'Annie'}))),input={blue:'B',red:'R',bluePower:80,redPower:80,roster};
function closing(side='B',elder=false,level=18){const s=createMatchState(input,91),enemy=side==='B'?'R':'B';s.clock=40;creditTeam(s,side,10000);for(const p of s.stats){p.level=level;if(p.team===enemy)s.respawnAt[p.player]=40+deathTimerSeconds(level,40)/60;}s.structures[enemy].lanes.mid.towers=[0,0,3600];s.timers={dragon:40,grubs:null,baron:40,herald:null,elder:null};s.nextMacro=40;if(elder)grantTemporaryBuff(s,'elder',side);return s;}
test('normal Rift timers grow with level and game time, cap at 78.75s, and are independent of map color',()=>{assert.equal(deathTimerSeconds(1,10),10);assert.equal(deathTimerSeconds(18,10),52.5);assert.equal(deathTimerSeconds(18,40),62.34);assert.equal(deathTimerSeconds(18,55),78.75);assert.equal(deathTimerSeconds(18,80),78.75);assert(deathTimerSeconds(18,40)>deathTimerSeconds(12,40));});
test('a 40-minute ace and 10K lead close through T3, inhibitor, both nexus turrets and nexus before due objectives, with or without Elder',()=>{
 for(const side of['B','R'])for(const elder of[false,true])for(const level of[16,18]){const s=closing(side,elder,level),plan=finishingPlan(s);assert.equal(plan.team,side);assert(plan.seconds<=plan.window);advanceMatch(s,{controlledTeam:side,maxEvents:1});assert(s.finished);assert.equal(s.winner,side);assert.equal(s.events[1].kind,'finish-push');assert(!s.events.slice(1).some(e=>e.kind==='objective-setup'));assert(s.events[1].push.structures.filter(b=>b.destroyed).length>=5);assert(s.clock<41.2);assert.equal(s.events.at(-1).rift.structures[side==='B'?'R':'B'].nexus,0);}
});
test('Elder plus a large late lead pressures the base with a rolled defensive fight even when nobody has died yet',()=>{
 const s=closing('B',true);s.respawnAt={};advanceMatch(s,{controlledTeam:'B',maxEvents:1});assert(s.events.some(e=>e.closingFight&&Number.isFinite(e.blueWinProbability)));assert(!s.events.slice(1).some(e=>e.kind==='objective-setup'));if(s.finished)assert.equal(s.structures.R.nexus,0);
});
test('healthy defenders and dead attackers do not fabricate a guaranteed victory',()=>{const s=closing('B',false);s.respawnAt={};assert.equal(finishingPlan(s),null);for(const p of s.stats.filter(p=>p.team==='B'))s.respawnAt[p.player]=42;assert.equal(finishingPlan(s,{team:'B'}),null);});
test('new live kill timers are the same timers used by replayed champion portraits',()=>{
 const o=simulateMatch(input,matchRandom(14)),timeline=buildTimeline({...o,blue:'B',red:'R',number:1,picks:roster,simulationVersion:11});let checked=0;for(const scene of timeline)for(const k of scene.kills){assert(k.respawnAtSecond>scene.second);const a=sampleScene(scene,1).find(p=>p.id===k.victim);assert.equal(a.deathUntil,k.respawnAtSecond);checked++;}assert(checked>5);
});
test('v10 replays remain frozen and upgrading a live prefix preserves history and exact mixed replay',()=>{
 const old=v10.simulateMatch(input,matchRandom(93));assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),'dad0fd3973afab89836599e4f4e451bf8ac1c8b2d73f386127bdd61442e22e60');assert.deepEqual(replayMatch({...input,seed:93,model:'event-v10'}),old);
 const s=v10.createMatchState({...input,seed:123,model:'event-v10'},123);v10.advanceMatch(s,{controlledTeam:'B'});const before=JSON.stringify(s.events),rng=s.rng;upgradeMatchState(s);assert.equal(s.rng,rng);assert.equal(JSON.stringify(s.events),before);advanceMatch(s,{auto:true});const params={...s.input,seed:123,decisionOverrides:s.decisions};assert.deepEqual(replayMatch(params),simulateMatch(params,matchRandom(123)));
});

test('an already scheduled objective decision also yields to an available nexus finish',()=>{const s=closing();s.pending={id:0,kind:'baron',minute:40.1,roles:null};advanceMatch(s,{controlledTeam:'B',maxEvents:1});assert(s.finished);assert.equal(s.events[1].kind,'finish-push');assert(!s.events.some(e=>e.kind==='baron'));});
