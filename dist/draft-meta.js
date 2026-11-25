export const META_ROLES=['TOP','JGL','MID','BOT','SUP'];
export function draftMetaEvent(competition,phase='',date='2026-01-01'){
 if(competition==='CUP')return 'LCK_CUP';
 if(competition==='REGULAR')return phase==='REG34'||date.slice(5)>='07-01'?'LCK_REG34':'LCK_REG12';
 if(competition==='ROAD')return 'LCK_ROAD';
 if(['SEASON_PI','SEASON_PO','PLAYOFFS'].includes(competition))return 'LCK_PLAYOFFS';
 return ['FST','MSI','WORLDS'].includes(competition)?competition:null;
}
export function draftMetaView(data,{date,competition,phase,patch,mode='event'}){
 if(data.season?.startYear!==2026)return null;
 const event=draftMetaEvent(competition,phase,date),report=mode==='event'?data.draftMeta?.reports.find(r=>r.event===event&&r.patch===patch):null;
 const referenceDate='2026-'+date.slice(5)+'T00:00:00',prior=data.meta?.snapshots.filter(s=>s.asOfExclusive<=referenceDate).at(-1);
 const record=report??prior;
 if(!record)return {event,patch,mode,empty:true,roles:Object.fromEntries(META_ROLES.map(r=>[r,[]]))};
 const openingGames=report?record.openingGames:record.games;
 const byRole=Object.fromEntries(META_ROLES.map(r=>[r,[]]));
 for(const c of record.champions){
  const champion=data.champMap?.[c.id]??data.champions.find(x=>x.id===c.id);if(!champion?.available[patch])continue;
  const presence=report?(openingGames?(c.openingPicks+c.openingBans)/openingGames:null):c.presence;
  const appearances=Object.entries(c.roles??{}).map(([role,v])=>({role,picks:typeof v==='number'?v:v.picks,wins:typeof v==='number'?null:v.wins}));
  const eligible=appearances.filter(r=>r.picks>=2&&(r.picks/Math.max(1,c.picks)>=.1||r.picks>=5));
  const best=eligible.length?eligible:appearances.filter(r=>r.picks>0).slice().sort((a,b)=>b.picks-a.picks).slice(0,1);
  for(const r of best){if(!byRole[r.role])continue;
   const op=openingGames>=10&&presence>=.65&&r.picks>=2,major=op||r.picks>=3||presence>=.15;
   byRole[r.role].push({id:c.id,name:champion.name,role:r.role,picks:r.picks,wins:r.wins,presence,openingGames,priority:op?'OP':major?'주요 픽':'후순위 픽',flex:best.length>1,observedRoles:best.map(x=>x.role),score:(presence??0)*100+r.picks/Math.max(1,record.games)*30});
  }
 }
 for(const rows of Object.values(byRole))rows.sort((a,b)=>b.score-a.score||b.picks-a.picks||a.id.localeCompare(b.id));
 return {event,patch,mode:report?'event':'prior',requestedMode:mode,label:report?record.label:'최근 주요 대회',fallback:mode==='event'&&!report,games:record.games,openingGames,firstDate:record.firstDate,lastDate:report?record.lastDate:record.latestUsedGame,asOf:report?null:record.asOfExclusive,partial:!!record.partial,roles:byRole};
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
