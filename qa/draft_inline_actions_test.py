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
 def load(s):q.evaluate("s=>sessionStorage.setItem('_inline_save',JSON.stringify(s))",s);q.reload();q.locator('.draft-meta-panel').wait_for()
 def verify(label,ancestor):
  assert q.locator('[data-action=draft-lock]').count()==1
  button=q.locator('[data-action=draft-lock]');assert button.inner_text()==label;assert q.locator('.champion-spotlight [data-action=draft-lock]').count()==0
  parent=button.locator(ancestor);photo=parent.locator('.champ-img').bounding_box();box=button.bounding_box();assert box['y']>=photo['y']+photo['height']-1,{'photo':photo,'button':box}
  assert button.is_enabled();assert q.locator('button button').count()==0
 before=saved();grid=q.locator('.draft-pool .champ-grid');grid.scroll_into_view_if_needed();grid.evaluate('(e)=>e.scrollTop=500');q.wait_for_timeout(100)
 cid=grid.evaluate("""g=>{const r=g.getBoundingClientRect();return [...g.querySelectorAll('[data-action=draft-pick]:not([disabled])')].filter(e=>{const b=e.getBoundingClientRect();return b.y>=r.y+30&&b.bottom<=r.bottom-30;}).at(-1).dataset.id;}""")
 card=q.locator(f'.draft-pool [data-action=draft-pick][data-id="{cid}"]');card.scroll_into_view_if_needed();top=grid.evaluate('(e)=>e.scrollTop');card.click();verify('밴','..');assert abs(q.locator('.draft-pool .champ-grid').evaluate('(e)=>e.scrollTop')-top)<=1;assert saved()==before
 q.screenshot(path=str(ROOT/'2026-inline-ban-desktop.png'),full_page=True);q.locator('[data-action=draft-lock]').click();q.wait_for_function("!document.querySelector('.draft-turn')?.textContent.includes('LOCKING')");after=saved();assert sum(h['champion']==cid for h in after['activeDraft']['history'])==1;assert q.locator('.draft-inline-lock').count()==0
 report['checks'].append('desktop: selecting a scrolled pool champion keeps grid position and RNG; exactly one Ban button sits under its portrait; confirmation commits once and no footer confirmation remains')
 fixture=q.evaluate("""async()=>{const E=await import('./engine.js'),s=E.newGame('T1',91),m={id:'inline-pick-fixture',teams:['T1','GEN'],competition:'CUP',phase:'CUP_GROUP',date:s.date,sets:[],score:[0,0],bestOf:3,status:'scheduled'};s.matches.push(m);s.activeDraft=E.newDraft(s,m);while(E.draftTurn(s.activeDraft).kind!=='pick'||E.draftTurn(s.activeDraft).team!=='T1')E.draftAction(s,s.activeDraft,E.legalChampions(s,s.activeDraft)[0].id);return s;}""")
 load(fixture);card=q.locator('[data-meta-lane=MID] .meta-champions .meta-champion:not([disabled])').first;cid=card.get_attribute('data-id');before=saved();card.click();verify('픽','..');assert saved()==before;q.locator('[data-action=draft-lock]').click();q.wait_for_function("!document.querySelector('.draft-turn')?.textContent.includes('LOCKING')");after=saved();assert any(x['champion']==cid and x['role'] is None for x in after['activeDraft']['picks']['blue']);report['checks'].append('meta card: Pick button appears under the selected portrait, commits through the real draft action, and does not assign a position')
 q.set_viewport_size({'width':390,'height':844});load(fixture);q.locator('#draft-search').fill('Zyra');card=q.locator('.draft-pool [data-action=draft-pick][data-id=Zyra]');card.click();verify('픽','..');assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');q.screenshot(path=str(ROOT/'2026-inline-pick-mobile.png'),full_page=True)
 # Switching origin must move, never duplicate, the only confirmation button.
 q.locator('[data-meta-lane=TOP] .meta-champions .meta-champion:not([disabled])').first.click();verify('픽','..');assert q.locator('.draft-pool .draft-inline-lock').count()==0;assert q.locator('.meta-choice .draft-inline-lock').count()==1
 report['checks'].append('390px: portrait-local pick button fits; moving selection from pool to tournament advice moves the unique confirmation button without nested buttons or page overflow')
 assert not report['errors'],report['errors'];Path(os.environ.get('LCK_TEST_REPORT',str(ROOT/'draft-inline-browser-results.json'))).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));b.close()
