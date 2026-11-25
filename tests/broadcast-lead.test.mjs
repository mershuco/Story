import test from 'node:test';import assert from 'node:assert/strict';
import {goldLeadLabels} from '../dist/broadcast-hud.js';
test('gold lead follows the richer scoreboard side and hides at equality',()=>{
 assert.deepEqual(goldLeadLabels(14900),{blue:'+14.9k',red:''});
 assert.deepEqual(goldLeadLabels(-14900),{blue:'',red:'+14.9k'});
 assert.deepEqual(goldLeadLabels(0),{blue:'',red:''});
 assert.deepEqual(goldLeadLabels(25),{blue:'+25G',red:''});
});
