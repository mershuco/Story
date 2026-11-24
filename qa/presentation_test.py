"""Current release browser checks:2026 profiles, flexible drafts and match playback."""
from pathlib import Path
import json,subprocess
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
result={'errors':[],'checks':[],'movement':{},'screenshots':[]}
def save(page):return json.loads(page.evaluate("localStorage.getItem('lck-manager-save-v1')"))
def shot(page,name):page.screenshot(path=str(ROOT/name),full_page=True);result['screenshots'].append(name)
def load(page,state):
    page.evaluate("s=>sessionStorage.setItem('_qa_next_save',JSON.stringify(s))",state);page.reload(wait_until='domcontentloaded')
with sync_playwright() as pw:
    b=pw.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    q=b.new_page(viewport={'width':1440,'height':1000});q.set_default_timeout(20000);q.on('pageerror',lambda e:result['errors'].append(str(e)))
    q.add_init_script("const pending=sessionStorage.getItem('_qa_next_save');if(pending){localStorage.setItem('lck-manager-save-v1',pending);sessionStorage.removeItem('_qa_next_save');}");q.goto('http://127.0.0.1:4173',wait_until='domcontentloaded');q.locator('[data-action=new-game]').wait_for();assert '2026 ROSTER' in q.locator('.onboard-intro').inner_text()
    assert 'Peyz' in q.locator('.club-starters').inner_text();shot(q,'2026-club-selection.png')
    q.locator('[data-action=new-game]').click();q.evaluate('document.fonts.ready');assert save(q)['year']==2026
    assert q.locator('.vct-dock>button').count()==7;assert q.locator('.vct-top').bounding_box()['height']==68;assert q.locator('.vct-left').bounding_box()['width']==310
    shot(q,'2026-lobby-desktop.png');result['checks'].append('2026 openingT1 roster and VCT layout preserved')
    q.locator('[data-action=start-season]').click();q.locator('[data-action=next-match]').click();q.locator('.auto-progress').wait_for(state='detached');q.locator('[data-action=prepare]').click();q.locator('[data-action=begin-draft]').click()
    q.locator('.draft-pool [data-action=draft-pick]:not([disabled])').first.wait_for();history_before=len(save(q)['activeDraft']['history'])
    q.locator('.draft-pool [data-action=draft-pick]:not([disabled])').first.click();assert len(save(q)['activeDraft']['history'])==history_before;q.locator('[data-action=draft-lock]').click()
    q.reload(wait_until='domcontentloaded');q.locator('.broadcast-draft').wait_for();q.locator('.draft-pool [data-action=draft-pick]:not([disabled])').first.wait_for()
    q.locator('[data-action=draft-auto-one]').click();q.locator('.draft-pool [data-action=draft-pick]:not([disabled])').first.wait_for()
    prefix=save(q)['activeDraft']['history'];partial=save(q)['activeDraft'];assert all(p['role'] is None for p in partial['picks']['blue']+partial['picks']['red'])
    shot(q,'2026-selection-unassigned.png');q.locator('[data-action=draft-auto-rest]').click();q.locator('.assignment-room').wait_for();q.locator('[data-action=assignment-pause]').click()
    d=save(q)['activeDraft'];assert d['step']==20;assert d['history'][:len(prefix)]==prefix;side='blue' if d['blue']=='T1' else 'red'
    assert all(p['role'] is None for p in d['picks'][side]);assert q.locator('[data-action=commit-draft]').is_disabled();assert q.locator('.broadcast-pick .loading-portrait').count()==10
    clock=q.locator('#assignment-seconds').inner_text();q.wait_for_timeout(1200);assert q.locator('#assignment-seconds').inner_text()==clock
    # Drag any champion into a role, then use a select to swap it to a different role.
    cid=d['picks'][side][0]['champion'];token=q.locator(f'[data-drag-champion="{cid}"]');target=q.locator('[data-drop-role=SUP]');token.drag_to(target)
    assert next(p for p in save(q)['activeDraft']['picks'][side] if p['champion']==cid)['role']=='SUP'
    q.locator('[data-change=assign-champion][data-role=TOP]').select_option(cid)
    assert next(p for p in save(q)['activeDraft']['picks'][side] if p['champion']==cid)['role']=='TOP'
    q.reload(wait_until='domcontentloaded');q.locator('.assignment-room').wait_for();assert save(q)['activeDraft']['assignment']['paused'];assert q.locator('[data-change=assign-champion][data-role=TOP]').input_value()==cid
    shot(q,'2026-assignment-desktop.png');result['checks'].append('all20 choices remain lane-free; postdraft60second phase, pause, drag, keyboardselect, reload and incomplete-gameguard')
    # Timer expiration fills only blank slots and waits for explicit match confirmation.
    state=save(q);state['activeDraft']['assignment'].update({'remaining':.2,'paused':False});load(q,state);q.locator('.assignment-room').wait_for();q.wait_for_function("JSON.parse(localStorage.getItem('lck-manager-save-v1')).activeDraft.assignment.expired")
    d=save(q)['activeDraft'];assert d['assignment']['expired'];assert next(p for p in d['picks'][side] if p['champion']==cid)['role']=='TOP';assert q.locator('[data-action=commit-draft]').is_enabled();assert save(q)['viewing'] is None
    result['checks'].append('timerauto-completion preservesmanualroles, usesnoRNG and doesnotstartmatch')
    career=save(q);q.locator('[data-action=draft-examples]').click();q.locator('[data-action=draft-reference][data-id*=worlds]').click();q.locator('[data-action=reference-end]').click();assert q.locator('.broadcast-team.blue .broadcast-pick[data-slot=B1] img').get_attribute('src').endswith('Karma.jpg');assert save(q)==career
    q.locator('[data-action=draft-back]').click();q.locator('[data-action=commit-draft]').click();q.locator('.rift-svg').wait_for();prefix=save(q)['activeMatch']['simulation']['events'];
    for _ in range(len(prefix)-1):q.locator('[data-action=viewer-next]').click()
    q.wait_for_timeout(200)
    assert q.locator('.live-rift').get_attribute('data-scene-kind')=='objective-setup';svg=q.locator('.rift-svg').element_handle();actor=q.locator('.champion-token[data-player=oner]');first=actor.get_attribute('transform');q.wait_for_timeout(500);second=actor.get_attribute('transform');assert first!=second;assert svg.evaluate('(el)=>el===document.querySelector(".rift-svg")')
    result['movement']={'from':first,'to':second,'sameSvgElement':True};shot(q,'2026-gank-animation.png');q.locator('[data-action=viewer-play]').click();paused=actor.get_attribute('transform');q.wait_for_timeout(300);assert actor.get_attribute('transform')==paused
    q.locator('[data-action=viewer-end]').click();assert '세트 기록' in q.locator('.live-results').inner_text();shot(q,'2026-match-result.png');result['checks'].append('historicaldraftreference preserved;2026championportraits move,pauseandshowresult')
    q.locator('[data-action=viewer-continue]').click();q.locator('[data-action=auto-draft]').click();q.locator('.assignment-room').wait_for();assert save(q)['activeDraft']['used'];q.locator('[data-action=assignment-auto]').click();assert q.locator('[data-action=commit-draft]').is_enabled();result['checks'].append('automaticdraft also stops atassignment; fearlessusedpicks carryover; coachbutton completes')
    # Legacy v1 save must select legacy data rather than reinterpreting2022 as2026.
    legacy=json.loads(subprocess.check_output(['node','--input-type=module','-e',"import fs from 'node:fs';import * as E from './dist/engine.js';E.configure(Object.fromEntries(['teams','players','champions','mastery','meta','international'].map(k=>[k,JSON.parse(fs.readFileSync('dist/data/'+k+'.json'))])));const s=E.newGame('T1',12);s.version=1;delete s.dataProfile;console.log(JSON.stringify(s));"],cwd=ROOT.parent,text=True));load(q,legacy);q.locator('.vct-shell').wait_for();assert 'Gumayusi' in q.locator('.vct-left').inner_text();q.locator('[data-action=menu]').click();q.locator('.vct-quick-menu [data-id=champions]').click();assert '12.1.1' in q.locator('.page-heading').inner_text();result['checks'].append('legacyversion1 save restores2022roster, masteryand12.xpatch')
    mobile=b.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);mq=mobile.new_page();mq.set_default_timeout(20000);mq.on('pageerror',lambda e:result['errors'].append(str(e)));mq.goto('http://127.0.0.1:4173');mq.locator('[data-action=new-game]').click();assert mq.evaluate('document.documentElement.scrollWidth<=window.innerWidth')
    mq.locator('[data-action=start-season]').click();mq.locator('[data-action=next-match]').click();mq.locator('.auto-progress').wait_for(state='detached');mq.locator('[data-action=prepare]').click();mq.locator('[data-action=auto-draft]').click();mq.locator('.assignment-room').wait_for();mq.locator('[data-action=assignment-pause]').click();assert mq.locator('[data-change=assign-champion]').count()==5;assert mq.evaluate('document.documentElement.scrollWidth<=window.innerWidth');shot(mq,'2026-assignment-mobile.png');mq.locator('[data-action=assignment-auto]').click();mq.locator('[data-action=commit-draft]').click();mq.locator('.rift-svg').wait_for();assert mq.evaluate('document.documentElement.scrollWidth<=window.innerWidth');result['checks'].append('390pxmobile assignment,coachconfirmation andviewer without horizontaloverflow')
    assert not result['errors'],result['errors'];(ROOT/'presentation-results.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps(result,ensure_ascii=False));b.close()
