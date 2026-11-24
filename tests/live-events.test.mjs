import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as E from '../dist/engine.js';
import * as v7 from '../dist/match-sim-v7.js';
import {objectivePreview} from '../dist/match-sim.js';
import {buildTimeline} from '../dist/timeline.js';
const data=Object.fromEntries(['teams','players','champions','mastery','meta','international','season'].map(k=>[k,JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${k}.json`,import.meta.url)))]));E.configure(data);
test('incremental viewer starts without a result, advances only when requested, reload does not roll, and ends identically to auto',()=>{
 const s=E.newGame('T1',91),m={id:'incremental',teams:['T1','GEN'],competition:'CUP',bestOf:1,date:s.date,sets:[],score:[0,0],status:'scheduled'};s.matches.push(m);s.activeDraft=E.completeDraft(s,E.newDraft(s,m));E.autoAssignDraft(s,s.activeDraft);E.confirmDraftAssignments(s.activeDraft);const direct=structuredClone(s);E.commitOwnDraft(direct);
 E.startLiveMatch(s,{incremental:true});assert(s.activeMatch);assert.equal(m.sets.length,0);assert.equal(s.activeMatch.simulation.winner,null);assert.equal(s.activeMatch.simulation.events.length,2);assert(!s.activeMatch.simulation.events.some(e=>e.kind==='nexus'));
 const before=E.serializeSave(s),clone=JSON.parse(before);E.resumeLiveMatch(clone);assert.equal(E.serializeSave(clone),before);
 let count=0;while(s.activeMatch&&count++<250){const old=s.activeMatch.simulation.events.length;E.advanceOwnMatch(s,'auto');if(s.activeMatch)assert(s.activeMatch.simulation.events.length>old);}
 assert(!s.activeMatch);assert(count>10);assert.deepEqual(m.sets,direct.matches[0].sets);assert.equal(s.rng,direct.rng);assert.deepEqual(s.players,direct.players);
});
test('resuming a v7 live set applies the smaller reward to its next decision and replays its earlier economy exactly',()=>{
 const s=E.newGame('T1',91),m={id:'economy-migration',teams:['T1','GEN'],competition:'CUP',bestOf:1,date:s.date,sets:[],score:[0,0],status:'scheduled'};s.matches.push(m);s.activeDraft=E.completeDraft(s,E.newDraft(s,m));E.autoAssignDraft(s,s.activeDraft);E.confirmDraftAssignments(s.activeDraft);E.startLiveMatch(s,{incremental:true});
 const z=v7.createMatchState({...s.activeMatch.simulation.input,model:'event-v7'},s.rng);v7.advanceMatch(z,{controlledTeam:s.myTeam});v7.advanceMatch(z,{controlledTeam:s.myTeam,action:'trade'});assert(z.events.some(e=>e.kind==='trade-push'));s.activeMatch.simulation=z;
 const prefix=JSON.stringify(z.events),rng=z.rng,cutoff=z.pending.id;E.resumeLiveMatch(s);assert.equal(z.rng,rng);assert.equal(JSON.stringify(z.events),prefix);assert.equal(z.version,10);assert.equal(z.input.tradeRewardV8FromWindow,cutoff);assert.equal(objectivePreview(z).tradePolicy,'earned');assert.deepEqual(objectivePreview(z).tradeRange,[0,350]);
 E.advanceOwnMatch(s,'auto',true);const set=m.sets[0],saved=JSON.parse(E.serializeSave(s)).matches[0].sets[0];assert.equal(set.simulationReplay.model,'event-v10');assert.deepEqual(buildTimeline(saved),buildTimeline(set));assert.equal(JSON.stringify(set.events.slice(0,JSON.parse(prefix).length)),prefix);
});
