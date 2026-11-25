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
 for width,height in [(1440,900),(1024,650),(390,844)]:
  q.set_viewport_size({'width':width,'height':height})
  # Start normal continuous playback at a known already-generated Baron scene.
  q.locator('[data-action=viewer-speed][data-speed="8"]').click();q.locator(f'[data-action=viewer-scene][data-index="{fixture["index"]}"]').click();q.locator('[data-action=viewer-play]').click();q.locator('[data-action=viewer-play]').click()
  q.evaluate("""()=>{const host=document.querySelector('.match-sheet');host.scrollTop=200;window._host=host;window._scrollStart=host.scrollTop;window._samples=[];window._sampleTimer=setInterval(()=>{const now=document.querySelector('.match-sheet');window._samples.push({top:now.scrollTop,same:now===window._host,index:Number(document.querySelector('.scene-timeline .active').dataset.index),map:document.querySelector('.live-rift').getBoundingClientRect().width,mapY:document.querySelector('.live-rift').getBoundingClientRect().y});},16);}""")
  q.wait_for_timeout(1350);samples=q.evaluate("()=>{clearInterval(window._sampleTimer);return {samples:window._samples,start:window._scrollStart};}")
  assert samples['start']==0;assert len({x['index'] for x in samples['samples']})>=3,samples;assert all(x['same'] for x in samples['samples']);assert max(abs(x['top']-samples['start']) for x in samples['samples'])<=1,samples
  widths=[x['map'] for x in samples['samples']];assert max(widths)-min(widths)<=1,{'viewport':width,'mapMin':min(widths),'mapMax':max(widths),'samples':samples}
  positions=[x['mapY'] for x in samples['samples']];assert max(positions)-min(positions)<=1,{'viewport':width,'topMin':min(positions),'topMax':max(positions)}
  report.setdefault('geometry',[]).append({'viewport':[width,height],'mapMin':min(widths),'mapMax':max(widths),'mapTopMin':min(positions),'mapTopMax':max(positions),'sampleCount':len(widths)})
  # Speed changes preserve scroll after removing the detail panels.
  q.locator('[data-action=viewer-play]').click();before=q.locator('.match-sheet').evaluate('(el)=>el.scrollTop');q.locator('[data-action=viewer-speed][data-speed="4"]').evaluate('(el)=>el.click()');assert abs(q.locator('.match-sheet').evaluate('(el)=>el.scrollTop')-before)<=1
  assert q.locator('.kill-entry').count()>0;assert q.locator('.live-rift .rift-killfeed').count()==1;feed=q.locator('.rift-killfeed').bounding_box();rift=q.locator('.live-rift').bounding_box();assert rift['y']<=feed['y']<rift['y']+40;assert feed['x']>=rift['x']
  red=q.locator('.broadcast-score-team.red').bounding_box();grubs=q.locator('.broadcast-score-team.red .score-grub-icons').bounding_box();assert grubs['x']+grubs['width']>=red['x']+red['width']-20,{'width':width,'red':red,'grubs':grubs,'styles':q.locator('.broadcast-score-team.red').evaluate('(e)=>({direction:getComputedStyle(e).direction,columns:getComputedStyle(e).gridTemplateColumns})')}
  assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');q.screenshot(path=str(ROOT/f'2026-playback-scroll-{width}.png'),full_page=True);q.locator('.match-sheet').evaluate('(el)=>el.scrollTop=0');q.screenshot(path=str(ROOT/f'2026-playback-header-{width}.png'),full_page=True)
  report['checks'].append(f'{width}px: continuous x8 Baron playback advances >=3 highlights in 1.35s; map width and top stay constant across scene transitions, same scroll container without unwanted scroll; speed changes preserve scroll; red grubs align right')
 # Controlled late-game HUD snapshots isolate content changes from match RNG.
 late=q.evaluate("""async source=>{
  const O=await import('./objective-effects.js'),R=await import('./rift-state.js');const s=structuredClone(source),z=s.activeMatch.simulation,blue=z.teams[0],red=z.teams[1];z.events=z.events.slice(0,1);z.pending=null;
  const phases=[[],[['baron',blue]],[['baron',blue],['elder',blue]],[['elder',blue]],[['baron',red]],[['baron',red],['elder',red]],[]];
  for(let i=0;i<phases.length;i++){
   z.clock=40+i*.2;for(const kind of ['baron','elder'])for(const team of z.teams){z[kind+'Until'][team]=0;z.buffHolders[kind][team]=[];}
   for(const [kind,team] of phases[i])O.grantTemporaryBuff(z,kind,team);
   const [kind,team]=phases[i].at(-1)??['vision',blue],rift=R.riftSnapshot(z);rift.bounty=i%2?{team:red,targets:[]}:null;
   z.events.push({minute:z.clock,second:Math.round(z.clock*60),kind,type:'event',title:i%2?'긴 해설':'후반 상황',location:kind==='baron'?'baron':kind==='elder'?'dragon':'mid',team,kills:[],objective:['baron','elder'].includes(kind)?{kind,team}:null,text:i%2?'양 팀이 사이드 라인을 정리하며 바론과 장로 교전 이후 다음 공성을 준비합니다. '.repeat(12):'다음 교전을 준비합니다.',lead:z.gold[blue]-z.gold[red],gold:{...z.gold},score:{...z.score},dragons:{...z.dragons},grubs:{...z.grubs},objectiveState:O.objectiveSnapshot(z),rift});
  }return s;
 }""",fixture['state'])
 q.evaluate("s=>sessionStorage.setItem('_playback_save',JSON.stringify(s))",late);q.reload();q.locator('.rift-svg').wait_for();q.locator('[data-action=viewer-speed][data-speed=8]').click()
 for width,height in [(1440,900),(1024,650),(390,844)]:
  q.set_viewport_size({'width':width,'height':height});q.wait_for_timeout(100)
  q.evaluate("""()=>{window._lateSamples=[];window._lateTimer=setInterval(()=>{const b=document.querySelector('.live-rift').getBoundingClientRect();window._lateSamples.push({w:b.width,y:b.y});},8);}""")
  for index in [1,2,3,4,5,6,7,2]:
   q.locator(f'[data-action=viewer-scene][data-index="{index}"]').click();q.wait_for_function("document.querySelector('[data-action=viewer-play]')?.textContent==='재생'")
   if index in [3,6]:
    side='blue' if index==3 else 'red'
    assert q.locator(f'[data-power-play="{side}:baron"]').is_visible() and q.locator(f'[data-power-play="{side}:elder"]').is_visible()
    boxes=q.locator(f'.power-play-team.{side} .power-play-card:not([hidden])').evaluate_all('(xs)=>xs.map(x=>{const b=x.getBoundingClientRect();return {y:b.y,bottom:b.bottom};})')
    assert abs(boxes[0]['y']-boxes[1]['y'])<=1 and abs(boxes[0]['bottom']-boxes[1]['bottom'])<=1,boxes
  points=q.evaluate("()=>{clearInterval(window._lateTimer);return window._lateSamples;}");widths=[x['w'] for x in points];tops=[x['y'] for x in points]
  assert max(widths)-min(widths)<=1 and max(tops)-min(tops)<=1,{'viewport':width,'widths':sorted(set(widths)),'tops':sorted(set(tops))}
  assert q.locator('.scene-timeline').bounding_box()['y']+q.locator('.scene-timeline').bounding_box()['height']<=height
  report['checks'].append(f'{width}px controlled 40-minute snapshots: adding/removing Baron and Elder on both sides, double buffs, alternating bounty visibility and long/short narration preserve map size and position')
  report.setdefault('lateGeometry',[]).append({'viewport':[width,height],'mapMin':min(widths),'mapMax':max(widths),'mapTopMin':min(tops),'mapTopMax':max(tops),'sampleCount':len(points)})
 assert not report['errors'],report['errors'];Path(os.environ.get('LCK_TEST_REPORT',str(ROOT/'playback-closing-browser-results.json'))).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));b.close()
