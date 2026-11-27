import {DRAKES} from './objective-effects.js?v=345ebe2e4f45';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const objectiveIcon=(type,alt='')=>`<img class="objective-icon" src="https://mershuco.github.io/Story/assets/objectives/${esc(type)}.png" alt="${esc(alt||DRAKES[type]?.name||({baron:'바론',elder:'장로',ward:'시야',grubs:'공허 유충'})[type]||type)}">`;
export function structurePosition(side,lane,kind,index=0){
 if(side==='red')lane=lane==='top'?'bot':lane==='bot'?'top':lane;
 const towers={top:[[80,240],[80,365],[80,452]],mid:[[235,365],[170,430],[120,480]],bot:[[360,520],[235,520],[148,520]]};
 const p=kind==='tower'?towers[lane][index]:kind==='inhibitor'?({top:[80,485],mid:[104,496],bot:[115,520]})[lane]:kind==='nexusTower'?[[76,505],[95,524]][index]:[63,537];
 return side==='red'?[600-p[0],600-p[1]]:p;
}
export function scoreboard(c,set,m,score,clock){
 const team=side=>{const id=set[side];return `<div class="${side} broadcast-score-team"><div class="score-team-brand">${c.teamIcon?.(id)??''}<strong>${esc(c.teamName(id))}</strong></div><span class="score-towers" title="파괴한 포탑">♜ <b data-towers="${esc(id)}">${set.simulationVersion>=7?0:'—'}</b></span><span class="score-gold-stack"><span class="score-gold" data-team-gold="${esc(id)}">2.5K</span><small class="score-gold-diff" data-team-gold-diff="${esc(id)}" hidden></small></span><b class="score-kills" data-team-score="${esc(id)}">0</b><div class="score-grub-icons" data-grub-icons="${esc(id)}" role="img" aria-label="${esc(c.teamName(id))} 유충 획득 현황">${grubIcons(set.simulationVersion>=5?0:null)}</div><div class="score-drake-icons" data-drake-icons="${esc(id)}" aria-label="${esc(c.teamName(id))} 용 종류"></div></div>`;};
 return `<div class="live-scoreboard broadcast-scoreboard">${team('blue')}<div class="live-series"><strong>${score[set.blue]} <i>:</i> ${score[set.red]}</strong><time id="live-clock">${clock}</time><small>GAME ${set.number} · BO${m.bestOf}</small></div>${team('red')}</div>`;
}
export function grubIcons(count){
 const known=Number.isFinite(count),n=known?Math.max(0,Math.min(3,Math.floor(count))):0;
 return Array.from({length:3},(_,i)=>`<span class="grub-slot ${known&&i<n?'earned':'empty'}" title="${known?(i<n?'획득한 공허 유충':'미획득 공허 유충'):'이전 경기의 유충 기록 없음'}">${objectiveIcon('grubs','')}</span>`).join('');
}
export function goldRows(set,scene,prior,progress){
 const current=scene.rift?.players,previous=prior?.rift?.players;if(!current)return null;
 return set.stats.map((p,i)=>{const before=previous?.[i]??[500,0,1],now=current[i],gold=Math.round(before[0]+(now[0]-before[0])*progress),cs=Math.round(before[1]+(now[1]-before[1])*progress),level=progress>=.8?now[2]:before[2];return {player:p.player,team:p.team,role:p.role,gold,cs,level};});
}
export function drakeIcons(snapshot,id){
 if(!snapshot)return '';
 return Object.entries(snapshot.stacks[id]).flatMap(([type,n])=>Array.from({length:n},()=>`<span title="${DRAKES[type].name}용 · ${DRAKES[type].stack}">${objectiveIcon(type)}</span>`)).join('')+(snapshot.soul===id?`<b class="soul-icon" title="${DRAKES[snapshot.rift].name} 영혼">${objectiveIcon(snapshot.rift)}<i>영혼</i></b>`:'');
}
export function mapStateMarkup(set){
 const structures=['blue','red'].flatMap(side=>{
  const nodes=['top','mid','bot'].flatMap(lane=>[...Array.from({length:3},(_,index)=>({kind:'tower',lane,index})),{kind:'inhibitor',lane,index:0}]);nodes.push(...[0,1].map(index=>({kind:'nexusTower',lane:'mid',index})),{kind:'nexus',lane:'mid',index:0});
  return nodes.map(b=>{const [x,y]=structurePosition(side,b.lane,b.kind,b.index),icon=b.kind==='inhibitor'?'icon_ui_inhibitor_minimap_v2':b.kind==='nexus'?'icon_ui_nexus_minimap_v2':'icon_ui_tower_minimap',size=b.kind==='nexus'?40:30,label=b.kind==='inhibitor'?'억제기':b.kind==='nexus'?'넥서스':b.kind==='nexusTower'?'넥서스 포탑':`${b.index+1}차 포탑`;return `<g class="rift-building ${b.kind==='inhibitor'?'rift-inhibitor':'rift-tower'} ${side}" data-building="${side}:${b.lane}:${b.kind}:${b.index}" transform="translate(${x} ${y})"><rect class="objective-bounty-outline" x="-18" y="-21" width="36" height="40" rx="4"/><title class="building-bounty-title">${label}</title><image class="building-icon" href="https://mershuco.github.io/Story/assets/structures/${icon}.png" x="${-size/2}" y="${-size/2}" width="${size}" height="${size}" filter="url(#minimap-${side})"/><rect class="building-health-bg" x="-12" y="-20" width="24" height="2"/><rect class="building-health" x="-12" y="-20" width="24" height="2"/></g>`;});
 });
 const zones=[['blueTop',158,330],['blueBot',285,451],['redTop',315,149],['redBot',442,270],['riverTop',235,235],['riverBot',365,365]];
 return `<g class="jungle-territory">${zones.map(([zone,x,y])=>`<g data-zone="${zone}" transform="translate(${x} ${y})"><ellipse rx="66" ry="50"/><text text-anchor="middle" y="4"></text></g>`).join('')}</g><g class="rift-towers">${structures.join('')}</g><g class="vision-wards"></g><g class="minion-waves">${Array.from({length:7},(_,i)=>`<g data-minion="${i}" opacity="0"><circle r="${i===6?6:3.5}"/><path d="M-3-3 0-6 3-3"/></g>`).join('')}</g><g class="structure-impact" opacity="0"><circle r="25"/><text y="-30" text-anchor="middle"></text></g>`;
}
export function paintMap(dom,set,scene,prior,progress,second){
 const current=scene.rift,previous=prior?.rift??(scene.kind==='opening'?current:null);if(!current)return;
 const snapshot=progress>=.8?current:previous,bounty=snapshot?.bounty,targets=new Map((bounty?.targets??[]).map(t=>[[t.defender===set.blue?'blue':'red',t.lane,t.kind,t.index].join(':'),t]));
 for(const el of dom.querySelectorAll('[data-building]')){
  const [side,lane,kind,indexText]=el.dataset.building.split(':'),index=Number(indexText),id=set[side],read=s=>{const base=s?.structures[id];return !base?null:kind==='tower'?base.lanes[lane].towers[index]:kind==='inhibitor'?base.lanes[lane].inhibitor:kind==='nexus'?base.nexus:base.nexusTowers[index];},after=read(current),before=read(previous)??after;
  const hp=before+(after-before)*Math.max(0,Math.min(1,(progress-.35)/.45)),max=kind==='tower'?[2700,3200,3600][index]:kind==='inhibitor'?4000:kind==='nexus'?5000:3000;
  const target=targets.get(el.dataset.building);el.classList.toggle('has-objective-bounty',!!target&&(progress>=.8?after:before)>0);el.querySelector('.building-bounty-title').textContent=target?`오브젝트 현상금 +${target.gold}G · ${bounty.team} 획득 가능`:'';
  const art=el.querySelector('.building-icon');if(kind==='tower'||kind==='nexusTower')art.setAttribute('href',`https://mershuco.github.io/Story/assets/structures/icon_ui_tower_minimap${hp/max<.33?'_low':hp/max<.66?'_med':''}.png`);
  el.classList.toggle('destroyed',progress>=.8?after===0:before===0);el.classList.toggle('under-attack',after<before&&progress>.35&&progress<.9);el.querySelector('.building-health').setAttribute('width',Math.max(0,hp/max)*24);
 }
 if(snapshot){
  const zones=['blueTop','blueBot','redTop','redBot','riverTop','riverBot'];
  for(const el of dom.querySelectorAll('[data-zone]')){const i=zones.indexOf(el.dataset.zone),b=snapshot.vision[set.blue][i],r=snapshot.vision[set.red][i],gap=b-r;el.dataset.owner=Math.abs(gap)<15?'neutral':gap>0?'blue':'red';el.querySelector('text').textContent=Math.abs(gap)>25?`${gap>0?'B':'R'} 시야`:'';}
  const wards=dom.querySelector('.vision-wards');if(wards){const key=JSON.stringify(snapshot.wards);if(wards.dataset.key!==key){wards.dataset.key=key;wards.innerHTML=snapshot.wards.map(w=>{const pos={blueTop:[158,330],blueBot:[285,451],redTop:[315,149],redBot:[442,270],riverTop:[235,235],riverBot:[365,365]}[w.zone];return `<g class="map-ward ${w.team===set.blue?'blue':'red'}" transform="translate(${pos[0]+(w.team===set.blue?-12:12)} ${pos[1]})"><circle r="23"/><image href="https://mershuco.github.io/Story/assets/objectives/ward.png" x="-8" y="-8" width="16" height="16"/></g>`;}).join('');}}
 }
 const push=scene.push,side=push?.team===set.blue?'blue':'red',b=push?.structures?.[0],pos=b?structurePosition(b.defender===set.blue?'blue':'red',b.lane,b.kind,b.index):null;
 for(const el of dom.querySelectorAll('[data-minion]')){const i=Number(el.dataset.minion);el.setAttribute('opacity',push&&pos&&progress>.1?'1':'0');if(!pos)continue;const home=side==='blue'?[63,537]:[537,63],t=Math.max(0,Math.min(1,progress*1.45-i*.025)),points=push.lane==='mid'?[home,pos]:[home,push.lane==='top'?[80,80]:[520,520],pos],lengths=points.slice(1).map((p,j)=>Math.hypot(p[0]-points[j][0],p[1]-points[j][1]));let distance=t*lengths.reduce((a,b)=>a+b,0),at=home;for(let j=0;j<lengths.length;j++){const f=Math.min(1,distance/Math.max(1,lengths[j]));at=[points[j][0]+(points[j+1][0]-points[j][0])*f,points[j][1]+(points[j+1][1]-points[j][1])*f];if(distance<=lengths[j])break;distance-=lengths[j];}el.setAttribute('transform',`translate(${at[0]+(i%3-1)*9} ${at[1]+Math.floor(i/3)*10})`);el.dataset.side=side;el.classList.toggle('empowered',!!push.baron);el.classList.toggle('super',i===6&&push.superMinions>0);}
 const impact=dom.querySelector('.structure-impact');if(impact&&pos){impact.setAttribute('transform',`translate(${pos[0]} ${pos[1]})`);impact.setAttribute('opacity',progress>.45&&progress<.93?'1':'0');impact.querySelector('text').textContent=progress>=.8&&push.gold?`+${push.gold}G`:push.blocked?'미니언 정리':`-${Math.round(push.damage*progress)}`;}
}

export function goldLeadLabels(lead){
 const n=Math.abs(Math.round(lead)),text=n<50?`+${n}G`:`+${(n/1000).toFixed(1)}k`;
 return {blue:lead>0?text:'',red:lead<0?text:''};
}
