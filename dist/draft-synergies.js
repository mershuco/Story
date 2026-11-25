import {CHAMPION_SYNERGIES, championSynergy, synergyKey} from './champion-synergy.js';

export function observedSynergies(records) {
 const pairs = new Map();
 for (const game of records) {
  for (const lineup of game.lineups) {
   for (let i = 0; i < lineup.length; i++) {
    for (let j = i + 1; j < lineup.length; j++) {
     const champions = [lineup[i][0], lineup[j][0]].sort();
     const key = synergyKey(...champions);
     if (!pairs.has(key)) pairs.set(key, { key, champions, games: 0, wins: 0 });
     const pair = pairs.get(key);
     pair.games++;
     pair.wins += lineup[i][3];
    }
   }
  }
 }
 return pairs;
}

export function draftSynergies(records, {mode = 'skills', champion = '', picked = [], available = () => true} = {}) {
 const observed = observedSynergies(records);
 const source = mode === 'observed' ? [...observed.values()] : CHAMPION_SYNERGIES;
 const rows = source.filter(pair => !champion || pair.champions.includes(champion)).map(pair => {
  const record = observed.get(pair.key);
  const skill = championSynergy(pair.key);
  const have = pair.champions.filter(id => picked.includes(id)).length;
  const playable = pair.champions.every(id => picked.includes(id) || available(id));
  return { key:pair.key, champions:pair.champions, skill, have, playable,
   games:record?.games ?? 0, wins:record?.wins ?? 0 };
 });
 return rows.sort((a,b) => Number(b.playable)-Number(a.playable) || b.have-a.have ||
  b.games-a.games || (b.skill?.strength??0)-(a.skill?.strength??0) || a.key.localeCompare(b.key));
}
