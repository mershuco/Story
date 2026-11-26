// Accounted income and an earnings-based approximation of the 2026 bounty rules.
// No team-deficit catch-up payments are generated here.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export const INCOME_LABELS={starting:'시작 골드',passive:'자동 수입',lane:'라인 CS',jungle:'정글 CS',kills:'처치',assists:'어시스트',firstBlood:'첫 킬',shutdown:'챔피언 현상금',structures:'구조물 파괴',firstTower:'첫 포탑',objectives:'오브젝트',objectiveBounty:'오브젝트 현상금',sideLane:'추가 라인 자원',sideJungle:'추가 정글 자원',previous:'이전 규칙 수입',other:'기타'};
export function initializeEconomy(s,{migrated=false}={}){
 s.economy=Object.fromEntries(s.teams.map(id=>[id,Object.fromEntries(Object.keys(INCOME_LABELS).map(k=>[k,k===(migrated?'previous':'starting')?s.gold[id]:0]))]));
 s.bountyAccounts=Object.fromEntries(s.stats.map(p=>[p.player,{positive:0,negative:0}]));
 s.incomeRemainders={};s.sideCollections={};s.busyAt={};s.busyUntil={};s.deathAt={};
 s.firstBloodClaimed=s.score[s.teams[0]]+s.score[s.teams[1]]>0;
 s.firstTowerClaimed=Object.values(s.structures).some(b=>Object.values(b.lanes).some(l=>l.towers.some(h=>h===0)));
}
export function accountIncome(s,p,amount,source){
 if(s.economy){s.economy[p.team][source]??=0;s.economy[p.team][source]+=amount;}
 const b=s.bountyAccounts?.[p.player];if(!b||!['kills','assists','lane','jungle','sideLane','sideJungle','shutdown'].includes(source))return;
 let earned=amount;
 if(b.negative>0){const spent=Math.min(earned,b.negative/.2);b.negative=Math.max(0,b.negative-spent*.2);earned-=spent;}
 if(earned>0&&source!=='shutdown')b.positive+=earned/(['kills','assists'].includes(source)?3:17.5);
}
export function fractionalIncome(s,player,source,raw){const key=player+':'+source,total=raw+(s.incomeRemainders[key]??0),whole=Math.floor(total+1e-8);s.incomeRemainders[key]=total-whole;return whole;}
export function killReward(s,victim){
 const b=s.bountyAccounts?.[victim.player]??{positive:0,negative:0},base=300+clamp((victim.level??1)-6,0,12)*10;
 const value=Math.max(100,Math.round(base-Math.max(0,b.negative-50))),enemy=s.teams.find(id=>id!==victim.team),ahead=s.clock<6||s.gold[victim.team]-s.gold[enemy]>=2000;
 const potential=Math.max(0,b.positive-100),shutdown=ahead&&potential>=150?Math.min(700,Math.floor(potential/50)*50):0;
 return {base:value,assistPool:Math.floor(value/2),shutdown,firstBlood:s.firstBloodClaimed?0:100};
}
export function settleDeathBounty(s,victim,reward,assistPaid){
 const b=s.bountyAccounts[victim.player];
 // Accrual is settled after the whole fight, so a 1-for-1 cannot mint a new shutdown.
 if(reward.shutdown)b.positive=Math.max(0,b.positive-100-reward.shutdown);
 else{const loss=(reward.base+assistPaid)*.4,absorbed=Math.min(loss,b.positive);b.positive-=absorbed;b.negative=clamp(b.negative+loss-absorbed,0,370);}
}
export function markBusy(s,players,until){for(const p of players){const id=typeof p==='string'?p:p.player;s.busyAt[id]=(s.busyUntil[id]??0)>s.clock?Math.min(s.busyAt[id],s.clock):s.clock;s.busyUntil[id]=Math.max(s.busyUntil[id]??0,until);}}
export function availableFarmMinutes(s,p,from,to){
 const farmStart=s.version>=15&&s.input.objectiveEra===2026?(p.role==='JGL'?55/60:p.role==='MID'?1.02:1.13):1.8;
 const start=Math.max(from,farmStart);if(to<=start)return 0;
 const windows=[[s.deathAt[p.player],s.farmReturnAt?.[p.player]??s.respawnAt?.[p.player]],[s.busyAt[p.player],s.busyUntil[p.player]]].filter(([a,b])=>Number.isFinite(a)&&b>start&&a<to).map(([a,b])=>[Math.max(a,start),Math.min(b,to)]).sort((a,b)=>a[0]-b[0]);
 let lost=0,end=start;for(const [a,b]of windows){lost+=Math.max(0,b-Math.max(a,end));end=Math.max(end,b);}return Math.max(0,to-start-lost);
}

export function botQuestReward(s,p,{laneMinutes=0,awayMinutes=0,minions=0,points=0,takedown=false}={}){
 if(s.version<15||s.input.objectiveEra!==2026||p.role!=='BOT')return 0;
 const patch=Number(s.input.patch?.split('.')[1]??1),takedownGold=patch>=9?40:50;
 if(p.questPoints===1350)return fractionalIncome(s,p.player,'roleQuest',minions*2+(takedown?takedownGold:0));
 const progress=laneMinutes*(patch>=9?90:96)+awayMinutes*20+minions*3+points+(takedown?15:0);
 const remaining=1350-(p.questPoints??0);
 p.questPoints=Math.min(1350,(p.questPoints??0)+progress);
 return progress>=remaining?300+fractionalIncome(s,p.player,'roleQuest',minions*2*(1-remaining/progress)):0;
}
