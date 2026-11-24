import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {battleProbability,goldInfluence,simulateMatch,matchRandom,replayMatch} from '../dist/match-sim.js';
import {simulateMatch as simulateV2} from '../dist/match-sim-v2.js';
import {compositionProfile,compositionMatchup,compositionLabels} from '../dist/composition.js';
import {buildTimeline} from '../dist/timeline.js';
const champs=JSON.parse(readFileSync(new URL('../dist/data/season-2026/champions.json',import.meta.url))),map=Object.fromEntries(champs.map(c=>[c.id,c]));
const roles=['TOP','JGL','MID','BOT','SUP'];
const profile=ids=>compositionProfile(ids.map((champion,i)=>({champion,role:roles[i]})),map);
const roster=['B','R'].flatMap(team=>roles.map(role=>({team,role,player:team+role,champion:team+role})));
const base={blue:'B',red:'R',bluePower:80,redPower:80,roster};
const approx=(a,b)=>assert(Math.abs(a-b)<1e-10,`${a} != ${b}`);

test('goldalone means6000=75%,12000=90%,moregoldkeepsincreasingtheadvantage',()=>{
 approx(battleProbability({lead:0,minute:20}),.5);approx(battleProbability({lead:6000,minute:20}),.75);approx(battleProbability({lead:-6000,minute:20}),.25);approx(battleProbability({lead:12000,minute:20}),.9);
 let prior=.5;for(const lead of [1000,3000,6000,10000,12000,15000,18000]){const p=battleProbability({lead,minute:20});assert(p>prior);prior=p;approx(p+battleProbability({lead:-lead,minute:20}),1);}
 assert(battleProbability({lead:100000})<=.98);assert(battleProbability({lead:-100000})>=.02);
});
test('strongteamsrecoverbetterfromdeficitsandprotectleadsmorethanweakteams',()=>{
 for(const lead of [-12000,-6000,6000,12000]){
  const strong=battleProbability({lead,powerGap:8,minute:25}),neutral=battleProbability({lead,minute:25}),weak=battleProbability({lead,powerGap:-8,minute:25});assert(strong>neutral&&neutral>weak);
  approx(strong+battleProbability({lead:-lead,powerGap:-8,minute:25}),1);
 }
 const gainAt0=battleProbability({powerGap:8})-.5,gainAt6K=battleProbability({powerGap:8,lead:-6000})-battleProbability({lead:-6000});assert(gainAt6K>gainAt0);
});
test('40+minutes reducegold influencecontinuouslyand symmetrically asitemsconverge',()=>{
 const times=[30,40,45,50,55],ahead=times.map(minute=>battleProbability({lead:6000,minute}));for(let i=1;i<ahead.length;i++)assert(ahead[i]<ahead[i-1]);
 approx(goldInfluence(30),1);approx(goldInfluence(40),.8);approx(goldInfluence(50),.5);approx(goldInfluence(55),.35);
 assert(Math.abs(battleProbability({lead:6000,minute:39.999})-battleProbability({lead:6000,minute:40}))<.0001);
 assert(battleProbability({lead:-6000,minute:50})>battleProbability({lead:-6000,minute:20}));
});
test('balancedfrontline/engage/peel/damage compositioncanoutperformunprotectedphysicalstacking',()=>{
 const balanced=profile(['Ornn','Sejuani','Orianna','Jinx','Lulu']),physical=profile(['Tryndamere','MasterYi','Zed','Draven','Pyke']);assert(balanced.damageBalance>physical.damageBalance);assert(balanced.peel>physical.peel);const result=compositionMatchup(balanced,physical,25);assert(result.gap>0);assert(battleProbability({compositionGap:result.gap,minute:25})>.5);assert(compositionLabels(balanced).includes('딜러 보호'));approx(compositionMatchup(balanced,balanced,25).gap,0);
});
test('engageanswerspoke,protectionanswersdive,andscalingchangesmidvslategamefights',()=>{
 const engage=profile(['Malphite','JarvanIV','Lissandra','Kaisa','Rell']),poke=profile(['Jayce','Nidalee','Zoe','Ezreal','Karma']);assert(compositionMatchup(engage,poke,25).gap>0);
 const scaling=profile(['Kayle','Kindred','Kassadin','Jinx','Sona']),early=profile(['Renekton','Elise','Leblanc','Lucian','Pyke']);const a=compositionMatchup(scaling,early,5).gap,b=compositionMatchup(scaling,early,45).gap;assert(a<0);assert(b>0);assert(b>a);
 const protectedTeam=profile(['Ornn','Sejuani','Azir','Jinx','Lulu']),dive=profile(['Camille','Nocturne','Akali','Kaisa','Pyke']);assert(compositionMatchup(protectedTeam,dive,30).gap>0);
});
test('profileassemblyandmatchups donotdependonpickorder ormapcolor',()=>{
 const picks=['Ornn','Sejuani','Orianna','Jinx','Lulu'].map((champion,i)=>({champion,role:roles[i]})),a=compositionProfile(picks,map),b=compositionProfile([...picks].reverse(),map);for(const key of Object.keys(a)){if(key==='members')assert.deepEqual(a[key],b[key]);else approx(a[key],b[key]);}
 const other=profile(['Renekton','Elise','Leblanc','Lucian','Pyke']);approx(compositionMatchup(a,other,45).gap,-compositionMatchup(other,a,45).gap);
});
test('eventv2seedreplayskeepoldoutcomesandgoldtracesaftereventv3balancechanges',()=>{
 const old=simulateV2(base,matchRandom(93)),saved={...old,blue:'B',red:'R',number:1,simulationVersion:2,picks:roster.map(({player,...p})=>p),events:[],simulationReplay:{...base,model:'event-v2',seed:93}};
 const replay=replayMatch({...base,model:'event-v2',seed:93});assert.deepEqual(replay,old);const timeline=buildTimeline(saved);assert.deepEqual(timeline.map(s=>s.lead),old.events.map(e=>e.lead));assert.deepEqual(timeline.at(-1).gold,old.finalGold);assert.equal(timeline.at(-1).team,old.winner);
});
test('eventv5recordsactualadjustedchancesandcanreconstructallthreeeffectswithoutchangingstate',()=>{
 const params={...base,teamStrengthBlue:84,teamStrengthRed:80,compositionBlue:profile(['Ornn','Sejuani','Orianna','Jinx','Lulu']),compositionRed:profile(['Jayce','Nidalee','Zoe','Ezreal','Karma'])},result=simulateMatch(params,matchRandom(8));assert.equal(result.model,'event-v10');
 const replay=replayMatch({...params,model:'event-v10',seed:8});assert.deepEqual(replay,result);for(const e of result.events.filter(e=>e.combatTeam)){assert(Number.isFinite(e.blueWinProbability));assert.equal(e.goldWeight,goldInfluence(e.minute));assert(Number.isFinite(e.compositionGap));assert.equal(e.teamStrengthGap,4);}
});
