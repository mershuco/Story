"""Build isolated2026 roster, mastery and dated professional-meta reference data.

Roster identities are observed; ratings, salaries and mastery scores are game
parameters.2026results never enter opening player ratings/mastery.
"""
import argparse,collections,csv,hashlib,json,math,re
from datetime import datetime,timedelta
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'dist/data/season-2026';RESEARCH=ROOT/'research/2026'
ROLES={'top':'TOP','jng':'JGL','mid':'MID','bot':'BOT','sup':'SUP'}
ASOF=datetime(2026,1,8)
N=lambda s:re.sub('[^a-z0-9]','',s.lower())
ROSTER_SOURCES=['https://www.sheepesports.com/en/articles/all-lck-cup-2026-rosters/en','https://esportsinsider.com/2025/11/every-confirmed-lck-roster-2026-league-of-legends','https://www.osen.co.kr/article/G1112728387']
TEAM_NAMES={
 'T1':('T1','T1'),'GEN':('Gen.G','GEN'),'DK':('Dplus KIA','DK'),'DRX':('Kiwoom DRX','KRX'),'KT':('KT Rolster','KT'),
 'KDF':('DN SOOPers','DNS'),'LSB':('BNK FEARX','BFX'),'NS':('Nongshim RedForce','NS'),'BRO':('HANJIN BRION','BRO'),'HLE':('Hanwha Life Esports','HLE')}
TEAM_MATCH={
 'T1':'T1','T1 Esports Academy':'T1','Gen.G':'GEN','Gen.G Global Academy':'GEN','Dplus Kia':'DK','Dplus Kia Challengers':'DK',
 'Kiwoom DRX':'DRX','Kiwoom DRX Challengers':'DRX','KT Rolster':'KT','KT Rolster Challengers':'KT','DN SOOPers':'KDF','DN SOOPers Challengers':'KDF',
 'BNK FEARX':'LSB','BNK FEARX Youth':'LSB','Nongshim RedForce':'NS','Nongshim Esports Academy':'NS','HANJIN BRION':'BRO','HANJIN BRION Challengers':'BRO',
 'Hanwha Life Esports':'HLE','Hanwha Life Esports Challengers':'HLE'}
RESERVES=[('Ghost','SUP','KT'),('Peter','SUP','KDF'),('Vincenzo','JGL','DRX'),('Fisher','MID','BRO'),('Daystar','MID','LSB'),('Calix','MID','NS')]
# Export IDs changed across source snapshots for these same people. Taeyoon's
# unrelated Hanwha academy homonym has a different ID and remains excluded.
LEGACY_IDS={'doran':['oe:player:a1f3b2bb3f36e5113237f92d76dc4c8'],
            'taeyoon':['oe:player:952237fce714ed1eca8ded17523bee9'],
            'mihawk':['oe:player:14f5ba672bc5fd0b3f28a6b0eb3043b'],
            'calix':['oe:player:c9441d0e78cf438ef0b372dc74010e3']}
PLAYER_ALIASES={'hanssamd':'samd','sanghyeon':'kabbie','bonnie':'pangsu','hype':'kingkong','kice':'rebel','dispel':'blessing'}
FOREIGN=[('BLG','Bilibili Gaming','LPL'),('AL',"Anyone's Legend",'LPL'),('TES','Top Esports','LPL'),('JDG','JD Gaming','LPL'),
 ('G2','G2 Esports','LEC'),('MKOI','Movistar KOI','LEC'),('FNC','Fnatic','LEC'),('KC','Karmine Corp','LEC'),
 ('FLY','FlyQuest','LCS'),('TL','Team Liquid','LCS'),('C9','Cloud9','LCS'),('LYON','LYON','LCS'),('PNG','paiN Gaming','CBLOL'),('FUR','FURIA','CBLOL'),('LOS','LØS','CBLOL'),
 ('CFO','CTBC Flying Oyster','LCP'),('TSW','Team Secret Whales','LCP'),('GAM','GAM Esports','LCP'),('DCG','Deep Cross Gaming','LCP')]
MAJOR={'LCK','LPL','LEC','LCS','LTA N','LTA S','LTA','LCP','CBLOL','MSI','WLDs','FST','EWC','KeSPA','KeSPA Cup','DCup'}

def dump(path,x):path.parent.mkdir(parents=True,exist_ok=True);path.write_text(json.dumps(x,ensure_ascii=False,separators=(',',':')))
def patch(s):
 try:a,b=s.split('.')[:2];return f'{int(a)}.{int(b)}.1'
 except:return 'unknown'
def fresh():return {'games':0,'wins':0,'lastPlayed':None,'roleGames':collections.Counter(),'leagues':collections.Counter(),'kills':0,'deaths':0,'assists':0}

def mastery_score(games, wins, player_games, days_since_played):
 return round(max(50,min(96,50+min(34,9*math.log2(1+games))+min(7,24*games/player_games)
                      +8*((wins+5)/(games+10)-.5)-min(6,max(0,days_since_played-90)/60))))

def main():
 ap=argparse.ArgumentParser();ap.add_argument('--input-dir',type=Path,required=True);args=ap.parse_args();OUT.mkdir(parents=True,exist_ok=True);RESEARCH.mkdir(parents=True,exist_ok=True)
 champion_names=json.loads((ROOT/'research/mastery-champion-names.json').read_text());names={N(v):c['id'] for c in champion_names for v in [c['id'],c['nameEn']]};ko={c['id']:c['nameKo'] for c in champion_names}
 first={};all26=[];raw_meta={};game_records=[];unknown=collections.Counter()
 foreign_by_name={name:(tid,league) for tid,name,league in FOREIGN}
 for year in [2025,2026]:
  path=args.input_dir/f'{year}_LoL_esports_match_data_from_OraclesElixir.csv';dates=[];count=0;games=collections.defaultdict(lambda:{'players':[],'bans':[],'teamCount':0})
  with path.open(encoding='utf-8-sig',newline='') as handle:
   for r in csv.DictReader(handle):
    date=r['date'];count+=1;dates.append(date)
    if date>='2026-11-24':continue
    if year==2026 and r['position'] in ROLES:
     # Identity and opening lineup evidence only; later performance stays separate.
     if r['league'] in ['LCK','LCKC'] or r['teamname'] in foreign_by_name:
      all26.append({k:r[k] for k in ['date','gameid','playerid','playername','teamname','league','position','champion','result']})
     if (r['league'] in ['LCK','LCKC'] and r['teamname'] in TEAM_MATCH) or (r['teamname'] in foreign_by_name and r['league']==foreign_by_name[r['teamname']][1]):
      key=(r['league'],r['teamname']);old=first.get(key)
      if old is None or date<old['date']:first[key]={'date':date,'gameId':r['gameid'],'players':[]}
      if date==first[key]['date']:first[key]['players'].append(r)
    if r['league'] in MAJOR:
     g=games[(r['gameid'],date)];g.update({'date':date,'patch':patch(r['patch']),'league':r['league'],'split':r['split'],'game':r['game']})
     if r['position']=='team':
      g['teamCount']+=1
      for i in range(1,6):
       v=r.get(f'ban{i}','');c=names.get(N(v))
       if c:g['bans'].append(c)
       elif v and v.lower() not in ['none','nan']:unknown[v]+=1
     elif r['position'] in ROLES:
      c=names.get(N(r['champion']))
      if c:g['players'].append((c,int(float(r['result'])),ROLES[r['position']]))
      else:unknown[r['champion']]+=1
  valid=[g for g in games.values() if len(g['players'])==10 and g['teamCount']==2]
  game_records.extend(valid)
  raw_meta[year]={'rows':count,'dateMin':min(dates),'dateMax':max(dates),'bytes':path.stat().st_size,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'selectedMajorValidGames':len(valid)}
 assert not unknown,unknown
 roster=[];starters={};clstarters={}
 for (league,tname),f in first.items():
  if league not in ['LCK','LCKC']:continue
  tid=TEAM_MATCH[tname];assert len(f['players'])==5,(league,tname,len(f['players']))
  target=starters if league=='LCK' else clstarters;target[tid]={}
  for r in f['players']:
   pid=N(r['playername']);role=ROLES[r['position']];target[tid][role]=pid
   roster.append({'id':pid,'name':r['playername'],'position':role,'team':tid,'draftTeam':tid,'draftLeague':'LCK' if league=='LCK' else 'CL','starter':league=='LCK','clStarter':league=='LCKC','oePlayerIds':[r['playerid']],'rosterSource':'first_observed_2026_game','sourceDate':f['date'],'sourceGameId':f['gameId'],'sourceUrls':ROSTER_SOURCES if league=='LCK' else [],'unknown':False})
 assert len(starters)==10 and len(clstarters)==10
 byid={p['id']:p for p in roster}
 for name,role,tid in RESERVES:
  pid=N(name)
  if pid not in byid:
   p={'id':pid,'name':name,'position':role,'team':tid,'draftTeam':tid,'draftLeague':'LCK','starter':False,'clStarter':False,'oePlayerIds':sorted({r['playerid'] for r in all26 if N(r['playername'])==pid and r['playerid']}),'rosterSource':'published_opening_roster_reserve','sourceDate':'2026-01-07','sourceUrls':ROSTER_SOURCES[:2],'unknown':False};roster.append(p);byid[pid]=p
 foreign_teams=[];foreign_players=[]
 for tid,name,league in FOREIGN:
  f=first.get((league,name))
  if not f or len(f['players'])!=5:continue
  ps=[]
  for r in f['players']:
   pid=N(r['playername']);role=ROLES[r['position']]
   p={'id':pid,'name':r['playername'],'position':role,'team':tid,'draftTeam':tid,'draftLeague':league,'starter':True,'foreign':True,'oePlayerIds':[r['playerid']],'rosterSource':'first_observed_2026_game','sourceDate':f['date'],'sourceGameId':f['gameId'],'unknown':False};ps.append(p);foreign_players.append(p)
  foreign_teams.append({'id':tid,'name':name,'abbr':tid,'region':league,'actual2026League':league,'color':'#8fa4bd','players':ps,'sourceDate':f['date'],'sourceGameId':f['gameId']})
 allplayers=roster+foreign_players
 assert len({p['id'] for p in allplayers})==len(allplayers),'Selected rosters contain duplicate player identities'
 pmap={p['id']:p for p in allplayers};knownids=collections.defaultdict(set)
 for p in allplayers:knownids[p['id']].update(p['oePlayerIds'])
 for pid,ids in LEGACY_IDS.items():knownids[pid].update(ids)
 # Only identity mapping may use2026 observations; 2025 performance is still isolated.
 exposure={2025:collections.defaultdict(lambda:collections.defaultdict(fresh)),2026:collections.defaultdict(lambda:collections.defaultdict(fresh))};totals=collections.defaultdict(fresh);rejected=collections.Counter()
 for year in [2025,2026]:
  with (args.input_dir/f'{year}_LoL_esports_match_data_from_OraclesElixir.csv').open(encoding='utf-8-sig',newline='') as handle:
   for r in csv.DictReader(handle):
    if r['position'] not in ROLES:continue
    pid=N(r['playername']);pid=PLAYER_ALIASES.get(pid,pid) if pid not in pmap else pid
    if pid not in pmap:continue
    if knownids[pid] and r['playerid'] not in knownids[pid]:rejected[(pid,r['playername'],r['teamname'])]+=1;continue
    if not knownids[pid] and r['league'] not in ['LCK','LCKC','LCK CL','KeSPA','KeSPA Cup','LAS']:continue
    c=names.get(N(r['champion']))
    if not c:continue
    e=exposure[year][pid][c];e['games']+=1;e['wins']+=int(float(r['result']));e['lastPlayed']=max(e['lastPlayed'] or r['date'],r['date']);e['roleGames'][ROLES[r['position']]]+=1;e['leagues'][r['league']]+=1
    for stat in ['kills','deaths','assists']:e[stat]+=float(r.get(stat) or 0)
    if year==2025:
     assert r['date']<'2026-01-01';t=totals[pid];t['games']+=1;t['wins']+=int(float(r['result']));t['leagues'][r['league']]+=1;t['roleGames'][ROLES[r['position']]]+=1
     for stat in ['kills','deaths','assists']:t[stat]+=float(r.get(stat) or 0)
 for p in allplayers:
  t=totals[p['id']];g=t['games'];major=sum(v for k,v in t['leagues'].items() if k in MAJOR);kda=(t['kills']+t['assists'])/max(1,t['deaths']);win=(t['wins']+10)/(g+20)
  base=72 if major>=10 else 66 if g>=10 else 68
  ovr=round(max(65,min(96,base+min(12,1.5*math.log2(1+g))+10*(win-.5)+max(-1.5,min(2,(kda-3)*.6)))))
  p.update({'ovr':ovr,'potential':min(99,ovr+(9 if p['draftLeague']=='CL' else 5)),'salary':round(max(.5,(ovr-65)*.25),1),'historicalContractEnd':None,'sourceStatus':'roster_observed_2026_rating_simulated_2025_evidence','ratingEvidence':{'year':2025,'games':g,'majorGames':major,'wins':t['wins'],'roleGames':dict(t['roleGames']),'confidence':'unknown' if not g else 'low' if g<15 else 'observed_unadjusted'},'contractSource':'game_estimate_not_verified_real_contract'})
 for ft in foreign_teams:ft['rating']=round(sum(p['ovr'] for p in ft['players'])/5)
 base_teams=json.loads((ROOT/'dist/data/teams.json').read_text());teams=[]
 for t in base_teams:
  t=dict(t);name,abbr=TEAM_NAMES[t['id']];t.update({'name':name,'abbr':abbr,'short':abbr,'season':2026,'legacyId':t['id'],'startingLineup':starters[t['id']],'clStartingLineup':clstarters[t['id']],'rating':round(sum(byid[x]['ovr'] for x in starters[t['id']].values())/5),'economySource':'simulation_estimate','rosterAsOf':'2026-opening','brandingAsOf':'2026-11-23'});teams.append(t)
 mastery_players={}
 for p in allplayers:
  pid=p['id'];t=totals[pid];total=t['games'];entries={}
  for c in champion_names:
   e=exposure[2025][pid].get(c['id'])
   if e:
    g=e['games'];days=(ASOF-datetime.fromisoformat(e['lastPlayed'])).days;score=mastery_score(g,e['wins'],total,days)
    entries[c['id']]={'score':score,'games':g,'wins':e['wins'],'confidence':'high_exposure' if g>=15 else 'medium_exposure' if g>=5 else 'low_sample','source':'oe_2025_observed_simulation','lastPlayed':e['lastPlayed'],'roleGames':dict(e['roleGames'])}
   else:entries[c['id']]={'score':48,'games':0,'wins':0,'confidence':'unknown','source':'estimated_unobserved','lastPlayed':None,'roleGames':{}}
  mastery_players[pid]={'name':p['name'],'position':p['position'],'team':p['team'],'observed2025Games':total,'observed2025Champions':len(exposure[2025][pid]),'champions':entries,'retrospective2026':{c:{k:dict(v) if isinstance(v,collections.Counter) else v for k,v in e.items()} for c,e in exposure[2026][pid].items()}}
 snapshots=[];cut=ASOF;last_date=datetime.fromisoformat(raw_meta[2026]['dateMax'])
 while cut<=last_date+timedelta(days=7):
  start=cut-timedelta(days=56);selected=[g for g in game_records if start<=datetime.fromisoformat(g['date'])<cut and g['game']=='1'];count=len(selected);stats=collections.defaultdict(lambda:[0,0,0,collections.Counter()])
  for g in selected:
   for c,w,r in g['players']:stats[c][0]+=1;stats[c][2]+=w;stats[c][3][r]+=1
   for c in set(g['bans']):stats[c][1]+=1
  cs=[]
  for cid,(picks,bans,wins,roles) in stats.items():
   presence=(picks+bans)/count;assert 0<=presence<=1
   cs.append({'id':cid,'nameKo':ko[cid],'picks':picks,'bans':bans,'wins':wins,'presence':round(presence,4),'roles':dict(roles),'priorityPrior':'insufficient_sample' if count<30 else 'S' if presence>=.7 else 'A' if presence>=.4 else 'B' if presence>=.15 else 'C'})
  cs.sort(key=lambda x:x['presence'],reverse=True)
  snapshots.append({'asOfExclusive':cut.isoformat(),'windowStartInclusive':start.isoformat(),'games':count,'view':'game1','firstDate':min((g['date'] for g in selected),default=None),'latestUsedGame':max((g['date'] for g in selected),default=None),'champions':cs})
  cut+=timedelta(days=7)
 # Full-patch research aggregates are intentionally separate from runtime as-of priors.
 patches=collections.defaultdict(list)
 for g in game_records:
  if g['date'].startswith('2026') and g['game']=='1':patches[(g['league'],g['patch'])].append(g)
 reports=[]
 for (league,pv),gs in sorted(patches.items()):
  stats=collections.defaultdict(lambda:[0,0,0])
  for g in gs:
   for c,w,r in g['players']:stats[c][0]+=1;stats[c][2]+=w
   for c in set(g['bans']):stats[c][1]+=1
  reports.append({'league':league,'patch':pv,'games':len(gs),'firstDate':min(g['date'] for g in gs),'lastDate':max(g['date'] for g in gs),'champions':sorted([{'id':c,'nameKo':ko[c],'picks':v[0],'bans':v[1],'wins':v[2],'presence':round((v[0]+v[1])/len(gs),4)} for c,v in stats.items()],key=lambda x:x['presence'],reverse=True)})
 coverage={'domesticPlayers':len(roster),'openingStarters':50,'clOpeningStarters':50,'publishedReserves':len(RESERVES),'foreignPlayers':len(foreign_players),'foreignTeams':len(foreign_teams),'foreignPreseasonMasteryCovered':sum(bool(totals[x['id']]['games']) for x in foreign_players),'foreignPreseasonMasteryUnknown':[x['name'] for x in foreign_players if not totals[x['id']]['games']],'champions':len(champion_names),'preseasonMasteryCovered':sum(bool(totals[p['id']]['games']) for p in roster),'preseasonMasteryUnknown':[p['name'] for p in roster if not totals[p['id']]['games']],'weeklySnapshots':len(snapshots),'matchDataLastObserved':raw_meta[2026]['dateMax'],'november2026MetaObserved':False,'rosterCutoff':'2026-opening; sources reviewed2026-11-23, not2027offseason'}
 dump(OUT/'players.json',roster);dump(OUT/'teams.json',teams);dump(OUT/'international.json',{'note':'2026 earliest observed foreign lineups in LPL/LEC/LCS/LCP/CBLOL. Regional qualification outside LCK uses simulated team strength within this selected pool. Ratings are simulated from2025exposure.','teams':foreign_teams})
 dump(OUT/'mastery.json',{'version':'2026-opening-v1','asOf':'2026-01-08','method':{'initialPerformanceYear':2025,'officialMastery':False,'unobservedScore':48,'labelKo':'2025 출전 기록 기반 게임용 숙련도 추정','futureInformation':'Opening ratings/mastery use2025performance only.2026rows resolve roster identity and are stored as retrospective evidence.','confidenceMeaning':'Exposure/sample volume, not certified skill.','limitation':'Not Riot account mastery; team strength/patch/league effects incompletely adjusted.'},'coverage':coverage,'players':mastery_players})
 dump(OUT/'meta.json',{'method':'WeeklyasOf priors from strictly earlier game1 records in a56daywindow;2025carryover included. Selected majorleagues plus KeSPA/DCup; observablepriority not causalpower. No November2026 or fullWorlds2026coverage claimed.','coverage':coverage,'snapshots':snapshots})
 dump(RESEARCH/'patch-meta-reports.json',{'note':'Retrospective whole-patch2026 game1 aggregates. Do not expose as opening AI knowledge.','reports':reports})
 dump(RESEARCH/'sources.json',{'rosterSources':ROSTER_SOURCES,'openingMatchSnapshots':{f'{lg}:{tn}':{'date':f['date'],'gameId':f['gameId'],'players':[r['playername'] for r in f['players']]} for (lg,tn),f in first.items()},'datasets':raw_meta,'legacyPlayerIdCrosswalk':LEGACY_IDS,'2026Mirror':'https://raw.githubusercontent.com/feliperegesde/lol-analytics-2026/337240bbfe1728f154d2cafffd1e6d07ee4242f2/backend/2026_LoL_esports_match_data_from_OraclesElixir.csv','coverage':coverage,'rejectedHomonyms':[{'player':p,'exportName':n,'team':t,'rows':v} for (p,n,t),v in rejected.items()],'ratingFormula':'base72if>=10major games,else66if>=10total,else68 +min(12,1.5log2(1+games))+10*(shrunkWinRate-.5)+clamp(-1.5,2,.6*(KDA-3));clamp65..96. Potential+5or+9CL;salarysimulated.','2025LCKFinalists':{'champion':'GEN','runnerUp':'HLE','date':'2025-09-28','score':'3-1'}})
 assert all(len(p['champions'])==len(champion_names) for p in mastery_players.values())
 assert all(e['lastPlayed'] is None or e['lastPlayed']<'2026-01-01' for p in mastery_players.values() for e in p['champions'].values())
 assert all(s['latestUsedGame'] is None or datetime.fromisoformat(s['latestUsedGame'])<datetime.fromisoformat(s['asOfExclusive']) for s in snapshots)
 print(json.dumps(coverage,ensure_ascii=False,indent=2))

if __name__=='__main__':main()
