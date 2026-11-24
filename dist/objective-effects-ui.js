import {DRAKES,objectiveRewardText} from './objective-effects.js';
export function objectiveStatus(snapshot,id,side,second,grubs=0){
 if(!snapshot)return '이전 버전 경기 · 종류별 강화 기록 없음';
 const stacks=Object.entries(snapshot.stacks[id]).filter(([,n])=>n).map(([type,n])=>`${DRAKES[type].name} ×${n} (${DRAKES[type].stack})`);
 if(snapshot.soul===id)stacks.push(`${DRAKES[snapshot.rift].name} 영혼 · ${DRAKES[snapshot.rift].soul}`);
 if(grubs)stacks.push(`유충 ${grubs} · 포탑 지속 피해${grubs>=3?' + 진드기 소환':''}`);
 for(const [kind,label]of [['baron','바론'],['elder','장로']]){
  const [until,holders]=snapshot[kind][side],left=until-second;
  if(holders&&left>0)stacks.push(`${label} ${Math.floor(left/60)}:${String(Math.floor(left%60)).padStart(2,'0')} · ${holders}명 보유`);
 }
 return stacks.join(' / ')||'획득한 오브젝트 강화 없음';
}
export function objectiveGuide(){
 return `<details class="objective-guide"><summary>용·영혼·장로·바론·유충 효과 보기</summary><div class="objective-guide-grid">${Object.entries(DRAKES).map(([type,d])=>`<article style="--drake-color:${d.color}"><strong>${d.name}용</strong><p>매 획득: ${d.stack}</p><p>영혼: ${d.soul}</p></article>`).join('')}</div><p>첫 세 용은 서로 다른 무작위 종류입니다. 셋째 용부터 같은 종류가 반복됩니다. 종류 합산 4용을 먼저 얻은 한 팀만 셋째 용 종류의 영혼을 영구 획득합니다. 이후 원소용은 사라지고 6분 뒤 장로용이 나옵니다.</p><p>${objectiveRewardText({kind:'elder'})} 다음 장로는 처치 6분 뒤 등장합니다.</p><p>${objectiveRewardText({kind:'baron'})} 다음 바론은 처치 6분 뒤 등장합니다.</p><p>${objectiveRewardText({kind:'grubs'})} 유충은 8분 이후 한 번, 총 3마리입니다. 바론 둥지는 유충·바론 전용, 용 둥지는 원소용·장로용 전용입니다. 전령은 요청한 게임 규칙에 따라 등장하지 않습니다.</p><p class="small muted">실제 효과의 성격을 조합별 교전·공성·처형 확률로 환산한 게임 모델입니다. 개별 아이템·체력·스킬 피해를 실시간으로 계산하는 LoL 엔진은 아닙니다.</p></details>`;
}
