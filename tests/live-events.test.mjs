import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as E from '../dist/engine.js';
const data=Object.fromEntries(['teams','players','champions','mastery','meta','international','season'].map(k=>[k,JSON.parse(readFileSync(new URL(`../dist/data/season-2026/${k}.json`,import.meta.url)))]));E.configure(data);
test('incremental viewer starts without a result, advances only when requested, reload does not roll, and ends identically to auto',()=>{
 const s=E.newGame('T1',91),m={id:'incremental',teams:['T1','GEN'],competition:'CUP',bestOf:1,date:s.date,sets:[],score:[0,0],status:'scheduled'};s.matches.push(m);s.activeDraft=E.completeDraft(s,E.newDraft(s,m));E.autoAssignDraft(s,s.activeDraft);E.confirmDraftAssignments(s.activeDraft);const direct=structuredClone(s);E.commitOwnDraft(direct);
 E.startLiveMatch(s,{incremental:true});assert(s.activeMatch);assert.equal(m.sets.length,0);assert.equal(s.activeMatch.simulation.winner,null);assert.equal(s.activeMatch.simulation.events.length,2);assert(!s.activeMatch.simulation.events.some(e=>e.kind==='nexus'));
 const before=E.serializeSave(s),clone=JSON.parse(before);E.resumeLiveMatch(clone);assert.equal(E.serializeSave(clone),before);
 let count=0;while(s.activeMatch&&count++<250){const old=s.activeMatch.simulation.events.length;E.advanceOwnMatch(s,'auto');if(s.activeMatch)assert(s.activeMatch.simulation.events.length>old);}
 assert(!s.activeMatch);assert(count>10);assert.deepEqual(m.sets,direct.matches[0].sets);assert.equal(s.rng,direct.rng);assert.deepEqual(s.players,direct.players);
});
