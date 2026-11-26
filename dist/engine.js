import {draftCounterThreat} from './draft-matchups.js';
import {start2026Cup,begin2026International,advance2026Phase,groupPoints,migrate2026SecondHalf} from './rules2026.js';
import {simulateMatch,SIMULATION_MODEL,battleProbability,createMatchState,advanceMatch,matchOutcome,objectivePreview,upgradeMatchState} from './match-sim.js';
export {championCombatProfile,championCombat,combatLabels,phaseStrength,fightStage} from './champion-combat.js';
import {compositionProfile,compositionMatchup,compositionLabels} from './composition.js';
export const ROLES = ['TOP','JGL','MID','BOT','SUP'];
export const ROLE_NAMES = {TOP:'탑',JGL:'정글',MID:'미드',BOT:'원딜',SUP:'서포터'};
export const PROGRAMS = {balanced:'균형 훈련',mechanics:'개인 기량',champion:'챔피언 집중',scrim:'팀 스크림',rest:'휴식'};
export const DRAFT_ROUNDS = [
 {id:'ban1',label:'1차 밴',kind:'ban',summary:'각 팀 3밴',blocks:[['first',1],['second',1],['first',1],['second',1],['first',1],['second',1]]},
 {id:'pick1',label:'1차 픽',kind:'pick',summary:'선픽 1 · 후픽 2 · 선픽 2 · 후픽 1',blocks:[['first',1],['second',2],['first',2],['second',1]]},
 {id:'ban2',label:'2차 밴',kind:'ban',summary:'각 팀 2밴',blocks:[['second',1],['first',1],['second',1],['first',1]]},
 {id:'pick2',label:'2차 픽',kind:'pick',summary:'후픽 1 · 선픽 2 · 후픽 1',blocks:[['second',1],['first',2],['second',1]]}
];
// The canonical blue/red names here are compatibility aliases for first/second.
// draftActions maps them to the chosen map colors after First Selection.
export const ACTIONS=DRAFT_ROUNDS.flatMap(round=>round.blocks.flatMap(([order,count])=>Array.from({length:count},()=>[order==='first'?'blue':'red',round.kind])));
export function draftStatus(d){
 let start=0;for(const round of DRAFT_ROUNDS)for(const [order,count] of round.blocks){
  if(d.step<start+count)return {...round,order,count,index:d.step-start+1,remaining:start+count-d.step,blockStart:start,roundStart:DRAFT_ROUNDS.slice(0,DRAFT_ROUNDS.indexOf(round)).reduce((n,r)=>n+r.blocks.reduce((a,b)=>a+b[1],0),0)};
  start+=count;
 }return {id:'assignment',label:'포지션 배치',count:0,index:0,remaining:0};
}
let DB;
export function configure(data) {
 DB=data; DB.champMap=Object.fromEntries(data.champions.map(c=>[c.id,c]));
 DB.playerMap=Object.fromEntries(data.players.map(p=>[p.id,p]));
 return DB;
}
export const database=()=>DB;
export const clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
export function random(s) { let t=s.rng+=0x6D2B79F5; t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);s.rng>>>=0;return ((t^(t>>>14))>>>0)/4294967296; }
export function dayAdd(date,n) {const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);}
export const dayDistance=(a,b)=>Math.round((Date.parse(b)-Date.parse(a))/86400000);
export function patchAt(date,competition='') {
 if(DB?.season?.startYear===2026){
  if(competition==='WORLDS')return '16.20.1';
  if(competition==='FST')return DB.season.eventPatches?.FST??'16.5.1';
  if(competition==='MSI')return DB.season.eventPatches?.MSI??'16.13.1';
  if(competition&&DB.season.competitivePatches?.length)return DB.season.competitivePatches.filter(p=>p.from<=date.slice(5)).at(-1)?.version??'16.1.1';
  const md=date.slice(5),dates=DB.season.patchDates;
  return `16.${Math.max(1,dates.filter(d=>d<=md).length)}.1`;
 }
 if(competition==='WORLDS') return '12.18.1';
 const md=date.slice(5);const milestones=['01-01','01-20','02-02','02-16','03-02','03-30','04-13','04-27','05-11','05-25','06-08','06-23','07-13','07-27','08-10','08-24','09-08','09-21','10-05','10-19','11-02','11-16','12-07'];
 return `12.${Math.max(1,milestones.filter(d=>d<=md).length)}.1`;
}
export const patchLabel=version=>version?.startsWith('16.')?`26.${String(Number(version.split('.')[1])).padStart(2,'0')}`:version;
export function currentPool(s,competition='') {const patch=patchAt(s.date,competition);return DB.champions.filter(c=>c.available[patch]);}
export function getPlayer(s,id) {return s.players[id];}
export function team(s,id) {return s.teams[id];}
export function lineup(s,teamId) {return ROLES.map(r=>getPlayer(s,team(s,teamId).lineup[r])).filter(Boolean);}
export function mastery(s,playerId,championId) {
 const evidence=DB.mastery?.players?.[playerId]?.champions?.[championId];
 const verified=DB.masteryRecords?.players?.[playerId]?.[championId]?.findLast(([day])=>day<s.date);
 return clamp((verified?.[1]??evidence?.score??48)+(s.masteryGains[playerId]?.[championId]??0),0,99);
}
export function masteryEvidence(playerId,championId) {return DB.mastery?.players?.[playerId]?.champions?.[championId]??{games:0,wins:0,source:'estimated',confidence:'unobserved'};}
export function metaFor(s) {
 const date=DB.season?.startYear===2026?'2026-'+s.date.slice(5)+'T00:00:00':'2022-'+s.date.slice(5,7)+'-01T00:00:00';
 const snapshots=DB.meta?.snapshots??[];return snapshots.filter(z=>z.asOfExclusive<=date).at(-1)??{games:0,champions:[]};
}
export function power(s,teamId) {const ps=lineup(s,teamId);return ps.reduce((n,p)=>n+p.ovr-(p.fatigue??0)*.035+(p.morale-70)*.015,0)/Math.max(1,ps.length)+(team(s,teamId).synergy-50)*.025;}
export function newGame(teamId='T1',seed=123456) {
 const season=DB.season??{id:'season-2022',startYear:2022,startDate:'2022-01-03'};
 const s={version:2,dataProfile:season.id,year:season.startYear,date:season.startDate,rng:seed>>>0,myTeam:teamId,teams:{},players:{},phase:{key:'PRESEASON',title:'프리시즌'},matches:[],nextMatchId:1,activeDraft:null,viewing:null,masteryGains:{},focus:{},trainingPlan:['balanced','champion','scrim','rest','balanced','scrim','rest'],strategy:'balanced',news:[],ledger:[],trophies:[],career:[],international:{},seasonComplete:false,autoMatches:false,trades:[],nextTradeId:1};
 for(const t of DB.teams) s.teams[t.id]={...t,lineup:{},synergy:55,fan:Math.round(t.reputation*1500),coach:1,facility:1};
 for(const p of DB.players) s.players[p.id]={...p,owner:p.team,fatigue:8,morale:80,xp:0,contractEnd:s.year,salary:p.salary??1};
 for(const t of Object.values(s.teams)) for(const role of ROLES) {
  let candidates=Object.values(s.players).filter(p=>p.owner===t.id&&p.position===role).sort((a,b)=>(a.draftLeague==='LCK'?-1000:0)+b.ovr-((b.draftLeague==='LCK'?-1000:0)+a.ovr));
  // Preserve opening roster order from Story rather than selecting a later-season signing by OVR.
  const opening=Object.values(s.players).find(p=>p.owner===t.id&&p.position===role&&p.draftLeague==='LCK');
  t.lineup[role]=t.startingLineup?.[role]??(opening??candidates[0])?.id;
 }
 for(const ft of DB.international?.teams??[]) {
  s.teams[ft.id]={...ft,lineup:{},synergy:60,fan:100000,budget:0,support:0,sponsor:0,coach:1,facility:1,foreign:true};
  for(const fp of ft.players){s.players[fp.id]={...fp,owner:ft.id,fatigue:5,morale:80,xp:0,contractEnd:s.year,salary:0};s.teams[ft.id].lineup[fp.position]=fp.id;}
 }
 news(s,'커리어 시작',`${team(s,teamId).name}의 지휘봉을 잡았습니다. ${s.year} 개막 선수 · ${DB.season?.competitionFormat??2025} 대회 형식 · ${s.year} 패치 흐름.`);
 return s;
}
export function news(s,title,body) {s.news.unshift({date:s.date,title,body});s.news=s.news.slice(0,60);}
export function spend(s,amount,category,description) {const t=team(s,s.myTeam);if(t.budget<amount)throw Error('보유 자금이 부족합니다.');t.budget-=amount;s.ledger.unshift({date:s.date,amount:-amount,category,description});s.ledger=s.ledger.slice(0,100);}
export function roster(s,teamId=s.myTeam) {return Object.values(s.players).filter(p=>p.owner===teamId);}
export function setStarter(s,playerId) {if(s.activeDraft||s.activeMatch)throw Error('경기 또는 밴픽 중에는 제출한 선수 라인업을 변경할 수 없습니다.');const p=getPlayer(s,playerId);if(!p||p.owner!==s.myTeam||p.contractEnd<s.year)throw Error('등록 가능한 우리 구단 선수가 아닙니다.');team(s,s.myTeam).lineup[p.position]=p.id;news(s,'라인업 변경',`${p.name} 선수를 ${ROLE_NAMES[p.position]} 주전으로 등록했습니다.`);}
export function extendContract(s,id,years=1) {const p=getPlayer(s,id);if(p.owner!==s.myTeam)throw Error('우리 구단 선수만 재계약할 수 있습니다.');if(p.contractEnd>=s.year+2)throw Error('계약 기간이 충분히 남아 있습니다.');const cost=Math.round(p.salary*.2*10)/10;spend(s,cost,'계약금',`${p.name} ${years}년 연장`);p.contractEnd=Math.max(s.year,p.contractEnd)+years;p.morale=clamp(p.morale+8,0,100);}
// Transfers are save-local game rules; existing contracts travel with the player.
export function isInSeason(s) {return !s.seasonComplete&&!['PRESEASON','OFFSEASON'].includes(s.phase.key);}
export function pendingTrade(s,id) {return (s.trades??[]).find(t=>t.status==='pending'&&(t.outgoing===id||t.incoming===id));}
function tradePlayers(s,outgoing,incoming,opponent) {
 const a=getPlayer(s,outgoing),b=getPlayer(s,incoming);
 if(!a||!b||a.owner!==s.myTeam||!b.owner||b.owner===s.myTeam||!team(s,b.owner)||b.owner!==opponent)throw Error('선수 소속이 변경되어 트레이드를 진행할 수 없습니다.');
 if(a.foreign||b.foreign)throw Error('트레이드는 LCK·CL 구단 선수만 신청할 수 있습니다.');
 if(a.position!==b.position)throw Error('같은 포지션 선수끼리 1대1 트레이드를 신청해 주세요.');
 if(a.contractEnd<s.year||b.contractEnd<s.year)throw Error('계약이 유효한 선수만 트레이드할 수 있습니다.');
 return {a,b};
}
export function tradeEvaluation(s,outgoing,incoming) {
 const {a,b}=tradePlayers(s,outgoing,incoming,getPlayer(s,incoming)?.owner);
 const starter=team(s,b.owner).lineup[b.position]===b.id;
 const value=p=>p.ovr+p.potential*.25-p.salary*.15+Math.min(2,Math.max(0,p.contractEnd-s.year))*.5;
 const accepted=value(a)+.5>=value(b)+(starter?1.5:0)&&(!starter||a.ovr>=b.ovr-2);
 return {accepted,reason:accepted?'전력·성장 가능성·연봉·계약 기간을 검토한 결과 교환 가치가 충분합니다.':'상대 구단이 요구하는 교환 가치가 부족합니다. 주전은 즉시 전력 유지 조건도 확인합니다.'};
}
export function requestTrade(s,outgoing,incoming) {
 if(s.activeDraft||s.activeMatch)throw Error('경기 또는 밴픽을 마친 뒤 트레이드를 신청할 수 있습니다.');
 const {a,b}=tradePlayers(s,outgoing,incoming,getPlayer(s,incoming)?.owner);
 if(pendingTrade(s,a.id)||pendingTrade(s,b.id))throw Error('이미 검토 중인 트레이드에 포함된 선수입니다.');
 s.trades??=[];s.nextTradeId??=Math.max(0,...s.trades.map(t=>Number(t.id)||0))+1;
 const deal={id:s.nextTradeId++,outgoing:a.id,incoming:b.id,opponent:b.owner,status:'pending',date:s.date,responseDate:isInSeason(s)?dayAdd(s.date,1):s.date,outgoingName:a.name,incomingName:b.name};
 s.trades.unshift(deal);news(s,'트레이드 신청',`${team(s,b.owner).name}에 ${a.name} ↔ ${b.name} 교환을 신청했습니다. 검토일 ${deal.responseDate}.`);
 processTrades(s);return deal;
}
export function cancelTrade(s,id) {
 const deal=(s.trades??[]).find(t=>String(t.id)===String(id));
 if(!deal||deal.status!=='pending')throw Error('취소할 수 있는 트레이드 신청이 아닙니다.');
 deal.status='cancelled';deal.resolvedDate=s.date;deal.reason='우리 구단이 신청을 철회했습니다.';
 news(s,'트레이드 철회',`${deal.outgoingName} ↔ ${deal.incomingName} 신청을 취소했습니다.`);
}
export function processTrades(s) {
 if(s.activeDraft||s.activeMatch)return;
 for(const deal of s.trades??[]) {
  if(deal.status!=='pending'||(isInSeason(s)&&deal.responseDate>s.date))continue;
  deal.resolvedDate=s.date;
  try {
   const {a,b}=tradePlayers(s,deal.outgoing,deal.incoming,deal.opponent),review=tradeEvaluation(s,a.id,b.id);
   deal.reason=review.reason;
   if(!review.accepted){deal.status='rejected';news(s,'트레이드 거절',`${team(s,deal.opponent).name}: ${deal.outgoingName} ↔ ${deal.incomingName}. ${deal.reason}`);continue;}
   const ours=team(s,s.myTeam),theirs=team(s,deal.opponent);
   if(ours.lineup[a.position]===a.id)ours.lineup[a.position]=b.id;
   if(theirs.lineup[b.position]===b.id)theirs.lineup[b.position]=a.id;
   a.owner=deal.opponent;b.owner=s.myTeam;deal.status='accepted';
   news(s,'트레이드 성사',`${deal.outgoingName} ↔ ${deal.incomingName}. 기존 계약·연봉을 승계하고 주전 자리는 교환 선수로 대체했습니다.`);
  } catch(error) {deal.status='cancelled';deal.reason=error.message;news(s,'트레이드 취소',`${deal.outgoingName} ↔ ${deal.incomingName}. ${deal.reason}`);}
 }
}
export function signPlayer(s,id) {
 if(s.activeDraft||s.activeMatch)throw Error('경기 또는 밴픽을 마친 뒤 선수단을 변경할 수 있습니다.');
 const p=getPlayer(s,id);if(!p||p.owner===s.myTeam)throw Error('영입 대상이 아닙니다.');if(p.foreign)throw Error('기본 버전 이적시장은 LCK·CL 선수만 지원합니다.');
 if(p.owner&&isInSeason(s))throw Error('시즌 중 다른 구단 선수는 직접 영입할 수 없습니다. 트레이드를 신청해 주세요.');
 if(pendingTrade(s,id))throw Error('트레이드 검토 중인 선수입니다. 신청을 취소한 뒤 영입해 주세요.');
 const old=team(s,p.owner);const fee=p.owner?Math.round(p.salary*1.5*10)/10:0;
 if(old?.lineup[p.position]===p.id) {
  const backup=roster(s,old.id).filter(a=>a.position===p.position&&a.id!==p.id&&a.contractEnd>=s.year).sort((a,b)=>b.ovr-a.ovr)[0];
  if(!backup)throw Error('상대 구단에 해당 포지션의 대체 선수가 없어 이적을 거절했습니다.');
  if(team(s,s.myTeam).budget<fee+p.salary*.2)throw Error('이적료와 계약금을 지불할 자금이 부족합니다.');
  old.lineup[p.position]=backup.id;
 }
 spend(s,fee+p.salary*.2,'선수 영입',`${p.name} 이적료·계약금`);if(old)old.budget+=fee;p.owner=s.myTeam;p.contractEnd=s.year+1;p.morale=85;news(s,'영입 완료',`${p.name} 선수가 합류했습니다. 연봉 ${p.salary.toFixed(1)}억, 계약 ${p.contractEnd}년까지.`);
}
export function releasePlayer(s,id) {if(s.activeDraft||s.activeMatch)throw Error('경기 또는 밴픽을 마친 뒤 선수단을 변경할 수 있습니다.');const p=getPlayer(s,id);if(p.owner!==s.myTeam)throw Error('우리 구단 선수가 아닙니다.');if(pendingTrade(s,id))throw Error('트레이드 검토 중인 선수는 방출할 수 없습니다.');if(team(s,s.myTeam).lineup[p.position]===id)throw Error('주전 교체 후 방출할 수 있습니다.');spend(s,p.salary*.25,'계약 해지',p.name);p.owner=null;}
export function upgrade(s,kind) {const t=team(s,s.myTeam);const lv=t[kind];if(lv>=5)throw Error('최대 레벨입니다.');spend(s,5*lv,'시설 투자',kind==='coach'?'코칭 스태프 확충':'훈련 시설 개선');t[kind]++;news(s,'구단 투자',`${kind==='coach'?'코칭':'훈련 시설'} 레벨 ${t[kind]} 달성.`);}
export function trainDay(s) {
 const d=new Date(s.date+'T12:00:00Z');const index=(d.getUTCDay()+6)%7;const program=s.trainingPlan[index];
 for(const p of roster(s)) {
  const rest=program==='rest';p.fatigue=clamp(p.fatigue+(rest?-20:program==='scrim'?5:program==='mechanics'?4:1),0,100);p.morale=clamp(p.morale+(rest?1:p.fatigue>80?-2:0),0,100);
  if(!rest&&p.fatigue<85){p.xp+=(program==='mechanics'?1.8:.8)*(1+(team(s,s.myTeam).coach-1)*.1);if(p.xp>=70&&p.ovr<p.potential){p.ovr++;p.xp-=70;}}
  const focus=s.focus[p.id];if(program==='champion'&&focus&&currentPool(s).some(c=>c.id===focus)) {s.masteryGains[p.id]??={};s.masteryGains[p.id][focus]=Math.min(35,(s.masteryGains[p.id][focus]??0)+.4*(1+team(s,s.myTeam).facility*.15));}
 }
 for(const p of Object.values(s.players))if(p.owner!==s.myTeam)p.fatigue=clamp(p.fatigue-6,0,100);
 const t=team(s,s.myTeam);t.synergy=clamp(t.synergy+(program==='scrim'?.8:program==='rest'?0:.1),0,100);
 if(d.getUTCDay()===1) {const salary=roster(s).reduce((n,p)=>n+p.salary,0)/52;const income=(t.support+t.sponsor)/52;const net=income-salary-.16;t.budget+=net;s.ledger.unshift({date:s.date,amount:net,category:'주간 정산',description:`지원·스폰서 ${income.toFixed(2)}억 / 연봉·운영 ${(salary+.16).toFixed(2)}억`});s.ledger=s.ledger.slice(0,100);}
}
export function standings(s,ids,competition,roundPrefix='') {
 const rows=ids.map(id=>({id,w:0,l:0,sw:0,sl:0,played:0}));const map=Object.fromEntries(rows.map(x=>[x.id,x]));
 for(const m of s.matches)if(m.id.startsWith(s.year+'-')&&m.status==='done'&&m.competition===competition&&(!roundPrefix||m.phase.startsWith(roundPrefix))){
  for(let i=0;i<2;i++){const r=map[m.teams[i]];if(!r)continue;r.played++;r.sw+=m.score[i];r.sl+=m.score[1-i];if(m.winner===r.id)r.w++;else r.l++;}
 }
 return rows.sort((a,b)=>b.w-a.w||(b.sw-b.sl)-(a.sw-a.sl)||((randomTie(a.id)-randomTie(b.id))));
}
function randomTie(id){return [...id].reduce((n,c)=>n+c.charCodeAt(0),0);}
export function roundRobin(ids,cycles=1) {
 const list=[...ids];if(list.length%2)list.push(null);const rounds=[];
 for(let cycle=0;cycle<cycles;cycle++) {let ring=[...list];for(let r=0;r<list.length-1;r++){const pairs=[];for(let i=0;i<list.length/2;i++){let a=ring[i],b=ring[ring.length-1-i];if(a&&b){if(ids.length%2){const delta=(ids.indexOf(b)-ids.indexOf(a)+ids.length)%ids.length;const aHome=delta<=Math.floor(ids.length/2);pairs.push(aHome!==Boolean(cycle%2)?[a,b]:[b,a]);}else pairs.push((r+cycle)%2?[b,a]:[a,b]);}}rounds.push(pairs);ring=[ring[0],ring.at(-1),...ring.slice(1,-1)];}}
 return rounds;
}
export function anchor(s,md) {const target=`${s.year}-${md}`;return target>s.date?target:dayAdd(s.date,1);}
export function addPhase(s,key,title,pairs,bestOf,competition,options={}) {
 const start=options.start??dayAdd(s.date,1);s.phase={key,title,...options};
 pairs.forEach((round,ri)=>round.forEach((pair,pi)=>s.matches.push({id:`${s.year}-${s.nextMatchId++}`,phase:key,competition,round:options.roundLabel??`${ri+1}라운드`,date:dayAdd(start,ri*(options.spacing??2)),teams:pair,bestOf,status:'scheduled',score:[0,0],sets:[],winner:null})));
 news(s,title,options.description??'일정을 확인하고 다음 경기를 준비하세요.');
}
const domestic=()=>DB.teams.map(t=>t.id);
function completed(s){return s.matches.filter(m=>m.id.startsWith(s.year+'-')&&m.phase===s.phase.key);}
const winner=m=>m.winner;
const loser=m=>m.teams.find(t=>t!==m.winner);
function bySeeds(s,ids) {return [...ids].sort((a,b)=>s.seeds.indexOf(a)-s.seeds.indexOf(b));}
export const cupGroupScore=(s,ids)=>DB.season?.competitionFormat===2026?groupPoints(s,ids):standings(s,ids,'CUP','CUP_GROUP').reduce((n,r)=>n+r.w,0);
export function startSeason(s) {
 if(s.phase.key!=='PRESEASON')throw Error('이미 시즌이 시작되었습니다.');
 for(const p of lineup(s,s.myTeam))if(p.contractEnd<s.year)throw Error('계약이 만료된 주전의 재계약이 필요합니다.');
 if(lineup(s,s.myTeam).length!==5)throw Error('5개 포지션의 주전을 등록하세요.');
 const previous=s.career.at(-1),captains=previous?[previous.lck,previous.runner]:(DB.season?.cupCaptains??['DK','T1']);
 const ranked=domestic().filter(id=>!captains.includes(id)).sort((a,b)=>power(s,b)-power(s,a));const groups=[[captains[0]],[captains[1]]];ranked.forEach((id,i)=>groups[[0,1,1,0,0,1,1,0][i]].push(id));s.cupGroups=groups;
 if(DB.season?.competitionFormat===2026){start2026Cup(s,groups);return;}
 const rounds=Array.from({length:5},(_,r)=>groups[0].map((a,i)=>{const b=groups[1][(i+r)%5];return r<2||(r===2&&i%2===0)?[a,b]:[b,a];}));
 addPhase(s,'CUP_GROUP','LCK CUP · 그룹 배틀',rounds,3,'CUP',{start:anchor(s,DB.season?.cupStart??'01-12'),spacing:3,groups,description:'상대 그룹 5팀과 BO3. 그룹 합산 승수로 승자 그룹을 결정합니다.'});
}
function startRegular(s) {addPhase(s,'REG12','LCK 정규 1·2라운드',roundRobin(domestic(),2),3,'REGULAR',{start:anchor(s,'04-02'),spacing:3,description:'10팀 더블 라운드 로빈, 팀당 18시리즈. 상위 6팀이 Road to MSI에 진출합니다.'});}
function internationalParticipants(s,kind) {
 const regions=['LPL','LEC','LTA','LCP'];const result=[];
 for(const region of regions) {
  const candidates=Object.values(s.teams).filter(t=>t.region===region).sort((a,b)=>power(s,b.id)-power(s,a.id));
  result.push(...candidates.slice(0,kind==='FST'?1:kind==='MSI'?2:3).map(t=>t.id));
 }
 const local=kind==='FST'?[s.cupChampion]:kind==='MSI'?s.msiSeeds:s.worldsSeeds.slice(0,3);
 return [...local,...result];
}
function beginInternational(s,kind) {
 if(DB.season?.competitionFormat===2026){begin2026International(s,kind);return;}
 if(kind==='FST') {const ids=internationalParticipants(s,kind);s.international.fstParticipants=ids;addPhase(s,'FST_GROUP','First Stand · 풀리그',roundRobin(ids),3,'FST',{start:anchor(s,'03-10'),spacing:1,description:'5개 지역 대표 BO3 풀리그. 상위 4팀이 BO5 토너먼트로 진출합니다.'});}
 if(kind==='MSI') {
  const ids=internationalParticipants(s,kind);s.international.msiParticipants=ids;
  const regionWinner=s.teams[s.fstChampion]?.region??'LCK';const direct=ids.filter(id=>{const t=team(s,id);return t.region===regionWinner||id===ids.find(x=>team(s,x).region===t.region);});const pi=ids.filter(id=>!direct.includes(id));
  s.international.msiDirect=direct;addPhase(s,'MSI_PI1','MSI · 플레이인 1라운드',[[[pi[0],pi[3]],[pi[1],pi[2]]]],5,'MSI',{start:anchor(s,'06-27')});
 }
 if(kind==='WORLDS') {
  const ids=internationalParticipants(s,kind);const extra=s.international.extraWorldRegions??['LCK','LPL'];const pi=extra.map(region=>region==='LCK'?s.worldsSeeds[3]:Object.values(s.teams).filter(t=>t.region===region).sort((a,b)=>power(s,b.id)-power(s,a.id))[3]?.id).filter(Boolean);
  s.international.worldsDirect=ids;addPhase(s,'WORLD_PI','Worlds · 플레이인',[[pi]],5,'WORLDS',{start:anchor(s,'10-14'),description:'추가 시드 2팀의 BO5 승자가 16팀 스위스에 합류합니다.'});
 }
}
function swissRound(s) {
 const ws=s.international.swiss;const ids=ws.ids.filter(id=>ws.records[id].w<3&&ws.records[id].l<3).sort((a,b)=>ws.records[b].w-ws.records[a].w||power(s,b)-power(s,a));const pairs=[];
 function pairGroup(remaining,result=[]) {
  if(!remaining.length)return result;
  const a=remaining[0];const choices=remaining.slice(1).filter(b=>!ws.encounters.includes([a,b].sort().join('|'))&&(ws.round>1||team(s,a).region!==team(s,b).region));
  for(const b of choices){const answer=pairGroup(remaining.filter(x=>x!==a&&x!==b),[...result,[a,b]]);if(answer)return answer;}
  return null;
 }
 if(ws.round===1){const tiers=s.international.worldsTiers;pairs.push(...matchPools(s,tiers[0],tiers[2]),...(pairGroup(tiers[1])??[]));}
 else for(const w of [2,1,0])for(const l of [0,1,2]){const group=ids.filter(id=>ws.records[id].w===w&&ws.records[id].l===l);if(!group.length)continue;const matchings=pairGroup(group);if(!matchings)throw Error('스위스 재대결 방지 대진을 생성하지 못했습니다.');pairs.push(...matchings);}
 const dates=['10-15','10-16','10-17','10-22','10-25'];
 addPhase(s,`WORLD_SWISS${ws.round}`,`Worlds · 스위스 ${ws.round}라운드`,[pairs],1,'WORLDS',{spacing:1,start:anchor(s,dates[ws.round-1]),description:'3승 진출 · 3패 탈락. 진출·탈락 결정전은 BO3, 같은 상대와 재대결하지 않습니다.'});
 for(const m of completed(s)) {const r=ws.records[m.teams[0]];m.bestOf=(r.w===2||r.l===2)?3:1;}
}
function fixedBracket(s,key,title,ids,competition) {addPhase(s,key,title,[[[ids[0],ids.at(-1)],[ids[1],ids.at(-2)]]],5,competition);}
function advancePhase(s) {
 const ms=completed(s);if(!ms.length||ms.some(m=>m.status!=='done'))return;
 const k=s.phase.key;
 if(DB.season?.competitionFormat===2026&&advance2026Phase(s,ms))return;
 if(k==='CUP_GROUP') {
  const groups=s.cupGroups;const tables=groups.map(g=>standings(s,g,'CUP','CUP_GROUP'));const totals=tables.map(rows=>rows.reduce((n,r)=>n+r.w,0));const win=totals[0]>=totals[1]?0:1;
  const a=tables[win].map(r=>r.id),b=tables[1-win].map(r=>r.id);s.cupDirect=a.slice(0,3);s.cupBye=a.slice(0,2);s.cupPlayin=standings(s,[...a.slice(3),...b.slice(0,4)],'CUP','CUP_GROUP').map(r=>r.id);const p=s.cupPlayin;
  addPhase(s,'CUP_PI1','LCK CUP · 플레이인 1R',[[[p[2],p[5]],[p[3],p[4]]]],3,'CUP');
 } else if(k==='CUP_PI1'){addPhase(s,'CUP_PI2','LCK CUP · 플레이인 2R',[[[s.cupPlayin[0],winner(ms[1])],[s.cupPlayin[1],winner(ms[0])]]],3,'CUP');}
 else if(k==='CUP_PI2'){s.cupPiW=ms.map(winner);addPhase(s,'CUP_PIF','LCK CUP · 플레이인 최종전',[[ms.map(loser)]],5,'CUP');}
 else if(k==='CUP_PIF'){s.cupPiW.sort((a,b)=>s.cupPlayin.indexOf(a)-s.cupPlayin.indexOf(b));addPhase(s,'CUP_PO1','LCK CUP · 플레이오프 1R',[[[s.cupDirect[2],winner(ms[0])],s.cupPiW]],5,'CUP');}
 else if(k==='CUP_PO1'){s.cupPoW=ms.map(winner);addPhase(s,'CUP_PO2','LCK CUP · 플레이오프 2R',[[[s.cupBye[0],s.cupPoW[1]],[s.cupBye[1],s.cupPoW[0]]]],5,'CUP');}
 else if(k==='CUP_PO2'){addPhase(s,'CUP_PO3','LCK CUP · 승자조·패자조',[[ms.map(winner),ms.map(loser)]],5,'CUP');}
 else if(k==='CUP_PO3'){s.cupFinalist=winner(ms[0]);addPhase(s,'CUP_PO4','LCK CUP · 결승 진출전',[[[loser(ms[0]),winner(ms[1])]]],5,'CUP');}
 else if(k==='CUP_PO4'){addPhase(s,'CUP_FINAL','LCK CUP · 결승',[[[s.cupFinalist,winner(ms[0])]]],5,'CUP');}
 else if(k==='CUP_FINAL'){s.cupChampion=winner(ms[0]);award(s,'LCK CUP',s.cupChampion,3);beginInternational(s,'FST');}
 else if(k==='FST_GROUP'){const ids=standings(s,s.international.fstParticipants,'FST').map(r=>r.id);fixedBracket(s,'FST_SEMI','First Stand · 4강',ids.slice(0,4),'FST');}
 else if(k==='FST_SEMI'){addPhase(s,'FST_FINAL','First Stand · 결승',[[ms.map(winner)]],5,'FST');}
 else if(k==='FST_FINAL'){s.fstChampion=winner(ms[0]);const semis=s.matches.filter(m=>m.id.startsWith(s.year+'-')&&m.phase==='FST_SEMI');const fifth=s.international.fstParticipants.find(id=>!semis.some(m=>m.teams.includes(id)));s.international.fstRanking=[winner(ms[0]),loser(ms[0]),...semis.map(loser),fifth];award(s,'First Stand',s.fstChampion,3);startRegular(s);}
 else if(k==='REG12'){s.regular12=standings(s,domestic(),'REGULAR').map(r=>r.id);s.seeds=s.regular12.slice(0,6);addPhase(s,'ROAD_56','Road to MSI · 5·6위전',[[s.seeds.slice(4,6)]],5,'ROAD',{start:anchor(s,'06-07')});}
 else if(k==='ROAD_TOP'){s.msiSeeds=[winner(ms[0])];s.roadFinalOpponent=loser(ms[0]);addPhase(s,'ROAD_3','Road to MSI · 3위 도전',[[[s.seeds[2],s.roadChallenger]]],5,'ROAD');}
 else if(k==='ROAD_56'){addPhase(s,'ROAD_4','Road to MSI · 4위 도전',[[[s.seeds[3],winner(ms[0])]]],5,'ROAD');}
 else if(k==='ROAD_4'){s.roadChallenger=winner(ms[0]);addPhase(s,'ROAD_TOP','Road to MSI · 1시드 결정전',[[s.seeds.slice(0,2)]],5,'ROAD');}
 else if(k==='ROAD_3'){addPhase(s,'ROAD_FINAL','Road to MSI · 2시드 결정전',[[[s.roadFinalOpponent,winner(ms[0])]]],5,'ROAD');}
 else if(k==='ROAD_FINAL'){s.msiSeeds.push(winner(ms[0]));beginInternational(s,'MSI');}
 else if(k==='MSI_PI1'){s.msiPiLosers=ms.map(loser);addPhase(s,'MSI_PI2','MSI · 플레이인 승자조·패자조',[[ms.map(winner),ms.map(loser)]],5,'MSI');}
 else if(k==='MSI_PI2'){s.msiPiWinner=winner(ms[0]);addPhase(s,'MSI_PIF','MSI · 플레이인 최종전',[[[loser(ms[0]),winner(ms[1])]]],5,'MSI');}
 else if(k==='MSI_PIF'){const ids=[...s.international.msiDirect,s.msiPiWinner,winner(ms[0])];s.msiBracketTeams=ids;const regions=s.international.fstRanking.map(id=>team(s,id).region);const first=region=>ids.find(id=>team(s,id).region===region);const pools=[[first(regions[0]),first(regions[1])],[first(regions[2]),first(regions[3])],[first(regions[4]),ids.filter(id=>team(s,id).region===regions[0])[1]],[s.msiPiWinner,winner(ms[0])]];s.international.msiPools=pools;const pairs=drawMsi(s,pools);addPhase(s,'MSI_QF','MSI · 브래킷 1R',[pairs],5,'MSI');}
 else if(k==='MSI_QF'){s.msiLower=ms.map(loser);addPhase(s,'MSI_UP2','MSI · 상위 2R / 하위 1R',[[[winner(ms[0]),winner(ms[1])],[winner(ms[2]),winner(ms[3])],[s.msiLower[0],s.msiLower[1]],[s.msiLower[2],s.msiLower[3]]]],5,'MSI');}
 else if(k==='MSI_UP2'){s.msiUpperW=ms.slice(0,2).map(winner);addPhase(s,'MSI_LOW2','MSI · 하위 2R',[[[loser(ms[0]),winner(ms[3])],[loser(ms[1]),winner(ms[2])]]],5,'MSI');}
 else if(k==='MSI_LOW2'){addPhase(s,'MSI_UPF','MSI · 상위 결승 / 하위 3R',[[s.msiUpperW,ms.map(winner)]],5,'MSI');}
 else if(k==='MSI_UPF'){s.msiFinalist=winner(ms[0]);addPhase(s,'MSI_LOWF','MSI · 하위 결승',[[[loser(ms[0]),winner(ms[1])]]],5,'MSI');}
 else if(k==='MSI_LOWF'){addPhase(s,'MSI_FINAL','MSI · 결승',[[[s.msiFinalist,winner(ms[0])]]],5,'MSI');}
 else if(k==='MSI_FINAL') {
  s.msiChampion=winner(ms[0]);award(s,'MSI',s.msiChampion,6);const first=team(s,s.msiChampion).region;let second=team(s,loser(ms[0])).region;
  if(first===second){const regions=s.matches.filter(m=>m.competition==='MSI'&&m.status==='done').reverse().flatMap(m=>m.teams).map(id=>team(s,id).region);second=regions.find(r=>r!==first)??'LPL';}s.international.extraWorldRegions=[first,second];
  s.legend=s.regular12.slice(0,5);s.rise=s.regular12.slice(5);const a=roundRobin(s.legend,3),b=roundRobin(s.rise,3);addPhase(s,'REG35','LCK 정규 3~5라운드',a.map((r,i)=>[...r,...b[i]]),3,'REGULAR',{start:anchor(s,'07-23'),spacing:3,description:'Legend / Rise 그룹 내 3회전. 1·2라운드 성적이 누적됩니다.'});
 } else if(k==='REG35'){s.legendFinal=standings(s,s.legend,'REGULAR').map(r=>r.id);s.riseFinal=standings(s,s.rise,'REGULAR').map(r=>r.id);s.seeds=[...s.legendFinal.slice(0,4)];const p=[s.legendFinal[4],...s.riseFinal.slice(0,3)];addPhase(s,'SEASON_PI1','LCK 시즌 · 플레이인 1R',[[[p[0],p[3]],[p[1],p[2]]]],5,'SEASON_PO',{start:anchor(s,'09-10')});}
 else if(k==='SEASON_PI1'){addPhase(s,'SEASON_PI2','LCK 시즌 · 플레이인 승자조·패자조',[[ms.map(winner),ms.map(loser)]],5,'SEASON_PO');}
 else if(k==='SEASON_PI2'){s.seeds.push(winner(ms[0]));addPhase(s,'SEASON_PIF','LCK 시즌 · 플레이인 최종전',[[[loser(ms[0]),winner(ms[1])]]],5,'SEASON_PO');}
 else if(k==='SEASON_PIF'){s.seeds.push(winner(ms[0]));addPhase(s,'SEASON_PO1','LCK 플레이오프 · 1R',[[[s.seeds[2],s.seeds[5]],[s.seeds[3],s.seeds[4]]]],5,'SEASON_PO');}
 else if(k==='SEASON_PO1'){s.poFirstLosers=ms.map(loser);addPhase(s,'SEASON_PO2','LCK 플레이오프 · 상위 2R / 하위 1R',[[[s.seeds[0],winner(ms[1])],[s.seeds[1],winner(ms[0])],s.poFirstLosers]],5,'SEASON_PO');}
 else if(k==='SEASON_PO2'){const ranking=[...s.legendFinal,...s.riseFinal];const ls=ms.slice(0,2).map(loser).sort((a,b)=>ranking.indexOf(a)-ranking.indexOf(b));s.poLowerBye=ls[0];addPhase(s,'SEASON_PO3','LCK 플레이오프 · 상위 결승 / 하위 2R',[[ms.slice(0,2).map(winner),[ls[1],winner(ms[2])]]],5,'SEASON_PO');}
 else if(k==='SEASON_PO3'){s.poFinalist=winner(ms[0]);s.poUpperLoser=loser(ms[0]);addPhase(s,'SEASON_PO4','LCK 플레이오프 · 하위 3R',[[[s.poLowerBye,winner(ms[1])]]],5,'SEASON_PO');}
 else if(k==='SEASON_PO4'){s.worldsFourth=loser(ms[0]);addPhase(s,'SEASON_PO5','LCK 플레이오프 · 결승 진출전',[[[s.poUpperLoser,winner(ms[0])]]],5,'SEASON_PO');}
 else if(k==='SEASON_PO5'){s.worldsThird=loser(ms[0]);addPhase(s,'SEASON_FINAL','LCK · 시즌 결승',[[[s.poFinalist,winner(ms[0])]]],5,'SEASON_PO');}
 else if(k==='SEASON_FINAL'){s.worldsSeeds=[winner(ms[0]),loser(ms[0]),s.worldsThird,s.worldsFourth];if(s.seeds.includes(s.msiChampion)&&!s.worldsSeeds.slice(0,3).includes(s.msiChampion))s.worldsSeeds[3]=s.msiChampion;award(s,'LCK',s.worldsSeeds[0],5);beginInternational(s,'WORLDS');}
 else if(k==='WORLD_PI'){const ids=[...s.international.worldsDirect,winner(ms[0])],byRegion={};for(const id of s.international.worldsDirect)(byRegion[team(s,id).region]??=[]).push(id);const piRegion=team(s,winner(ms[0])).region;s.international.worldsTiers=[Object.values(byRegion).map(a=>a[0]),[...Object.values(byRegion).map(a=>a[1]),byRegion[piRegion][2]],[...Object.entries(byRegion).filter(([r])=>r!==piRegion).map(([,a])=>a[2]),winner(ms[0])]];s.international.swiss={ids,round:1,records:Object.fromEntries(ids.map(id=>[id,{w:0,l:0}])),encounters:[]};swissRound(s);}
 else if(k.startsWith('WORLD_SWISS')){const ws=s.international.swiss;for(const m of ms){ws.records[winner(m)].w++;ws.records[loser(m)].l++;ws.encounters.push([...m.teams].sort().join('|'));}const active=ws.ids.filter(id=>ws.records[id].w<3&&ws.records[id].l<3);if(active.length){ws.round++;swissRound(s);}else{const q=ws.ids.filter(id=>ws.records[id].w===3).sort((a,b)=>ws.records[a].l-ws.records[b].l||power(s,b)-power(s,a));const a=q.filter(id=>ws.records[id].l===0),b=q.filter(id=>ws.records[id].l===2),remaining=q.filter(id=>!a.includes(id)&&!b.slice(0,2).includes(id));const pairs=[[a[0],b[0]],[remaining[0],remaining[1]],[a[1],b[1]],[remaining[2],remaining[3]]];addPhase(s,'WORLD_QF','Worlds · 8강',pairs.map(p=>[p]),5,'WORLDS',{start:anchor(s,'10-28'),spacing:1});}}
 else if(k==='WORLD_QF'){addPhase(s,'WORLD_SF','Worlds · 4강',[[[winner(ms[0]),winner(ms[1])]],[[winner(ms[2]),winner(ms[3])]]],5,'WORLDS',{start:anchor(s,'11-02'),spacing:1});}
 else if(k==='WORLD_SF'){addPhase(s,'WORLD_FINAL','Worlds · 결승',[[ms.map(winner)]],5,'WORLDS',{start:anchor(s,'11-09')});}
 else if(k==='WORLD_FINAL'){s.worldChampion=winner(ms[0]);award(s,'Worlds',s.worldChampion,10);s.phase={key:'OFFSEASON',title:'시즌 결산 · 스토브리그'};s.seasonComplete=true;s.career.push({year:s.year,cup:s.cupChampion,lck:s.worldsSeeds[0],runner:s.worldsSeeds[1],msi:s.msiChampion,worlds:s.worldChampion});news(s,'시즌 종료','재계약과 선수단 정비를 마친 뒤 다음 시즌으로 진행할 수 있습니다.');processTrades(s);}
}
function matchPools(s,left,right){let result;function walk(index,remaining,pairs){if(index===left.length){result=pairs;return true;}for(const b of remaining)if(team(s,left[index]).region!==team(s,b).region&&walk(index+1,remaining.filter(x=>x!==b),[...pairs,[left[index],b]]))return true;return false;}walk(0,right,[]);if(!result)throw Error('지역 분리 대진 생성에 실패했습니다.');return result;}
export function drawMsi(s,pools){const permutations=a=>a.length===1?[a]:a.flatMap((x,i)=>permutations(a.filter((_,j)=>j!==i)).map(p=>[x,...p]));for(const p2 of permutations(pools[1]))for(const p4 of permutations(pools[3]))for(const p3 of permutations(pools[2])){const pairs=[[pools[0][0],p4[0]],[p2[0],p3[0]],[pools[0][1],p4[1]],[p2[1],p3[1]]];if([pairs.slice(0,2),pairs.slice(2)].every(half=>new Set(half.flat().map(id=>team(s,id).region)).size===4))return pairs;}throw Error('MSI 지역 분리 브래킷을 생성하지 못했습니다.');}
export function award(s,name,id,prize) {s.trophies.push({year:s.year,name,team:id});const t=team(s,id);t.budget+=prize;if(id===s.myTeam){s.ledger.unshift({date:s.date,amount:prize,category:'우승 상금',description:name});t.fan+=20000;}news(s,`${name} 우승`,`${t.name}이 트로피를 차지했습니다.`);}
export function nextSeason(s) {if(!s.seasonComplete)throw Error('시즌이 끝나지 않았습니다.');processTrades(s);s.year++;s.date=`${s.year}-${DB.season?.startDate.slice(5)??"01-03"}`;s.phase={key:'PRESEASON',title:'프리시즌'};s.seasonComplete=false;s.activeDraft=null;s.international={};s.regular12=null;s.legend=null;s.rise=null;s.seeds=null;for(const p of Object.values(s.players)){p.fatigue=5;p.morale=75;if(p.owner!==s.myTeam)p.contractEnd=s.year;}news(s,'새 시즌',`${s.year} 시즌. 기본 버전은 ${DB.season?.startYear??2022} 패치 자료와 ${DB.season?.competitionFormat??2025} 대회 틀을 반복합니다. 계약 만료 주전을 확인하세요.`);}
export function scheduled(s) {return s.matches.filter(m=>m.status==='scheduled').sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));}
export function nextOwnMatch(s) {return scheduled(s).find(m=>m.teams.includes(s.myTeam));}
export function todayOwnMatch(s) {return scheduled(s).find(m=>m.date<=s.date&&m.teams.includes(s.myTeam));}
export function advanceDays(s,n=1,autoMatches=false) {
 if(s.activeMatch)throw Error('진행 중인 경기를 먼저 마쳐 주세요.');if(s.activeDraft)throw Error('진행 중인 밴픽을 먼저 마쳐 주세요.');if(s.phase.key==='PRESEASON')throw Error('로스터를 확인한 뒤 시즌을 시작하세요.');if(s.seasonComplete)return {days:0,reason:'season'};
 let days=0;
 for(let guard=0;guard<800&&days<=n;guard++) {
  processTrades(s);
  let due=scheduled(s).filter(m=>m.date<=s.date);for(const m of due){if(m.teams.includes(s.myTeam)&&!autoMatches)return{days,reason:'match',match:m};simulateSeries(s,m);}
  advancePhase(s);if(s.seasonComplete)return{days,reason:'season'};
  if(days===n)return{days,reason:'days'};s.date=dayAdd(s.date,1);trainDay(s);days++;
 }
 return{days,reason:'limit'};
}
export function selectionPlan(s,m){
 const rights=m.relay?m.firstSelectionRights:(m.sets.at(-1)?.loser??m.firstSelectionRights??m.teams[0]),other=m.teams.find(id=>id!==rights);
 return {rights,other,both:!m.sets.length&&['CUP_FINAL','SEASON_FINAL'].includes(m.phase),category:(m.sets.length+randomTie(m.id))%2?'pick':'side',value:(m.sets.length+randomTie(m.id))%2?'first':'blue'};
}
function firstSelection(s,m,choice){
 const plan=selectionPlan(s,m),ours=plan.rights===s.myTeam,[category,value]=choice.includes(':')?choice.split(':'):['side',choice];
 if(plan.both){const parts=choice.split(':'),side=ours?(parts[0]==='both'?parts[1]:category==='side'?value:'blue'):'blue',pick=ours&&parts[0]==='both'?parts[2]:'first',blue=side==='blue'?plan.rights:plan.other,firstPickTeam=pick==='first'?plan.rights:plan.other;return{blue,red:m.teams.find(id=>id!==blue),firstPickSide:firstPickTeam===blue?'blue':'red',firstSelection:{rights:plan.rights,category:'both',value:side,pick,both:true}};}
 const first=ours?{category,value}:{category:plan.category,value:plan.value};
 const responseCategory=first.category==='side'?'pick':'side';
 const responseValue=!ours&&plan.other===s.myTeam&&category===responseCategory?value:responseCategory==='side'?'blue':'first';
 const blue=first.category==='side'?(first.value==='blue'?plan.rights:plan.other):(responseValue==='blue'?plan.other:plan.rights);
 const firstPickTeam=first.category==='pick'?(first.value==='first'?plan.rights:plan.other):(responseValue==='first'?plan.other:plan.rights);
 return {blue,red:m.teams.find(id=>id!==blue),firstPickSide:firstPickTeam===blue?'blue':'red',firstSelection:{rights:plan.rights,...first,responseCategory,responseValue,responseTeam:plan.other}};
}
export function newDraft(s,m,preferredSide='blue') {
 const last=m.sets.at(-1);const rights=m.relay?m.firstSelectionRights:last?last.loser:(m.firstSelectionRights??m.teams[0]);const blue=(rights===s.myTeam&&preferredSide==='red')?m.teams.find(id=>id!==rights):rights;
 return {matchId:m.id,set:m.sets.length+1,blue,red:m.teams.find(id=>id!==blue),...(DB.season?.competitionFormat===2026?firstSelection(s,m,preferredSide):{}),rights,step:0,phase:"selection",assignment:{remaining:60,paused:false,expired:false,confirmed:false},bans:{blue:[],red:[]},picks:{blue:[],red:[]},history:[],used:[...new Set(m.sets.flatMap(z=>z.picks.map(p=>p.champion)))],patch:patchAt(s.date,m.competition)};
}
function competitivelyAvailable(s,c,patch){
 if(!c.available[patch])return false;if(DB.season?.competitionFormat!==2026)return true;
 const debut=Object.keys(c.available).find(v=>c.available[v]),minor=Number(debut?.split('.')[1]);
 return minor<=1||Number(patchAt(s.date).split('.')[1])>minor;
}
export function draftUnavailableReason(s,d,id){
 if(d.used.includes(id))return '이전 세트 소진';
 if([...d.bans.blue,...d.bans.red,...d.picks.blue.map(p=>p.champion),...d.picks.red.map(p=>p.champion)].includes(id))return '밴·선택 완료';
 return competitivelyAvailable(s,DB.champMap[id],d.patch)?'':'신규 챔피언 대회 유예';
}
export function legalChampions(s,d) {const unavailable=new Set([...d.used,...d.bans.blue,...d.bans.red,...d.picks.blue.map(p=>p.champion),...d.picks.red.map(p=>p.champion)]);return DB.champions.filter(c=>competitivelyAvailable(s,c,d.patch)&&!unavailable.has(c.id));}
export const draftActions=d=>ACTIONS.map(([side,kind])=>[d.firstPickSide==='red'?(side==='blue'?'red':'blue'):side,kind]);
export function draftTurn(d) {if(d.step>=ACTIONS.length)return null;const [side,kind]=draftActions(d)[d.step];return{side,kind,team:d[side]};}
export function draftAction(s,d,championId) {
 const turn=draftTurn(d);if(!turn)throw Error('밴픽이 끝났습니다.');if(!legalChampions(s,d).some(c=>c.id===championId))throw Error('현재 선택할 수 없는 챔피언입니다.');
 if(turn.kind==='ban')d.bans[turn.side].push(championId);
 else d.picks[turn.side].push({champion:championId,role:null,team:turn.team});
 d.history.push({...turn,champion:championId,role:null});d.step++;
 if(d.step===20){d.phase='assignment';d.assignment??={remaining:60,paused:false,expired:false,confirmed:false};}
}
function recommendationScore(s,d,c,role,teamId,metaPresence=null) {
 const t=team(s,teamId),p=getPlayer(s,t.lineup[role]);const meta=metaPresence??metaFor(s).champions.find(z=>z.id===c.id)?.presence??.2;
 const own=d.picks[d.blue===teamId?'blue':'red'];let score=(p?.ovr??75)*.1+mastery(s,p?.id,c.id)*.5+meta*22+(c.roles.includes(role)?16:-35);
 if(!own.some(x=>DB.champMap[x.champion].features.engage)&&c.features.engage)score+=5;
 if(!own.some(x=>DB.champMap[x.champion].features.ap)&&c.features.ap&&role==='MID')score+=4;
 if(own.filter(x=>DB.champMap[x.champion].features.scale).length>=3&&c.features.scale)score-=5;
 if(s.strategy==='early'&&!c.features.scale&&teamId===s.myTeam)score+=3;
 if(s.strategy==='late'&&c.features.scale&&teamId===s.myTeam)score+=3;
 return score;
}
// All possible role matchings remain open during selection. The coach can prefer a
// lane without reserving it; only post-draft assignment writes a role to a pick.
function matchingStates(picks,score,fixed=false) {
 let states=new Map([[0,{score:0,roles:[]}]]);
 for(const pick of picks){const next=new Map();for(const [mask,state] of states)for(let r=0;r<5;r++){
  if(mask&(1<<r)||fixed&&pick.role&&pick.role!==ROLES[r])continue;
  const key=mask|(1<<r),value=state.score+score(pick.champion,ROLES[r]);
  if(!next.has(key)||next.get(key).score<value)next.set(key,{score:value,roles:[...state.roles,ROLES[r]]});
 }states=next;}return states;
}
export function recommendations(s,d,limit=3) {
 const turn=draftTurn(d);if(!turn)return[];
 const side=turn.kind==='ban'?(turn.side==='blue'?'red':'blue'):turn.side,targetTeam=d[side],own=d.picks[side];
 const meta=new Map(metaFor(s).champions.map(c=>[c.id,c.presence]));
 const score=(id,r)=>{const c=DB.champMap[id],p=getPlayer(s,team(s,targetTeam).lineup[r]);return (p?.ovr??75)*.1+mastery(s,p?.id,id)*.5+(meta.get(id)??.2)*22+(c.roles.includes(r)?16:-35);};
 const states=matchingStates(own,score),baseline=Math.max(...[...states.values()].map(x=>x.score));
 const rows=legalChampions(s,d).map(c=>{
  let best=-Infinity,role='MID';
  for(const [mask,state] of states)for(let r=0;r<5;r++){
   if(own.length<5&&mask&(1<<r))continue;
   const value=(own.length===5?0:state.score-baseline)+score(c.id,ROLES[r]);
   if(value>best){best=value;role=ROLES[r];}
  }
  // Composition advice adds variety without making the suggested lane binding.
  if(!own.some(x=>DB.champMap[x.champion].features.engage)&&c.features.engage)best+=5;
  if(s.strategy==='late'&&c.features.scale&&targetTeam===s.myTeam)best+=3;
  if(s.strategy==='early'&&!c.features.scale&&targetTeam===s.myTeam)best+=3;
  return{champion:c.id,name:c.name,role,score:best,reason:turn.kind==='ban'?`상대 숙련·현재 메타 대응 · ${ROLE_NAMES[role]} 가능`:`${ROLE_NAMES[role]} 활용 가능 · 최종 배치는 밴픽 종료 후`};
 });return rows.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,limit);
}
// A saved late-series opening plan intentionally trades a few power picks.
// This is drafting policy, never an exception to availability or Fearless rules.
export function draftOpeningPlan(s,d){
 if(d.set<2)return {version:1,target:0,openings:[],powerPool:[]};
 if(d.aiOpeningPlan)return d.aiOpeningPlan;
 const first=d.firstPickSide??'blue',second=first==='blue'?'red':'blue',meta=new Map(metaFor(s).champions.map(c=>[c.id,c]));
 const fitCache=new Map(),fit=(id,side)=>{const key=id+':'+side;if(!fitCache.has(key))fitCache.set(key,Math.max(...ROLES.map(r=>recommendationScore(s,d,DB.champMap[id],r,d[side],meta.get(id)?.presence??.2))));return fitCache.get(key);};
 const rows=legalChampions(s,d).map(c=>({id:c.id,meta:meta.get(c.id)?.presence??0,score:Math.max(fit(c.id,first),fit(c.id,second))}));
 const observed=rows.filter(c=>c.meta>=.35),ranked=(observed.length>=2?observed:rows).sort((a,b)=>(b.meta*55+b.score*.35)-(a.meta*55+a.score*.35)||a.id.localeCompare(b.id));
 const pool=ranked.slice(0,6).map(c=>c.id),reserveCount=d.set>=3?2:1,target=Math.min(2,pool.length),openings=[];
 for(const side of [first,second].slice(0,target)){
  const options=pool.filter(id=>!openings.includes(id)).sort((a,b)=>fit(b,side)-fit(a,side)||a.localeCompare(b));
  // Stable variation without consuming match RNG or rerolling on reload.
  const salt=randomTie(`${d.matchId}:${d.set}:${side}:${s.rng}`),choice=options[salt%Math.min(2,options.length)];
  if(choice)openings.push(choice);
 }
 return d.aiOpeningPlan={version:2,target,reserveCount,openings,powerPool:pool,firstPickSide:first,designated:{[first]:openings[0],[second]:openings[1]??openings[0]},claims:{blue:[],red:[]}};
}
function refreshDraftOpenings(s,d,plan){
 const banned=new Set([...d.bans.blue,...d.bans.red]),taken=new Set([...d.picks.blue,...d.picks.red].map(p=>p.champion)),legal=new Set(legalChampions(s,d).map(c=>c.id));
 plan.openings=plan.openings.filter(id=>!banned.has(id)&&(taken.has(id)||legal.has(id)));
 for(const id of plan.powerPool)if(plan.openings.length<plan.target&&!plan.openings.includes(id)&&legal.has(id))plan.openings.push(id);
 plan.claims??={};plan.designated??={blue:plan.openings[0],red:plan.openings[1]??plan.openings[0]};
 for(const side of ['blue','red']){
  const enemyPicks=new Set(d.picks[side==='blue'?'red':'blue'].map(p=>p.champion)),ours=new Set(d.picks[side].map(p=>p.champion));
  plan.claims[side]=plan.openings.filter(id=>!enemyPicks.has(id)).sort((a,b)=>Number(ours.has(b))-Number(ours.has(a))||Number(b===plan.designated[side])-Number(a===plan.designated[side])).slice(0,plan.reserveCount??(d.set>=3?2:1));
 }
 return plan;
}
export function autoOne(s,d) {
 const turn=draftTurn(d);if(!turn)throw Error('밴픽이 끝났습니다.');
 let choices=recommendations(s,d,d.set>=2?200:3),planned=false,protecting=false;
 if(d.set>=2){
  const plan=refreshDraftOpenings(s,d,draftOpeningPlan(s,d)),open=new Set(plan.openings),targets=plan.claims[turn.side];
  if(turn.kind==='ban'){
   const alternatives=choices.filter(c=>!open.has(c.champion));
   if(alternatives.length){
    const best=alternatives[0].score;
    const rows=alternatives.map(c=>{
     let counter={weight:0,reason:'',target:null};
     if(DB.champMap[c.champion].roles.includes(c.role))for(const [i,id]of targets.entries()){
      const threat=draftCounterThreat(DB.champMap[id],DB.champMap[c.champion]),weight=threat.weight*(i===0?1:.55);
      if(weight>counter.weight)counter={...threat,weight,target:id};
     }
     return {...c,counter,banScore:c.score+counter.weight*20};
    }).sort((a,b)=>b.banScore-a.banScore||b.score-a.score);
    const cover=rows.filter(c=>c.counter.weight>0&&c.score>=best-32);
    choices=cover.length?cover:rows;protecting=!!cover.length;
   }
  }else{
   const captures=choices.filter(c=>targets.includes(c.champion)&&DB.champMap[c.champion].roles.includes(c.role)&&c.score>=choices[0].score-10).sort((a,b)=>targets.indexOf(a.champion)-targets.indexOf(b.champion)||b.score-a.score);
   if(captures.length){choices=captures;planned=true;}
  }
 }
 if(!choices.length)throw Error('선택 가능한 챔피언이 없습니다.');
 const width=planned?1:Math.min(protecting?3:d.set>=2&&turn.kind==='ban'?4:2,choices.length),c=choices[Math.floor(random(s)*width)];draftAction(s,d,c.champion);
 if(protecting){const h=d.history.at(-1);h.protects=c.counter.target;h.reason=`${DB.champMap[c.counter.target].name} 확보·활용 보호 · ${c.counter.reason}`;}
}
export function autoOpponents(s,d) {while(draftTurn(d)&&draftTurn(d).team!==s.myTeam)autoOne(s,d);if(d.step===20)prepareAssignments(s,d);}
export function completeDraft(s,d) {while(draftTurn(d))autoOne(s,d);prepareAssignments(s,d);return d;}
export function assignChampion(d,side,champion,role) {
 if(d.step!==20||!['blue','red'].includes(side)||!ROLES.includes(role))throw Error('밴픽을 모두 마친 뒤 포지션을 배치하세요.');
 const pick=d.picks[side].find(p=>p.champion===champion);if(!pick)throw Error('우리 팀이 선택한 챔피언만 배치할 수 있습니다.');
 const occupied=d.picks[side].find(p=>p.role===role);if(occupied&&occupied!==pick)occupied.role=pick.role??null;
 pick.role=role;d.assignment??={remaining:60,paused:false};d.assignment.confirmed=false;
}
export function autoAssignDraft(s,d,side=null,preserve=true) {
 if(d.step!==20)throw Error('밴픽을 모두 마쳐야 자동 배치할 수 있습니다.');
 for(const key of side?[side]:['blue','red']){
  const picks=d.picks[key],score=(id,r)=>recommendationScore(s,d,DB.champMap[id],r,d[key]);
  const best=matchingStates(picks,score,preserve).get(31);if(!best)throw Error('배치 가능한 5인 조합을 확인하세요.');
  picks.forEach((p,i)=>p.role=best.roles[i]);
 }return d;
}
export function prepareAssignments(s,d) {
 if(d.step!==20)return d;d.phase='assignment';d.assignment??={remaining:60,paused:false,expired:false,confirmed:false};
 for(const side of ['blue','red'])if(d[side]!==s.myTeam)autoAssignDraft(s,d,side);
 return d;
}
export function assignmentsReady(d) {return d.step===20&&['blue','red'].every(side=>d.picks[side].length===5&&ROLES.every(r=>d.picks[side].filter(p=>p.role===r).length===1));}
export function confirmDraftAssignments(d) {if(!assignmentsReady(d))throw Error('다섯 챔피언을 서로 다른 포지션에 모두 배치하세요.');d.assignment??={};d.assignment.confirmed=true;d.phase='ready';}
export function expireAssignment(s,d) {if(d.step!==20||d.assignment?.expired)return;autoAssignDraft(s,d,null,true);d.assignment.remaining=0;d.assignment.expired=true;d.assignment.paused=true;}
export function swapAssignments(d,side,roleA,roleB) {const a=d.picks[side].find(p=>p.role===roleA),b=d.picks[side].find(p=>p.role===roleB);if(!a||!b)throw Error('교환할 포지션을 선택하세요.');assignChampion(d,side,a.champion,roleB);}
export function migrateDraft(d) {if(!d)return;if(d.step<20){for(const side of ['blue','red'])for(const p of d.picks[side])p.role=null;for(const a of d.history)a.role=null;d.phase='selection';}else d.phase='assignment';d.assignment??={remaining:60,paused:false,expired:false,confirmed:false};}
export function startOwnDraft(s,matchId,side='blue',advanceOpponent=true) {if(s.activeMatch)throw Error('진행 중인 경기를 먼저 마쳐 주세요.');const m=s.matches.find(m=>m.id===matchId);if(!m||m.status==='done'||!m.teams.includes(s.myTeam)||m.date>s.date)throw Error('오늘 진행할 우리 팀 경기가 아닙니다.');s.activeDraft??=newDraft(s,m,side);if(advanceOpponent)autoOpponents(s,s.activeDraft);return s.activeDraft;}
function compositionPower(s,teamId,picks) {
 let total=0;for(const pick of picks){const p=getPlayer(s,team(s,teamId).lineup[pick.role]);const c=DB.champMap[pick.champion];total+=(p?.ovr??75)+(.12*(mastery(s,p?.id,c.id)-50))-(p?.fatigue??0)*.045+(p?.morale-70)*.018+(c.roles.includes(pick.role)?0:-9);}
 return total/5+(team(s,teamId).synergy-50)*.025;
}
export function draftComposition(d){
 const blue=compositionProfile(d.picks.blue,DB.champMap),red=compositionProfile(d.picks.red,DB.champMap);
 const comparison=(minute,kind='teamfight',roles=null)=>battleProbability({minute,compositionGap:compositionMatchup(blue,red,minute,kind,{roles,synergies:true}).gap});
 const scenarios=[{label:'초반 상체 3:3',minute:8,kind:'skirmish',roles:['TOP','JGL','MID']},{label:'초반 5:5 한타',minute:12,kind:'teamfight'},{label:'후반 상체 3:3',minute:40,kind:'skirmish',roles:['TOP','JGL','MID']},{label:'극후반 5:5 한타',minute:45,kind:'teamfight'}].map(x=>({...x,blueChance:comparison(x.minute,x.kind,x.roles)}));
 return {blue,red,blueLabels:compositionLabels(blue),redLabels:compositionLabels(red),blueChance20:comparison(20),blueChance45:comparison(45),scenarios};
}
function matchInput(s,m,d) {
 if(d.step!==20)throw Error('밴픽을 끝내야 경기를 시작할 수 있습니다.');
 if(!assignmentsReady(d)||!d.assignment?.confirmed)throw Error('포지션 배치를 완료하고 확정해야 경기를 시작할 수 있습니다.');
 const bp=compositionPower(s,d.blue,d.picks.blue),rp=compositionPower(s,d.red,d.picks.red),picks=[...d.picks.blue,...d.picks.red];
 const jungleSkill=side=>{const pick=d.picks[side].find(p=>p.role==='JGL'),p=getPlayer(s,team(s,d[side]).lineup.JGL);return Math.round(clamp(p.ovr*.8+mastery(s,p.id,pick.champion)*.2-(p.fatigue??0)*.06,40,99)*10)/10;};
 const simulationReplay={smiteSkills:[jungleSkill('blue'),jungleSkill('red')],objectiveEra:DB.season?.startYear??2022,model:SIMULATION_MODEL,seed:s.rng,bluePower:bp,redPower:rp,
  teamStrengthBlue:power(s,d.blue),teamStrengthRed:power(s,d.red),
  compositionBlue:compositionProfile(d.picks.blue,DB.champMap),compositionRed:compositionProfile(d.picks.red,DB.champMap),
  scaleBlue:d.picks.blue.filter(p=>DB.champMap[p.champion].features.scale).length,
  scaleRed:d.picks.red.filter(p=>DB.champMap[p.champion].features.scale).length,
  blueStrategy:d.blue===s.myTeam?s.strategy:'balanced',redStrategy:d.red===s.myTeam?s.strategy:'balanced'};
 return {...simulationReplay,blue:d.blue,red:d.red,number:d.set,roster:picks.map(p=>({...p,player:team(s,p.team).lineup[p.role]})),teamNames:{[d.blue]:team(s,d.blue).abbr,[d.red]:team(s,d.red).abbr}};
}
function storeMatch(s,m,d,input,outcome){
 const {blue,red,number,roster,teamNames,...simulationReplay}=input,picks=[...d.picks.blue,...d.picks.red];
 if(outcome.decisionOverrides?.length)simulationReplay.decisionOverrides=outcome.decisionOverrides;
 const {winner:winning,loser:losing,duration,stats}=outcome;
 const set={number:d.set,winner:winning,loser:losing,blue:d.blue,red:d.red,firstPickSide:d.firstPickSide??'blue',firstSelection:d.firstSelection??null,patch:d.patch,duration,picks,bans:d.bans,probability:outcome.initialBlueProbability,stats,simulationVersion:Number(outcome.model.split('v').at(-1)),simulationReplay,objectiveTotals:[outcome.finalObjectives.grubs[d.blue],outcome.finalObjectives.grubs[d.red],outcome.finalObjectives.heralds[d.blue],outcome.finalObjectives.heralds[d.red],outcome.finalObjectives.barons[d.blue],outcome.finalObjectives.barons[d.red],outcome.finalObjectives.elders[d.blue],outcome.finalObjectives.elders[d.red],outcome.finalObjectives.dragons[d.blue],outcome.finalObjectives.dragons[d.red]],finalGold:outcome.finalGold,comeback:outcome.comeback,events:m.teams.includes(s.myTeam)?outcome.events:[],draftHistory:m.teams.includes(s.myTeam)?d.history:[],reason:`${team(s,winning).abbr} 승리 · 전력·조합·골드 차이를 반영한 교전, 제압 보상, 오브젝트와 공성 결과로 승패 결정`};
 m.sets.push(set);m.score[m.teams.indexOf(winning)]++;
 for(const id of m.teams)for(const p of lineup(s,id)){p.fatigue=clamp(p.fatigue+3,0,100);p.morale=clamp(p.morale+(id===winning?2:-2),0,100);p.xp+=.5;const cp=picks.find(x=>x.team===id&&x.role===p.position);if(cp){s.masteryGains[p.id]??={};s.masteryGains[p.id][cp.champion]=Math.min(35,(s.masteryGains[p.id][cp.champion]??0)+.08);}}
 if(m.score.some(n=>n>=Math.ceil(m.bestOf/2))) {m.status='done';m.winner=winning;if(!m.exhibition)team(s,winning).budget+=.25;if(!m.exhibition&&m.teams.includes(s.myTeam)){news(s,winning===s.myTeam?'시리즈 승리':'시리즈 종료',`${m.teams[0]} ${m.score[0]} : ${m.score[1]} ${m.teams[1]}`);team(s,s.myTeam).fan+=winning===s.myTeam?1500:300;}}
 return set;
}
export function resolveDraft(s,m,d){const input=matchInput(s,m,d);return storeMatch(s,m,d,input,simulateMatch(input,()=>random(s)));}
export function startLiveMatch(s,{incremental=false}={}){
 if(s.activeMatch)throw Error('이미 진행 중인 경기가 있습니다.');const d=s.activeDraft;if(!d)throw Error('진행 중인 밴픽이 없습니다.');
 const m=s.matches.find(m=>m.id===d.matchId),input=matchInput(s,m,d),simulation=createMatchState(input,s.rng);
 s.activeMatch={matchId:m.id,draft:structuredClone(d),simulation,incremental};s.activeDraft=null;s.viewing={matchId:m.id,setIndex:m.sets.length};return advanceOwnMatch(s,null);
}
export function activeMatchSet(s){
 const live=s.activeMatch;if(!live)return null;const d=live.draft,z=live.simulation;
 return {live:true,number:d.set,blue:d.blue,red:d.red,patch:d.patch,picks:[...d.picks.blue,...d.picks.red],bans:d.bans,winner:z.winner,stats:z.stats,events:z.events,duration:z.clock,simulationVersion:z.version,pending:needsObjectiveChoice(s)?objectivePreview(z):null};
}
export const OBJECTIVE_CHOICE_DEFICIT=4500;
export function needsObjectiveChoice(s){
 const z=s.activeMatch?.simulation;if(!z?.pending||z.finished)return false;
 const opponent=z.teams.find(id=>id!==s.myTeam);
 return z.gold[opponent]-z.gold[s.myTeam]>=OBJECTIVE_CHOICE_DEFICIT;
}
export function advanceOwnMatch(s,action='auto',all=false){
 const live=s.activeMatch;if(!live)throw Error('진행 중인 경기가 없습니다.');
 if(['contest','trade'].includes(action)&&!needsObjectiveChoice(s))throw Error('오브젝트 수동 판단은 4,500G 이상 열세에서 가능합니다.');
 const stepped=live.incremental&&live.simulation.version>=7&&!all;
 advanceMatch(live.simulation,{controlledTeam:s.myTeam,action,auto:all,maxEvents:stepped?1:Infinity});
 // Noncritical objectives use the same automatic coach and RNG path as before.
 // Only the controller's stopping point changes; archived results remain valid.
 while(!live.simulation.finished&&!needsObjectiveChoice(s)&&(!stepped||live.simulation.pending))advanceMatch(live.simulation,{controlledTeam:s.myTeam,action:'auto',maxEvents:stepped?1:Infinity});
 if(!live.simulation.finished)return activeMatchSet(s);
 const m=s.matches.find(m=>m.id===live.matchId);s.rng=live.simulation.rng;
 const set=storeMatch(s,m,live.draft,live.simulation.input,matchOutcome(live.simulation));s.activeMatch=null;return set;
}
export function resumeLiveMatch(s){
 if(!s.activeMatch)return null;
 const z=s.activeMatch.simulation;
 if(z.version===7){z.input.tradeRewardV8FromWindow=z.pending?.id??z.window;z.input.model='event-v8';z.version=8;}
 if(z.version===8||z.version===9||z.version===10)upgradeMatchState(z);
 return s.activeMatch.incremental||needsObjectiveChoice(s)?activeMatchSet(s):advanceOwnMatch(s,'auto');
}
export function commitOwnDraft(s) {const d=s.activeDraft;if(!d)throw Error('진행 중인 밴픽이 없습니다.');const m=s.matches.find(m=>m.id===d.matchId);const set=resolveDraft(s,m,d);s.activeDraft=null;s.viewing={matchId:m.id,setIndex:m.sets.length-1};return set;}
export function simulateSeries(s,m) {for(let guard=0;guard<5&&m.status!=='done';guard++){const d=completeDraft(s,newDraft(s,m));autoAssignDraft(s,d);confirmDraftAssignments(d);resolveDraft(s,m,d);}return m;}
export function autoOwnSeries(s,matchId) {if(s.activeMatch){if(s.activeMatch.matchId!==matchId)throw Error('진행 중인 다른 경기를 먼저 마쳐 주세요.');advanceOwnMatch(s,'auto',true);}const m=s.matches.find(m=>m.id===matchId);if(!m||!m.teams.includes(s.myTeam)||m.date>s.date)throw Error('진행할 수 없는 경기입니다.');if(s.activeDraft){completeDraft(s,s.activeDraft);autoAssignDraft(s,s.activeDraft);confirmDraftAssignments(s.activeDraft);commitOwnDraft(s);}simulateSeries(s,m);s.viewing={matchId:m.id,setIndex:m.sets.length-1};return m;}
// Completed modern logs are reproducible from seed + recorded decisions. Keep live
// prefixes intact; never mutate the in-memory match while writing a save.
export function serializeSave(s){return JSON.stringify(s,function(key,value){return key==='events'&&['event-v5','event-v6','event-v7','event-v8','event-v9','event-v10','event-v11','event-v12','event-v13','event-v14'].includes(this.simulationReplay?.model)?[]:value;});}

export function migrateSeasonFormat(s){return DB.season?.competitionFormat===2026?migrate2026SecondHalf(s):false;}
