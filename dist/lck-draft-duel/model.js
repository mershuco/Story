import * as E from './engine/engine.js?v=da4ae1c9cc2f';

export const duelTeams=['P1','P2'];
export const LEGACY_SIMULATION_MODEL='event-v17';
export const duelSide=(room,player)=>room.teams.blue===player?'blue':'red';
export const duelMeta=(room,rules)=>rules.metas[room.metaId]??{
 label:'2026 전체 시즌',date:'2026-11-14',patch:rules.patch,champions:rules.champions,
};

export function duelMatch(room,rules,sets=room.sets){
 const score=duelTeams.map(team=>sets.filter(set=>set.winner===team).length);
 const {label,date}=duelMeta(room,rules);
 return {id:'duel',competition:room.metaId?label:'1대1',phase:room.metaId??'DUEL',teams:duelTeams,date,sets:[...sets],score,
  bestOf:room.bestOf,status:score.some(wins=>wins>room.bestOf/2)?'done':'scheduled'};
}

export function duelState(player,seed,date){
 const state=E.newGame(player,seed);
 state.date=date;
 return state;
}

export function matchupDraft(room,rules){
 const {blue,red}=room.teams;
 const draft={matchId:'duel',competition:'DUEL',matchPhase:room.metaId??'DUEL',blue,red,
  patch:duelMeta(room,rules).patch,step:room.history.length,set:room.number,
  firstPickSide:room.firstPickSide,assignment:{confirmed:!!room.assignments.blue&&!!room.assignments.red},
  used:room.used,history:room.history,bans:{},picks:{}};
 for(const side of ['blue','red']){
  const roleByChampion=Object.fromEntries(Object.entries(room.assignments[side]??{}).map(([role,id])=>[id,role]));
  draft.bans[side]=room.history.filter(entry=>entry.side===side&&entry.kind==='ban').map(entry=>entry.champion);
  draft.picks[side]=room.history.filter(entry=>entry.side===side&&entry.kind==='pick')
   .map(entry=>({champion:entry.champion,role:roleByChampion[entry.champion]??null,team:room.teams[side]}));
 }
 return draft;
}

export function runSharedMatch(room,rules){
 const match=duelMatch(room,rules,room.sets.filter(set=>set.number<room.number));
 const state=duelState('P1',room.seed,match.date);
 state.matches=[match];
 const set=E.resolveDraft(state,match,matchupDraft(room,rules),{model:room.simulationModel??LEGACY_SIMULATION_MODEL});
 return {state,match,set};
}
