import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as E from '../dist/engine.js';
const data=Object.fromEntries(['teams','players','champions','mastery','meta','international','season'].map(k=>[k,JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${k}.json`,import.meta.url)))]));
E.configure(data);
function season(){const s=E.newGame('T1',2026);E.startSeason(s);return s;}
function acceptable(s){Object.assign(s.players.faker,{ovr:99,potential:99,salary:1});Object.assign(s.players.chovy,{ovr:85,potential:90,salary:1});}
const snapshot=s=>JSON.stringify(s);

test('direct opponent hiring is blocked throughout season, including breaks, with no mutations',()=>{
 for(const key of ['CUP_GROUP','REG12','MSI_FINAL','WORLD_FINAL','BREAK']){const s=season();s.phase.key=key;const before=snapshot(s);assert.throws(()=>E.signPlayer(s,'lucid'),/트레이드/);assert.equal(snapshot(s),before);}
});
test('FA signings and preseason/offseason opponent purchases remain available',()=>{
 for(const phase of ['PRESEASON','OFFSEASON']){const s=E.newGame();s.phase.key=phase;s.seasonComplete=phase==='OFFSEASON';E.signPlayer(s,'lucid');assert.equal(s.players.lucid.owner,'T1');assert.notEqual(s.teams.DK.lineup.JGL,'lucid');}
 const s=season(),p=E.roster(s,'DK').find(p=>p.id!==s.teams.DK.lineup[p.position]);p.owner=null;E.signPlayer(s,p.id);assert.equal(p.owner,'T1');
});
test('accepted trades settle next day atomically, replace both starters and preserve contracts/budgets',()=>{
 const s=season();acceptable(s);const a=structuredClone(s.players.faker),b=structuredClone(s.players.chovy),budgets=[s.teams.T1.budget,s.teams.GEN.budget],rng=s.rng,control=structuredClone(s);E.advanceDays(control,1);
 const d=E.requestTrade(s,'faker','chovy');assert.equal(d.status,'pending');assert.equal(d.responseDate,E.dayAdd(s.date,1));assert.equal(s.players.faker.owner,'T1');assert.equal(s.players.chovy.owner,'GEN');assert.equal(s.rng,rng);
 E.processTrades(s);assert.equal(d.status,'pending');E.advanceDays(s,1);assert.equal(d.status,'accepted');assert.equal(s.teams.T1.lineup.MID,'chovy');assert.equal(s.teams.GEN.lineup.MID,'faker');
 assert.deepEqual(s.players.faker,{...control.players.faker,owner:'GEN'});assert.equal(s.players.chovy.contractEnd,b.contractEnd);assert.equal(s.players.chovy.salary,b.salary);assert.equal(s.players.chovy.owner,'T1');assert.deepEqual([s.teams.T1.budget,s.teams.GEN.budget],budgets);
 for(const id of ['T1','GEN'])for(const role of E.ROLES){const p=s.players[s.teams[id].lineup[role]];assert.equal(p.owner,id);assert.equal(p.position,role);}
});
test('AI rejects a weak offer without changing ownership, lineup, budget or RNG',()=>{
 const s=season();Object.assign(s.players.faker,{ovr:60,potential:65});const d=E.requestTrade(s,'faker','chovy');assert.equal(E.tradeEvaluation(s,'faker','chovy').accepted,false);s.date=d.responseDate;const before=structuredClone({players:s.players,teams:s.teams,rng:s.rng});E.processTrades(s);assert.equal(d.status,'rejected');assert.deepEqual({players:s.players,teams:s.teams,rng:s.rng},before);
});
test('pending players cannot enter another trade, be released or purchased; cancellation unlocks them',()=>{
 const s=season(),bench=E.roster(s).find(p=>s.teams.T1.lineup[p.position]!==p.id),other=E.roster(s,'DK').find(p=>p.position===bench.position);const d=E.requestTrade(s,bench.id,other.id);
 assert.throws(()=>E.requestTrade(s,bench.id,other.id),/검토 중/);assert.throws(()=>E.releasePlayer(s,bench.id),/검토 중/);s.phase.key='OFFSEASON';assert.throws(()=>E.signPlayer(s,other.id),/검토 중/);E.cancelTrade(s,d.id);assert.equal(d.status,'cancelled');assert.equal(E.pendingTrade(s,bench.id),undefined);E.releasePlayer(s,bench.id);assert.equal(bench.owner,null);assert.throws(()=>E.cancelTrade(s,d.id));
});
test('invalid role, ownership, expired/foreign players and active drafts reject without mutation',()=>{
 for(const mutate of [s=>{s.players.chovy.position='TOP';},s=>{s.players.faker.owner='DK';},s=>{s.players.chovy.contractEnd=2025;},s=>{s.players.chovy.foreign=true;},s=>{s.activeDraft={step:1};}]){const s=season();mutate(s);const before=snapshot(s);assert.throws(()=>E.requestTrade(s,'faker','chovy'));assert.equal(snapshot(s),before);}
});
test('changed ownership cancels stale requests; a draft postpones settlement until unlocked',()=>{
 const s=season();acceptable(s);const d=E.requestTrade(s,'faker','chovy');s.date=d.responseDate;s.activeDraft={step:1};E.processTrades(s);assert.equal(d.status,'pending');s.activeDraft=null;s.players.chovy.owner='DK';const teams=structuredClone(s.teams);E.processTrades(s);assert.equal(d.status,'cancelled');assert.equal(s.players.faker.owner,'T1');assert.equal(s.players.chovy.owner,'DK');assert.deepEqual(s.teams,teams);
});
test('old save without trade fields survives request/reload; offseason resolves without advancing days',()=>{
 const s=season();delete s.trades;delete s.nextTradeId;acceptable(s);E.requestTrade(s,'faker','chovy');const loaded=JSON.parse(JSON.stringify(s));loaded.phase.key='OFFSEASON';loaded.seasonComplete=true;E.processTrades(loaded);assert.equal(loaded.trades[0].status,'accepted');assert.equal(loaded.date,s.date);
 const fresh=E.newGame();acceptable(fresh);assert.equal(E.requestTrade(fresh,'faker','chovy').status,'accepted');
});
test('response uses current lineup and current valuation; completed deals never settle twice',()=>{
 const s=season();acceptable(s);const d=E.requestTrade(s,'faker','chovy');const backup=E.roster(s).find(p=>p.position==='MID'&&p.id!=='faker');E.setStarter(s,backup.id);s.date=d.responseDate;E.processTrades(s);assert.equal(d.status,'accepted');assert.equal(s.teams.T1.lineup.MID,backup.id);const before=snapshot(s);E.processTrades(s);assert.equal(snapshot(s),before);
 const rejected=season();acceptable(rejected);const deal=E.requestTrade(rejected,'faker','chovy');rejected.players.faker.ovr=50;rejected.date=deal.responseDate;E.processTrades(rejected);assert.equal(deal.status,'rejected');
});
