import test from 'node:test';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import {createMatchState,advanceMatch,simulateMatch,matchRandom,replayMatch,upgradeMatchState} from '../dist/match-sim.js';
import * as v8 from '../dist/match-sim-v8.js';
import {creditTeam,attackStructures,finishingPlan,siegeBaseDamage} from '../dist/rift-state.js';
import {updateBounties,objectiveBountyAmount,bountyTowerTargets} from '../dist/objective-bounties.js';
import {grantTemporaryBuff,objectiveSnapshot} from '../dist/objective-effects.js';
import {minimapObjectives} from '../dist/minimap-objectives.js';
import {powerPlayState,playbackIncrement} from '../dist/power-play-ui.js';
const roles=['TOP','JGL','MID','BOT','SUP'],roster=['B','R'].flatMap(team=>roles.map(role=>({team,role,player:team+role,champion:role==='JGL'?'LeeSin':'Annie'}))),input={blue:'B',red:'R',bluePower:80,redPower:80,roster};
function trailing(){const s=createMatchState(input,41);creditTeam(s,'R',7000);s.clock=14;updateBounties(s);s.clock=14.3;updateBounties(s);return s;}
test('objective bounties need a real deficit, start after 14 minutes plus warning, and end after recovery grace',()=>{
 const s=createMatchState(input,1);creditTeam(s,'R',7000);s.clock=13.9;updateBounties(s);assert.equal(s.objectiveBounty.team,null);s.clock=14;updateBounties(s);assert.equal(s.objectiveBounty.pending,'B');assert.equal(s.objectiveBounty.team,null);s.clock=14.26;updateBounties(s);assert.equal(s.objectiveBounty.team,'B');assert.equal(objectiveBountyAmount(s,'R','tower'),0);
 creditTeam(s,'B',6500);updateBounties(s);assert.equal(s.objectiveBounty.team,'B');s.clock+=.26;updateBounties(s);assert.equal(s.objectiveBounty.team,null);assert.equal(bountyTowerTargets(s,'B').length,3);
});
test('only the trailing team gets reachable turret bonuses, paid once and shared across all five players',()=>{
 const s=trailing(),targets=bountyTowerTargets(s,'B');assert.equal(targets.length,3);assert(targets.every(t=>t.defender==='R'&&t.kind==='tower'&&t.index===0));const before=s.gold.B,expected=objectiveBountyAmount(s,'B','tower',0),gold=s.stats.filter(p=>p.team==='B').map(p=>p.gold),result=attackStructures(s,'B',{lane:'top',rng:()=>.5,forceDamage:2700});
 assert.equal(result.gold,750);assert.equal(result.bounty,expected);assert.equal(s.gold.B-before,750+expected);assert(s.stats.filter(p=>p.team==='B').every((p,i)=>p.gold>gold[i]));assert.equal(s.objectiveBounty.claimed.B,expected);assert(bountyTowerTargets(s,'B').some(t=>t.lane==='top'&&t.index===1));
 const again=attackStructures(s,'B',{lane:'top',rng:()=>.5,forceDamage:1});assert.equal(again.bounty,0);assert.equal(again.gold,0);assert.equal(objectiveBountyAmount(s,'B','inhibitor'),0);assert.equal(objectiveBountyAmount(s,'B','nexus'),0);
});
test('objective bonuses scale with deficit, lesser objectives pay less, all payments are capped at 1000',()=>{
 const s=trailing();assert(objectiveBountyAmount(s,'B','dragon')>objectiveBountyAmount(s,'B','tower'));creditTeam(s,'R',50000);for(const kind of ['dragon','baron','elder','tower','nexusTower'])assert(objectiveBountyAmount(s,'B',kind)<=1000);
});
test('an available nexus finish is attempted before an immediately due objective and never fabricates a win',()=>{
 const s=createMatchState(input,2);s.clock=35;s.structures.R.lanes.mid.towers=[0,0,0];s.structures.R.lanes.mid.inhibitor=0;s.structures.R.lanes.mid.inhibitorUntil=40;s.structures.R.nexusTowers=[0,0];s.structures.R.nexus=500;s.timers.dragon=35;s.timers.grubs=null;s.timers.baron=36;s.nextMacro=40;
 assert.equal(finishingPlan(s).team,'B');const start=s.events.length;advanceMatch(s,{controlledTeam:'B',maxEvents:1});assert(s.finished);assert.equal(s.winner,'B');assert.equal(s.events[start].kind,'finish-push');assert.equal(s.events.at(-1).rift.structures.R.nexus,0);assert(!s.events.slice(start).some(e=>e.kind==='objective-setup'));
});
test('a full healthy base and living waveclear defenders do not trigger an invented finishing opportunity',()=>{
 const s=createMatchState(input,4);s.clock=25;assert.equal(finishingPlan(s),null);s.structures.R.lanes.mid.towers=[0,0,0];s.structures.R.lanes.mid.inhibitor=0;s.structures.R.lanes.mid.inhibitorUntil=30;assert.equal(finishingPlan(s),null);
});
test('Baron and decisive non-objective fights can take multiple turrets and spread across prepared lanes',()=>{
 let baron=false,big=false,multiple=false;for(let seed=1;seed<=80;seed++){
  const o=simulateMatch(input,matchRandom(seed));for(const e of o.events){baron ||= e.campaign?.reason==='baron'&&e.campaign.lanes>1;big ||= e.campaign?.bigWin&&e.campaign.lanes>1;multiple ||= e.push?.structures.filter(b=>b.destroyed&&['tower','nexusTower'].includes(b.kind)).length>=2;if(e.campaign){assert(e.campaign.lanes<=3);assert(e.campaign.alive>0);}}
 }assert(baron);assert(big);assert(multiple);
});
test('fresh waves and surviving defenders change how far an identical siege can push',()=>{
 const a=createMatchState(input,5),b=structuredClone(a);a.clock=b.clock=30;a.wavePressure.B.mid=1;b.wavePressure.B.mid=.05;const x=attackStructures(a,'B',{lane:'mid',rng:()=>.5}),y=attackStructures(b,'B',{lane:'mid',rng:()=>.5});assert(x.damage>y.damage);
 const c=createMatchState(input,5);c.clock=30;c.respawnAt.BTOP=c.clock+1;c.respawnAt.BJGL=c.clock+1;assert(siegeBaseDamage(c,'B').survivors===3);
});
test('persistent power-play state identifies the objective capturer, not the teamfight winner, and expires correctly',()=>{
 const s=createMatchState(input,8);s.clock=25;grantTemporaryBuff(s,'baron','R');const capture={minute:25,second:1500,kind:'baron',combatTeam:'B',objective:{kind:'baron',team:'R',steal:true},gold:{B:40000,R:42000},objectiveState:objectiveSnapshot(s)},later={minute:26,second:1560,kind:'farm',gold:{B:41000,R:45000},objectiveState:objectiveSnapshot(s)},set={blue:'B',red:'R'};
 assert.equal(powerPlayState(set,[capture,later],0,.5,1500).length,0);const card=powerPlayState(set,[capture,later],1,1,1560)[0];assert.equal(card.team,'R');assert.equal(card.kind,'baron');assert.equal(card.seconds,120);assert.equal(card.gold,2000);assert.equal(powerPlayState(set,[capture,later],1,1,1680).length,0);
});
test('major objective result stays readable at x8 while ordinary scenes retain chosen playback speed',()=>{
 const scene={kind:'baron',objective:{kind:'baron'}};assert.equal(playbackIncrement(scene,.8,100,8),playbackIncrement(scene,.8,100,1));assert(playbackIncrement({kind:'farm'},.8,100,8)>playbackIncrement(scene,.8,100,8)*20);
});
test('v8 replay stays frozen; an upgraded live prefix preserves RNG/history and its mixed replay exactly',()=>{
 const old=v8.simulateMatch(input,matchRandom(93));assert.equal(createHash('sha256').update(JSON.stringify(old)).digest('hex'),'dad6a1396eca5021b2379281ab80a19dbcd81b800331743a98cc622f681a7c0e');assert.deepEqual(replayMatch({...input,model:'event-v8',seed:93}),old);
 const s=v8.createMatchState({...input,model:'event-v8',seed:123},123);v8.advanceMatch(s,{controlledTeam:'B'});v8.advanceMatch(s,{controlledTeam:'B',action:'trade'});const before=JSON.stringify(s.events),rng=s.rng;upgradeMatchState(s);assert.equal(JSON.stringify(s.events),before);assert.equal(s.rng,rng);advanceMatch(s,{auto:true});assert.deepEqual(replayMatch({...input,model:'event-v9',seed:123,upgradeFrom8AtEventCount:JSON.parse(before).length,decisionOverrides:s.decisions}),simulateMatch({...input,model:'event-v9',upgradeFrom8AtEventCount:JSON.parse(before).length,decisionOverrides:s.decisions},matchRandom(123)));
});

test('minimap uses revealed capture history for camp disappearance, cooldown and soul-to-Elder transition',()=>{
 const opening={kind:'opening',second:0,grubs:{B:0,R:0},objectiveState:{next:'infernal'}},grubs={second:520,objective:{kind:'grubs'},grubs:{B:3,R:0},objectiveState:{next:'infernal'}},dragon={second:1800,objective:{kind:'dragon'},grubs:{B:3,R:0},objectiveState:{next:'elder',soul:'B'}},baron={second:1850,objective:{kind:'baron'},grubs:{B:3,R:0},objectiveState:{next:'elder',soul:'B'}},timeline=[opening,grubs,dragon,baron];
 assert.equal(minimapObjectives(timeline,1,.5,510).upper.gone,false);assert.equal(minimapObjectives(timeline,1,1,520).upper.gone,true);
 const next=minimapObjectives(timeline,3,1,1860);assert.equal(next.upper.kind,'baron');assert.equal(next.upper.available,false);assert.equal(next.upper.remaining,350);assert.equal(next.lower.kind,'elder');assert.equal(next.lower.remaining,300);
 assert(minimapObjectives(timeline,3,1,2210).upper.available);assert(minimapObjectives(timeline,3,1,2160).lower.available);
});
