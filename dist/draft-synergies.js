import {CHAMPION_SYNERGIES, synergyKey} from './champion-synergy.js';

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

const MIN_META_SETS = 8;
const RECOMMENDATION_LIMIT = 12;

// Broad protection or poke alone does not qualify. These pairs add a named skill interaction.
const championSpecificMechanics = new Map([
 ['Jinx+Lulu', '룰루 W의 공격 속도와 E의 보호막·픽스가 징크스의 연속 기본 공격을 돕습니다.'],
 ['KogMaw+Lulu', '코그모가 W로 사거리를 늘릴 때 룰루 W의 공격 속도와 E의 픽스가 기본 공격을 보강합니다.'],
 ['KogMaw+Milio', '코그모 W와 밀리오 W의 사거리 증가가 겹쳐 먼 거리에서 기본 공격을 이어갈 수 있습니다.'],
 ['Aphelios+Thresh', '쓰레쉬 랜턴으로 아펠리오스가 이동기 없이도 딜 위치를 다시 잡을 수 있습니다.'],
 ['Senna+TahmKench', '탐 켄치가 위기에 처한 세나를 삼켜 지키고 세나는 거리 밖에서 지원 사격을 이어갑니다.'],
 ['Milio+Yunara', '유나라가 기본 공격을 강화할 때 밀리오 W로 사거리를 더 확보하고 E로 보호받습니다.'],
 ['Lulu+Yunara', '룰루 W로 유나라의 강화 기본 공격 속도를 높이고 E로 픽스의 후속 피해를 보탭니다.'],
 ['Lulu+Twitch', '룰루 W와 E로 트위치가 은신 기습 후 강화 기본 공격을 빠르게 잇도록 돕습니다.'],
 ['Milio+Smolder', '밀리오 W가 스몰더의 기본 공격 사거리를 늘리고 E 보호막과 이동 속도로 이탈을 돕습니다.']
]);

function verifiedSkill(skill) {
 const description = championSpecificMechanics.get(skill.key);
 if (description) return {...skill, description};
 if (skill.style === 'protect' || (skill.style === 'poke' && !skill.champions.includes('Jhin'))) return null;
 return skill;
}

function metaRoles(records) {
 const roles = new Map(), openingPresence = new Map();
 const opening = records.filter(game => game.set === 1);
 for (const game of opening) {
  for (const id of new Set([...game.bans, ...game.lineups.flat().map(([id]) => id)])) {
   openingPresence.set(id, (openingPresence.get(id) ?? 0) + 1);
  }
 }
 for (const game of records) {
  for (const [id, role] of game.lineups.flat()) {
   if (!roles.has(id)) roles.set(id, new Map());
   const counts = roles.get(id);
   counts.set(role, (counts.get(role) ?? 0) + 1);
  }
 }
 const relevant = new Map();
 for (const [id, counts] of roles) {
  const presence = opening.length ? (openingPresence.get(id) ?? 0) / opening.length : 0;
  const lanes = [];
  const threshold = opening.length >= 4 && presence >= .20 ? .045 : .07;
  for (const [role, games] of counts) {
   const pickShare = games / (records.length * 2);
   if (games >= 2 && pickShare >= threshold) lanes.push({role, pickShare, presence});
  }
  relevant.set(id, lanes);
 }
 return relevant;
}

function compatibleRoles(skill, first, second) {
 if (first === second) return false;
 // The shared lane is part of the itemized protection, pact and early-trade recommendations.
 if (['lane', 'laneControl', 'bond', 'protect', 'poke'].includes(skill.style)) {
  return [first, second].includes('BOT') && [first, second].includes('SUP');
 }
 return true;
}

export function draftSynergies(view, {picked = [], available = () => true} = {}) {
 const currentPatch = view.records.filter(game => game.patch === view.patch);
 const patchSample = currentPatch.length >= MIN_META_SETS;
 const records = patchSample ? currentPatch : view.records;
 const result = {rows: [], games: records.length, patchSample, sufficient: records.length >= MIN_META_SETS};
 if (!result.sufficient) return result;

 const eligible = metaRoles(records);
 const candidates = [];
 for (const entry of CHAMPION_SYNERGIES) {
  const skill = verifiedSkill(entry);
  if (!skill || !skill.champions.every(id => picked.includes(id) || available(id))) continue;
  const [first, second] = skill.champions;
  let best = null;
  for (const a of eligible.get(first) ?? []) {
   for (const b of eligible.get(second) ?? []) {
    if (!compatibleRoles(skill, a.role, b.role)) continue;
    const metaFit = Math.sqrt(a.pickShare * b.pickShare);
    const score = skill.strength * (.35 + metaFit) + .12 * (a.presence + b.presence);
    if (!best || score > best.score) best = {roles: [a.role, b.role], score};
   }
  }
  if (best) candidates.push({...best, skill, have: skill.champions.filter(id => picked.includes(id)).length});
 }
 candidates.sort((a,b) => b.have-a.have || b.score-a.score || a.skill.key.localeCompare(b.skill.key));

 const observed = observedSynergies(view.records);
 result.rows = candidates.slice(0, RECOMMENDATION_LIMIT).map(({skill,roles,have}) => {
  const record = observed.get(skill.key);
  return {...skill, roles, have, games: record?.games ?? 0, wins: record?.wins ?? 0};
 });
 return result;
}
