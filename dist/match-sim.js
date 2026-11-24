import {replayMatch as replayArchived,goldInfluence,battleFactors,battleProbability,matchRandom} from './match-sim-v4.js';
import {compositionMatchup} from './composition.js';
import {phaseStrength} from './champion-combat.js';
import {macroProfile,objectiveChances,automaticObjectiveDecision,OBJECTIVE_NAMES} from './macro-objectives.js';
export {goldInfluence,battleFactors,battleProbability,matchRandom};
export const SIMULATION_MODEL='event-v5';
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
 const delta=Math.max(0,minute-s.clock),lead=s.gold[s.teams[0]]-s.gold[s.teams[1]],base=delta*(1260+rng()*160),drift=clamp(s.powerGap*5+(rng()-.5)*250-lead*.004,-420,420)*delta;
 s.gold[s.teams[0]]+=Math.round(base+drift/2);s.gold[s.teams[1]]+=Math.round(base-drift/2);s.clock=round(minute);
}
function record(s,{kind,title,location='mid',roles=null,team=null,kills=[],objective=null,...extra}){
 const [blue,red]=s.teams,lead=s.gold[blue]-s.gold[red],leader=Math.abs(lead)>=400?(lead>0?blue:red):null,comeback=!!leader&&!!s.lastLeader&&leader!==s.lastLeader;
 if(comeback)s.leadChanges++;if(leader)s.lastLeader=leader;
 s.minLead[blue]=Math.min(s.minLead[blue],lead);s.minLead[red]=Math.min(s.minLead[red],-lead)||0;
 const e={minute:s.clock,second:Math.round(s.clock*60),kind,type:kind==='opening'?'start':kind==='nexus'?'end':'event',title:comeback&&kind!=='nexus'?'골드 역전 · '+title:title,location,...(roles?{roles}:{}),team,kills,objective,lead,gold:{...s.gold},score:{...s.score},dragons:{...s.dragons},grubs:{...s.grubs},comeback,...extra};
 e.text=extra.text??(kind==='opening'?'양 팀이 라인과 정글 동선을 선택합니다.':kind==='objective-setup'?`${OBJECTIVE_NAMES[s.pending?.kind]??'오브젝트'} 앞에서 교전 또는 자원 교환을 준비합니다.`:kind==='recall'?'선수들이 귀환해 정비하고 다음 동선을 선택합니다.':kind==='nexus'?`${name(s,team)}이 넥서스를 파괴합니다.`:objective?`${name(s,team)}이 ${OBJECTIVE_NAMES[objective.kind]??'포탑'}${objective.count?` ${objective.count}마리`:''}${objective.steal?'을 스틸합니다.':'을 확보합니다.'}`:kills.length?`${name(s,team)}이 교전에서 ${kills.filter(k=>s.stats.find(p=>p.player===k.killer)?.team===team).length}킬을 만들었습니다.`:`${name(s,team)}이 ${kind==='split'?'사이드 압박':kind==='vision'?'시야와 진입로 통제':'라인·정글 자원 확보'}로 운영합니다.`);
 if(e.bounty)e.text+=` 제압·오브젝트 보상 ${e.bounty}G.`;s.events.push(e);return e;
}
export function createMatchState(input,seed=0,external){
 const snapshot=structuredClone(input),{blue,red}=snapshot,teams=[blue,red],zeros=()=>Object.fromEntries(teams.map(id=>[id,0]));
 const s={version:5,input:snapshot,rng:seed>>>0,teams,clock:0,stats:snapshot.roster.map(p=>({team:p.team,role:p.role,player:p.player,champion:p.champion,k:0,d:0,a:0})),gold:{[blue]:2500,[red]:2500},score:zeros(),dragons:zeros(),grubs:zeros(),heralds:zeros(),barons:zeros(),elders:zeros(),baronUntil:zeros(),elderUntil:zeros(),momentum:zeros(),minLead:zeros(),events:[],lastLeader:null,leadChanges:0,winner:null,finished:false,pending:null,window:0,decisions:[],soul:null,steps:0};
 s.powerGap=(input.teamStrengthBlue??input.bluePower)-(input.teamStrengthRed??input.redPower);s.championGap=input.bluePower-input.redPower-s.powerGap;
 s.macros=[macroProfile(blue,input.compositionBlue,input.blueStrategy),macroProfile(red,input.compositionRed,input.redStrategy)];
 const rng=()=>draw(s,external),delay=()=>.3+rng()*1.4+(1-(s.macros[0].objective+s.macros[1].objective)/2)*.8;
 s.timers={dragon:5+delay(),grubs:input.objectiveEra===2022?null:8+delay(),herald:(input.objectiveEra===2022?8:15)+delay(),baron:20+delay(),elder:null};s.nextMacro=2.4+rng()*1.3;
 const matchup=compositionMatchup(input.compositionBlue,input.compositionRed,0);s.initialBlueProbability=battleProbability({powerGap:s.powerGap,championGap:s.championGap,compositionGap:matchup.gap});
 record(s,{kind:'opening',title:'라인 배치'});return s;
}
function combatEstimate(s,minute,kind,roles=null,execution=0){
 const [blue,red]=s.teams,lead=s.gold[blue]-s.gold[red],matchup=compositionMatchup(comp(s,blue),comp(s,red),minute,kind,{blueStats:s.stats.filter(p=>p.team===blue),redStats:s.stats.filter(p=>p.team===red),roles});
 const strategy=(plan)=>plan==='early'?clamp((18-minute)/12,-.4,1)*1.4:plan==='late'?clamp((minute-16)/18,-.5,1)*1.4:0;
 const buffGap=(s.baronUntil[blue]>minute?1.1:0)-(s.baronUntil[red]>minute?1.1:0)+(s.elderUntil[blue]>minute?3:0)-(s.elderUntil[red]>minute?3:0)+(s.soul===blue?1.6:s.soul===red?-1.6:0);
 const scaleGap=comp(s,blue)&&comp(s,red)?0:((s.input.scaleBlue??0)-(s.input.scaleRed??0))*.9;
 const factors=battleFactors({powerGap:s.powerGap,championGap:s.championGap,lead,minute,compositionGap:matchup.gap,scaleGap,buffGap,execution,strategyGap:strategy(s.input.blueStrategy)-strategy(s.input.redStrategy)});
 return {probability:factors.probability,matchup,factors};
}
export function objectivePreview(s){
 if(!s.pending)return null;const p=s.pending,[blue,red]=s.teams,c=combatEstimate(s,p.minute,p.kind,p.roles);
 const secure=objectiveChances({blue,red,roster:s.stats,stats:s.stats,roles:p.roles,skills:s.input.smiteSkills??[75,75],fightChance:c.probability,visionGap:s.macros[0].vision-s.macros[1].vision});
 return {...p,fightChance:c.probability,secureChance:secure.blueChance,secure,dragons:{...s.dragons},grubs:{...s.grubs},gold:{...s.gold},macros:s.macros.map(m=>m.label),tradeGold:tradeReward(s,blue),redTradeGold:tradeReward(s,red)};
}
function chooseAuto(s,id,preview){const blue=id===s.teams[0];return automaticObjectiveDecision({chance:blue?preview.secureChance:1-preview.secureChance,kind:preview.kind,ownDragons:s.dragons[id],enemyDragons:s.dragons[enemy(s,id)],macro:macro(s,id)});}
function tradeReward(s,id){return Math.round(220+Math.min(s.clock,40)*5+macro(s,id).split*230+s.grubs[id]*20);}
function battle(s,kind,location,roles,rng){
 const [blue,red]=s.teams,before=s.gold[blue]-s.gold[red],c=combatEstimate(s,s.clock,kind,roles,(rng()-rng())*3.5),winner=rng()<c.probability?blue:red,loser=enemy(s,winner),byId=Object.fromEntries(s.stats.map(p=>[p.player,p])),pools=Object.fromEntries(s.teams.map(id=>[id,s.stats.filter(p=>p.team===id&&(!roles||roles.includes(p.role)))]));
 const max=roles?Math.min(2,pools[loser].length):s.clock<15?3:5,wins=1+Math.floor(rng()*max),losses=Math.floor(rng()*Math.min(wins,3)),kills=[];let bounty=0;
 for(const[id,count]of[[winner,wins],[loser,losses]])for(const[victim,index]of shuffle(pools[enemy(s,id)],rng).slice(0,count).map((p,i)=>[p,i])){
  const killer=weighted(pools[id].map(p=>[p,{TOP:2,JGL:2.2,MID:3,BOT:3.2,SUP:.7}[p.role]??1]),rng),assists=shuffle(pools[id].filter(p=>p.player!==killer.player),rng).slice(0,Math.min(pools[id].length-1,1+Math.floor(rng()*4))).map(p=>p.player),deficit=s.gold[enemy(s,id)]-s.gold[id],shutdown=index<2&&deficit>2000?Math.round(clamp((deficit-2000)*.075,0,550)):0;
  kills.push({killer:killer.player,victim:victim.player,assists});byId[killer.player].k++;byId[victim.player].d++;for(const pid of assists)byId[pid].a++;s.score[id]++;s.gold[id]+=300+50*assists.length+shutdown;bounty+=shutdown;
 }
 s.momentum[winner]++;s.momentum[loser]=0;
 const info={combatTeam:winner,leadBefore:before,blueWinProbability:c.probability,goldWeight:c.factors.goldWeight,compositionGap:c.matchup.gap,teamStrengthGap:s.powerGap,bounty,championPhaseGap:c.matchup.phaseGap,championFormGap:c.matchup.formGap};
 if(c.matchup.driver){const p=c.matchup.driver;info.championFormImpact=[p.side,p.champion,p.k,p.d,p.a,Math.round(p.performance*100)/100];}
 return {winner,loser,kills,bounty,winnerKills:wins,dead:kills.map(k=>k.victim),info};
}
function objectiveRoles(s,kind){if(!['grubs','herald'].includes(kind))return null;return(s.macros[0].vision+s.macros[1].vision)/2>.72?['TOP','JGL','MID','SUP']:['TOP','JGL','MID'];}
function nextObjective(s){
 if(s.timers.grubs!==null&&(s.clock>14.5||s.timers.grubs>14.5))s.timers.grubs=null;if(s.timers.herald!==null&&(s.clock>19.5||s.timers.herald>19.5))s.timers.herald=null;
 return Object.entries(s.timers).filter(([,time])=>time!==null).sort((a,b)=>a[1]-b[1])[0]??null;
}
function prepareObjective(s,kind,time,rng){
 const minute=round(Math.max(time,s.clock+.2));s.pending={id:s.window++,kind,minute,roles:objectiveRoles(s,kind)};
 farming(s,minute-.08,rng);record(s,{kind:'objective-setup',title:`${OBJECTIVE_NAMES[kind]} · 운영 결정`,location:['grubs','herald','baron'].includes(kind)?kind:'dragon',roles:s.pending.roles,decisionSecond:Math.round(minute*60)});
}
function awardObjective(s,kind,owner,extra={}){
 const gold={dragon:300,grubs:30,herald:100,baron:850,elder:850}[kind],deficit=s.gold[enemy(s,owner)]-s.gold[owner],bounty=deficit>3000?Math.round(clamp((deficit-3000)*.1,0,800)):0;s.gold[owner]+=gold+bounty;
 if(kind==='grubs')s.grubs[owner]++;
 if(kind==='dragon'){s.dragons[owner]++;if(s.dragons[owner]===4){s.soul=owner;s.timers.dragon=null;s.timers.elder=s.clock+6.3;}}
 if(kind==='herald')s.heralds[owner]++;
 if(kind==='baron'){s.barons[owner]++;s.baronUntil[owner]=s.clock+3;}
 if(kind==='elder'){s.elders[owner]++;s.elderUntil[owner]=s.clock+2.5;}
 return {kind,team:owner,...(kind==='dragon'?{soul:s.soul===owner}:{}),...extra,bounty};
}
function resolveObjective(s,action,controlledTeam,rng){
 const p=s.pending,preview=objectivePreview(s),[blue,red]=s.teams,override=(s.input.decisionOverrides??[]).find(x=>x[0]===p.id),actions=Object.fromEntries(s.teams.map(id=>[id,chooseAuto(s,id,preview)]));
 if(override){actions[override[1]]=override[2];s.decisions.push(override);}
 if(controlledTeam&&action&&action!=='auto'){actions[controlledTeam]=action;s.decisions.push([p.id,controlledTeam,action]);}
 const traders=s.teams.filter(id=>actions[id]==='trade'),fighters=s.teams.filter(id=>actions[id]==='contest');farming(s,p.minute,rng);
 for(const id of traders)s.gold[id]+=tradeReward(s,id);
 if(!fighters.length){s.timers[p.kind]=s.clock+1.2+rng();record(s,{kind:'trade',title:`${OBJECTIVE_NAMES[p.kind]} 보류 · 양 팀 자원 교환`,location:'mid',team:blue,text:'양 팀이 오브젝트 교전을 미루고 라인과 정글에서 골드를 확보합니다.',decisions:actions});s.pending=null;return;}
 const rush=fighters.length===2&&rng()<.3,rushSecure=rush?objectiveChances({blue,red,roster:s.stats,stats:s.stats,roles:p.roles,skills:s.input.smiteSkills??[75,75],fightChance:preview.fightChance,control:'rush',visionGap:s.macros[0].vision-s.macros[1].vision}):null,c=fighters.length===2?battle(s,p.kind,['grubs','herald','baron'].includes(p.kind)?p.kind:'dragon',p.roles,rng):null;
 const secure=rushSecure??objectiveChances({blue,red,roster:s.stats,stats:s.stats,dead:rush?[]:c?.dead??[],roles:p.roles,skills:s.input.smiteSkills??[75,75],fightChance:preview.fightChance,control:rush?'rush':c?.winner===blue?'blue':'red',setup:rush?1:.65,visionGap:s.macros[0].vision-s.macros[1].vision});
 const initiator=c?(rush?(preview.secureChance>=.5?blue:red):c.winner):fighters[0],count=p.kind==='grubs'?3:1,owners=[];
 for(let n=0;n<count;n++)owners.push(fighters.length===1?fighters[0]:rng()<secure.blueChance?blue:red);
 const totals=Object.fromEntries(s.teams.map(id=>[id,owners.filter(owner=>owner===id).length])),main=totals[blue]>totals[red]?blue:red,steal=owners.some(owner=>owner!==initiator);let reward;
 for(const owner of owners)reward=awardObjective(s,p.kind,owner);
 if(p.kind==='grubs'||p.kind==='herald')s.timers[p.kind]=null;
 else if(p.kind==='dragon'&&!s.soul)s.timers.dragon=s.clock+5.3+rng()*.7;
 else if(p.kind==='baron'||p.kind==='elder')s.timers[p.kind]=s.clock+6.3+rng()*.7;
 const objective={kind:p.kind,team:main,steal,startedBy:initiator,...(p.kind==='grubs'?{allocation:totals,count:totals[main]}:{}),...(p.kind==='dragon'?{soul:s.soul===main}:{}),contested:fighters.length===2};
 const detail=p.kind==='grubs'?`${name(s,blue)} ${totals[blue]}마리 / ${name(s,red)} ${totals[red]}마리`:fighters.length===1?`${name(s,fighters[0])}이 무교전 확보`:rush?'오브젝트 마무리·강타 경합':'교전 후 정글러 생존·마무리 경합';
 record(s,{kind:p.kind,title:`${OBJECTIVE_NAMES[p.kind]}${steal?' 스틸':p.kind==='grubs'?' 분배':' 확보'}`,location:['grubs','herald','baron'].includes(p.kind)?p.kind:'dragon',roles:p.roles,team:main,kills:c?.kills??[],objective,...c?.info,decisions:actions,objectiveChance:fighters.length===1?(fighters[0]===blue?1:0):round(secure.blueChance),objectiveMode:rush?'rush':c?'fight-first':'uncontested',text:`${detail}. ${traders.map(id=>`${name(s,id)}은 교전을 포기하고 사이드·정글 골드를 교환했습니다.`).join(' ')}`});
 s.pending=null;s.nextMacro=Math.max(s.nextMacro,s.clock+.5);
}
function macroEvent(s,rng){
 const [blue,red]=s.teams,lead=s.gold[blue]-s.gold[red],initiative=sigmoid(s.powerGap*.04+lead/12000+(s.macros[0].aggression-s.macros[1].aggression)*.7),id=rng()<initiative?blue:red,m=macro(s,id),members=comp(s,id)?.members??[],phase=members.length?members.reduce((sum,[ch])=>sum+phaseStrength(ch,s.clock),0)/members.length:3,aggression=clamp(m.aggression+(phase-3)*.12,.15,1);
 const late=s.clock>=20,kind=s.clock>=58?'teamfight':weighted([['farm',.4+m.scaling*(phase<3?1.8:.6)],['vision',.4+m.vision*.5],['recall',.55],['split',s.clock>10?m.split*1.4:.1],['gank',aggression*(late?.4:2.2)],['skirmish',aggression*1.5],['dive',aggression*m.engage*(late?.2:.8)],['teamfight',late?aggression*(.7+m.engage):.15],['flank',late?aggression*.65:.05],['siege',late?m.poke+m.split*.65:.1]],rng);
 const lane=weighted([['top',1+(members.find(([,role])=>role==='TOP')?.[0]?phaseStrength(members.find(([,role])=>role==='TOP')[0],s.clock)*.25:0)+m.split],['mid',1+m.vision],['bot',1+(members.find(([,role])=>role==='BOT')?.[0]?phaseStrength(members.find(([,role])=>role==='BOT')[0],s.clock)*.25:0)]],rng);
 const roles=['gank','skirmish','dive'].includes(kind)?lane==='top'?['TOP','JGL','MID']:lane==='bot'?['JGL','BOT','SUP']:['MID','JGL','SUP']:null;
 const titles={gank:'정글러 갱킹',skirmish:'주도권 교전',dive:'포탑 다이브',teamfight:'합류 한타',flank:'측면 진입',siege:'포탑 공성',split:'사이드 압박',farm:'자원 집중',vision:'시야 장악',recall:'귀환·동선 재정비'};
 if(['farm','vision','recall','split'].includes(kind)){
  if(kind==='farm'||kind==='split')s.gold[id]+=Math.round(100+rng()*180+(kind==='split'?m.split*150+s.grubs[id]*25:0));
  record(s,{kind,title:`${name(s,id)} · ${titles[kind]}`,location:lane,team:id,macro:m.label});return;
 }
 const before=s.gold[blue]-s.gold[red],c=battle(s,kind,lane,roles,rng);let objective=null;
 if(kind==='siege'){s.gold[c.winner]+=Math.round(750+s.grubs[c.winner]*70);objective={kind:'tower',team:c.winner};}
 record(s,{kind,title:`${name(s,id)} · ${lane==='top'?'상체':lane==='bot'?'하체':'미드'} ${titles[kind]}`,location:lane,roles,team:c.winner,kills:c.kills,objective,...c.info,leadBefore:before,macro:m.label});
 if(s.clock>=26&&['siege','flank','teamfight'].includes(kind)){
  const winningLead=s.gold[c.winner]-s.gold[c.loser],buff=s.baronUntil[c.winner]>s.clock||s.elderUntil[c.winner]>s.clock,canPush=c.winnerKills>=3||buff||winningLead>=4500||s.clock>=42;
  const finishChance=clamp(.12+(s.clock-26)*.027+c.winnerKills*.045+s.momentum[c.winner]*.025+winningLead*goldInfluence(s.clock)/40000+(buff?.16:0),.04,.9);
  if((canPush&&rng()<finishChance)||s.clock>=58)finishMatch(s,c.winner,rng);
 }
}
function finishMatch(s,winner,rng){
 farming(s,Math.ceil(s.clock+.7+rng()*.8),rng);s.gold[winner]+=100;s.winner=winner;s.finished=true;s.pending=null;
 record(s,{kind:'nexus',title:'넥서스 파괴',location:winner===s.teams[0]?'baseRed':'baseBlue',team:winner,objective:{kind:'nexus',team:winner}});
 for(const p of s.stats){p.cs=p.role==='SUP'?Math.round(25+s.clock*.6+rng()*18):Math.round(s.clock*(p.role==='JGL'?5.8:7.6)+(rng()-.5)*35);p.damage=Math.round((p.role==='SUP'?380:p.role==='JGL'?600:820)*s.clock+p.k*340+rng()*2600);}
}
export function advanceMatch(s,{controlledTeam=null,action=null,auto=false}={},external){
 if(s.finished)return s;if(controlledTeam&&!s.teams.includes(controlledTeam))throw Error('경기 참가 구단이 아닙니다.');if(action&&!['contest','trade','auto'].includes(action))throw Error('유효하지 않은 오브젝트 판단입니다.');
 const rng=()=>draw(s,external);
 if(s.pending){if(controlledTeam&&!auto&&!action)return s;resolveObjective(s,action,controlledTeam,rng);}
 for(let guard=0;guard<180&&!s.finished;guard++){
  const next=nextObjective(s);
  if(next&&next[1]<=s.nextMacro&&next[1]<58){prepareObjective(s,next[0],next[1],rng);if(controlledTeam&&!auto)return s;resolveObjective(s,null,null,rng);continue;}
  farming(s,Math.min(58.3,Math.max(s.clock+.2,s.nextMacro)),rng);macroEvent(s,rng);s.nextMacro=s.clock+nextGap(s,rng);s.steps++;
 }
 if(!s.finished&&!s.pending)throw Error('경기 진행이 안전 한도에 도달했습니다.');return s;
}
export function matchOutcome(s){
 if(!s.finished)throw Error('경기가 아직 끝나지 않았습니다.');return{winner:s.winner,loser:enemy(s,s.winner),duration:s.clock,events:s.events,stats:s.stats,initialBlueProbability:s.initialBlueProbability,finalGold:{...s.gold},finalObjectives:{dragons:{...s.dragons},grubs:{...s.grubs},heralds:{...s.heralds},barons:{...s.barons},elders:{...s.elders}},comeback:{winnerMaxDeficit:Math.round(-s.minLead[s.winner])||0,leadChanges:s.leadChanges,finalLead:s.gold[s.teams[0]]-s.gold[s.teams[1]]},decisionOverrides:s.decisions,model:SIMULATION_MODEL};
}
export function simulateMatch(input,rng){const s=createMatchState(input,0,rng);advanceMatch(s,{auto:true},rng);return matchOutcome(s);}
export function replayMatch(input){return input.model===SIMULATION_MODEL?simulateMatch(input,matchRandom(input.seed)):replayArchived(input);}
