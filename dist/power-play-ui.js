import {objectiveIcon} from './broadcast-hud.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock=s=>`${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
export function powerPlayMarkup(set){return `<section class="power-play-strip" aria-label="바론·장로 보유 현황">${['blue','red'].map(side=>`<div class="power-play-team ${side}">${['baron','elder'].map(kind=>`<article class="power-play-card ${kind}" data-power-play="${side}:${kind}" hidden role="status"><div class="power-owner"></div>${objectiveIcon(kind)}<strong class="power-time"></strong><span class="power-gold" title="획득 이후 팀 골드 격차 변화"></span><div class="power-progress"><i></i></div></article>`).join('')}</div>`).join('')}</section><div class="objective-bounty-banner" data-bounty-banner role="status" hidden></div>`;}
export function powerPlayState(set,timeline,index,progress,second){
 const effective=progress>=.8?index:index-1,snapshot=timeline[effective]?.objectiveState;if(!snapshot)return [];
 const scene=timeline[index],prior=timeline[index-1],gold=id=>(prior?.gold?.[id]??2500)+((scene.gold?.[id]??2500)-(prior?.gold?.[id]??2500))*progress;
 const cards=[];for(const [side,n]of [['blue',0],['red',1]])for(const kind of ['baron','elder']){
  const [until,holders]=snapshot[kind]?.[n]??[0,0];if(!holders||until<=second)continue;
  const id=set[side],enemy=set[side==='blue'?'red':'blue'],captured=timeline.slice(0,effective+1).findLast(e=>e.objective?.kind===kind&&e.objective.team===id);if(!captured)continue;
  const duration=kind==='baron'?180:150,swing=scene===captured?0:Math.round(gold(id)-gold(enemy)-(captured.gold[id]-captured.gold[enemy]));cards.push({side,kind,team:id,holders,seconds:Math.max(0,Math.ceil(until-second)),fraction:Math.max(0,Math.min(1,(until-second)/duration)),gold:swing});
 }return cards;
}
export function paintPowerPlays(c,set,timeline,index,progress,second){
 const cards=powerPlayState(set,timeline,index,progress,second);
 for(const side of ['blue','red'])for(const kind of ['baron','elder']){const el=document.querySelector(`[data-power-play="${side}:${kind}"]`);if(!el)continue;const card=cards.find(x=>x.side===side&&x.kind===kind);el.hidden=!card;if(!card)continue;
  el.querySelector('.power-owner').innerHTML=`<b>${esc(c.teamName(card.team))}</b><small>${kind==='baron'?'BARON POWER PLAY':'ELDER DRAGON'}</small>`;el.querySelector('.power-time').textContent=clock(card.seconds);el.querySelector('.power-gold').textContent=(card.gold>=0?'+':'')+card.gold.toLocaleString()+' G';el.querySelector('.power-gold').dataset.lead=card.gold>=0?'ahead':'behind';el.querySelector('.power-progress i').style.width=card.fraction*100+'%';el.setAttribute('aria-label',`${c.teamName(card.team)} ${kind==='baron'?'바론':'장로'} 강화 ${clock(card.seconds)} 남음 · ${card.holders}명 보유`);
 }
 const effective=progress>=.8?timeline[index]:timeline[Math.max(0,index-1)],bounty=effective?.rift?.bounty,banner=document.querySelector('[data-bounty-banner]');if(banner){banner.hidden=!bounty?.team;if(bounty?.team)banner.textContent=`오브젝트 현상금 활성 · ${c.teamName(bounty.team)} · 테두리가 표시된 적 포탑 파괴 시 추가 골드`;}
}
export function playbackIncrement(scene,progress,elapsed,speed){return elapsed/3200*speed;}
