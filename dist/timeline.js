import {structurePosition} from './broadcast-hud.js';
import {replayMatch} from './match-sim.js';
// Deterministic highlight reconstruction. This layer never changes match results or save RNG.
const ROLES=['TOP','JGL','MID','BOT','SUP'];
const BASE={blue:[63,537],red:[537,63]};
const LANES={blue:{TOP:[82,235],JGL:[181,413],MID:[260,340],BOT:[392,520],SUP:[365,509]},red:{TOP:[232,82],JGL:[423,178],MID:[340,260],BOT:[520,392],SUP:[509,365]}};
const POI={top:[95,175],mid:[300,300],bot:[485,447],dragon:[410,400],herald:[205,195],baron:[205,195],grubs:[205,195],baseBlue:BASE.blue,baseRed:BASE.red};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function hash(s){let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;}
function seeded(seed){return()=>{let t=seed+=0x6D2B79F5;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
function shuffle(a,rng){a=[...a];for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function makeKills(set,rng){
 const queues={};
 for(const id of [set.blue,set.red]){
  const enemy=id===set.blue?set.red:set.blue;
  const killers=shuffle(set.stats.filter(p=>p.team===id).flatMap(p=>Array(p.k).fill(p)),rng);
  const victims=shuffle(set.stats.filter(p=>p.team===enemy).flatMap(p=>Array(p.d).fill(p)),rng);
  queues[id]=killers.map((killer,i)=>({killer:killer.player,victim:victims[i]?.player,killerChampion:killer.champion,victimChampion:victims[i]?.champion,team:id,killerRole:killer.role,victimRole:victims[i]?.role,assists:[]}));
  for(const p of set.stats.filter(p=>p.team===id)){
   const candidates=shuffle(queues[id].filter(k=>k.killer!==p.player),rng);
   for(const kill of candidates.slice(0,p.a))kill.assists.push(p.player);
  }
 }
 return queues;
}
function take(queue,amount,roles){
 const out=[],seen=new Set();
 for(let i=0;i<queue.length&&out.length<amount;){const k=queue[i];if(!k.victim||seen.has(k.victim)||(roles&&(!roles.includes(k.killerRole)||!roles.includes(k.victimRole)))){i++;continue;}out.push(queue.splice(i,1)[0]);seen.add(k.victim);}
 return out;
}
export function buildTimeline(set,{teamNames={},playerNames={}}={}){
 const rng=seeded(hash(JSON.stringify([set.blue,set.red,set.number,set.winner,set.picks,set.stats])));
 let out,records=set.events;
 if(!set.live&&!records?.some(e=>e.kind==='nexus')&&['event-v2','event-v3','event-v4','event-v5','event-v6','event-v7','event-v8','event-v9','event-v10','event-v11','event-v12','event-v13','event-v14'].includes(set.simulationReplay?.model)){
  const replay=replayMatch({...set.simulationReplay,blue:set.blue,red:set.red,number:set.number,roster:set.stats,teamNames});
  if(replay.winner===set.winner&&replay.duration===set.duration&&JSON.stringify(replay.stats)===JSON.stringify(set.stats))records=replay.events;
 }
 if(set.simulationVersion>=2&&(set.live||records?.some(e=>e.kind==='nexus'))){
  const statMap=Object.fromEntries(set.stats.map(p=>[p.player,p]));
  out=records.map(event=>({...event,kills:(event.kills??[]).map(k=>{
   const killer=statMap[k.killer],victim=statMap[k.victim];
   return {...k,assists:[...k.assists],killerChampion:killer.champion,victimChampion:victim.champion,team:killer.team,killerRole:killer.role,victimRole:victim.role};
  }),gold:{...event.gold},score:{...event.score},dragons:{...event.dragons},objective:event.objective?{...event.objective}:null}));
 }else{
 const loser=set.loser??(set.winner===set.blue?set.red:set.blue),queues=makeKills(set,rng),duration=set.duration;
 const skeleton=[
  {minute:0,kind:'opening',title:'라인 배치',location:'mid'},
  {minute:3,kind:'gank',title:'탑 갱킹',location:'top',roles:['TOP','JGL','MID']},
  {minute:5,kind:'skirmish',title:'미드 주도권 교전',location:'mid',roles:['MID','JGL','SUP']},
  {minute:6.5,kind:'dragon',title:'첫 드래곤 교전',location:'dragon'},
  {minute:8.5,kind:'herald',title:'협곡의 전령 확보',location:'herald'},
  {minute:10,kind:'recall',title:'정비와 다음 동선',location:'mid'},
  {minute:11.5,kind:'dive',title:'바텀 다이브',location:'bot',roles:['JGL','MID','BOT','SUP']},
  {minute:14,kind:'dragon',title:'드래곤 앞 시야 싸움',location:'dragon'},
  {minute:17,kind:'teamfight',title:'미드 합류 한타',location:'mid'},
  {minute:20.5,kind:'baron-setup',title:'바론 앞 시야 장악',location:'baron'},
  {minute:22,kind:'dragon',title:'용 둥지에서의 교전',location:'dragon'},
  {minute:24,kind:'baron',title:'바론 교전',location:'baron'},
  {minute:27,kind:'siege',title:'바론 버프와 공성',location:'mid'},
  {minute:30,kind:'dragon',title:'드래곤 영혼을 향해',location:'dragon'},
  {minute:33,kind:'flank',title:'측면 진입 한타',location:'mid'},
  {minute:36,kind:'baron',title:'두 번째 바론 승부',location:'baron'},
 ].filter(s=>s.minute<duration-1);
 out=[];const totals={[set.blue]:0,[set.red]:0},dragons={[set.blue]:0,[set.red]:0};let lead=0;
 for(let index=0;index<skeleton.length;index++){
  const spec=skeleton[index],sideTeam=rng()<.7?set.winner:loser,combat=!['opening','recall','baron-setup'].includes(spec.kind);
  const slots=skeleton.slice(index).filter(s=>!['opening','recall','baron-setup'].includes(s.kind)).length+1;
  const kills=[];
  if(combat)for(const id of [set.blue,set.red]){const count=clamp(Math.ceil(queues[id].length/slots)+(id===sideTeam?1:0),0,spec.roles?2:4);kills.push(...take(queues[id],count,spec.roles));}
  for(const k of kills)totals[k.team]++;
  let objective=null;
  if(['dragon','herald','baron'].includes(spec.kind)){
   objective={kind:spec.kind,team:sideTeam,steal:spec.kind==='baron'&&rng()<.2};
   if(spec.kind==='dragon'){dragons[sideTeam]++;objective.soul=dragons[sideTeam]===4;}
  }
  if(spec.kind==='opening')lead=0;else lead+=(sideTeam===set.blue?1:-1)*(400+Math.floor(rng()*1200));
  const title=objective?.steal?'바론 스틸':objective?.soul?'드래곤 영혼 확보':spec.title;
  let text=spec.kind==='opening'?'양 팀이 각 라인과 정글 입구로 이동합니다.':spec.kind==='recall'?'귀환 후 체력을 회복하고 아이템을 갖춰 다음 교전을 준비합니다.':spec.kind==='baron-setup'?`${teamNames[sideTeam]??sideTeam}이 정글·서포터를 앞세워 바론 강가를 점령합니다.`:objective?`${teamNames[sideTeam]??sideTeam}이 ${objective.kind==='dragon'?'드래곤':objective.kind==='herald'?'협곡의 전령':'바론'}${objective.steal?'을 스틸합니다.':'을 확보합니다.'}`:kills.length?`${playerNames[kills[0].killer]??kills[0].killer}의 진입에 ${kills.length}킬이 발생합니다.`:`${teamNames[sideTeam]??sideTeam}이 라인을 밀며 교전 각을 잡습니다.`;
  out.push({...spec,title,text,team:sideTeam,kills,objective,lead,score:{...totals},dragons:{...dragons},second:Math.round(spec.minute*60)});
 }
 // A highlight cannot kill the same champion twice. Preserve residual kills in separate waves.
 let wave=0;
 while(Object.values(queues).some(q=>q.length)){
  const kills=[...take(queues[set.blue],5),...take(queues[set.red],5)];if(!kills.length)break;
  for(const k of kills)totals[k.team]++;
  out.push({minute:duration-.9+wave*.05,second:Math.round((duration-.9+wave*.05)*60),kind:'teamfight',title:wave?'추가 교전':'마지막 전면 교전',location:'mid',team:set.winner,kills,lead,score:{...totals},dragons:{...dragons},text:`${teamNames[set.winner]??set.winner}이 마지막 진입을 시도합니다. ${kills.length}킬이 발생했습니다.`});wave++;
 }
 out.push({minute:duration,second:duration*60,kind:'nexus',title:'넥서스 파괴',location:set.winner===set.blue?'baseRed':'baseBlue',team:set.winner,kills:[],objective:{kind:'nexus',team:set.winner},lead:(set.winner===set.blue?1:-1)*(5500+Math.floor(rng()*7000)),score:{...totals},dragons:{...dragons},text:`${teamNames[set.winner]??set.winner}이 넥서스를 파괴하고 ${set.number}세트를 가져갑니다.`});
 }
 let positions=Object.fromEntries(set.picks.map(p=>[p.team+'|'+p.role,BASE[p.team===set.blue?'blue':'red']]));let dead=new Set();const deathUntil={};
 if(set.simulationVersion>=7)out.forEach((scene,i)=>{scene.endSecond=scene.kind==='nexus'?scene.second:Math.min(scene.decisionSecond??scene.second+18,out[i+1]?.second??Infinity);});
 for(const scene of out){
  const building=scene.push?.structures?.[0],center=building?structurePosition(building.defender===set.blue?'blue':'red',building.lane,building.kind,building.index):POI[scene.location]??POI.mid;scene.focus={x:center[0],y:center[1],radius:['baron','dragon','herald','grubs','elder','objective-setup'].includes(scene.kind)?65:scene.kind==='opening'?0:85};
  const killed=new Set(scene.kills.map(k=>k.victim));const involved=new Set(scene.kills.flatMap(k=>[k.killer,k.victim,...k.assists]));
  scene.actors=set.picks.map(p=>{
   const stat=set.stats.find(z=>z.team===p.team&&z.role===p.role);const side=p.team===set.blue?'blue':'red',i=ROLES.indexOf(p.role),key=p.team+'|'+p.role,home=BASE[side],baseLane=LANES[side][p.role];
   const stillDead=set.simulationVersion>=7&&(deathUntil[stat?.player]??0)>scene.second,respawn=dead.has(stat?.player)&&!stillDead,from=respawn||stillDead?[...home]:[...(positions[key]??home)];
   let target=[...baseLane],via=[];
   const front=p.role==='TOP'||p.role==='JGL',radius=front?38:p.role==='SUP'?62:88;const direction=side==='blue'?1:-1;
   const peaceful=['farm','trade','split','vision','objective-setup','recall','opening','trade-push','baron-push','waveclear'].includes(scene.kind);
   const involvedHere=scene.push?(p.team===scene.push.team?scene.roles?scene.roles.includes(p.role):true:scene.push.clear>20&&['MID','BOT','SUP'].includes(p.role)):scene.decisions?.[p.team]==='trade'?false:['farm','trade'].includes(scene.kind)?false:scene.kind==='split'?p.role==='TOP':scene.kind==='vision'?p.team===scene.team&&['JGL','SUP'].includes(p.role):scene.roles?scene.roles.includes(p.role):true;
   if(scene.kind==='opening')target=baseLane;
   else if(scene.kind==='recall'){target=[home[0]+(i-2)*9,home[1]+(i-2)*6];via=[from,[from[0]+direction*10,from[1]-direction*10],target];}
   else if(scene.kind==='baron-setup') {target=['JGL','SUP','TOP'].includes(p.role)?[center[0]+direction*(i*13-32),center[1]+direction*65]:baseLane;}
   else if(involvedHere){
    target=[center[0]-direction*(radius+(i%2)*12),center[1]+direction*(radius*.5)+(i-2)*17];
    if(scene.kind==='nexus')target=[center[0]-direction*(48+i*8),center[1]+direction*(60-i*9)];
    if(p.role==='JGL'&&['gank','dive'].includes(scene.kind))via=[[center[0]-direction*100,center[1]-direction*85],[center[0]-direction*25,center[1]-direction*55]];
    if((scene.kind==='flank'||scene.kind==='teamfight')&&['TOP','SUP'].includes(p.role))via=[[center[0]+direction*110,center[1]+direction*(p.role==='TOP'?-120:115)]];
    if(scene.objective?.steal&&p.team===scene.team&&p.role==='JGL'){via=[[center[0]+direction*90,center[1]-direction*90]];target=[...center];}
   }
   if(stillDead){target=[...home];via=[];}
   target=target.map(v=>clamp(v,30,570));const dies=killed.has(stat?.player);
   const actor={id:stat?.player??key,champion:p.champion,team:p.team,side,role:p.role,from:[...from],to:[...target],path:[from,...via,target],deathUntil:scene.kills.find(k=>k.victim===stat?.player)?.respawnAtSecond??deathUntil[stat?.player]??0,dead:dies||stillDead,alreadyDead:stillDead,respawn,hpFrom:stillDead?0:respawn?80:100,hpTo:dies||stillDead?0:peaceful?100:involvedHere?50+Math.floor(rng()*45):100,involved:involvedHere};
   positions[key]=target;return actor;
  });for(const victim of killed)deathUntil[victim]=scene.kills.find(k=>k.victim===victim)?.respawnAtSecond??scene.second+Math.min(65,15+scene.minute*.8);dead=killed;
 }
 return out;
}
export function sampleScene(scene,progress){
 const p=clamp(progress,0,1);return scene.actors.map(actor=>{
  const move=clamp(p/.65,0,1),points=actor.path,lengths=points.slice(1).map((b,i)=>Math.hypot(b[0]-points[i][0],b[1]-points[i][1])),total=lengths.reduce((a,b)=>a+b,0);let travelled=move*total,x=points[0][0],y=points[0][1];
  for(let i=0;i<lengths.length;i++){const ratio=lengths[i]?Math.min(1,travelled/lengths[i]):1;x=points[i][0]+(points[i+1][0]-points[i][0])*ratio;y=points[i][1]+(points[i+1][1]-points[i][1])*ratio;if(travelled<=lengths[i])break;travelled-=lengths[i];}
  const hpProgress=clamp((p-.38)/.4,0,1),hp=actor.hpFrom+(actor.hpTo-actor.hpFrom)*hpProgress;
  return {...actor,x,y,hp,visibleDeath:actor.alreadyDead||(actor.dead&&p>=.78),recalling:scene.kind==='recall'&&p<.7};
 });
}
export function sceneClock(scene,progress){if(Number.isFinite(scene.endSecond))return scene.second+Math.round(clamp(progress,0,1)*(scene.endSecond-scene.second));if(scene.kind==='objective-setup'&&Number.isFinite(scene.decisionSecond))return scene.second+Math.round(clamp(progress,0,1)*(scene.decisionSecond-scene.second));return scene.kind==='nexus'?scene.second:scene.second+Math.round(clamp(progress,0,1)*Math.min(20,scene.kind==='opening'?10:18));}
