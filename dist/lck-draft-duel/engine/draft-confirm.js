export function draftConfirmMarkup(c,d,id,origin){
 const {E,state:s,ui,esc,btn}=c,turn=E.draftTurn(d);
 if(ui.hoverChampion!==id||(ui.draftSelectionOrigin??'pool')!==origin||turn?.team!==s.myTeam||ui.draftBusy||E.draftUnavailableReason(s,d,id))return '';
 const label=turn.kind==='ban'?'밴':'픽';
 return btn(label,'draft-lock',`data-id="${id}" data-step="${d.step}" aria-label="${esc(E.database().champMap[id].name)} ${label} 확정"`,'draft-inline-lock primary '+(turn.kind==='ban'?'is-ban':'is-pick'));
}
