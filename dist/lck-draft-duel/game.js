import * as E from './engine/engine.js?v=da4ae1c9cc2f';
import {buildTimeline} from './engine/timeline.js?v=da4ae1c9cc2f';
import {viewerMarkup,paintScene} from './engine/spectator.js?v=da4ae1c9cc2f';
import {playbackIncrement} from './engine/power-play-ui.js?v=da4ae1c9cc2f';
import {refreshViewer} from './engine/viewer-layout.js?v=da4ae1c9cc2f';
import {runSharedMatch} from './model.js?v=da4ae1c9cc2f';
import {button,badge,championImage,esc,playerName,sheet,teamIcon,teamName} from './ui.js?v=da4ae1c9cc2f';

export {runSharedMatch};

export function mountMatch(root,initial,rules,{getClockOffset,onNext,onHome}){
 let snapshot=initial;
 let context,timeline,timings,shown=-1,showEnded=false,synced=true,oneScene=false,switching=false,lastTimestamp=0,frameId;
 const ui={viewerIndex:0,sceneProgress:0,viewerSpeed:1,viewerPlaying:true,replay:false};
 root.innerHTML=sheet('');
 const host=root.querySelector('.match-sheet');
 function useSet(number){
  switching=true;
  const room=snapshot.room;
  const record=room.sets.find(item=>item.number===number);
  const {state,match,set}=runSharedMatch({...room,...record},rules);
  state.myTeam=snapshot.player;
  state.viewing={matchId:match.id,setIndex:number-1};
  match.status=room.seriesWinner?'done':'scheduled';
  // The original viewer uses the series index for its scoreboard and replay tabs.
  match.sets=room.sets.map(item=>item.number===number?set:item);
  timeline=buildTimeline(set,{teamNames:Object.fromEntries(match.teams.map(id=>[id,teamName(id)])),
   playerNames:Object.fromEntries(Object.entries(state.players).map(([id,p])=>[id,p.name])),
   champions:E.database().champMap});
  timings=[0];
  for(const scene of timeline)timings.push(timings.at(-1)+1/playbackIncrement(scene,0,1,1));
  const btn=(label,action,attributes='',classes='')=>{
   if(action==='viewer-continue'){
    if(number!==room.number)return button('현재 세트로','viewer-set',`data-index="${room.number-1}"`,classes);
    if(room.seriesWinner)return button('대결 종료','viewer-continue','',classes);
    if(snapshot.room.allowNext.includes(snapshot.player))return button('상대 준비 대기','viewer-continue','disabled',classes);
   }
   if(action==='nav')return button('대결 홈','home','','compact ghost');
   return button(label,action,attributes,classes);
  };
  context={E,state,ui,esc,btn,badge,t:id=>state.teams[id],teamName,img:championImage,teamIcon,
   viewerData:()=>({m:match,set}),timelineForSet:()=>timeline};
  switching=false;
 }
 const render=()=>{
  const markup=viewerMarkup(context);
  if(!refreshViewer(root,markup,()=>paintScene(context))){
   host.insertAdjacentHTML('beforeend',markup);
   paintScene(context);
  }
  const heading=root.querySelector('.live-results th:nth-child(2)');
  if(heading)heading.textContent='포지션';
  let series=root.querySelector('.duel-series-winner');
  if(!series&&snapshot.room.seriesWinner&&ui.sceneProgress>=1&&ui.viewerIndex===timeline.length-1){
   series=document.createElement('strong');
   series.className='duel-series-winner';
   series.textContent=`${playerName(snapshot.room.seriesWinner)} 시리즈 승리`;
   root.querySelector('.live-results .panel-head')?.prepend(series);
  }
 };
 useSet(snapshot.room.number);
 const frame=timestamp=>{
  if(switching){frameId=requestAnimationFrame(frame);return;}
  if(synced){
   const elapsed=Math.max(0,Date.now()+getClockOffset()-snapshot.room.startedAt);
   const index=Math.max(0,timings.findLastIndex(value=>value<=elapsed));
   ui.viewerIndex=Math.min(index,timeline.length-1);
   ui.sceneProgress=index>=timeline.length?1:(elapsed-timings[index])/(timings[index+1]-timings[index]);
   ui.viewerPlaying=index<timeline.length;
  }else if(ui.viewerPlaying){
   const elapsed=lastTimestamp?Math.min(120,timestamp-lastTimestamp):0;
   ui.sceneProgress=Math.min(1,ui.sceneProgress+playbackIncrement(timeline[ui.viewerIndex],ui.sceneProgress,elapsed,ui.viewerSpeed));
   if(ui.sceneProgress>=1){
    if(oneScene||ui.viewerIndex>=timeline.length-1){ui.viewerPlaying=false;render();}
    else{ui.viewerIndex++;ui.sceneProgress=0;}
   }
  }
  lastTimestamp=timestamp;
  const done=ui.viewerIndex===timeline.length-1&&ui.sceneProgress>=1;
  if(shown!==ui.viewerIndex||showEnded!==done){
   render();shown=ui.viewerIndex;showEnded=done;
  }else if(ui.viewerPlaying)paintScene(context);
  frameId=requestAnimationFrame(frame);
 };
 frameId=requestAnimationFrame(frame);
 const click=e=>{
  const el=e.target.closest('[data-action]');
  if(!el||el.disabled)return;
  const action=el.dataset.action;
  if(action==='home'){onHome();return;}
  if(action==='viewer-continue'){
   if(snapshot.room.seriesWinner)onHome();
   else onNext();
   return;
  }
  if(action==='viewer-speed'){
   synced=false;ui.viewerSpeed=Number(el.dataset.speed);
  }else if(action==='viewer-play'){
   synced=false;oneScene=false;
   if(ui.sceneProgress===1&&ui.viewerIndex===timeline.length-1){ui.viewerIndex=0;ui.sceneProgress=0;}
   ui.viewerPlaying=!ui.viewerPlaying;
  }else if(action==='viewer-scene'||action==='viewer-next'){
   synced=false;oneScene=true;ui.viewerPlaying=true;
   ui.viewerIndex=Math.min(timeline.length-1,action==='viewer-next'?ui.viewerIndex+1:Number(el.dataset.index));
   ui.sceneProgress=0;
  }else if(action==='viewer-end'||action==='viewer-set'){
   synced=false;oneScene=false;ui.viewerPlaying=false;
   if(action==='viewer-set')useSet(Number(el.dataset.index)+1);
   ui.viewerIndex=timeline.length-1;ui.sceneProgress=1;
  }else return;
  render();
 };
 root.addEventListener('click',click);
 return {
  update(next){snapshot=next;render();},
  stop(){cancelAnimationFrame(frameId);root.removeEventListener('click',click);},
 };
}
