import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as E from '../dist/engine.js';
import {buildAutoDraftMeta} from '../dist/auto-draft-meta.js';

const read = name => JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${name}.json`,import.meta.url)));
const data = Object.fromEntries(['season','teams','players','champions','mastery','meta','international'].map(name => [name,read(name)]));
data.draftMeta = read('draft-meta');
data.masteryRecords = read('mastery-records');
E.configure(data);

function setup(date, competition='CUP', phase='CUP_GROUP', seed=78) {
 const s = E.newGame('T1',seed);
 s.date = date;
 const match = {id:'auto-meta',competition,phase,date,teams:['T1','GEN'],sets:[],score:[0,0]};
 s.matches.push(match);
 return {s,match,d:E.newDraft(s,match)};
}

test('auto drafts use tournament roles even when tournaments share the same patch', () => {
 const source = data.draftMeta.records;
 const regular = buildAutoDraftMeta(source,'LCK_REG34','16.16.1');
 const playoffs = buildAutoDraftMeta(source,'LCK_PLAYOFFS','16.16.1');
 assert.equal(regular.roles.get('Chogath:JGL')?.primary??0,0);
 assert.equal(playoffs.roles.get('Chogath:JGL').primary,9);
 const lateCup = buildAutoDraftMeta(source,'LCK_CUP','16.3.1');
 assert.equal(lateCup.roles.get('Malphite:JGL').primary,1);
 assert.equal(lateCup.roles.has('Malphite:MID'),false);
 const earlyCup = buildAutoDraftMeta(source,'LCK_CUP','16.1.1');
 assert.equal(earlyCup.roles.get('Corki:BOT').picks,14);
});

test('both sides prefer actual roles through a fearless series and keep assignment after the draft', () => {
 for(const [date,competition,phase,event] of [
  ['2026-01-14','CUP','CUP_GROUP','LCK_CUP'],
  ['2026-05-07','REGULAR','REG12','LCK_REG12'],
  ['2026-11-14','WORLDS','WORLD_FINAL','WORLDS']
 ]) {
  const {s,match}=setup(date,competition,phase);
  assert(E.mastery(s,'oner','Viego')>=90);
  for(let set=1;set<=5;set++) {
   const d=E.newDraft(s,match);
   const observed=buildAutoDraftMeta(data.draftMeta.records,event,d.patch);
   while(E.draftTurn(d))E.autoOne(s,d);
   assert([...d.picks.blue,...d.picks.red].every(p=>p.role===null));
   E.autoAssignDraft(s,d);
   const picks=[...d.picks.blue,...d.picks.red];
   assert(E.assignmentsReady(d));
   assert(picks.every(p=>!d.used.includes(p.champion)));
   for(const pick of picks){
    assert(!['Viego:JGL','Corki:MID','Malphite:MID'].includes(pick.champion+':'+pick.role));
    if(set<=3)assert(observed.roles.get(pick.champion+':'+pick.role)?.primary);
   }
   match.sets.push({picks,loser:set%2?'GEN':'T1'});
  }
 }
});

test('the same off-meta pick ranks higher for a player with recent professional experience in that role', () => {
 const {s,d}=setup('2026-01-14');
 while(d.step<6)E.draftAction(s,d,E.legalChampions(s,d).find(c=>c.id!=='Skarner').id);
 const side=E.draftTurn(d).side,team=s.teams[d[side]],find=()=>E.recommendations(s,d,200).find(c=>c.champion==='Skarner');
 team.lineup.JGL='oner';
 const comfort=find();
 assert.equal(comfort.role,'JGL');
 team.lineup.JGL='faker';
 s.masteryGains.faker={Skarner:48};
 assert(comfort.score>find().score+15);
 const meta=E.recommendations(s,d,1)[0];
 assert(meta.score>comfort.score);
});

test('a proven joker remains an automatic pick when the observed options have been spent', () => {
 const {s,d}=setup('2026-01-14');
 d.firstPickSide='red';
 d.step=19;
 d.set=5;
 d.picks.blue=['Ambessa','Ryze','Corki','Braum'].map(champion=>({champion,team:d.blue,role:null}));
 s.teams[d.blue].lineup.JGL='oner';
 d.used=E.legalChampions(s,d).filter(c=>!['Skarner','Viego','MasterYi'].includes(c.id)).map(c=>c.id);
 E.autoOne(s,d);
 assert.equal(d.picks.blue.at(-1).champion,'Skarner');
 E.autoAssignDraft(s,d,'blue');
 assert.equal(d.picks.blue.at(-1).role,'JGL');
});

test('automatic role placement respects Corki bot and existing manual locks on resumed drafts', () => {
 const {s,d}=setup('2026-01-14');
 d.step=20;
 const side=d.blue===s.myTeam?'blue':'red';
 d.picks[side]=['Corki','Ryze','Ambessa','JarvanIV','Braum'].map(champion=>({champion,team:s.myTeam,role:null}));
 delete d.competition;
 delete d.matchPhase;
 E.autoAssignDraft(s,d,side);
 assert.equal(d.picks[side].find(p=>p.champion==='Corki').role,'BOT');
 E.assignChampion(d,side,'Corki','MID');
 for(const pick of d.picks[side])if(pick.champion!=='Corki')pick.role=null;
 E.autoAssignDraft(s,d,side);
 assert.equal(d.picks[side].find(p=>p.champion==='Corki').role,'MID');
});
