import {draftConfirmMarkup} from './draft-confirm.js';
import {draftSynergies} from './draft-synergies.js';

export function draftSynergyMarkup(c, d, view) {
 const {E, state, ui, btn, esc, img} = c;
 const open = !!ui.draftSynergyOpen;
 const toggle = btn(open?'조합 접기':'조합 보기', 'draft-meta-synergy-toggle',
  `aria-expanded="${open}" aria-controls="draft-synergy-body"`, 'compact ghost');
 const header = `<header><h2>챔피언 조합</h2>${toggle}</header>`;
 if (!open) return `<section class="draft-synergy-panel" aria-label="챔피언 조합">${header}</section>`;

 const filter = ui.draftSynergyChampion ?? '';
 const side = d.blue===state.myTeam?'blue':'red';
 const picked = d.picks[side].map(p=>p.champion);
 const available = id => !E.draftUnavailableReason(state,d,id);
 const human = E.draftTurn(d)?.team===state.myTeam&&!ui.draftBusy;
 const map = E.database().champMap;
 const recommendations = draftSynergies(view,{picked,available});
 const rows = recommendations.rows.filter(pair => !filter || pair.champions.includes(filter));
 const availableFilters = new Set(recommendations.rows.flatMap(pair => pair.champions));
 if (filter) availableFilters.add(filter);

 const champion = (id,role,origin) => {
  const mine = picked.includes(id);
  const reason = mine?'우리 팀 픽':E.draftUnavailableReason(state,d,id);
  return `<div class="synergy-champion">
   <button type="button" class="meta-champion" data-action="draft-pick" data-draft-origin="${origin}" data-id="${id}"
    ${!human||reason?'disabled':''} title="${esc(reason||map[id].name)}">${img(id)}<strong>${esc(map[id].name)}</strong><small class="synergy-role">${esc(E.ROLE_NAMES[role])}</small>${reason?`<small>${esc(reason)}</small>`:''}</button>
   ${draftConfirmMarkup(c,d,id,origin)}
  </div>`;
 };
 const card = pair => {
  const origin = 'synergy-'+pair.key;
  return `<article class="synergy-card" data-synergy-key="${pair.key}">
   <div class="synergy-champions">${pair.champions.map((id,index)=>champion(id,pair.roles[index],origin)).join('')}</div>
   <div class="synergy-explanation"><strong>${esc(pair.label)}</strong>
   <p>${esc(pair.description)}</p>
   <small>${pair.games?`대회 동반 기록 ${pair.games}세트 · ${pair.wins}승`:'해당 대회 동반 기록 없음'}${pair.have===2?' · 조합 완성':pair.have===1?' · 한 챔피언 확보':''}</small></div>
  </article>`;
 };

 const options = [...availableFilters].map(id=>map[id])
  .sort((a,b)=>a.name.localeCompare(b.name,'ko'))
  .map(ch=>`<option value="${ch.id}" ${ch.id===filter?'selected':''}>${esc(ch.name)}</option>`).join('');
 const scope = recommendations.patchSample?`패치 ${E.patchLabel(d.patch)}`:'대회 합산';
 const time = view.mode === 'prior'?' · 게임 날짜 이전':'';
 const partial = view.partial?' · 월즈 일부 기록':'';
 const empty = !recommendations.sufficient?'추천을 고를 대회 표본이 아직 부족합니다.':
  filter?'이 챔피언으로 선택 가능한 추천 조합이 없습니다.':'현재 선택 가능한 메타 조합이 없습니다.';
 return `<section class="draft-synergy-panel" aria-label="챔피언 조합">${header}
  <div id="draft-synergy-body">
   <div class="meta-controls">
    <label>챔피언 <select data-change="draft-synergy-champion"><option value="">전체</option>${options}</select></label>
   </div>
   <p class="meta-evidence">${esc(view.label)} · ${esc(scope)} ${recommendations.games}세트${time}${partial}
   · 스킬 연계와 포지션별 픽·밴 우선도로 선별한 ${recommendations.rows.length}종</p>
   <div class="synergy-cards">${rows.length?rows.map(card).join(''):`<p class="meta-empty">${empty}</p>`}</div>
  </div>
 </section>`;
}
