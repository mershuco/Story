import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as E from '../dist/engine.js';
const data=Object.fromEntries(['teams','players','champions','mastery','meta','international'].map(k=>[k,JSON.parse(readFileSync(new URL(`../dist/data/${k}.json`,import.meta.url)))]));
E.configure(data);
const match=(s,id='test')=>({id,teams:['T1','GEN'],competition:'CUP',bestOf:5,date:s.date,sets:[],score:[0,0],status:'scheduled'});

test('117 players have all 173 mastery entries and initial evidence precedes 2022',()=>{
 assert.equal(data.players.length,117);assert.equal(data.champions.length,173);
 let observed=0;
 for(const p of data.players){const entries=data.mastery.players[p.id].champions;assert.equal(Object.keys(entries).length,173);for(const x of Object.values(entries)){assert(x.score>=0&&x.score<=100);assert(x.wins<=x.games);if(x.games){observed++;assert(x.lastPlayed<'2022-01-01');}else assert.equal(x.score,48);}}
 assert.equal(observed,1502);
});
test('CUP groups use prior finalists, cross-group matches, and 2 or 3 home games per club',()=>{
 const s=E.newGame('T1',11);E.startSeason(s);assert.equal(s.cupGroups[0][0],'DK');assert.equal(s.cupGroups[1][0],'T1');assert.equal(s.matches.length,25);
 const seen=new Set();for(const t of data.teams){const ms=s.matches.filter(m=>m.teams.includes(t.id));assert.equal(ms.length,5);const home=ms.filter(m=>m.teams[0]===t.id).length;assert(home===2||home===3);}
 for(const m of s.matches){assert.notEqual(s.cupGroups[0].includes(m.teams[0]),s.cupGroups[0].includes(m.teams[1]));const key=[...m.teams].sort().join('|');assert(!seen.has(key));seen.add(key);}
});
test('round robins have 18+12 matches per team and balanced round-five home fixtures',()=>{
 const ids=data.teams.map(t=>t.id);const rr=E.roundRobin(ids,2).flat();assert.equal(rr.length,90);for(const id of ids){assert.equal(rr.filter(p=>p.includes(id)).length,18);assert.equal(rr.filter(p=>p[0]===id).length,9);}
 const g=ids.slice(0,5),third=E.roundRobin(g,3).slice(10).flat();for(const id of g){assert.equal(third.filter(p=>p.includes(id)).length,4);assert.equal(third.filter(p=>p[0]===id).length,2);}
});
test('subset standings retain cross-group results and ignore other seasons',()=>{
 const s=E.newGame('T1',3);s.matches=[{id:'2022-1',teams:['T1','DK'],competition:'REGULAR',phase:'REG12',status:'done',score:[2,0],winner:'T1'},{id:'2021-1',teams:['T1','GEN'],competition:'REGULAR',phase:'REG12',status:'done',score:[0,2],winner:'GEN'}];
 const row=E.standings(s,['T1'],'REGULAR')[0];assert.equal(row.w,1);assert.equal(row.l,0);assert.equal(row.sw,2);
});
test('manual prefix survives save/load and automatic completion, with standard 20 actions',()=>{
 const s=E.newGame('T1',55),m=match(s);const d=E.newDraft(s,m);const first=E.legalChampions(s,d).find(c=>c.id==='Ahri');E.draftAction(s,d,first.id);const prefix=structuredClone(d.history);const saved=JSON.parse(JSON.stringify({s,d}));E.completeDraft(saved.s,saved.d);assert.equal(saved.d.step,20);assert.deepEqual(saved.d.history.slice(0,1),prefix);assert.equal(saved.d.bans.blue.length,5);assert.equal(saved.d.bans.red.length,5);assert.equal(new Set([...saved.d.picks.blue,...saved.d.picks.red].map(p=>p.champion)).size,10);assert.throws(()=>E.draftAction(s,d,'Ahri'));
});
test('fearless removes both teams previous picks, resets prior bans, and remains active in game 5',()=>{
 const s=E.newGame('T1',177),m=match(s);let firstBan;
 for(let i=0;i<4;i++){const d=E.completeDraft(s,E.newDraft(s,m));if(i===0)firstBan=d.bans.blue[0];const picks=[...d.picks.blue,...d.picks.red];assert.equal(picks.length,10);m.sets.push({picks,loser:i%2?'T1':'GEN'});}
 const fifth=E.newDraft(s,m);assert.equal(fifth.used.length,40);const legal=E.legalChampions(s,fifth);assert(legal.every(c=>!fifth.used.includes(c.id)));if(!fifth.used.includes(firstBan))assert(legal.some(c=>c.id===firstBan));
 const completed=E.completeDraft(s,fifth);assert.equal(new Set([...m.sets.flatMap(x=>x.picks),...completed.picks.blue,...completed.picks.red].map(x=>x.champion)).size,50);
 assert.equal(E.newDraft(s,match(s,'next-series')).used.length,0);
});
test('deterministic replay preserves RNG and outputs across save/load',()=>{
 const a=E.newGame('T1',33),b=JSON.parse(JSON.stringify(a));const m1=match(a),m2=match(b);E.simulateSeries(a,m1);E.simulateSeries(b,m2);assert.deepEqual(m1,m2);assert.equal(a.rng,b.rng);
});
test('date progression stops at own match and training grows only save-local mastery',()=>{
 const s=E.newGame('T1',6);const initial=E.mastery(s,'faker','Azir');s.focus.faker='Azir';s.trainingPlan=Array(7).fill('champion');E.startSeason(s);const result=E.advanceDays(s,50,false);assert.equal(result.reason,'match');assert(s.date<=E.nextOwnMatch(s).date);assert(E.mastery(s,'faker','Azir')>initial);assert.equal(E.mastery(E.newGame('T1',6),'faker','Azir'),initial);
});
test('contracts, transfers and spending keep lineups valid and reject unaffordable purchases',()=>{
 const s=E.newGame('T1',6);const before=s.teams.T1.budget;E.signPlayer(s,'lucid');assert.equal(s.players.lucid.owner,'T1');assert(s.teams.T1.budget<before);E.setStarter(s,'lucid');assert.equal(s.teams.T1.lineup.JGL,'lucid');const end=s.players.faker.contractEnd;E.extendContract(s,'faker');assert.equal(s.players.faker.contractEnd,end+1);s.teams.T1.budget=0;assert.throws(()=>E.upgrade(s,'coach'));assert.equal(s.teams.T1.coach,1);
});
test('complete seasons retain cumulative standings, correct brackets, Swiss exclusions and next-season isolation',()=>{
 for(const [club,seed] of [['T1',42],['BRO',777],['DRX',1234]]){
  const s=E.newGame(club,seed);E.startSeason(s);const result=E.advanceDays(s,450,true);assert.equal(result.reason,'season');assert.equal(s.date,'2022-11-09');assert.equal(s.matches.filter(m=>m.competition==='REGULAR').length,150);
  const table=E.standings(s,data.teams.map(t=>t.id),'REGULAR');assert(table.every(r=>r.played===30));
  const groupTable=s.cupGroups.flatMap(g=>E.standings(s,g,'CUP','CUP_GROUP'));assert(groupTable.every(r=>r.played===5));assert.equal(groupTable.reduce((n,r)=>n+r.w,0),25);
  const road=s.matches.filter(m=>m.competition==='ROAD');assert.deepEqual(road.map(m=>m.phase),['ROAD_56','ROAD_4','ROAD_TOP','ROAD_3','ROAD_FINAL']);
  const msi=s.matches.filter(m=>m.phase==='MSI_QF');assert.equal(msi.length,4);for(const half of [msi.slice(0,2),msi.slice(2)])assert.equal(new Set(half.flatMap(m=>m.teams).map(id=>s.teams[id].region)).size,4);
  const swiss=s.matches.filter(m=>m.phase.startsWith('WORLD_SWISS'));const encounters=new Set();for(const m of swiss){const key=[...m.teams].sort().join('|');assert(!encounters.has(key));encounters.add(key);if(m.phase==='WORLD_SWISS1')assert.notEqual(s.teams[m.teams[0]].region,s.teams[m.teams[1]].region);}
  assert.equal(s.international.swiss.ids.filter(id=>s.international.swiss.records[id].w===3).length,8);
  const qf=s.matches.filter(m=>m.phase==='WORLD_QF');assert.equal(s.international.swiss.records[qf[0].teams[0]].l,0);assert.equal(s.international.swiss.records[qf[2].teams[0]].l,0);assert.equal(s.international.swiss.records[qf[0].teams[1]].l,2);
  if(club==='T1'){E.nextSeason(s);for(const p of E.lineup(s,club))E.extendContract(s,p.id);E.startSeason(s);assert.equal(E.standings(s,['T1'],'REGULAR')[0].played,0);assert.deepEqual(s.cupGroups.map(g=>g[0]),[s.career.at(-1).lck,s.career.at(-1).runner]);const next=E.advanceDays(s,450,true);assert.equal(next.reason,'season');assert.equal(s.career.length,2);assert(E.standings(s,['T1'],'REGULAR')[0].played===30);}
 }
});
