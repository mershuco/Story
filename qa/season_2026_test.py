"""Complete2026 season through actual UI auto-progress and confirm persisted results."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);q=b.new_page(viewport={'width':1440,'height':1000});errors=[];q.on('pageerror',lambda e:errors.append(str(e)));q.goto('http://127.0.0.1:4173');q.locator('[data-action=club][data-id=HLE]').click();q.locator('[data-action=new-game]').click();q.locator('[data-action=menu]').click();q.locator('.vct-quick-menu [data-id=settings]').click();q.locator('[data-action=auto-season]').click();q.locator('.auto-progress').wait_for(state='detached',timeout=60000)
 raw=q.evaluate("localStorage.getItem('lck-manager-save-v1')");s=json.loads(raw);assert s['seasonComplete'];assert s['date']=='2026-11-14';assert len([m for m in s['matches'] if m['competition']=='REGULAR'])==130;assert len(s['international']['worldsParticipants'])==19;assert not errors,errors;q.screenshot(path=str(ROOT/'2026-season-complete.png'),full_page=True)
 q.reload();q.locator('.vct-shell').wait_for();s=json.loads(q.evaluate("localStorage.getItem('lck-manager-save-v1')"));assert s['phase']['key']=='OFFSEASON';assert q.locator('[data-action=next-season]').is_visible()
 report={'status':'passed','club':'HLE','date':s['date'],'series':len(s['matches']),'regularSeries':130,'worldsEntrants':19,'savedBytesUtf8':len(raw.encode()),'reloadPhase':s['phase']['key'],'errors':errors};(ROOT/'season-2026-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report));b.close()
