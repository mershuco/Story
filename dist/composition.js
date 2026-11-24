import {teamChampionCombat,phaseStrength} from './champion-combat.js';
// Game estimates of team composition, not official champion win-rate statistics.
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const set=s=>new Set(s.split(' '));
const POKE=set('Jayce Zoe Nidalee Ezreal Varus Ziggs Xerath Velkoz Lux Corki Hwei Karma Caitlyn');
const PEEL=set('Janna Lulu Braum Alistar Nami Milio Renata Thresh Taric Zilean Poppy Gragas Seraphine');
const ENGAGE=set('Amumu Alistar Ashe Diana Fiddlesticks Galio Gnar Gragas Hecarim JarvanIV Kennen Leona Lissandra Malphite Maokai Nautilus Nocturne Ornn Rakan Rell Sejuani Sett Sion Skarner Vi MonkeyKing Zac Neeko Yone');
const SCALE=set('AurelionSol Aphelios Azir Cassiopeia Gwen Jax Jinx Kassadin Kayle KogMaw Kindred Nasus Ornn Ryze Senna Smolder Sona Tristana Twitch Veigar Viktor Vladimir Vayne Zeri Yunara');
const EARLY=set('Elise LeeSin Renekton Jayce Nidalee Lucian Draven Kalista Pantheon RekSai Olaf Leblanc XinZhao Pyke Quinn');
const DPS=set('Azir Cassiopeia Ryze Karthus Gwen Fiora Jax MasterYi Yasuo Yone Tryndamere Viego Kayle');
const DIVE=set('Akali Camille Diana Ekko Hecarim Irelia JarvanIV Jax Kaisa Kled LeeSin Nocturne Rengar Vi XinZhao Yone Zed Ambessa');
const roleWeight={TOP:1,JGL:.85,MID:1.3,BOT:1.5,SUP:.3};
export function compositionProfile(picks,champMap){
 const p={frontline:0,engage:0,peel:0,poke:0,dps:0,dive:0,cc:0,scaling:0,tempo:0,magicShare:0,damageBalance:0};let magic=0,total=0;
 for(const pick of picks){
  const c=champMap[pick.champion];if(!c)continue;const id=c.id,f=c.features??{},classes=c.classes??[],has=x=>classes.includes(x),r=pick.role,w=roleWeight[r]??1;
  p.frontline+=f.tank||has('Tank')?1:has('Fighter')?(['TOP','JGL'].includes(r)?.6:.35):0;
  p.engage+=f.engage||ENGAGE.has(id)?1:0;p.peel+=f.protect||PEEL.has(id)?1:0;p.poke+=POKE.has(id)?1:0;
  p.dps+=has('Marksman')?1:DPS.has(id)?.85:0;p.dive+=DIVE.has(id)||has('Assassin')?1:0;
  p.cc+=f.engage||ENGAGE.has(id)?1:PEEL.has(id)||has('Mage')?.45:0;
  p.scaling+=f.scale||SCALE.has(id)?(r==='SUP'?.5:1):0;p.tempo+=EARLY.has(id)?1:0;
  const ratio=['Kaisa','Corki','Jax','Yone','Varus','Volibear','Warwick'].includes(id)?.5:f.ap||has('Mage')?.85:has('Tank')?.45:.1;
  magic+=ratio*w;total+=w;
 }
 p.members=picks.filter(p=>champMap[p.champion]).map(p=>[p.champion,p.role]).sort((a,b)=>a[1].localeCompare(b[1])||a[0].localeCompare(b[0]));
 p.magicShare=total?magic/total:.45;p.damageBalance=clamp(1-Math.abs(p.magicShare-.45)/.45,0,1);return p;
}
export function compositionQuality(p,minute=20,kind='teamfight'){
 const front=clamp(p.frontline,0,2),engage=clamp(p.engage,0,1.5),peel=clamp(p.peel,0,1.5),dps=clamp(p.dps,0,1.8);
 return .7*p.damageBalance+.55*front+.5*engage+.45*peel+.55*dps+.25*clamp(p.cc,0,2)+.22*peel*dps+(kind==='siege'?.4*p.poke:0);
}
export function compositionMatchup(blue,red,minute=20,kind='teamfight',{blueStats=[],redStats=[],roles=null}={}){
 if(!blue||!red)return {gap:0,blueScore:0,redScore:0,phaseGap:0,formGap:0,driver:null};
 const versus=(own,enemy)=>.28*Math.min(own.engage,2)*Math.min(enemy.poke,2)+.3*Math.min(own.peel,2)*Math.min(enemy.dive,2)+.25*Math.min(own.poke,2)*clamp(1.5-enemy.frontline,0,1.5)+.32*Math.min(own.frontline,2)*(1-enemy.damageBalance);
 // Small fights use the champions actually present; an absent late-game carry
 // must not decide a top-side 3v3 through the full team's composition bonuses.
 const small=roles?.length<5||['gank','dive','skirmish'].includes(kind);
 const structureA=small?0:compositionQuality(blue,minute,kind)+versus(blue,red),structureB=small?0:compositionQuality(red,minute,kind)+versus(red,blue);
 const a=teamChampionCombat(blue.members,minute,kind,blueStats,roles),b=teamChampionCombat(red.members,minute,kind,redStats,roles);
 const phaseGap=a.neutral-b.neutral,formGap=a.performance-b.performance;
 const drivers=[...a.players.map(p=>({...p,side:'blue'})),...b.players.map(p=>({...p,side:'red'}))].sort((a,b)=>Math.abs(b.performance)-Math.abs(a.performance)||a.champion.localeCompare(b.champion));
 const driver=drivers.find(p=>Math.abs(p.performance)>=.08)??null;
 return {gap:structureA-structureB+phaseGap*2.6+formGap*5,blueScore:structureA+a.neutral*2.6+a.performance*5,redScore:structureB+b.neutral*2.6+b.performance*5,phaseGap,formGap,driver};
}
export function compositionLabels(p){
 const delta=p.members?.length?p.members.reduce((sum,[id])=>sum+phaseStrength(id,45)-phaseStrength(id,8),0)/p.members.length:0;
 return [p.frontline>=1.2?'전방 안정':'전방 부족',p.engage>=1?'진입 가능':'진입 부족',p.peel>=1?'딜러 보호':'보호 부족',p.dps>=1?'지속딜 확보':'지속딜 부족',p.damageBalance>=.6?'피해 유형 균형':'피해 유형 편중',delta>=.7?'후반 성장형':delta<=-.7?'초반 주도형':'균형 성장',...(p.poke>=2?['포킹 특화']:[])];
}
