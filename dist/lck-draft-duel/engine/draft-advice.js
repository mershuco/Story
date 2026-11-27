import {draftMetaCandidates} from './draft-meta.js?v=345ebe2e4f45';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const normalize=s=>String(s??'').toLowerCase();
// A smoothed evidence score, never a prediction of match win probability.
export function draftAdvice(view,role,{champions,available,mastery=()=>48,player='',kind='pick',allies=[],opponents=[],set=1,limit=4}){
 const aggregate=new Map(),get=id=>{if(!aggregate.has(id))aggregate.set(id,{picks:0,wins:0,weighted:0,weightedWins:0,bans:0,setBans:0,setPicks:0,playerPicks:0,pairs:0,pairWins:0,duels:0,duelWins:0});return aggregate.get(id);};
 let weightTotal=0;
 for(const game of view.records??[]){
  const weight=view.allSeason||game.patch===view.patch?1:.3;weightTotal+=weight;
  for(const id of game.bans??[]){const c=get(id);c.bans+=weight;if(game.set===set)c.setBans+=weight;}
  for(let side=0;side<2;side++)for(const [id,position,name,won] of game.lineups[side]){
   if(position!==role)continue;const c=get(id);c.picks++;c.wins+=won;c.weighted+=weight;c.weightedWins+=weight*won;
   if(game.set===set)c.setPicks+=weight;if(normalize(name)===normalize(player))c.playerPicks+=weight;
   const friendly=kind==='ban'?opponents:allies,enemy=kind==='ban'?allies:opponents;
   const partners=game.lineups[side].filter(([cid])=>friendly.includes(cid));
   c.pairs+=partners.length*weight;c.pairWins+=partners.length*weight*won;
   const matchup=game.lineups[1-side].find(([cid,r])=>r===role&&enemy.includes(cid));
   if(matchup){c.duels+=weight;c.duelWins+=weight*won;}
  }
 }
 const pool=draftMetaCandidates(view,role,{champions,available,rank:mastery,limit:champions.length});
 const ranked=pool.map(ch=>{
  const e=aggregate.get(ch.id)??{picks:0,wins:0,weighted:0,weightedWins:0,bans:0,setBans:0,setPicks:0,playerPicks:0,pairs:0,pairWins:0,duels:0,duelWins:0};
  const comfort=clamp((mastery(ch.id)-48)*.15,-5,8),sample=e.weighted/(e.weighted+8),strength=((e.weightedWins+4)/(e.weighted+8)-.5)*12;
  const phase=(e.setPicks+e.setBans*.5)/Math.max(1,e.weighted+e.bans*.5)*5,playerBonus=e.playerPicks/(e.playerPicks+5)*5;
  const synergy=(e.pairWins-e.pairs*.5)/(e.pairs+8)*8,counter=(e.duelWins-e.duels*.5)/(e.duels+8)*12;
  const score=(ch.estimated?0:ch.score*.65)+(e.weighted*30+e.bans*12)/Math.max(1,weightTotal)+sample*3+strength+phase+comfort+playerBonus+synergy+counter;
  const reasons=[];if(e.setBans)reasons.push(`${set}세트 밴 관측`);if(e.setPicks)reasons.push(`${set}세트 관측`);if(e.playerPicks)reasons.push(`${player} 사용 기록`);if(e.pairs)reasons.push('현재 조합 동반 기록');if(e.duels)reasons.push('같은 라인 맞대결 기록');
  return {...ch,score,advice:{kind,score:Math.round(score*10)/10,picks:e.picks,wins:e.wins,mastery:mastery(ch.id),reasons,synergy,counter}};
 });
 // Observed candidates stay ahead of estimates, without inventing tournament OP labels.
 ranked.sort((a,b)=>Number(!!a.estimated)-Number(!!b.estimated)||b.score-a.score||a.id.localeCompare(b.id));
 return ranked.slice(0,limit);
}
