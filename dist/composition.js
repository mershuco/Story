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
 p.magicShare=total?magic/total:.45;p.damageBalance=clamp(1-Math.abs(p.magicShare-.45)/.45,0,1);return p;
}
export function compositionQuality(p,minute=20,kind='teamfight'){
 const late=clamp((minute-12)/28,0,1),front=clamp(p.frontline,0,2),engage=clamp(p.engage,0,1.5),peel=clamp(p.peel,0,1.5),dps=clamp(p.dps,0,1.8);
 return .7*p.damageBalance+.55*front+.5*engage+.45*peel+.55*dps+.25*clamp(p.cc,0,2)+.22*peel*dps+.5*p.scaling*late+.3*p.tempo*(1-late)-.12*p.scaling*(1-late)+(kind==='siege'?.4*p.poke:0);
}
export function compositionMatchup(blue,red,minute=20,kind='teamfight'){
 if(!blue||!red)return {gap:0,blueScore:0,redScore:0};
 const versus=(own,enemy)=>.28*Math.min(own.engage,2)*Math.min(enemy.poke,2)+.3*Math.min(own.peel,2)*Math.min(enemy.dive,2)+.25*Math.min(own.poke,2)*clamp(1.5-enemy.frontline,0,1.5)+.32*Math.min(own.frontline,2)*(1-enemy.damageBalance);
 const a=compositionQuality(blue,minute,kind)+versus(blue,red),b=compositionQuality(red,minute,kind)+versus(red,blue),context=['gank','dive','skirmish'].includes(kind)?.6:1;
 return {gap:(a-b)*context,blueScore:a,redScore:b};
}
export function compositionLabels(p){return [p.frontline>=1.2?'전방 안정':'전방 부족',p.engage>=1?'진입 가능':'진입 부족',p.peel>=1?'딜러 보호':'보호 부족',p.dps>=1?'지속딜 확보':'지속딜 부족',p.damageBalance>=.6?'피해 유형 균형':'피해 유형 편중',p.scaling>=2?'후반 성장형':p.tempo>=2?'초반 주도형':'균형 성장',...(p.poke>=2?['포킹 특화']:[])];}
