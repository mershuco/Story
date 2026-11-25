export const META_ROLES=['TOP','JGL','MID','BOT','SUP'];
export function draftMetaEvent(competition,phase='',date='2026-01-01'){
 if(competition==='CUP')return 'LCK_CUP';
 if(competition==='REGULAR'&&phase==='REG12')return 'LCK_REG12';
 if(competition==='REGULAR')return ['REG34','REG35','REG345'].includes(phase)||date.slice(5)>='07-01'?'LCK_REG34':'LCK_REG12';
 if(competition==='ROAD')return 'LCK_ROAD';
 if(['SEASON_PI','SEASON_PO','PLAYOFFS'].includes(competition))return 'LCK_PLAYOFFS';
 return ['FST','MSI','WORLDS'].includes(competition)?competition:null;
}
const LABELS={LCK_CUP:'LCK CUP',FST:'First Stand',LCK_REG12:'LCK 정규 1·2R',LCK_ROAD:'Road to MSI',LCK_REG34:'LCK 정규 3~5R',LCK_PLAYOFFS:'LCK 플레이인·플레이오프',MSI:'MSI',WORLDS:'월즈'};
export function draftMetaView(data,{date,competition,phase,patch,mode='event'}){
 if(data.season?.startYear!==2026)return null;
 const event=draftMetaEvent(competition,phase,date),referenceDate='2026-'+date.slice(5)+'T00:00:00';
 // Neither a missing patch nor an empty early-season window may import another event.
 const records=(data.draftMeta?.records??[]).filter(g=>g.event===event&&(mode!=='prior'||g.date.replace(' ','T')<referenceDate));
 const roles=Object.fromEntries(META_ROLES.map(r=>[r,[]])),label=LABELS[event]??competition;
 if(!records.length)return {event,patch,mode,label,empty:true,games:0,openingGames:0,roles,records,asOf:mode==='prior'?referenceDate:null};
 const opening=records.filter(g=>g.set===1),patchRecords=records.filter(g=>g.patch===patch),priorityGames=patchRecords.filter(g=>g.set===1),priority=priorityGames.length?priorityGames:opening;
 const stats=new Map();const row=id=>{if(!stats.has(id))stats.set(id,{id,picks:0,wins:0,roles:{},openingPicks:0,openingBans:0});return stats.get(id);};
 for(const g of records)for(const lineup of g.lineups)for(const [id,role,,won] of lineup){const ch=row(id);ch.picks++;ch.wins+=won;ch.roles[role]??={picks:0,wins:0};ch.roles[role].picks++;ch.roles[role].wins+=won;}
 for(const g of priority){for(const [id] of g.lineups.flat())row(id).openingPicks++;for(const id of g.bans)row(id).openingBans++;}
 for(const ch of stats.values()){
  const champion=data.champMap?.[ch.id]??data.champions.find(x=>x.id===ch.id);if(!champion?.available[patch]||!ch.picks)continue;
  const presence=priority.length?(ch.openingPicks+ch.openingBans)/priority.length:null;
  const appearances=Object.entries(ch.roles).map(([role,v])=>({role,...v}));
  const eligible=appearances.filter(r=>r.picks>=2&&(r.picks/ch.picks>=.1||r.picks>=5)),best=eligible.length?eligible:appearances.sort((a,b)=>b.picks-a.picks).slice(0,1);
  for(const r of best){if(!roles[r.role])continue;
   const op=priority.length>=10&&presence>=.65&&r.picks>=2,major=op||r.picks>=3||presence>=.15;
   roles[r.role].push({id:ch.id,name:champion.name,role:r.role,picks:r.picks,wins:r.wins,presence,openingGames:priority.length,priority:op?'OP':major?'주요 픽':'후순위 픽',flex:best.length>1,observedRoles:best.map(x=>x.role),score:(presence??0)*100+r.picks/records.length*30});
  }
 }
 for(const list of Object.values(roles))list.sort((a,b)=>b.score-a.score||b.picks-a.picks||a.id.localeCompare(b.id));
 return {event,patch,mode,label,games:records.length,openingGames:priority.length,totalOpeningGames:opening.length,patchGames:patchRecords.length,priorityPatch:priorityGames.length?patch:null,firstDate:records[0].date,lastDate:records.at(-1).date,asOf:mode==='prior'?referenceDate:null,partial:event==='WORLDS',customRounds:event==='LCK_REG34',roles,records};
}
// Refill visible slots from legal observed picks before using labeled estimates.
export function draftMetaCandidates(view,role,{champions,available=()=>true,rank=()=>0,limit=4}){
 const observed=view.roles[role]??[],known=new Set(observed.map(c=>c.id));
 const rows=observed.filter(c=>available(c.id));
 if(rows.length<limit){
  const fallback=champions.filter(c=>!known.has(c.id)&&c.roles.includes(role)&&available(c.id))
   .map(c=>({id:c.id,name:c.name,role,priority:'대체 픽',estimated:true,picks:null,wins:null,presence:null,flex:c.roles.length>1,observedRoles:c.roles,score:rank(c.id)}))
   .sort((a,b)=>b.score-a.score||a.id.localeCompare(b.id));
  rows.push(...fallback);
 }
 return rows.slice(0,limit);
}
