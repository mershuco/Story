// Qualitative kit interactions for protecting an intended power pick in draft.
// These are game estimates, not observed matchup win rates or guaranteed counters.
const set=s=>new Set(s.split(' '));
const MOBILE=set('Aatrox Akali Ambessa Aurora Camille Diana Ekko Fizz Hecarim Irelia JarvanIV Jax Kaisa Kalista Kassadin Katarina Khazix Kindred Leblanc LeeSin Lucian Naafiri Nilah Pantheon Rakan Renekton Rengar Riven Samira Sylas Vi Viego XinZhao Yasuo Yone Zed Zeri');
const POKE=set('Jayce Nidalee Zoe Ezreal Varus Ziggs Xerath Velkoz Hwei Corki');
const DIRECT={
 Rumble:[['Galio',1.2,'마법 피해 대응과 광역 진입 차단'],['Jayce',1.1,'사거리와 라인 견제'],['Gragas',1,'궁극기로 진형 이탈']],
 Orianna:[['Xerath',1.2,'장거리 견제로 구체 사거리 밖 압박'],['Nocturne',1.15,'후방 진입과 주문 방어'],['Galio',1,'마법 피해 대응']],
 Neeko:[['Morgana',1.25,'블랙 실드로 핵심 CC 방어'],['Janna',1.1,'광역 진입 밀어내기'],['Sylas',1,'광역 궁극기 역이용']],
 Yunara:[['Vi',1.2,'확정 돌진으로 원거리 딜러 포착'],['Malphite',1.15,'광역 진입과 공격 속도 억제'],['Rammus',1,'기본 공격 대응']],
 Azir:[['Xerath',1.2,'병사 사거리 밖 장거리 견제'],['Vi',1.1,'후방 확정 포착'],['Leblanc',1,'초중반 기동 압박']],
 Qiyana:[['Poppy',1.25,'돌진 차단'],['Taliyah',1.15,'돌진 경로 억제'],['Lissandra',1.1,'진입 후 확정 제어']],
 Alistar:[['Morgana',1.25,'돌진 CC를 막는 블랙 실드'],['Poppy',1.2,'진입 돌진 차단'],['Janna',1.15,'진입 밀어내기']],
 Taliyah:[['Nocturne',1.2,'장거리 후방 진입'],['Zed',1.1,'측면 암살 압박'],['Kassadin',1,'성장 후 마법 대응·기동']],
 Ambessa:[['Poppy',1.3,'연속 돌진 차단'],['Taliyah',1.25,'돌진 경로 제어'],['Cassiopeia',1.15,'접근 경로 고정']],
 MonkeyKing:[['Poppy',1.2,'돌진 진입 차단'],['Janna',1.15,'회전 진입 밀어내기'],['Renata',1.05,'밀집 진입 역이용']],
 Sion:[['Gwen',1.3,'체력 비례 피해로 전방 처리'],['Fiora',1.2,'약점 고정 피해'],['Trundle',1.15,'전방 저항력 약화']],
 Poppy:[['Trundle',1.2,'전방 저항력 약화'],['Gwen',1.15,'체력 비례 피해'],['Vayne',1.1,'탱커 대상 지속 피해']],
 Rakan:[['Poppy',1.3,'돌진 차단'],['Morgana',1.2,'매혹·에어본 방어'],['Janna',1.15,'진입 밀어내기']],
 Rell:[['Janna',1.25,'광역 진입 차단'],['Poppy',1.2,'돌진 차단'],['Morgana',1.15,'핵심 CC 방어']],
 Nautilus:[['Morgana',1.3,'핵심 대상 CC 방어'],['Sivir',1.15,'단일 핵심 스킬 방어'],['Alistar',1,'진입 끊기·보호']],
 Vi:[['Morgana',1.25,'대상 포착 CC 방어'],['Poppy',1.15,'선행 돌진 차단'],['Janna',1.05,'후속 진입 분리']],
 Jinx:[['Vi',1.25,'기동성 낮은 딜러 확정 포착'],['Nocturne',1.15,'후방 진입'],['Malphite',1.1,'전방을 넘는 광역 진입']],
 Aphelios:[['Vi',1.25,'기동성 낮은 딜러 확정 포착'],['Nocturne',1.15,'후방 진입'],['Malphite',1.1,'광역 진입']],
 Xayah:[['Xerath',1.15,'깃털 사거리 밖 견제'],['Ziggs',1.1,'장거리 공성'],['Varus',1,'장거리 견제']],
 Kalista:[['Poppy',1.2,'이동·돌진 압박'],['Ashe',1.15,'반복 둔화와 사거리'],['Nautilus',1.1,'확정 대상 제어']],
 Varus:[['Braum',1.25,'투사체 방어'],['Yasuo',1.2,'바람 장막'],['Nocturne',1.15,'후방 진입']],
 Ezreal:[['Braum',1.2,'투사체 방어'],['Yasuo',1.15,'바람 장막'],['Vi',1.05,'확정 포착']],
 Smolder:[['Vi',1.2,'성장형 딜러 포착'],['Nocturne',1.15,'후방 진입'],['Draven',1.1,'초반 성장 억제']],
 KSante:[['Gwen',1.2,'체력 비례 지속 피해'],['Fiora',1.15,'약점 고정 피해'],['Vayne',1.1,'탱커 처리']],
 Ornn:[['Gwen',1.2,'체력 비례 지속 피해'],['Trundle',1.15,'전방 저항력 약화'],['Fiora',1.1,'사이드 결투']],
 Sejuani:[['Trundle',1.2,'전방 저항력 약화'],['Morgana',1.15,'핵심 CC 방어'],['Gwen',1.05,'전방 처리']],
 Bard:[['Blitzcrank',1.15,'로밍·복귀 경로 포착'],['Nautilus',1.1,'확정 포착'],['Pyke',1,'빠른 로밍 대응']],
 Hwei:[['Nocturne',1.2,'후방 진입'],['Vi',1.15,'확정 포착'],['Xerath',1,'장거리 견제']],
 Viktor:[['Nocturne',1.2,'후방 진입'],['Vi',1.15,'확정 포착'],['Xerath',1,'사거리 밖 견제']]
};
export function draftCounterThreat(target,candidate){
 const direct=DIRECT[target.id]?.find(([id])=>id===candidate.id);if(direct)return {weight:direct[1],reason:direct[2]};
 const offers=[];
 if((target.classes??[]).includes('Tank')||target.features?.tank)if(['Gwen','Fiora','Trundle','Vayne'].includes(candidate.id))offers.push({weight:.9,reason:'전방 처리·사이드 결투 대응'});
 if(MOBILE.has(target.id))if(['Poppy','Taliyah','Cassiopeia','Vex'].includes(candidate.id))offers.push({weight:.9,reason:'기동·돌진 억제'});
 if((target.classes??[]).includes('Marksman'))if(['Vi','Nocturne','Malphite'].includes(candidate.id))offers.push({weight:.85,reason:'원거리 딜러 포착·진입'});
 if((target.classes??[]).includes('Mage'))if(['Galio','Kassadin','Nocturne'].includes(candidate.id))offers.push({weight:.7,reason:'마법 피해 대응·후방 압박'});
 if((target.classes??[]).includes('Assassin'))if(['Lissandra','Lulu','Galio','Morgana'].includes(candidate.id))offers.push({weight:.8,reason:'암살 진입 제어·핵심 대상 보호'});
 if((target.classes??[]).includes('Fighter')&&!MOBILE.has(target.id))if(['Vayne','Anivia','Kindred'].includes(candidate.id))offers.push({weight:.65,reason:'근접 전투 회피·사거리 대응'});
 if((target.roles??[]).includes('SUP'))if(['Blitzcrank','Nautilus','Pyke'].includes(candidate.id))offers.push({weight:.7,reason:'지원 챔피언 포착·로밍 대응'});
 if(target.features?.engage)if(['Morgana','Janna','Renata'].includes(candidate.id))offers.push({weight:.8,reason:'핵심 진입·CC 대응'});
 if(POKE.has(target.id))if(['Nocturne','Malphite','Hecarim'].includes(candidate.id))offers.push({weight:.85,reason:'포킹 진형에 장거리 진입'});
 return offers.sort((a,b)=>b.weight-a.weight)[0]??{weight:0,reason:''};
}
