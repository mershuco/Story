// Game adaptation of LoL objective bounties. The official activation formula
// is not published in full; weighted deficit and delays below are game tuning.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const opponent=(s,id)=>s.teams.find(t=>t!==id);
const avgLevel=(s,id)=>s.stats.filter(p=>p.team===id).reduce((n,p)=>n+(p.level??1),0)/5;
function destroyed(s,id){const enemy=s.structures[opponent(s,id)];return Object.values(enemy.lanes).reduce((n,l)=>n+l.towers.filter(h=>h===0).length,0)+enemy.nexusTowers.filter(h=>h===0).length;}
export function initializeBounties(s){s.objectiveBounty={team:null,pending:null,activateAt:null,endAt:null,claimed:Object.fromEntries(s.teams.map(t=>[t,0]))};}
export function bountyDeficit(s,id){const enemy=opponent(s,id),gold=s.gold[enemy]-s.gold[id];return {gold,score:gold+(avgLevel(s,enemy)-avgLevel(s,id))*500+clamp(s.dragons[enemy]-s.dragons[id],-3,3)*350+(destroyed(s,enemy)-destroyed(s,id))*200};}
export function updateBounties(s){
 const b=s.objectiveBounty;if(!b)return;
 if(s.clock<14){b.team=null;b.pending=null;b.activateAt=null;return;}
 if(b.team){const d=bountyDeficit(s,b.team),recovered=d.gold<1000||d.score<2500;if(recovered){b.endAt??=s.clock+.25;if(s.clock>=b.endAt){b.team=null;b.endAt=null;}}else b.endAt=null;}
 if(b.team)return;
 const candidate=s.teams.find(id=>{const d=bountyDeficit(s,id);return d.gold>=2000&&d.score>=4000;})??null;
 if(candidate!==b.pending){b.pending=candidate;b.activateAt=candidate?s.clock+.25:null;}
 if(candidate&&s.clock>=b.activateAt){b.team=candidate;b.pending=null;b.activateAt=null;b.endAt=null;}
}
export function objectiveBountyAmount(s,id,kind,index=0){
 if(s.objectiveBounty?.team!==id)return 0;
 const base=kind==='tower'?(index===0?250:400):kind==='nexusTower'?400:['dragon','baron','elder'].includes(kind)?500:0;
 if(!base)return 0;return Math.round(Math.min(1000,base+Math.max(0,s.gold[opponent(s,id)]-s.gold[id])*.1*(base/500))/10)*10;
}
export function claimObjectiveBounty(s,id,kind,index=0){const amount=objectiveBountyAmount(s,id,kind,index);if(amount)s.objectiveBounty.claimed[id]+=amount;return amount;}
export function bountySnapshot(s){const b=s.objectiveBounty;if(!b)return null;return {...b,claimed:{...b.claimed},targets:b.team?bountyTowerTargets(s,b.team):[]};}
export function bountyTowerTargets(s,id){
 const defender=opponent(s,id),base=s.structures[defender],targets=[],seen=new Set();
 for(const lane of ['top','mid','bot']){const l=base.lanes[lane],index=l.towers.findIndex(hp=>hp>0);let target=null;
  if(index>=0)target={defender,lane,kind:'tower',index};else if(l.inhibitor===0){const n=base.nexusTowers.findIndex(hp=>hp>0);if(n>=0)target={defender,lane:'mid',kind:'nexusTower',index:n};}
  if(target){const key=[target.defender,target.lane,target.kind,target.index].join(':');if(!seen.has(key)){seen.add(key);targets.push({...target,gold:objectiveBountyAmount(s,id,target.kind,target.index)});}}
 }return targets;
}
