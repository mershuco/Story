// Reproducible synthetic regression, not observed LCK economy statistics.
import{writeFileSync}from'node:fs';
import * as previous from '../dist/match-sim-v9.js';import * as current from '../dist/match-sim-v10.js';
const roles=['TOP','JGL','MID','BOT','SUP'],roster=['B','R'].flatMap(team=>roles.map(role=>({team,role,player:team+role,champion:role==='JGL'?'LeeSin':'Annie'}))),input={blue:'B',red:'R',bluePower:80,redPower:80,roster};
const trials=400,scenarios=[];
for(const engine of [previous,current]){
 let trades=0,broken=0,tradeGold=0,resources=0,bothNine=0,minutes=0,maxMinutes=0,sourceErrors=0,maxResource=0;const examples=[];
 for(let seed=1;seed<=trials;seed++){
  const out=engine.simulateMatch(input,engine.matchRandom(seed));minutes+=out.duration;maxMinutes=Math.max(maxMinutes,out.duration);const final=out.events.at(-1);bothNine+=final.rift.towers.B>=9&&final.rift.towers.R>=9;
  for(const e of out.events){
   if(e.kind==='trade-push'){trades++;broken+=e.push.structures.some(b=>b.destroyed);tradeGold+=Object.values(e.tradeGold).reduce((a,b)=>a+b,0);if(e.sideResources){resources+=e.sideResources.gold;maxResource=Math.max(maxResource,e.sideResources.gold);}}
   if(e.rift.economy)for(const id of ['B','R'])sourceErrors+=Object.values(e.rift.economy[id]).reduce((a,b)=>a+b,0)!==e.gold[id];
   if(examples.length<4&&e.minute>=28&&e.minute<29&&Math.abs(e.score.B-e.score.R)>=15&&e.rift.towers.B===2&&e.rift.towers.R===0)examples.push({seed,minute:e.minute,score:e.score,towers:e.rift.towers,goldLead:e.lead,...(e.rift.economy?{income:e.rift.economy}:{})});
  }
 }
 scenarios.push({model:engine.SIMULATION_MODEL,trials,trades,tradeTowerTakeRate:broken/trades,averageTotalTradeIncome:tradeGold/trades,averageAdditionalResources:engine===current?resources/trades:null,maximumAdditionalResources:engine===current?maxResource:null,bothTeamsAtLeastNineTowers:bothNine,averageMinutes:minutes/trials,maxMinutes,incomeReconciliationErrors:sourceErrors,examples});
}
const report={method:'Equal-strength synthetic five-role teams, seeds 1..400 per version. RNG trajectories diverge when rules change; this is not a matched-outcome causal estimate or LCK statistic.',scenarios};
writeFileSync(new URL('../qa/economy-balance-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(scenarios.map(({examples,...s})=>({...s,example:examples[0]&&{seed:examples[0].seed,minute:examples[0].minute,score:examples[0].score,towers:examples[0].towers,goldLead:examples[0].goldLead}}))));
