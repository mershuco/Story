// Verified objective mechanics translated to game estimates; these scores are
// not observed LCK win rates or a frame-by-frame LoL damage/health simulation.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
export const DRAKES={
 infernal:{name:'화염',stack:'공격력·주문력 강화',soul:'공격 시 주기적인 폭발 피해',color:'#ef805f'},
 mountain:{name:'대지',stack:'방어력·마법 저항력 강화',soul:'비전투 후 재충전되는 보호막',color:'#c9ab75'},
 ocean:{name:'바다',stack:'잃은 체력 지속 회복',soul:'적에게 피해를 주면 체력·마나 회복',color:'#65c8b1'},
 cloud:{name:'바람',stack:'둔화 저항·비전투 이동 속도',soul:'이동 속도 증가·궁극기 사용 후 가속',color:'#b8d9e4'},
 hextech:{name:'마법공학',stack:'스킬 가속·공격 속도 강화',soul:'연쇄 번개 피해·둔화',color:'#a49bff'},
 chemtech:{name:'화학공학',stack:'강인함·회복 및 보호막 효과 강화',soul:'낮은 체력에서 피해 증폭·피해 감소',color:'#b3ce60'}
};
export const DRAKE_TYPES=Object.keys(DRAKES);
export function initializeObjectives(s,rng){
 s.drakeHistory=[];s.riftType=null;s.dragonType=DRAKE_TYPES[Math.floor(rng()*DRAKE_TYPES.length)];
 s.drakeStacks=Object.fromEntries(s.teams.map(id=>[id,Object.fromEntries(DRAKE_TYPES.map(type=>[type,0]))]));
 s.buffHolders={baron:Object.fromEntries(s.teams.map(id=>[id,[]])),elder:Object.fromEntries(s.teams.map(id=>[id,[]]))};
}
export function takeDragon(s,owner,rng){
 if(s.soul)throw Error('영혼 획득 후에는 원소용이 등장하지 않습니다.');
 const type=s.dragonType;s.drakeStacks[owner][type]++;s.dragons[owner]++;s.drakeHistory.push(type);
 if(s.dragons[owner]===4){s.soul=owner;s.timers.dragon=null;s.timers.elder=s.clock+6;return {type,soul:true};}
 if(s.drakeHistory.length<3){
  const pool=DRAKE_TYPES.filter(type=>!s.drakeHistory.includes(type));s.dragonType=pool[Math.floor(rng()*pool.length)];
  if(s.drakeHistory.length===2)s.riftType=s.dragonType;
 }else s.dragonType=s.riftType;
 return {type,soul:false};
}
export function grantTemporaryBuff(s,kind,owner,dead=[]){
 const duration=kind==='baron'?3:2.5;
 s[kind+'Until'][owner]=s.clock+duration;
 s.buffHolders[kind][owner]=s.stats.filter(p=>p.team===owner&&!dead.includes(p.player)&&!((s.respawnAt?.[p.player]??0)>s.clock)).map(p=>p.player);
}
export function loseBuffsOnDeath(s,dead){for(const kind of ['baron','elder'])for(const id of s.teams)s.buffHolders[kind][id]=s.buffHolders[kind][id].filter(pid=>!dead.includes(pid));}
export function buffCoverage(s,kind,id,minute=s.clock,roles=null){
 if(!(s[kind+'Until']?.[id]>minute))return 0;
 const players=s.stats.filter(p=>p.team===id&&(!roles||roles.includes(p.role)));
 return players.length?players.filter(p=>s.buffHolders[kind][id].includes(p.player)).length/players.length:0;
}
export function objectivePower(s,id,minute=s.clock,kind='teamfight',roles=null){
 const profile=id===s.input.blue?s.input.compositionBlue:s.input.compositionRed,c=profile??{},st=s.drakeStacks[id];
 const longFight=!roles||roles.length>=4,front=clamp(c.frontline??1,0,3),peel=clamp(c.peel??0,0,3),dps=clamp(c.dps??1,0,3),engage=clamp(c.engage??1,0,3);
 // battleFactors divides by 9. E.g. a full Elder team adds 1.55 to
 // log-odds (~82% from an otherwise equal fight), never a guaranteed win.
 const stacks=st.infernal*(.48+dps*.09)+st.mountain*(.4+front*.12)+st.ocean*(longFight?.68:.32)+st.cloud*(['gank','flank','skirmish'].includes(kind)?.8:.38)+st.hextech*(.5+dps*.11)+st.chemtech*(.4+peel*.14);
 const souls={infernal:4.8+dps*.4,mountain:4.5+front*.45,ocean:longFight?6.2+peel*.3:3.8,cloud:engage*.6+(['flank','gank'].includes(kind)?5.6:4.2),hextech:5.8+engage*.2,chemtech:5+front*.5};
 const soul=s.soul===id?(souls[s.riftType]??0):0,baron=buffCoverage(s,'baron',id,minute,roles)*(kind==='siege'?5.5:2),elder=buffCoverage(s,'elder',id,minute,roles)*13.95;
 return {stacks,soul,baron,elder,total:stacks+soul+baron+elder};
}
export function structurePressure(s,id,minute=s.clock){
 // Permanent grub tower damage + mite at 3; Baron empowers waves only while
 // holders remain. This affects converting pressure to structures, not kill gold.
 return s.grubs[id]*.07+(s.grubs[id]>=3?.16:0)+buffCoverage(s,'baron',id,minute)*.65;
}
export function objectiveSnapshot(s){
 return {stacks:structuredClone(s.drakeStacks),rift:s.riftType,next:s.soul?'elder':s.dragonType,soul:s.soul,
  baron:s.teams.map(id=>[Math.round(s.baronUntil[id]*60),s.buffHolders.baron[id].length]),elder:s.teams.map(id=>[Math.round(s.elderUntil[id]*60),s.buffHolders.elder[id].length])};
}
export function objectiveRewardText(p){
 if(p.kind==='dragon'){const d=DRAKES[p.dragonType];return `${d?.name??''}용 · ${d?.stack??'영구 강화'}. ${p.riftType?`${DRAKES[p.riftType].name} 영혼: ${DRAKES[p.riftType].soul}. `:''}한 팀이 종류 합산 4용을 먹으면 영혼을 얻고, 6분 뒤 장로용으로 전환됩니다.`;}
 if(p.kind==='elder')return '장로용: 150초 동안 지속 화상·체력 20% 미만 처형. 한타와 마무리에 매우 강력하며 보유자가 죽으면 효과를 잃습니다.';
 if(p.kind==='baron')return '바론: 180초 동안 공격력·주문력, 미니언 강화, 4초 귀환. 공성·사이드 압박이 강해지며 보유자가 죽으면 효과를 잃습니다.';
 if(p.kind==='grubs')return '유충: 획득 수에 따라 포탑 지속 피해 증가. 3마리를 독식하면 공허 진드기까지 소환해 공성이 더 강해집니다.';
 return '';
}
