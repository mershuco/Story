// Standard Summoner's Rift (not Swiftplay): base level table + game-time factor.
const base=[10,10,12,12,14,16,20,25,28,32.5,35,37.5,40,42.5,45,47.5,50,52.5];
export function deathTimerSeconds(level,minute){
 const steps=(start,end)=>Math.ceil(Math.max(0,Math.min(minute,end)-start)*2);
 const factor=Math.min(.5,steps(15,30)*.00425+steps(30,45)*.003+steps(45,55)*.0145);
 return Math.round(base[Math.max(0,Math.min(17,Math.floor(level??1)-1))]*(1+factor)*100)/100;
}
