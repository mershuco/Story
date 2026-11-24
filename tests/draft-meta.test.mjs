import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
import{draftMetaEvent,draftMetaView,META_ROLES}from'../dist/draft-meta.js';import * as E from '../dist/engine.js';
const read=k=>JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${k}.json`,import.meta.url))),data={...Object.fromEntries(['season','meta','champions','players','teams','mastery','international'].map(k=>[k,read(k)])),draftMeta:read('draft-meta')};E.configure(data);
test('2026 tournament scope follows competition and stage instead of mixing the entire season',()=>{assert.equal(draftMetaEvent('CUP'),'LCK_CUP');assert.equal(draftMetaEvent('REGULAR','REG12','2026-04-01'),'LCK_REG12');assert.equal(draftMetaEvent('REGULAR','REG34','2026-08-01'),'LCK_REG34');assert.equal(draftMetaEvent('ROAD'),'LCK_ROAD');for(const c of['SEASON_PI','SEASON_PO'])assert.equal(draftMetaEvent(c),'LCK_PLAYOFFS');for(const c of['FST','MSI','WORLDS'])assert.equal(draftMetaEvent(c),c);});
test('real patch and tournament records change the role priorities: Cup jungle Jayce and MSI support Camille',()=>{
 const cup=draftMetaView(data,{date:'2026-01-14',competition:'CUP',patch:'16.1.1'}),msi=draftMetaView(data,{date:'2026-07-03',competition:'MSI',patch:'16.13.1'});assert.equal(cup.games,51);assert.equal(cup.openingGames,20);assert.equal(cup.roles.JGL[0].id,'Jayce');assert.equal(msi.games,71);assert.equal(msi.roles.SUP[0].id,'Camille');assert.equal(msi.roles.SUP[0].picks,16);assert.notDeepEqual(cup.roles.SUP,msi.roles.SUP);
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
test('current-time mode only reads earlier snapshots; a missing exact patch uses a labeled fallback',()=>{
 const prior=draftMetaView(data,{date:'2026-01-14',competition:'CUP',patch:'16.1.1',mode:'prior'});assert.equal(prior.mode,'prior');assert(prior.asOf<='2026-01-14T00:00:00');assert(prior.lastDate<'2026-01-14');const missing=draftMetaView(data,{date:'2026-07-01',competition:'MSI',patch:'16.12.1'});assert(missing.fallback);assert.equal(missing.mode,'prior');
});
test('actual flex positions do not depend on hardcoded champion roles and no future-unreleased champions enter the lists',()=>{
 const copy=structuredClone(data);copy.champMap={...copy.champMap,Jayce:{...copy.champMap.Jayce,roles:['TOP']}};const v=draftMetaView(copy,{date:'2026-01-14',competition:'CUP',patch:'16.1.1'});assert(v.roles.JGL.some(c=>c.id==='Jayce'));for(const r of META_ROLES)for(const c of v.roles[r])assert(copy.champMap[c.id].available['16.1.1']);
});
test('viewing tournament history never changes the state, RNG, draft roles, or opening AI priors',()=>{
 const s=E.newGame('T1',91),m={id:'meta-readonly',teams:['T1','GEN'],competition:'CUP',date:s.date,sets:[],score:[0,0],bestOf:3};const d=E.newDraft(s,m),before=JSON.stringify({s,d}),prior=E.metaFor(s);for(const mode of['event','prior'])draftMetaView(data,{date:s.date,competition:m.competition,patch:d.patch,mode});assert.equal(JSON.stringify({s,d}),before);assert.deepEqual(E.metaFor(s),prior);assert.equal(d.picks.blue.length+d.picks.red.length,0);
});
