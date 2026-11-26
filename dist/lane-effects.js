import {sampleMinions} from './lane-playback.js';

const COLORS={pearl:'#9ef3ff',frost:'#9bd6ff',green:'#a7ffd2',arcane:'#8dbbff',violet:'#e0a8ff',steel:'#ffe9c5',sand:'#ffd170',flame:'#ff9d69'};
const escapeAttr=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clamp=n=>Math.max(0,Math.min(1,n));
const mix=(a,b,t)=>a+(b-a)*t;
const LANE_LABELS={top:'탑',mid:'미드',bot:'바텀'};

export function laneWaveMarkup(lane) {
 if (!lane) return '';
 return `<g class="lane-wave" aria-hidden="true">${lane.minions.map(m=>`<g data-lane-minion="${m.id}" data-lane="${m.lane}" class="${m.side}" opacity="0">${m.index===2?'<path d="M0 -6 6 0 0 6 -6 0Z"/>':'<circle r="4.8"/>'}</g>`).join('')}</g>`;
}
export function laneAttackMarkup(lane) {
 if (!lane) return '';
 return `<g class="lane-attack-layer" aria-hidden="true">${lane.actions.map((action,i)=>{
  const color=COLORS[action.color]??(action.side==='blue'?'#9be3ff':'#ff9cc4');
  const radius=action.form==='shot'?3.8:action.form==='projectile'||action.form==='returning'?6.5:0;
  return `<g data-lane-action="${i}" data-lane="${action.lane}" data-form="${action.form}" data-element="${action.element}" data-skill="${escapeAttr(action.name)}" style="--strike-color:${color}" opacity="0"><path class="lane-trail"/><circle class="lane-projectile" r="${radius}"/><circle class="lane-ring"/><path class="lane-impact"/></g>`;
 }).join('')}</g>`;
}

export function laneActionNarration(lane,progress) {
 if (!lane || progress>=.93) return null;
 const visible=a=>progress>=a.cast&&progress<a.until;
 const action=lane.actions.findLast(a=>a.lane===lane.focus&&visible(a))??(lane.quiet?lane.actions.findLast(visible):null);
 if(!action) return null;
 const who=`${LANE_LABELS[action.lane]} ${action.actorName}`;
 if(action.minion) return `${who} · ${progress>=action.land?'미니언 막타':'미니언에 평타'}`;
 const move=action.slot?`${action.slot} ${action.name}`:action.name;
 const result=progress<action.land?'':action.form==='shield'?' · 보호막':action.form==='heal'?' · 체력 회복':' 적중';
 return `${who} · ${move}${result}`;
}

export function paintLaneEffects(dom,lane,actors,progress) {
 if(!lane) return;
 const minions=sampleMinions(lane,progress),positions=Object.fromEntries([...Object.values(actors),...minions].map(a=>[a.id,a]));
 const waveNodes=dom.querySelectorAll('[data-lane-minion]');
 for(const [i,minion] of minions.entries()){
  const node=waveNodes[i];
  if(!node) continue;
  node.setAttribute('transform',`translate(${minion.x} ${minion.y})`);
  node.setAttribute('opacity',minion.visible);
 }
 const actionNodes=dom.querySelectorAll('[data-lane-action]');
 for(const [i,action]of lane.actions.entries()){
  const node=actionNodes[i];
  if(!node) continue;
  const actor=positions[action.from],victim=positions[action.target];
  const visible=actor&&victim&&progress>=action.cast&&progress<action.until;
  node.setAttribute('opacity',visible?(lane.quiet||action.lane===lane.focus?'1':'.72'):'0');
  if(!visible)continue;
  const travel=clamp((progress-action.cast)/(action.land-action.cast));
  const impact=clamp((progress-action.land)/(action.until-action.land));
  const hit=progress>=action.land;
  const trail=node.querySelector('.lane-trail'),orb=node.querySelector('.lane-projectile'),ring=node.querySelector('.lane-ring'),flash=node.querySelector('.lane-impact');
  const {x,y}=victim,dx=x-actor.x,dy=y-actor.y,d=Math.hypot(dx,dy)||1,nx=-dy/d,ny=dx/d;
  const isProjectile=['shot','projectile','returning','volley'].includes(action.form);
  let line='';
  if(isProjectile||action.form==='hook'||action.form==='dash'){
   const t=hit&&action.form==='returning'?1-impact:travel;
   const px=mix(actor.x,x,t),py=mix(actor.y,y,t);
   const tail=action.form==='hook'||action.form==='dash'?0:Math.max(0,t-.24);
   const tx=mix(actor.x,x,tail),ty=mix(actor.y,y,tail);
   line=`M${tx} ${ty} Q${(tx+px)/2+nx*5} ${(ty+py)/2+ny*5} ${px} ${py}`;
   if(action.form==='volley')for(const spread of [-12,12])line+=` M${tx+nx*spread*.35} ${ty+ny*spread*.35} L${px+nx*spread*t} ${py+ny*spread*t}`;
   orb.setAttribute('cx',px);orb.setAttribute('cy',py);
   orb.setAttribute('opacity',!hit||action.form==='returning'?.9:0);
  }else{
   const reach=action.form==='sweep'?32:20;
   if(action.form==='sweep'||action.form==='strike'){
    const cx=mix(actor.x,x,.67),cy=mix(actor.y,y,.67);
    line=`M${cx+nx*reach} ${cy+ny*reach} Q${x+dx/d*22} ${y+dy/d*22} ${cx-nx*reach} ${cy-ny*reach}`;
   }
   orb.setAttribute('opacity',0);
  }
  trail.setAttribute('d',line);trail.setAttribute('opacity',hit?Math.max(0,1-impact*1.5):1);
  const area=['field','heal','shield'].includes(action.form);
  const support=action.form==='heal'||action.form==='shield';
  const radius=action.minion?mix(5,17,impact):action.lethal?mix(17,39,impact):area?mix(20,35,impact):mix(16,31,impact);
  ring.setAttribute('cx',x);ring.setAttribute('cy',y);ring.setAttribute('r',radius);
  ring.setAttribute('opacity',hit?(1-impact)**2:area?.65:0);
  flash.setAttribute('opacity',hit&&!support?(1-impact)**2:0);
  const length=action.minion?10:action.lethal?25:17;
  flash.setAttribute('d',`M${x-length} ${y}h${length*2} M${x} ${y-length}v${length*2} M${x-length*.7} ${y-length*.7}l${length*1.4} ${length*1.4} M${x-length*.7} ${y+length*.7}l${length*1.4} -${length*1.4}`);
 }
}
