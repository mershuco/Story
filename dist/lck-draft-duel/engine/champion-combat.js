import {CHAMPION_COMBAT_PROFILES,COMBAT_PROFILE_VERSION} from './champion-combat-profiles.js';
export {CHAMPION_COMBAT_PROFILES,COMBAT_PROFILE_VERSION};
export const PHASE_MINUTES=[5,14,24,34,45];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const neutral={curve:[3,3,3,3,3],skirmish:3,teamfight:3,pick:3,siege:3,snowball:3,utility:3,note:'개별 분석 미확인: 중립값을 사용합니다.'};
export function championCombatProfile(id){return CHAMPION_COMBAT_PROFILES[id]??neutral;}
function interpolate(values,minute){
 if(minute<=PHASE_MINUTES[0])return values[0];
 for(let i=1;i<PHASE_MINUTES.length;i++)if(minute<=PHASE_MINUTES[i]){const t=(minute-PHASE_MINUTES[i-1])/(PHASE_MINUTES[i]-PHASE_MINUTES[i-1]);return values[i-1]+(values[i]-values[i-1])*t;}
 return values.at(-1);
}
export function phaseStrength(id,minute){return interpolate(championCombatProfile(id).curve,minute);}
export function fightStage(minute){return minute<14?'초반':minute<30?'중반':minute<40?'후반':'극후반';}
export function fightContext(kind='teamfight'){
 if(kind==='gank'||kind==='dive')return {skirmish:.65,pick:.35};
 if(kind==='skirmish')return {skirmish:1};
 if(kind==='siege')return {siege:.7,teamfight:.3};
 if(kind==='baron-setup')return {pick:.6,teamfight:.4};
 if(kind==='flank')return {teamfight:.7,pick:.3};
 return {teamfight:1};
}
export function championCombat(id,minute=20,kind='teamfight',stats={}){
 const p=championCombatProfile(id),k=Math.max(0,stats.k??0),d=Math.max(0,stats.d??0),a=Math.max(0,stats.a??0);
 const resources=(p.snowball-1)/4,utility=(p.utility-1)/4,net=k+a*.35-d*.9,form=Math.tanh(net/4);
 const timingShift=clamp(net*.9*(.3+.7*resources),-8,6),effectiveMinute=Math.max(0,minute+timingShift);
 // Only unlock actual growth earlier/later. Dying must never rejuvenate an early
 // champion's declining curve, and getting kills must never accelerate falloff.
 const growth=[0];for(let i=1;i<p.curve.length;i++)growth.push(growth.at(-1)+Math.max(0,p.curve[i]-p.curve[i-1]));
 const growthDelta=interpolate(growth,effectiveMinute)-interpolate(growth,minute);
 const formBonus=form>=0?form*(.18+.52*resources):form*(.2+.6*resources)*(1-.65*utility);
 const performance=growthDelta*.55+formBonus;
 const phase=phaseStrength(id,minute),context=Object.entries(fightContext(kind)).reduce((sum,[key,w])=>sum+p[key]*w,0);
 const neutralScore=(phase-3)*.7+(context-3)*.45;
 const label=form<-.2&&utility>=.75?'전과 열세 · CC·지원 가치 유지':Math.abs(performance)<.08?'전과 영향 대등':performance>0?(growthDelta>.12?'성장 가속 · 강점 강화':'전과 우세 · 강점 강화'):utility>=.75?'전과 열세 · CC·지원 가치 유지':growthDelta<-.12?'성장 지연 · 강점 발현 지연':'전과 열세 · 화력·진입 위협 감소';
 return {champion:id,k,d,a,phase,context,neutralScore,performance,score:neutralScore+performance,timingShift,effectiveMinute,label};
}
export function teamChampionCombat(members,minute,kind,stats=[],roles=null){
 const byRole=Object.fromEntries(stats.map(p=>[p.role,p]));
 const active=(members??[]).filter(([,r])=>!roles||roles.includes(r));
 const players=active.map(([id,role])=>({...championCombat(id,minute,kind,byRole[role]),role,player:byRole[role]?.player}));
 // Every participating role contributes; supports retain utility instead of
 // receiving an artificial low weight because they do not collect kills.
 const mean=key=>players.length?players.reduce((sum,p)=>sum+p[key],0)/players.length:0;
 return {neutral:mean('neutralScore'),performance:mean('performance'),players};
}
export function combatLabels(id){
 const p=championCombatProfile(id),early=p.curve[0],mid=Math.max(p.curve[1],p.curve[2]),late=p.curve.at(-1);
 return [...(early>=4?['초반 강세']:[]),...(mid>=4&&mid>late+.4?['중반 전성기']:[]),...(late>=4.5&&late>early+.5?['후반 성장']:[]),...(p.skirmish>=4.5?['소규모 교전']:[]),...(p.teamfight>=4.5?['한타 강점']:[]),...(p.pick>=4.5?['포착 강점']:[]),...(p.siege>=4.5?['공성 강점']:[]),...(p.snowball>=4.5?['성장·전과 민감']:[]),...(p.utility>=4.5?['열세에도 CC·지원']:[])];
}
