// Reproducible game-policy audit, not observed professional drafting statistics.
import{readFileSync,writeFileSync}from'node:fs';import*as E from'../dist/engine.js';
E.configure(Object.fromEntries(['teams','players','champions','mastery','meta','international','season'].map(k=>[k,JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${k}.json`,import.meta.url)))])));
const results=Array.from({length:5},(_,i)=>({set:i+1,drafts:0,openedAtFirstPick:0,counterProtectionBans:0,intendedTargetsAcquired:0,openingBanViolations:0,fearlessViolations:0}));
for(let seed=1;seed<=20;seed++){
 const s=E.newGame('T1',seed*71),m={id:`opening-audit-${seed}`,competition:'CUP',teams:['T1','GEN'],sets:[],score:[0,0]};
 for(let set=1;set<=5;set++){
  const d=E.newDraft(s,m),r=results[set-1];while(d.step<6)E.autoOne(s,d);const plan=d.aiOpeningPlan;r.drafts++;
  const opened=[...(plan?.openings??[])];r.openedAtFirstPick+=opened.filter(id=>E.legalChampions(s,d).some(c=>c.id===id)).length;r.counterProtectionBans+=d.history.filter(h=>h.protects).length;r.openingBanViolations+=opened.filter(id=>[...d.bans.blue,...d.bans.red].includes(id)).length;
  const intended=plan?{...plan.designated}:{};E.completeDraft(s,d);for(const side of['blue','red'])r.intendedTargetsAcquired+=d.picks[side].some(p=>p.champion===intended[side]);
  const picks=[...d.picks.blue,...d.picks.red];r.fearlessViolations+=picks.filter(p=>d.used.includes(p.champion)).length;m.sets.push({picks,loser:set%2?'GEN':'T1'});
 }
}
const report={draftPolicy:'protected-power-v2',objectiveChoiceDeficit:E.OBJECTIVE_CHOICE_DEFICIT,method:'20 seeded full BO5 draft sequences, both teams automated. Openness reflects current available meta/comfort power picks. Counter relationships are qualitative kit-based game estimates, not matchup win-rate data.',results};writeFileSync(new URL('../qa/draft-opening-policy-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
