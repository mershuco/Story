// Controlled game-model examples, never real champion win-rate measurements.
import{readFileSync,writeFileSync}from'node:fs';
import{compositionProfile,compositionMatchup}from'../dist/composition.js';
import{simulateMatch,matchRandom,battleProbability,SIMULATION_MODEL}from'../dist/match-sim.js';
const cs=JSON.parse(readFileSync(new URL('../dist/data/season-2026/champions.json',import.meta.url))),map=Object.fromEntries(cs.map(c=>[c.id,c])),roles=['TOP','JGL','MID','BOT','SUP'];
const early=['Renekton','LeeSin','Leblanc','Draven','Pyke'],late=['Kayle','Kindred','Kassadin','Jinx','Sona'],balanced=['Ornn','Sejuani','Orianna','Jinx','Lulu'],duel=['Fiora','MasterYi','Zed','Vayne','Pyke'];
const profile=ids=>compositionProfile(ids.map((champion,i)=>({champion,role:roles[i]})),map),roster=(ids,team)=>ids.map((champion,i)=>({team,role:roles[i],player:team+roles[i],champion,k:0,d:0,a:0}));
const a=profile(early),b=profile(late);
const timeline=[{minute:8,kind:'skirmish',roles:roles.slice(0,3)},{minute:12,kind:'teamfight'},{minute:24,kind:'teamfight'},{minute:40,kind:'skirmish',roles:roles.slice(0,3)},{minute:45,kind:'teamfight'}].map(x=>{const c=compositionMatchup(a,b,x.minute,x.kind,{roles:x.roles});return{...x,earlyTeamChance:battleProbability({minute:x.minute,compositionGap:c.gap}),phaseGap:c.phaseGap,compositionGap:c.gap};});
const ids=['Ornn','Sejuani','Orianna','Draven','Lulu'],p=profile(ids),kdaExamples=[];
for(const [name,role,k,d,a]of[['neutral','BOT',0,0,0],['fedCarry','BOT',6,0,2],['behindCarry','BOT',0,5,1],['fedSupport','SUP',6,0,2],['behindSupport','SUP',0,5,1]]){
 const bs=roster(ids,'B'),rs=roster(ids,'R');Object.assign(bs.find(p=>p.role===role),{k,d,a});const c=compositionMatchup(p,p,24,'teamfight',{blueStats:bs,redStats:rs});kdaExamples.push({name,minute:24,champion:bs.find(p=>p.role===role).champion,k,d,a,equalGoldChance:battleProbability({minute:24,compositionGap:c.gap}),personalFormGap:c.formGap});
}
const scenarios=[];
for(const [name,left,right]of[['earlyVsScaling',early,late],['duelVsTeamfight',duel,balanced],['mirror',balanced,balanced]]){
 const input={blue:'B',red:'R',bluePower:80,redPower:80,compositionBlue:profile(left),compositionRed:profile(right),roster:[...roster(left,'B'),...roster(right,'R')]},trials=400;let blueWins=0,comebacks6000=0,minutes=0;
 for(let seed=1;seed<=trials;seed++){const out=simulateMatch(input,matchRandom(seed));blueWins+=out.winner==='B';comebacks6000+=out.comeback.winnerMaxDeficit>=6000;minutes+=out.duration;}
 scenarios.push({name,blue:left,red:right,trials,blueWins,blueWinRate:blueWins/trials,comebacks6000,averageMinutes:minutes/trials});
}
const report={model:SIMULATION_MODEL,method:'Explicit kit-v1 estimates. Equal player strength; controlled probability examples also hold team gold/buffs equal. Full simulations include evolving gold and actual pre-fight KDA; seeds 1..400 each. These are synthetic game results, not real LoL win rates.',timeline,kdaExamples,scenarios};
writeFileSync(new URL('../qa/champion-combat-balance-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
