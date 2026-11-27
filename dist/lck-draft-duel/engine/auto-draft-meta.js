import {championSynergy,synergyKey} from './champion-synergy.js';

function patchNumber(patch) {
 const [major, minor] = patch.split('.').map(Number);
 return major * 100 + minor;
}

export function buildAutoDraftMeta(records, event, patch) {
 const allSeason=event==='SEASON_ALL';
 const games=allSeason?records:records.filter(game=>game.event===event);
 if (!games.length) return null;
 const patches = [...new Set(games.map(game => game.patch))].sort((a,b) => patchNumber(b) - patchNumber(a));
 const primaryPatch = patches.find(version => patchNumber(version) <= patchNumber(patch)) ?? patches.at(-1);
 const usable = allSeason?games:games.filter(game => patchNumber(game.patch) <= patchNumber(primaryPatch));
 const firstSets = usable.filter(game => (allSeason||game.patch === primaryPatch) && game.set === 1);
 const recordedBans = firstSets.filter(game => game.bans);
 const opening = recordedBans.length >= .6 * firstSets.length ? recordedBans : [];
 const roles = new Map(), champions = new Map(), priority = new Map();
 let weightedGames = 0;
 for (const game of usable) {
  const primary = game.patch === primaryPatch;
  const weight = allSeason||primary ? 1 : .35 ** (patches.indexOf(game.patch) - patches.indexOf(primaryPatch));
  weightedGames += weight;
  for (const [id, role, player] of game.lineups.flat()) {
   const key = id + ':' + role;
   if (!roles.has(key)) roles.set(key, {weighted:0, primary:0, picks:0, bySet:{}, byPlayer:new Map()});
   const row = roles.get(key);
   row.weighted += weight;
   row.primary += Number(primary);
   row.picks++;
   row.bySet[game.set] = (row.bySet[game.set] ?? 0) + weight;
   const name = player.toLowerCase();
   if (!row.byPlayer.has(name)) row.byPlayer.set(name, []);
   row.byPlayer.get(name).push(game.date.slice(5,10));
   champions.set(id, (champions.get(id) ?? 0) + weight);
  }
 }
 for (const game of opening) {
  for (const id of [...game.bans, ...game.lineups.flat().map(([id]) => id)]) {
   priority.set(id, (priority.get(id) ?? 0) + 1 / opening.length);
  }
 }
 const bottomDuos = new Map();
 for (const game of games) for (const lineup of game.lineups) {
  const bot = lineup.find(pick => pick[1] === 'BOT')[0];
  const support = lineup.find(pick => pick[1] === 'SUP')[0];
  const key = bot + ':' + support;
  if (!bottomDuos.has(key)) {
   bottomDuos.set(key, {bot,support,skill:championSynergy(synergyKey(bot,support)),games:0,patchGames:0});
  }
  const duo = bottomDuos.get(key);
  duo.games++;
  if (game.patch === primaryPatch) duo.patchGames++;
 }
 return {roles, champions, priority, weightedGames, openingGames:opening.length,bottomDuos:[...bottomDuos.values()]};
}
