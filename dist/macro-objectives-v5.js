// Game-design personalities and secure estimates, not measured professional ratings.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const sigmoid=x=>1/(1+Math.exp(-x));
export const OBJECTIVE_NAMES={dragon:'드래곤',grubs:'공허 유충',herald:'협곡의 전령',baron:'바론',elder:'장로 드래곤'};
// aggression, objective control, side-lane preference, vision/rotation.
const STYLES={T1:['교전·측면 운영',.75,.68,.65,.78],GEN:['시야·통제·성장',.48,.9,.62,.9],HLE:['합류·정면 한타',.72,.8,.42,.75],DK:['공격·정글 난전',.87,.65,.55,.65],KT:['합류·사이드 전환',.65,.68,.83,.8],NS:['선제 교전',.77,.65,.5,.62],DRX:['유동적 소규모 교전',.68,.6,.68,.63],KDF:['사이드·자원 교환',.55,.6,.8,.65],LSB:['초반 압박·승부수',.82,.63,.6,.61],BRO:['신중한 자원 운영',.48,.65,.62,.72]};
export function macroProfile(teamId,composition={},strategy='balanced'){
 const [label,agg,obj,split,vision]=STYLES[teamId]??['균형 운영',.6,.68,.6,.68],members=composition.members??[];
 const duel=new Set(['Fiora','Jax','Tryndamere','Camille','Yorick','Nasus','Gwen','Trundle']),catchers=new Set(['Leblanc','Ahri','Nocturne','TwistedFate','Talon','Pyke','Blitzcrank','Rengar']);
 const sideCount=members.filter(([id])=>duel.has(id)).length,catchCount=members.filter(([id])=>catchers.has(id)).length;
 return {label,aggression:clamp(agg+(strategy==='early'?.2:strategy==='late'?-.18:0)+catchCount*.035,.2,.95),objective:clamp(obj+(composition.engage??0)*.025,.25,.95),split:clamp(split+sideCount*.1-(composition.engage??0)*.035,.2,.95),vision,scaling:strategy==='late'?.9:strategy==='early'?.3:.6,poke:Math.min(1,(composition.poke??0)/3),engage:Math.min(1,(composition.engage??0)/3)};
}
const SECURE={Chogath:[2.5,'포식 마무리'],Kalista:[2.2,'중첩된 창 뽑기'],Nunu:[2.2,'잡아먹기·강타 연계'],Xayah:[1.1,'설치한 깃털 회수'],Pantheon:[.5,'낮은 체력 대상 창 마무리'],LeeSin:[.6,'잃은 체력 추격 피해'],Elise:[.6,'거미형 마무리'],Kindred:[.4,'집중 타격'],Jhin:[.35,'4번째 탄환']};
export function secureTools(roster,team,stats=[],dead=[],roles=null,setup=1){
 const gone=new Set(dead),byId=Object.fromEntries(stats.map(p=>[p.player,p]));
 const tools=roster.filter(p=>p.team===team&&!gone.has(p.player)&&(!roles||roles.includes(p.role))).flatMap(p=>{
  const tool=SECURE[p.champion];if(!tool)return[];const s=byId[p.player]??{},form=clamp(((s.k??0)+.3*(s.a??0)-.8*(s.d??0))*.025,-.15,.2),prep=['Kalista','Xayah'].includes(p.champion)?setup:1;
  return[{champion:p.champion,player:p.player,reason:tool[1],value:tool[0]*(1+form)*prep}];
 }).sort((a,b)=>b.value-a.value);
 return {bonus:Math.min(3.4,(tools[0]?.value??0)+(tools[1]?.value??0)*.35),tools};
}
export function objectiveChances({blue,red,roster,stats=[],dead=[],roles=null,skills=[75,75],fightChance=.5,control='even',setup=1,visionGap=0}={}){
 const alive=id=>roster.filter(p=>p.team===id&&!dead.includes(p.player)&&(!roles||roles.includes(p.role)));
 const ba=alive(blue),ra=alive(red),bj=ba.some(p=>p.role==='JGL'),rj=ra.some(p=>p.role==='JGL');
 const bt=secureTools(roster,blue,stats,dead,roles,setup),rt=secureTools(roster,red,stats,dead,roles,setup);
 const smiteGap=(bj?skills[0]:0)-(rj?skills[1]:0),burstGap=bt.bonus-rt.bonus;
 const finish=(base)=>!ba.length?0:!ra.length?1:clamp(sigmoid(base+smiteGap*.026+burstGap*.42+visionGap*.25),.015,.985);
 const win=finish(2.5),lose=finish(-2.5),race=finish(Math.log(clamp(fightChance,.02,.98)/(1-clamp(fightChance,.02,.98)))*.35);
 const blueChance=control==='blue'?win:control==='red'?lose:control==='rush'?race:fightChance*win+(1-fightChance)*lose;
 return {blueChance,blueIfWin:win,blueIfLose:lose,blueSmite:bj?skills[0]:0,redSmite:rj?skills[1]:0,blueTools:bt.tools,redTools:rt.tools,blueJunglerAlive:bj,redJunglerAlive:rj};
}
export function automaticObjectiveDecision({chance,kind,ownDragons=0,enemyDragons=0,macro}){
 const urgent=kind==='elder'||(kind==='dragon'&&(enemyDragons>=3||ownDragons>=3));
 const threshold=(urgent?.23:.37)+(macro.scaling-.5)*.11-(macro.aggression-.5)*.15-(macro.objective-.5)*.12;
 return chance>=threshold?'contest':'trade';
}
