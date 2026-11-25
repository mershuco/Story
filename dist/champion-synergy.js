// Skill interactions reviewed against the Riot Data Dragon 2026 champion kits.
// Weights tune this simulator's composition score. Match records are reported separately.
const pairs = new Map();
export const synergyKey = (first, second) => first < second ? first+'+'+second : second+'+'+first;

function add(champion, partners, label, description, style, strength) {
 for (const partner of partners.split(' ')) {
  const key = synergyKey(champion, partner);
  pairs.set(key, { key, champions: [champion, partner], label, description, style, strength });
 }
}

// Skill families cover the same trigger consistently across champions.
add('Yasuo', 'Alistar Gragas JarvanIV Malphite Maokai Nami Nautilus Ornn Rakan Rell Sejuani Vi MonkeyKing XinZhao Zac Diana Gnar Taliyah', '공중 제어 → 최후의 숨결', '아군의 띄우기나 밀치기에 야스오가 궁극기로 합류합니다.', 'engage', 1.05);
add('Galio', 'JarvanIV Vi Nocturne Rakan Rell Malphite Diana Hecarim Zac Pantheon MonkeyKing', '돌진 → 영웅출현', '먼저 진입한 아군 위치에 갈리오가 착지해 제어를 잇습니다.', 'engage', 1);
add('Orianna', 'Vi JarvanIV Rell Rakan MonkeyKing Malphite Hecarim Zac Diana', '구체 운반 → 충격파', '진입하는 아군에 구체를 붙여 적 진형 안에서 충격파를 맞힐 기회를 만듭니다.', 'engage', 1);
add('MissFortune', 'Amumu Rell Leona Sejuani JarvanIV Seraphine Ashe', '제어 → 쌍권총 난사', '아군이 적의 이동을 막아 미스 포츈 궁극기에 노출되는 시간을 늘립니다.', 'engage', 1);
add('Kalista', 'Alistar Nautilus Rell Leona Rakan Thresh', '운명의 부름 → 서포터 진입', '칼리스타가 결속한 아군을 보호하거나 전방에 던지고, 아군이 제어를 잇습니다.', 'bond', 1);
add('Kaisa', 'Nautilus Leona Rell Alistar Rakan Vi Maokai Sejuani Blitzcrank', '이동 불가 → 플라즈마', '아군의 이동 불가 스킬이 플라즈마를 쌓아 카이사의 후속 공격과 궁극기 진입을 돕습니다.', 'follow', .85);
add('Braum', 'Ashe Kaisa Jinx KogMaw Zeri', '연속 공격 → 뇌진탕 펀치', '브라움이 붙인 표식에 딜러가 빠르게 기본 공격해 기절을 완성합니다.', 'lane', .85);
add('Lucian', 'Nami Lulu Karma Janna Sona Soraka Yuumi', '회복·보호막 → 빛의 사수', '아군의 회복이나 보호막이 루시안의 다음 기본 공격에 추가 마법 피해를 붙입니다.', 'lane', .9);
add('Jinx', 'Lulu Milio TahmKench Thresh Janna', '딜러 보호 → 연속 공격', '보호막, 구조, 진입 차단으로 징크스가 기본 공격을 이어갈 시간을 벌어 줍니다.', 'protect', .9);
add('KogMaw', 'Lulu Milio Janna', '지속딜 보호', '보호막과 진입 차단으로 코그모가 강화 기본 공격을 오래 유지합니다.', 'protect', 1.05);
add('Aphelios', 'Thresh TahmKench Lulu Milio', '기동성 보완', '구조 또는 보호막으로 이동기가 없는 아펠리오스의 공격 시간을 늘립니다.', 'protect', .88);
add('Zeri', 'Lulu Yuumi Milio', '기동·지속딜 지원', '보호와 이동 보조를 받은 제리가 교전에서 거리를 조절하며 지속딜을 넣습니다.', 'protect', .85);
add('Yunara', 'Lulu Milio Janna', '기본 공격 보조', '사거리나 보호를 지원해 유나라가 강화 기본 공격을 더 오래 이어갑니다.', 'protect', .88);
add('Caitlyn', 'Lux Morgana Neeko', '속박 → 덫', '아군의 속박에 케이틀린이 덫을 이어 제어와 헤드샷 기회를 늘립니다.', 'lane', 1.1);
add('Seraphine', 'Karma MissFortune Nasus Zilean', '둔화 → 비트 발사 속박', '먼저 걸린 둔화에 세라핀 E를 맞혀 이동 불가를 유도합니다.', 'lane', .85);
add('Jhin', 'Zyra Xerath Karma Lux', '원거리 적중 → 살상연희', '아군이 원거리에서 피해를 입힌 적을 진 W로 속박해 후속 공격을 잇습니다.', 'poke', .85);
add('Ezreal', 'Karma Lux', '원거리 견제 연계', '장거리 스킬을 잇고 보호막으로 역진입을 버티며 상대의 접근을 어렵게 합니다.', 'poke', .72);
add('Varus', 'Karma Lux', '포킹·속박 연계', '장거리 견제와 속박으로 오브젝트 입구에서 진입을 지연시킵니다.', 'poke', .82);
add('Nidalee', 'Renekton Pantheon Taliyah Elise', '이동 제어 → 창 적중', '아군 제어가 창과 후속 진입을 맞히기 쉽게 만들어 초반 합류 교전을 돕습니다.', 'pick', .9);
add('Taliyah', 'Pantheon Renekton Nautilus Vi', '확정 제어 → 지각변동', '먼저 적을 멈추게 한 뒤 탈리야가 지각변동과 바위 지대를 연계합니다.', 'pick', .95);
add('Ziggs', 'Leona Nautilus', '제어 → 폭탄 적중', '선행 이동 제어로 지그스의 폭탄과 궁극기가 적중할 기회를 만듭니다.', 'follow', .75);

// Specific interactions take precedence over the broader family for the same pair.
add('Ahri', 'Vi', '정지 명령 → 매혹', '바이가 궁극기로 대상을 띄우면 아리가 매혹과 구슬을 이어 단일 대상을 집중 공격합니다.', 'pickUltimate', 1.25);
add('Lucian', 'Milio', '사거리·보호막 → 빛의 사수', '밀리오가 사거리를 늘리고 회복·보호막으로 루시안의 추가 피해를 발동시킵니다.', 'lane', 1.25);
add('Camille', 'Galio', '최후통첩 → 영웅출현', '카밀이 궁극기로 대상을 가둬 갈리오가 같은 지점에 착지하며 제어를 잇습니다.', 'engage', 1.3);
add('Ashe', 'Seraphine', '서리 화살 → 속박·기절', '애쉬가 둔화시킨 적은 세라핀 E에 속박되고, 이미 이동 불가인 적은 기절합니다.', 'laneControl', 1.15);
add('Lucian', 'Braum', '두 발 → 뇌진탕 펀치', '루시안의 연속 사격이 브라움 표식을 빠르게 쌓고, 기절 뒤 추가 피해를 이어갑니다.', 'lane', 1.1);
add('Xayah', 'Rakan', '죽음의 깃·전쟁무도', '자야의 강화 효과를 함께 쓰고 라칸이 자야에게 더 멀리서 돌아와 진입과 보호를 잇습니다.', 'laneControl', 1.2);
add('Kalista', 'Renata', '운명의 부름·긴급 구제', '운명의 부름으로 레나타의 진입·구조를 돕고, 긴급 구제로 칼리스타가 공격을 이어갈 기회를 얻습니다.', 'bond', 1.1);
add('Senna', 'TahmKench', '긴 사거리·집어삼키기', '탐 켄치가 위기에 처한 세나를 삼켜 지키고, 세나는 거리 밖에서 지원 사격을 이어갑니다.', 'protect', 1.12);
add('Rengar', 'Ivern', '수풀 가꾸기 → 도약', '아이번이 만든 수풀을 렝가가 도약에 써서 진입 각을 만듭니다.', 'pick', 1.16);
add('Kindred', 'Taric', '양의 안식처 → 우주의 광휘', '킨드레드 궁으로 버틴 뒤 타릭의 지연 무적을 이어 교전 시간을 벌 수 있습니다.', 'engage', 1.16);
add('Lissandra', 'Nocturne', '장거리 진입·대상 고정', '녹턴의 진입에 리산드라가 속박과 궁극기를 보태 적의 이탈을 막습니다.', 'pickUltimate', 1.05);
add('Tristana', 'Rell', '진입 → 폭발 화약', '렐이 적을 제어하는 동안 트리스타나가 폭발 화약 중첩을 채웁니다.', 'laneControl', .97);
add('Samira', 'Rell Alistar Nautilus Leona', '이동 불가 → 사미라 진입', '아군 제어에 사미라가 접근해 공격을 잇고 궁극기 각을 만듭니다.', 'follow', 1.05);
add('Nilah', 'Soraka Sona Taric', '회복·보호막 증폭', '닐라의 기본 지속 효과가 가까운 아군의 회복과 보호막을 강화해 함께 버틸 시간을 늘립니다.', 'protect', .94);
add('Twitch', 'Lulu', '은신 기습·지속딜 보호', '룰루가 보호와 공격 보조를 제공해 트위치가 기습 후 강화 원거리 공격을 유지합니다.', 'protect', 1);
add('Diana', 'Yasuo', '달빛 낙하 → 최후의 숨결', '다이애나가 적을 끌어모아 띄우면 야스오가 궁극기로 제어를 이어갑니다.', 'engage', 1.25);
add('Nocturne', 'Shen', '피해망상·단결된 의지', '쉔이 진입하는 녹턴에게 보호막을 씌우고 합류해 적의 퇴로를 막습니다.', 'engage', 1.06);
add('Rumble', 'JarvanIV', '대격변 → 이퀄라이저', '자르반의 지형으로 이동을 제한해 럼블 궁극기 장판에서 빠져나가기 어렵게 합니다.', 'engage', 1.14);
add('Smolder', 'Milio', '사거리·성장 딜러 보호', '밀리오의 사거리와 보호가 스몰더의 강화 공격과 이탈을 돕습니다.', 'protect', .88);

export const CHAMPION_SYNERGIES = [...pairs.values()];
export const championSynergy = key => pairs.get(key);

const smallFights = new Set(['gank', 'dive', 'skirmish', 'flank']);
const objectives = new Set(['dragon', 'grubs', 'herald', 'baron', 'elder']);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

function timing(synergy, minute, kind, pairRoles, participantCount) {
 const earlyFight = clamp(1.15 - Math.max(0, minute - 14) * .014, .66, 1.15);
 const lateFight = clamp(.54 + minute * .023, .54, 1.2);
 const ultimate = clamp((minute - 5) / 3, 0, 1);
 const small = smallFights.has(kind) || participantCount < 4;
 const botLane = pairRoles.includes('BOT') && pairRoles.includes('SUP');
 const objective = objectives.has(kind);
 switch (synergy.style) {
  case 'lane': return earlyFight * (botLane && small ? 1.1 : .82);
  case 'laneControl': return (botLane && small ? earlyFight : .95) * (objective ? 1.05 : 1);
  case 'protect': return lateFight * (small ? .7 : 1);
  case 'pick': return earlyFight * (small ? 1.1 : .74);
  case 'pickUltimate': return ultimate * (small ? 1.12 : .92);
  case 'bond': return ultimate * (botLane ? 1 : .64) * (small ? .85 : 1);
  case 'engage': return ultimate * (small ? .72 : 1.05);
  case 'poke': return (objective || kind === 'siege' ? 1.07 : .75) * (small ? .9 : 1);
  default: return objective ? 1.05 : .95;
 }
}

export function activeChampionSynergies(members, minute, kind, { roles = null, absent = [] } = {}) {
 const active = (members ?? []).filter(([id, role]) => (!roles || roles.includes(role)) && !absent.includes(id));
 const matches = [];
 for (let i = 0; i < active.length; i++) {
  for (let j = i + 1; j < active.length; j++) {
   const synergy = pairs.get(synergyKey(active[i][0], active[j][0]));
   if (!synergy) continue;
   const score = synergy.strength * timing(synergy, minute, kind, [active[i][1], active[j][1]], active.length);
   if (score > 0) matches.push({ ...synergy, score });
  }
 }
 matches.sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
 const score = Math.min(2.2, matches.reduce((total, match, index) => total + match.score * (index ? .45 : 1), 0));
 return { score, matches };
}
