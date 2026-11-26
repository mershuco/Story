import test from 'node:test';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
import{createMatchState,advanceMatch,simulateMatch,matchRandom,replayMatch,upgradeMatchState}from'../dist/match-sim.js';
import * as v9 from '../dist/match-sim-v9.js';
import{creditTeam,creditPlayer,collectSideResources,attackStructures,farmPlayers,siegeBaseDamage,BUILDING_GOLD}from'../dist/rift-state.js';
import{killReward,settleDeathBounty}from'../dist/match-economy.js';
const roles=['TOP','JGL','MID','BOT','SUP'],roster=['B','R'].flatMap(team=>roles.map(role=>({team,role,player:team+role,champion:role==='JGL'?'LeeSin':'Annie'}))),input={blue:'B',red:'R',bluePower:80,redPower:80,roster};
test('being behind never creates a shutdown on an ordinary victim; earned bounties require a valuable winning-team target',()=>{
 const s=createMatchState(input,1);s.clock=28;creditTeam(s,'R',15000);const victim=s.stats.find(p=>p.player==='RMID');assert.equal(killReward(s,victim).shutdown,0);
 creditPlayer(s,victim.player,900,{source:'kills'});assert.equal(killReward(s,victim).shutdown,200);const weak=s.stats.find(p=>p.player==='BMID');creditPlayer(s,weak.player,900,{source:'kills'});assert.equal(killReward(s,weak).shutdown,0);
});
test('2026 kill base scales by victim level, assists share one pool, repeated unrecovered deaths lose value',()=>{
 const s=createMatchState(input,2),p=s.stats[5];p.level=6;assert.equal(killReward(s,p).base,300);p.level=18;assert.equal(killReward(s,p).base,420);assert.equal(killReward(s,p).assistPool,210);
 const value=killReward(s,p);settleDeathBounty(s,p,value,value.assistPool);assert(killReward(s,p).base<420);creditPlayer(s,p.player,1500,{source:'lane'});assert.equal(killReward(s,p).base,420);
});
test('a trade against a healthy early tower has no guaranteed demolition or replacement payout',()=>{
 const s=createMatchState(input,17);advanceMatch(s,{controlledTeam:'B'});const start=s.events.length;s.input.decisionOverrides=[[s.pending.id,'R','contest']];advanceMatch(s,{controlledTeam:'B',action:'trade',maxEvents:1});
 const e=s.events.slice(start).find(e=>e.kind==='trade-push');assert(e);assert.equal(e.push.structures.filter(b=>b.destroyed).length,0);assert.equal(e.push.gold,0);assert(e.sideResources.gold>=0&&e.sideResources.gold<=350);assert.equal(e.tradeGold.B,e.sideResources.gold);assert.equal(e.rift.economy.B.structures,0);assert.equal(e.rift.towers.B,0);
});
test('a genuinely broken trade tower pays its full reward and first-tower bonus once, without clipping it to a farm quote',()=>{
 const s=createMatchState(input,3);s.clock=20;s.structures.R.lanes.top.towers[0]=1;const before=s.gold.B,push=attackStructures(s,'B',{lane:'top',roles:['TOP','MID'],trade:true,rng:()=>.5});assert(push.structures[0].destroyed);assert.equal(push.gold,BUILDING_GOLD.tower+300);assert.equal(s.gold.B-before,push.gold);assert.equal(s.economy.B.structures,BUILDING_GOLD.tower);assert.equal(s.economy.B.firstTower,300);
 const more=attackStructures(s,'B',{lane:'top',trade:true,roles:['TOP','MID'],rng:()=>.5});assert(!more.structures.some(b=>b.destroyed));assert.equal(more.gold,0);
});
test('side resources are actual minions/camps, capped jointly at 350, unavailable again immediately or to dead players',()=>{
 const s=createMatchState(input,4);s.clock=20;const before=s.stats.reduce((n,p)=>n+p.cs,0),resources=collectSideResources(s,'B',{lane:'top',rng:()=>.99});assert(resources.gold>0&&resources.gold<=350);assert.equal(resources.gold,resources.lane+resources.jungle);assert(s.stats.reduce((n,p)=>n+p.cs,0)>before);assert.equal(collectSideResources(s,'B',{lane:'top',rng:()=>.99}).gold,0);
 for(const p of s.stats.filter(p=>p.team==='R'))s.respawnAt[p.player]=21;assert.equal(collectSideResources(s,'R',{lane:'bot',rng:()=>.99}).gold,0);
});
test('death and time spent at objectives lose CS income while passive income is preserved, without gold-gap drift',()=>{
 const s=createMatchState(input,5);s.clock=30;s.deathAt.BMID=28;s.respawnAt.BMID=29;s.busyAt.BMID=29;s.busyUntil.BMID=29.5;farmPlayers(s,2);const dead=s.stats.find(p=>p.player==='BMID'),alive=s.stats.find(p=>p.player==='RMID');assert(dead.cs<alive.cs/2);assert.equal(s.economy.B.passive,s.economy.R.passive);assert(s.economy.B.lane<s.economy.R.lane);
 const a=createMatchState(input,5),b=structuredClone(a);creditTeam(b,'B',10000);a.clock=b.clock=10;farmPlayers(a,2);farmPlayers(b,2);assert.equal(a.economy.B.lane,b.economy.B.lane);assert.equal(a.economy.R.jungle,b.economy.R.jungle);
});
test('a side detachment cannot use five-player siege damage; an unprepared wave cannot take a new tower',()=>{
 const s=createMatchState(input,6);s.clock=25;const full=siegeBaseDamage(s,'B'),single=siegeBaseDamage(s,'B',{roles:['TOP']});assert(single.base<full.base*.3);s.wavePressure.B.top=.1;const result=attackStructures(s,'B',{lane:'top',rng:()=>1});assert.equal(result.gold,0);assert.equal(result.damage,0);
});
test('all income, fight reward pools and actual trade buildings reconcile exactly over complete seeded games',()=>{
 for(let seed=1;seed<=120;seed++){
  const out=simulateMatch(input,matchRandom(seed)),last=out.events.at(-1);for(const id of ['B','R']){assert.equal(Object.values(last.rift.economy[id]).reduce((a,b)=>a+b,0),out.finalGold[id]);assert.equal(last.rift.economy[id].other,0);const kills=out.events.flatMap(e=>e.kills).filter(k=>roster.find(p=>p.player===k.killer).team===id);for(const [source,key]of [['kills','kill'],['assists','assists'],['shutdown','shutdown'],['firstBlood','firstBlood']])assert.equal(last.rift.economy[id][source],kills.reduce((n,k)=>n+k.gold[key],0));}
  for(const e of out.events){for(const id of ['B','R'])assert.equal(Object.values(e.rift.economy[id]).reduce((a,b)=>a+b,0),e.gold[id]);if(e.sideResources)assert(e.sideResources.gold<=350);if(e.kind==='trade-push'){assert(e.push.structures.filter(b=>b.destroyed).length<=1);assert.equal(e.tradeGold[e.team],e.push.gold+e.sideResources.gold);if(!e.push.structures.some(b=>b.destroyed))assert.equal(e.push.gold,0);}}
 }
});
test('28-minute large kill and objective lead with 2–0 towers retains a material earned gold lead',()=>{
 const out=simulateMatch({...input,model:'event-v14'},matchRandom(77)),e=out.events.find(e=>e.minute>=28&&e.minute<29&&e.score.B-e.score.R>=15&&e.rift.towers.B===2&&e.rift.towers.R===0);assert(e);assert(e.lead>6000);const b=e.rift.economy.B,r=e.rift.economy.R;assert(b.kills+b.assists>r.kills+r.assists);assert.equal(e.lead,Object.values(b).reduce((a,b)=>a+b,0)-Object.values(r).reduce((a,b)=>a+b,0));
});
test('v9 archive remains exact; an upgraded live set preserves its old prefix and reproduces the new economy after reload',()=>{
 const old=v9.simulateMatch(input,matchRandom(93));assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),'9ab4c2166114ef5fdff24b2f9e599da4904c525d1c5928b979803e0caf96d907');assert.deepEqual(replayMatch({...input,model:'event-v9',seed:93}),old);
 const s=v9.createMatchState({...input,model:'event-v9',seed:123},123);v9.advanceMatch(s,{controlledTeam:'B'});v9.advanceMatch(s,{controlledTeam:'B',action:'trade'});const prefix=JSON.stringify(s.events),rng=s.rng;upgradeMatchState(s);assert.equal(s.rng,rng);assert.equal(JSON.stringify(s.events),prefix);assert.equal(s.economy.B.previous,s.gold.B);const clone=JSON.parse(JSON.stringify(s));advanceMatch(s,{auto:true});advanceMatch(clone,{auto:true});assert.deepEqual(s,clone);const params={...s.input,seed:123,decisionOverrides:s.decisions};assert.deepEqual(replayMatch(params),simulateMatch(params,matchRandom(123)));assert.equal(JSON.stringify(s.events.slice(0,JSON.parse(prefix).length)),prefix);
});
