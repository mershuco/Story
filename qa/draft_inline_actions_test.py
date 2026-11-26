"""Real pick/ban actions stay next to the selected portrait and preserve grid scroll."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
report={'url':os.environ.get('LCK_TEST_URL','http://127.0.0.1:4173'),'checks':[],'errors':[]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);q=b.new_page(viewport={'width':1440,'height':1000},ignore_https_errors=True);q.set_default_timeout(30000);q.on('pageerror',lambda e:report['errors'].append(str(e)))
 q.add_init_script("const s=sessionStorage.getItem('_inline_save');if(s){localStorage.setItem('lck-manager-save-v1',s);sessionStorage.removeItem('_inline_save');}")
 q.goto(report['url']);q.locator('[data-action=new-game]').click();q.locator('[data-action=start-season]').click();q.locator('[data-action=next-match]').first.click();q.locator('[data-action=prepare]').first.click();q.locator('[data-action=begin-draft]').click();q.locator('.draft-meta-panel').wait_for()
 def saved():return json.loads(q.evaluate("localStorage.getItem('lck-manager-save-v1')"))
 def load(s):q.evaluate("s=>sessionStorage.setItem('_inline_save',JSON.stringify(s))",s);q.reload();q.locator('.draft-meta-panel').wait_for();q.locator('[data-action=draft-meta-toggle]').click()
 def verify(label,ancestor):
  assert q.locator('[data-action=draft-lock]').count()==1
  button=q.locator('[data-action=draft-lock]');assert button.inner_text()==label;assert q.locator('.champion-spotlight [data-action=draft-lock]').count()==0
  parent=button.locator(ancestor);photo=parent.locator('.champ-img').bounding_box();box=button.bounding_box();assert box['y']>=photo['y']+photo['height']-1,{'photo':photo,'button':box}
  assert button.is_enabled();assert q.locator('button button').count()==0
 selection=q.locator('.draft-selection');strip=q.locator('.broadcast-strip')
 def verify_dock():
  fixed=strip.bounding_box();pane=selection.bounding_box()
  assert pane['height']>=120 and pane['y']+pane['height']<=fixed['y']
  assert 0<=q.evaluate('visualViewport.height')-fixed['y']-fixed['height']<=32
  assert q.locator('.work-sheet').evaluate('(el)=>el.scrollTop')==0
  assert q.locator('.draft-pool .champ-grid').evaluate('(el)=>el.scrollTop')==0
  assert strip.locator('.broadcast-pick').count()==10 and strip.locator('.broadcast-ban').count()==10
  return fixed
 before=saved();fixed=verify_dock();selection.hover();q.mouse.wheel(0,500);q.wait_for_function("document.querySelector('.draft-selection').scrollTop>450")
 assert verify_dock()==fixed
 cid=selection.evaluate("""pane=>{const r=pane.getBoundingClientRect();return [...pane.querySelectorAll('.draft-pool [data-action=draft-pick]:not([disabled])')].filter(e=>{const b=e.getBoundingClientRect();return b.y>=r.y+15&&b.bottom<=r.bottom-15;}).at(-1).dataset.id;}""")
 card=q.locator(f'.draft-pool [data-action=draft-pick][data-id="{cid}"]');top=selection.evaluate('(e)=>e.scrollTop');card.click();verify('밴','..');assert abs(selection.evaluate('(e)=>e.scrollTop')-top)<=1;assert verify_dock()==fixed;assert saved()==before
 q.screenshot(path=str(ROOT/'2026-inline-ban-desktop.png'),full_page=True);q.locator('[data-action=draft-lock]').click();q.wait_for_function("!document.querySelector('.draft-turn')?.textContent.includes('LOCKING')");after=saved();assert sum(h['champion']==cid for h in after['activeDraft']['history'])==1;assert q.locator('.draft-inline-lock').count()==0
 assert len(after['activeDraft']['history'])>len(before['activeDraft']['history']);assert strip.locator('.broadcast-ban.banned').count()==len(after['activeDraft']['history']);assert verify_dock()==fixed;assert abs(selection.evaluate('(e)=>e.scrollTop')-top)<=1
 report['checks'].append('desktop: wheel moves the selection pane only; status stays fixed and shows committed bans; the inline Ban button keeps scroll position and commits once')
 fixture=q.evaluate("""async()=>{const E=await import('./engine.js'),s=E.newGame('T1',91),m={id:'inline-pick-fixture',teams:['T1','GEN'],competition:'CUP',phase:'CUP_GROUP',date:s.date,sets:[],score:[0,0],bestOf:3,status:'scheduled'};s.matches.push(m);s.activeDraft=E.newDraft(s,m);while(E.draftTurn(s.activeDraft).kind!=='pick'||E.draftTurn(s.activeDraft).team!=='T1')E.draftAction(s,s.activeDraft,E.legalChampions(s,s.activeDraft)[0].id);return s;}""")
 load(fixture);card=q.locator('[data-meta-lane=MID] .meta-champions .meta-champion:not([disabled])').first;cid=card.get_attribute('data-id');before=saved();card.click();verify('픽','..');assert saved()==before;q.locator('[data-action=draft-lock]').click();q.wait_for_function("!document.querySelector('.draft-turn')?.textContent.includes('LOCKING')");after=saved();assert any(x['champion']==cid and x['role'] is None for x in after['activeDraft']['picks']['blue']);report['checks'].append('meta card: Pick button appears under the selected portrait, commits through the real draft action, and does not assign a position')
 q.set_viewport_size({'width':390,'height':844});load(fixture);q.locator('#draft-search').fill('Zyra');card=q.locator('.draft-pool [data-action=draft-pick][data-id=Zyra]');card.click();verify('픽','..');assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');q.screenshot(path=str(ROOT/'2026-inline-pick-mobile.png'),full_page=True)
 # Switching origin must move, never duplicate, the only confirmation button.
 q.locator('[data-meta-lane=TOP] .meta-champions .meta-champion:not([disabled])').first.click();verify('픽','..');assert q.locator('.draft-pool .draft-inline-lock').count()==0;assert q.locator('.meta-choice .draft-inline-lock').count()==1
 report['checks'].append('390px: portrait-local pick button fits; moving selection from pool to tournament advice moves the unique confirmation button without nested buttons or page overflow')
 fearless=q.evaluate("""s=>{s.activeDraft.set=2;s.activeDraft.used=['Ahri','Alistar','Ashe','Braum','Camille','Elise','Galio','Gnar','Jinx','Vi'];return s;}""",fixture)
 for width,height in [(1280,720),(844,390),(390,844),(320,568)]:
  q.set_viewport_size({'width':width,'height':height});load(fearless);assert strip.locator('.series-used-icons img').count()==10
  fixed=verify_dock();selection.focus();selection.press('End');q.wait_for_function("document.querySelector('.draft-selection').scrollTop>350")
  assert verify_dock()==fixed
  q.locator('[data-action=draft-auto-rest]').click(trial=True)
  assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
  selection.press('Home');q.wait_for_function("document.querySelector('.draft-selection').scrollTop===0")
  assert verify_dock()==fixed
  report['checks'].append(f'{width}x{height}: keyboard scrolling moves only the selection pane; ten picks, ten bans and the series-ban list stay visible')
 assert not report['errors'],report['errors'];Path(os.environ.get('LCK_TEST_REPORT',str(ROOT/'draft-inline-browser-results.json'))).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));b.close()
