import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as E from '../dist/engine.js';
import {buildTimeline,sampleScene,sceneClock} from '../dist/timeline.js';
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
 assert.equal(scenes.at(-1).kind,'nexus');assert.equal(scenes.at(-1).team,set.winner);assert.equal(sceneClock(scenes.at(-1),1),set.duration*60);
 for(const scene of scenes)assert.equal(new Set(scene.kills.map(k=>k.victim)).size,scene.kills.length);
});
test('ganks, objective rotations and recalls move champions to their corresponding map locations',()=>{
 const scenes=buildTimeline(set);const gank=scenes.find(s=>s.kind==='gank'),dragon=scenes.find(s=>s.kind==='dragon'),recall=scenes.find(s=>s.kind==='recall');
 assert(gank&&dragon&&recall);assert.deepEqual([gank.focus.x,gank.focus.y],[95,175]);assert.deepEqual([dragon.focus.x,dragon.focus.y],[410,400]);
 const frames=[sampleScene(gank,0),sampleScene(gank,.25),sampleScene(gank,.65)];const jungle=frames.map(f=>f.find(a=>a.team==='T1'&&a.role==='JGL'));assert.notEqual(jungle[0].x,jungle[1].x);assert.notEqual(jungle[1].x,jungle[2].x);
 const bot=gank.actors.find(a=>a.team==='T1'&&a.role==='BOT');assert.equal(bot.involved,false);
 for(const actor of sampleScene(dragon,1)){assert(actor.x>=0&&actor.x<=600);assert(actor.y>=0&&actor.y<=600);}
 for(const actor of sampleScene(recall,1)){const base=actor.side==='blue'?[63,537]:[537,63];assert(Math.hypot(actor.x-base[0],actor.y-base[1])<35);assert.equal(actor.hp,100);}
});
test('combat effects and death states appear after movement rather than at scene start',()=>{
 const scene=buildTimeline(set).find(scene=>scene.kills.length);assert(scene);const killed=scene.kills[0].victim;
 const start=sampleScene(scene,0).find(a=>a.id===killed),end=sampleScene(scene,1).find(a=>a.id===killed);assert.equal(start.visibleDeath,false);assert.equal(end.visibleDeath,true);assert.equal(end.hp,0);
});
