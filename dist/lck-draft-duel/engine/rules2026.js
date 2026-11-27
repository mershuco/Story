//2026 competition format. Isolated from the2022-roster/2025-format save profile.
import * as E from './engine.js?v=345ebe2e4f45';
const W=m=>m.winner,L=m=>m.teams.find(id=>id!==m.winner);
const regions=['LCK','LPL','LEC','LCS','LCP','CBLOL'];
const ownYear=(s,m)=>m.id.startsWith(s.year+'-');
const strength=(s,r)=>Object.values(s.teams).filter(t=>t.region===r).sort((a,b)=>E.power(s,b.id)-E.power(s,a.id)).map(t=>t.id);
const unique=a=>[...new Set(a)];
function phase(s,key,title,pairs,dates,competition,bestOf=5,description=''){
 E.addPhase(s,key,title,[pairs],bestOf,competition,{start:E.anchor(s,dates[0]),description});
 const matches=s.matches.filter(m=>ownYear(s,m)&&m.phase===key);
 matches.forEach((m,i)=>{const nominal=`${s.year}-${dates[Math.min(i,dates.length-1)]}`,date=competition==='SEASON_PO'&&s.secondHalfRounds===3?E.dayAdd(nominal,14):nominal;m.date=date>s.date?date:E.dayAdd(s.date,1);m.firstSelectionRights=['CUP_PIF','CUP26_L1','CUP26_UF','SEASON26_L1','SEASON26_UF'].includes(key)?m.teams[Math.floor(E.random(s)*2)]:m.teams[0];});return matches;
}
function shuffled(s,values){const a=[...values];for(let i=a.length-1;i>0;i--){const j=Math.floor(E.random(s)*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function start2026Cup(s,groups){
 s.cupTiebreak=null;
 const pairs=[];for(let offset=1;offset<5;offset++)for(let i=0;i<5;i++)pairs.push([groups[0][i],groups[1][(i+offset)%5]]);
 for(let i=4;i>=0;i--)pairs.push([groups[0][i],groups[1][i]]);
 const dates=pairs.map((_,i)=>i<10?`01-${14+Math.floor(i/2)}`:i<20?`01-${21+Math.floor((i-10)/2)}`:i===24?'02-01':`01-${28+i-20}`);
 const matches=phase(s,'CUP_GROUP','LCK CUP · 그룹 배틀 / 슈퍼 위크',pairs,dates,'CUP',3,'1·2주 BO3 승리1점 · 3주 슈퍼 위크는 동일 선발 시드끼리 BO5, 승리 그룹2점. 팀 개인 전적은1승입니다.');
 matches.forEach((m,i)=>{m.bestOf=i>=20?5:3;m.groupPoints=i>=20?2:1;m.superWeek=i>=20;});
}
export function groupPoints(s,ids){return s.matches.filter(m=>ownYear(s,m)&&m.phase==='CUP_GROUP'&&m.status==='done'&&ids.includes(m.winner)).reduce((n,m)=>n+(m.groupPoints??1),0);}
function qualified(s,kind){
 const counts=kind==='FST'?{LCK:2,LPL:2,LEC:1,LCS:1,LCP:1,CBLOL:1}:kind==='MSI'?{LCK:2,LPL:2,LEC:2,LCS:2,LCP:2,CBLOL:1}:{LCK:3,LPL:3,LEC:3,LCS:3,LCP:3,CBLOL:2};
 const byRegion=Object.fromEntries(regions.map(r=>[r,(r==='LCK'?(kind==='FST'?[s.cupChampion,s.cupRunner]:kind==='MSI'?s.msiSeeds:s.worldsSeeds):strength(s,r)).slice(0,counts[r])]));
 if(kind==='WORLDS')for(const r of s.international.extraWorldRegions){const pool=r==='LCK'?s.worldsSeeds:strength(s,r);const extra=pool.find(id=>!byRegion[r].includes(id));if(extra)byRegion[r].push(extra);}
 return byRegion;
}
export function begin2026International(s,kind){
 if(kind==='FST'){
  const b=qualified(s,kind),others=shuffled(s,[b.LEC[0],b.LCS[0],b.LCP[0],b.CBLOL[0]]),groups=[[b.LCK[0],b.LPL[1],others[0],others[1]],[b.LPL[0],b.LCK[1],others[2],others[3]]];
  s.international.fstParticipants=Object.values(b).flat();s.international.fstGroups=groups;
  phase(s,'FST26_R1','First Stand · 그룹 첫 경기',groups.flatMap(g=>[[g[0],g[1]],[g[2],g[3]]]),['03-16','03-16','03-17','03-17'],'FST',5,'8팀 · 지역 중복 없는4팀 GSL그룹2개. 모든 경기BO5, 그룹별2팀 진출.');return;
 }
 if(kind==='MSI'){
  const b=qualified(s,kind),ids=Object.values(b).flat(),rank=unique(s.international.fstRanking.map(id=>E.team(s,id).region));
  const byeRegion=rank.find(r=>b[r].length===2),direct=[...regions.map(r=>b[r][0]),b[byeRegion][1]],pi=ids.filter(id=>!direct.includes(id));
  s.international.msiParticipants=ids;s.international.msiDirect=direct;s.international.msiByeRegion=byeRegion;s.international.msiRegionalSeeds=b;
  const draw=shuffled(s,pi);phase(s,'MSI26_PI1','MSI · 플레이인 1R',[[draw[0],draw[1]],[draw[2],draw[3]]],['06-28'],'MSI',5,'11팀 중7팀 브래킷 직행. 나머지4팀 더블 엘리미네이션에서 단1팀 진출.');return;
 }
 if(kind==='WORLDS'){
  const b=qualified(s,kind),protectedRegions=s.international.extraWorldRegions,pi=regions.filter(r=>!protectedRegions.includes(r)).map(r=>b[r].at(-1)),ids=Object.values(b).flat(),direct=ids.filter(id=>!pi.includes(id));
  s.international.worldsParticipants=ids;s.international.worldsRegionalSeeds=b;s.international.worldsDirect=direct;
  const draw=shuffled(s,pi);phase(s,'WORLD26_PI1','Worlds · 플레이인 1R',[[draw[0],draw[1]],[draw[2],draw[3]]],['10-15'],'WORLDS',5,'19팀 참가 ·4팀 BO5 더블 엘리미네이션에서1팀만16팀 스위스로 진출.');
 }
}
function start2026Regular(s){
 const rounds=E.roundRobin(E.database().teams.map(t=>t.id),2),pairs=rounds.flat(),dates=pairs.map((_,i)=>{
  const day=Math.floor(i/2),week=Math.floor(day/5),weekday=day%5;return E.dayAdd(`${s.year}-04-01`,week*7+weekday).slice(5);
 });phase(s,'REG12','LCK 정규 1·2라운드',pairs,dates,'REGULAR',3,'10팀 더블 라운드 로빈 · 팀당18시리즈. 상위6팀 Road to MSI 진출.');
}
function start2026SecondHalf(s){
 s.secondHalfRounds=3;s.legend=s.regular12.slice(0,5);s.rise=s.regular12.slice(5);const a=E.roundRobin(s.legend,3),b=E.roundRobin(s.rise,3),pairs=a.flatMap((r,i)=>[...r,...b[i]]);
 const dates=pairs.map((_,i)=>{const day=Math.floor(i/2);return E.dayAdd(`${s.year}-07-29`,Math.floor(day/5)*7+day%5).slice(5);});
 phase(s,'REG35','LCK 정규 3~5라운드',pairs,dates,'REGULAR',3,'아시안게임 일정 없음 · Legend / Rise 그룹 내3회전 · 팀당12시리즈. 전반기 성적 누적, 정규 시즌 총30시리즈.');
 s.matches.filter(m=>ownYear(s,m)&&m.phase==='REG35').forEach((m,i)=>m.round=`${3+Math.floor(i/20)}라운드`);
}
function coachChoice(s,ids){return [...ids].sort((a,b)=>E.power(s,a)-E.power(s,b))[0];}
export function cupGroupWinner(s,tables=s.cupGroups.map(g=>E.standings(s,g,'CUP','CUP_GROUP'))){
 const scores=s.cupGroups.map(g=>groupPoints(s,g));if(scores[0]!==scores[1])return scores[0]>scores[1]?0:1;
 const diff=tables.map(rows=>rows.reduce((n,r)=>n+r.sw-r.sl,0));if(diff[0]!==diff[1])return diff[0]>diff[1]?0:1;
 // Extremely rare group tie: prescribed5th/1st/5th/1st/5th relay. The
 // coach simulates this group decision, retaining all ten picks between games.
 const relay={score:[0,0],sets:[],representatives:tables.map(rows=>[rows[4].id,rows[0].id]),automated:true};
 for(let i=0;i<5&&!relay.score.some(n=>n===3);i++){
  const teams=relay.representatives.map(ids=>ids[i%2]),frame={id:`${s.year}-CUP-RELAY-${i+1}`,teams,competition:'CUP',bestOf:1,score:[0,0],sets:[...relay.sets],date:s.date,status:'scheduled',exhibition:true,relay:true,firstSelectionRights:teams[i?relay.representatives.findIndex(ids=>ids[(i-1)%2]===relay.sets.at(-1).loser):0]};
  const d=E.completeDraft(s,E.newDraft(s,frame));E.autoAssignDraft(s,d);E.confirmDraftAssignments(d);const result=E.resolveDraft(s,frame,d);relay.sets.push(result);relay.score[teams.indexOf(result.winner)]++;
 }
 relay.winnerGroup=relay.score[0]===3?0:1;s.cupTiebreak=relay;E.news(s,'CUP 그룹 릴레이 타이브레이커',`승점·세트 득실 동률. 그룹5위/1위 교대 BO5를 코치가 진행했습니다. ${relay.score[0]}:${relay.score[1]}, ${relay.winnerGroup?'장로':'바론'} 그룹 승리.`);return relay.winnerGroup;
}
function cupDirect(s){
 const tables=s.cupGroups.map(g=>E.standings(s,g,'CUP','CUP_GROUP')),win=cupGroupWinner(s,tables),a=tables[win].map(r=>r.id),b=tables[1-win].map(r=>r.id);s.cupWinningGroup=win;
 s.cupDirect=[a[0],a[1],b[0]];s.cupBye=a.slice(0,2);s.cupPlayin=E.standings(s,[...a.slice(2),...b.slice(1,4)],'CUP','CUP_GROUP').map(r=>r.id);const p=s.cupPlayin;
 phase(s,'CUP_PI1','LCK CUP · 플레이인 1R',[[p[2],p[5]],[p[3],p[4]]],['02-06'],'CUP',3);
}
function startSwiss(s,piWinner){
 const ids=[...s.international.worldsDirect,piWinner],b=s.international.worldsRegionalSeeds,rank=unique([...(s.international.msiRegionRanking??[]),...regions]);
 // Four pools follow contemporary regional performance, preserving regional seeds.
 // Exact tie-breaking of regional strength is a deterministic simulation choice.
 const remaining=new Set(ids.filter(id=>id!==piWinner)),pools=[[],[],[],[]];
 const candidates=[rank.slice(0,4).map(r=>b[r][0]),[b[rank[0]][1],b[rank[1]][1],b[rank[4]][0],b[rank[5]][0]],[b[rank[0]][2],b[rank[1]][2],b[rank[2]][1],b[rank[3]][1]]];
 for(let i=0;i<3;i++)for(const id of candidates[i])if(remaining.has(id)){pools[i].push(id);remaining.delete(id);}
 const ordered=[...remaining].sort((x,y)=>{const rx=E.team(s,x).region,ry=E.team(s,y).region;return b[rx].indexOf(x)-b[ry].indexOf(y)||rank.indexOf(rx)-rank.indexOf(ry);});
 for(let i=0;i<3;i++)while(pools[i].length<4)pools[i].push(ordered.shift());pools[3]=[...ordered,piWinner];
 s.international.worldsTiers=pools;s.international.swiss={ids,round:1,records:Object.fromEntries(ids.map(id=>[id,{w:0,l:0}])),encounters:[]};swiss2026Round(s);
}
function matchGroup(s,ids,encounters,regional=false){
 function walk(left){if(!left.length)return[];const a=left[0];for(const b of left.slice(1))if(!encounters.includes([a,b].sort().join('|'))&&(!regional||E.team(s,a).region!==E.team(s,b).region)){const rest=walk(left.filter(id=>id!==a&&id!==b));if(rest)return[[a,b],...rest];}return null;}return walk(ids);
}
function crossPools(s,left,right){
 function walk(i,remain){if(i===left.length)return[];for(const b of remain)if(E.team(s,left[i]).region!==E.team(s,b).region){const rest=walk(i+1,remain.filter(x=>x!==b));if(rest)return[[left[i],b],...rest];}return null;}const result=walk(0,right);if(!result)throw Error('지역 분리 추첨에 실패했습니다.');return result;
}
export function swiss2026Round(s){
 const ws=s.international.swiss,active=ws.ids.filter(id=>ws.records[id].w<3&&ws.records[id].l<3),pairs=[];
 if(ws.round===1){const t=s.international.worldsTiers;pairs.push(...crossPools(s,t[0],t[3]),...crossPools(s,t[1],t[2]));}
 else for(const w of [2,1,0])for(const l of [0,1,2]){const group=active.filter(id=>ws.records[id].w===w&&ws.records[id].l===l);if(group.length){const matched=matchGroup(s,group,ws.encounters);if(!matched)throw Error('스위스 재대결 방지 대진에 실패했습니다.');pairs.push(...matched);}}
 const starts=['10-23','10-24','10-25','10-28','10-30'],start=starts[ws.round-1],dates=pairs.map((_,i)=>ws.round<3?start:E.dayAdd(`${s.year}-${start}`,Math.floor(i/Math.ceil(pairs.length/2))).slice(5));
 const matches=phase(s,`WORLD_SWISS${ws.round}`,`Worlds · 스위스 ${ws.round}라운드`,pairs,dates,'WORLDS',1,'16팀·3승 진출/3패 탈락. 결정전BO3, 재대결 금지,1R만 동일 지역 회피.');for(const m of matches){const r=ws.records[m.teams[0]];m.bestOf=r.w===2||r.l===2?3:1;}
}
export function advance2026Phase(s,ms){
 const k=s.phase.key,ids=()=>E.database().teams.map(t=>t.id);
 if(k==='CUP_GROUP')cupDirect(s);
 else if(k==='CUP_PI1'){const chosen=coachChoice(s,ms.map(W)),other=ms.map(W).find(id=>id!==chosen);phase(s,'CUP_PI2','LCK CUP · 플레이인 2R',[[s.cupPlayin[0],chosen],[s.cupPlayin[1],other]],['02-07'],'CUP',3);}
 else if(k==='CUP_PI2'){s.cupPiW=ms.map(W);phase(s,'CUP_PIF','LCK CUP · 플레이인 최종전',[ms.map(L)],['02-08'],'CUP');}
 else if(k==='CUP_PIF'){
  const p=[...s.cupPiW].sort((a,b)=>s.cupPlayin.indexOf(a)-s.cupPlayin.indexOf(b));p.push(W(ms[0]));s.cupPoSeeds=[...s.cupDirect,...p];const chosen=coachChoice(s,p);phase(s,'CUP_PO1','LCK CUP · 플레이오프 상위 1R',[[s.cupDirect[2],chosen],p.filter(id=>id!==chosen)],['02-12','02-13'],'CUP');
 }
 else if(k==='CUP_PO1'){s.cupFirstLosers=ms.map(L);const chosen=coachChoice(s,ms.map(W)),other=ms.map(W).find(id=>id!==chosen);phase(s,'CUP_PO2','LCK CUP · 플레이오프 상위 2R',[[s.cupBye[0],chosen],[s.cupBye[1],other]],['02-14','02-15'],'CUP');}
 else if(k==='CUP_PO2'){s.cupUpperW=ms.map(W);s.cupSecondLosers=ms.map(L).sort((a,b)=>s.cupPoSeeds.indexOf(a)-s.cupPoSeeds.indexOf(b));phase(s,'CUP26_L1','LCK CUP · 패자조 1R',[s.cupFirstLosers],['02-19'],'CUP');}
 else if(k==='CUP26_L1')phase(s,'CUP26_L2','LCK CUP · 패자조 2R',[[s.cupSecondLosers[1],W(ms[0])]],['02-20'],'CUP');
 else if(k==='CUP26_L2'){s.cupLowerChallenger=W(ms[0]);phase(s,'CUP26_UF','LCK CUP · 승자조 결승',[s.cupUpperW],['02-21'],'CUP');}
 else if(k==='CUP26_UF'){s.cupFinalist=W(ms[0]);s.cupUpperLoser=L(ms[0]);phase(s,'CUP26_L3','LCK CUP · 패자조 3R',[[s.cupSecondLosers[0],s.cupLowerChallenger]],['02-22'],'CUP');}
 else if(k==='CUP26_L3')phase(s,'CUP26_LF','LCK CUP · 결승 진출전',[[s.cupUpperLoser,W(ms[0])]],['02-28'],'CUP');
 else if(k==='CUP26_LF')phase(s,'CUP_FINAL','LCK CUP · 결승',[[s.cupFinalist,W(ms[0])]],['03-01'],'CUP');
 else if(k==='CUP_FINAL'){s.cupChampion=W(ms[0]);s.cupRunner=L(ms[0]);E.award(s,'LCK CUP',s.cupChampion,0);begin2026International(s,'FST');}
 else if(k==='FST26_R1')phase(s,'FST26_R2','First Stand · 그룹 승자전 / 패자전',[[W(ms[0]),W(ms[1])],[L(ms[0]),L(ms[1])],[W(ms[2]),W(ms[3])],[L(ms[2]),L(ms[3])]],['03-18','03-18','03-19','03-19'],'FST');
 else if(k==='FST26_R2'){s.international.fstGroupWinners=[W(ms[0]),W(ms[2])];phase(s,'FST26_DECIDER','First Stand · 그룹 최종전',[[L(ms[0]),W(ms[1])],[L(ms[2]),W(ms[3])]],['03-20'],'FST');}
 else if(k==='FST26_DECIDER'){s.international.fstGroupRunners=ms.map(W);const w=s.international.fstGroupWinners;phase(s,'FST_SEMI','First Stand · 4강',[[w[0],W(ms[1])],[w[1],W(ms[0])]],['03-21'],'FST');}
 else if(k==='FST_SEMI')phase(s,'FST_FINAL','First Stand · 결승',[ms.map(W)],['03-22'],'FST');
 else if(k==='FST_FINAL'){s.fstChampion=W(ms[0]);const semis=s.matches.filter(m=>ownYear(s,m)&&m.phase==='FST_SEMI'),others=s.international.fstParticipants.filter(id=>!semis.some(m=>m.teams.includes(id))).sort((a,b)=>E.standings(s,[a,b],'FST').findIndex(r=>r.id===a)-E.standings(s,[a,b],'FST').findIndex(r=>r.id===b));s.international.fstRanking=[W(ms[0]),L(ms[0]),...semis.map(L),...others];E.award(s,'First Stand',s.fstChampion,3);start2026Regular(s);}
 else if(k==='REG12'){s.regular12=E.standings(s,ids(),'REGULAR').map(r=>r.id);s.seeds=s.regular12.slice(0,6);phase(s,'ROAD_56','Road to MSI · 5·6위전',[s.seeds.slice(4,6)],['06-06'],'ROAD');}
 else if(k==='ROAD_56')phase(s,'ROAD_4','Road to MSI · 4위 도전',[[s.seeds[3],W(ms[0])]],['06-07'],'ROAD');
 else if(k==='ROAD_4'){s.roadChallenger=W(ms[0]);phase(s,'ROAD_TOP','Road to MSI · 1시드 결정전',[s.seeds.slice(0,2)],['06-12'],'ROAD');}
 else if(k==='ROAD_TOP'){s.msiSeeds=[W(ms[0])];s.roadFinalOpponent=L(ms[0]);phase(s,'ROAD_3','Road to MSI · 3위 도전',[[s.seeds[2],s.roadChallenger]],['06-13'],'ROAD');}
 else if(k==='ROAD_3')phase(s,'ROAD_FINAL','Road to MSI · 2시드 결정전',[[s.roadFinalOpponent,W(ms[0])]],['06-14'],'ROAD');
 else if(k==='ROAD_FINAL'){s.msiSeeds.push(W(ms[0]));begin2026International(s,'MSI');}
 else if(k==='MSI26_PI1')phase(s,'MSI26_PI2','MSI · 플레이인 승자전 / 패자전',[ms.map(W),ms.map(L)],['06-29'],'MSI');
 else if(k==='MSI26_PI2'){s.international.msiPiFinalist=W(ms[0]);phase(s,'MSI26_PILF','MSI · 플레이인 패자조 결승',[[L(ms[0]),W(ms[1])]],['06-30'],'MSI');}
 else if(k==='MSI26_PILF')phase(s,'MSI26_PIF','MSI · 플레이인 최종 결승',[[s.international.msiPiFinalist,W(ms[0])]],['07-01'],'MSI');
 else if(k==='MSI26_PIF'){
  const pi=W(ms[0]),b=s.international.msiRegionalSeeds,rank=unique(s.international.fstRanking.map(id=>E.team(s,id).region)),bye=s.international.msiByeRegion,pools=[[b[rank[0]][0],b[rank[1]][0]],[b[rank[2]][0],b[rank[3]][0]],[b[rank[4]][0],b[rank[5]][0]],[b[bye][1],pi]];
  s.international.msiPools=pools;s.msiBracketTeams=[...s.international.msiDirect,pi];const pairs=E.drawMsi(s,pools);phase(s,'MSI_QF','MSI · 브래킷 1R',pairs,['07-03','07-03','07-04','07-04'],'MSI');
 }
 else if(k==='MSI_QF')phase(s,'MSI_UP2','MSI · 상위 2R / 하위 1R',[[W(ms[0]),W(ms[1])],[W(ms[2]),W(ms[3])],[L(ms[0]),L(ms[1])],[L(ms[2]),L(ms[3])]],['07-05','07-05','07-06','07-06'],'MSI');
 else if(k==='MSI_UP2'){s.msiUpperW=ms.slice(0,2).map(W);phase(s,'MSI_LOW2','MSI · 하위 2R',[[L(ms[0]),W(ms[3])],[L(ms[1]),W(ms[2])]],['07-08'],'MSI');}
 else if(k==='MSI_LOW2')phase(s,'MSI_UPF','MSI · 상위 결승 / 하위 3R',[s.msiUpperW,ms.map(W)],['07-09','07-10'],'MSI');
 else if(k==='MSI_UPF'){s.msiFinalist=W(ms[0]);phase(s,'MSI_LOWF','MSI · 하위 결승',[[L(ms[0]),W(ms[1])]],['07-11'],'MSI');}
 else if(k==='MSI_LOWF')phase(s,'MSI_FINAL','MSI · 결승',[[s.msiFinalist,W(ms[0])]],['07-12'],'MSI');
 else if(k==='MSI_FINAL'){
  s.msiChampion=W(ms[0]);E.award(s,'MSI',s.msiChampion,6);const all=s.matches.filter(m=>ownYear(s,m)&&m.competition==='MSI').reverse();const rank=unique([W(ms[0]),L(ms[0]),...all.flatMap(m=>[m.winner,...m.teams])].filter(Boolean).map(id=>E.team(s,id).region));s.international.msiRegionRanking=rank;s.international.extraWorldRegions=rank.slice(0,2);start2026SecondHalf(s);
 }
 else if(k==='REG34'||k==='REG35'){s.legendFinal=E.standings(s,s.legend,'REGULAR').map(r=>r.id);s.riseFinal=E.standings(s,s.rise,'REGULAR').map(r=>r.id);s.seeds=s.legendFinal.slice(0,4);phase(s,'SEASON26_PI5','LCK 시즌 · 플레이인 5시드전',[[s.legendFinal[4],s.riseFinal[0]]],['08-26'],'SEASON_PO');}
 else if(k==='SEASON26_PI5'){s.seeds.push(W(ms[0]));s.seasonPiLoser=L(ms[0]);phase(s,'SEASON26_PIL','LCK 시즌 · 플레이인 패자전',[[s.riseFinal[1],s.riseFinal[2]]],['08-27'],'SEASON_PO');}
 else if(k==='SEASON26_PIL')phase(s,'SEASON26_PI6','LCK 시즌 · 플레이인 6시드전',[[s.seasonPiLoser,W(ms[0])]],['08-28'],'SEASON_PO');
 else if(k==='SEASON26_PI6'){s.seeds.push(W(ms[0]));const chosen=coachChoice(s,s.seeds.slice(4)),other=s.seeds.slice(4).find(id=>id!==chosen);phase(s,'SEASON_PO1','LCK 플레이오프 · 상위 1R',[[s.seeds[2],chosen],[s.seeds[3],other]],['08-29','08-30'],'SEASON_PO');}
 else if(k==='SEASON_PO1'){s.poFirstLosers=ms.map(L);const chosen=coachChoice(s,ms.map(W)),other=ms.map(W).find(id=>id!==chosen);phase(s,'SEASON_PO2','LCK 플레이오프 · 상위 2R',[[s.seeds[0],chosen],[s.seeds[1],other]],['09-01','09-02'],'SEASON_PO');}
 else if(k==='SEASON_PO2'){s.poUpperW=ms.map(W);s.poSecondLosers=ms.map(L).sort((a,b)=>s.seeds.indexOf(a)-s.seeds.indexOf(b));phase(s,'SEASON26_L1','LCK 플레이오프 · 패자조 1R',[s.poFirstLosers],['09-03'],'SEASON_PO');}
 else if(k==='SEASON26_L1')phase(s,'SEASON26_L2','LCK 플레이오프 · 패자조 2R',[[s.poSecondLosers[1],W(ms[0])]],['09-04'],'SEASON_PO');
 else if(k==='SEASON26_L2'){s.poLowerChallenger=W(ms[0]);phase(s,'SEASON26_UF','LCK 플레이오프 · 승자조 결승',[s.poUpperW],['09-05'],'SEASON_PO');}
 else if(k==='SEASON26_UF'){s.poFinalist=W(ms[0]);s.poUpperLoser=L(ms[0]);phase(s,'SEASON26_L3','LCK 플레이오프 · 패자조 3R',[[s.poSecondLosers[0],s.poLowerChallenger]],['09-06'],'SEASON_PO');}
 else if(k==='SEASON26_L3'){s.worldsFourth=L(ms[0]);phase(s,'SEASON26_LF','LCK 플레이오프 · 결승 진출전',[[s.poUpperLoser,W(ms[0])]],['09-12'],'SEASON_PO');}
 else if(k==='SEASON26_LF'){s.worldsThird=L(ms[0]);phase(s,'SEASON_FINAL','LCK · 시즌 결승',[[s.poFinalist,W(ms[0])]],['09-13'],'SEASON_PO');}
 else if(k==='SEASON_FINAL'){s.worldsSeeds=[W(ms[0]),L(ms[0]),s.worldsThird,s.worldsFourth];if(s.seeds.includes(s.msiChampion)&&!s.worldsSeeds.slice(0,3).includes(s.msiChampion))s.worldsSeeds[3]=s.msiChampion;E.award(s,'LCK',s.worldsSeeds[0],0);begin2026International(s,'WORLDS');}
 else if(k==='WORLD26_PI1')phase(s,'WORLD26_PI2','Worlds · 플레이인 승자전 / 패자전',[ms.map(W),ms.map(L)],['10-16'],'WORLDS');
 else if(k==='WORLD26_PI2'){s.international.worldPiFinalist=W(ms[0]);phase(s,'WORLD26_PILF','Worlds · 플레이인 패자조 결승',[[L(ms[0]),W(ms[1])]],['10-17'],'WORLDS');}
 else if(k==='WORLD26_PILF')phase(s,'WORLD26_PIF','Worlds · 플레이인 최종 결승',[[s.international.worldPiFinalist,W(ms[0])]],['10-18'],'WORLDS');
 else if(k==='WORLD26_PIF')startSwiss(s,W(ms[0]));
 else if(k.startsWith('WORLD_SWISS')){
  const ws=s.international.swiss;for(const m of ms){ws.records[W(m)].w++;ws.records[L(m)].l++;ws.encounters.push([...m.teams].sort().join('|'));}
  if(ws.ids.some(id=>ws.records[id].w<3&&ws.records[id].l<3)){ws.round++;swiss2026Round(s);}else{
   const q=ws.ids.filter(id=>ws.records[id].w===3).sort((a,b)=>ws.records[a].l-ws.records[b].l||E.power(s,b)-E.power(s,a)),a=q.filter(id=>ws.records[id].l===0),b=q.filter(id=>ws.records[id].l===2),remaining=q.filter(id=>!a.includes(id)&&!b.slice(0,2).includes(id));phase(s,'WORLD_QF','Worlds · 8강',[[a[0],b[0]],[remaining[0],remaining[1]],[a[1],b[1]],[remaining[2],remaining[3]]],['11-03','11-04','11-05','11-06'],'WORLDS');
  }
 }
 else if(k==='WORLD_QF')phase(s,'WORLD_SF','Worlds · 4강',[[W(ms[0]),W(ms[1])],[W(ms[2]),W(ms[3])]],['11-07','11-08'],'WORLDS');
 else if(k==='WORLD_SF')phase(s,'WORLD_FINAL','Worlds · 결승',[ms.map(W)],['11-14'],'WORLDS');
 else return false;
 return true;
}

// Add the third group cycle to an unfinished legacy second half, preserving IDs/results/RNG.
export function migrate2026SecondHalf(s){
 if(s.phase?.key!=='REG34'||s.secondHalfRounds===3||!s.legend?.length||!s.rise?.length)return false;
 const old=s.matches.filter(m=>ownYear(s,m)&&m.phase==='REG34');
 if(old.length!==40)return false;
 for(const [i,m] of old.entries()){m.phase='REG35';m.round=`${3+Math.floor(i/20)}라운드`;}
 s.secondHalfRounds=3;const a=E.roundRobin(s.legend,3),b=E.roundRobin(s.rise,3),extra=a.flatMap((r,i)=>[...r,...b[i]]).slice(40);
 const earliest=E.dayAdd(s.date,1),dates=extra.map((_,i)=>{const day=20+Math.floor(i/2),date=E.dayAdd(`${s.year}-07-29`,Math.floor(day/5)*7+day%5);return (date>earliest?date:E.dayAdd(earliest,Math.floor(i/2))).slice(5);});
 E.addPhase(s,'REG35','LCK 정규 3~5라운드',[extra],3,'REGULAR',{start:earliest,description:'아시안게임 없이 그룹 내3회전, 전반기 누적 팀당30시리즈.'});
 const added=s.matches.filter(m=>ownYear(s,m)&&m.phase==='REG35'&&!old.includes(m));
 added.forEach((m,i)=>{m.round='5라운드';m.date=`${s.year}-${dates[i]}`;m.firstSelectionRights=m.teams[0];});return true;
}
