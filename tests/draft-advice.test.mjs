import test from 'node:test';import assert from 'node:assert/strict';
import {draftAdvice} from '../dist/draft-advice.js';
const champions=[{id:'Aatrox',roles:['TOP']},{id:'Renekton',roles:['TOP']},{id:'Ornn',roles:['TOP']}];
const view=()=>({patch:'16.1.1',roles:{TOP:['Aatrox','Renekton'].map(id=>({id,score:20,priority:'주요 픽',observedRoles:['TOP']}))},records:[]});
function add(v,id,ally,opponent,won,set=1,player='Alpha'){
 for(let i=0;i<12;i++)v.records.push({patch:'16.1.1',set,lineups:[[[id,'TOP',player,won],[ally,'JGL','Jungler',won]],[[opponent,'TOP','Enemy',1-won]]]});
}
const options={champions,available:()=>true,limit:2};
test('observed partner combinations and same-lane opponents change the context ranking with bounded smoothed effects',()=>{
 const v=view();for(const id of ['Aatrox','Renekton']){add(v,id,'Sejuani','Ornn',id==='Aatrox'?1:0);add(v,id,'Poppy','Gwen',id==='Renekton'?1:0);}
 assert.equal(draftAdvice(v,'TOP',{...options,allies:['Sejuani']})[0].id,'Aatrox');assert.equal(draftAdvice(v,'TOP',{...options,allies:['Poppy']})[0].id,'Renekton');
 assert.equal(draftAdvice(v,'TOP',{...options,opponents:['Gwen']})[0].id,'Renekton');
 for(const r of draftAdvice(v,'TOP',{...options,opponents:['Gwen']})){assert(Math.abs(r.advice.synergy)<=4);assert(Math.abs(r.advice.counter)<=6);}
});
test('set number and the current player mastery/observed usage inform advice without locking a champion position',()=>{
 const v=view();add(v,'Aatrox','Sejuani','Ornn',1,1,'Alpha');add(v,'Aatrox','Sejuani','Ornn',0,1,'Alpha');add(v,'Renekton','Poppy','Ornn',1,3,'Beta');add(v,'Renekton','Poppy','Ornn',0,3,'Beta');
 assert.equal(draftAdvice(v,'TOP',{...options,set:1})[0].id,'Aatrox');assert.equal(draftAdvice(v,'TOP',{...options,set:3})[0].id,'Renekton');
 assert.equal(draftAdvice(v,'TOP',{...options,set:2,mastery:id=>id==='Renekton'?99:48})[0].id,'Renekton');assert.equal(draftAdvice(v,'TOP',{...options,set:2,player:'Beta'})[0].id,'Renekton');
 assert(draftAdvice(v,'TOP',options).every(r=>!('assignedRole' in r)));
});
test('bans evaluate opponent partners; unavailable picks refill and empty evidence is explicitly estimated',()=>{
 const v=view();for(const id of ['Aatrox','Renekton']){add(v,id,'Sejuani','Ornn',id==='Aatrox'?1:0);add(v,id,'Poppy','Gwen',id==='Renekton'?1:0);}
 assert.equal(draftAdvice(v,'TOP',{...options,kind:'ban',opponents:['Poppy']})[0].id,'Renekton');
 assert(draftAdvice(v,'TOP',{...options,available:id=>id!=='Aatrox'}).every(r=>r.id!=='Aatrox'));
 const empty=view();empty.roles.TOP=[];const before=JSON.stringify(empty),result=draftAdvice(empty,'TOP',options);assert(result.every(r=>r.estimated&&r.picks===null&&r.advice.picks===0));assert.equal(JSON.stringify(empty),before);
});

test('bans in later sets contribute instead of relying exclusively on opening-game presence',()=>{
 const v=view();for(const id of ['Aatrox','Renekton']){add(v,id,'Sejuani','Ornn',1,3);add(v,id,'Sejuani','Ornn',0,3);}
 for(const game of v.records)game.bans=game.lineups[0][0][0]==='Aatrox'?['Renekton']:[];
 const rows=draftAdvice(v,'TOP',{...options,set:3});assert.equal(rows[0].id,'Renekton');assert(rows[0].advice.reasons.includes('3세트 밴 관측'));
});
