import test from 'node:test';
import assert from 'node:assert/strict';
import {createMatchState, advanceMatch, matchRandom, simulateMatch, replayMatch} from '../dist/match-sim.js';
import {botQuestReward} from '../dist/match-economy.js';
import {farmPlayers} from '../dist/rift-state.js';
import {laneEvent, localFightChance, dragonLaneControl} from '../dist/laning.js';

const roles = ['TOP', 'JGL', 'MID', 'BOT', 'SUP'];
const roster = ['B', 'R'].flatMap(team => roles.map(role => ({team, role, player: team + role, champion: 'Annie'})));
const input = {blue: 'B', red: 'R', bluePower: 80, redPower: 80, objectiveEra: 2026, patch: '16.9.1', roster, teamNames: {}};
const find = (s, id) => s.stats.find(p => p.player === id);

test('line OVR, champion timing, and kill history raise the relevant lane odds', () => {
 const even = createMatchState(input, 2);
 even.clock = 7;
 even.laneForm = {};
 const stronger = structuredClone(even);
 stronger.input.playerProfiles = {BTOP: {rating: 94, mastery: 75, activity: .6}};
 const early = structuredClone(even);
 find(early, 'BBOT').champion = 'Draven';
 find(early, 'RBOT').champion = 'Jinx';
 const both = (s, role) => ({B: [find(s, 'B' + role)], R: [find(s, 'R' + role)]});
 assert.equal(localFightChance(even, 'top', both(even, 'TOP')), .5);
 assert(localFightChance(stronger, 'top', both(stronger, 'TOP')) > .7);
 assert(dragonLaneControl(early).blueChance > dragonLaneControl(even).blueChance);

 const afterDuo = structuredClone(even);
 afterDuo.duoKillAt.B = 6.8;
 const count = (s, kind, lane) => {
  const rng = matchRandom(8741);
  return Array.from({length: 12000}, () => laneEvent(s, 1.25, rng))
   .filter(e => e?.kind === kind && e.lane === lane && e.attacker === 'B').length;
 };
 const evenTop = count(even, 'solo-kill', 'top'), evenBot = count(even, 'duo-kill', 'bot');
 assert(evenTop > 0 && evenBot > evenTop);
 assert(count(stronger, 'solo-kill', 'top') > evenTop);
 assert(count(afterDuo, 'duo-kill', 'bot') > evenBot);
});

test('line phase resolves only the participants, and first drake never triggers a fight or manual decision', () => {
 let found = {solo: false, duo: false, gank: false, secondPeace: false, secondContest: false};
 for (let seed = 1; seed <= 50; seed++) {
  const s = createMatchState(input, seed);
  while (s.clock < 15) advanceMatch(s, {controlledTeam: 'B', action: s.pending ? 'auto' : null, maxEvents: 1});
  const first = s.events.find(e => e.objective?.kind === 'dragon');
  assert(first && first.objectiveMode === 'lane-control' && !first.kills.length);
  assert(!s.events.some(e => e.kind === 'objective-setup' && e.location === 'dragon' && e.second < first.second));
  for (const e of s.events) {
   if (e.kind === 'solo-kill') {
    found.solo = true;
    assert.equal(e.kills.length, 1);
    const [{killer,victim,assists}] = e.kills;
    assert(!assists.length && find(s, killer).role === find(s, victim).role);
    assert(['TOP','MID'].includes(find(s,killer).role));
    assert.equal(e.participants.length, 2);
   }
   if (e.kind === 'duo-kill') {
    found.duo = true;
    const [{killer,victim,assists}] = e.kills;
    assert.equal(assists.length, 1);
    assert(['BOT','SUP'].includes(find(s,killer).role) && ['BOT','SUP'].includes(find(s,victim).role));
    assert.deepEqual(new Set([find(s,killer).role,find(s,assists[0]).role]),new Set(['BOT','SUP']));
   }
   if (e.kind === 'gank') {
    found.gank = true;
    assert.equal(e.participants.filter(id => find(s,id).role === 'JGL').length, 1);
   }
   if (['solo-kill','duo-kill','gank'].includes(e.kind)) assert(e.minute < 15);
  }
  const second = s.events.filter(e => e.objective?.kind === 'dragon')[1]?.objective;
  if (second) found[second.contested ? 'secondContest' : 'secondPeace'] = true;
 }
 assert(Object.values(found).every(Boolean));
});

test('CS produces ledger gold, return trips cost gold, and bot lane quest pays the patch reward once', () => {
 const s = createMatchState(input, 4);
 s.clock = 10;
 s.laneForm = {};
 s.deathAt.RBOT = 8;
 s.respawnAt.RBOT = 8.4;
 s.farmReturnAt.RBOT = 8.68;
 farmPlayers(s, 2);
 assert(find(s, 'BBOT').cs > find(s, 'RBOT').cs);
 assert(find(s, 'BBOT').gold > find(s, 'RBOT').gold);
 const bot = find(s, 'BBOT'), mid = find(s, 'BMID');
 assert.equal(botQuestReward(s, mid, {points: 1350, minions: 20, takedown: true}), 0);
 assert.equal(botQuestReward(s, bot, {points: 1350}), 300);
 assert.equal(botQuestReward(s, bot, {minions: 20, takedown: true}), 80);
 assert.equal(botQuestReward(s, bot, {points: 1350}), 0);
 const earlyPatch = structuredClone(s);
 earlyPatch.input.patch = '16.8.1';
 assert.equal(botQuestReward(earlyPatch, find(earlyPatch, 'BBOT'), {takedown: true}), 50);
});

test('postgame damage uses recorded participants and yields a replayable carry/support split', () => {
 const seed = 32;
 const playerProfiles = Object.fromEntries(roster.map(p => [p.player, {dpm: p.role === 'SUP' ? 175 : p.role === 'BOT' ? 780 : 500}]));
 const match = {...input, playerProfiles, seed, model: 'event-v15'};
 const out = simulateMatch(match, matchRandom(seed));
 for (const id of ['B','R']) {
  const carry = out.stats.find(p => p.team === id && p.role === 'BOT');
  const support = out.stats.find(p => p.team === id && p.role === 'SUP');
  assert(carry.damage > support.damage * 2 && support.damage > 0);
  assert(out.events.at(-1).rift.economy[id].roleQuest >= 300);
  assert.equal(Object.values(out.events.at(-1).rift.economy[id]).reduce((a,b) => a+b), out.finalGold[id]);
 }
 assert.deepEqual(replayMatch(match), out);
});
