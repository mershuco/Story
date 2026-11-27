import {championCombatProfile, phaseStrength} from './champion-combat.js';
import {activeChampionSynergies} from './champion-synergy.js';

export const LANING_END = 15;
export const LANE_ROLES = {top: ['TOP'], mid: ['MID'], bot: ['BOT', 'SUP']};
const ROLE_LANE = {TOP: 'top', MID: 'mid', BOT: 'bot', SUP: 'bot'};
const EARLY_CS = {TOP: 10.7, JGL: 8.65, MID: 11.25, BOT: 11.15, SUP: 1.6};
const LATE_CS = {TOP: 8.1, JGL: 6.55, MID: 8.9, BOT: 10, SUP: .62};
const ROLE_DAMAGE = {TOP: 606, JGL: 444, MID: 649, BOT: 745, SUP: 210};
const LEGACY_LANE_KILL_RATE = {top: .017, mid: .01, bot: .036};
// Targets 35% top, 20% mid and 50% bot for either team to score before 15 minutes.
const LANE_KILL_RATE = {top: .0305, mid: .018, bot: .0565};
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const logistic = n => 1 / (1 + Math.exp(-n));
const form = p => Math.tanh((p.k + .4 * p.a - 1.05 * p.d) / 2.5);
const profile = (s, p) => s.input.playerProfiles?.[p.player] ?? {};
const alive = (s, p) => (s.respawnAt[p.player] ?? 0) <= s.clock;

function pressure(s, p) {
 const role = profile(s, p);
 const rating = role.rating ?? 75;
 return rating + (role.mastery ?? 50) * .085 + (role.csDiff ?? 0) * .24
  + (phaseStrength(p.champion, s.clock) - 3) * (p.role === 'JGL' ? 3.8 : 5.4)
  + form(p) * 3.5 + (s.laneForm?.[p.player] ?? 0);
}

export function lanePressure(s, lane) {
 const players = s.stats.filter(p => LANE_ROLES[lane].includes(p.role));
 const rating = id => players.filter(p => p.team === id).reduce((total, p) => {
  const weight = p.role === 'SUP' ? .39 : lane === 'bot' ? .61 : 1;
  return total + pressure(s, p) * weight;
 }, 0);
 return rating(s.teams[0]) - rating(s.teams[1]);
}

export function laningFarmRate(s, p, from) {
 const opponent = s.stats.find(q => q.team !== p.team && q.role === p.role);
 const early = clamp((LANING_END - from) / Math.max(.001, s.clock - from), 0, 1);
 const earlyRate = EARLY_CS[p.role] ?? 8.4, lateRate = LATE_CS[p.role] ?? 8.4;
 const lane = ROLE_LANE[p.role];
 const phase = phaseStrength(p.champion, s.clock);
 const matchup = opponent ? pressure(s, p) - pressure(s, opponent) : 0;
 const laneDiff = lane ? lanePressure(s, lane) * (p.team === s.teams[0] ? 1 : -1) : matchup;
 const advantage = clamp(matchup * .0044 + laneDiff * .0025 + form(p) * .08, -.21, .16);
 const macro = s.macros[s.teams.indexOf(p.team)];
 const recovery = 1 + clamp(form(p) * (p.role === 'BOT' ? .18 : .1) + (phase - 3) * .025
  + (macro.split - .55) * .13, -.24, .23);
 const laneRate = earlyRate * (1 + advantage);
 return early * laneRate + (1 - early) * lateRate * recovery;
}

export function localFightChance(s, lane, participants, attacker = null) {
 const [blue, red] = s.teams, owner = attacker === blue ? 1 : attacker === red ? -1 : 0;
 const jungler = s.stats.find(p => p.team === attacker && p.role === 'JGL');
 const lanePlayers = s.stats.filter(p => LANE_ROLES[lane].includes(p.role));
 const gold = id => lanePlayers.filter(p => p.team === id).reduce((n, p) => n + p.gold, 0);
 const jungleImpact = jungler ? 1 + (phaseStrength(jungler.champion, s.clock) - 3) * .16
  + (championCombatProfile(jungler.champion).pick - 3) * .09 + clamp((pressure(s, jungler) - 85) * .012, -.25, .25) : 0;
 const numbers = participants[blue].length - participants[red].length - owner;
 const synergy = id => activeChampionSynergies(participants[id].map(p => [p.champion, p.role]), s.clock,
  attacker ? 'gank' : 'skirmish').score;
 return clamp(logistic(lanePressure(s, lane) * .063 + clamp((gold(blue) - gold(red)) / 1800, -.65, .65)
  + owner * jungleImpact + numbers * .7 + (synergy(blue)-synergy(red)) * .11), .09, .91);
}

function entriesForLane(s, lane) {
 const [blue, red] = s.teams, roles = LANE_ROLES[lane];
 const participants = Object.fromEntries(s.teams.map(id => [id, s.stats.filter(p => p.team === id && roles.includes(p.role) && alive(s, p))]));
 if (s.teams.some(id => participants[id].length !== roles.length)) return [];
 const players = [...participants[blue], ...participants[red]];
 const activity = players.reduce((n, p) => n + (profile(s, p).activity ?? 0), 0) / players.length;
 const kits = players.reduce((n, p) => n + phaseStrength(p.champion, s.clock) + championCombatProfile(p.champion).skirmish - 6, 0) / players.length;
 const aggression = clamp(1 + activity * .31 + kits * .14
  + Math.abs(lanePressure(s, lane)) * .035, .55, 2.25);
 const blueChance = localFightChance(s, lane, participants);
 const base = (s.version >= 17 ? LANE_KILL_RATE : LEGACY_LANE_KILL_RATE)[lane];
 const snowball = id => {
  const since = s.clock - (s.duoKillAt?.[id] ?? -Infinity);
  return lane === 'bot' && since < 4 ? 1 + .16 * (1 - since / 4) : 1;
 };
 const fights = s.teams.map(id => ({
  lane, participants, attacker: id, kind: lane === 'bot' ? 'duo-kill' : 'solo-kill',
  rate: base * aggression * (id === blue ? blueChance : 1 - blueChance) * snowball(id),
 }));
 for (const id of s.teams) {
  const jungle = s.stats.find(p => p.team === id && p.role === 'JGL');
  if (!jungle || !alive(s, jungle)) continue;
  const style = profile(s, jungle), kit = championCombatProfile(jungle.champion);
  const activity = clamp(1 + (style.activity ?? 0) * .3 + (kit.pick - 3) * .14
   + (phaseStrength(jungle.champion, s.clock) - 3) * .16, .55, 1.8);
  const gankers = {...participants, [id]: [...participants[id], jungle]};
  const laneOdds = localFightChance(s, lane, gankers, id);
  const success = id === blue ? laneOdds : 1 - laneOdds;
  fights.push({kind: 'gank', lane, participants: gankers, attacker: id,
   rate: ({top: .042, mid: .051, bot: .066}[lane] / 2) * activity * (.6 + .55 * success)});
 }
 return fights;
}

export function laneEvent(s, elapsed, rng) {
 const events = Object.keys(LANE_ROLES).flatMap(lane => entriesForLane(s, lane));
 const active = id => s.stats.filter(p => p.team === id && alive(s, p)).length >= 3;
 if (s.teams.every(active)) {
  // River movements and roaming skirmishes account for the remaining early kills.
  const rate = .086 * (.7 + .45 * (s.macros[0].aggression + s.macros[1].aggression));
  for (const [lane, share] of [['top', .29], ['mid', .35], ['bot', .36]]) events.push({kind: 'skirmish', lane, rate: rate * share});
 }
 const total = events.reduce((n, e) => n + e.rate, 0);
 if (rng() >= 1 - Math.exp(-total * elapsed)) return null;
 let roll = rng() * total;
 return events.find(event => (roll -= event.rate) <= 0) ?? events.at(-1);
}

export function dragonLaneControl(s) {
 const [blue, red] = s.teams;
 const available = id => s.stats.some(p => p.team === id && p.role === 'JGL' && alive(s, p));
 const bot = id => s.stats.find(p => p.team === id && p.role === 'BOT');
 const lane = lanePressure(s, 'bot') + .3 * lanePressure(s, 'mid');
 const gold = (bot(blue)?.gold ?? 0) - (bot(red)?.gold ?? 0);
 const cs = (bot(blue)?.cs ?? 0) - (bot(red)?.cs ?? 0);
 const botAvailable = id => s.stats.filter(p => p.team === id && LANE_ROLES.bot.includes(p.role) && alive(s, p)).length;
 const map = lane * .055 + gold * .00032 + cs * .012 + (botAvailable(blue) - botAvailable(red)) * .7;
 const blueReady = available(blue), redReady = available(red);
 const blueChance = blueReady && redReady ? clamp(logistic(map), .12, .88) : Number(blueReady);
 return {blueReady, redReady, blueChance, concessionChance: clamp(.19 + Math.abs(map) * .22, .19, .68)};
}

export function damageRate(s, p) {
 const base = profile(s, p).dpm ?? ROLE_DAMAGE[p.role] ?? 500;
 const phase = phaseStrength(p.champion, s.clock);
 const kitFactor = clamp(1 + (phase - 3) * .12, .78, 1.23);
 const opponent = s.stats.find(q => q.role === p.role && q.team !== p.team);
 const wealth = clamp((p.gold - (opponent?.gold ?? p.gold)) / 12000, -.2, .2);
 return base * kitFactor * (1 + wealth + .1 * form(p));
}

export function addFightDamage(s, pools, kills, kind) {
 const involved = Object.values(pools).flat(), small = ['solo-kill', 'duo-kill', 'gank', 'skirmish', 'dive'].includes(kind);
 for (const p of involved) {
  const lastHits = kills.filter(k => k.killer === p.player).length;
  const assists = kills.filter(k => k.assists.includes(p.player)).length;
  const exposure = small ? .65 : 1.05;
  const participation = exposure + lastHits * .46 + assists * .19;
  p.damage += damageRate(s, p) * participation;
 }
}
