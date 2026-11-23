"""Reconstruct selected historical drafts from OE team pick-order fields.

Final role/player assignments come from player rows. They are not inferred as
information available at the instant a flexible champion was originally picked.
"""
import argparse
import collections
import csv
import hashlib
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
SELECTIONS=[
    {'id':'lck-2022-spring-final-g1','year':2022,'league':'LCK','split':'Spring','date':'2022-04-02','game':1,'title':'2022 LCK 스프링 결승 · GEN vs T1 · 1세트','fearless':False},
    {'id':'lck-2022-summer-final-g1','year':2022,'league':'LCK','split':'Summer','date':'2022-08-28','game':1,'title':'2022 LCK 서머 결승 · T1 vs GEN · 1세트','fearless':False},
    {'id':'worlds-2022-final-g5','year':2022,'league':'WLDs','split':'','date':'2022-11-06','game':5,'title':'2022 Worlds 결승 · T1 vs DRX · 5세트','fearless':False,'videoUrl':'https://www.youtube.com/watch?v=TzsCRtzIhDE'},
    {'id':'lck-2025-cup-final-g1','year':2025,'league':'LCK','split':'Cup','date':'2025-02-23','game':1,'title':'2025 LCK CUP 결승 · HLE vs GEN · 1세트','fearless':True},
]
ACTIONS=[('blue','ban',1),('red','ban',1),('blue','ban',2),('red','ban',2),('blue','ban',3),('red','ban',3),
         ('blue','pick',1),('red','pick',1),('red','pick',2),('blue','pick',2),('blue','pick',3),('red','pick',3),
         ('red','ban',4),('blue','ban',4),('red','ban',5),('blue','ban',5),
         ('red','pick',4),('blue','pick',4),('blue','pick',5),('red','pick',5)]
ROLES={'top':'TOP','jng':'JGL','mid':'MID','bot':'BOT','sup':'SUP'}
TEAM_IDS={'Gen.G':'GEN','T1':'T1','DRX':'DRX','Hanwha Life Esports':'HLE'}
norm=lambda s:re.sub('[^a-z0-9]','',s.lower())

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--input-dir',type=Path,required=True);args=ap.parse_args()
    champions=json.loads((ROOT/'research/mastery-champion-names.json').read_text())
    names={norm(v):c['id'] for c in champions for v in [c['id'],c['nameEn']]}
    ko={c['id']:c['nameKo'] for c in champions}
    pools=json.loads((ROOT/'research/draft-example-champion-pools.json').read_text())['patches']
    examples=[]
    for year in [2022,2025]:
        path=args.input_dir/f'{year}_LoL_esports_match_data_from_OraclesElixir.csv'
        grouped=collections.defaultdict(list)
        with path.open(encoding='utf-8-sig',newline='') as f:
            for r in csv.DictReader(f):
                for spec in SELECTIONS:
                    if spec['year']==year and r['league']==spec['league'] and r['split']==spec['split'] and r['date'].startswith(spec['date']) and r['game']==str(spec['game']):
                        grouped[spec['id']].append(r)
        provenance_path=args.input_dir/f'provenance-{year}.json'
        provenance=json.loads(provenance_path.read_text())
        assert hashlib.sha256(path.read_bytes()).hexdigest()==provenance['sha256']
        for spec in [s for s in SELECTIONS if s['year']==year]:
            rows=grouped[spec['id']];assert len(rows)==12,(spec['id'],len(rows))
            team_rows={r['side'].lower():r for r in rows if r['position']=='team'}
            players={side:[r for r in rows if r['side'].lower()==side and r['position'] in ROLES] for side in ['blue','red']}
            assignment={side:{names[norm(r['champion'])]:{'role':ROLES[r['position']],'player':r['playername'],'playerId':norm(r['playername']),'exportPlayerId':r['playerid']} for r in rs} for side,rs in players.items()}
            sides={}
            for side,tr in team_rows.items():
                picks=[names[norm(tr[f'pick{i}'])] for i in range(1,6)]
                bans=[names[norm(tr[f'ban{i}'])] for i in range(1,6)]
                assert set(picks)==set(assignment[side])
                sides[side]={'id':TEAM_IDS[tr['teamname']],'name':tr['teamname'],'bans':bans,'pickOrder':picks,
                             'lineup':[{'champion':cid,'nameKo':ko[cid],**assignment[side][cid]} for cid in picks]}
            actions=[]
            for step,(side,kind,order) in enumerate(ACTIONS):
                tr=team_rows[side];cid=names[norm(tr[f'{kind}{order}'])]
                info=assignment[side].get(cid) if kind=='pick' else None
                actions.append({'step':step,'side':side,'kind':kind,'team':sides[side]['id'],'champion':cid,'name':ko[cid],
                                'role':info['role'] if info else None,'player':info['player'] if info else None,
                                'playerId':info['playerId'] if info else None,'orderInSide':order,
                                'slotLabel':f"{'B' if side=='blue' else 'R'}{order}" if kind=='pick' else None})
            assert len(actions)==20 and len({a['champion'] for a in actions})==20
            assert sum(a['kind']=='pick' for a in actions)==10
            for side in ['blue','red']:
                assert sorted(a['role'] for a in actions if a['kind']=='pick' and a['side']==side)==sorted(ROLES.values())
            winner_side=next(side for side,tr in team_rows.items() if tr['result']=='1')
            patch=rows[0]['patch'];major,minor=patch.split('.')[:2]
            patch_version=f'{int(major)}.{int(minor)}.1'
            assert all(a['champion'] in pools[patch_version]['champions'] for a in actions)
            examples.append({'id':spec['id'],'title':spec['title'],'year':year,'league':spec['league'],'split':spec['split'],
                             'date':spec['date'],'dateRecorded':rows[0]['date'],'game':spec['game'],'patch':patch_version,
                             'sourcePatch':patch,'historicalRules':{'fearless':spec['fearless'],'usedBeforeSet':[],
                             'note':'2022 실제 기록은 일반 드래프트다. 이 시리즈의 이전 픽을 금지하면 역사 재생과 달라진다.' if not spec['fearless'] else '피어리스 1세트이므로 이전 세트 소진 목록이 비어 있다.'},
                             'seriesScoreBefore':{'blue':2,'red':2} if spec['game']==5 else {'blue':0,'red':0},
                             'blue':sides['blue'],'red':sides['red'],'actions':actions,
                             'result':{'winnerSide':winner_side,'winner':sides[winner_side]['id'],
                                       'durationSeconds':int(float(team_rows['blue']['gamelength'])),
                                       'kills':{side:int(float(tr['kills'])) for side,tr in team_rows.items()}},
                             'sources':{'owner':'Oracle’s Elixir','mirrorUrl':provenance['url'],'datasetSha256':provenance['sha256'],
                                        'gameId':rows[0]['gameid'],'pickOrderEvidence':'Team rows pick1..pick5; NOT player row order',
                                        'assignmentEvidence':'Player rows champion + position + playername; final assignment, not pick-time role certainty',
                                        'videoUrl':spec.get('videoUrl'),'championPoolUrl':f'https://ddragon.leagueoflegends.com/cdn/{patch_version}/data/en_US/champion.json'},
                             'validation':{'actions':20,'uniqueChampions':20,'picks':10,'bans':10,'completeFinalRoles':True,'availableInOfficialPatch':True}})
    ordered={e['id']:e for e in examples};examples=[ordered[s['id']] for s in SELECTIONS]
    out={'version':1,'method':'Historical examples reconstructed from recorded per-team ban/pick order; final role assignments joined separately from player rows. Research replay is distinct from simulated2025rules.','examples':examples}
    (ROOT/'dist/data/draft-examples.json').write_text(json.dumps(out,ensure_ascii=False,indent=2))
    print(json.dumps([{'id':e['id'],'teams':[e['blue']['id'],e['red']['id']],'patch':e['patch'],'actions':len(e['actions'])} for e in examples],ensure_ascii=False,indent=2))

if __name__=='__main__':main()
