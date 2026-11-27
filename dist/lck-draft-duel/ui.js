export const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const button=(label,action,attributes='',classes='')=>`<button type="button" class="btn ${classes}" data-action="${action}" ${attributes}>${esc(label)}</button>`;
export const badge=(label,style)=>`<span class="badge ${style}">${esc(label)}</span>`;
export const championImage=id=>`<img class="champ-img" loading="lazy" src="https://mershuco.github.io/Story/assets/champions/${esc(id)}.png" alt="">`;
export const teamIcon=id=>`<span class="team-logo duel-player-logo ${id==='P2'?'p2':'p1'}" aria-hidden="true">${id==='P2'?2:1}</span>`;
export const teamName=id=>id==='P2'?'P2':'P1';
export const playerName=id=>id==='P2'?'플레이어 2':'플레이어 1';
export const sheet=content=>`<div class="vct-shell match-mode duel-stage-shell"><section class="work-sheet match-sheet"><header class="work-sheet-top"><strong>MATCH CENTER</strong>${button('×','home','aria-label="대결 홈으로"')}</header>${content}</section></div>`;
