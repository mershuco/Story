"""Visible third-set OP openings, protective counterbans, acquisition and reload."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
report={'url':os.environ.get('LCK_TEST_URL','http://127.0.0.1:4173'),'checks':[],'errors':[]}
def state(q):return json.loads(q.evaluate("localStorage.getItem('lck-manager-save-v1')"))
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);q=b.new_page(viewport={'width':1440,'height':1100},ignore_https_errors=True);q.set_default_timeout(25000);q.on('pageerror',lambda e:report['errors'].append(str(e)))
 q.add_init_script("const s=sessionStorage.getItem('_qa_next_save');if(s){localStorage.setItem('lck-manager-save-v1',s);sessionStorage.removeItem('_qa_next_save');}");q.goto(report['url']);q.locator('[data-action=new-game]').click()
 fixture=q.evaluate("""async()=>{const E=await import('./engine.js'),s=E.newGame('T1',77),m={id:'late-opening-qa',teams:['T1','GEN'],competition:'CUP',phase:'CUP_GROUP',bestOf:5,date:s.date,sets:[],score:[1,1],status:'scheduled'};s.matches.push(m);for(let n=1;n<3;n++){const d=E.completeDraft(s,E.newDraft(s,m));m.sets.push({picks:[...d.picks.blue,...d.picks.red],loser:'T1',winner:n===1?'T1':'GEN',number:n});}s.activeDraft=E.newDraft(s,m);s.activeDraft.firstPickSide='blue';return s;}""")
 q.evaluate("s=>sessionStorage.setItem('_qa_next_save',JSON.stringify(s))",fixture);q.reload(wait_until='domcontentloaded');q.locator('.broadcast-draft').wait_for()
 for _ in range(3):q.locator('[data-action=draft-auto-one]:not([disabled])').click();q.wait_for_function("JSON.parse(localStorage.getItem('lck-manager-save-v1')).activeDraft.history.length%2===0")
 q.locator('.draft-pool [data-action=draft-pick]:not([disabled])').first.wait_for();s=state(q);d=s['activeDraft'];assert d['step']==6;plan=d['aiOpeningPlan'];opened=plan['openings'];assert len(opened)==2 and plan['reserveCount']==2;assert not set(opened)&set(d['bans']['blue']+d['bans']['red']);assert not set(opened)&set(d['used'])
 protected=[h for h in d['history'] if h.get('protects')];assert protected;assert all(h['protects'] in opened and h['champion'] not in opened for h in protected)
 for id in opened:assert q.locator(f'.draft-pool [data-action=draft-pick][data-id="{id}"]').is_enabled()
 before=json.loads(json.dumps(d));rng=s['rng'];q.reload();q.locator('.broadcast-draft').wait_for();assert state(q)['activeDraft']==before and state(q)['rng']==rng;report['checks'].append('third-set visible first ban phase leaves two current power picks open; AI counterbans protect its intended targets; plans and RNG survive reload')
 mine=plan['claims']['blue'][0];q.locator(f'.draft-pool [data-action=draft-pick][data-id="{mine}"]').click();q.locator('[data-action=draft-lock]').click();q.wait_for_function("JSON.parse(localStorage.getItem('lck-manager-save-v1')).activeDraft.step>=9");q.locator('.draft-pool [data-action=draft-pick]:not([disabled])').first.wait_for();d=state(q)['activeDraft'];assert d['picks']['blue'][0]['champion']==mine;assert any(p['champion'] in opened for p in d['picks']['red']);assert all(p['role'] is None for p in d['picks']['blue']+d['picks']['red']);q.screenshot(path=str(ROOT/'2026-late-op-openings.png'),full_page=True)
 report['checks'].append('human acquires one opened OP and the opponent trades for another through actual pick turns; roles remain unassigned');report['example']={'opened':opened,'counterbans':[{'champion':h['champion'],'protects':h['protects'],'reason':h['reason']} for h in protected]}
 assert not report['errors'],report['errors'];Path(os.environ.get('LCK_TEST_REPORT',str(ROOT/'draft-openings-browser-results.json'))).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));b.close()
