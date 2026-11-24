"""Champion analyses, timed draft advice and live pre-fight KDA effects."""
import json
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parent
report={'url':os.environ.get('LCK_TEST_URL','http://127.0.0.1:4173'),'checks':[],'errors':[]}
def nav(q,id):
 target=q.locator(f'[data-action=nav][data-id="{id}"]:visible').first
 if not target.count():
  home=q.locator('.live-spectator [data-action=nav][data-id=home]')
  if home.is_visible():home.click()
  q.locator('[data-action=menu]:visible').click()
 q.locator(f'[data-action=nav][data-id="{id}"]:visible').first.click()
def load(q,s):
 q.evaluate("s=>sessionStorage.setItem('_qa_next_save',JSON.stringify(s))",s);q.reload(wait_until='domcontentloaded')
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage']);q=b.new_page(viewport={'width':1440,'height':1100},ignore_https_errors=True);q.set_default_timeout(25000);q.on('pageerror',lambda e:report['errors'].append(str(e)))
 q.add_init_script("const s=sessionStorage.getItem('_qa_next_save');if(s){localStorage.setItem('lck-manager-save-v1',s);sessionStorage.removeItem('_qa_next_save');}")
 q.goto(report['url']);q.locator('[data-action=new-game]').click();nav(q,'champions')
 with q.expect_download() as download:q.locator('a[download][href*=champion-combat-analysis]').click()
 csv=Path(download.value.path()).read_text(encoding='utf-8-sig');assert len(csv.splitlines())==174 and 'Kayle,케일' in csv and 'LeeSin,리 신' in csv
 report['checks'].append('all 173 champion analyses export with Korean names, ratings, notes and official source URLs')
 q.locator('#codex-search').fill('케일');q.locator('[data-action=champion][data-id=Kayle]').click()
 card=q.locator('.champion-combat-profile');assert '후반 성장' in card.inner_text();assert '4 / 0 / 2' in card.inner_text() and '0 / 4 / 1' in card.inner_text();assert card.locator('.champion-phase-grid>div').count()==5;assert '1.0' in card.locator('.champion-phase-grid strong').first.inner_text();assert '5.0' in card.locator('.champion-phase-grid strong').last.inner_text()
 q.screenshot(path=str(ROOT/'2026-champion-combat-profile.png'),full_page=True);q.locator('.modal .close').click();q.locator('#codex-search').fill('리 신');q.locator('[data-action=champion][data-id=LeeSin]').click();assert '초반 강세' in card.inner_text();assert '5.0' in card.locator('.champion-phase-grid strong').first.inner_text();assert '2.5' in card.locator('.champion-phase-grid strong').last.inner_text();q.locator('.modal .close').click();report['checks'].append('Kayle and Lee Sin have different five-stage curves, context ratings and champion-specific KDA explanations')
 fixture=q.evaluate("""async()=>{const E=await import('./engine.js'),s=E.newGame('T1',42),m={id:'2026-champion-combat-qa',phase:'CUP_FINAL',competition:'CUP',bestOf:1,date:s.date,teams:['T1','GEN'],sets:[],score:[0,0],status:'scheduled'};s.matches.push(m);const d=E.newDraft(s,m,'both:blue:first'),chosen={blue:['Renekton','LeeSin','Leblanc','Draven','Pyke'],red:['Kayle','Kindred','Kassadin','Jinx','Sona']};while(E.draftTurn(d)){const t=E.draftTurn(d),id=t.kind==='pick'?chosen[t.side].find(id=>!d.picks[t.side].some(p=>p.champion===id)):E.legalChampions(s,d).find(c=>!Object.values(chosen).flat().includes(c.id)).id;E.draftAction(s,d,id);}E.prepareAssignments(s,d);E.autoAssignDraft(s,d);for(const side of ['blue','red'])chosen[side].forEach((id,i)=>E.assignChampion(d,side,id,E.ROLES[i]));d.assignment.paused=true;s.activeDraft=d;return s;}""")
 load(q,fixture);q.locator('.composition-report').wait_for();assert q.locator('.combat-scenarios article').count()==4;txt=q.locator('.combat-scenarios').inner_text();assert '초반 상체 3:3' in txt and '후반 상체 3:3' in txt and '극후반 5:5 한타' in txt;before=q.locator('.composition-report').inner_text();q.reload();q.locator('.composition-report').wait_for();assert q.locator('.composition-report').inner_text()==before
 q.locator('.combat-scenarios').scroll_into_view_if_needed();q.screenshot(path=str(ROOT/'2026-combat-context.png'),full_page=True);report['checks'].append('assigned draft shows four participant/time-specific chances and survives reload')
 match=q.evaluate("""async()=>{const E=await import('./engine.js'),s=JSON.parse(localStorage.getItem('lck-manager-save-v1')),m=s.matches[0];E.confirmDraftAssignments(s.activeDraft);E.resolveDraft(s,m,s.activeDraft);s.activeDraft=null;s.viewing={matchId:m.id,setIndex:0};const set=m.sets[0],index=set.events.findIndex(e=>e.championFormImpact);if(index<0)throw Error('No individual KDA impact');return{s,index,event:set.events[index]};}""")
 load(q,match['s']);q.locator('.vct-shell').wait_for();nav(q,'history');q.locator('[data-action=match-record][data-id="2026-champion-combat-qa"]').click();q.locator('.rift-svg').wait_for();q.locator('[data-action=viewer-speed][data-speed="8"]').click();q.locator(f'[data-action=viewer-scene][data-index="{match["index"]}"]').click();q.wait_for_function("document.querySelector('#live-battle-context')?.textContent.includes('성장·교전 특성 반영')")
 _,id,k,d,a,_=match['event']['championFormImpact'];live=q.locator('#live-battle-context').inner_text();assert f'{k}/{d}/{a}' in live
 assert '강점' in live or '가치 유지' in live or '위협 감소' in live;q.screenshot(path=str(ROOT/'2026-personal-impact.png'),full_page=True);report['checks'].append('live fight displays current timing, participants and the recorded pre-fight champion KDA impact')
 q.set_viewport_size({'width':390,'height':844});nav(q,'champions');q.locator('#codex-search').fill('노틸러스');q.locator('[data-action=champion][data-id=Nautilus]').click();assert 'CC·지원 가치 유지' in card.inner_text();assert q.evaluate('document.documentElement.scrollWidth<=innerWidth');report['checks'].append('390px mobile champion analysis is readable without page overflow; utility survives poor KDA')
 assert not report['errors'],report['errors'];Path(os.environ.get('LCK_TEST_REPORT',str(ROOT/'champion-combat-browser-results.json'))).write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False));b.close()
