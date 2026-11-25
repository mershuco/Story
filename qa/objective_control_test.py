"""Minimap, reachable bounty targets, persistent ownership UI and expanded draft."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
report={'url':os.environ.get('LCK_TEST_URL','http://127.0.0.1:4173'),'checks':[],'errors':[]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);q=b.new_page(viewport={'width':1440,'height':1100},ignore_https_errors=True);q.set_default_timeout(30000);q.on('pageerror',lambda e:report['errors'].append(str(e)))
 q.add_init_script("const s=sessionStorage.getItem('_control_save');if(s){localStorage.setItem('lck-manager-save-v1',s);sessionStorage.removeItem('_control_save');}")
 q.goto(report['url']);q.locator('[data-action=new-game]').click();q.locator('[data-action=start-season]').click();q.locator('[data-action=next-match]').first.click();q.locator('[data-action=prepare]').first.click();q.locator('[data-action=begin-draft]').click();q.locator('.draft-pool [data-action=draft-pick]:not([disabled])').first.wait_for()
 assert q.locator('.recommendations,.recommendation').count()==0;assert '추천 챔피언' not in q.locator('.broadcast-draft').inner_text();assert q.locator('.champ-card').count()>=160
 box=q.locator('.champ-grid').bounding_box();stage=q.locator('.broadcast-stage').bounding_box();assert box['width']>stage['width']*.95
 q.screenshot(path=str(ROOT/'2026-expanded-draft.png'),full_page=True);q.set_viewport_size({'width':390,'height':844});assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');q.screenshot(path=str(ROOT/'2026-expanded-draft-mobile.png'),full_page=True);q.set_viewport_size({'width':1440,'height':1100});report['checks'].append('recommendation cards and initial recommendation removed; >=160 champions in a full-width grid; desktop/mobile fit')
 fixture=q.evaluate("""async()=>{
  const E=await import('./engine.js'),M=await import('./match-sim.js'),R=await import('./rift-state.js'),O=await import('./objective-effects.js'),B=await import('./objective-bounties.js');
  const s=E.newGame('T1',91),m={id:'control-ui-fixture',teams:['T1','GEN'],competition:'CUP',bestOf:1,date:s.date,sets:[],score:[0,0],status:'scheduled'};s.matches.push(m);s.activeDraft=E.completeDraft(s,E.newDraft(s,m));E.autoAssignDraft(s,s.activeDraft);E.confirmDraftAssignments(s.activeDraft);E.startLiveMatch(s,{incremental:true});
  const z=M.createMatchState(s.activeMatch.simulation.input,s.rng),blue=z.teams[0],red=z.teams[1];s.activeMatch.simulation=z;z.events=z.events.slice(0,1);
  for(let i=0;i<4;i++){z.clock=5+i*5;O.takeDragon(z,blue,M.matchRandom(55+i));}z.grubs[blue]=3;
  R.creditTeam(z,blue,47900);R.creditTeam(z,red,33000);z.clock=32;B.updateBounties(z);O.grantTemporaryBuff(z,'baron',blue);
  const add=(kind,team,objective=null,push=null)=>z.events.push({minute:z.clock,second:Math.round(z.clock*60),kind,type:'event',title:kind,location:kind==='baron'?'baron':kind==='elder'?'dragon':'mid',team,kills:[],objective,push,text:team+' '+kind,lead:z.gold[blue]-z.gold[red],gold:{...z.gold},score:{...z.score},dragons:{...z.dragons},grubs:{...z.grubs},objectiveState:O.objectiveSnapshot(z),rift:R.riftSnapshot(z)});
  add('baron',blue,{kind:'baron',team:blue});z.clock=32.3;O.grantTemporaryBuff(z,'elder',red);B.updateBounties(z);add('elder',red,{kind:'elder',team:red});z.clock=32.4;B.updateBounties(z);add('vision',blue);s.viewing={matchId:m.id,setIndex:0};return {state:s,blue,red};
 }""")
 def load(s):q.evaluate("s=>sessionStorage.setItem('_control_save',JSON.stringify(s))",s);q.reload(wait_until='domcontentloaded');q.locator('.rift-svg').wait_for()
 load(fixture['state']);blue=fixture['blue'];red=fixture['red'];q.wait_for_function("document.querySelector('.summoners-rift-minimap')?.getAttribute('href').endsWith('summoners-rift.png')")
 loaded=q.evaluate("""async()=>{const urls=[...document.querySelectorAll('.building-icon,.rift-objective image,.summoners-rift-minimap')].map(el=>el.getAttribute('href'));return Promise.all([...new Set(urls)].map(src=>new Promise(resolve=>{const img=new Image();img.onload=()=>resolve(img.naturalWidth>0);img.onerror=()=>resolve(false);img.src=src;})));}""");assert all(loaded) and len(loaded)>=6;assert q.locator('.building-core').count()==0;assert q.locator('.rift-nexus').count()==0
 assert q.locator('.has-objective-bounty').count()==3;assert all(x.startswith('blue:') for x in q.locator('.has-objective-bounty').evaluate_all('(xs)=>xs.map(x=>x.dataset.building)'));assert q.locator('[data-bounty-banner]').is_visible()
 for side,kind,team in [('blue','baron',blue),('red','elder',red)]:
  card=q.locator(f'[data-power-play="{side}:{kind}"]');assert card.is_visible();assert team in card.locator('.power-owner').inner_text();assert ':' in card.locator('.power-time').inner_text()
 assert q.locator('.objective-guide,.economy-ledger,.vision-summary,.live-advantage,.team-objective-buffs').count()==0;assert q.locator(f'[data-team-gold-diff="{blue}"]').inner_text()=='+14.9k';assert q.locator(f'[data-team-gold-diff="{red}"]').is_hidden()
 assert q.locator('.grub-slot.earned').count()==3;assert q.locator('.grub-slot.earned img').first.evaluate('(el)=>getComputedStyle(el).filter')=='none';q.screenshot(path=str(ROOT/'2026-bounties-powerplay.png'),full_page=True)
 q.reload();q.locator('.has-objective-bounty').first.wait_for();assert q.locator('[data-power-play="blue:baron"]').is_visible();report['checks'].append('real Riot minimap and structure/objective images load, purple grub icons, only enemy reachable towers outlined for trailing team; Baron/Elder owner timers persist after reload')
 # The map fills the middle column; commentary and kills never cover it.
 for width,height in [(1440,1100),(1280,800),(1024,768),(390,844)]:
  q.set_viewport_size({'width':width,'height':height});q.locator('.match-sheet').evaluate('(e)=>e.scrollTop=0')
  bounds=q.evaluate("""()=>{const r=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};};return {map:r('.live-rift'),center:r('.rift-center'),blue:r('.spectator-team.blue'),red:r('.spectator-team.red'),commentary:r('.broadcast-commentary'),score:r('.broadcast-scoreboard'),board:r('.spectator-layout')};}""")
  if width>680:assert abs(bounds['map']['w']-bounds['center']['w'])<=1,bounds
  assert abs(bounds['map']['w']-bounds['map']['h'])<=1,bounds
  assert bounds['commentary']['y']>=max(bounds[x]['bottom'] for x in ['map','blue','red'])-1,bounds
  if width>680:
   assert bounds['blue']['right']<=bounds['map']['x'] and bounds['map']['right']<=bounds['red']['x'],bounds
   assert bounds['map']['w']>=200,bounds
  assert bounds['board']['y']-bounds['score']['bottom']<90,bounds
  for team in [blue,red]:
   amount=q.locator(f'[data-team-gold="{team}"]').bounding_box();diff=q.locator(f'[data-team-gold-diff="{team}"]')
   if diff.is_visible():
    label=diff.bounding_box();assert label['y']>=amount['y']+amount['height']-1
  assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
  assert all(q.locator(f'[data-live-player] .{cls}').count()==10 for cls in ['live-kda','live-cs','live-player-gold'])
  assert q.locator('[data-live-player] .live-cs').first.is_visible()
  q.screenshot(path=str(ROOT/f'2026-broadcast-clean-{width}.png'),full_page=True)
 report['checks'].append('1440/1280/1024/390px: fitted square map, narration beneath map, leading-only gold beneath total; no horizontal overflow')
 # Controlled gold reversal and equality must move or hide the label.
 for lead in [-14900,0]:
  changed=json.loads(json.dumps(fixture['state']));events=changed['activeMatch']['simulation']['events']
  for e in events[1:]:
   e['gold'][blue]=50000+lead;e['gold'][red]=50000;e['lead']=lead
  load(changed);expected=red if lead<0 else None
  assert q.locator('[data-team-gold-diff]:visible').count()==(1 if expected else 0)
  if expected:assert q.locator(f'[data-team-gold-diff="{expected}"]').inner_text()=='+14.9k'
 load(fixture['state'])
 after=q.evaluate("""async source=>{const R=await import('./rift-state.js'),O=await import('./objective-effects.js'),B=await import('./objective-bounties.js');const s=structuredClone(source),z=s.activeMatch.simulation,id=z.teams[1];z.clock+=.08;const before=z.gold[id],push=R.attackStructures(z,id,{lane:'top',rng:()=>.5,forceDamage:2700});B.updateBounties(z);z.events.push({minute:z.clock,second:Math.round(z.clock*60),kind:'siege',type:'event',title:'현상금 포탑 파괴',location:'top',team:id,kills:[],objective:{kind:'tower',team:id},push,text:'포탑과 현상금 획득',lead:z.gold[z.teams[0]]-z.gold[z.teams[1]],gold:{...z.gold},score:{...z.score},dragons:{...z.dragons},grubs:{...z.grubs},objectiveState:O.objectiveSnapshot(z),rift:R.riftSnapshot(z)});return {state:s,bonus:push.bounty,paid:z.gold[id]-before,base:push.gold};}""",fixture['state'])
 assert after['bonus']>0 and after['paid']==after['base']+after['bonus'];load(after['state']);assert q.locator('[data-building="blue:top:tower:0"]').get_attribute('class').find('destroyed')>=0;assert q.locator('[data-building="blue:top:tower:1"]').get_attribute('class').find('has-objective-bounty')>=0
 q.set_viewport_size({'width':390,'height':844});assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');assert q.locator('[data-power-play="blue:baron"]').is_visible();assert q.locator('[data-power-play="red:elder"]').is_visible();q.screenshot(path=str(ROOT/'2026-bounties-powerplay-mobile.png'),full_page=True);report['checks'].append('destroyed bounty tower pays actual base+bonus once and moves target outline forward; both ownership cards remain visible at 390px; removed descriptive panels and leader-only +14.9k gold display verified')
 assert not report['errors'],report['errors'];Path(os.environ.get('LCK_TEST_REPORT',str(ROOT/'objective-control-browser-results.json'))).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));b.close()
