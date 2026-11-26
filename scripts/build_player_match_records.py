"""Audit pro matches and build date-aware champion mastery adjustments."""

import argparse
import csv
import gzip
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

from build_season_2026 import LEGACY_IDS, N, OUT, PLAYER_ALIASES, RESEARCH, ROOT, ROLES, dump, mastery_score


ORACLE_URL = 'https://oracleselixir.com/tools/downloads'
CHAINCC_URL = 'https://chaincc.lol/free/data/'
WORLDS_FINAL = 'https://gol.gg/tournament/tournament-matchlist/Worlds%202026%20Main%20Event/'


def read_json(path):
    return json.loads(path.read_text())


def number(value):
    return int(float(value)) if value else None


def load_games(rows, *, supplement=False):
    games = defaultdict(list)
    game_field, team_field = ('game_id', 'team_name') if supplement else ('gameid', 'teamname')
    for row in rows:
        if row['position'] not in ROLES:
            continue
        result = row['result']
        if result not in ('0', '1', 'FALSE', 'TRUE'):
            raise ValueError(f"Missing game result for {row[game_field]}")
        key = row[game_field], row['date']
        games[key].append({
            'side': row['side'], 'role': ROLES[row['position']], 'league': row['league'],
            'team': row[team_field], 'name': row['playername'], 'playerId': row.get('playerid'),
            'champion': row['champion'], 'win': result in ('1', 'TRUE'),
            'kda': [number(row[key]) for key in ('kills', 'deaths', 'assists')],
            'quadra': number(row.get('quadrakills')), 'penta': number(row.get('pentakills')),
        })
    for key, rows in games.items():
        if (not key[0] or len(rows) != 10 or len({(r['side'], r['role']) for r in rows}) != 10
                or {r['side'] for r in rows} != {'Blue', 'Red'}
                or len({(r['side'], r['win']) for r in rows}) != 2
                or sum(r['win'] for r in rows) != 5
                or len({(r['side'], r['team']) for r in rows}) != 2):
            raise ValueError(f'Invalid game block: {key}')
    return games


def reconcile_worlds(original, supplement, champion_ids):
    def fingerprint(rows):
        return sorted((r['side'], r['role'], r['team'], N(r['name']),
                       champion_ids.get(N(r['champion']), N(r['champion'])), r['win'], r['kda'])
                      for r in rows)

    shared = {key for key, rows in original.items() if rows[0]['league'] == 'WLDs' and key[1] >= '2026-10-15'}
    if not shared <= supplement.keys() or len(supplement) != 98:
        raise ValueError('Worlds archive does not cover the expected 98 sets')
    for key in shared:
        if fingerprint(original[key]) != fingerprint(supplement[key]):
            raise ValueError(f'Worlds overlap mismatch: {key}')
    final = [rows for (_, date), rows in supplement.items() if date.startswith('2026-11-14')]
    wins = Counter(next(r['team'] for r in rows if r['win']) for rows in final)
    if wins != {'Bilibili Gaming': 3, 'Gen.G': 1}:
        raise ValueError(f'Worlds final does not reconcile: {wins}')
    return shared


def dated_scores(days, baseline):
    """Retain each opening estimate, then update it as recorded sets become available."""
    counts = {champion: [entry['games'], entry['wins'], 0] for champion, entry in baseline.items()}
    totals = sum(games for games, _, _ in counts.values())
    scores = {champion: entry['score'] for champion, entry in baseline.items()}
    changes = defaultdict(list)
    for day in sorted(days):
        picks = days[day]
        recent = day >= '2026-01-01'
        if recent:
            totals += sum(games for games, _, _ in picks.values())
        for champion, (games, wins, moment) in picks.items():
            count = counts[champion]
            if recent:
                count[0] += games
                count[1] += wins
            count[2] = min(3, count[2] + moment)
            estimate = mastery_score(count[0], count[1], totals, 0) if recent else baseline[champion]['score']
            if recent and not baseline[champion]['games'] and count[0] < 5:
                estimate = round(48 + (estimate - 48) * count[0] / 5)
            score = min(99, estimate + count[2])
            if score != scores[champion]:
                scores[champion] = score
                changes[champion].append([day, score])
    return dict(changes)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input-dir', required=True, type=Path)
    parser.add_argument('--supplement-csv', required=True, type=Path)
    args = parser.parse_args()

    roster = read_json(OUT / 'players.json') + [
        p for team in read_json(OUT / 'international.json')['teams'] for p in team['players']]
    player_ids = {p['id']: set(p['oePlayerIds']) | set(LEGACY_IDS.get(p['id'], [])) for p in roster}
    if any(not ids for ids in player_ids.values()):
        raise ValueError('Every audited roster player needs a verified source identity')
    champions = read_json(ROOT / 'research/mastery-champion-names.json')
    champion_ids = {N(v): c['id'] for c in champions for v in (c['id'], c['nameEn'])}
    existing = read_json(OUT / 'mastery.json')['players']
    sources = read_json(RESEARCH / 'sources.json')
    samples = {player: defaultdict(lambda: defaultdict(lambda: [0, 0, 0])) for player in player_ids}
    anchors = defaultdict(set)
    highlights = Counter()

    def add_game(key, recorded):
        game, timestamp = key
        used = set()
        for row, pid in recorded:
            champion = champion_ids.get(N(row['champion']))
            if not champion or pid in used:
                raise ValueError(f'Unresolved champion or duplicate player: {game}, {pid}')
            used.add(pid)
            counts = samples[pid][timestamp[:10]][champion]
            counts[0] += 1
            counts[1] += int(row['win'])
            if row['penta']:
                counts[2] += 2
                highlights['penta'] += 1
            elif row['quadra']:
                counts[2] += 1
                highlights['quadra'] += 1
        return len(used)

    coverage = {}
    for year in (2025, 2026):
        path = args.input_dir / f'{year}_LoL_esports_match_data_from_OraclesElixir.csv'
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != sources['datasets'][str(year)]['sha256']:
            raise ValueError(f'{year} Oracle’s Elixir data does not match the reviewed snapshot')
        with path.open(encoding='utf-8-sig', newline='') as handle:
            original = load_games(csv.DictReader(handle))
        count = 0
        for key, rows in sorted(original.items(), key=lambda entry: entry[0][1]):
            recorded = []
            for row in rows:
                name = N(row['name'])
                pid = name if name in player_ids else PLAYER_ALIASES.get(name, name)
                if pid not in player_ids:
                    continue
                if row['playerId'] not in player_ids[pid]:
                    continue
                if year == 2026:
                    anchors[name, row['team']].add(pid)
                recorded.append((row, pid))
            count += add_game(key, recorded)
        coverage[str(year)] = {'appearances': count, 'through': max(k[1] for k in original)[:10], 'sha256': digest}
        original_field = 'champions' if year == 2025 else 'retrospective2026'
        for pid, p in existing.items():
            audited = defaultdict(lambda: [0, 0])
            for day, champions in samples[pid].items():
                if day.startswith(str(year)):
                    for champion, (games, wins, _) in champions.items():
                        audited[champion][0] += games
                        audited[champion][1] += wins
            previous = {c: (e['games'], e['wins']) for c, e in p[original_field].items() if e['games']}
            if previous != {c: tuple(counts) for c, counts in audited.items()}:
                raise ValueError(f'{year} historical aggregate mismatch: {pid}')

    with gzip.open(args.supplement_csv, 'rt', encoding='utf-8-sig', newline='') as handle:
        supplement = load_games(csv.DictReader(handle), supplement=True)
    worlds = {key: rows for key, rows in supplement.items() if rows[0]['league'] == 'WLDs'}
    shared = reconcile_worlds(original, worlds, champion_ids)
    original_last = max(key[1] for key in original)
    additional_keys = (worlds.keys() - shared) | {key for key in supplement if key[1] > original_last}
    added = Counter()
    for key in sorted(additional_keys, key=lambda key: key[1]):
        rows = supplement[key]
        recorded = []
        for row in rows:
            matching = anchors.get((N(row['name']), row['team']), set())
            if len(matching) == 1:
                recorded.append((row, next(iter(matching))))
        added[rows[0]['league']] += add_game(key, recorded)

    coverage['worlds'] = {'sets': len(worlds), 'additionalSets': len(worlds) - len(shared),
                          'additionalAppearances': added['WLDs'], 'through': max(key[1] for key in worlds)[:10],
                          'sha256': hashlib.sha256(args.supplement_csv.read_bytes()).hexdigest()}
    coverage['otherAdditionalAppearances'] = sum(added.values()) - added['WLDs']
    adjustments = {pid: dated_scores(days, existing[pid]['champions']) for pid, days in samples.items()}
    coverage['players'] = len(adjustments)
    coverage['multiKillAppearances'] = dict(highlights)
    dump(OUT / 'mastery-records.json', {'players': adjustments, 'coverage': coverage,
        'sources': {'oracle': ORACLE_URL, 'chaincc': CHAINCC_URL, 'chainccLicense': 'CC BY 4.0',
                    'worldsCheck': WORLDS_FINAL}})
    print(json.dumps(coverage, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
