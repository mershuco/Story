"""Visible viewport fit, fixed-pixel kill feed, and usable map decision overlay."""
import json,os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
report={'url':os.environ.get('LCK_TEST_URL','http://127.0.0.1:4173'),'checks':[],'errors':[]}
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);q=b.new_page(viewport={'width':1024,'height':650},ignore_https_errors=True);q.set_default_timeout(30000);q.on('pageerror',lambda e:report['errors'].append(str(e)))
 q.add_init_script("const s=sessionStorage.getItem('_fit_save');if(s){localStorage.setItem('lck-manager-save-v1',s);sessionStorage.removeItem('_fit_save');}")
 q.goto(report['url']);q.locator('[data-action=new-game]').click()
 fixture=q.evaluate("""async()=>{
 const E=await import('./engine.js'),M=await import('./match-sim.js');const s=E.newGame('T1',91),m={id:'viewport-qa',teams:['T1','GEN'],competition:'CUP',bestOf:3,date:s.date,sets:[],score:[0,0],status:'scheduled'};s.matches.push(m);
 for(const p of Object.values(s.players)){if(p.owner==='T1')p.ovr=45;else if(p.owner==='GEN')p.ovr=99;}
 s.activeDraft=E.completeDraft(s,E.newDraft(s,m));E.autoAssignDraft(s,s.activeDraft);E.confirmDraftAssignments(s.activeDraft);E.startLiveMatch(s,{incremental:true});
 for(let seed=1;seed<=40;seed++){
  const z=M.createMatchState(s.activeMatch.simulation.input,seed);
  for(let n=0;n<100&&!z.finished;n++){
   M.advanceMatch(z,{controlledTeam:s.myTeam,action:z.pending?'auto':null,maxEvents:1});
   if(z.pending&&z.gold.GEN-z.gold.T1>=4500&&z.events.some(e=>e.kills.length)){
    s.activeMatch.simulation=z;return s;
   }
  }
 }throw Error('no natural crisis fixture');}""")
 def load(s):
  q.evaluate("s=>sessionStorage.setItem('_fit_save',JSON.stringify(s))",s);q.reload();q.locator('.objective-decision').wait_for();q.wait_for_function("document.querySelector('.spectator-screen')?.dataset.fitted==='true'")
 def fits():
  q.wait_for_timeout(100)
  result=q.evaluate("""()=>{const r=s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom};},host=document.querySelector('.match-sheet');return {header:r('.live-spectator-header'),score:r('.live-scoreboard'),map:r('.live-rift'),dialog:r('.objective-decision'),overlay:r('.rift-decision-overlay'),actions:r('.objective-actions'),timeline:r('.scene-timeline'),narration:r('.scene-narration'),play:r('.live-playback'),vh:visualViewport.height,top:host.scrollTop,scroll:host.scrollHeight,client:host.clientHeight,players:[...document.querySelectorAll('.spectator-player')].map(e=>{const b=e.getBoundingClientRect(),texts=[...e.querySelectorAll('strong,small,.live-kda,.live-cs,.live-player-gold')].map(x=>x.getBoundingClientRect());return texts.every(t=>t.top>=b.top-1&&t.bottom<=b.bottom+1);})};}""")
  assert result['header']['y']>=0 and result['timeline']['bottom']<=result['vh']+1,result
  assert result['play']['bottom']<=result['vh'] and result['narration']['bottom']<=result['vh'],result
  assert result['scroll']<=result['client']+1,result
  assert all(result['players']),result
  assert abs(result['map']['w']-result['map']['h'])<=1,result
  assert result['dialog']['y']>=result['map']['y']-1 and result['dialog']['bottom']<=result['map']['bottom']+1,result
  assert result['actions']['bottom']<=result['dialog']['bottom'],result
  for choice in ['contest','trade','auto']:
   action=q.locator(f'[data-action=objective-choice][data-choice={choice}]');assert action.is_visible();action.click(trial=True)
  # The map scales while portrait pixels in the kill feed stay at 20px.
  assert q.locator('.live-rift .kill-entry').count()>0
  assert q.locator('.kill-entry img').first.evaluate('(e)=>e.getBoundingClientRect().width')==20
  assert q.evaluate('document.documentElement.scrollWidth<=innerWidth')
  return result
 load(fixture)
 for width,height in [(1440,900),(1280,720),(1024,768),(1024,650),(1180,640),(390,844),(390,700)]:
  q.set_viewport_size({'width':width,'height':height});result=fits();q.screenshot(path=str(ROOT/f'2026-viewport-overlay-{width}-{height}.png'),full_page=True)
  report['checks'].append(f'{width}x{height}: header, all 10 players, narration, playback and timeline fit; map dialog and all actions stay inside the map; kill portraits remain 20px')
 # Reload keeps the pending decision and RNG. Only scrolling details moves.
 q.set_viewport_size({'width':1024,'height':650});load(fixture);before=q.evaluate("JSON.parse(localStorage.getItem('lck-manager-save-v1')).activeMatch.simulation.rng");q.locator('.objective-decision-body').evaluate('(e)=>e.scrollTop=e.scrollHeight');fits();assert q.locator('.match-sheet').evaluate('(e)=>e.scrollTop')==0
 assert q.evaluate("JSON.parse(localStorage.getItem('lck-manager-save-v1')).activeMatch.simulation.rng")==before
 q.locator('[data-action=objective-choice][data-choice=trade]').click();q.wait_for_function("!document.querySelector('.rift-decision-overlay')");report['checks'].append('reload preserves pending RNG; details scroll independently, action buttons remain usable and trade dismisses the overlay')
 # Completed-set continuation must also fit above the archived stats table.
 q.locator('[data-action=viewer-end]').click();q.locator('.live-results').wait_for();q.wait_for_timeout(100)
 assert q.locator('[data-action=viewer-continue]').is_visible();assert q.locator('.scene-timeline').bounding_box()['y']+q.locator('.scene-timeline').bounding_box()['height']<=650
 assert q.locator('.live-results').bounding_box()['y']>=q.locator('.spectator-screen').bounding_box()['y']+q.locator('.spectator-screen').bounding_box()['height']-1
 report['checks'].append('completed set keeps continuation and timeline in the first screen, detailed archived stats stay below')
 assert not report['errors'],report['errors'];Path(os.environ.get('LCK_TEST_REPORT',str(ROOT/'viewport-overlay-browser-results.json'))).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));b.close()
