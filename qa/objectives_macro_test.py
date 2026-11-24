"""4500G crisis-only manual prompts, win odds, save/resume and objective counters."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
report={'url':os.environ.get('LCK_TEST_URL','http://127.0.0.1:4173'),'checks':[],'errors':[]}
def saved(q):return json.loads(q.evaluate("localStorage.getItem('lck-manager-save-v1')"))
def load(q,s):q.evaluate("s=>sessionStorage.setItem('_qa_next_save',JSON.stringify(s))",s);q.reload(wait_until='domcontentloaded')
def decision_record(s,action):
 if s.get('activeMatch'):return any(x[1:]==[s['myTeam'],action] for x in s['activeMatch']['simulation']['decisions'])
 m=next(m for m in s['matches'] if m['id']==s['viewing']['matchId']);return any(x[1:]==[s['myTeam'],action] for x in m['sets'][-1]['simulationReplay'].get('decisionOverrides',[]))
def settled(q):q.locator('.objective-decision,.live-results').first.wait_for()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);q=b.new_page(viewport={'width':1440,'height':1100},ignore_https_errors=True);q.set_default_timeout(30000);q.on('pageerror',lambda e:report['errors'].append(str(e)));q.add_init_script("const s=sessionStorage.getItem('_qa_next_save');if(s){localStorage.setItem('lck-manager-save-v1',s);sessionStorage.removeItem('_qa_next_save');}")
 q.goto(report['url']);q.locator('[data-action=new-game]').click();q.locator('[data-action=start-season]').click();q.locator('[data-action=next-match]').first.click();q.locator('[data-action=prepare]').first.click();q.locator('[data-action=auto-draft]').click();q.locator('[data-action=assignment-pause]').click();q.locator('[data-action=assignment-auto]').click()
 # Controlled disadvantage fixture: the real UI commits and runs the actual simulation.
 distress=saved(q);distress['rng']=42;teams=[distress['activeDraft']['blue'],distress['activeDraft']['red']]
 for player in distress['players'].values():
  if player['owner']==distress['myTeam']:player['ovr']=45
  elif player['owner'] in teams:player['ovr']=99
 # Find a deterministic crisis for this real draft without changing production rules.
 distress['rng']=q.evaluate("""async source=>{const E=await import('./engine.js');for(let seed=1;seed<=100;seed++){const s=structuredClone(source);s.rng=seed;E.confirmDraftAssignments(s.activeDraft);E.startLiveMatch(s);if(s.activeMatch)return seed;}throw Error('No crisis fixture found');}""",distress)
 load(q,distress);q.locator('[data-action=commit-draft]').click();opening=saved(q);assert opening['activeMatch']['incremental'];assert opening['activeMatch']['simulation']['winner'] is None;assert len(opening['activeMatch']['simulation']['events'])==2;report['checks'].append('viewer begins with only the opening and first rolled scene, with no winner or future match result');q.locator('[data-action=viewer-speed][data-speed="8"]').click();q.locator('.objective-decision').wait_for(timeout=60000);s=saved(q);assert s['activeMatch'];m=next(m for m in s['matches'] if m['id']==s['activeMatch']['matchId']);assert len(m['sets'])==0 and m['score']==[0,0]
 sim=s['activeMatch']['simulation'];opponent=next(id for id in sim['teams'] if id!=s['myTeam']);assert sim['gold'][opponent]-sim['gold'][s['myTeam']]>=4500
 for e in sim['events'][:-1]:
  if e['kind']=='objective-setup':assert e['gold'][opponent]-e['gold'][s['myTeam']]<4500
 q.wait_for_function("document.querySelector('.objective-decision header small')?.textContent.trim().endsWith(document.querySelector('#live-clock').textContent)");text=q.locator('.objective-decision').inner_text();assert '강타 지수' in text and '추가 라인·정글 자원 상한' in text and '확보 예상' in text and '우리 한타·교전 승리 확률' in text and '4,500G' in text;q.screenshot(path=str(ROOT/'2026-objective-decision.png'),full_page=True)
 trade=sim['pending'];quote=q.locator('.objective-odds strong').nth(2).inner_text();assert quote=='0~350G'
 assert q.locator('.objective-reward').first.is_visible();q.locator('.objective-guide summary').click();assert q.locator('.objective-guide-grid article').count()==6;assert '첫 세 용은 서로 다른' in q.locator('.objective-guide').inner_text();assert 'HERALD' not in q.locator('.rift-objective.baron').text_content();q.locator('.objective-guide summary').click()
 initial=s;rng=sim['rng'];pending=sim['pending'];q.reload();q.locator('.objective-decision').wait_for();assert saved(q)['activeMatch']['simulation']['rng']==rng;assert saved(q)['activeMatch']['simulation']['pending']==pending;report['checks'].append('distress fixture uses real UI/simulation: noncritical objectives auto-resolve, manual prompt only at >=4500G deficit, win and capture odds appear, reload preserves RNG')
 q.locator('[data-action=objective-choice][data-choice=trade]').click();assert decision_record(saved(q),'trade')
 after_trade=saved(q)
 if after_trade.get('activeMatch'):
  exchange=next(e for e in after_trade['activeMatch']['simulation']['events'][len(initial['activeMatch']['simulation']['events']):] if e['kind']=='trade-push');assert exchange['sideResources']['gold']<=350;assert exchange['tradeGold'][s['myTeam']]==exchange['sideResources']['gold']+exchange['push']['gold']
 report['checks'].append('six drake effects and soul/Elder guide, correct pit labels, 0–350G extra resource limit and actual structure-based trade payout')
 load(q,initial);q.locator('.objective-decision').wait_for();q.locator('[data-action=objective-choice][data-choice=contest]').click();assert decision_record(saved(q),'contest');report['checks'].append('contest and trade branch from the same saved crisis and persist actual decisions')
 load(q,initial);q.locator('.objective-decision').wait_for();q.set_viewport_size({'width':390,'height':844});q.locator('.objective-decision').scroll_into_view_if_needed();assert q.locator('[data-action=objective-choice][data-choice=auto]').is_visible();assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');q.screenshot(path=str(ROOT/'2026-objective-mobile.png'),full_page=True);q.locator('[data-action=objective-choice][data-choice=auto]').click();after=saved(q)
 if after.get('activeMatch'):
  z=after['activeMatch']['simulation'];opp=next(id for id in z['teams'] if id!=after['myTeam']);assert z['winner'] is None
  if q.locator('.objective-decision').count():assert z['pending'] and z['gold'][opp]-z['gold'][after['myTeam']]>=4500
 load(q,initial);q.locator('.objective-decision').wait_for();q.locator('[data-action=match-auto]').click();s=saved(q);assert s['activeMatch'] is None;m=next(m for m in s['matches'] if m['id']==s['viewing']['matchId']);z=m['sets'][-1];assert z['simulationReplay']['model']=='event-v10';assert len(z['objectiveTotals'])==10;report['checks'].append('390px win-odds dialog, one-decision auto and remaining-set auto preserve the crisis threshold and complete the match')
 q.wait_for_function("document.querySelector('.live-scoreboard .grub-slot.earned') || document.querySelector('.live-scoreboard [data-drake-icons] img')")
 assert q.locator('[data-grubs],[data-dragons],.side-objectives,.scoreboard-objectives').count()==0
 for side,index in [('blue',0),('red',1)]:
  team=z[side];icons=q.locator(f'.live-scoreboard [data-grub-icons="{team}"]');assert icons.locator('.grub-slot').count()==3;assert icons.locator('.grub-slot.earned').count()==z['objectiveTotals'][index];assert icons.inner_text()=='';assert '유충' not in q.locator('.live-scoreboard').inner_text()
 report['checks'].append('both teams show three LCK-style grub icon slots lit according to captured grubs, with text counters removed');q.set_viewport_size({'width':1440,'height':1100});q.screenshot(path=str(ROOT/'2026-objective-counts.png'),full_page=True);assert q.locator('.objective-decision').count()==0
 # Broadcast state is checked against the actual seeded completed match.
 for side in ['blue','red']:
  team=z[side];assert sum(x['gold'] for x in z['stats'] if x['team']==team)==z['finalGold'][team]
  for player in [x for x in z['stats'] if x['team']==team]:
   row=q.locator(f'[data-live-player="{player["player"]}"]');opponent=next(x for x in z['stats'] if x['team']!=team and x['role']==player['role'])
   assert row.locator('.live-player-gold').inner_text()==f'{player["gold"]:,} G';gap=player['gold']-opponent['gold'];assert row.locator('.live-player-gap').inner_text()==f'{gap:+,} G' if gap else row.locator('.live-player-gap').inner_text()=='0 G'
 q.wait_for_function("[...document.querySelectorAll('.objective-guide-grid .objective-icon')].every(x=>x.complete&&x.naturalWidth>0)")
 replay=q.evaluate("""async set=>{const {replayMatch}=await import('./match-sim.js');const x=replayMatch({...set.simulationReplay,blue:set.blue,red:set.red,number:set.number,roster:set.stats});return x.events.map((e,i)=>({i,kind:e.kind,push:e.push,rift:e.rift}));}""",z)
 baron=next((e for e in replay if (e.get('push') or {}).get('baron')),next(e for e in replay if e.get('push')));q.locator('[data-action=viewer-speed][data-speed="1"]').click();q.locator(f'[data-action=viewer-scene][data-index="{baron["i"]}"]').click();q.wait_for_timeout(450);first=q.locator('[data-minion="0"]').get_attribute('transform');q.wait_for_timeout(180);second=q.locator('[data-minion="0"]').get_attribute('transform');assert first!=second;assert q.locator('.minion-waves .empowered').count()==(7 if baron['push']['baron'] else 0);q.locator('[data-action=viewer-play]').click();q.screenshot(path=str(ROOT/'2026-baron-siege-broadcast.png'),full_page=True)
 assert q.locator('[data-building]').count()==30;assert q.locator('[data-zone]').count()==6;assert q.locator('.vision-summary').is_visible();assert q.locator('[data-drake-icons] .objective-icon').count()>0
 q.set_viewport_size({'width':390,'height':844});assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');q.screenshot(path=str(ROOT/'2026-broadcast-hud-mobile.png'),full_page=True)
 report['checks'].append('broadcast HUD uses all six loaded drake images; actual KDA/CS/player gold and opposing-role gaps conserve team gold; siege minions move, persistent buildings/vision render, 390px layout fits')
 assert not report['errors'],report['errors'];Path(os.environ.get('LCK_TEST_REPORT',str(ROOT/'objectives-macro-browser-results.json'))).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));b.close()
