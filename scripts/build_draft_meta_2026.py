"""Tournament/patch reference data. Presentation only; never an AI prior."""
import argparse,collections,csv,hashlib,json,re
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://raw.githubusercontent.com/feliperegesde/lol-analytics-2026/337240bbfe1728f154d2cafffd1e6d07ee4242f2/backend/2026_LoL_esports_match_data_from_OraclesElixir.csv'
EXPECTED='cf499d20eb3f84667b487fc1e28c5c73d47b3f535f155f8f5156eac7610b29f4'
ROLES={'top':'TOP','jng':'JGL','mid':'MID','bot':'BOT','sup':'SUP'}
LABELS={'LCK_CUP':'LCK CUP','LCK_REG12':'LCK 정규 1·2R','LCK_ROAD':'Road to MSI','LCK_REG34':'LCK 정규 3·4R','LCK_PLAYOFFS':'LCK 플레이인·플레이오프','FST':'First Stand','MSI':'MSI','WORLDS':'월즈'}
norm=lambda s:re.sub('[^a-z0-9]','',s.lower())
def event(r):
 if r['league']=='LCK':
  if r['split']=='Cup':return 'LCK_CUP'
  if r['split']=='Rounds 1-2':return 'LCK_ROAD' if r['playoffs']=='1' else 'LCK_REG12'
  if r['split']=='Rounds 3-4':return 'LCK_PLAYOFFS' if r['playoffs']=='1' else 'LCK_REG34'
 if r['league'] in ['FST','MSI']:return r['league']
 if r['league']=='WLDs' and r['date']>='2026-10-15':return 'WORLDS'
 return None
def build(path):
 raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest()
 if digest!=EXPECTED:raise ValueError('Source hash differs from the pinned reviewed CSV')
 names=json.loads((ROOT/'research/mastery-champion-names.json').read_text());aliases={norm(v):c['id'] for c in names for v in [c['id'],c['nameEn']]}
 games=collections.defaultdict(list)
 for r in csv.DictReader(raw.decode('utf-8-sig').splitlines()):
  if event(r):games[r['gameid']].append(r)
 valid=[];rejected=[]
 for gid,rows in games.items():
  players=[r for r in rows if r['position'] in ROLES];teams=[r for r in rows if r['position']=='team'];r=rows[0]
  if len(players)!=10 or len(teams)!=2 or len({(p['side'],p['position']) for p in players})!=10 or any(p['datacompleteness']!='complete' for p in rows):rejected.append(gid);continue
  picks=[(aliases.get(norm(p['champion'])),ROLES[p['position']],int(float(p['result']))) for p in players]
  bans={aliases.get(norm(t.get('ban'+str(i),''))) for t in teams for i in range(1,6)}-{None}
  if any(c is None for c,_,_ in picks) or len({c for c,_,_ in picks})!=10 or bans&{c for c,_,_ in picks}:rejected.append(gid);continue
  major,minor=r['patch'].split('.')[:2];patch=f'{int(major)}.{int(minor)}.1'
  valid.append({'event':event(r),'patch':patch,'date':r['date'],'first':r['game']=='1','picks':picks,'bans':bans})
 grouped=collections.defaultdict(list)
 for g in valid:grouped[(g['event'],g['patch'])].append(g)
 reports=[]
 for (eid,patch),gs in sorted(grouped.items()):
  stats=collections.defaultdict(lambda:{'picks':0,'bans':0,'wins':0,'roles':collections.defaultdict(lambda:{'picks':0,'wins':0}),'openingPicks':0,'openingBans':0})
  for g in gs:
   for cid,role,won in g['picks']:
    c=stats[cid];c['picks']+=1;c['wins']+=won;c['roles'][role]['picks']+=1;c['roles'][role]['wins']+=won
    if g['first']:c['openingPicks']+=1
   for cid in g['bans']:
    stats[cid]['bans']+=1
    if g['first']:stats[cid]['openingBans']+=1
  reports.append({'event':eid,'label':LABELS[eid],'patch':patch,'games':len(gs),'openingGames':sum(g['first'] for g in gs),'firstDate':min(g['date'] for g in gs),'lastDate':max(g['date'] for g in gs),'partial':eid=='WORLDS','champions':[{'id':cid,**c} for cid,c in sorted(stats.items())]})
 payload={'year':2026,'source':SOURCE,'sourceHash':digest,'observedThrough':'2026-10-18','method':'Retrospective tournament/patch records. OP priority uses game-1 pick+ban presence; role exposure uses all sets. Does not enter AI recommendations or match simulation.','reports':reports}
 out=ROOT/'dist/data/season-2026/draft-meta.json';out.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n')
 evidence={'checkedOn':'2026-11-25','source':SOURCE,'upstream':'https://oracleselixir.com/tools/downloads','sourceBytes':len(raw),'sha256':digest,'upstreamCheck':'Downloads page returned403; S3 annual URL returned404. Used the previously reviewed hash-pinned public mirror.','validGames':len(valid),'rejectedGames':rejected,'reports':[dict((k,r[k]) for k in ['event','patch','games','openingGames','firstDate','lastDate','partial']) for r in reports],'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest()}
 (ROOT/'research/2026/draft-meta-sources.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'validGames':len(valid),'reports':len(reports),'bytes':out.stat().st_size,'rejected':len(rejected),'events':sorted({r['event'] for r in reports})}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('csv',type=Path);build(p.parse_args().csv)
