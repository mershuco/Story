// Reproducible simulator calibration, not a prediction of realLCK outcomes.
import {simulateMatch,matchRandom} from '../dist/match-sim.js';
const roster=['BLUE','RED'].flatMap(team=>['TOP','JGL','MID','BOT','SUP'].map(role=>({team,role,player:team+'-'+role,champion:team+'-'+role})));
const trials=2000,scenarios=[];
for(const powerGap of [0,8,-8,15]){
 const r={powerGap,trials,blueWins:0,redWins:0,winnerTrailed3000:0,winnerTrailed6000:0,leadChanges:0,baronSteals:0,largestWinningDeficit:0,totalMinutes:0};
 for(let seed=1;seed<=trials;seed++){
  const game=simulateMatch({blue:'BLUE',red:'RED',bluePower:80+powerGap,redPower:80,roster},matchRandom(seed));r[game.winner==='BLUE'?'blueWins':'redWins']++;r.winnerTrailed3000+=game.comeback.winnerMaxDeficit>=3000;r.winnerTrailed6000+=game.comeback.winnerMaxDeficit>=6000;r.leadChanges+=game.comeback.leadChanges;r.baronSteals+=game.events.filter(e=>e.objective?.steal).length;r.largestWinningDeficit=Math.max(r.largestWinningDeficit,game.comeback.winnerMaxDeficit);r.totalMinutes+=game.duration;
 }
 r.blueWinRate=r.blueWins/trials;r.comeback6000Rate=r.winnerTrailed6000/trials;r.averageMinutes=r.totalMinutes/trials;delete r.totalMinutes;scenarios.push(r);
}
console.log(JSON.stringify({model:'event-v2',method:'Synthetic five-role squads;seeds1..2000 ineachpowergap scenario. Game-balance calibration,notofficialLoL orrealLCKwinrates.',scenarios},null,2));
