import {simulateMatch as simulateMatchV3} from './match-sim-v3.js';
import {simulateMatch as simulateMatchV2} from './match-sim-v2.js';
import {compositionMatchup} from './composition.js';
// Event-by-event simulation. No winner is chosen before the fights are played.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const sigmoid=x=>1/(1+Math.exp(-x));
const plans=[
 [0,'opening','라인 배치','mid'],[3,'gank','탑 갱킹','top',['TOP','JGL','MID']],
 [5,'skirmish','미드 주도권 교전','mid',['MID','JGL','SUP']],
 [6.5,'dragon','첫 드래곤 교전','dragon'],[8.5,'skirmish','상체 주도권 교전','top',['TOP','JGL','MID']],
 [10,'recall','정비와 다음 동선','mid'],[11.5,'dive','바텀 다이브','bot',['JGL','MID','BOT','SUP']],
 [14,'dragon','드래곤 앞 시야 싸움','dragon'],[16,'herald','협곡의 전령 교전','herald'],
 [18,'teamfight','미드 합류 한타','mid'],[20.5,'baron-setup','바론 앞 시야 장악','baron'],
 [22,'dragon','용 둥지에서의 교전','dragon'],[24,'baron','바론 교전','baron'],
 [27,'siege','바론 버프와 공성','mid'],[30,'dragon','드래곤 영혼을 향해','dragon'],
 [33,'flank','측면 진입 한타','mid'],[36,'baron','두 번째 바론 승부','baron'],
 [39,'teamfight','장기전 한타','mid'],[42,'dragon','후반 드래곤 승부','dragon'],
 [45,'baron','바론 앞 최후의 승부','baron'],[48,'siege','최종 공성','mid'],
 [51,'teamfight','마지막 전면 교전','mid'],[54,'baron','장기전 바론','baron'],
 [57,'teamfight','최후의 한타','mid']
];
export const SIMULATION_MODEL='event-v4';
export function goldInfluence(minute=0){
 if(minute<=35)return 1;
 if(minute<40)return 1-(minute-35)*.04;
 return Math.max(.35,.8-(minute-40)*.03);
}
export function battleFactors({powerGap=0,teamStrengthGap=powerGap,championGap=0,lead=0,minute=0,compositionGap=0,scaleGap=0,buffGap=0,execution=0,strategyGap=0}={}){
 const strength=clamp(teamStrengthGap,-20,20),late=clamp((minute-12)/22,0,1),weight=goldInfluence(minute);
 const factors={gold:clamp(lead,-30000,30000)/6000*Math.log(3)*weight,strength:strength*.045,
  control:strength*.025*Math.min(Math.abs(lead)/6000,1.5),champion:clamp(championGap*.07,-.6,.6),
  composition:clamp(compositionGap*.14,-.9,.9)+scaleGap*late/9,buffs:buffGap/9,execution:execution/9,strategy:strategyGap/9};
 return {...factors,goldWeight:weight,probability:clamp(sigmoid(Object.values(factors).reduce((a,b)=>a+b,0)),.02,.98)};
}
export function battleProbability(options={}){return battleFactors(options).probability;}
export function replayMatch(input){
 if(input.model==='event-v2')return simulateMatchV2(input,matchRandom(input.seed));
 if(input.model==='event-v3')return simulateMatchV3(input,matchRandom(input.seed));
 if(input.model===SIMULATION_MODEL)return simulateMatch(input,matchRandom(input.seed));
 throw Error('지원하지 않는 경기 시뮬레이션 버전입니다.');
}
export function matchRandom(seed){let state=seed>>>0;return()=>{let t=state=(state+0x6D2B79F5)>>>0;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function shuffled(a,rng){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function weighted(players,rng){const weights=players.map(p=>({TOP:2,JGL:2.2,MID:3,BOT:3.2,SUP:.7}[p.role]??1));let x=rng()*weights.reduce((a,b)=>a+b,0);return players.find((p,i)=>(x-=weights[i])<=0)??players.at(-1);}
export function simulateMatch(input,rng){
 const {blue,red,roster,bluePower,redPower}=input,teams=[blue,red],other=id=>id===blue?red:blue;
 const name=id=>input.teamNames?.[id]??id;
 const stats=roster.map(p=>({team:p.team,role:p.role,player:p.player,champion:p.champion,k:0,d:0,a:0})),statMap=Object.fromEntries(stats.map(p=>[p.player,p]));
 const gold={[blue]:2500,[red]:2500},dragons={[blue]:0,[red]:0},score={[blue]:0,[red]:0},baronUntil={[blue]:0,[red]:0},momentum={[blue]:0,[red]:0};
 const events=[],minLead={[blue]:0,[red]:0};let previousMinute=0,winner=null,lastLeader=null,leadChanges=0;
 const powerGap=(input.teamStrengthBlue??bluePower)-(input.teamStrengthRed??redPower),championGap=(bluePower-redPower)-powerGap;
 const scaleGap=input.compositionBlue&&input.compositionRed?0:((input.scaleBlue??0)-(input.scaleRed??0))*.9;
 const initialMatchup=compositionMatchup(input.compositionBlue,input.compositionRed,0);
 const initialBlueProbability=battleProbability({powerGap,championGap,compositionGap:initialMatchup.gap});
 function farming(minute){
  const delta=minute-previousMinute,lead=gold[blue]-gold[red],base=delta*(1260+rng()*160);
  const drift=clamp(powerGap*5+(rng()-.5)*250-lead*.004,-420,420)*delta;
  gold[blue]+=Math.round(base+drift/2);gold[red]+=Math.round(base-drift/2);previousMinute=minute;
 }
 function record(spec,kills=[],objective=null,team=null,extra={}){
  const [minute,kind,title,location,roles]=spec,lead=gold[blue]-gold[red],leader=Math.abs(lead)>=400?(lead>0?blue:red):null;
  const comeback=!!leader&&!!lastLeader&&leader!==lastLeader;
  if(comeback)leadChanges++;if(leader)lastLeader=leader;
  minLead[blue]=Math.min(minLead[blue],lead);minLead[red]=Math.min(minLead[red],-lead);
  const event={minute,second:Math.round(minute*60),kind,type:kind==='opening'?'start':kind==='nexus'?'end':'event',title:comeback&&kind!=='nexus'?'골드 역전 · '+title:title,location,...(roles?{roles}:{}),team,kills,objective,lead,gold:{...gold},score:{...score},dragons:{...dragons},comeback,...extra};
  event.text=kind==='opening'?'양 팀이 각 라인과 정글 입구로 이동합니다.':kind==='recall'?'귀환 후 정비하며 다음 교전을 준비합니다.':kind==='baron-setup'?`${name(team)}이 바론 강가에서 진입로를 확인합니다.`:kind==='nexus'?`${name(team)}이 넥서스를 파괴하고 ${input.number??1}세트를 가져갑니다.`:objective?`${name(objective.team)}이 ${objective.kind==='dragon'?'드래곤':objective.kind==='herald'?'협곡의 전령':objective.kind==='baron'?'바론':'포탑'}${objective.steal?'을 스틸합니다.':'을 확보합니다.'}`:`${name(team)}이 교전에서 유리한 교환을 만들었습니다. ${kills.length}킬이 발생했습니다.`;
  if(event.bounty)event.text+=` 제압·오브젝트 보상 ${event.bounty.toLocaleString('ko-KR')}G.`;
  if(comeback&&kind!=='nexus')event.text+=' 골드 우위가 뒤집혔습니다.';
  events.push(event);return event;
 }
 for(let index=0;index<plans.length;index++){
  const spec=plans[index],[minute,kind,,,roles]=spec;farming(minute);
  if(kind==='opening'||kind==='recall'){record(spec);continue;}
  const leadBefore=gold[blue]-gold[red];
  const execution=(rng()-rng())*3.5;
  const buffGap=(baronUntil[blue]>=minute?1.1:0)-(baronUntil[red]>=minute?1.1:0)+(dragons[blue]>=4?1.6:0)-(dragons[red]>=4?1.6:0);
  const strategy=(id,strategy)=>(strategy==='early'?clamp((18-minute)/12,-.4,1)*1.4:strategy==='late'?clamp((minute-16)/18,-.5,1)*1.4:0);
  const matchup=compositionMatchup(input.compositionBlue,input.compositionRed,minute,kind,{blueStats:stats.filter(p=>p.team===blue),redStats:stats.filter(p=>p.team===red),roles});
  const championContext={championPhaseGap:matchup.phaseGap,championFormGap:matchup.formGap};
  if(matchup.driver){const p=matchup.driver;championContext.championFormImpact=[p.side,p.champion,p.k,p.d,p.a,Math.round(p.performance*100)/100];}
  const factors=battleFactors({powerGap,championGap,lead:leadBefore,minute,compositionGap:matchup.gap,scaleGap,buffGap,execution,strategyGap:strategy(blue,input.blueStrategy)-strategy(red,input.redStrategy)}),probability=factors.probability;
  const fightWinner=rng()<probability?blue:red,fightLoser=other(fightWinner);
  if(kind==='baron-setup'){record(spec,[],null,fightWinner,{blueWinProbability:probability,goldWeight:factors.goldWeight,compositionGap:matchup.gap,...championContext});continue;}
  momentum[fightWinner]++;momentum[fightLoser]=0;
  const pools=Object.fromEntries(teams.map(id=>[id,roster.filter(p=>p.team===id&&(!roles||roles.includes(p.role)))]));
  const maxKills=roles?Math.min(2,pools[fightLoser].length):minute<15?3:5;
  const winnerKills=1+Math.floor(rng()*maxKills),loserKills=Math.floor(rng()*Math.min(winnerKills,3));
  const kills=[];let bounty=0;
  for(const [id,amount] of [[fightWinner,winnerKills],[fightLoser,loserKills]]){
   const enemy=other(id),victims=shuffled(pools[enemy],rng).slice(0,amount),deficit=gold[enemy]-gold[id];
   victims.forEach((victim,i)=>{
    const killer=weighted(pools[id],rng),assists=shuffled(pools[id].filter(p=>p.player!==killer.player),rng).slice(0,Math.min(pools[id].length-1,1+Math.floor(rng()*4))).map(p=>p.player);
    const shutdown=i<2&&deficit>2000?Math.round(clamp((deficit-2000)*.075,0,550)):0;
    kills.push({killer:killer.player,victim:victim.player,assists});statMap[killer.player].k++;statMap[victim.player].d++;for(const pid of assists)statMap[pid].a++;score[id]++;
    gold[id]+=300+assists.length*50+shutdown;bounty+=shutdown;
   });
  }
  let objective=null;
  if(['dragon','herald','baron','siege'].includes(kind)){
   const stealChance=clamp(.12+(fightLoser===blue?powerGap:-powerGap)*.004,.04,.22);
   const steal=kind==='baron'&&rng()<stealChance,owner=steal?fightLoser:fightWinner,objectiveKind=kind==='siege'?'tower':kind,deficit=gold[other(owner)]-gold[owner];
   const objectiveBounty=deficit>3000?Math.round(clamp((deficit-3000)*.1,0,800)):0;
   gold[owner]+=({dragon:300,herald:600,baron:1500,tower:1250}[objectiveKind])+objectiveBounty;bounty+=objectiveBounty;
   objective={kind:objectiveKind,team:owner,steal};
   if(kind==='dragon'){dragons[owner]++;objective.soul=dragons[owner]===4;}
   if(kind==='baron'){baronUntil[owner]=minute+3.5;objective.contestedBy=fightWinner;}
  }
  const team=objective?.team??fightWinner;
  let title=objective?.steal?'바론 스틸':objective?.soul?'드래곤 영혼 확보':spec[2];
  if((fightWinner===blue?leadBefore:-leadBefore)<-2500&&!objective?.steal)title='열세 팀의 반격 · '+title;
  record([minute,kind,title,spec[3],roles],kills,objective,team,{combatTeam:fightWinner,leadBefore,blueWinProbability:probability,goldWeight:factors.goldWeight,compositionGap:matchup.gap,teamStrengthGap:powerGap,bounty,...championContext});
  if(minute>=26&&['siege','flank','teamfight','baron'].includes(kind)){
   const attackLead=fightWinner===blue?gold[blue]-gold[red]:gold[red]-gold[blue],buff=baronUntil[fightWinner]>=minute;
   const canPush=winnerKills>=3||buff||attackLead>=4500||minute>=42;
   const finishChance=clamp(.12+(minute-26)*.027+winnerKills*.045+momentum[fightWinner]*.025+attackLead*goldInfluence(minute)/40000+(buff?.14:0),.04,.9);
   // At the last late-game fight, its actual winner closes the game. No
   // preselected winner, gold sign rewrite, or separate winner roll is used.
   if((canPush&&rng()<finishChance)||index===plans.length-1){
    winner=fightWinner;const finish=Math.ceil(minute+.7+rng()*.8);farming(finish);gold[winner]+=100;
    record([finish,'nexus','넥서스 파괴',winner===blue?'baseRed':'baseBlue'],[],{kind:'nexus',team:winner},winner);break;
   }
  }
 }
 const duration=events.at(-1).minute;
 for(const p of stats){p.cs=p.role==='SUP'?Math.round(25+duration*.6+rng()*18):Math.round(duration*(p.role==='JGL'?5.8:7.6)+(rng()-.5)*35);p.damage=Math.round((p.role==='SUP'?380:p.role==='JGL'?600:820)*duration+p.k*340+rng()*2600);}
 return {winner,loser:other(winner),duration,events,stats,initialBlueProbability,finalGold:{...gold},comeback:{winnerMaxDeficit:Math.round(-minLead[winner]),leadChanges,finalLead:gold[blue]-gold[red]},model:SIMULATION_MODEL};
}
