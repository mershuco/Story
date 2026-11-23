"""Build auditable preseason-2022 simulation mastery from public match evidence.

No Riot account mastery is inferred or claimed. A historical alias/ID crosswalk
may use 2022 identity rows, but no 2022 performance enters initial game scores.
"""
import argparse
import collections
import csv
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
AS_OF = datetime(2022, 1, 1)
SOURCES = {
    2021: {'repo':'gregvoigts/bachelor-arbeit','commit':'03ddb19734e720f598fe10925279a5439dd1291f'},
    2022: {'repo':'stvngo/LoL-Statistical-Analysis','commit':'6522163c5ebf249a479d7a4066da29516676bf65'},
}
ALIASES = {
    'samd':['Hans SamD'], 'pangsu':['Bonnie'], 'kingkong':['Hype'],
    'rebel':['Kice'], 'blessing':['Dispel'], 'kabbie':['sanghyeon'],
}
ALIAS_SOURCES = {
    'samd':'https://liquipedia.net/leagueoflegends/SamD',
    'pangsu':'https://lol.fandom.com/wiki/Bonnie',
    'kingkong':'https://lol.fandom.com/wiki/Hype_(Byeon_Jeong-hyeon)',
    'rebel':'https://liquipedia.net/leagueoflegends/Kice',
    'blessing':'https://liquipedia.net/leagueoflegends/Dispel',
    'kabbie':'https://lol.fandom.com/wiki/Sanghyeon',
}
KOREAN_LEAGUES = {'LCK','LCK CL','LCKC','KeSPA','ASCI','LAS'}
ROLES = {'top':'TOP','jng':'JGL','mid':'MID','bot':'BOT','sup':'SUP'}

def norm(s):
    return re.sub('[^a-z0-9]', '', s.lower())

def dump(path, obj, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=2 if pretty else None,
                               separators=None if pretty else (',',':')))

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--input-dir', type=Path, default=ROOT/'research/raw')
    args = parser.parse_args()
    args.input_dir.mkdir(parents=True, exist_ok=True)
    roster = json.loads((ROOT/'research/mastery-roster-source.json').read_text())
    champions = json.loads((ROOT/'research/mastery-champion-names.json').read_text())
    lookup = {norm(v):norm(p['name']) for p in roster for v in [p['name'],*ALIASES.get(norm(p['name']),[])]}
    champion_names = {norm(v):c['id'] for c in champions for v in [c['id'],c['nameEn']]}
    known_ids = collections.defaultdict(set)
    rows_by_year = {}
    provenance = []
    for year, source in SOURCES.items():
        name = f'{year}_LoL_esports_match_data_from_OraclesElixir.csv'
        path = args.input_dir/name
        url = f"https://raw.githubusercontent.com/{source['repo']}/{source['commit']}/{name}"
        if not path.exists():
            with urllib.request.urlopen(url, timeout=60) as response, path.open('wb') as out:
                while chunk := response.read(1024*1024): out.write(chunk)
        dates = []
        all_games = set()
        league_rows = collections.Counter()
        matched = []
        row_count = 0
        with path.open(encoding='utf-8-sig', newline='') as f:
            for row in csv.DictReader(f):
                row_count += 1
                dates.append(row['date'])
                # Two 2021 games have blank IDs. Date+teams prevents collapsing them.
                all_games.add((row['gameid'],row['date']))
                league_rows[row['league']] += 1
                pid = lookup.get(norm(row['playername']))
                if not pid or row['position'] not in ROLES: continue
                matched.append((pid,row))
                if row['league'] in KOREAN_LEAGUES and row['playerid']:
                    known_ids[pid].add(row['playerid'])
        rows_by_year[year] = matched
        provenance.append({'year':year,**source,'url':url,'bytes':path.stat().st_size,
                           'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),
                           'rows':row_count,'observedGamesByIdAndDate':len(all_games),
                           'dateMin':min(dates),'dateMax':max(dates),'leagueRows':dict(league_rows),
                           'delivery':'Oracle’s Elixir data through a third-party public GitHub mirror; source completeness not independently certified'})
    evidence = {year:collections.defaultdict(lambda:collections.defaultdict(lambda:{'games':0,'wins':0,'lastPlayed':None,'roleGames':collections.Counter(),'leagues':collections.Counter()})) for year in SOURCES}
    accepted_rows = collections.Counter()
    rejected = collections.Counter()
    accepted_identities = collections.defaultdict(set)
    unknown_champions = collections.Counter()
    duplicate_rows = collections.Counter()
    for year, rows in rows_by_year.items():
        seen = set()
        for pid, row in rows:
            if row['playerid'] not in known_ids[pid]:
                rejected[(year,pid,row['playername'],row['teamname'],row['league'])] += 1
                continue
            date = datetime.fromisoformat(row['date'])
            if year == 2021:
                assert date < AS_OF, 'Future performance cannot enter initial mastery'
            c = champion_names.get(norm(row['champion']))
            if not c:
                unknown_champions[row['champion']] += 1
                continue
            key = (pid,row['gameid'],row['date'],row['position'])
            if key in seen:
                duplicate_rows[year] += 1
                continue
            seen.add(key)
            accepted_rows[year] += 1
            accepted_identities[pid].add((row['playername'],row['playerid']))
            e = evidence[year][pid][c]
            e['games'] += 1
            e['wins'] += int(float(row['result']))
            e['lastPlayed'] = max(e['lastPlayed'] or row['date'], row['date'])
            e['roleGames'][ROLES[row['position']]] += 1
            e['leagues'][row['league']] += 1
    assert not unknown_champions, unknown_champions
    players = {}
    csv_rows = []
    for player in roster:
        pid = norm(player['name'])
        records = evidence[2021][pid]
        total = sum(e['games'] for e in records.values())
        entries = {}
        for champion in champions:
            cid = champion['id']
            e = records.get(cid)
            if e:
                g, w = e['games'],e['wins']
                days_old = (AS_OF-datetime.fromisoformat(e['lastPlayed'])).days
                score = round(max(50,min(96,50 + min(34,9*math.log2(1+g)) + min(7,24*g/total)
                                        + 8*((w+5)/(g+10)-.5) - min(6,max(0,days_old-90)/60))))
                confidence = 'high_exposure' if g >= 15 else 'medium_exposure' if g >= 5 else 'low_sample'
                item = {'score':score,'games':g,'wins':w,'confidence':confidence,
                        'source':'oe_2021_observed_simulation','lastPlayed':e['lastPlayed'],
                        'roleGames':dict(e['roleGames'])}
            else:
                item = {'score':48,'games':0,'wins':0,'confidence':'unknown',
                        'source':'estimated_unobserved','lastPlayed':None,'roleGames':{}}
            entries[cid] = item
            retro = evidence[2022][pid].get(cid, {})
            csv_rows.append({'playerId':pid,'player':player['name'],'team':player['draftTeam'],
                             'league':player['draftLeague'],'position':player['position'],
                             'championId':cid,'championKo':champion['nameKo'],**item,
                             'roleGames':json.dumps(item['roleGames'],ensure_ascii=False),
                             'retrospective2022Games':retro.get('games',0),
                             'retrospective2022Wins':retro.get('wins',0),
                             'retrospective2022LastPlayed':retro.get('lastPlayed')})
        players[pid] = {'name':player['name'],'position':player['position'],'team':player['draftTeam'],
                        'league':player['draftLeague'],'observed2021Games':total,
                        'observed2021Champions':len(records),'champions':entries,
                        'retrospective2022':{c:{**e,'roleGames':dict(e['roleGames']),'leagues':dict(e['leagues'])} for c,e in evidence[2022][pid].items()}}
    coverage = {'players':len(players),'champions':len(champions),'playerChampionPairs':len(csv_rows),
                'playersWith2021Evidence':sum(bool(x['observed2021Games']) for x in players.values()),
                'playersWithout2021Evidence':[x['name'] for x in players.values() if not x['observed2021Games']],
                'observed2021Pairs':sum(x['observed2021Champions'] for x in players.values()),
                'estimatedPairs':sum(x['games']==0 for p in players.values() for x in p['champions'].values()),
                'playersWith2022Retrospective':sum(bool(x['retrospective2022']) for x in players.values()),
                'acceptedPlayerGameRows':dict(accepted_rows)}
    method = {'labelKo':'출전 기록 기반 게임용 숙련도 추정',
              'officialMastery':False,'riotAccountMastery':'Not queried: no verified account-to-player mapping or API access; professional exposure is not Riot account mastery',
              'initialPerformanceYear':2021,'asOfExclusive':'2022-01-01T00:00:00',
              'scoreFormula':'clamp(50,96,round(50+min(34,9*log2(1+games))+min(7,24*games/playerTotal)+8*((wins+5)/(games+10)-0.5)-min(6,max(0,daysSinceLastGame-90)/60)))',
              'unobservedScore':48,'unobservedMeaning':'Unknown evidence; simulated neutral baseline. Does not mean unskilled or unplayable.',
              'confidenceMeaning':'Exposure/sample volume only, not verified true proficiency. high>=15,medium>=5,low>=1,unknown=0.',
              'futureInformation':'2022 records are retrospective only; initial scores use2021performance.2022rows may contribute to identity resolution only.',
              'identityPolicy':'Normalize case/punctuation, validate documented aliases, bind to IDs observed in Korean leagues, then retain international/cross-region rows with those IDs. No Sword→Sw0rd or Asper→Kabbie merge.',
              'limitation':'2021-only evidence is not lifetime experience; missing2021players and unplayedchampions remain unknown. Competition level/team strength and patch effects are not fully adjusted; heuristic weights uncalibrated.',
              'availability':'173champion reference entries include future releases; game must filter by patch and tournament eligibility.'}
    result = {'version':'2022-preseason-mastery-v1','asOf':'2022-01-01','method':method,'coverage':coverage,'players':players}
    dump(ROOT/'dist/data/mastery.json', result)
    provenance_result = {'method':method,'coverage':coverage,'sources':provenance,
                         'aliases':{p:{'names':a,'source':ALIAS_SOURCES[p]} for p,a in ALIASES.items()},
                         'acceptedIdentities':{p:[{'name':a,'playerId':b} for a,b in sorted(v)] for p,v in accepted_identities.items()},
                         'rejectedHomonyms':[{'year':y,'playerId':p,'exportName':n,'team':t,'league':lg,'rows':v} for (y,p,n,t,lg),v in rejected.items()],
                         'duplicateRowsRemoved':dict(duplicate_rows)}
    dump(ROOT/'research/mastery-sources.json',provenance_result,True)
    with (ROOT/'research/mastery.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer = csv.DictWriter(f,fieldnames=list(csv_rows[0]));writer.writeheader();writer.writerows(csv_rows)
    lines = ['# 선수별 챔피언 숙련도 조사','',
             '**2022 개막 전 기준의 게임용 추정값**이다. Riot 계정 숙련도나 공식 선수 평가가 아니다. 2021 출전·승수·최근 사용을 바탕으로 산출했으며, 2022 성적은 회고용으로만 분리했다. 모든 117명×173종은 mastery.csv와 게임 데이터에 포함한다. 아래에는 읽기 쉽도록 관측 우선 챔피언을 요약한다.','',
             f"선수 {coverage['players']}명, 챔피언 {coverage['champions']}종, 조합 {coverage['playerChampionPairs']:,}개. 2021 출전 확인 {coverage['playersWith2021Evidence']}명, 근거 미확인 {len(coverage['playersWithout2021Evidence'])}명. 2022 회고 기록은 {coverage['playersWith2022Retrospective']}명 모두 매칭했다.",'',
             '## 산출과 미확인 처리','',
             '- 2021년 출전 횟수·개인 챔피언 점유율·수축 승률·마지막 출전일을 이용한 미보정 휴리스틱이다. 점수 범위는 관측 값 50~96이다.',
             '- 관측이 없는 조합은 48점으로 시작하고 `unknown / estimated_unobserved`를 붙인다. 못 다룬다는 뜻이 아니며 훈련·게임 경기로 달라질 수 있다.',
             '- 신뢰도는 실제 실력 정확도가 아니라 출전 표본량이다. 15경기 이상 높음, 5경기 이상 중간, 1~4경기 낮음이다.',
             '- 2021 기록 미확인 선수: '+', '.join(coverage['playersWithout2021Evidence'])+'. 이전 연도 경험이 없다는 뜻이 아니다.',
             '- 이름이 같은 다른 선수(DuDu, Prince, FATE, Castle)를 ID로 배제했다. Nuguri의 FPX, Zeka의 BLG, Aria의 DFM 등 같은 선수의 해외 기록은 유지했다.',
             '- SamD/Hans SamD, PangSu/Bonnie, KingKong/Hype, Rebel/Kice, Blessing/Dispel, Kabbie/sanghyeon은 인물 정보를 대조했다. Sw0rd와 북미 Sword, Kabbie와 Asper는 합치지 않았다.',
             '- 현 챔피언 173종을 모두 정리했지만, 2022 개막 게임은 당시 출시·대회 허용 챔피언만 선택해야 한다.',
             '- 원자료는 Oracle’s Elixir 공개 GitHub 미러다. 누락 경기·사설 연습·솔로랭크·스크림과 계정별 mastery는 포함하지 않는다. 소속은 Story 자료의 게임 출발 소속이며 2021 경기 소속과 다를 수 있다.','',
             '## 선수별 기록','']
    ch_ko = {c['id']:c['nameKo'] for c in champions}
    for player in roster:
        pid = norm(player['name']);p = players[pid]
        lines += [f"### {p['name']} · {p['team']} {p['league']} · {p['position']}",'',
                  f"2021 관측 {p['observed2021Games']}경기 / {p['observed2021Champions']}챔피언. 2022 회고 {sum(e['games'] for e in p['retrospective2022'].values())}경기. 전체173종 중 미관측 조합은 추정48점.",'']
        top = sorted(((cid,e) for cid,e in p['champions'].items() if e['games']),key=lambda z:(z[1]['score'],z[1]['games']),reverse=True)[:10]
        if top:
            lines += ['| 챔피언 | 게임용 숙련 | 출전 | 승 | 마지막 출전 | 표본 신뢰도 |','|---|---:|---:|---:|---|---|']
            for cid,e in top:lines.append(f"| {ch_ko[cid]} | {e['score']} | {e['games']} | {e['wins']} | {e['lastPlayed'][:10]} | {e['confidence']} |")
        else:lines += ['2021년 근거를 확인하지 못했다. 개막 숙련도는 전부 미확인 추정값이다.']
        retro = sorted(p['retrospective2022'].items(),key=lambda z:z[1]['games'],reverse=True)[:5]
        lines += ['', '**2022 회고 참고 — 초기 점수에 미사용:** '+', '.join(f"{ch_ko[cid]} {e['games']}전 {e['wins']}승" for cid,e in retro)+'.','']
    lines += ['## 재현과 출처','',
              '`python scripts/build_mastery.py --input-dir /absolute/path/to/csv-directory`로 재생성한다. 입력 파일이 없으면 고정 커밋의 공개 미러에서 다운로드한다. 출처·해시·별칭 검토 URL은 mastery-sources.json에 있다. 원시 CSV는 용량 때문에 게임 배포 데이터에 넣지 않는다.','']
    for source in provenance:lines += [f"- {source['year']}: {source['url']}"]
    (ROOT/'research/선수별_챔피언_숙련도.md').write_text('\n'.join(lines))
    assert len(players)==117 and len(champions)==173 and len(csv_rows)==20241
    assert all(len(p['champions'])==173 for p in players.values())
    assert all(e['lastPlayed'] is None or e['lastPlayed']<'2022-01-01' for p in players.values() for e in p['champions'].values())
    assert all(0<=e['wins']<=e['games'] and 0<=e['score']<=100 for p in players.values() for e in p['champions'].values())
    print(json.dumps(coverage,ensure_ascii=False,indent=2))

if __name__ == '__main__': main()
