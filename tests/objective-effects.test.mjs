import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createMatchState,advanceMatch,matchOutcome,objectivePreview,objectiveTradeReward,simulateMatch,replayMatch,matchRandom,battleProbability} from '../dist/match-sim.js';
import * as old from '../dist/match-sim-v5.js';
import {DRAKE_TYPES,takeDragon,grantTemporaryBuff,loseBuffsOnDeath,buffCoverage,objectivePower,structurePressure} from '../dist/objective-effects.js';
import {objectiveStatus,objectiveGuide} from '../dist/objective-effects-ui.js';
const roles=['TOP','JGL','MID','BOT','SUP'],roster=['B','R'].flatMap(team=>roles.map(role=>({team,role,player:team+role,champion:role==='JGL'?'LeeSin':'Annie'}))),input={blue:'B',red:'R',bluePower:80,redPower:80,roster};
const near=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} vs ${b}`);
test('first two randomized drakes and third rift drake are distinct; all later drakes retain third element until soul',()=>{
 const first=new Set(),second=new Set(),third=new Set();
 for(let seed=0;seed<180;seed++){
  const s=createMatchState(input,seed),rng=matchRandom(seed+100);first.add(s.dragonType);
  for(let n=0;n<6;n++){
   s.clock=5+n*5;const owner=n%2?'R':'B',taken=s.dragonType;takeDragon(s,owner,rng);
   assert.equal(s.drakeHistory[n],taken);if(n===0)second.add(s.dragonType);if(n===1){third.add(s.dragonType);assert.equal(s.riftType,s.dragonType);}
   if(n>=2)assert.equal(s.dragonType,s.drakeHistory[2]);
  }
  assert.equal(new Set(s.drakeHistory.slice(0,3)).size,3);assert.equal(s.soul,null);assert.equal(s.dragons.B,3);assert.equal(s.dragons.R,3);
  const reward=takeDragon(s,'R',rng);assert(reward.soul);assert.equal(s.soul,'R');assert.equal(s.timers.dragon,null);assert.equal(s.timers.elder,s.clock+6);
  assert.equal(Object.values(s.drakeStacks.R).reduce((n,x)=>n+x),4);assert.equal(Object.values(s.drakeStacks.B).reduce((n,x)=>n+x),3);assert.throws(()=>takeDragon(s,'B',rng));
 }
 assert.equal(first.size,6);assert.equal(second.size,6);assert.equal(third.size,6);
});
test('all six drake stacks permanently affect combat; soul type and draft/fight context change value',()=>{
 const s=createMatchState(input,19);
 for(const type of DRAKE_TYPES){s.drakeStacks.B[type]=1;const a=objectivePower(s,'B').total;assert(a>0);s.drakeStacks.B[type]=2;near(objectivePower(s,'B').total,a*2);s.drakeStacks.B[type]=0;}
 s.soul='B';s.riftType='ocean';assert(objectivePower(s,'B',30,'teamfight').soul>objectivePower(s,'B',30,'skirmish',['TOP','JGL','MID']).soul);
 const a=objectivePower(s,'B').soul;s.riftType='infernal';assert.notEqual(a,objectivePower(s,'B').soul);
 s.soul=null;s.drakeStacks.B.cloud=1;assert(objectivePower(s,'B',30,'flank').total>objectivePower(s,'B',30,'teamfight').total);
});
test('Baron expires at 180s and Elder at 150s; dead/absent holders contribute no buff and permanent stacks remain',()=>{
 const s=createMatchState(input,20);s.clock=30;s.drakeStacks.B.infernal=2;s.grubs.B=3;
 grantTemporaryBuff(s,'baron','B',['BSUP']);grantTemporaryBuff(s,'elder','B');
 near(buffCoverage(s,'baron','B'),.8);assert(objectivePower(s,'B',30,'siege').baron>objectivePower(s,'B',30,'teamfight').baron);
 const pressure=structurePressure(s,'B');assert(pressure>.5);near(buffCoverage(s,'elder','B',32.5),0);assert(buffCoverage(s,'elder','B',32.49)>0);near(buffCoverage(s,'baron','B',33),0);
 loseBuffsOnDeath(s,['BTOP','BJGL','BMID','BBOT','BSUP']);near(buffCoverage(s,'elder','B'),0);near(buffCoverage(s,'baron','B'),0);near(objectivePower(s,'B').total,objectivePower(s,'B').stacks);assert(structurePressure(s,'B')<pressure);assert(structurePressure(s,'B')>0);
});
test('Elder is a major temporary combat advantage, can overcome 6000G, and still permits losing',()=>{
 const s=createMatchState(input,21);s.clock=30;grantTemporaryBuff(s,'elder','B');const buffGap=objectivePower(s,'B').total;
 near(battleProbability({buffGap}),1/(1+Math.exp(-1.55)));assert(battleProbability({buffGap,lead:-6000})>.6);assert(battleProbability({buffGap})<.95);
});
test('full scheduler awards correct elemental stacks/soul then Elder exclusively in dragon pit; upper pit never spawns Herald',()=>{
 const s=createMatchState(input,42);s.timers.grubs=null;s.timers.baron=null;s.nextMacro=59;
 advanceMatch(s,{controlledTeam:'B'});
 const owner=s.events.find(e=>e.kind==='dragon').team,opponent=s.teams.find(id=>id!==owner);
 for(let i=0;i<6&&!s.elders[owner];i++){
  const p=s.pending;assert(p);assert.equal(p.kind,s.soul?'elder':'dragon');s.input.decisionOverrides=[[p.id,opponent,'trade']];advanceMatch(s,{controlledTeam:owner,action:'contest'});
 }
 const events=s.events.filter(e=>e.objective);assert.equal(events.filter(e=>e.kind==='dragon'&&e.team===owner).length,4);const soul=events.find(e=>e.objective.soul);assert(soul);assert.equal(soul.objective.soulType,s.drakeHistory[2]);const elder=events.find(e=>e.kind==='elder');assert(elder.minute>=soul.minute+6);assert(elder.objectiveState.elder[s.teams.indexOf(owner)][0]>=Math.round((elder.minute+2.5)*60));
 for(let seed=1;seed<=100;seed++){
  const out=simulateMatch(input,matchRandom(seed));assert.equal(out.model,'event-v18');assert(!out.events.some(e=>e.kind==='herald'||e.location==='herald'));
  const drakes=out.events.filter(e=>e.kind==='dragon');if(drakes.length>=3){assert.equal(new Set(drakes.slice(0,3).map(e=>e.objective.dragonType)).size,3);for(const d of drakes.slice(3))assert.equal(d.objective.dragonType,drakes[2].objective.dragonType);}
  for(const e of out.events.filter(e=>e.objective)){if(['dragon','elder'].includes(e.kind))assert.equal(e.location,'dragon');if(['grubs','baron'].includes(e.kind))assert.equal(e.location,e.kind);}
 }
});
test('trade preview quotes only the 350G resource cap and never promises a tower or fixed total',()=>{
 const s=createMatchState(input,123);advanceMatch(s,{controlledTeam:'B'});const before=JSON.stringify(s),p=objectivePreview(s);objectivePreview(s);assert.equal(JSON.stringify(s),before);assert.equal(p.tradePolicy,'earned');assert.deepEqual(p.tradeRange,[0,350]);assert.equal(p.tradeGold,undefined);assert.equal(p.tradePlan.B.resourceMaximum,350);
 advanceMatch(s,{controlledTeam:'B',action:'trade'});const event=s.events.find(e=>e.kind==='trade-push');assert(event);assert(event.sideResources.gold<=350);assert.equal(event.tradeGold.B,event.push.gold+event.sideResources.gold);assert.equal(s.events.find(e=>e.decisions?.B==='trade').objective.team,'R');assert.equal(objectiveTradeReward(s,'B'),350);
});
test('both teams deferring same living objective cannot repeatedly farm extra trade rewards',()=>{
 const s=createMatchState(input,17);advanceMatch(s,{controlledTeam:'B'});const length=s.events.length;s.input.decisionOverrides=[[s.pending.id,'R','trade']];advanceMatch(s,{controlledTeam:'B',action:'trade'});const e=s.events[length];assert.equal(e.kind,'trade');assert.deepEqual(e.tradeGold,{});assert(!e.objective);
});
test('v5 archives keep seeded results and active v5 saves complete with their original RNG and manual decisions',()=>{
 const result=old.simulateMatch(input,matchRandom(93));assert.equal(createHash('sha256').update(JSON.stringify(result)).digest('hex'),'e1a4206bb3c40732c715d7c3a19b4286b6979fd903a9757f5e44354cb692a647');assert.deepEqual(replayMatch({...input,model:'event-v5',seed:93}),result);
 const s=old.createMatchState(input,7);old.advanceMatch(s,{controlledTeam:'B'});const clone=structuredClone(s);assert.deepEqual(objectivePreview(s),old.objectivePreview(clone));advanceMatch(s,{controlledTeam:'B',action:'trade'});old.advanceMatch(clone,{controlledTeam:'B',action:'trade'});advanceMatch(s,{auto:true});old.advanceMatch(clone,{auto:true});assert.deepEqual(s,clone);assert.deepEqual(matchOutcome(s),old.matchOutcome(clone));
});
test('status text explains current stacks, soul and remaining holder time without claiming an expired buff',()=>{
 const snapshot={stacks:{B:Object.fromEntries(DRAKE_TYPES.map(t=>[t,t==='ocean'?2:0]))},rift:'ocean',next:'elder',soul:'B',baron:[[1980,3],[0,0]],elder:[[1950,5],[0,0]]};
 const status=objectiveStatus(snapshot,'B',0,1800,3);assert(status.includes('바다 ×2'));assert(status.includes('바다 영혼'));assert(status.includes('장로 2:30'));assert(status.includes('3명 보유'));assert(!objectiveStatus(snapshot,'B',0,1980).includes('보유'));assert(objectiveGuide().includes('첫 세 용은 서로 다른'));assert(objectiveGuide().includes('체력 20% 미만'));
});
