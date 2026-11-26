"""2026 management regression flows, independent from draft presentation QA."""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent;report={'flows':[],'errors':[],'screenshots':[]}
def state(q):return json.loads(q.evaluate("localStorage.getItem('lck-manager-save-v1')"))
def nav(q,id):
    target=q.locator(f'[data-action=nav][data-id="{id}"]').first
    if not target.count() or not target.is_visible():q.locator('[data-action=menu]').click()
    q.locator(f'[data-action=nav][data-id="{id}"]').first.click()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);q=b.new_page(viewport={'width':1440,'height':1000});q.set_default_timeout(15000);q.on('pageerror',lambda e:report['errors'].append(str(e)));q.goto('http://127.0.0.1:4173');q.locator('[data-action=new-game]').click();assert state(q)['dataProfile']=='season-2026'
    q.locator('[data-action=player][data-id=faker]').first.click();q.locator('#mastery-search').fill('아지르');text=q.locator('.mastery-table').inner_text();assert '17경기' in text and q.locator('.mastery-table .form-value').inner_text()=='98' and '2025 출전' in text
    with q.expect_download() as dl:q.locator('[data-action=player-csv]').click()
    csv=Path(dl.value.path()).read_text(encoding='utf-8-sig');assert '2025games,2025wins' in csv and 'Azir,아지르,98,17,14' in csv;q.locator('[data-action=close-modal]').click();report['flows'].append('Faker career-based Azir mastery 98 with 2025 evidence of 17 games and 14 wins, verified in CSV export')
    nav(q,'training');q.locator('[data-change=focus][data-id=faker]').select_option('Azir');q.locator('[data-change=program][data-index="0"]').select_option('champion');assert state(q)['focus']['faker']=='Azir';assert state(q)['trainingPlan'][0]=='champion';report['flows'].append('weeklytraining andindividualchampionfocus persist')
    nav(q,'market');q.locator('#market-search').fill('Lucid');q.locator('[data-action=offer][data-id=lucid]').click();q.locator('[data-action=sign][data-id=lucid]').click();assert state(q)['players']['lucid']['owner']=='T1';assert state(q)['teams']['DK']['lineup']['JGL']!='lucid';report['flows'].append('transferfee,contract and2026opponentbackupreplacement')
    nav(q,'squad');before=state(q)['teams']['T1']['budget'];q.locator('[data-action=extend][data-id=faker]').click();assert state(q)['players']['faker']['contractEnd']==2027;assert state(q)['teams']['T1']['budget']<before;report['flows'].append('2026contractrenewal extends to2027 anddeducts signingfee')
    for id in ['calendar','league','champions','finance','history','settings']:
        nav(q,id);assert q.locator('.content h1').count()
        if id=='champions':
            assert '26.01' in q.locator('.page-heading').inner_text();assert '2026-10-18' in q.locator('.note').inner_text();q.locator('[data-action=champion][data-id=Azir]').click();assert '26.01' in q.locator('.modal-body .note').inner_text();q.locator('[data-action=close-modal]').click()
    report['flows'].append('allmanagementscreens,26.01datedkits,metatiers andcoverageexplanation')
    q.locator('[data-action=slot-save][data-id="0"]').click();saved=state(q);q.reload(wait_until='domcontentloaded');q.locator('.vct-shell').wait_for();assert state(q)['date']==saved['date'];assert state(q)['players']['faker']['contractEnd']==2027
    nav(q,'settings');q.locator('[data-action=slot-load][data-id="0"]').click();assert state(q)['focus']['faker']=='Azir';nav(q,'settings')
    with q.expect_download() as dl:q.locator('[data-action=export]').click()
    exported=json.loads(Path(dl.value.path()).read_text());assert exported['dataProfile']=='season-2026';q.locator('#save-file').set_input_files({'name':'career.json','mimeType':'application/json','buffer':json.dumps(exported).encode()});q.locator('.vct-shell').wait_for();assert state(q)['players']['lucid']['owner']=='T1';report['flows'].append('automaticsave,slotroundtrip andJSONexport/import')
    nav(q,'settings');q.locator('[data-action=new-career]').click();q.locator('[data-action=club][data-id=HLE]').click();assert 'Gumayusi' in q.locator('.club-starters').inner_text();assert 'Kanavi' in q.locator('.club-starters').inner_text();report['flows'].append('newcareer stays2026 andHLEopeninglineup containsKanavi/Gumayusi')
    assert not report['errors'],report['errors'];(ROOT/'browser-results.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));b.close()
