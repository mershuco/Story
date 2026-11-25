"""Actual incremental match prefix; highlight pacing and nested-scroll regression."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
report={'url':os.environ.get('LCK_TEST_URL','http://127.0.0.1:4173'),'checks':[],'errors':[]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);q=b.new_page(viewport={'width':1440,'height':900},ignore_https_errors=True);q.set_default_timeout(30000);q.on('pageerror',lambda e:report['errors'].append(str(e)))
 q.add_init_script("const s=sessionStorage.getItem('_playback_save');if(s){localStorage.setItem('lck-manager-save-v1',s);sessionStorage.removeItem('_playback_save');}")
 q.goto(report['url']);q.locator('[data-action=new-game]').click()
 fixture=q.evaluate("""async()=>{const E=await import('./engine.js'),M=await import('./match-sim.js');const s=E.newGame('T1',91),m={id:'playback-natural-prefix',teams:['T1','GEN'],competition:'CUP',bestOf:1,date:s.date,sets:[],score:[0,0],status:'scheduled'};s.matches.push(m);s.activeDraft=E.completeDraft(s,E.newDraft(s,m));E.autoAssignDraft(s,s.activeDraft);E.confirmDraftAssignments(s.activeDraft);E.startLiveMatch(s,{incremental:true});const input=s.activeMatch.simulation.input;for(let seed=1;seed<=30;seed++){const z=M.createMatchState(input,seed);for(let n=0;n<100&&!z.finished;n++){M.advanceMatch(z,{auto:true,maxEvents:1});const index=z.events.findIndex(e=>e.kind==='baron');if(index>=0&&z.events.length>=index+5&&!z.finished){s.activeMatch.simulation=z;return {state:s,index};}}}throw Error('no natural Baron prefix');}""")
 q.evaluate("s=>sessionStorage.setItem('_playback_save',JSON.stringify(s))",fixture['state']);q.reload();q.locator('.rift-svg').wait_for()
 for width,height in [(1440,900),(390,844)]:
  q.set_viewport_size({'width':width,'height':height})
  # Start normal continuous playback at a known already-generated Baron scene.
  q.locator('[data-action=viewer-speed][data-speed="8"]').click();q.locator(f'[data-action=viewer-scene][data-index="{fixture["index"]}"]').click();q.locator('[data-action=viewer-play]').click();q.locator('[data-action=viewer-play]').click()
  q.evaluate("""()=>{const host=document.querySelector('.match-sheet');host.scrollTop=200;window._host=host;window._scrollStart=host.scrollTop;window._samples=[];window._sampleTimer=setInterval(()=>{const now=document.querySelector('.match-sheet');window._samples.push({top:now.scrollTop,same:now===window._host,index:Number(document.querySelector('.scene-timeline .active').dataset.index)});},16);}""")
  q.wait_for_timeout(1350);samples=q.evaluate("()=>{clearInterval(window._sampleTimer);return {samples:window._samples,start:window._scrollStart};}")
  assert samples['start']>=150;assert len({x['index'] for x in samples['samples']})>=3,samples;assert all(x['same'] for x in samples['samples']);assert max(abs(x['top']-samples['start']) for x in samples['samples'])<=1,samples
  # Speed changes preserve scroll after removing the detail panels.
  q.locator('[data-action=viewer-play]').click();before=q.locator('.match-sheet').evaluate('(el)=>el.scrollTop');q.locator('[data-action=viewer-speed][data-speed="4"]').evaluate('(el)=>el.click()');assert abs(q.locator('.match-sheet').evaluate('(el)=>el.scrollTop')-before)<=1
  assert q.locator('.kill-entry').count()>0;assert q.locator('.live-rift .rift-killfeed').count()==0;feed=q.locator('.rift-killfeed').bounding_box();rift=q.locator('.live-rift').bounding_box();assert feed['y']>=rift['y']+rift['height']
  red=q.locator('.broadcast-score-team.red').bounding_box();grubs=q.locator('.broadcast-score-team.red .score-grub-icons').bounding_box();assert grubs['x']+grubs['width']>=red['x']+red['width']-20,{'width':width,'red':red,'grubs':grubs,'styles':q.locator('.broadcast-score-team.red').evaluate('(e)=>({direction:getComputedStyle(e).direction,columns:getComputedStyle(e).gridTemplateColumns})')}
  assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');q.screenshot(path=str(ROOT/f'2026-playback-scroll-{width}.png'),full_page=True);q.locator('.match-sheet').evaluate('(el)=>el.scrollTop=0');q.screenshot(path=str(ROOT/f'2026-playback-header-{width}.png'),full_page=True)
  report['checks'].append(f'{width}px: continuous x8 Baron playback advances >=3 highlights in 1.35s; same scroll container and scrollTop; speed changes preserve scroll; red grubs align right')
 assert not report['errors'],report['errors'];Path(os.environ.get('LCK_TEST_REPORT',str(ROOT/'playback-closing-browser-results.json'))).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));b.close()
