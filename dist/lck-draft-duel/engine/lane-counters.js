import {VSCHAMP_LANE_DATA} from './vschamp-lane-data.js?v=345ebe2e4f45';

export const LANE_ROLES = {top: ['TOP'], mid: ['MID'], bot: ['BOT', 'SUP']};
const GRADE = [0, .52, 1];

// Positive is an advantage for the first player. Opposing entries can cancel.
export function championLaneCounter(player, opponent) {
 const left = player.role + ':' + player.champion;
 const right = opponent.role + ':' + opponent.champion;
 const tier = key => GRADE[VSCHAMP_LANE_DATA[key] ?? 0];
 return tier(right + '>' + left) - tier(left + '>' + right);
}

export function laneCounterEdge(s, lane) {
 if (!(s.version >= 18)) return 0;
 const roles = LANE_ROLES[lane];
 const onLane = (team, role) => s.stats.find(p => p.team === team && p.role === role);
 let edge = 0;
 for (const blueRole of roles) {
  const blue = onLane(s.teams[0], blueRole);
  if (!blue) continue;
  for (const redRole of roles) {
   const red = onLane(s.teams[1], redRole);
   if (!red) continue;
   const weight = lane !== 'bot' ? 1 : blueRole !== redRole ? .30 : blueRole === 'BOT' ? .64 : .42;
   edge += weight * championLaneCounter(blue, red);
  }
 }
 return Math.max(-1, Math.min(1, edge));
}
