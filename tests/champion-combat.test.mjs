import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {CHAMPION_COMBAT_PROFILES,championCombat,phaseStrength,combatLabels} from '../dist/champion-combat.js';
import {compositionProfile,compositionMatchup} from '../dist/composition.js';
import {compositionProfile as oldProfile} from '../dist/composition-v3.js';
import {simulateMatch as simulateV3} from '../dist/match-sim-v3.js';
import {simulateMatch,replayMatch,battleProbability,matchRandom} from '../dist/match-sim.js';
import {buildTimeline} from '../dist/timeline.js';
const champs=JSON.parse(readFileSync(new URL('../dist/data/season-2026/champions.json',import.meta.url))),map=Object.fromEntries(champs.map(c=>[c.id,c])),roles=['TOP','JGL','MID','BOT','SUP'];
const early=['Renekton','LeeSin','Leblanc','Draven','Pyke'],late=['Kayle','Kindred','Kassadin','Jinx','Sona'];
const picks=ids=>ids.map((champion,i)=>({champion,role:roles[i]}));
const profile=ids=>compositionProfile(picks(ids),map),stats=(ids,team)=>ids.map((champion,i)=>({champion,role:roles[i],team,player:team+roles[i],k:0,d:0,a:0}));
const chance=(a,b,minute,kind='teamfight',extra={})=>battleProbability({minute,compositionGap:compositionMatchup(a,b,minute,kind,extra).gap});
const near=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('all 173 champions have explicit bounded growth, context, snowball, utility and sourced qualitative analyses',()=>{
 assert.deepEqual(Object.keys(CHAMPION_COMBAT_PROFILES).sort(),champs.map(c=>c.id).sort());
 const evidence=JSON.parse(readFileSync(new URL('../research/2026/champion-combat-sources.json',import.meta.url)));assert.equal(evidence.champions.length,173);
 for(const c of champs){const p=CHAMPION_COMBAT_PROFILES[c.id];assert.equal(p.curve.length,5);assert(p.note.length>20);for(const n of [...p.curve,...['skirmish','teamfight','pick','siege','snowball','utility'].map(k=>p[k])])assert(n>=1&&n<=5);const e=evidence.champions.find(e=>e.id===c.id);assert.equal(e.abilities.length,5);assert(e.officialSource.startsWith('https://ddragon.leagueoflegends.com/'));}
});
test('growth distinguishes early fighters, hypercarries, midgame peaks and Caitlyn item trough; interpolation is continuous',()=>{
 assert(phaseStrength('LeeSin',5)>phaseStrength('LeeSin',45));assert(phaseStrength('Kayle',5)<phaseStrength('Kayle',45));assert(phaseStrength('Nasus',24)>phaseStrength('Nasus',45));assert(phaseStrength('Caitlyn',5)>phaseStrength('Caitlyn',24));assert(phaseStrength('Caitlyn',45)>phaseStrength('Caitlyn',24));
 for(const id of Object.keys(CHAMPION_COMBAT_PROFILES))for(const time of [5,14,24,34,45])assert(Math.abs(phaseStrength(id,time-.0001)-phaseStrength(id,time+.0001))<.001);
assert(combatLabels('Sona').includes('후반 성장'));
});
test('early compositions lead early 3v3s while scaling compositions improve late teamfights',()=>{
 const a=profile(early),b=profile(late),top={roles:['TOP','JGL','MID']};assert(chance(a,b,8,'skirmish',top)>.6);assert(chance(a,b,45)<.45);
 assert(chance(a,b,12)>chance(a,b,45));
});
test('duelists and AOE initiators have distinct small-fight and 5v5 value at the same time',()=>{
 assert(championCombat('Fiora',34,'skirmish').score>championCombat('Kennen',34,'skirmish').score);
 assert(championCombat('Fiora',34,'teamfight').score<championCombat('Kennen',34,'teamfight').score);
});
test('identical champions and KDA are neutral, swapping sides complements probabilities and input ordering is irrelevant',()=>{
 const a=profile(early),b=profile(late),bs=stats(early,'B'),rs=stats(late,'R');bs[1].k=4;rs[2].d=3;
 for(const minute of [3,8,20,40,55])for(const kind of ['skirmish','teamfight','siege']){
  near(chance(a,a,minute,kind,{blueStats:bs,redStats:bs}),.5);
  near(chance(a,b,minute,kind,{blueStats:bs,redStats:rs})+chance(b,a,minute,kind,{blueStats:rs,redStats:bs}),1);
 }
 assert.deepEqual(compositionProfile([...picks(early)].reverse(),map),a);
});
test('an absent bot carry and its KDA cannot decide a top-side 3v3; bottom-side fights include that carry',()=>{
 const ids=['Ornn','Sejuani','Orianna','Jinx','Lulu'],a=profile(ids),b=profile(ids),bs=stats(ids,'B'),rs=stats(ids,'R');bs[3].k=9;bs[3].a=4;
 near(chance(a,b,24,'skirmish',{blueStats:bs,redStats:rs,roles:['TOP','JGL','MID']}),.5);
 assert(chance(a,b,24,'dive',{blueStats:bs,redStats:rs,roles:['JGL','BOT','SUP']})>.5);
});
test('better KDA never weakens any champion and deaths never rejuvenate an early champion or unlock late strengths',()=>{
 for(const id of Object.keys(CHAMPION_COMBAT_PROFILES))for(const minute of [5,15,25,40])for(const kind of ['skirmish','teamfight']){
  const base=championCombat(id,minute,kind);let previous=base.score;
  for(const k of [1,3,6,10]){const fed=championCombat(id,minute,kind,{k,d:0,a:2});assert(fed.score>=previous-1e-10,id);previous=fed.score;}
  previous=base.score;for(const d of [1,3,6,10]){const behind=championCombat(id,minute,kind,{k:0,d,a:0});assert(behind.score<=previous+1e-10,id);previous=behind.score;}
 }
});
test('fed carries exploit their advantages more; behind utility champions retain control and assists contribute',()=>{
 const gain=id=>championCombat(id,25,'teamfight',{k:4,d:0,a:2}).performance;
 assert(gain('Draven')>gain('Maokai'));assert(Math.abs(championCombat('Zed',25,'teamfight',{d:5}).performance)>Math.abs(championCombat('Nautilus',25,'teamfight',{d:5}).performance));
 assert(championCombat('Kayle',24,'teamfight',{d:4}).effectiveMinute<24);assert(championCombat('Kayle',24,'teamfight',{k:4,a:2}).effectiveMinute>24);
 assert(championCombat('Lulu',24,'teamfight',{a:12}).score>championCombat('Lulu',24,'teamfight').score);
 assert(championCombat('Nautilus',24,'teamfight',{d:5}).label.includes('CC·지원 가치 유지'));
});
test('equal team gold and kill totals still reward carrying on damage champions instead of allocating all kills to support',()=>{
 const ids=['Ornn','Sejuani','Orianna','Draven','Lulu'],a=profile(ids),b=profile(ids),bs=stats(ids,'B'),rs=stats(ids,'R');bs[3].k=6;
 const carry=chance(a,b,24,'teamfight',{blueStats:bs,redStats:rs});bs[3].k=0;bs[4].k=6;const utility=chance(a,b,24,'teamfight',{blueStats:bs,redStats:rs});assert(carry>utility+.005);
});
test('actual event probabilities use only pre-fight individual KDA and match participating roles',()=>{
 const bs=stats(early,'B'),rs=stats(late,'R'),input={blue:'B',red:'R',bluePower:80,redPower:80,compositionBlue:profile(early),compositionRed:profile(late),roster:[...bs,...rs]};
 const out=simulateMatch(input,matchRandom(19)),counts=Object.fromEntries([...bs,...rs].map(p=>[p.player,{...p}]));let checked=0,personal=0;
 for(const e of out.events){
  if(Number.isFinite(e.championPhaseGap)){
   const c=compositionMatchup(input.compositionBlue,input.compositionRed,e.minute,e.kind,{blueStats:Object.values(counts).filter(p=>p.team==='B'),redStats:Object.values(counts).filter(p=>p.team==='R'),roles:e.roles});
   near(e.championPhaseGap,c.phaseGap);near(e.championFormGap,c.formGap);checked++;
   if(e.championFormImpact){const [side,id,k,d,a]=e.championFormImpact,p=Object.values(counts).find(p=>p.champion===id&&p.team===(side==='blue'?'B':'R'));assert.deepEqual([k,d,a],[p.k,p.d,p.a]);if(e.roles)assert(e.roles.includes(p.role));personal++;}
  }
  for(const kill of e.kills){counts[kill.killer].k++;counts[kill.victim].d++;for(const id of kill.assists)counts[id].a++;}
 }
 assert(checked>5);assert(personal>2);assert.deepEqual(out,replayMatch({...input,model:'event-v13',seed:19}));
});
test('event-v3 replay retains archived composition rules, KDA and gold after the v4 upgrade',()=>{
 const bp=oldProfile(picks(early),map),rp=oldProfile(picks(late),map),input={blue:'B',red:'R',bluePower:80,redPower:80,compositionBlue:bp,compositionRed:rp,roster:[...stats(early,'B'),...stats(late,'R')]};
 const old=simulateV3(input,matchRandom(31));const digest=createHash('sha256').update(JSON.stringify(old)).digest('hex');assert.equal(digest,'8697a7f479a826850708e3e74400ccf40f215c91e985a5710164c394f5c94534');
 assert.deepEqual(replayMatch({...input,model:'event-v3',seed:31}),old);
 const set={...old,number:1,blue:'B',red:'R',picks:[...picks(early),...picks(late)],simulationVersion:3,events:[],simulationReplay:{...input,model:'event-v3',seed:31}};
 const timeline=buildTimeline(set);assert.deepEqual(timeline.map(e=>e.gold),old.events.map(e=>e.gold));assert.deepEqual(timeline.at(-1).gold,old.finalGold);
});
