import {synergySpikeLabel} from './champion-synergy.js?v=345ebe2e4f45';
import {draftConfirmMarkup} from './draft-confirm.js?v=345ebe2e4f45';
import {draftSynergies} from './draft-synergies.js?v=345ebe2e4f45';

const PAGE_SIZE = 12;

export function draftSynergyMarkup(c, d, view) {
 const {E, state, ui, btn, esc, img} = c;
 const open = !!ui.draftSynergyOpen;
 const toggle = btn(open?'조합 접기':'조합 보기', 'draft-meta-synergy-toggle',
  `aria-expanded="${open}" aria-controls="draft-synergy-body"`, 'compact ghost');
 const header = `<header><h2>챔피언 조합</h2>${toggle}</header>`;
 if (!open) return `<section class="draft-synergy-panel" aria-label="챔피언 조합">${header}</section>`;

 const mode = ui.draftSynergyMode ?? 'skills';
 const filter = ui.draftSynergyChampion ?? '';
 const page = ui.draftSynergyPage ?? 0;
 const side = d.blue===state.myTeam?'blue':'red';
 const picked = d.picks[side].map(p=>p.champion);
 const available = id => !E.draftUnavailableReason(state,d,id);
 const human = E.draftTurn(d)?.team===state.myTeam&&!ui.draftBusy;
 const map = E.database().champMap;
 const rows = draftSynergies(view.records,{mode,champion:filter,picked,available});
 const pages = Math.max(1,Math.ceil(rows.length/PAGE_SIZE));
 const activePage = Math.min(page,pages-1);

 const champion = (id,origin) => {
  const mine = picked.includes(id);
  const reason = mine?'우리 팀 픽':E.draftUnavailableReason(state,d,id);
  return `<div class="synergy-champion">
   <button type="button" class="meta-champion" data-action="draft-pick" data-draft-origin="${origin}" data-id="${id}"
    ${!human||reason?'disabled':''} title="${esc(reason||map[id].name)}">${img(id)}<strong>${esc(map[id].name)}</strong>${reason?`<small>${esc(reason)}</small>`:''}</button>
   ${draftConfirmMarkup(c,d,id,origin)}
  </div>`;
 };
 const card = pair => {
  const origin = 'synergy-'+pair.key;
  return `<article class="synergy-card" data-synergy-key="${pair.key}">
   <div class="synergy-champions">${pair.champions.map(id=>champion(id,origin)).join('')}</div>
   <div class="synergy-explanation"><strong>${esc(pair.skill?.label??'같은 팀 출전 기록')}</strong>
   ${pair.skill?`<p>${esc(pair.skill.description)}</p><p class="synergy-spike">강한 구간 · ${esc(synergySpikeLabel(pair.skill))}</p>`:''}
   <small>${esc(view.label)} ${pair.games}세트 · ${pair.wins}승${pair.have===2?' · 조합 완성':pair.have===1?' · 한 챔피언 확보':''}</small></div>
  </article>`;
 };

 const options = Object.values(map).filter(ch=>ch.available[d.patch]||ch.id===filter)
  .sort((a,b)=>a.name.localeCompare(b.name,'ko'))
  .map(ch=>`<option value="${ch.id}" ${ch.id===filter?'selected':''}>${esc(ch.name)}</option>`).join('');
 return `<section class="draft-synergy-panel" aria-label="챔피언 조합">${header}
  <div id="draft-synergy-body">
   <div class="meta-controls">
    ${btn('스킬 연계','draft-meta-synergy-mode','data-id="skills" aria-pressed="'+(mode==='skills')+'"',mode==='skills'?'compact primary':'compact')}
    ${btn('대회 동반 기록','draft-meta-synergy-mode','data-id="observed" aria-pressed="'+(mode==='observed')+'"',mode==='observed'?'compact primary':'compact')}
    <label>챔피언 <select data-change="draft-synergy-champion"><option value="">전체</option>${options}</select></label>
   </div>
   <p class="meta-evidence">${esc(view.label)} · ${view.mode==='prior'?'게임 날짜 이전 · ':''}${view.games}세트 기준
   · ${mode==='skills'?'해당 대회에서 한 팀으로 출전한 스킬 연계 조합입니다.':'같은 대회에서 한 팀으로 뛴 기록입니다. 스킬 연계가 설정된 조합은 설명을 함께 표시합니다.'}</p>
   <div class="synergy-cards">${rows.length?rows.slice(activePage*PAGE_SIZE,(activePage+1)*PAGE_SIZE).map(card).join(''):'<p class="meta-empty">해당 대회에서 확인된 조합이 없습니다.</p>'}</div>
   ${pages>1?`<div class="meta-controls synergy-pagination">
    ${btn('이전','draft-meta-synergy-page','data-id="'+(activePage-1)+'" '+(activePage===0?'disabled':''),'compact ghost')}
    <span>${activePage+1} / ${pages} · ${rows.length}종</span>
    ${btn('다음','draft-meta-synergy-page','data-id="'+(activePage+1)+'" '+(activePage===pages-1?'disabled':''),'compact ghost')}
   </div>`:''}
  </div>
 </section>`;
}
