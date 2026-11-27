import {deathTimerSeconds} from './death-timer.js';
import * as legacyV10 from './match-sim-v10.js';
import {initializeEconomy,killReward,settleDeathBounty,markBusy,botQuestReward} from './match-economy.js';
import {LANING_END,laneEvent,lanePressure,localFightChance,dragonLaneControl,addFightDamage} from './laning.js';
import {laneCounterEdge} from './lane-counters.js';
import {estimateChampionDamage} from './champion-damage.js';
import * as legacyV9 from './match-sim-v9.js';
import {initializeBounties,updateBounties,claimObjectiveBounty} from './objective-bounties.js';
import * as legacyV8 from './match-sim-v8.js';
import {replayMatch as replayArchived,goldInfluence,battleFactors,battleProbability,matchRandom} from './match-sim-v4.js';
import {compositionMatchup} from './composition.js';
import {phaseStrength} from './champion-combat.js';
import {macroProfile,objectiveChances,automaticObjectiveDecision,OBJECTIVE_NAMES} from './macro-objectives.js';
import * as legacyV7 from './match-sim-v7.js';
import * as legacyV6 from './match-sim-v6.js';
import {initializeRift,creditPlayer,creditTeam,farmPlayers,tickRift,gainVision,visionFightGap,visionControl,pushLane,attackStructures,pushNarration,riftSnapshot,superPressure,finishingPlan,closingPressurePlan,collectSideResources} from './rift-state.js';
import * as legacyV5 from './match-sim-v5.js';
import {initializeObjectives,takeDragon,grantTemporaryBuff,loseBuffsOnDeath,buffCoverage,objectivePower,structurePressure,objectiveSnapshot,DRAKES} from './objective-effects.js';
export {goldInfluence,battleFactors,battleProbability,matchRandom};
export const SIMULATION_MODEL='event-v18';
const LANE_SIMULATION_MODELS=['event-v11','event-v12','event-v13','event-v14','event-v15','event-v16','event-v17',SIMULATION_MODEL];
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const sigmoid=x=>1/(1+Math.exp(-x));
const round=n=>Math.round(n*1000)/1000;
function draw(s,external){if(external)return external();let t=s.rng=(s.rng+0x6D2B79F5)>>>0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;}
function weighted(entries,rng){let roll=rng()*entries.reduce((n,[,w])=>n+w,0);return entries.find(([,w])=>(roll-=w)<=0)?.[0]??entries.at(-1)[0];}
function shuffle(items,rng){items=[...items];for(let i=items.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[items[i],items[j]]=[items[j],items[i]];}return items;}
const enemy=(s,id)=>s.teams.find(t=>t!==id);
const name=(s,id)=>s.input.teamNames?.[id]??id;
const comp=(s,id)=>id===s.input.blue?s.input.compositionBlue:s.input.compositionRed;
const nextGap=(s,rng)=>.95+rng()*1.65+(1-(s.macros[0].aggression+s.macros[1].aggression)/2)*.65;
function macro(s,id){return s.macros[s.teams.indexOf(id)];}
function farming(s,minute,rng){
 if(s.version>=15&&s.events.length)minute=Math.max(minute,(s.events.at(-1).second+1)/60);
 const delta=Math.max(0,minute-s.clock);tickRift(s,minute);s.clock=round(minute);farmPlayers(s,delta,{rng});
}
function record(s,{kind,title,location='mid',roles=null,team=null,kills=[],objective=null,...extra}){
 updateBounties(s);
 const [blue,red]=s.teams,lead=s.gold[blue]-s.gold[red],leader=Math.abs(lead)>=400?(lead>0?blue:red):null,comeback=!!leader&&!!s.lastLeader&&leader!==s.lastLeader;
 if(comeback)s.leadChanges++;if(leader)s.lastLeader=leader;
 s.minLead[blue]=Math.min(s.minLead[blue],lead);s.minLead[red]=Math.min(s.minLead[red],-lead)||0;
 const e={minute:s.clock,second:Math.round(s.clock*60),kind,type:kind==='opening'?'start':kind==='nexus'?'end':'event',title:comeback&&kind!=='nexus'?'골드 역전 · '+title:title,location,...(roles?{roles}:{}),team,kills,objective,lead,gold:{...s.gold},score:{...s.score},dragons:{...s.dragons},grubs:{...s.grubs},comeback,objectiveState:objectiveSnapshot(s),rift:riftSnapshot(s),...extra};
 e.text=extra.text??(kind==='opening'?'양 팀이 라인과 정글 동선을 선택합니다.':kind==='objective-setup'?`${OBJECTIVE_NAMES[s.pending?.kind]??'오브젝트'} 앞에서 교전 또는 자원 교환을 준비합니다.`:kind==='recall'?'선수들이 귀환해 정비하고 다음 동선을 선택합니다.':kind==='nexus'?`${name(s,team)}이 넥서스를 파괴합니다.`:objective?`${name(s,team)}이 ${OBJECTIVE_NAMES[objective.kind]??'포탑'}${objective.count?` ${objective.count}마리`:''}${objective.steal?'을 스틸합니다.':'을 확보합니다.'}`:kills.length?`${name(s,team)}이 교전에서 ${kills.filter(k=>s.stats.find(p=>p.player===k.killer)?.team===team).length}킬을 만들었습니다.`:`${name(s,team)}이 ${kind==='split'?'사이드 압박':kind==='vision'?'시야와 진입로 통제':'라인·정글 자원 확보'}로 운영합니다.`);
 if(e.championSynergies?.length)e.text+=' 조합 연계 · '+e.championSynergies.map(combo=>name(s,combo.team)+' '+(combo.powerSpike?'강한 구간 · ':'')+combo.label).join(' / ')+'.';
 if(e.bounty)e.text+=` 제압·오브젝트 보상 ${e.bounty}G.`;s.events.push(e);return e;
}
export function createMatchState(input,seed=0,external){
 const snapshot=structuredClone(input),{blue,red}=snapshot,teams=[blue,red],zeros=()=>Object.fromEntries(teams.map(id=>[id,0]));
 const version=Number((LANE_SIMULATION_MODELS.includes(input.model)?input.model:SIMULATION_MODEL).slice(7));
 const s={version,input:snapshot,rng:seed>>>0,teams,clock:0,stats:snapshot.roster.map(p=>({team:p.team,role:p.role,player:p.player,champion:p.champion,k:0,d:0,a:0})),gold:{[blue]:2500,[red]:2500},score:zeros(),dragons:zeros(),grubs:zeros(),heralds:zeros(),barons:zeros(),elders:zeros(),baronUntil:zeros(),elderUntil:zeros(),momentum:zeros(),minLead:zeros(),events:[],lastLeader:null,leadChanges:0,winner:null,finished:false,pending:null,window:0,decisions:[],soul:null,steps:0};
 s.powerGap=(input.teamStrengthBlue??input.bluePower)-(input.teamStrengthRed??input.redPower);s.championGap=input.bluePower-input.redPower-s.powerGap;
 s.macros=[macroProfile(blue,input.compositionBlue,input.blueStrategy),macroProfile(red,input.compositionRed,input.redStrategy)];
 const rng=()=>draw(s,external),delay=()=>.3+rng()*1.4+(1-(s.macros[0].objective+s.macros[1].objective)/2)*.8;
 s.timers={dragon:5+delay(),grubs:input.objectiveEra===2022?null:8+delay(),herald:null,baron:20+delay(),elder:null};s.nextMacro=2.4+rng()*1.3;
 initializeObjectives(s,rng);initializeRift(s);initializeBounties(s);s.respawnAt={};initializeEconomy(s);
 if(version>=15){
  s.timers.dragon+=.65+rng()*.7;
  s.farmReturnAt={};s.duoKillAt={};s.lastLaneRoll=1.65;
  s.laneForm=Object.fromEntries(s.stats.map(p=>[p.player,(rng()-.5)*10]));
  if(version===15)for(const p of s.stats)p.damage=0;
 }
 const matchup=compositionMatchup(input.compositionBlue,input.compositionRed,0,'teamfight',{synergies:version>=12,synergySpikes:version>=13,expandedSynergies:version>=14});s.initialBlueProbability=battleProbability({powerGap:s.powerGap,championGap:s.championGap,compositionGap:matchup.gap});
 record(s,{kind:'opening',title:'라인 배치'});return s;
}
function combatEstimate(s,minute,kind,roles=null,execution=0,participants=null){
 const [blue,red]=s.teams,lead=s.gold[blue]-s.gold[red];
 const blueStats=s.stats.filter(p=>p.team===blue),redStats=s.stats.filter(p=>p.team===red);
 const options={blueStats,redStats,roles,synergies:s.version>=12,synergySpikes:s.version>=13,expandedSynergies:s.version>=14};
 if(options.synergies){
  const absent=players=>players.filter(p=>(s.respawnAt[p.player]??0)>minute||participants&&!participants[p.team].includes(p)).map(p=>p.champion);
  options.blueAbsent=absent(blueStats);options.redAbsent=absent(redStats);
 }
 const composition=id=>{
  const draft=comp(s,id);return participants&&draft?{...draft,members:participants[id].map(p=>[p.champion,p.role])}:draft;
 };
 const matchup=compositionMatchup(composition(blue),composition(red),minute,kind,options);
 const strategy=(plan)=>plan==='early'?clamp((18-minute)/12,-.4,1)*1.4:plan==='late'?clamp((minute-16)/18,-.5,1)*1.4:0;
 const effects=[objectivePower(s,blue,minute,kind,roles),objectivePower(s,red,minute,kind,roles)],buffGap=effects[0].total-effects[1].total;
 const scaleGap=comp(s,blue)&&comp(s,red)?0:((s.input.scaleBlue??0)-(s.input.scaleRed??0))*.9;
 const visionGap=visionFightGap(s,['dragon','elder'].includes(kind)?'dragon':['baron','grubs'].includes(kind)?'baron':s.battleLocation??'mid');
 const factors=battleFactors({powerGap:s.powerGap,championGap:s.championGap,lead,minute,compositionGap:matchup.gap,scaleGap,buffGap:buffGap+visionGap,execution,strategyGap:strategy(s.input.blueStrategy)-strategy(s.input.redStrategy)});
 return {probability:factors.probability,matchup,factors,effects,visionGap};
}
export function objectivePreview(s){
 if(s.version===10)return legacyV10.objectivePreview(s);if(s.version===9)return legacyV9.objectivePreview(s);if(s.version===5)return legacyV5.objectivePreview(s);if(s.version===6)return legacyV6.objectivePreview(s);if(s.version===7)return legacyV7.objectivePreview(s);if(s.version===8)return legacyV8.objectivePreview(s);
 if(!s.pending)return null;const p=s.pending,[blue,red]=s.teams,c=combatEstimate(s,p.minute,p.kind,p.roles);
 const secure=objectiveChances({blue,red,roster:s.stats,stats:s.stats,roles:p.roles,skills:s.input.smiteSkills??[75,75],fightChance:c.probability,visionGap:visionFightGap(s,['grubs','baron'].includes(p.kind)?'baron':'dragon')/3.6});
 return {...p,tradePolicy:'earned',tradeRange:[0,350],tradeFarmMax:350,redTradeFarmMax:350,tradePlan:Object.fromEntries(s.teams.map(id=>[id,tradePlan(s,id,p.kind)])),objectiveBounty:s.objectiveBounty?.team??null,fightChance:c.probability,secureChance:secure.blueChance,secure,dragons:{...s.dragons},grubs:{...s.grubs},gold:{...s.gold},macros:s.macros.map(m=>m.label),dragonType:s.dragonType,riftType:s.riftType,soul:s.soul,objectiveState:objectiveSnapshot(s),buffPower:c.effects,vision:s.teams.map(id=>Math.round(visionControl(s,id,['grubs','baron'].includes(p.kind)?'baron':'dragon'))),visionFightGap:c.visionGap};
}
function chooseAuto(s,id,preview){const blue=id===s.teams[0];return automaticObjectiveDecision({chance:blue?preview.secureChance:1-preview.secureChance,kind:preview.kind,ownDragons:s.dragons[id],enemyDragons:s.dragons[enemy(s,id)],macro:macro(s,id)});}
export function objectiveTradeReward(){return 350;}
function tradePlan(s,id,kind){
 const lane=['dragon','elder'].includes(kind)?'top':'bot',roles=lane==='top'?['TOP','MID']:['BOT','SUP'];
 return {lane,roles,resourceMaximum:350};
}
function battle(s,kind,location,roles,rng,laneFight=null){
 s.battleLocation=location;
 const [blue,red]=s.teams,before=s.gold[blue]-s.gold[red],c=combatEstimate(s,s.clock,kind,roles,(rng()-rng())*3.5,laneFight?.participants),byId=Object.fromEntries(s.stats.map(p=>[p.player,p])),pools=laneFight?.participants??Object.fromEntries(s.teams.map(id=>[id,s.stats.filter(p=>p.team===id&&(!roles||roles.includes(p.role))&&(s.respawnAt[p.player]??0)<=s.clock)]));
 const gank=laneFight&&kind==='gank',localOdds=laneFight?localFightChance(s,location,pools,gank?laneFight.attacker:null):c.probability;
 const roll=rng(),winner=!pools[blue].length?red:!pools[red].length?blue:laneFight&&!gank?laneFight.attacker:roll<localOdds?blue:red,loser=enemy(s,winner),quotes=Object.fromEntries(s.stats.map(p=>[p.player,killReward(s,p)]));
 const elder=buffCoverage(s,'elder',winner,s.clock,roles),extraExecute=elder>0&&rng()<elder*.65;
 const max=roles?Math.min(2,pools[loser].length):s.clock<15?3:5;
 const wins=pools[winner].length?Math.min(pools[loser].length,laneFight?1+(gank&&location==='bot'&&rng()<.24?1:0):1+Math.floor(rng()*max)+(extraExecute?1:0)):0;
 const losses=Math.min(pools[winner].length,laneFight?Number(!!gank&&rng()<.17):Math.max(0,Math.floor(rng()*Math.min(wins,3))-(elder>0?1:0))),kills=[];let bounty=0;
 for(const[id,count]of[[winner,wins],[loser,losses]])for(const[victim,index]of shuffle(pools[enemy(s,id)],rng).slice(0,count).map((p,i)=>[p,i])){
  const elderPool=pools[id].filter(p=>s.buffHolders.elder[id].includes(p.player)),killerPool=id===winner&&extraExecute&&index===wins-1&&elderPool.length?elderPool:pools[id];if(!killerPool.length)continue;
  const killer=weighted(killerPool.map(p=>[p,{TOP:2,JGL:2.2,MID:3,BOT:3.2,SUP:.7}[p.role]??1]),rng),assists=shuffle(pools[id].filter(p=>p.player!==killer.player),rng).slice(0,Math.min(pools[id].length-1,1+Math.floor(rng()*4))).map(p=>p.player),reward={...quotes[victim.player],firstBlood:s.firstBloodClaimed?0:100};
  s.firstBloodClaimed=true;kills.push({killer:killer.player,victim:victim.player,assists,gold:{kill:reward.base,assists:assists.length?reward.assistPool:0,shutdown:reward.shutdown,firstBlood:reward.firstBlood},...(id===winner&&extraExecute&&index===wins-1?{elderExecute:true}:{})});
  byId[killer.player].k++;byId[victim.player].d++;for(const pid of assists)byId[pid].a++;s.score[id]++;
  creditPlayer(s,killer.player,reward.base,{source:'kills'});creditPlayer(s,killer.player,reward.shutdown,{source:'shutdown'});creditPlayer(s,killer.player,reward.firstBlood,{source:'firstBlood'});
  let left=reward.assistPool;assists.forEach((pid,i)=>{const amount=i===assists.length-1?left:Math.floor(reward.assistPool/assists.length);left-=amount;creditPlayer(s,pid,amount,{source:'assists'});});
  if(s.version>=15)for(const pid of [killer.player,...assists]){
   const quest=botQuestReward(s,byId[pid],{takedown:true});if(quest)creditPlayer(s,pid,quest,{source:'roleQuest'});
  }
  bounty+=reward.shutdown;
 }
 for(const k of kills){s.deathAt[k.victim]=s.clock;s.respawnAt[k.victim]=s.clock+deathTimerSeconds(byId[k.victim].level,s.clock)/60;k.respawnAtSecond=Math.round(s.respawnAt[k.victim]*60);settleDeathBounty(s,byId[k.victim],{base:k.gold.kill,shutdown:k.gold.shutdown},k.gold.assists);}
 if(s.version>=15){
  for(const k of kills)s.farmReturnAt[k.victim]=s.respawnAt[k.victim]+(s.clock<LANING_END?.26:0);
  if(s.version===15)addFightDamage(s,pools,kills,kind);
 }
 markBusy(s,[...pools[blue],...pools[red]],s.clock+.18);loseBuffsOnDeath(s,kills.map(k=>k.victim));s.momentum[winner]++;s.momentum[loser]=0;
 const info={combatTeam:winner,leadBefore:before,blueWinProbability:localOdds,goldWeight:c.factors.goldWeight,compositionGap:c.matchup.gap,teamStrengthGap:s.powerGap,bounty,championPhaseGap:c.matchup.phaseGap,championFormGap:c.matchup.formGap,objectiveBuffGap:c.effects[0].total-c.effects[1].total,visionFightGap:c.visionGap,elderExecutions:kills.filter(k=>k.elderExecute).length};
 if(c.matchup.driver){const p=c.matchup.driver;info.championFormImpact=[p.side,p.champion,p.k,p.d,p.a,Math.round(p.performance*100)/100];}
 if(s.version>=12){
  const strongest=[
   [blue,c.matchup.blueCombos?.matches[0]],
   [red,c.matchup.redCombos?.matches[0]]
  ].filter(([,combo])=>combo).map(([team,combo])=>({team,key:combo.key,label:combo.label,...(s.version>=13&&combo.spike>0.1?{powerSpike:true}:{})}));
  if(strongest.length)info.championSynergies=strongest;
 }
 return {winner,loser,kills,bounty,winnerKills:wins,dead:kills.map(k=>k.victim),info};
}
function objectiveRoles(s,kind){
 if(s.version>=15&&kind==='dragon'&&s.clock<LANING_END)return ['JGL','MID','BOT','SUP'];
 if(!['grubs','herald'].includes(kind))return null;
 return(s.macros[0].vision+s.macros[1].vision)/2>.72?['TOP','JGL','MID','SUP']:['TOP','JGL','MID'];
}
function nextObjective(s){
 if(s.timers.grubs!==null&&(s.clock>14.75||s.timers.grubs>14.75))s.timers.grubs=null;if(s.timers.herald!==null&&(s.clock>19.5||s.timers.herald>19.5))s.timers.herald=null;
 return Object.entries(s.timers).filter(([,time])=>time!==null).sort((a,b)=>a[1]-b[1])[0]??null;
}
function prepareObjective(s,kind,time,rng){
 const minute=Math.ceil(Math.max(time,s.clock+.2)*1000)/1000;s.pending={id:s.window++,kind,minute,roles:objectiveRoles(s,kind),...(kind==='dragon'?{dragonType:s.dragonType}:{} )};
 farming(s,minute-.08,rng);record(s,{kind:'objective-setup',title:`${OBJECTIVE_NAMES[kind]} · 운영 결정`,location:['grubs','herald','baron'].includes(kind)?kind:'dragon',roles:s.pending.roles,decisionSecond:Math.round(minute*60)});
}
function awardObjective(s,kind,owner,rng,dead=[]){
 const gold={dragon:300,grubs:30,herald:100,baron:850,elder:850}[kind],bounty=claimObjectiveBounty(s,owner,kind);creditTeam(s,owner,gold,{kind:'objective',source:'objectives'});creditTeam(s,owner,bounty,{source:'objectiveBounty'});
 if(kind==='grubs')s.grubs[owner]++;
 if(kind==='dragon')takeDragon(s,owner,rng);
 if(kind==='herald')s.heralds[owner]++;
 if(kind==='baron'){s.barons[owner]++;grantTemporaryBuff(s,'baron',owner,dead);}
 if(kind==='elder'){s.elders[owner]++;grantTemporaryBuff(s,'elder',owner,dead);}
 return {kind,team:owner,...(kind==='dragon'?{soul:s.soul===owner}:{}),bounty};
}
function takeLaningDragon(s,time,rng){
 const [blue,red]=s.teams,first=s.dragons[blue]+s.dragons[red]===0,drake=s.dragonType;
 const control=dragonLaneControl(s);
 if(!first&&control.blueReady&&control.redReady&&rng()>=control.concessionChance)return false;
 farming(s,Math.max(time,s.clock+.2),rng);
 const {blueReady,redReady,blueChance}=dragonLaneControl(s);
 if(!blueReady&&!redReady){s.timers.dragon=s.clock+.5;return true;}
 const owner=rng()<blueChance?blue:red;
 const helpers=s.stats.filter(p=>p.team===owner&&['JGL','BOT','SUP'].includes(p.role)&&(s.respawnAt[p.player]??0)<=s.clock);
 markBusy(s,helpers,s.clock+.18);gainVision(s,owner,'dragon',7);
 for(const p of helpers){const quest=botQuestReward(s,p,{points:30});if(quest)creditPlayer(s,p.player,quest,{source:'roleQuest'});}
 const reward=awardObjective(s,'dragon',owner,rng);
 s.timers.dragon=s.clock+5+.4+rng()*.85;
 record(s,{kind:'dragon',title:`${name(s,owner)} · ${first?'첫':'두 번째'} 드래곤 무교전 확보`,location:'dragon',team:owner,participants:helpers.map(p=>p.player),
  objective:{...reward,dragonType:drake,startedBy:owner,contested:false},objectiveChance:round(blueChance),objectiveMode:'lane-control',
  objectiveBountyGold:reward.bounty,bounty:reward.bounty,
  text:`${name(s,owner)}이 하단 라인 상황과 정글 동선을 이용해 교전 없이 ${DRAKES[drake].name}용을 확보합니다.`});
 s.nextMacro=Math.max(s.nextMacro,s.clock+.35);return true;
}
function resolveObjective(s,action,controlledTeam,rng){
 const p=s.pending,preview=objectivePreview(s),[blue,red]=s.teams,override=(s.input.decisionOverrides??[]).find(x=>x[0]===p.id),actions=Object.fromEntries(s.teams.map(id=>[id,chooseAuto(s,id,preview)]));
 if(s.version>=15&&p.kind==='dragon'&&s.dragons[blue]+s.dragons[red]===1&&Math.abs(s.gold[blue]-s.gold[red])<4500){
  actions[blue]='contest';actions[red]='contest';
 }
 if(override){actions[override[1]]=override[2];s.decisions.push(override);}
 if(controlledTeam&&action&&action!=='auto'){actions[controlledTeam]=action;s.decisions.push([p.id,controlledTeam,action]);}
 const traders=s.teams.filter(id=>actions[id]==='trade'),fighters=s.teams.filter(id=>actions[id]==='contest');farming(s,p.minute,rng);
 if(!fighters.length){s.timers[p.kind]=s.clock+1.2+rng();record(s,{kind:'trade',title:`${OBJECTIVE_NAMES[p.kind]} 보류 · 양 팀 자원 교환`,location:'mid',team:blue,text:'양 팀이 오브젝트를 보류합니다. 양보한 오브젝트가 없어 추가 교환 보상 없이 기본 파밍만 진행합니다.',decisions:actions,tradeGold:{}});s.pending=null;return;}
 const tradeGold={};markBusy(s,s.stats.filter(player=>fighters.includes(player.team)&&(!p.roles||p.roles.includes(player.role))),s.clock+.35);
 const rush=fighters.length===2&&rng()<.3,rushSecure=rush?objectiveChances({blue,red,roster:s.stats,stats:s.stats,roles:p.roles,skills:s.input.smiteSkills??[75,75],fightChance:preview.fightChance,control:'rush',visionGap:visionFightGap(s,['grubs','baron'].includes(p.kind)?'baron':'dragon')/3.6}):null,c=fighters.length===2?battle(s,p.kind,['grubs','herald','baron'].includes(p.kind)?p.kind:'dragon',p.roles,rng):null;
 const secure=rushSecure??objectiveChances({blue,red,roster:s.stats,stats:s.stats,dead:rush?[]:s.stats.filter(p=>(s.respawnAt[p.player]??0)>s.clock).map(p=>p.player),roles:p.roles,skills:s.input.smiteSkills??[75,75],fightChance:preview.fightChance,control:rush?'rush':c?.winner===blue?'blue':'red',setup:rush?1:.65,visionGap:visionFightGap(s,['grubs','baron'].includes(p.kind)?'baron':'dragon')/3.6});
 const initiator=c?(rush?(preview.secureChance>=.5?blue:red):c.winner):fighters[0],count=p.kind==='grubs'?3:1,owners=[];
 for(let n=0;n<count;n++)owners.push(fighters.length===1?fighters[0]:rng()<secure.blueChance?blue:red);
 const totals=Object.fromEntries(s.teams.map(id=>[id,owners.filter(owner=>owner===id).length])),main=totals[blue]>totals[red]?blue:red,steal=owners.some(owner=>owner!==initiator);let reward;
 for(const owner of owners)reward=awardObjective(s,p.kind,owner,rng,c?.dead??[]);
 if(s.version>=15){
  const carry=s.stats.find(player=>player.team===main&&player.role==='BOT'&&fighters.includes(main)&&(!p.roles||p.roles.includes('BOT'))&&(s.respawnAt[player.player]??0)<=s.clock);
  if(carry){const quest=botQuestReward(s,carry,{points:30});if(quest)creditPlayer(s,carry.player,quest,{source:'roleQuest'});}
 }
 if(p.kind==='grubs'||p.kind==='herald')s.timers[p.kind]=null;
 else if(p.kind==='dragon'&&!s.soul)s.timers.dragon=s.clock+5+.3+rng()*.7;
 else if(p.kind==='baron'||p.kind==='elder')s.timers[p.kind]=s.clock+6+.3+rng()*.7;
 const objective={kind:p.kind,team:main,steal,startedBy:initiator,...(p.kind==='grubs'?{allocation:totals,count:totals[main]}:{}),...(p.kind==='dragon'?{soul:s.soul===main,dragonType:p.dragonType,soulType:s.soul===main?s.riftType:null}:{}),contested:fighters.length===2};
 const detail=p.kind==='grubs'?`${name(s,blue)} ${totals[blue]}마리 / ${name(s,red)} ${totals[red]}마리`:fighters.length===1?`${name(s,fighters[0])}이 무교전 확보`:rush?'오브젝트 마무리·강타 경합':'교전 후 정글러 생존·마무리 경합';
 record(s,{kind:p.kind,title:`${name(s,main)} · ${OBJECTIVE_NAMES[p.kind]}${steal?' 스틸':p.kind==='grubs'?' 분배':' 확보'}`,location:['grubs','herald','baron'].includes(p.kind)?p.kind:'dragon',roles:p.roles,team:main,kills:c?.kills??[],objective,...c?.info,bounty:(c?.bounty??0)+(reward?.bounty??0),objectiveBountyGold:reward?.bounty??0,decisions:actions,tradePlanned:tradeGold,tradeGold:{},objectiveChance:fighters.length===1?(fighters[0]===blue?1:0):round(secure.blueChance),objectiveMode:rush?'rush':c?'fight-first':'uncontested',text:`${name(s,main)}이 ${OBJECTIVE_NAMES[p.kind]}${steal?' 스틸':' 확보'}! ${detail}. ${p.kind==='dragon'?`${DRAKES[p.dragonType].name}용 중첩: ${DRAKES[p.dragonType].stack}.${s.soul===main?` ${DRAKES[s.riftType].name} 영혼 완성! 6분 뒤 장로용이 등장합니다.`:''}`:p.kind==='elder'?'장로 화상·처형 강화 150초.':p.kind==='baron'?'바론 미니언·공성 강화 180초.':p.kind==='grubs'?'유충 포탑 지속 피해 강화. 독식 3마리는 진드기 소환.':''} ${traders.map(id=>`${name(s,id)}은 반대편 라인으로 이동해 실제 자원과 포탑을 노립니다.`).join(' ')}`});
 s.pending=null;
 for(const id of traders){
  const plan=preview.tradePlan[id];farming(s,s.clock+.45+rng()*.2,rng);
  const resources=collectSideResources(s,id,{lane:plan.lane,rng,maximum:350}),push=attackStructures(s,id,{lane:plan.lane,roles:plan.roles,rng,trade:true,uncontested:true});
  const total=resources.gold+push.gold;gainVision(s,id,plan.lane,push.structures.some(x=>x.destroyed)?18:5);markBusy(s,s.stats.filter(p=>p.team===id&&plan.roles.includes(p.role)),s.clock+.2);
  record(s,{kind:'trade-push',title:`${name(s,id)} · 오브젝트 대신 ${plan.lane==='top'?'탑':'바텀'} 압박`,location:plan.lane,roles:plan.roles,team:id,push,sideResources:resources,tradeGold:{[id]:total},tradeFarmGold:{[id]:resources.gold},tradeStructureGold:{[id]:push.gold},text:`${pushNarration(push)} 추가 라인 ${resources.lane}G·정글 ${resources.jungle}G, 실제 교환 수입 +${total}G${push.bounty?` · 현상금 별도 +${push.bounty}G`:''}. 포탑을 파괴하지 못하면 포탑 보상은 없습니다.`});
  if(s.structures[enemy(s,id)].nexus===0){finishMatch(s,id,rng);break;}
 }
 if(!s.finished&&p.kind==='baron'&&buffCoverage(s,'baron',main)>0){farming(s,s.clock+.22,rng);resolveCampaign(s,main,rng,{dead:c?.dead??[],uncontested:!c||c.winner===main,baron:true});}
 s.nextMacro=Math.max(s.nextMacro,s.clock+.5);
}
function resolvePush(s,id,rng,{lane=null,dead=[],uncontested=false,baron=false,finishAttempt=false,damageScale=1,maxStructures=7,campaign=null,duration=0,consumeWave=true}={}){
 lane=pushLane(s,id,rng,lane);const push=attackStructures(s,id,{lane,rng,dead,uncontested,damageScale,maxStructures,roles:campaign?.roles??null,consumeWave});if(duration)farming(s,s.clock+duration/60,rng);
 record(s,{kind:finishAttempt?'finish-push':push.blocked?'waveclear':baron?'baron-push':'siege',title:`${name(s,id)} · ${finishAttempt?'넥서스 우선 공성':push.blocked?'미니언 정리에 막힌 공성':baron?'바론 강화 공성':'구조물 압박'}`,location:lane,roles:campaign?.roles??null,team:id,push,finishAttempt,campaign,objective:push.structures.some(x=>x.destroyed)?{kind:push.structures.find(x=>x.destroyed).kind,team:id}:null,text:(campaign?`${campaign.reason==='baron'?'바론 운영':campaign.reason==='teamfight'?'대승 후 운영':'공성 전환'} · ${campaign.index}/${campaign.lanes}개 라인 전환. `:'')+pushNarration(push)});
 if(s.structures[enemy(s,id)].nexus===0)finishMatch(s,id,rng);
 return push;
}
function resolveCampaign(s,id,rng,{dead=[],uncontested=false,baron=false,bigWin=false,lane=null}={}){
 const alive=s.stats.filter(p=>p.team===id&&(s.respawnAt[p.player]??0)<=s.clock).length,enemyDead=s.stats.filter(p=>p.team===enemy(s,id)&&(s.respawnAt[p.player]??0)>s.clock).length;
 if(!alive)return;
 const maxLanes=enemyDead>=4?1:alive>=4?(baron?(alive===5&&macro(s,id).split>=.7?3:2):bigWin&&enemyDead>=3?2:1):1,preferred=pushLane(s,id,rng,lane),lanes=[preferred,...['top','mid','bot'].filter(l=>l!==preferred).sort((a,b)=>(s.wavePressure?.[id]?.[b]??.6)-(s.wavePressure?.[id]?.[a]??.6))].filter((l,i)=>i===0||(s.wavePressure?.[id]?.[l]??.6)>=.45).slice(0,maxLanes);
 let buildings=baron?4:bigWin?3:1;
 for(let index=0;index<lanes.length&&!s.finished&&buildings>0;index++){
  const finish=finishingPlan(s);if(finish?.team===id){resolveClosing(s,finish,rng);return;}
  if(index)farming(s,s.clock+(lanes[index-1]!=='mid'&&lanes[index]!=='mid'?.4:.18),rng);
  const pushMinutes=bigWin?.5:baron?.35:.25;farming(s,s.clock+pushMinutes,rng);const currentDead=s.stats.filter(p=>(s.respawnAt[p.player]??0)>s.clock).map(p=>p.player),currentEnemyDead=s.stats.filter(p=>p.team===enemy(s,id)&&currentDead.includes(p.player)).length;
  if(index&&baron&&!buffCoverage(s,'baron',id)&&currentEnemyDead<2)break;const scales=lanes.length===1?[1]:[1,1,1];
  const push=resolvePush(s,id,rng,{lane:lanes[index],dead:currentDead,uncontested:uncontested&&currentEnemyDead>=3,baron,damageScale:scales[index]*pushMinutes/.25,maxStructures:buildings,campaign:{reason:baron?'baron':bigWin?'teamfight':'siege',bigWin,index:index+1,lanes:lanes.length,alive,enemyDead,roles:lanes.length===3?(lanes[index]==='top'?['TOP']:lanes[index]==='bot'?['BOT']:['MID','JGL','SUP']):lanes.length===2?(index===0?['MID','BOT','SUP']:['TOP','JGL']):null,wave:s.wavePressure?.[id]?.[lanes[index]]??.6}});
  buildings-=push.structures.filter(x=>x.destroyed).length;
  if(!baron&&s.stats.filter(p=>p.team===enemy(s,id)&&(s.respawnAt[p.player]??0)>s.clock).length<2)break;
 }
}
function resolveClosing(s,plan,rng,{pressure=false}={}){
 const id=plan.team;s.lastClosingAttempt??={};s.lastClosingAttempt[id]=s.clock;
 if(plan.travel>0){farming(s,s.clock+plan.travel/60,rng);s.wavePressure[id][plan.lane]=Math.max(.6,s.wavePressure[id][plan.lane]);}
 const aliveDefenders=s.stats.filter(p=>p.team===enemy(s,id)&&(s.respawnAt[p.player]??0)<=s.clock).length;
 if(pressure&&aliveDefenders>=2){
  farming(s,s.clock+.02,rng);const c=battle(s,'siege',plan.lane,null,rng);record(s,{kind:'siege',title:`${name(s,c.winner)} · 경기 마무리 기지 교전`,location:plan.lane,team:c.winner,kills:c.kills,closingFight:true,...c.info});
  if(c.winner!==id)return;
 }
 const finish=finishingPlan(s,{team:id,atLane:plan.lane});
 if(finish?.team===id){
  const duration=Math.max(1,finish.seconds-finish.travel),scale=finish.lateScale*duration/15;
  resolvePush(s,id,rng,{lane:finish.lane,finishAttempt:true,damageScale:scale,duration,consumeWave:false});
 }else resolvePush(s,id,rng,{lane:plan.lane,damageScale:1.4,duration:15});
}
function macroEvent(s,rng){
 const [blue,red]=s.teams,lead=s.gold[blue]-s.gold[red],initiative=sigmoid(s.powerGap*.04+lead/12000+(s.macros[0].aggression-s.macros[1].aggression)*.7+visionFightGap(s)*.08),id=rng()<initiative?blue:red,m=macro(s,id),members=comp(s,id)?.members??[],phase=members.length?members.reduce((n,[ch])=>n+phaseStrength(ch,s.clock),0)/members.length:3,aggression=clamp(m.aggression+(phase-3)*.12,.15,1),baron=buffCoverage(s,'baron',id)>0;
 const late=s.clock>=20,kind=weighted([['farm',.4+m.scaling*(phase<3?1.8:.6)],['vision',.6+m.vision*.8],['recall',.45],['split',s.clock>10?m.split*1.1+structurePressure(s,id)+superPressure(s,id)*.25:.1],['gank',aggression*(late?.3:2)],['skirmish',aggression],['dive',aggression*m.engage*(late?.2:.8)],['teamfight',late?aggression*(1+m.engage):.15],['flank',late?aggression*.65:.05],['siege',s.clock>12?(baron?4:1.4)+m.poke+m.split*.65+Math.max(0,s.clock-30)*.1:.1]],rng);
 const lane=kind==='siege'||kind==='split'?pushLane(s,id,rng):weighted([['top',1+m.split],['mid',1+m.vision],['bot',1+m.poke]],rng),roles=['gank','skirmish','dive'].includes(kind)?lane==='top'?['TOP','JGL','MID']:lane==='bot'?['JGL','BOT','SUP']:['MID','JGL','SUP']:null;
 if(['farm','vision','recall','split'].includes(kind)){
  if(kind==='vision')gainVision(s,id,lane,15+15*m.vision);
  const resources=kind==='farm'||kind==='split'?collectSideResources(s,id,{lane,rng,maximum:350}):null;
  record(s,{kind,title:`${name(s,id)} · ${{farm:'라인·정글 자원 확보',vision:'와드 설치·시야 제거',recall:'귀환·동선 정비',split:'사이드 압박'}[kind]}`,location:lane,team:id,macro:m.label,...(resources?{sideResources:resources,text:`실제 추가 라인 자원 ${resources.lane}G · 정글 ${resources.jungle}G 확보.`}:{})});
  if(kind==='split'&&s.clock>12){farming(s,s.clock+.06,rng);resolvePush(s,id,rng,{lane});}return;
 }
 const c=battle(s,kind,lane,roles,rng);gainVision(s,c.winner,lane,8);
 record(s,{kind,title:`${name(s,c.winner)} · ${lane==='top'?'상체':lane==='bot'?'하체':'미드'} ${kind==='siege'?'공성 전 교전':kind==='gank'?'갱킹':kind==='flank'?'측면 진입':'합류 교전'}`,location:lane,roles,team:c.winner,kills:c.kills,...c.info,macro:m.label});
 if(s.clock>12&&(kind==='siege'||(!roles&&c.winnerKills>=2))){farming(s,s.clock+.06,rng);const bigWin=c.winnerKills>=3&&c.kills.filter(k=>s.stats.find(p=>p.player===k.killer)?.team===c.winner).length-c.kills.filter(k=>s.stats.find(p=>p.player===k.killer)?.team===c.loser).length>=2;resolveCampaign(s,c.winner,rng,{lane,dead:c.dead,uncontested:c.winnerKills>=3,baron:buffCoverage(s,'baron',c.winner)>0,bigWin});}
}
function laningEvent(s,rng){
 const elapsed=s.clock-s.lastLaneRoll;s.lastLaneRoll=s.clock;
 const event=laneEvent(s,elapsed,rng);
 if(!event){
  const lane=weighted([['top',.31],['mid',.29],['bot',.4]],rng),gap=lanePressure(s,lane),leader=gap>=0?s.teams[0]:s.teams[1],counter=laneCounterEdge(s,lane);
  const counterTeam=s.teams[counter>0?0:1];
  record(s,{kind:'laning',title:`${{top:'탑',mid:'미드',bot:'바텀'}[lane]} · 라인전`,location:lane,
   text:Math.abs(counter)>=.5?`${name(s,counterTeam)}이 챔피언 상성을 활용해 상대의 CS 확보를 압박합니다.`:Math.abs(gap)<4?'양 팀이 웨이브를 정리하며 CS를 챙깁니다.':`${name(s,leader)}이 웨이브 주도권으로 상대의 CS 확보를 압박합니다.`});
  return;
 }
 const {kind,lane}=event,laneName={top:'탑',mid:'미드',bot:'바텀'}[lane];
 const roles=event.participants?[...new Set(Object.values(event.participants).flat().map(p=>p.role))]:{top:['TOP','JGL','MID'],mid:['MID','JGL','SUP'],bot:['BOT','SUP','JGL']}[lane];
 const fight=battle(s,kind,lane,roles,rng,event.participants?event:null);
 if(kind==='duo-kill')s.duoKillAt[fight.winner]=s.clock;
 gainVision(s,fight.winner,lane,kind==='gank'?7:4);
 const type=kind==='solo-kill'?'솔로킬':kind==='duo-kill'?'듀오킬':kind==='gank'?fight.winner===event.attacker?'갱킹 성공':'갱킹 받아치기':'합류 교전';
 const participants=event.participants?Object.values(event.participants).flat().map(p=>p.player):s.stats.filter(p=>roles.includes(p.role)&&((s.respawnAt[p.player]??0)<=s.clock||fight.dead.includes(p.player))).map(p=>p.player);
 const counterEdge=laneCounterEdge(s,lane)*(fight.winner===s.teams[0]?1:-1);
 const counterText=(kind==='solo-kill'||kind==='duo-kill')&&counterEdge>=.5?' 챔피언 상성이 딜교환에 힘을 실었습니다.':'';
 record(s,{kind,title:`${name(s,fight.winner)} · ${laneName} ${type}`,location:lane,roles,participants,team:fight.winner,kills:fight.kills,
  text:`${name(s,fight.winner)}이 ${laneName}에서 ${type}으로 ${fight.winnerKills}킬을 얻습니다.${counterText}`,...fight.info});
}
function finishMatch(s,winner,rng){
 if(s.structures[enemy(s,winner)].nexus>0)throw Error('넥서스를 파괴하기 전에는 승자를 정할 수 없습니다.');
 farming(s,round(s.clock+.06),rng);s.winner=winner;s.finished=true;s.pending=null;
 for(const p of s.stats)p.cs=Math.round(p.cs);
 if(s.version>=16){
  const damage=estimateChampionDamage(s.stats,s.clock);
  s.stats.forEach((p,i)=>p.damage=damage[i]);
 }else{
  for(const p of s.stats)p.damage=s.version===15?Math.round(p.damage):Math.round((p.role==='SUP'?380:p.role==='JGL'?600:820)*s.clock+p.k*340+rng()*2600);
 }
 record(s,{kind:'nexus',title:'넥서스 파괴',location:winner===s.teams[0]?'baseRed':'baseBlue',team:winner,objective:{kind:'nexus',team:winner}});
}
export function advanceMatch(s,{controlledTeam=null,action=null,auto=false,maxEvents=Infinity}={},external){
 if(s.version===10)return legacyV10.advanceMatch(s,{controlledTeam,action,auto,maxEvents},external);if(s.version===9)return legacyV9.advanceMatch(s,{controlledTeam,action,auto,maxEvents},external);if(s.version===5)return legacyV5.advanceMatch(s,{controlledTeam,action,auto},external);if(s.version===6)return legacyV6.advanceMatch(s,{controlledTeam,action,auto,maxEvents},external);if(s.version===7)return legacyV7.advanceMatch(s,{controlledTeam,action,auto,maxEvents},external);if(s.version===8)return legacyV8.advanceMatch(s,{controlledTeam,action,auto,maxEvents},external);
 if(s.finished)return s;if(controlledTeam&&!s.teams.includes(controlledTeam))throw Error('경기 참가 구단이 아닙니다.');if(action&&!['contest','trade','auto'].includes(action))throw Error('유효하지 않은 오브젝트 판단입니다.');
 const rng=()=>draw(s,external),startCount=s.events.length;
 const immediate=finishingPlan(s);if(s.pending&&immediate){s.pending=null;resolveClosing(s,immediate,rng);if(s.finished||s.events.length-startCount>=maxEvents)return s;}
 if(s.pending){if(controlledTeam&&!auto&&!action)return s;resolveObjective(s,action,controlledTeam,rng);if(s.events.length-startCount>=maxEvents)return s;}
 for(let guard=0;guard<700&&!s.finished;guard++){
  const finish=finishingPlan(s);if(finish){s.pending=null;resolveClosing(s,finish,rng);if(s.events.length-startCount>=maxEvents)return s;continue;}
  const pressure=closingPressurePlan(s);if(pressure){resolveClosing(s,pressure,rng,{pressure:true});if(s.events.length-startCount>=maxEvents)return s;continue;}
  const next=nextObjective(s);
  if(next&&next[1]<=s.nextMacro){
   const dragons=s.dragons[s.teams[0]]+s.dragons[s.teams[1]];
   const closeGold=Math.abs(s.gold[s.teams[0]]-s.gold[s.teams[1]])<4500;
   if(s.version>=15&&next[0]==='dragon'&&(dragons===0||dragons===1&&closeGold)&&takeLaningDragon(s,next[1],rng)){
    if(s.events.length-startCount>=maxEvents)return s;continue;
   }
   prepareObjective(s,next[0],next[1],rng);
   // The setup can put a fresh wave in finishing range. Recheck at the
   // same point even when automatic play never yields for a decision.
   const finishAfterSetup=s.version>=15?finishingPlan(s):null;
   if(finishAfterSetup){s.pending=null;resolveClosing(s,finishAfterSetup,rng);}
   else{if(controlledTeam&&!auto)return s;resolveObjective(s,null,null,rng);}
   if(s.events.length-startCount>=maxEvents)return s;continue;
  }
  farming(s,s.version>=15&&s.nextMacro===LANING_END&&s.clock<LANING_END?LANING_END:Math.max(s.clock+.2,s.nextMacro),rng);
  if(s.version>=15&&s.clock<LANING_END){laningEvent(s,rng);s.nextMacro=Math.min(LANING_END,s.clock+.85+rng()*.7);}
  else if(s.version>=15&&!s.laningEnded){
   s.laningEnded=true;s.nextMacro=s.clock+.45+rng()*.35;
   record(s,{kind:'lane-transition',title:'라인전 종료 · 운영 전환',text:'선수들이 웨이브를 정리하고 오브젝트와 포탑을 중심으로 움직입니다.'});
  }else{macroEvent(s,rng);s.nextMacro=s.clock+nextGap(s,rng)-(s.events.at(-1)?.kind==='recall'&&buffCoverage(s,'baron',s.events.at(-1).team)>0?4/60:0);}
  s.steps++;if(s.events.length-startCount>=maxEvents)return s;
 }
 if(!s.finished&&!s.pending)throw Error('경기 진행이 안전 한도에 도달했습니다.');return s;
}
export function matchOutcome(s){
 if(s.version===10)return legacyV10.matchOutcome(s);if(s.version===9)return legacyV9.matchOutcome(s);if(s.version===5)return legacyV5.matchOutcome(s);if(s.version===6)return legacyV6.matchOutcome(s);if(s.version===7)return legacyV7.matchOutcome(s);if(s.version===8)return legacyV8.matchOutcome(s);
 if(!s.finished)throw Error('경기가 아직 끝나지 않았습니다.');return{winner:s.winner,loser:enemy(s,s.winner),duration:s.clock,events:s.events,stats:s.stats,initialBlueProbability:s.initialBlueProbability,finalGold:{...s.gold},finalObjectives:{dragons:{...s.dragons},grubs:{...s.grubs},heralds:{...s.heralds},barons:{...s.barons},elders:{...s.elders}},comeback:{winnerMaxDeficit:Math.round(-s.minLead[s.winner])||0,leadChanges:s.leadChanges,finalLead:s.gold[s.teams[0]]-s.gold[s.teams[1]]},decisionOverrides:s.decisions,model:`event-v${s.version}`};
}
export function upgradeMatchState(s){
 if(s.version===8||s.version===9)legacyV10.upgradeMatchState(s);if(s.version!==10)return s;
 s.version=11;s.input.model='event-v11';s.input.upgradeFrom10AtEventCount??=s.events.length;s.lastClosingAttempt={};return s;
}
function advancePrefix(engine,s,count,rng){for(let guard=0;s.events.length<count&&guard<1500;guard++)engine.advanceMatch(s,{controlledTeam:s.input.blue,action:s.pending?'auto':null,maxEvents:1},rng);if(s.events.length!==count||s.finished)throw Error('이전 경기 진행 지점을 복원하지 못했습니다.');return s;}
export function simulateMatch(input,rng){
 let s;
 if(Number.isInteger(input.upgradeFrom10AtEventCount)){
  if(Number.isInteger(input.upgradeFrom9AtEventCount)){
   if(Number.isInteger(input.upgradeFrom8AtEventCount)){s=advancePrefix(legacyV8,legacyV8.createMatchState(input,0,rng),input.upgradeFrom8AtEventCount,rng);legacyV9.upgradeMatchState(s);}else s=legacyV9.createMatchState(input,0,rng);
   advancePrefix(legacyV9,s,input.upgradeFrom9AtEventCount,rng);legacyV10.upgradeMatchState(s);
  }else s=legacyV10.createMatchState(input,0,rng);
  advancePrefix(legacyV10,s,input.upgradeFrom10AtEventCount,rng);upgradeMatchState(s);
 }else s=createMatchState(input,0,rng);
 advanceMatch(s,{auto:true},rng);return matchOutcome(s);
}
export function replayMatch(input){return LANE_SIMULATION_MODELS.includes(input.model)?simulateMatch(input,matchRandom(input.seed)):input.model==='event-v10'?legacyV10.replayMatch(input):input.model==='event-v9'?legacyV9.replayMatch(input):input.model==='event-v8'?legacyV8.replayMatch(input):input.model==='event-v7'?legacyV7.replayMatch(input):input.model==='event-v6'?legacyV6.replayMatch(input):input.model==='event-v5'?legacyV5.replayMatch(input):replayArchived(input);}
