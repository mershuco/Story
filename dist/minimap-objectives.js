import {DRAKES} from './objective-effects.js';
const timer=n=>`${Math.floor(n/60)}:${String(Math.floor(n%60)).padStart(2,'0')}`;
// Spawn/cooldown display uses only events already revealed by the viewer.
export function minimapObjectives(timeline,index,progress,second){
 const events=timeline.slice(0,index+(progress>=.8?1:0)),last=events.at(-1),snapshot=last?.objectiveState;
 const capture=kind=>events.findLast(e=>e.objective?.kind===kind),baron=capture('baron'),dragon=capture('dragon'),elder=capture('elder');
 const totalGrubs=Object.values(last?.grubs??{}).reduce((n,v)=>n+v,0),soul=events.find(e=>e.objectiveState?.soul);
 const upperKind=second<1200?'grubs':'baron',upperAt=upperKind==='grubs'?480:baron?baron.second+360:1200;
 const upperGone=upperKind==='grubs'&&(totalGrubs>=3||second>=885);
 const lowerKind=snapshot?.next??'ocean',lowerAt=lowerKind==='elder'?(elder?elder.second+360:soul?soul.second+360:second+360):dragon?dragon.second+300:300;
 const pit=(kind,at,gone=false)=>({kind,available:!gone&&second>=at,remaining:gone?null:Math.max(0,Math.ceil(at-second)),gone});
 return {upper:pit(upperKind,upperAt,upperGone),lower:pit(lowerKind,lowerAt)};
}
export function paintObjectivePits(dom,timeline,index,progress,second){
 const {upper,lower}=minimapObjectives(timeline,index,progress,second);
 for(const [selector,pit]of [['.rift-objective.baron',upper],['.rift-objective.dragon',lower]]){
  const el=dom.querySelector(selector);if(!el)continue;
  el.querySelector('image').setAttribute('href',`./assets/objectives/${pit.kind}.png`);
  el.classList.toggle('not-spawned',!pit.available);el.classList.toggle('camp-cleared',pit.gone);
  const label=pit.kind==='baron'?'바론':pit.kind==='elder'?'장로':pit.kind==='grubs'?'유충':`${DRAKES[pit.kind]?.name??''}용`;
  el.querySelector('text').textContent=pit.gone?'':pit.remaining?`${label} ${timer(pit.remaining)}`:label;
  el.setAttribute('aria-label',`${label}${pit.gone?' 처치 완료':pit.remaining?` ${timer(pit.remaining)} 후 생성`:' 생성됨'}`);
 }
}
