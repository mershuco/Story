// Deterministic motion and effects for early-game highlights.
const LANES = {
 top: {roles: ['TOP'], points: [[78, 184], [79, 113], [99, 89], [131, 77], [202, 78]]},
 mid: {roles: ['MID'], points: [[219, 381], [300, 300], [381, 219]]},
 bot: {roles: ['BOT', 'SUP'], points: [[400, 521], [472, 521], [503, 507], [520, 475], [521, 403]]},
};
const LANE_NAMES=Object.keys(LANES);
const ROLE_LANE=Object.fromEntries(Object.entries(LANES).flatMap(([lane,{roles}])=>roles.map(role=>[role,lane])));
const LANE_SCENES = new Set(['laning','solo-kill','duo-kill','gank','skirmish','dive']);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const smooth = t => t * t * (3 - 2 * t);
const ratio = (p, start, end) => clamp((p - start) / (end - start), 0, 1);
const mix = (a,b,t) => a + (b - a) * t;
const sideSign = side => side === 'blue' ? -1 : 1;
// Data Dragon 16.23.1 attack ranges, with the form shown for Gnar and Jayce.
const RANGED = new Set('Ahri Akshan Anivia Annie Aphelios Ashe AurelionSol Aurora Azir Bard Brand Caitlyn Cassiopeia Corki Draven Elise Ezreal Fiddlesticks Gnar Graves Heimerdinger Hwei Ivern Janna Jayce Jhin Jinx Kaisa Kalista Karma Karthus Kennen Kindred KogMaw Leblanc Lissandra Lucian Lulu Lux Malzahar Mel Milio MissFortune Morgana Nami Neeko Nidalee Orianna Quinn Renata Ryze Samira Senna Seraphine Sivir Smolder Sona Soraka Swain Syndra Taliyah Teemo Thresh Tristana TwistedFate Twitch Urgot Varus Vayne Veigar Velkoz Vex Viktor Vladimir Xayah Xerath Yunara Yuumi Zeri Ziggs Zilean Zoe Zyra'.split(' '));

const SIGNATURES = {
 Ahri: ['Q','returning','pearl'], Ambessa: ['Q','sweep','flame'], Annie: ['Q','projectile','flame'],
 Ashe: ['W','volley','frost'], Azir: ['Q','volley','sand'], Bard: ['Q','projectile','sand'],
 Caitlyn: ['Q','projectile','pearl'], Camille: ['Q','strike','steel'], Chogath: ['Q','field','violet'],
 Darius: ['Q','sweep','steel'], Draven: ['Q','projectile','steel'], Ezreal: ['Q','projectile','arcane'],
 Galio: ['Q','field','pearl'], Gnar: ['Q','returning','sand'], Gragas: ['Q','field','violet'],
 Jayce: ['Q','projectile','arcane'], Jhin: ['W','projectile','violet'], Jinx: ['W','projectile','arcane'],
 Kaisa: ['W','projectile','violet'], Kalista: ['Q','projectile','green'], Karma: ['Q','projectile','green'],
 KSante: ['Q','sweep','sand'], Leblanc: ['W','dash','violet'], Leona: ['E','dash','sand'],
 LeeSin: ['Q','projectile','pearl'], Lucian: ['Q','projectile','pearl'], Lulu: ['Q','volley','violet'],
 Lux: ['E','field','pearl'], Morgana: ['Q','projectile','violet'], Nami: ['Q','field','arcane'],
 Nautilus: ['Q','hook','arcane'], Nidalee: ['Q','projectile','sand'], Orianna: ['Q','projectile','arcane'],
 Ornn: ['W','sweep','flame'], Poppy: ['Q','field','sand'], Rakan: ['W','dash','pearl'],
 Rell: ['W','dash','steel'], Renekton: ['Q','sweep','green'], Rumble: ['Q','sweep','flame'],
 Sion: ['Q','field','steel'], Smolder: ['Q','projectile','flame'], Sylas: ['Q','field','violet'],
 Taliyah: ['Q','volley','sand'], Thresh: ['Q','hook','green'], Varus: ['Q','projectile','violet'],
 Vi: ['Q','dash','steel'], Xayah: ['Q','volley','violet'], Yasuo: ['Q','strike','arcane'],
 Yone: ['Q','strike','flame'], Yunara: ['W','projectile','pearl'], Zed: ['Q','volley','steel'],
};
const SUPPORT_SPELLS = {Braum:['W','shield'], Ivern:['E','shield'], Janna:['E','shield'], Karma:['E','shield'],
 Lulu:['E','shield'], Milio:['E','shield'], Nami:['W','heal'], Rakan:['E','shield'], Renata:['E','shield'],
 Senna:['Q','heal'], Seraphine:['W','shield'], Sona:['W','heal'], Soraka:['W','heal'], Taric:['Q','heal'], Yuumi:['E','shield']};

function kitFor(champion, patch) {
 const kits = champion?.kits;
 if (!kits) return [];
 if (kits[patch]?.spells) return kits[patch].spells;
 const order = version => version.split('.').reduce((n,v) => n * 1000 + Number(v), 0);
 const versions = Object.keys(kits).sort((a,b) => order(a)-order(b));
 const version = versions.filter(v => order(v)<=order(patch ?? '0')).at(-1) ?? versions[0];
 return kits[version]?.spells ?? [];
}
function spellShape(description) {
 if (/갈고리|끌어당깁니다/.test(description)) return 'hook';
 if (/돌진|도약/.test(description)) return 'dash';
 if (/투사체|발사|던집니다|쏘아/.test(description)) return 'projectile';
 if (/휘둘|휘두|베어/.test(description)) return 'sweep';
 if (/범위|지면|지역|폭발|원형/.test(description)) return 'field';
 return 'strike';
}
function signature(actor, champions, patch, index) {
 const spellbook = kitFor(champions[actor.champion], patch);
 const [slot,form,color] = SIGNATURES[actor.champion] ?? [];
 const fixed = spellbook.find(s => s.slot === slot);
 if (fixed) return {slot,form,color,name:fixed.name,element:'skill'};
 const damaging = spellbook.filter(s => s.slot !== 'R' && /피해/.test(s.description));
 const spell = damaging[index % damaging.length];
 if (spell) return {slot:spell.slot,form:spellShape(spell.description),color:'arcane',name:spell.name,element:'skill'};
 return basicAttack(actor);
}
function basicAttack(actor) {
 return {form:RANGED.has(actor.champion)?'shot':'strike',color:'basic',name:'평타',element:'basic'};
}
function supportAction(actor, champions, patch) {
 const [slot,form] = SUPPORT_SPELLS[actor?.champion] ?? [];
 const spell = slot && kitFor(champions[actor.champion],patch).find(s=>s.slot===slot);
 return spell ? {slot,form,color:'green',name:spell.name,element:'skill'} : null;
}
export function hasLanePlayback(scene) {
 return scene.minute < 15 && !!LANES[scene.location] && LANE_SCENES.has(scene.kind);
}
function pathFor(lane) {
 const points = LANES[lane].points;
 const lengths = points.slice(1).map((p,i) => Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
 return {points,lengths,total:lengths.reduce((a,b)=>a+b,0)};
}
function lanePoint(path, distance, lateral = 0) {
 let remaining = clamp(path.total/2+distance,0,path.total);
 for (let i=0;i<path.lengths.length;i++) {
  const length=path.lengths[i];
  if (remaining<=length) {
   const [a,b]=path.points.slice(i,i+2),t=remaining/length;
   return [mix(a[0],b[0],t)-(b[1]-a[1])*lateral/length,mix(a[1],b[1],t)+(b[0]-a[0])*lateral/length];
  }
  remaining-=length;
 }
 return path.points.at(-1);
}
function actorLane(scene,actor) {
 if(actor.alreadyDead)return null;
 return scene.kind!=='laning'&&actor.involved?scene.location:ROLE_LANE[actor.role];
}
export function laneActorTarget(scene, actor) {
 if(!hasLanePlayback(scene))return null;
 const lane=actorLane(scene,actor);
 if(!lane)return null;
 const sign=sideSign(actor.side), distance=RANGED.has(actor.champion)?44:27;
 return lanePoint(pathFor(lane),sign*(distance+(actor.role==='SUP'?4:0)),actor.role==='BOT'?sign*14:actor.role==='SUP'?-sign*24:actor.role==='JGL'?sign*24:0);
}

export function buildLanePlayback(scene, {champions={},patch,previousHealth={}}={}) {
 if (!hasLanePlayback(scene)) return null;
 const quiet=scene.kind==='laning', focus=scene.location;
 const locations=Object.fromEntries(scene.actors.map(a=>[a.id,actorLane(scene,a)]));
 const active=scene.actors.filter(a=>locations[a.id]);
 const actions=[], outgoing=Object.fromEntries(active.map(a=>[a.id,[]]));
 const deathSpacing=Math.min(.055,.24/Math.max(1,scene.kills.length-1));
 const deathAt=Object.fromEntries(scene.kills.map((k,i)=>[k.victim,.69+i*deathSpacing]));
 const actorsById=Object.fromEntries(active.map(a=>[a.id,a]));
 const add=(actor,target,cast,land,style,extra={})=>{
  if (!actor||!target||!style || cast>=(deathAt[actor.id]??1) || (!extra.lethal&&land>=(deathAt[target]??1))) return;
  const action={...style,from:actor.id,target,cast,land,until:Math.min(.995,land+.16),side:actor.side,lane:locations[actor.id],
   actorName:champions[actor.champion]?.name??actor.champion,...extra};
  actions.push(action);outgoing[actor.id].push(action);
 };
 const paths=Object.fromEntries(LANE_NAMES.map(lane=>[lane,pathFor(lane)]));
 const minions=LANE_NAMES.flatMap(lane=>['blue','red'].flatMap(side=>
  Array.from({length:3},(_,index)=>({id:`${lane}-${side}-minion-${index}`,lane,side,index}))));
 const index=Math.round(scene.second/11);
 const mainActor=side=>side.find(a=>a.role!=='SUP'&&a.role!=='JGL')??side[0];
 for(const [laneIndex,lane] of LANE_NAMES.entries()){
  const nearby=active.filter(a=>locations[a.id]===lane);
  const sides=['blue','red'].map(side=>nearby.filter(a=>a.side===side));
  if((index+laneIndex)%2)sides.reverse();
  const [first,second]=sides;
  const [attacker,other]=[mainActor(first),mainActor(second)];
  const offset=(laneIndex-1)*.025;
  // Slightly offset each lane while keeping their trades visible at the same time.
  const hitMinion=(laner,number,cast,land)=>add(laner,`${lane}-${laner.side==='blue'?'red':'blue'}-minion-${number}`,
   cast+offset,land+offset,basicAttack(laner),{minion:true});
  if(attacker)hitMinion(attacker,0,.075,.17);
  if(other)hitMinion(other,1,.165,.26);
  if(!attacker||!other)continue;
  const farming=quiet||lane!==focus;
  const trade=farming?[[attacker,other,.26,.37],[other,attacker,.43,.54]]:
   [[attacker,other,.255,.36],[other,attacker,.405,.513]];
  trade.forEach(([from,to,cast,land],i)=>add(from,to.id,cast+offset,land+offset,signature(from,champions,patch,index+i),{damage:farming?9+i*2:13+i*3}));
  const support=second.find(a=>a.role==='SUP');
  if (farming&&support) {
   const protect=supportAction(support,champions,patch);
   if (protect&&support!==other) add(support,other.id,.59+offset,.64+offset,protect);
   else add(support,attacker.id,.59+offset,.675+offset,signature(support,champions,patch,index),{damage:7});
  }
  if(farming)hitMinion(attacker,2,.74,.84);
 }
 // Current fights use the actual killer, assistant and victim IDs from the event.
 for (const [i,kill] of scene.kills.entries()) {
  const killer=actorsById[kill.killer],victim=actorsById[kill.victim],land=deathAt[kill.victim];
  if (!killer||!victim) continue;
  const helper=kill.assists.map(id=>actorsById[id]).find(Boolean);
  if (helper) add(helper,victim.id,Math.min(.49+i*.04,(deathAt[helper.id]??1)-.055),land-.065,
   signature(helper,champions,patch,index+i),{damage:12});
  const cast=Math.min(land-.133,(deathAt[killer.id]??1)-.075);
  add(killer,victim.id,cast,land,i%2?basicAttack(killer):signature(killer,champions,patch,index+i),{lethal:true});
 }
 actions.sort((a,b)=>a.land-b.land);
 const health=Object.fromEntries(active.map(a=>[a.id,a.respawn?88:clamp((previousHealth[a.id]??100)+13,20,100)]));
 return {paths,focus,quiet,active:active.map(a=>a.id),actions,outgoing,minions,deathAt,health};
}

export function laneHealth(lane, actor, progress) {
 const base=lane.health[actor.id];
 if (base===undefined) return null;
 let hp=base;
 for (const hit of lane.actions) {
  if (hit.land>progress) break;
  if (hit.target!==actor.id) continue;
  if (hit.lethal) return 0;
  if (hit.form==='heal') hp=Math.min(100,hp+13);
  if (hit.damage) hp=Math.max(10,hp-hit.damage);
 }
 return hp;
}

export function sampleLaneActors(lane, actors, progress) {
 if (!lane) return actors;
 const byId = Object.fromEntries(actors.map(a=>[a.id,a]));
 for (const actor of actors) {
  const hp=laneHealth(lane,actor,progress);
  if (hp===null) continue;
  actor.hp=hp;
  actor.visibleDeath=actor.alreadyDead||progress>=(lane.deathAt[actor.id]??2);
  if (actor.visibleDeath) {actor.hp=0;continue;}
  const sign=sideSign(actor.side);
  // Each turn in a trade shifts forward briefly, then returns along the lane.
  const edge=Math.sin(progress*Math.PI);
  const sidestep=Math.sin(progress*Math.PI*5+(actor.role==='SUP'?1:0))*edge*5;
  const strike=lane.outgoing[actor.id].find(a=>progress>=a.cast-.025&&progress<=a.land+.12);
  if (strike) {
   const target=byId[strike.target];
   const step=progress<=strike.land?smooth(ratio(progress,strike.cast-.025,strike.land)):1-smooth(ratio(progress,strike.land,strike.land+.12));
   if (target) {
    const share=strike.form==='dash'?.7:['strike','sweep'].includes(strike.form)?.45:.16;
    actor.x+=clamp(target.to[0]-actor.to[0],-100,100)*share*step;
    actor.y+=clamp(target.to[1]-actor.to[1],-100,100)*share*step;
   } else actor.x-=sign*6*step;
  }
  const impact=lane.actions.find(a=>a.target===actor.id&&a.damage&&progress>=a.land&&progress<a.land+.12);
  if(impact){
   const source=byId[impact.from],recoil=Math.sin(ratio(progress,impact.land,impact.land+.12)*Math.PI)*.15;
   actor.x+=clamp(actor.to[0]-source.to[0],-75,75)*recoil;
   actor.y+=clamp(actor.to[1]-source.to[1],-75,75)*recoil;
  }
  actor.x=clamp(actor.x+sidestep,25,575);
  actor.y=clamp(actor.y+sign*sidestep*.55,25,575);
 }
 return actors;
}
export function sampleMinions(lane, progress) {
 return lane.minions.map(m=>{
  const sign=sideSign(m.side),advance=smooth(ratio(progress,0,.22));
  const d=sign*(mix(68,6,advance)+m.index*9);
  const [x,y]=lanePoint(lane.paths[m.lane],d,(m.index-1)*8+sign*4);
  const lastHit=lane.actions.find(a=>a.minion&&a.target===m.id);
  const visible=lastHit?1-ratio(progress,lastHit.land,lastHit.land+.09):1;
  return {...m,x,y,visible};
 });
}
