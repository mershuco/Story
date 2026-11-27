import * as E from './engine/engine.js?v=da4ae1c9cc2f';
import {draftMarkup} from './engine/broadcast.js?v=da4ae1c9cc2f';
import {SIMULATION_MODEL} from './engine/match-sim.js?v=da4ae1c9cc2f';
import {mountMatch} from './game.js?v=da4ae1c9cc2f';
import {duelMatch,duelMeta,duelState,matchupDraft} from './model.js?v=da4ae1c9cc2f';
import {badge,button,championImage,esc,playerName,sheet,teamIcon,teamName} from './ui.js?v=da4ae1c9cc2f';

const root=document.querySelector('#duel'),status=document.querySelector('#duel-status');
const roomApi=document.querySelector('meta[name="duel-api"]')?.content||'./api';
const assetVersion=new URL(import.meta.url).search;
const activeRoomKey='lck-draft-duel-active-room';
const roomKey=id=>'lck-draft-duel-room:'+id;
const newToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),byte=>byte.toString(16).padStart(2,'0')).join('');
const normalizeCode=value=>String(value??'').toUpperCase().replace(/[\s-]/g,'');
const formatCode=id=>id.slice(0,4)+'-'+id.slice(4);
const validCode=id=>/^[A-HJ-NP-Z2-9]{8}$/.test(id);
const ui={draftRole:'all',draftSearch:'',draftMetaRole:'all',draftSynergyMode:'skills',draftSynergyPage:0,referenceStep:20};
let data,rules,snapshot,seat,timer,clockOffset=0,busy=false,viewer=null,activeSet,draft,localRoles={},expired=false;
let roomId=load(activeRoomKey);

function load(key){try{return localStorage.getItem(key);}catch{return null;}}
function save(key,value){try{if(value==null)localStorage.removeItem(key);else localStorage.setItem(key,value);}catch{}}
function toast(message,alert=false){
 status.textContent=message;
 status.classList.toggle('error',alert);
 status.hidden=!message;
}
async function request(path,body,authorization=seat){
 const send=Date.now();
 const response=await fetch(roomApi+path,{
  method:body?'POST':'GET',cache:'no-store',
  headers:{...(body?{'Content-Type':'application/json'}:{}),...(authorization?{'Authorization':'Bearer '+authorization}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),
 }).catch(()=>{throw new Error('방 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요.');});
 const result=await response.json().catch(()=>({}));
 if(!response.ok)throw Object.assign(new Error(result.error??'방 서버에 연결할 수 없습니다.'),{status:response.status});
 if(Number.isFinite(result.serverNow))clockOffset=result.serverNow-(send+Date.now())/2;
 return result;
}
function enter(response,key){
 roomId=response.id;
 seat=key;
 save(roomKey(roomId),seat);save(activeRoomKey,roomId);
 accept(response);poll();
}
function accept(response){
 if(snapshot&&response.revision<snapshot.revision)return;
 const changed=!snapshot||snapshot.revision!==response.revision;
 snapshot=response;
 if(activeSet!==snapshot.room.number){activeSet=snapshot.room.number;localRoles={};expired=false;ui.hoverChampion=null;}
 if(changed)render();
}
function poll(){
 clearTimeout(timer);
 if(!snapshot||snapshot.room.seriesWinner)return;
 timer=setTimeout(async()=>{
  try{
   accept(await request('/rooms/'+roomId));
   if(status.dataset.connection){toast('');delete status.dataset.connection;}
  }catch(error){
   status.dataset.connection='offline';toast(error.message,true);
   if([401,403,404].includes(error.status))return;
  }
  poll();
 },snapshot.room.phase==='lobby'?1400:850);
}
function home(){
 clearTimeout(timer);viewer?.stop();viewer=null;save(activeRoomKey,null);
 snapshot=null;seat=null;roomId=null;activeSet=null;localRoles={};ui.draftReferenceId=null;
 toast('');render();
}
const patchText=meta=>'PATCH '+E.patchLabel(meta.patch);
function roomFormat(room){
 const meta=duelMeta(room,rules);
 return `${meta.label} · ${patchText(meta)} · BO${room.bestOf}`;
}
function renderStart(){
 const metas=Object.entries(rules.metas);
 const options=metas.map(([id,meta])=>`<option value="${esc(id)}">${esc(meta.label)}</option>`).join('');
 root.innerHTML=`<section class="duel-intro"><div class="hero-copy"><p class="hero-kicker">2026 리그 오브 레전드</p><h1>1대1 밴픽.<br><em>같은 경기.</em></h1><p class="hero-help">친구와 밴픽하고, 각자 포지션을 배치한 뒤 함께 관전하세요.</p><div class="hero-facts"><span><b>${metas.length}개</b> 2026 대회 메타</span><span><b>BO1 · BO3 · BO5</b> 대결 형식</span></div></div>
 <div class="duel-form-card"><div class="mini-rift" aria-hidden="true"></div><h2>대결 방 만들기</h2>
 <form data-form="create" class="duel-team-form"><label for="room-meta">대회 메타</label><select id="room-meta" name="metaId" aria-describedby="room-meta-details" required><option value="" selected disabled>메타 선택</option>${options}</select><small id="room-meta-details" aria-live="polite" hidden></small>
 <label for="best-of">대결 형식</label><select id="best-of" name="bestOf"><option value="1">BO1 · 단판</option><option value="3">BO3 · 3전 2선승</option><option value="5">BO5 · 5전 3선승</option></select><button class="duel-button primary" type="submit">방 만들기</button></form>
 <form data-form="join" class="duel-team-form duel-join-form"><label for="invite-entry">초대코드로 입장</label><input id="invite-entry" name="code" maxlength="12" required placeholder="초대코드 8자리" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="duel-button" type="submit">입장</button></form></div></section>`;
}
function renderLobby(room){
 root.innerHTML=`<section class="lobby-stage"><p class="hero-kicker">${esc(roomFormat(room))}</p><h1>상대를 기다리는 중</h1>
 <div class="invite-link"><label for="room-code">초대코드</label><div><input id="room-code" readonly value="${formatCode(roomId)}"><button class="duel-button primary" data-action="copy-code">복사</button></div><p>친구가 이 코드를 입력하면 같은 방에 입장합니다.</p></div></section>`;
}
function renderSelection(room){
 const {rights,choice}=room.selection,turn=choice?rights==='P1'?'P2':'P1':rights;
 const labels={side:[['blue','블루 진영'],['red','레드 진영']],pick:[['first','선픽'],['second','후픽']]};
 const score=duelMatch(room,rules).score;
 const choices=Object.keys(labels).filter(category=>!choice||choice.category!==category).map(category=>
  `<div class="duel-format-choices"><b>${category==='side'?'진영':'픽 순서'}</b>${labels[category].map(([id,name])=>button(name,'select-side',`data-category="${category}" data-id="${id}"`,'primary')).join('')}</div>`).join('');
 root.innerHTML=sheet(`<section class="duel-series-setup"><p class="hero-kicker">${esc(roomFormat(room))} · GAME ${room.number}</p><h1>진영 · 픽 순서 선택</h1>
 <p>P1 ${score[0]} : ${score[1]} P2</p><p>${turn===snapshot.player?'내 선택 차례입니다.':`${playerName(turn)}의 선택을 기다립니다.`}</p>${turn===snapshot.player?choices:''}</section>`);
}
function activeDraft(){
 const room=snapshot.room;
 draft=matchupDraft(room,rules);
 const match=duelMatch(room,rules);
 const state=duelState(snapshot.player,0,match.date);
 state.matches=[match];state.activeDraft=draft;
 if(draft.step===20){
  const side=snapshot.side;
  for(const p of draft.picks[side]){
   if(room.assignments[side])continue;
   p.role=localRoles[p.champion]??null;
  }
  const remaining=Math.max(0,(room.assignmentEndsAt-Date.now()-clockOffset)/1000);
  draft.assignment={...draft.assignment,remaining,paused:false,expired:remaining<=0};
  if(!room.assignments[side]&&remaining<=0&&!expired){
   expired=true;E.autoAssignDraft(state,draft,side,true);saveDraftRoles();
  }
 }
 return state;
}
function saveDraftRoles(){
 localRoles=Object.fromEntries(draft.picks[snapshot.side].filter(p=>p.role).map(p=>[p.champion,p.role]));
}
function ownReady(){
 return draft?.step===20&&E.ROLES.every(role=>draft.picks[snapshot.side].some(p=>p.role===role));
}
function draftUI(){
 const state=activeDraft(),ownAssignment=snapshot.room.assignments[snapshot.side];
 const scroll=root.querySelector('.work-sheet')?.scrollTop??0, selectionScroll=root.querySelector('.draft-selection')?.scrollTop??0;
 const focused=document.activeElement?.id==='draft-search';
 const btn=(label,action,attrs,classes)=>{
  if(['draft-auto-rest','assignment-pause'].includes(action))return '';
  if(action==='draft-auto-one'&&E.draftTurn(draft)?.team!==state.myTeam)return '';
  if(action==='assignment-auto'&&ownAssignment)return '';
  if(action==='commit-draft')return button(ownAssignment?'상대 배치 대기':'배치 확정 · 경기 시작',action,ownReady()&&!ownAssignment?'':'disabled',classes);
  if(action==='draft-back')return button(ui.draftReferenceId?'밴픽으로 돌아가기':'대결 홈으로',ui.draftReferenceId?action:'home','',classes);
  return button(label,action,attrs,classes);
 };
 const html=draftMarkup({E,state,ui,data,esc,btn,badge,img:championImage,teamIcon,teamName});
 root.innerHTML=sheet(html);
 root.querySelector('.work-sheet').scrollTop=scroll;
 const selection=root.querySelector('.draft-selection');if(selection)selection.scrollTop=selectionScroll;
 if(focused)root.querySelector('#draft-search')?.focus({preventScroll:true});
 const h=root.querySelector('.assignment-heading h2');if(h)h.textContent='포지션 배치';
 const p=root.querySelector('.assignment-heading p');if(p)p.textContent=ownAssignment?'상대가 포지션을 확정하면 경기가 시작됩니다.':'선택한 다섯 챔피언을 각 포지션에 배치하세요.';
 const desc=root.querySelector('.composition-report>p');if(desc)desc.textContent='동일한 골드와 버프로 시작했을 때의 조합 상성입니다. 실제 한타는 챔피언 조합과 경기 흐름에 따라 달라집니다.';
 if(ownAssignment){
  for(const select of root.querySelectorAll('[data-change=assign-champion]'))select.disabled=true;
  for(const token of root.querySelectorAll('[data-drag-champion]'))token.draggable=false;
 }
}
function render(){
 const phase=snapshot?.room.phase;
 document.body.dataset.screen=phase==='match'?'viewer':phase==='draft'||phase==='assignment'||phase==='selection'?'draft':'duel';
 if(phase==='match'){
  if(!viewer)viewer=mountMatch(root,snapshot,rules,{getClockOffset:()=>clockOffset,onNext:()=>move({action:'next'}),onHome:home});
  else viewer.update(snapshot);
  return;
 }
 if(viewer){viewer.stop();viewer=null;}
 if(phase==='lobby')renderLobby(snapshot.room);
 else if(phase==='selection')renderSelection(snapshot.room);
 else if(phase==='draft'||phase==='assignment')draftUI();
 else renderStart();
}
async function perform(task){
 if(busy)return;
 busy=true;toast('');root.setAttribute('aria-busy','true');
 try{await task();}
 catch(error){
  if(error.status===409&&snapshot)try{accept(await request('/rooms/'+roomId));}catch{}
  toast(error.message,true);
 }finally{busy=false;root.setAttribute('aria-busy','false');}
}
function move(body){
 return perform(async()=>accept(await request('/rooms/'+roomId+'/move',{number:snapshot.room.number,...body})));
}
const metaActions={
 'draft-meta-toggle':()=>{ui.draftMetaOpen=!ui.draftMetaOpen;},
 'draft-meta-synergy-toggle':()=>{ui.draftSynergyOpen=!ui.draftSynergyOpen;},
 'draft-meta-synergy-mode':id=>{ui.draftSynergyMode=id;ui.draftSynergyPage=0;},
 'draft-meta-synergy-page':id=>{ui.draftSynergyPage=Number(id);},
 'draft-meta-role':id=>{ui.draftMetaRole=id;},
 'draft-meta-available':()=>{ui.draftMetaAvailable=!ui.draftMetaAvailable;},
 'draft-meta-mode':id=>{ui.draftMetaMode=id;},
 'draft-role':id=>{ui.draftRole=id;},
};
function examples(){
 const dialog=document.createElement('dialog');
 dialog.className='duel-examples';
 dialog.innerHTML=`<h2>실제 경기 밴픽 참고</h2><div>${data.draftExamples.examples.map(example=>button(example.title,'draft-reference',`data-id="${esc(example.id)}"`,'ghost')).join('')}</div><form method="dialog"><button class="btn">닫기</button></form>`;
 root.append(dialog);dialog.addEventListener('close',()=>dialog.remove(),{once:true});dialog.showModal();
}
root.addEventListener('submit',event=>{
 const form=event.target.closest('[data-form]');
 if(!form)return;
 event.preventDefault();
 const values=Object.fromEntries(new FormData(form));
 if(form.dataset.form==='create')perform(async()=>{
  const key=newToken();
  const created=await request('/rooms',{bestOf:Number(values.bestOf),simulationModel:SIMULATION_MODEL,metaId:values.metaId},key);
  if(created.room.metaId!==values.metaId)throw Error('선택한 대회 메타로 방을 만들 수 없습니다. 잠시 후 다시 시도해 주세요.');
  enter(created,key);
 });
 if(form.dataset.form==='join')perform(async()=>{
  const id=normalizeCode(values.code);
  if(!validCode(id))throw Error('초대코드 8자리를 확인해 주세요.');
  const key=load(roomKey(id))??newToken();
  save(roomKey(id),key);
  enter(await request('/rooms/'+id+'/join',{simulationModel:SIMULATION_MODEL,metaVersion:rules.metaVersion},key),key);
 });
});
root.addEventListener('input',e=>{if(e.target.id==='draft-search'){const pos=e.target.selectionStart;ui.draftSearch=e.target.value;draftUI();try{root.querySelector('#draft-search').setSelectionRange(pos,pos);}catch{}}});
function assign(id,role){
 if(!id||snapshot.room.assignments[snapshot.side])return;
 E.assignChampion(draft,snapshot.side,id,role);saveDraftRoles();draftUI();
}
root.addEventListener('change',e=>{
 const target=e.target;
 if(target.id==='room-meta'){
  const meta=rules.metas[target.value],details=root.querySelector('#room-meta-details');
  details.hidden=!meta;
  details.textContent=meta?`${patchText(meta)} · 참고 경기 ${meta.games}세트`:'';
 }
 if(target.dataset.change==='assign-champion')assign(target.value,target.dataset.role);
 if(target.dataset.change==='draft-synergy-champion'){ui.draftSynergyChampion=target.value;ui.draftSynergyPage=0;draftUI();}
});
root.addEventListener('dragstart',e=>{const row=e.target.closest('[data-drag-champion]');if(row)e.dataTransfer.setData('text/plain',row.dataset.dragChampion);});
root.addEventListener('dragover',e=>{if(e.target.closest('[data-drop-role]'))e.preventDefault();});
root.addEventListener('drop',e=>{const slot=e.target.closest('[data-drop-role]');if(!slot||slot.dataset.side!==snapshot.side)return;e.preventDefault();const id=e.dataTransfer.getData('text/plain');if(draft.picks[snapshot.side].some(p=>p.champion===id))assign(id,slot.dataset.dropRole);});
root.addEventListener('click',e=>{
 const el=e.target.closest('[data-action]');
 if(!el||el.disabled||busy||viewer)return;
 const {action,id}=el.dataset;
 if(action==='home'){home();return;}
 if(action==='copy-code')perform(async()=>{const field=root.querySelector('#room-code');try{await navigator.clipboard.writeText(field.value);toast('초대코드를 복사했습니다.');}catch{field.focus();field.select();}});
 if(action==='select-side')move({action:'select',category:el.dataset.category,value:id});
 if(metaActions[action]){metaActions[action](id);draftUI();return;}
 if(action==='draft-pick'){ui.hoverChampion=id;ui.draftSelectionOrigin=el.dataset.draftOrigin??'pool';draftUI();}
 if(action==='draft-lock'&&ui.hoverChampion===id){ui.hoverChampion=null;move({action:'draft',step:draft.step,champion:id});}
 if(action==='draft-auto-one'){
  const state=activeDraft(), copy=structuredClone(draft);E.autoOne(state,copy);
  move({action:'draft',step:draft.step,champion:copy.history.at(-1).champion});
 }
 if(action==='assignment-auto'&&!snapshot.room.assignments[snapshot.side]){
  const state=activeDraft();E.autoAssignDraft(state,draft,snapshot.side,false);saveDraftRoles();draftUI();
 }
 if(action==='commit-draft'&&ownReady())move({action:'ready',roles:Object.fromEntries(draft.picks[snapshot.side].map(p=>[p.role,p.champion]))});
 if(action==='draft-examples')examples();
 if(action==='draft-back'){ui.draftReferenceId=null;draftUI();}
 if(action==='draft-reference'){ui.draftReferenceId=id;ui.referenceStep=20;draftUI();}
 if(action.startsWith('reference-')){
  const option={ 'reference-first':0,'reference-end':20,'reference-prev':ui.referenceStep-1,'reference-next':ui.referenceStep+1,'reference-jump':Number(el.dataset.index)};
  if(action in option){ui.referenceStep=Math.max(0,Math.min(20,option[action]));draftUI();}
 }
});
document.querySelector('.wordmark').addEventListener('click',e=>{e.preventDefault();home();});
setInterval(()=>{
 if(snapshot?.room.phase!=='assignment'||ui.draftReferenceId)return;
 const remaining=Math.max(0,Math.ceil((snapshot.room.assignmentEndsAt-Date.now()-clockOffset)/1000));
 if(remaining===0&&!expired&&!snapshot.room.assignments[snapshot.side]){draftUI();return;}
 const clock=root.querySelector('#assignment-seconds');
 if(clock)clock.textContent=remaining;
},500);

try{
 [data,rules]=await Promise.all(['game-data','rules'].map(async id=>{
  const response=await fetch('./engine/'+id+'.json'+assetVersion);
  if(!response.ok)throw Error('경기 데이터를 불러오지 못했습니다.');
  return response.json();
 }));
 E.configure(data);
 if(validCode(roomId)&&load(roomKey(roomId))){
  seat=load(roomKey(roomId));
  try{accept(await request('/rooms/'+roomId));poll();}
  catch(error){home();toast(error.message,true);}
 }
 if(!snapshot)render();
}catch(error){
 root.innerHTML='<section class="duel-error"><h1>사이트를 열 수 없습니다.</h1><p>'+esc(error.message)+'</p><a class="duel-button" href="./">홈으로</a></section>';
}
