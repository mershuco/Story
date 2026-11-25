import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{draftMetaEvent,draftMetaView,META_ROLES}from'../dist/draft-meta.js';import * as E from '../dist/engine.js';
const read=k=>JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${k}.json`,import.meta.url))),data={...Object.fromEntries(['season','meta','champions','players','teams','mastery','international'].map(k=>[k,read(k)])),draftMeta:read('draft-meta')};E.configure(data);
test('2026 tournament scope follows competition and stage instead of mixing the entire season',()=>{assert.equal(draftMetaEvent('CUP'),'LCK_CUP');assert.equal(draftMetaEvent('REGULAR','REG12','2026-04-01'),'LCK_REG12');assert.equal(draftMetaEvent('REGULAR','REG34','2026-08-01'),'LCK_REG34');assert.equal(draftMetaEvent('ROAD'),'LCK_ROAD');for(const c of['SEASON_PI','SEASON_PO'])assert.equal(draftMetaEvent(c),'LCK_PLAYOFFS');for(const c of['FST','MSI','WORLDS'])assert.equal(draftMetaEvent(c),c);});
test('real patch and tournament records change the role priorities: Cup jungle Jayce and MSI support Camille',()=>{
 const cup=draftMetaView(data,{date:'2026-01-14',competition:'CUP',patch:'16.1.1'}),msi=draftMetaView(data,{date:'2026-07-03',competition:'MSI',patch:'16.13.1'});assert.equal(cup.games,125);assert.equal(cup.patchGames,51);assert.equal(cup.openingGames,20);assert.equal(cup.roles.JGL[0].id,'Jayce');assert.equal(msi.games,71);assert.equal(msi.roles.SUP[0].id,'Camille');assert.equal(msi.roles.SUP[0].picks,16);assert.notDeepEqual(cup.roles.SUP,msi.roles.SUP);
 const later=draftMetaView(data,{date:'2026-02-12',competition:'CUP',patch:'16.3.1'});assert.equal(later.patch,'16.3.1');assert.notDeepEqual(cup.roles.JGL,later.roles.JGL);
});
test('pick and win totals reconcile, bans never inflate presence beyond 100%, and each role comes from actual picks',()=>{
 assert.equal(data.draftMeta.reports.reduce((n,r)=>n+r.games,0),640);
 for(const r of data.draftMeta.reports){assert.equal(r.champions.reduce((n,c)=>n+c.picks,0),r.games*10);assert.equal(r.champions.reduce((n,c)=>n+c.wins,0),r.games*5);assert.equal(r.champions.reduce((n,c)=>n+c.openingPicks,0),r.openingGames*10);
  for(const c of r.champions){assert(c.picks+c.bans<=r.games);assert(c.openingPicks+c.openingBans<=r.openingGames);assert.equal(Object.values(c.roles).reduce((n,v)=>n+v.picks,0),c.picks);assert.equal(Object.values(c.roles).reduce((n,v)=>n+v.wins,0),c.wins);}
 }
});
test('an OP label requires sufficient opening-game evidence; partial Worlds records cannot manufacture OP confidence',()=>{
 const worlds=draftMetaView(data,{date:'2026-11-14',competition:'WORLDS',patch:'16.20.1'});assert(worlds.partial);assert.equal(worlds.games,22);assert.equal(worlds.openingGames,6);assert(Object.values(worlds.roles).flat().every(c=>c.priority!=='OP'));assert.equal(worlds.lastDate.slice(0,10),'2026-10-18');
 const cup=draftMetaView(data,{date:'2026-01-14',competition:'CUP',patch:'16.1.1'});for(const c of Object.values(cup.roles).flat().filter(c=>c.priority==='OP'))assert(c.presence>=.65&&c.openingGames>=10&&c.picks>=2);
});
test('current-time mode uses only earlier records from the same event; a missing patch cannot borrow other events',()=>{
 const prior=draftMetaView(data,{date:'2026-01-14',competition:'CUP',patch:'16.1.1',mode:'prior'});assert(prior.empty);assert.equal(prior.records.length,0);
 const later=draftMetaView(data,{date:'2026-02-01',competition:'CUP',patch:'16.2.1',mode:'prior'});assert(later.records.length>0);assert(later.records.every(g=>g.event==='LCK_CUP'&&g.date<'2026-02-01'));
 const missing=draftMetaView(data,{date:'2026-07-01',competition:'MSI',patch:'16.12.1'});assert.equal(missing.games,71);assert.equal(missing.patchGames,0);assert(missing.records.every(g=>g.event==='MSI'));
});
test('actual flex positions do not depend on hardcoded champion roles and no future-unreleased champions enter the lists',()=>{
 const copy=structuredClone(data);copy.champMap={...copy.champMap,Jayce:{...copy.champMap.Jayce,roles:['TOP']}};const v=draftMetaView(copy,{date:'2026-01-14',competition:'CUP',patch:'16.1.1'});assert(v.roles.JGL.some(c=>c.id==='Jayce'));for(const r of META_ROLES)for(const c of v.roles[r])assert(copy.champMap[c.id].available['16.1.1']);
});
test('viewing tournament history never changes the state, RNG, draft roles, or opening AI priors',()=>{
 const s=E.newGame('T1',91),m={id:'meta-readonly',teams:['T1','GEN'],competition:'CUP',date:s.date,sets:[],score:[0,0],bestOf:3};const d=E.newDraft(s,m),before=JSON.stringify({s,d}),prior=E.metaFor(s);for(const mode of['event','prior'])draftMetaView(data,{date:s.date,competition:m.competition,patch:d.patch,mode});assert.equal(JSON.stringify({s,d}),before);assert.deepEqual(E.metaFor(s),prior);assert.equal(d.picks.blue.length+d.picks.red.length,0);
});

test('spent opening OP cards are replaced by the next observed picks, including lower presence picks',async()=>{
 const {draftMetaCandidates}=await import('../dist/draft-meta.js');
 const view=draftMetaView(data,{date:'2026-01-14',competition:'CUP',patch:'16.1.1'}),rows=view.roles.JGL;
 assert(rows.length>4);assert(Object.values(view.roles).flat().some(c=>c.priority==='후순위 픽'));
 const blocked=new Set(rows.slice(0,4).map(c=>c.id)),next=draftMetaCandidates(view,'JGL',{champions:data.champions,available:id=>!blocked.has(id)});
 assert.deepEqual(next.map(c=>c.id),rows.slice(4,8).map(c=>c.id));assert(next.every(c=>!c.estimated));
});
test('exhausted tournament pool refills with legal role candidates and clearly labeled estimates',async()=>{
 const {draftMetaCandidates}=await import('../dist/draft-meta.js');
 const view=draftMetaView(data,{date:'2026-07-03',competition:'MSI',patch:'16.13.1'}),blocked=new Set(view.roles.SUP.map(c=>c.id));
 const legal=id=>!blocked.has(id)&&!!data.champMap[id].available['16.13.1'];
 const expected=data.champions.filter(c=>c.roles.includes('SUP')&&legal(c.id)).map(c=>c.id).sort();
 const rows=draftMetaCandidates(view,'SUP',{champions:data.champions,available:legal,rank:id=>id===expected.at(-1)?99:1});
 assert.equal(rows.length,4);assert.equal(rows[0].id,expected.at(-1));
 for(const row of rows){assert(row.estimated);assert.equal(row.priority,'대체 픽');assert.equal(row.picks,null);assert.equal(row.wins,null);assert.equal(row.presence,null);assert(legal(row.id));}
 assert.deepEqual(draftMetaCandidates(view,'SUP',{champions:data.champions,available:()=>false}),[]);
});
test('refilling references does not mutate draft state or bypass fearless and ban exclusions',async()=>{
 const {draftMetaCandidates}=await import('../dist/draft-meta.js');const s=E.newGame('T1',91),m={id:'refill',teams:['T1','GEN'],competition:'CUP',date:s.date,sets:[],score:[0,0],bestOf:3},d=E.newDraft(s,m);
 E.draftAction(s,d,E.legalChampions(s,d)[0].id);d.used.push(...E.legalChampions(s,d).slice(0,15).map(c=>c.id));const before=JSON.stringify({s,d}),view=draftMetaView(data,{date:s.date,competition:'CUP',patch:d.patch});
 for(const role of META_ROLES){const rows=draftMetaCandidates(view,role,{champions:data.champions,available:id=>!E.draftUnavailableReason(s,d,id),rank:id=>E.mastery(s,s.teams[s.myTeam].lineup[role],id)});assert(rows.every(c=>!E.draftUnavailableReason(s,d,c.id)));}
 assert.equal(JSON.stringify({s,d}),before);
});

test('every available set is retained and tournament pools never mix',()=>{
 assert.equal(data.draftMeta.records.length,640);assert.equal(data.draftMeta.lck.games,502);
 assert.equal(new Set(data.draftMeta.records.map(g=>g.id)).size,640);
 const expected=[['CUP','CUP_GROUP',125],['FST','FST26_R1',45],['REGULAR','REG12',204],['ROAD','ROAD_TOP',20],['REGULAR','REG35',98],['SEASON_PO','SEASON_PO1',55],['MSI','MSI_QF',71],['WORLDS','WORLD_QF',22]];
 for(const [competition,phase,count] of expected){const v=draftMetaView(data,{date:'2026-11-14',competition,phase,patch:'16.20.1'});assert.equal(v.games,count);assert(v.records.every(g=>g.event===v.event));}
 for(const g of data.draftMeta.records){assert.equal(g.lineups.length,2);assert.equal(g.lineups.flat().length,10);assert.equal(g.lineups.flat().reduce((n,p)=>n+p[3],0),5);assert(g.lineups.every(l=>new Set(l.map(p=>p[1])).size===5));assert.equal(new Set(g.lineups.flat().map(p=>p[0])).size,10);}
 const options={date:'2026-08-01',competition:'ROAD',patch:'16.14.1'},before=draftMetaView(data,options),copy={...data,draftMeta:{...data.draftMeta,records:data.draftMeta.records.filter(g=>g.event===before.event)}};
 assert.deepEqual(draftMetaView(copy,options).roles,before.roles);
});
