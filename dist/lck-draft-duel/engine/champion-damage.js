import {DAMAGE_MODELS,TANK_CHAMPIONS,ENGAGE_SUPPORTS,UTILITY_SUPPORTS} from './damage-calibration-2026.js?v=da4ae1c9cc2f';

const tanks = new Set(TANK_CHAMPIONS);
const engageSupports = new Set(ENGAGE_SUPPORTS);
const utilitySupports = new Set(UTILITY_SUPPORTS);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const TIME_AND_TEMPO = [1, 2, 3, 7];

export function damageArchetype(role, champion) {
 if (role !== 'SUP') return tanks.has(champion) ? 'tank' : 'damage';
 if (utilitySupports.has(champion)) return 'utility';
 return engageSupports.has(champion) ? 'engage' : 'poke';
}

function uniform(key) {
 let hash = 2166136261;
 for (let i = 0; i < key.length; i++) hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
 hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b);
 return ((hash ^ (hash >>> 13)) >>> 0) / 4294967296;
}

export function estimateChampionDamage(stats, duration) {
 const minutes = Math.max(1, duration);
 const time = Math.min(minutes, 53) + Math.max(0, minutes - 53) * .65;
 const rate = 32 / minutes;
 const totalKills = stats.reduce((sum, p) => sum + (p.k ?? 0), 0);
 const tempo = Math.log1p(clamp(totalKills * rate, 0, 49) / 18);
 // The scoreboard's variance is reproducible without drawing from match RNG.
 const signature = stats.map(p => [p.player,p.champion,p.gold,p.cs].join(':')).join('|');
 const gameVariation = uniform(signature + '/game');
 return stats.map(p => {
  const model = DAMAGE_MODELS[p.role] ?? DAMAGE_MODELS.MID;
  const group = damageArchetype(p.role, p.champion);
  const inputs = [1, Math.log(time / 32), Math.min(0, Math.log(time / 29)), Math.max(0, Math.log(time / 38)),
   Math.log1p(clamp((p.k ?? 0) * rate, 0, 12) / 2), Math.log1p(clamp((p.d ?? 0) * rate, 0, 9) / 3),
   Math.log1p(clamp((p.a ?? 0) * rate, 0, 22) / 5), tempo];
  const groupBias = model.groups[group] ?? (group === 'tank' ? DAMAGE_MODELS.TOP.groups.tank : 0);
  const expected = inputs.reduce((sum, value, i) => sum + model.weights[i] * value, groupBias + (model.champions[p.champion] ?? 0));
  const spread = model.spread[group] ?? .22;
  const variation = clamp((gameVariation + uniform(signature + '/' + p.player) - 1) * Math.sqrt(6), -1.7, 1.7);
  const ceiling = TIME_AND_TEMPO.reduce((sum,i) => sum + inputs[i] * model.weights[i],
   model.upper[group] ?? (model.upper.damage + groupBias));
  return Math.round(Math.exp(Math.min(expected + spread * variation, ceiling)));
 });
}

export function resultDamageRows(set) {
 const era = set.simulationReplay?.objectiveEra;
 const legacy2026 = (era === 2026 || (era == null && set.patch?.startsWith('16.')))
  && !(set.simulationVersion >= 16) && set.duration > 0 && set.stats.every(p => Number.isFinite(p.k));
 if (!legacy2026) return set.stats;
 const damage = estimateChampionDamage(set.stats, set.duration);
 return set.stats.map((player,i) => ({...player,damage:damage[i]}));
}
