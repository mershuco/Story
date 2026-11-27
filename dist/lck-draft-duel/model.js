import * as E from './engine/engine.js';

export const duelTeams=['P1','P2'];
export const duelSide=(room,player)=>room.teams.blue===player?'blue':'red';

export function duelMatch(room,sets=room.sets){
 const score=duelTeams.map(team=>sets.filter(set=>set.winner===team).length);
 return {id:'duel',competition:'1대1',phase:'DUEL',teams:duelTeams,date:'2026-11-14',sets:[...sets],score,
  bestOf:room.bestOf,status:score.some(wins=>wins>room.bestOf/2)?'done':'scheduled'};
}

export function duelState(player,seed){
 const state=E.newGame(player,seed);
 state.date='2026-11-14';
 return state;
}

export function matchupDraft(room,rules){
 const {blue,red}=room.teams;
 const draft={matchId:'duel',competition:'DUEL',blue,red,patch:rules.patch,step:room.history.length,set:room.number,
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
 const state=duelState('P1',room.seed);
 const match=duelMatch(room,room.sets.filter(set=>set.number<room.number));
 state.matches=[match];
 const set=E.resolveDraft(state,match,matchupDraft(room,rules));
 return {state,match,set};
}
