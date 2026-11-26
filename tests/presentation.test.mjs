import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as E from '../dist/engine.js';
import {buildTimeline,sampleScene,sceneClock,sceneVisibleKills} from '../dist/timeline.js';
import {sampleMinions} from '../dist/lane-playback.js';
import {historicalDraft} from '../dist/broadcast.js';
const keys=['players','teams','champions','mastery','meta','international'];
const data=Object.fromEntries(keys.map(k=>[k,JSON.parse(readFileSync(new URL(`../dist/data/${k}.json`,import.meta.url)))]));E.configure(data);
const s=E.newGame('T1',456),m={id:'qa',teams:['T1','GEN'],competition:'CUP',bestOf:5,sets:[],score:[0,0],date:s.date,status:'scheduled'};E.simulateSeries(s,m);const set=m.sets[0];
test('all historical examples retain recorded 20 actions and correct final role assignments',()=>{
 const examples=JSON.parse(readFileSync(new URL('../dist/data/draft-examples.json',import.meta.url))).examples;
 assert.equal(examples.length,4);
 for(const example of examples){assert.equal(example.actions.length,20);assert.equal(new Set(example.actions.map(a=>a.champion)).size,20);const full=historicalDraft(example);assert.equal(full.picks.blue.length,5);assert.equal(full.picks.red.length,5);assert.equal(full.bans.blue.length,5);assert.equal(full.bans.red.length,5);for(const side of ['blue','red'])assert.equal(new Set(full.picks[side].map(p=>p.role)).size,5);assert.equal(historicalDraft(example,6).picks.blue.length,0);}
 const g5=examples.find(e=>e.id.includes('worlds'));assert(g5);assert.equal(g5.actions.find(a=>a.kind==='pick').champion,'Karma');assert.equal(historicalDraft(g5).picks.blue.find(p=>p.role==='TOP').champion,'Gwen');assert.equal(g5.historicalRules.fearless,false);
});
test('viewer reconstruction preserves the result, all KDA totals, saved RNG and input objects',()=>{
 const before=JSON.stringify(set),rng=s.rng;const scenes=buildTimeline(set);
 assert.equal(JSON.stringify(set),before);assert.equal(s.rng,rng);assert.deepEqual(scenes,buildTimeline(set));
 const kills=scenes.flatMap(e=>e.kills);for(const p of set.stats){assert.equal(kills.filter(k=>k.killer===p.player).length,p.k);assert.equal(kills.filter(k=>k.victim===p.player).length,p.d);assert.equal(kills.filter(k=>k.assists.includes(p.player)).length,p.a);}
 assert.equal(scenes.at(-1).kind,'nexus');assert.equal(scenes.at(-1).team,set.winner);assert.equal(sceneClock(scenes.at(-1),1),Math.round(set.duration*60));
 for(const scene of scenes)assert.equal(new Set(scene.kills.map(k=>k.victim)).size,scene.kills.length);
});
test('ganks, objective rotations and recalls move champions to their corresponding map locations',()=>{
 const scenes=m.sets.flatMap(z=>buildTimeline(z));const gank=scenes.find(s=>s.kind==='gank'),dragon=scenes.find(s=>s.kind==='dragon'),recall=scenes.find(s=>s.kind==='recall');
 assert(gank&&dragon&&recall);assert.deepEqual([gank.focus.x,gank.focus.y],{top:[95,175],mid:[300,300],bot:[485,447]}[gank.location]);assert.deepEqual([dragon.focus.x,dragon.focus.y],[410,400]);
 const frames=[sampleScene(gank,0),sampleScene(gank,.25),sampleScene(gank,.65)];const jungler=gank.actors.find(a=>a.role==='JGL'&&a.involved&&!a.alreadyDead);assert(jungler);const jungle=frames.map(f=>f.find(a=>a.id===jungler.id));assert.notEqual(jungle[0].x,jungle[1].x);assert.notEqual(jungle[1].x,jungle[2].x);
 const absent=gank.actors.find(a=>gank.participants?!gank.participants.includes(a.id):!gank.roles.includes(a.role));assert(absent);assert.equal(absent.involved,false);
 for(const actor of sampleScene(dragon,1)){assert(actor.x>=0&&actor.x<=600);assert(actor.y>=0&&actor.y<=600);}
 for(const actor of sampleScene(recall,1)){const base=actor.side==='blue'?[63,537]:[537,63];assert(Math.hypot(actor.x-base[0],actor.y-base[1])<35);assert.equal(actor.hp,100);}
});
test('combat effects and death states appear after movement rather than at scene start',()=>{
 const scene=buildTimeline(set).find(scene=>scene.kills.length);assert(scene);const killed=scene.kills[0].victim;
 const start=sampleScene(scene,0).find(a=>a.id===killed),end=sampleScene(scene,1).find(a=>a.id===killed);assert.equal(start.visibleDeath,false);assert.equal(end.visibleDeath,true);assert.equal(end.hp,0);
});

const lanePicks={
 B:{TOP:'Darius',JGL:'LeeSin',MID:'Ahri',BOT:'Ezreal',SUP:'Rakan'},
 R:{TOP:'Ornn',JGL:'Vi',MID:'Yasuo',BOT:'Jinx',SUP:'Lulu'}
};
const lanePicksByTeam=Object.entries(lanePicks).flatMap(([team,roster])=>Object.entries(roster).map(([role,champion])=>({team,role,champion})));
const laneStats=lanePicksByTeam.map(p=>({...p,player:p.team+p.role}));

test('early highlights show skills, basic attacks and minion waves on all three lanes at the same time',()=>{
 const champions=Object.fromEntries(JSON.parse(readFileSync(new URL('../dist/data/season-2026/champions.json',import.meta.url))).map(c=>[c.id,c]));
 const event={minute:4,second:240,kind:'laning',location:'mid',kills:[]};
 const match={blue:'B',red:'R',live:true,patch:'16.1.1',simulationVersion:15,stats:laneStats,picks:lanePicksByTeam,events:[event]};
 const before=JSON.stringify(match),[scene]=buildTimeline(match,{champions});
 assert.equal(JSON.stringify(match),before);
 assert.deepEqual(buildTimeline(match,{champions}),[scene]);
 const minions=sampleMinions(scene.lanePlayback,.32);
 assert.equal(new Set(minions.map(m=>m.id)).size,18);
 for(const lane of ['top','mid','bot'])assert.equal(minions.filter(m=>m.lane===lane).length,6);
 const simultaneous=scene.lanePlayback.actions.filter(a=>!a.minion&&a.cast<.32&&a.land>.32);
 assert.deepEqual(new Set(simultaneous.map(a=>a.lane)),new Set(['top','mid','bot']));
 assert.equal(scene.lanePlayback.active.length,8);
 const orb=scene.lanePlayback.actions.find(a=>a.from==='BMID'&&a.slot==='Q');
 assert.equal(orb.name,'현혹의 구슬');
 assert.equal(orb.form,'returning');
 const basic=scene.lanePlayback.actions.filter(a=>a.minion);
 assert(basic.some(a=>a.from==='BMID'&&a.form==='shot'));
 assert(basic.some(a=>a.from==='RMID'&&a.form==='strike'));
 const beforeHit=sampleScene(scene,orb.land-.001).find(p=>p.id==='RMID'),hit=sampleScene(scene,orb.land).find(p=>p.id==='RMID');
 assert(hit.hp<beforeHit.hp && !hit.visibleDeath);
 const x=sampleScene(scene,.7).find(p=>p.id==='BMID'),y=sampleScene(scene,.81).find(p=>p.id==='BMID');
 assert.notDeepEqual([x.x,x.y],[y.x,y.y]);
 const picture=sampleMinions(scene.lanePlayback,basic[0].land+.1).find(m=>m.id===basic[0].target);
 assert.equal(picture.visible,0);
 assert.deepEqual(sceneVisibleKills(scene,1),[]);
});

test('damaging hits precede a recorded lane kill and the death and kill feed reveal together',()=>{
 const event={minute:4,second:240,kind:'solo-kill',location:'top',roles:['TOP'],kills:[{killer:'BTOP',victim:'RTOP',assists:[],respawnAtSecond:258}]};
 const next={minute:4.2,second:252,kind:'laning',location:'top',kills:[]};
 const match={blue:'B',red:'R',live:true,simulationVersion:15,stats:laneStats,picks:lanePicksByTeam,events:[event,next]};
 const [scene,after]=buildTimeline(match);
 const finishing=scene.lanePlayback.actions.find(x=>x.lethal);
 assert(finishing&&finishing.from==='BTOP'&&finishing.target==='RTOP');
 assert(!sceneVisibleKills(scene,finishing.land-.001).length);
 assert.equal(sceneVisibleKills(scene,finishing.land).length,1);
 assert(sampleScene(scene,finishing.land-.001).find(p=>p.id==='RTOP').hp>0);
 assert.equal(sampleScene(scene,finishing.land).find(p=>p.id==='RTOP').hp,0);
 assert(sampleScene(scene,finishing.land).find(p=>p.id==='RTOP').visibleDeath);
 const otherLanes=scene.lanePlayback.actions.filter(a=>a.lane!=='top');
 assert.deepEqual(new Set(otherLanes.filter(a=>a.damage).map(a=>a.lane)),new Set(['mid','bot']));
 assert(otherLanes.every(a=>!a.lethal));
 assert(!after.lanePlayback.actions.some(a=>a.from==='RTOP'||a.target==='RTOP'));
});

test('a laner who roams joins the recorded fight and leaves the opposing laner to farm',()=>{
 const event={minute:4,second:240,kind:'gank',location:'top',participants:['BTOP','BJGL','BMID','RTOP'],
  kills:[{killer:'BTOP',victim:'RTOP',assists:['BMID'],respawnAtSecond:258}]};
 const [scene]=buildTimeline({blue:'B',red:'R',live:true,simulationVersion:15,stats:laneStats,picks:lanePicksByTeam,events:[event]});
 const midActions=scene.lanePlayback.actions.filter(a=>a.lane==='mid');
 assert(midActions.length&&midActions.every(a=>a.from==='RMID'&&a.minion));
 assert(scene.lanePlayback.actions.some(a=>a.from==='BMID'&&a.lane==='top'&&a.target==='RTOP'));
 assert(!scene.lanePlayback.actions.some(a=>a.from==='RJGL'));
});
