"""Official Data Dragon 2026 roster/availability and all23 dated kit snapshots.
26.xx is the public patch label; Data Dragon's corresponding major version is16.
"""
import concurrent.futures as cf, json,re,urllib.request,hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'dist/data/season-2026';CACHE=ROOT/'research/2026/ddragon';OUT.mkdir(parents=True,exist_ok=True);CACHE.mkdir(parents=True,exist_ok=True)
def get(url,path):
 if not path.exists():
  with urllib.request.urlopen(url,timeout=30) as r:path.write_bytes(r.read())
 return json.loads(path.read_text())
versions=get('https://ddragon.leagueoflegends.com/api/versions.json',CACHE/'versions.json')
patches=[next(v for v in versions if v.startswith(f'16.{n}.')) for n in range(1,24)]
def summary(v):return v,get(f'https://ddragon.leagueoflegends.com/cdn/{v}/data/ko_KR/champion.json',CACHE/f'{v}-champion.json')['data']
with cf.ThreadPoolExecutor(max_workers=8) as ex:summaries=dict(ex.map(summary,patches))
base=json.loads((ROOT/'dist/data/champions.json').read_text());lookup={c['id']:c for c in base};snapshots=patches
def kit(task):
 v,cid=task;d=get(f'https://ddragon.leagueoflegends.com/cdn/{v}/data/ko_KR/champion/{cid}.json',CACHE/f'{v}-{cid}.json')['data'][cid]
 clean=lambda s:re.sub(r'\s+',' ',re.sub('<[^>]+>',' ',s)).strip()
 return v,cid,{'passive':{'name':d['passive']['name'],'description':clean(d['passive']['description'])},'spells':[{'slot':slot,'name':s['name'],'description':clean(s['description'])} for slot,s in zip('QWER',d['spells'])]}
tasks=[(v,cid) for v in snapshots for cid in summaries[v]];kits={}
with cf.ThreadPoolExecutor(max_workers=16) as ex:
 for v,cid,k in ex.map(kit,tasks):kits.setdefault(cid,{})[v]=k
rows=[]
for cid,c in summaries[patches[-1]].items():
 old=lookup.get(cid,{});rows.append({'id':cid,'key':int(c['key']),'name':c['name'],'title':c['title'],'classes':c['tags'],'roles':old.get('roles',['MID']),'features':old.get('features',dict(engage=0,protect=0,scale=0,ap=int('Mage' in c['tags']),tank=int('Tank' in c['tags']))),'available':{v:cid in summaries[v] for v in patches},'kits':kits[cid]})
(OUT/'champions.json').write_text(json.dumps(rows,ensure_ascii=False,separators=(',',':')))
(OUT/'patches.json').write_text(json.dumps([{'version':v,'label':f'26.{i+1:02d}','count':len(summaries[v]),'champions':list(summaries[v])} for i,v in enumerate(patches)],ensure_ascii=False))
season={'id':'season-2026','startYear':2026,'startDate':'2026-01-08','cupStart':'01-14','cupCaptains':['GEN','HLE'],'competitionFormat':2026,'masteryYear':2025,'evidenceThrough':'2026-10-18','patchDates':['01-08','01-22','02-04','02-19','03-04','03-18','04-01','04-15','04-29','05-13','05-28','06-10','06-24','07-15','07-29','08-12','08-26','09-10','09-23','10-07','10-21','11-04','11-18']}
season={**(json.loads((OUT/'season.json').read_text()) if (OUT/'season.json').exists() else {}),**season}
(OUT/'season.json').write_text(json.dumps(season,ensure_ascii=False,indent=2))
report={'source':'Riot Data Dragon','latest':patches[-1],'publicLabel':'26.23','patches':patches,'kitSnapshots':snapshots,'champions':len(rows),'roleHints':'Game role hints carried forward for search and coach advice only; no role restrictions.','patchScheduleSource':'https://support-leagueoflegends.riotgames.com/hc/en-us/articles/360018987893-Patch-Schedule-League-of-Legends','files':[{'file':p.name,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in sorted(CACHE.glob('*.json'))]}
(ROOT/'research/2026/champion-provenance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({k:report[k] for k in ['latest','kitSnapshots','champions']}))
