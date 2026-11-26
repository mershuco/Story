"""Tournament reference and complete observed LCK set evidence for draft advice."""
import argparse,collections,csv,gzip,hashlib,json,re
from datetime import datetime, timedelta
from pathlib import Path
from build_player_match_records import CHAINCC_URL, load_games, reconcile_worlds
ROOT=Path(__file__).resolve().parents[1]
SOURCE='https://raw.githubusercontent.com/feliperegesde/lol-analytics-2026/337240bbfe1728f154d2cafffd1e6d07ee4242f2/backend/2026_LoL_esports_match_data_from_OraclesElixir.csv'
EXPECTED='cf499d20eb3f84667b487fc1e28c5c73d47b3f535f155f8f5156eac7610b29f4'
WORLDS_SHA='088e529588434839b77d90f34bf2bb513c4e2879ba5e507947cf809aabd67fc5'
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
def add_worlds(valid, raw_csv, supplemental_path, aliases):
 digest=hashlib.sha256(supplemental_path.read_bytes()).hexdigest()
 if digest!=WORLDS_SHA:raise ValueError('Worlds supplement differs from the reviewed archive')
 original=load_games(row for row in csv.DictReader(raw_csv.splitlines()) if event(row)=='WORLDS')
 with gzip.open(supplemental_path,'rt',encoding='utf-8-sig',newline='') as handle:
  worlds=load_games((row for row in csv.DictReader(handle) if row['league']=='WLDs'),supplement=True)
 overlap=reconcile_worlds(original,worlds,aliases)
 known={(game['id'],game['date']):game for game in valid if game['event']=='WORLDS'}
 series={}
 for (gid,date),rows in sorted(worlds.items(),key=lambda item:item[0][1]):
  teams=tuple(sorted({row['team'] for row in rows}))
  started=datetime.fromisoformat(date)
  previous,set_number=series.get(teams,(None,0))
  # Series can cross UTC midnight. Four hours separates rematches in this archive.
  set_number=set_number+1 if previous and started-previous<timedelta(hours=4) else 1
  series[teams]=(started,set_number)
  if set_number>5:raise ValueError(f'Invalid Worlds series size: {gid}')
  if (gid,date) in overlap:
   if known[(gid,date)]['set']!=set_number:raise ValueError(f'Worlds set order mismatch: {gid}')
   continue
  lineups=[[[aliases[norm(row['champion'])],row['role'],row['name'],int(row['win'])]
           for row in rows if row['side']==side] for side in ['Blue','Red']]
  picks=[(cid,role,win) for lineup in lineups for cid,role,_,win in lineup]
  if len({cid for cid,_,_ in picks})!=10:raise ValueError(f'Invalid Worlds picks: {gid}')
  valid.append({'event':'WORLDS','patch':'16.20.1','date':date,'first':set_number==1,'picks':picks,
                'bans':None,'id':gid,'set':set_number,'lineups':lineups})
 return {'source':CHAINCC_URL,'license':'CC BY 4.0','sha256':digest,'sets':len(worlds),
         'setsWithBans':len(overlap),'additionalSets':len(worlds)-len(overlap)}

def build(path, supplemental_path):
 raw=path.read_bytes();digest=hashlib.sha256(raw).hexdigest()
 if digest!=EXPECTED:raise ValueError('Source hash differs from the pinned reviewed CSV')
 names=json.loads((ROOT/'research/mastery-champion-names.json').read_text());aliases={norm(v):c['id'] for c in names for v in [c['id'],c['nameEn']]}
 games=collections.defaultdict(list)
 raw_csv=raw.decode('utf-8-sig')
 for r in csv.DictReader(raw_csv.splitlines()):
  if event(r):games[r['gameid']].append(r)
 valid=[];rejected=[]
 for gid,rows in games.items():
  players=[r for r in rows if r['position'] in ROLES];teams=[r for r in rows if r['position']=='team'];r=rows[0]
  if len(players)!=10 or len(teams)!=2 or len({(p['side'],p['position']) for p in players})!=10 or any(p['datacompleteness']!='complete' for p in rows):rejected.append(gid);continue
  picks=[(aliases.get(norm(p['champion'])),ROLES[p['position']],int(float(p['result']))) for p in players]
  bans={aliases.get(norm(t.get('ban'+str(i),''))) for t in teams for i in range(1,6)}-{None}
  if any(c is None for c,_,_ in picks) or len({c for c,_,_ in picks})!=10 or bans&{c for c,_,_ in picks}:rejected.append(gid);continue
  major,minor=r['patch'].split('.')[:2];patch=f'{int(major)}.{int(minor)}.1'
  valid.append({'event':event(r),'patch':patch,'date':r['date'],'first':r['game']=='1','picks':picks,'bans':bans,'id':gid,'set':int(r['game']),'lineups':[[[aliases[norm(p['champion'])],ROLES[p['position']],p['playername'],int(float(p['result']))] for p in players if p['side']==side] for side in ['Blue','Red']]})
 worlds=add_worlds(valid,raw_csv,supplemental_path,aliases)
 grouped=collections.defaultdict(list)
 for g in valid:grouped[(g['event'],g['patch'])].append(g)
 reports=[]
 for (eid,patch),gs in sorted(grouped.items()):
  stats=collections.defaultdict(lambda:{'picks':0,'bans':0,'wins':0,'roles':collections.defaultdict(lambda:{'picks':0,'wins':0}),'openingPicks':0,'openingBans':0})
  for g in gs:
   for cid,role,won in g['picks']:
    c=stats[cid];c['picks']+=1;c['wins']+=won;c['roles'][role]['picks']+=1;c['roles'][role]['wins']+=won
    if g['first']:c['openingPicks']+=1
   for cid in g['bans'] or []:
    stats[cid]['bans']+=1
    if g['first']:stats[cid]['openingBans']+=1
  reports.append({'event':eid,'label':LABELS[eid],'patch':patch,'games':len(gs),'openingGames':sum(g['first'] for g in gs),'banGames':sum(g['bans'] is not None for g in gs),'firstDate':min(g['date'] for g in gs),'lastDate':max(g['date'] for g in gs),'champions':[{'id':cid,**c} for cid,c in sorted(stats.items())]})
 lck=[g for g in valid if g['event'].startswith('LCK_')];lck.sort(key=lambda g:(g['date'],g['id']))
 lck_evidence={'games':len(lck),'firstDate':min(g['date'] for g in lck),'lastDate':max(g['date'] for g in lck),'coverage':'All complete LCK sets in the pinned CSV; official season completeness has not been independently reconciled.'}
 records=[{k:(sorted(g[k]) if k=='bans' and g[k] is not None else g[k]) for k in ['id','event','patch','date','set','bans','lineups']} for g in sorted(valid,key=lambda g:(g['date'],g['id']))]
 payload={'records':records,'lck':lck_evidence,'worlds':worlds,'year':2026,'source':SOURCE,'sourceHash':digest,'observedThrough':records[-1]['date'][:10],'method':'Retrospective tournament/patch records for draft advice and AI. All recorded sets inform roles; OP pick/ban presence uses only opening sets with known bans.','reports':reports}
 out=ROOT/'dist/data/season-2026/draft-meta.json';out.write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':'))+'\n')
 evidence={'checkedOn':'2026-11-27','source':SOURCE,'worldsSupplement':worlds,'upstream':'https://oracleselixir.com/tools/downloads','sourceBytes':len(raw),'sha256':digest,'upstreamCheck':'Downloads page returned403; S3 annual URL returned404. Used the previously reviewed hash-pinned public mirror.','validGames':len(valid),'lckGames':len(lck),'lckFirstDate':lck_evidence['firstDate'],'lckLastDate':lck_evidence['lastDate'],'lckCoverage':lck_evidence['coverage'],'rejectedGames':rejected,'reports':[dict((k,r[k]) for k in ['event','patch','games','openingGames','banGames','firstDate','lastDate']) for r in reports],'outputSha256':hashlib.sha256(out.read_bytes()).hexdigest()}
 (ROOT/'research/2026/draft-meta-sources.json').write_text(json.dumps(evidence,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'validGames':len(valid),'reports':len(reports),'bytes':out.stat().st_size,'rejected':len(rejected),'events':sorted({r['event'] for r in reports})}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('csv',type=Path);p.add_argument('--worlds-csv',type=Path,required=True);args=p.parse_args();build(args.csv,args.worlds_csv)
