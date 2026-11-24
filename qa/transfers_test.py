"""Exercise season transfer restrictions and actual trade UI, locally or on public Pages."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
report={'url':os.environ.get('LCK_TEST_URL','http://127.0.0.1:4173'),'flows':[],'errors':[]}
def state(q):return json.loads(q.evaluate("localStorage.getItem('lck-manager-save-v1')"))
def nav(q,id):
    target=q.locator(f'[data-action=nav][data-id="{id}"]').first
    if not target.is_visible():q.locator('[data-action=menu]').click()
    q.locator(f'[data-action=nav][data-id="{id}"]').first.click()
def search(q,name):q.locator('#market-search').fill(name)
def request(q,target,outgoing):
    q.locator(f'[data-action=trade-open][data-id="{target}"]').click()
    assert q.locator('[data-action=trade-submit]').is_disabled()
    q.locator('#trade-outgoing').select_option(outgoing)
    q.locator('[data-action=trade-submit]').click()
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    q=b.new_page(viewport={'width':1440,'height':1000},ignore_https_errors=True)
    q.set_default_timeout(20000);q.on('pageerror',lambda e:report['errors'].append(str(e)))
    q.goto(report['url']);q.locator('[data-action=new-game]').click()
    nav(q,'market');search(q,'Bdd');assert q.locator('[data-action=offer][data-id=bdd]').count()==1
    nav(q,'home');q.locator('[data-action=start-season]').click();nav(q,'market');search(q,'Bdd')
    assert q.locator('[data-action=offer]').count()==0
    assert '트레이드만 가능' in q.locator('tbody').inner_text()
    q.locator('[data-action=trade-open][data-id=bdd]').click()
    assert q.locator('[data-action=trade-submit]').is_disabled()
    options=q.locator('#trade-outgoing option').evaluate_all('(els)=>els.map(e=>e.value)')
    assert set(options)=={'','faker','guti'}
    q.locator('#trade-outgoing').select_option('faker');assert '수락 가능' in q.locator('.modal-body').inner_text()
    q.locator('[data-action=trade-submit]').click();s=state(q);assert s['trades'][0]['status']=='pending';assert s['players']['faker']['owner']=='T1';assert s['players']['bdd']['owner']=='KT'
    assert q.locator('[data-action=trade-open][data-id=bdd]').count()==0
    q.reload();q.locator('.vct-shell').wait_for();nav(q,'market');assert '검토 중' in q.locator('.trade-record').inner_text()
    nav(q,'calendar');q.locator('[data-action=advance][data-days="1"]').click();s=state(q)
    assert s['trades'][0]['status']=='accepted';assert s['players']['bdd']['owner']=='T1';assert s['players']['faker']['owner']=='KT'
    assert s['teams']['T1']['lineup']['MID']=='bdd';assert s['teams']['KT']['lineup']['MID']=='faker'
    report['flows'].append('preseason hire option; season direct hire absent; MID-only explicit selection; pending survives reload; next-day accepted swap updates both starting lineups')
    nav(q,'market');search(q,'Chovy');request(q,'chovy','guti');assert state(q)['trades'][0]['status']=='pending'
    q.locator('[data-action=trade-cancel]').click();assert state(q)['trades'][0]['status']=='cancelled';assert state(q)['players']['guti']['owner']=='T1'
    request(q,'chovy','guti');nav(q,'calendar');q.locator('[data-action=advance][data-days="1"]').click();s=state(q)
    assert s['trades'][0]['status']=='rejected';assert s['players']['guti']['owner']=='T1';assert s['players']['chovy']['owner']=='GEN'
    report['flows'].append('request cancellation releases player; weak offer rejected next day with ownership preserved')
    # A free agent fixture changes only affiliation, imported through the supported save UI.
    fa=next(x for x in s['players'].values() if x['owner']=='DK' and s['teams']['DK']['lineup'][x['position']]!=x['id'])
    fa['owner']=None;nav(q,'settings');q.locator('#save-file').set_input_files({'name':'trade-career.json','mimeType':'application/json','buffer':json.dumps(s).encode()})
    nav(q,'market');search(q,fa['name']);assert q.locator(f'[data-action=trade-open][data-id="{fa["id"]}"]').count()==0
    q.locator(f'[data-action=offer][data-id="{fa["id"]}"]').click();q.locator('[data-action=sign]').click();assert state(q)['players'][fa['id']]['owner']=='T1'
    report['flows'].append('season FA signing remains available after save import')
    q.set_viewport_size({'width':390,'height':844});nav(q,'market');search(q,'Chovy');q.locator('[data-action=trade-open][data-id=chovy]').click();q.locator('#trade-outgoing').select_option('guti')
    assert q.locator('[data-action=trade-submit]').is_visible();assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
    report['flows'].append('390px mobile trade form remains usable without page overflow')
    q.locator('[data-action=close-modal]').first.click();assert not report['errors'],report['errors']
    output=Path(os.environ.get('LCK_TEST_REPORT',str(ROOT/'transfers-results.json')));output.write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));b.close()
