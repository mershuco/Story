import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as E from '../dist/engine.js';
const data=Object.fromEntries(['teams','players','champions','mastery','meta','international','season'].map(k=>[k,JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${k}.json`,import.meta.url)))]));
data.masteryRecords=JSON.parse(readFileSync(new URL('../dist/data/season-2026/mastery-records.json',import.meta.url)));
E.configure(data);
const setup=()=>{const s=E.newGame('T1',2026),m={id:'qa-2026',teams:['T1','GEN'],competition:'CUP',bestOf:5,date:s.date,sets:[],score:[0,0],status:'scheduled'};return{s,m,d:E.newDraft(s,m)};};
test('2026 opening rosters use verified starters, contemporary brands and2025-only opening evidence',()=>{
 assert.equal(data.players.length,106);assert.equal(Object.keys(data.mastery.players).length,201);
 const s=E.newGame();assert.equal(s.year,2026);assert.equal(s.date,'2026-01-08');assert.equal(s.dataProfile,'season-2026');
 for(const t of data.teams){assert.deepEqual(s.teams[t.id].lineup,t.startingLineup);for(const id of Object.values(t.startingLineup))assert.equal(s.players[id].contractEnd,2026);}
 assert.equal(s.teams.T1.lineup.BOT,'peyz');assert.equal(s.teams.HLE.lineup.BOT,'gumayusi');assert.equal(s.teams.KT.lineup.SUP,'pollu');assert.equal(s.teams.KDF.lineup.SUP,'life');assert.equal(s.teams.DRX.lineup.JGL,'willer');assert.equal(s.teams.BRO.lineup.MID,'roamer');assert.equal(s.teams.KDF.abbr,'DNS');assert.equal(s.teams.LSB.abbr,'BFX');assert.equal(s.teams.DRX.abbr,'KRX');
 for(const p of Object.values(data.mastery.players)){assert.equal(Object.keys(p.champions).length,data.champions.length);for(const x of Object.values(p.champions))if(x.games)assert(x.lastPlayed<'2026-01-01');else assert.equal(x.score,48);}
 E.startSeason(s);assert.deepEqual(s.cupGroups.map(g=>g[0]),['GEN','HLE']);assert.equal(s.matches[0].date,'2026-01-14');
});
test('mastery uses evidence from 2013 onward, with bounded highlight bonuses and dated 2026 results',()=>{
 const {coverage,careerCoverage,players}=data.masteryRecords;
 const archive=JSON.parse(readFileSync(new URL('../research/2026/career-match-history.json',import.meta.url)));
 assert.deepEqual(Object.keys(players).sort(),Object.keys(data.mastery.players).sort());
 assert.deepEqual(careerCoverage,archive.coverage);
 assert.equal(archive.firstObserved.faker,'2013-03-23');
 assert.deepEqual(archive.players.faker['2013'].Zed,[5,5,1]);
 assert.equal(archive.coverage['2013'].appearances,79);
 assert.equal(archive.coverage['2013'].inven,10);
 assert.equal(archive.coverage['2014'].inven,20);
 const appearances=(id,year)=>Object.values(archive.players[id][year]).reduce((n,[games])=>n+games,0);
 assert.equal(appearances('on','2019'),70);
 assert.equal(appearances('sero','2022'),33);
 assert.equal(appearances('ghost','2017'),103);
 assert.deepEqual(coverage.additionalLeaguepediaAppearances,{'2025':24,'2026':20});
 assert.equal(coverage.worlds.sets,98);
 assert.equal(coverage.worlds.additionalSets,76);
 assert.equal(coverage.worlds.additionalAppearances,654);
 for(const champions of Object.values(players))for(const updates of Object.values(champions)){
  assert(updates.every(([day,score],i)=>score>=48&&score<=99&&(!i||day>updates[i-1][0])));
  assert(updates.every(([day])=>day>='2025-12-31'));
 }
 const s=E.newGame();
 assert.equal(E.masteryEvidence('faker','Zed').score,48);
 assert.equal(E.mastery(s,'faker','Zed'),60);
 assert.equal(E.masteryEvidence('viper','Yunara').score,81);
 assert.equal(E.mastery(s,'viper','Yunara'),71);
 assert.equal(E.mastery(s,'faker','Azir'),98);
 assert.equal(data.mastery.players.pop9.observed2025Games,122);
 s.date='2026-08-08';assert.equal(E.mastery(s,'faker','Locke'),48);
 s.date='2026-08-09';assert.equal(E.mastery(s,'faker','Locke'),51);
 s.date='2026-08-15';assert.equal(E.mastery(s,'faker','Locke'),54);
 s.date='2026-11-14';assert.equal(E.mastery(s,'chovy','Syndra'),70);
 s.date='2026-11-15';assert.equal(E.mastery(s,'chovy','Syndra'),72);
 s.masteryGains.chovy={Syndra:30};assert.equal(E.mastery(s,'chovy','Syndra'),99);
 assert.equal(E.mastery(s,'unlinked-player','Azir'),48);
});
test('2026 patch schedule, champion releases, datedkits and weeklymeta never use later observations',()=>{
 assert.equal(E.patchAt('2026-01-08'),'16.1.1');assert.equal(E.patchAt('2026-01-21'),'16.1.1');assert.equal(E.patchAt('2026-01-22'),'16.2.1');assert.equal(E.patchAt('2026-09-09'),'16.17.1');assert.equal(E.patchAt('2026-09-10'),'16.18.1');assert.equal(E.patchAt('2026-11-23'),'16.23.1');assert.equal(E.patchAt('2026-11-14','WORLDS'),'16.20.1');assert.equal(E.patchLabel('16.1.1'),'26.01');
 for(const snapshot of data.meta.snapshots){assert(snapshot.latestUsedGame.replace(' ','T')<snapshot.asOfExclusive);for(const row of snapshot.champions)assert(row.presence>=0&&row.presence<=1);}
 const s=E.newGame();s.date='2026-02-10';assert(E.metaFor(s).asOfExclusive<='2026-02-10T00:00:00');for(const c of E.currentPool(s))assert(c.kits['16.1.1']||!c.available['16.1.1']);
 s.date='2026-11-18';assert.equal(E.metaFor(s).latestUsedGame.slice(0,10),'2026-10-18');
});
test('all20 selections remain unassigned even with lane arguments and role filters',()=>{
 const {s,m,d}=setup();
 for(let i=0;i<20;i++){
  const champion=E.legalChampions(s,d)[0].id;E.draftAction(s,d,champion,'TOP');
  assert([...d.picks.blue,...d.picks.red].every(p=>p.role===null));assert(d.history.every(p=>p.role===null));
  if(i<19)assert.throws(()=>E.assignChampion(d,'blue',d.picks.blue[0]?.champion,'MID'));
 }
 assert.equal(d.phase,'assignment');assert.throws(()=>E.resolveDraft(s,m,d));
});
test('postdraft permits every champion in every lane, swaps occupants and blocks incomplete/unconfirmed games',()=>{
 const {s,m,d}=setup();E.completeDraft(s,d);const picks=d.picks.blue;assert(picks.every(p=>p.role===null));assert.equal(new Set(d.picks.red.map(p=>p.role)).size,5);
 for(let i=0;i<5;i++)E.assignChampion(d,'blue',picks[i].champion,E.ROLES[i]);
 assert(E.assignmentsReady(d));assert.throws(()=>E.resolveDraft(s,m,d));
 const before=picks.map(p=>p.role),savedRng=s.rng;E.assignChampion(d,'blue',picks[0].champion,'SUP');assert.equal(picks[0].role,'SUP');assert.equal(picks[4].role,'TOP');assert.equal(new Set(picks.map(p=>p.role)).size,5);assert.equal(s.rng,savedRng);
 E.confirmDraftAssignments(d);const set=E.resolveDraft(s,m,d);assert.equal(set.stats.find(p=>p.champion===picks[0].champion).player,s.teams.T1.lineup.SUP);assert.equal(set.stats.length,10);
});
test('timer fills only missing roles, preserves deliberate flex assignments, survives JSON and never starts the match',()=>{
 const {s,m,d}=setup();E.completeDraft(s,d);const chosen=d.picks.blue[0];E.assignChampion(d,'blue',chosen.champion,'BOT');const rng=s.rng;d.assignment.remaining=.1;
 const loaded=JSON.parse(JSON.stringify(d));E.migrateDraft(loaded);E.expireAssignment(s,loaded);assert.equal(loaded.picks.blue.find(p=>p.champion===chosen.champion).role,'BOT');assert(E.assignmentsReady(loaded));assert.equal(loaded.assignment.confirmed,false);assert.equal(loaded.assignment.remaining,0);assert.equal(m.sets.length,0);assert.equal(s.rng,rng);
 E.expireAssignment(s,loaded);assert.equal(loaded.picks.blue.find(p=>p.champion===chosen.champion).role,'BOT');
});
test('coach evaluates all120 final role matchings and saved drafts preserve picks and fearless exclusions',()=>{
 const {s,m,d}=setup();E.completeDraft(s,d);const before=JSON.stringify(d.history),rng=s.rng;E.autoAssignDraft(s,d,'blue',false);assert(E.assignmentsReady(d));assert.equal(s.rng,rng);assert.equal(JSON.stringify(d.history),before);
 const clone=JSON.parse(JSON.stringify(d));E.autoAssignDraft(s,clone,'blue',false);assert.deepEqual(clone.picks,d.picks);E.confirmDraftAssignments(d);E.resolveDraft(s,m,d);const next=E.newDraft(s,m);assert.equal(next.used.length,10);assert(E.legalChampions(s,next).every(c=>!next.used.includes(c.id)));
});
test('2026 fullseason and next season retain competition progression without reverting to2022 players or contracts',()=>{
 const s=E.newGame('HLE',2026);E.startSeason(s);assert.equal(E.advanceDays(s,450,true).reason,'season');assert.equal(s.date,'2026-11-14');assert.equal(s.career.length,1);assert.equal(s.matches.filter(m=>m.competition==='REGULAR').length,150);assert.equal(s.matches.filter(m=>m.competition==='FST').length,13);assert.equal(s.international.fstParticipants.length,8);assert.equal(s.international.msiParticipants.length,11);assert.equal(s.matches.filter(m=>m.competition==='MSI').length,20);assert.equal(s.international.worldsParticipants.length,19);assert.equal(s.matches.filter(m=>m.phase.startsWith('WORLD26_PI')).length,6);assert.equal(s.matches.filter(m=>m.competition==='SEASON_PO').length,13);assert.equal(s.matches.filter(m=>m.phase==='SEASON_FINAL')[0].date,'2026-09-27');assert.equal(s.matches.filter(m=>m.phase==='CUP_FINAL')[0].date,'2026-03-01');assert(E.standings(s,data.teams.map(t=>t.id),'REGULAR').every(r=>r.played===30));
 E.nextSeason(s);assert.equal(s.date,'2027-01-08');assert.equal(s.dataProfile,'season-2026');assert.equal(E.patchAt(s.date),'16.1.1');for(const p of E.lineup(s,'HLE'))E.extendContract(s,p.id);E.startSeason(s);assert.equal(E.standings(s,['HLE'],'REGULAR')[0].played,0);assert.equal(s.teams.T1.lineup.BOT,'peyz');
});

test('FirstSelection separates map color from pickorder, reversesall20 actions, givesloserthenextchoice andhonorsfinalexception',()=>{
 const {s,m}=setup();m.firstSelectionRights='T1';let d=E.newDraft(s,m,'pick:first');assert.equal(d.red,'T1');assert.equal(d.firstPickSide,'red');assert.equal(E.draftTurn(d).team,'T1');
 for(let i=0;i<20;i++){const [canonicalSide,kind]=E.ACTIONS[i],turn=E.draftTurn(d);assert.equal(turn.side,canonicalSide==='blue'?'red':'blue');assert.equal(turn.kind,kind);E.draftAction(s,d,E.legalChampions(s,d)[0].id);}
 d=E.newDraft(s,m,'side:blue');assert.equal(d.blue,'T1');assert.equal(d.firstPickSide,'red');assert.equal(E.draftTurn(d).team,'GEN');
 m.phase='CUP_FINAL';d=E.newDraft(s,m,'both:red:second');assert.equal(d.red,'T1');assert.equal(d.firstPickSide,'blue');assert(d.firstSelection.both);
 m.sets.push({loser:'GEN',picks:[]});d=E.newDraft(s,m,'pick:second');assert.equal(d.rights,'GEN');assert.equal(d.firstSelection.rights,'GEN');assert(!d.firstSelection.both);
 m.phase='CUP_GROUP';m.sets=[];m.firstSelectionRights='GEN';const plan=E.selectionPlan(s,m);d=E.newDraft(s,m,plan.category==='side'?'pick:second':'side:red');assert.equal(d.firstSelection.responseTeam,'T1');if(plan.category==='side')assert.notEqual(d[d.firstPickSide],'T1');else assert.equal(d.red,'T1');
});
test('2026CUP has20BO3 plus5seed-pairedBO5,30group points, withnormalindividualmatchwins',()=>{
 const s=E.newGame();E.startSeason(s);assert.equal(s.matches.length,25);assert.equal(s.matches.filter(m=>m.bestOf===3).length,20);assert.equal(s.matches.filter(m=>m.bestOf===5).length,5);
 for(const [i,m] of s.matches.slice(20).entries()){assert.deepEqual(m.teams,[s.cupGroups[0][4-i],s.cupGroups[1][4-i]]);assert.equal(m.groupPoints,2);}
 for(const m of s.matches){m.status='done';m.winner=m.teams[0];m.score=m.bestOf===5?[3,0]:[2,0];}
 assert.equal(E.cupGroupScore(s,s.cupGroups[0]),30);assert.equal(E.standings(s,s.cupGroups[0],'CUP','CUP_GROUP').reduce((n,r)=>n+r.w,0),25);
});
test('group15:15 uses setdifference then prescribedrole-free fearless5th/1strelay',async()=>{
 const {cupGroupWinner}=await import('../dist/rules2026.js');const s=E.newGame();E.startSeason(s);
 s.matches.forEach((m,i)=>{const a=i<9||i>=20&&i<23;m.status='done';m.winner=m.teams[a?0:1];m.score=m.bestOf===5?(a?[3,0]:[0,3]):a?[2,0]:[0,2];});
 assert.equal(E.cupGroupScore(s,s.cupGroups[0]),15);assert.equal(cupGroupWinner(s),1);assert.equal(s.cupTiebreak,null);
 s.matches[9].score=[1,2];const tables=s.cupGroups.map(g=>E.standings(s,g,'CUP','CUP_GROUP'));assert(tables.every(rows=>rows.reduce((n,r)=>n+r.sw-r.sl,0)===0));
 const winner=cupGroupWinner(s,tables);assert([0,1].includes(winner));const relay=s.cupTiebreak;assert(relay.score.includes(3));assert.equal(relay.automated,true);
 const allPicks=relay.sets.flatMap(set=>set.picks.map(p=>p.champion));assert.equal(new Set(allPicks).size,allPicks.length);
 for(const [i,set] of relay.sets.entries()){const teams=tables.map(rows=>rows[i%2?0:4].id);assert.deepEqual([...new Set(set.picks.map(p=>p.team))].sort(),teams.sort());assert(teams.includes(set.firstSelection.rights));if(i){const priorLoser=relay.sets[i-1].loser,loserGroup=tables.findIndex(rows=>rows[(i-1)%2?0:4].id===priorLoser);assert.equal(set.firstSelection.rights,tables[loserGroup][i%2?0:4].id);}}
});
test('submittedplayers remainfixed duringdraft whilechampionassignments arefree',()=>{
 const {s,m,d}=setup();s.activeDraft=d;assert.throws(()=>E.setStarter(s,'faker'));assert.throws(()=>E.signPlayer(s,'lucid'));assert.throws(()=>E.releasePlayer(s,'guti'));
});

test('competitive patches follow observedLCKadoption and newchampions waituntil thenextlivepatch',()=>{
 const {s,m}=setup();s.date='2026-01-28';assert.equal(E.patchAt(s.date,'CUP'),'16.2.1');assert.equal(E.patchAt('2026-02-06','CUP'),'16.2.1');assert.equal(E.patchAt('2026-02-12','CUP'),'16.3.1');assert.equal(E.patchAt('2026-06-28','MSI'),'16.13.1');
 const fresh=data.champions.find(c=>!c.available['16.12.1']&&c.available['16.13.1']);assert(fresh);s.date='2026-06-28';let d=E.newDraft(s,{...m,competition:'MSI'});assert(!E.legalChampions(s,d).some(c=>c.id===fresh.id));assert.equal(E.draftUnavailableReason(s,d,fresh.id),'신규 챔피언 대회 유예');s.date='2026-07-29';d=E.newDraft(s,{...m,competition:'REGULAR'});assert(E.legalChampions(s,d).some(c=>c.id===fresh.id));
});

test('all6regions includingCBLOL can receiveWorldsbonus slots with19entrants andvalid16team4pooldraws',async()=>{
 const {begin2026International}=await import('../dist/rules2026.js');const all=['LCK','LPL','LEC','LCS','LCP','CBLOL'];
 for(let shift=0;shift<6;shift++){
  const s=E.newGame('T1',500+shift),rank=[...all.slice(shift),...all.slice(0,shift)];s.date='2026-10-14';s.worldsSeeds=['T1','GEN','DK','HLE'];s.international.msiRegionRanking=rank;s.international.extraWorldRegions=rank.slice(0,2);
  begin2026International(s,'WORLDS');assert.equal(s.international.worldsParticipants.length,19);assert.equal(s.international.worldsDirect.length,15);E.advanceDays(s,6,true);const pools=s.international.worldsTiers;assert.deepEqual(pools.map(p=>p.length),[4,4,4,4]);assert.equal(new Set(pools.flat()).size,16);const first=s.matches.filter(m=>m.phase==='WORLD_SWISS1');assert.equal(first.length,8);for(const m of first)assert.notEqual(s.teams[m.teams[0]].region,s.teams[m.teams[1]].region);
 }
});
test('MSI11team playin qualifiesonly1 and thehighest eligible2seedregion receives theFirstStandbye',async()=>{
 const {begin2026International}=await import('../dist/rules2026.js');const all=['CBLOL','LCK','LPL','LEC','LCS','LCP'];
 for(let shift=0;shift<3;shift++){
  const s=E.newGame('T1',800+shift),rank=[...all.slice(shift),...all.slice(0,shift)];s.date='2026-06-27';s.msiSeeds=['T1','GEN'];s.international.fstRanking=rank.map(r=>Object.values(s.teams).find(t=>t.region===r).id);begin2026International(s,'MSI');assert.equal(s.international.msiParticipants.length,11);assert.equal(s.international.msiDirect.length,7);assert.equal(s.international.msiByeRegion,rank.find(r=>r!=='CBLOL'));E.advanceDays(s,5,true);assert.equal(s.matches.filter(m=>m.phase.startsWith('MSI26_PI')).length,6);assert.equal(s.msiBracketTeams.length,8);assert.equal(s.matches.filter(m=>m.phase==='MSI_QF').length,4);
 }
});

test('legacy unfinished second half gains round five once without altering existing fixtures, results or RNG',async()=>{
 const {migrate2026SecondHalf}=await import('../dist/rules2026.js'),s=E.newGame('T1',99);s.date='2026-08-06';s.legend=data.teams.slice(0,5).map(t=>t.id);s.rise=data.teams.slice(5).map(t=>t.id);
 const a=E.roundRobin(s.legend,2),b=E.roundRobin(s.rise,2);E.addPhase(s,'REG34','LCK 정규 3·4라운드',[a.flatMap((r,i)=>[...r,...b[i]])],3,'REGULAR',{start:'2026-07-29'});
 for(const [i,m] of s.matches.entries()){m.date=E.dayAdd('2026-07-29',Math.floor(i/2));if(i<5){m.status='done';m.winner=m.teams[0];m.score=[2,0];}}
 const old=structuredClone(s.matches),rng=s.rng;assert(migrate2026SecondHalf(s));assert.equal(s.rng,rng);assert.equal(s.matches.length,60);assert.equal(s.phase.key,'REG35');
 for(const [i,m] of old.entries())assert.deepEqual({...s.matches[i],phase:m.phase,round:m.round},m);
 assert(s.matches.slice(40).every(m=>m.round==='5라운드'&&m.date>s.date));assert.equal(migrate2026SecondHalf(s),false);assert.equal(s.matches.length,60);
 const counts=new Map();for(const m of s.matches){const key=m.teams.slice().sort().join('|');counts.set(key,(counts.get(key)??0)+1);}assert([...counts.values()].every(n=>n===3));
});
