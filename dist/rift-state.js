import {accountIncome,fractionalIncome,availableFarmMinutes,botQuestReward} from './match-economy.js';
import {laningFarmRate,damageRate} from './laning.js';
import {claimObjectiveBounty,bountySnapshot} from './objective-bounties.js';
// Persistent structures, player economy and vision. Numerical coefficients are
// game estimates; damage is resolved per scene, not with LoL's server combat.
import {phaseStrength} from './champion-combat.js';
import {buffCoverage,structurePressure} from './objective-effects.js';
export const LANES=['top','mid','bot'];
export const ZONES=['blueTop','blueBot','redTop','redBot','riverTop','riverBot'];
export const TOWER_HP=[2700,3200,3600];
export const BUILDING_GOLD={tower:750,inhibitor:250,nexusTower:500,nexus:100};
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const other=(s,id)=>s.teams.find(x=>x!==id);
const sideOf=(s,id)=>id===s.teams[0]?'blue':'red';
const profile=(s,id)=>id===s.teams[0]?s.input.compositionBlue:s.input.compositionRed;
const macro=(s,id)=>s.macros[s.teams.indexOf(id)];
const laneName=lane=>({top:'탑',mid:'미드',bot:'바텀'})[lane];
export function initializeRift(s){
 s.structures=Object.fromEntries(s.teams.map(id=>[id,{lanes:Object.fromEntries(LANES.map(lane=>[lane,{towers:[...TOWER_HP],inhibitor:4000,inhibitorUntil:0}])),nexusTowers:[3000,3000],nexus:5000}]));
 s.vision=Object.fromEntries(s.teams.map((id,i)=>[id,[i?12:58,i?12:58,i?58:12,i?58:12,25,25]]));s.wards=[];s.lastPush={};s.wavePressure=Object.fromEntries(s.teams.map(id=>[id,{top:.6,mid:.6,bot:.6}]));
 for(const p of s.stats){p.gold=500;p.cs=0;p.level=1;}
}
export function creditPlayer(s,player,amount,{source='other'}={}){const p=s.stats.find(p=>p.player===player);if(!p||amount<0||!Number.isInteger(amount))throw Error('잘못된 골드 지급');p.gold+=amount;s.gold[p.team]+=amount;accountIncome(s,p,amount,source);}
export function creditTeam(s,id,amount,{roles=null,kind='shared',source='other'}={}){
 amount=Math.max(0,Math.round(amount));const players=s.stats.filter(p=>p.team===id&&(!roles||roles.includes(p.role)));if(!players.length)throw Error('골드 수령 선수 없음');
 const weights=players.map(p=>kind==='farm'?({TOP:1.1,JGL:.95,MID:1.25,BOT:1.3,SUP:.6}[p.role])*(1+clamp((p.k+.25*p.a-p.d*.7)*.012,-.16,.12)):kind==='objective'?(p.role==='JGL'?2:1):1),sum=weights.reduce((a,b)=>a+b,0);let left=amount;
 players.forEach((p,i)=>{const n=i===players.length-1?left:Math.floor(amount*weights[i]/sum);left-=n;creditPlayer(s,p.player,n,{source});});
}
export function farmPlayers(s,delta,{rng=()=>.5}={}){
 const from=s.clock-delta,tempo=.98+rng()*.04;
 for(const p of s.stats){
  const passiveMinutes=Math.max(0,s.clock-Math.max(from,1+50/60));creditPlayer(s,p.player,fractionalIncome(s,p.player,'passive',passiveMinutes*122.4),{source:'passive'});
  const available=availableFarmMinutes(s,p,from,s.clock),skill=clamp((p.team===s.teams[0]?s.powerGap:-s.powerGap)*.002,-.06,.06),rate=p.role==='SUP'?.8:p.role==='JGL'?5.8:7.6;
  const cs=available*tempo*(s.version>=15?laningFarmRate(s,p,from):rate*(1+skill)),source=p.role==='JGL'?'jungle':'lane',unit=p.role==='JGL'?(s.version>=15?23:27):21;
  p.cs+=cs;creditPlayer(s,p.player,fractionalIncome(s,p.player,source,cs*unit),{source});
  if(s.version>=15){
   const quest=botQuestReward(s,p,{laneMinutes:available,awayMinutes:Math.max(0,s.clock-Math.max(from,1+5/60)-available),minions:cs});
   if(quest)creditPlayer(s,p.player,quest,{source:'roleQuest'});
   p.damage+=available*damageRate(s,p)*(p.role==='JGL'?.46:.64);
  }
  p.level=clamp(1+Math.floor(s.clock*.25+p.cs/40+(p.k+p.a*.25)*.12),1,18);
 }
}
export function collectSideResources(s,id,{lane,rng,maximum=350}={}){
 const alive=s.stats.filter(p=>p.team===id&&(s.respawnAt[p.player]??0)<=s.clock),key=id+':'+lane,ready=clamp((s.clock-(s.sideCollections[key]??-2))/1.25,0,1),quality=clamp(.35+macro(s,id).split*.35+visionControl(s,id,lane)/200,.35,1);
 const laners=alive.filter(p=>['TOP','MID','BOT'].includes(p.role));if(!laners.length||ready<.2)return {gold:0,lane:0,jungle:0,minions:0,camps:0};
 const minions=Math.min(10,Math.floor((3+rng()*8)*quality*ready)),laneGold=Math.min(maximum,minions*21),camp=rng()<quality*.65&&ready>=.7&&alive.some(p=>p.role==='JGL'||p.role==='TOP')?1:0,jungleGold=camp?Math.min(maximum-laneGold,80+Math.floor(rng()*21)):0;
 const receiver=laners.find(p=>p.role===(lane==='top'?'TOP':lane==='bot'?'BOT':'MID'))??laners[0],jungler=alive.find(p=>p.role==='JGL')??receiver;
 creditPlayer(s,receiver.player,laneGold,{source:'sideLane'});receiver.cs+=laneGold/21;creditPlayer(s,jungler.player,jungleGold,{source:'sideJungle'});jungler.cs+=camp?4:0;s.sideCollections[key]=s.clock;
 const quest=botQuestReward(s,receiver,{minions:laneGold/21});if(quest)creditPlayer(s,receiver.player,quest,{source:'roleQuest'});
 return {gold:laneGold+jungleGold,lane:laneGold,jungle:jungleGold,minions,camps:camp};
}
export function tickRift(s,minute){
 const delta=Math.max(0,minute-s.clock);s.wards=s.wards.filter(w=>w.until>minute);
 for(const id of s.teams){for(const lane of LANES){const l=s.structures[id].lanes[lane];if(l.inhibitor===0&&l.inhibitorUntil<=minute){l.inhibitor=4000;l.inhibitorUntil=0;}}
  for(const lane of LANES)if(s.wavePressure?.[id])s.wavePressure[id][lane]=clamp(s.wavePressure[id][lane]+delta*(.12+macro(s,id).split*.12+buffCoverage(s,'baron',id)*.18+superPressure(s,id,lane)*.12),.05,1);
  const own=sideOf(s,id);s.vision[id]=s.vision[id].map((v,i)=>{const z=ZONES[i],defender=z.startsWith('blue')?s.teams[0]:z.startsWith('red')?s.teams[1]:null,half=z.endsWith('Top')?'top':'bot',opened=defender?(s.structures[defender].lanes[half].towers[0]===0?1:0)+(s.structures[defender].lanes.mid.towers[0]===0?1:0):0,base=z.startsWith(own)?45-opened*9:z.startsWith('river')?20:8+opened*9;return Math.round(clamp(v+(base-v)*Math.min(.35,delta*.065),0,100)*10)/10;});
 }
}
export function laneAccess(s,attacker,lane){return s.structures[other(s,attacker)].lanes[lane].towers.filter(hp=>hp===0).length;}
export function superPressure(s,id,lane=null){const enemy=s.structures[other(s,id)];return (lane?[lane]:LANES).filter(l=>enemy.lanes[l].inhibitor===0&&enemy.lanes[l].inhibitorUntil>s.clock).length;}
export function pushLane(s,id,rng,preferred=null){
 if(preferred&&LANES.includes(preferred))return preferred;
 const values=LANES.map(l=>{const line=s.structures[other(s,id)].lanes[l],hp=line.towers.find(x=>x>0)??line.inhibitor;return [l,1+laneAccess(s,id,l)*.65+(1-hp/4000)*.4+(superPressure(s,id,l)?1.2:0)+(l==='mid'?.25:macro(s,id).split*.4)];});
 let r=rng()*values.reduce((n,[,w])=>n+w,0);return values.find(([,w])=>(r-=w)<=0)?.[0]??'mid';
}
function zonesFor(s,id,location){
 if(['baron','grubs','herald'].includes(location))return ['riverTop'];if(['dragon','elder'].includes(location))return ['riverBot'];
 const lane=LANES.includes(location)?location:'mid',own=sideOf(s,id),enemy=sideOf(s,other(s,id));
 if(lane==='mid')return ['riverTop','riverBot',...(laneAccess(s,id,lane)>0?[enemy+'Top',enemy+'Bot']:[])];
 const half=lane==='top'?'Top':'Bot';return ['river'+half,laneAccess(s,id,lane)>0?enemy+half:own+half];
}
export function gainVision(s,id,location,amount=15){
 const zones=zonesFor(s,id,location),enemy=other(s,id),ability=macro(s,id).vision;
 for(const zone of zones){const i=ZONES.indexOf(zone);s.vision[id][i]=clamp(s.vision[id][i]+amount*(.55+ability),0,100);s.vision[enemy][i]=clamp(s.vision[enemy][i]-amount*ability*.45,0,100);s.wards=s.wards.filter(w=>!(w.team===enemy&&w.zone===zone));s.wards=s.wards.filter(w=>!(w.team===id&&w.zone===zone));s.wards.push({team:id,zone,until:s.clock+2.5});}
 return zones;
}
export function visionControl(s,id,location='mid'){
 const zones=zonesFor(s,id,location);return zones.reduce((n,z)=>n+s.vision[id][ZONES.indexOf(z)],0)/zones.length;
}
export function visionFightGap(s,location='mid'){return clamp((visionControl(s,s.teams[0],location)-visionControl(s,s.teams[1],location))/100*3.6,-3.6,3.6);}
export function waveclear(s,id,lane='mid',dead=[]){
 // AoE, range and repeatable damage, including empowered waves. Role and
 // actual pre-siege KDA/phase matter; dead defenders cannot clear a wave.
 const exceptional=new Set(['Anivia','Sivir','Ziggs','Viktor','Hwei','Azir','Ryze','AurelionSol','Smolder']),strong=new Set(['Orianna','Syndra','Taliyah','Malzahar','Xerath','Velkoz','Seraphine','Tristana','Jinx','Xayah','Caitlyn','Gangplank','Rumble','Gwen']);
 const players=s.stats.filter(p=>p.team===id&&!dead.includes(p.player)&&!((s.respawnAt?.[p.player]??0)>s.clock));
 const scores=players.map(p=>{const base=exceptional.has(p.champion)?1:strong.has(p.champion)?.8:['MID','BOT'].includes(p.role)?.5:.22,phase=phaseStrength(p.champion,s.clock),form=clamp(1+p.k*.035+p.a*.008-p.d*.025,.55,1.35);return base*clamp(.7+(phase-2)*.15,.55,1.25)*form;}).sort((a,b)=>b-a);
 return clamp((scores[0]??0)*.64+(scores[1]??0)*.26+(scores[2]??0)*.1,0,1);
}
export function nextBuilding(s,attacker,lane){
 const defender=other(s,attacker),base=s.structures[defender],l=base.lanes[lane],index=l.towers.findIndex(hp=>hp>0);
 if(index>=0)return {defender,lane,kind:'tower',index,hp:l.towers[index],max:TOWER_HP[index]};
 if(l.inhibitor>0)return {defender,lane,kind:'inhibitor',index:0,hp:l.inhibitor,max:4000};
 const nt=base.nexusTowers.findIndex(hp=>hp>0);if(nt>=0)return {defender,lane,kind:'nexusTower',index:nt,hp:base.nexusTowers[nt],max:3000};
 return {defender,lane,kind:'nexus',index:0,hp:base.nexus,max:5000};
}
export function siegeBaseDamage(s,id,{lane='mid',dead=[],uncontested=false,roles=null}={}){
 const defender=other(s,id),baron=buffCoverage(s,'baron',id),supers=superPressure(s,id),clear=uncontested?waveclear(s,defender,lane,dead)*.22:waveclear(s,defender,lane,dead),c=profile(s,id)??{},survivors=s.stats.filter(p=>p.team===id&&(!roles||roles.includes(p.role))&&!dead.includes(p.player)&&!((s.respawnAt?.[p.player]??0)>s.clock)).length;
 const lead=s.gold[id]-s.gold[defender],power=clamp(1+lead*goldInfluenceApprox(s.clock)/40000,.55,1.5),scaling=1+Math.max(0,s.clock-24)*.045;
 return {baron,supers,clear,survivors,base:survivors?survivors/5*(1450+(c.dps??1)*260+(c.poke??0)*100+survivors*130)*scaling*power*(1+structurePressure(s,id)+supers*.18)*(1-clear*(baron>.1?.32:.65)):0};
}
function closingCandidate(s,id,lane,atLane=null){
 const defender=other(s,id),base=s.structures[defender],l=base.lanes[lane],estimate=siegeBaseDamage(s,id,{lane});if(!estimate.survivors)return null;
 const waves=s.wavePressure?.[id]?.[lane]??1,arrival=waves<.25?6+(.25-waves)*35:0,advance=atLane===lane?0:l.towers[0]>0?12:l.towers[1]>0?8:l.towers[2]>0?4:0;
 const remaining=l.towers.reduce((n,h)=>n+h,0)+l.inhibitor+base.nexusTowers.reduce((n,h)=>n+h,0)+base.nexus;
 const lateScale=1+clamp((s.clock-25)/20,0,.75),damagePerSecond=estimate.base*lateScale*.8*(.65+Math.max(.6,waves)*.35)/15;
 const respawns=s.stats.filter(p=>p.team===defender&&(s.respawnAt?.[p.player]??0)>s.clock).map(p=>(s.respawnAt[p.player]-s.clock)*60).sort((a,b)=>a-b),dead=respawns.length;
 const window=dead>=3?respawns[dead-3]-2:dead===2?Math.min(20,respawns[0]-2):12;
 const travel=arrival+advance,seconds=travel+remaining/Math.max(1,damagePerSecond)+3;
 return {team:id,lane,remaining,damage:estimate.base,damagePerSecond,lateScale,dead,survivors:estimate.survivors,travel,seconds,window,score:damagePerSecond/Math.max(1,remaining)+dead*.1};
}
export function finishingPlan(s,{team=null,atLane=null}={}){
 return s.teams.filter(id=>!team||id===team).flatMap(id=>LANES.map(lane=>closingCandidate(s,id,lane,atLane))).filter(p=>p&&p.seconds<=p.window).sort((a,b)=>b.score-a.score)[0]??null;
}
export function closingPressurePlan(s){
 if(s.clock<30)return null;
 return s.teams.flatMap(id=>{
  if(s.clock-(s.lastClosingAttempt?.[id]??-100)<1)return [];
  const lead=s.gold[id]-s.gold[other(s,id)],elder=buffCoverage(s,'elder',id)>0;
  return LANES.map(lane=>closingCandidate(s,id,lane)).filter(p=>p&&p.survivors>=3&&lead>=6000&&(p.dead>=2||elder||laneAccess(s,id,p.lane)>=2&&lead>=9000));
 }).sort((a,b)=>b.score-a.score)[0]??null;
}
export function attackStructures(s,id,{lane='mid',rng,dead=[],uncontested=false,trade=false,forceDamage=null,damageScale=1,maxStructures=7,roles=null,consumeWave=true}={}){
 const defender=other(s,id),{baron,supers,clear,base}=siegeBaseDamage(s,id,{lane,dead,uncontested,roles});
 let damage=forceDamage??base*(.8+rng()*.4)*damageScale*(.65+(s.wavePressure?.[id]?.[lane]??1)*.35);
 if(trade)damage*=.9;if(forceDamage===null&&(s.wavePressure?.[id]?.[lane]??1)<.25)damage=0;damage=Math.max(0,Math.round(damage));const result={team:id,defender,lane,baron:baron>0,superMinions:supers,clear:Math.round(clear*100),damage:0,structures:[],gold:0,bounty:0,vision:[],blocked:false};
 for(let count=0;count<(trade?1:maxStructures)&&damage>0;count++){
  const b=nextBuilding(s,id,lane);if(b.hp<=0)break;const dealt=Math.min(b.hp,damage);damage-=dealt;result.damage+=dealt;const hp=Math.max(0,b.hp-dealt),base=s.structures[defender],l=base.lanes[lane];
  if(b.kind==='tower')l.towers[b.index]=hp;else if(b.kind==='inhibitor'){l.inhibitor=hp;if(!hp)l.inhibitorUntil=s.clock+5;}else if(b.kind==='nexusTower')base.nexusTowers[b.index]=hp;else base.nexus=hp;
  const change={...b,hpBefore:b.hp,hpAfter:hp,destroyed:hp===0};result.structures.push(change);
  if(!hp&&s.version>=15&&b.kind==='tower'){
   const carry=s.stats.find(p=>p.team===id&&p.role==='BOT'&&(!roles||roles.includes(p.role))&&(s.respawnAt[p.player]??0)<=s.clock);
   if(carry){const quest=botQuestReward(s,carry,{points:lane==='bot'?50:25});if(quest)creditPlayer(s,carry.player,quest,{source:'roleQuest'});}
  }
  if(!hp){const bonus=claimObjectiveBounty(s,id,b.kind,b.index);const reward=BUILDING_GOLD[b.kind];if(reward>0){creditTeam(s,id,reward,{roles,source:'structures'});result.gold+=reward;change.gold=reward;}if(!s.firstTowerClaimed&&['tower','nexusTower'].includes(b.kind)){s.firstTowerClaimed=true;creditTeam(s,id,300,{roles,source:'firstTower'});result.gold+=300;change.firstTower=300;}if(bonus){creditTeam(s,id,bonus,{source:'objectiveBounty'});result.bounty+=bonus;change.bounty=bonus;}result.vision.push(...gainVision(s,id,lane,b.kind==='tower'?22:14));if(b.kind==='nexus')break;}
  if(hp>0)break;
 }
 if(!result.structures.some(x=>x.destroyed)&&clear>.5){result.blocked=true;gainVision(s,defender,lane,6);}
 if(consumeWave&&s.wavePressure?.[id])s.wavePressure[id][lane]=Math.max(.08,s.wavePressure[id][lane]-.65);s.lastPush[id]={lane,minute:s.clock};return result;
}
function goldInfluenceApprox(t){return t<=40?1:Math.max(.35,1-(t-40)*.035);}
export function towerCount(s,id){return 11-s.structures[other(s,id)].nexusTowers.filter(x=>x>0).length-LANES.reduce((n,l)=>n+s.structures[other(s,id)].lanes[l].towers.filter(x=>x>0).length,0);}
export function riftSnapshot(s){return {structures:structuredClone(s.structures),vision:structuredClone(s.vision),wards:structuredClone(s.wards),towers:Object.fromEntries(s.teams.map(id=>[id,towerCount(s,id)])),players:s.stats.map(p=>[p.gold,Math.round(p.cs),p.level]),bounty:bountySnapshot(s),waves:structuredClone(s.wavePressure??{}),economy:structuredClone(s.economy??null)};}
export function pushNarration(result){const lane=laneName(result.lane),destroyed=result.structures.filter(x=>x.destroyed),labels={tower:'포탑',inhibitor:'억제기',nexusTower:'넥서스 포탑',nexus:'넥서스'};return `${result.baron?'바론 강화 미니언과 함께 ':result.superMinions?'슈퍼 미니언 압박으로 ':''}${lane} 공성. ${destroyed.length?destroyed.map(x=>x.kind==='tower'?`${x.index+1}차 포탑`:labels[x.kind]).join('·')+' 파괴':result.blocked?'수비진의 미니언 정리로 공성 저지':'구조물 체력 감소'}${result.gold?` · +${result.gold}G`:''}${result.bounty?` · 오브젝트 현상금 +${result.bounty}G`:''}${result.vision.length?' · 상대 정글 시야·진입로 확보':''}.`;}
