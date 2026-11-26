"""Fit result-screen champion damage to the verified 2026 professional scoreboards."""
import argparse
import csv
import gzip
import hashlib
import json
import math
from collections import Counter, defaultdict
from pathlib import Path
from typing import NamedTuple

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'dist/data/season-2026'
ROLES = {'top': 'TOP', 'jng': 'JGL', 'mid': 'MID', 'bot': 'BOT', 'sup': 'SUP'}
ENCHANTERS = set('Janna Lulu Milio Nami Renata Sona Soraka Taric Yuumi'.split())
ENGAGE_SUPPORTS = set('Alistar Blitzcrank Camille Leona Nautilus Pantheon Poppy Pyke Rakan Rell Shen TahmKench Thresh'.split())
DEATH_WEIGHT = -.055
TIME_AND_TEMPO = (1, 2, 3, 7)


class Scoreboard(NamedTuple):
    role: str
    champion: str
    group: str
    minutes: float
    kills: int
    deaths: int
    assists: int
    damage: int
    total_kills: int
    side: int


def normalize(name):
    return ''.join(c for c in name.lower() if c.isalnum())


def tank(champion):
    return champion['classes'][0] == 'Tank' or champion['id'] in {'KSante', 'Skarner', 'Trundle'}


def archetype(role, champion):
    if role != 'SUP':
        return 'tank' if tank(champion) else 'damage'
    if champion['id'] in ENCHANTERS:
        return 'utility'
    if tank(champion) or champion['id'] in ENGAGE_SUPPORTS:
        return 'engage'
    return 'poke'


def read_scoreboards(oracle, worlds, draft, champions):
    hashes = [hashlib.sha256(p.read_bytes()).hexdigest() for p in (oracle, worlds)]
    if hashes != [draft['sourceHash'], draft['worlds']['sha256']]:
        raise ValueError('Use the hash-pinned source scoreboards from draft-meta.json')
    source = json.loads((ROOT / 'research/mastery-champion-names.json').read_text())
    aliases = {normalize(alias): ch['id'] for ch in source for alias in (ch['id'], ch['nameEn'])}
    games = defaultdict(list)
    records = {game['id']: game for game in draft['records']}
    for path, supplemental in [(oracle, False), (worlds, True)]:
        stream = gzip.open(path, 'rt', encoding='utf-8-sig', newline='') if supplemental else path.open(encoding='utf-8-sig', newline='')
        with stream:
            for row in csv.DictReader(stream):
                game_id = row['game_id' if supplemental else 'gameid']
                game = records.get(game_id)
                role = ROLES.get(row['position'])
                if not role or not game or (game['bans'] is None) != supplemental:
                    continue
                side = ['Blue', 'Red'].index(row['side'])
                expected = next(p for p in game['lineups'][side] if p[1] == role)
                champ = aliases.get(normalize(row['champion']))
                if game['date'] != row['date'] or expected[0] != champ or expected[2].lower() != row['playername'].lower():
                    raise ValueError(f'Scoreboard mismatched the verified draft: {game_id} {role}')
                minutes = float(row['gamelength']) / 60
                kills, deaths, assists, damage = (
                    int(float(row[key])) for key in
                    ('kills', 'deaths', 'assists', 'damagetochampions'))
                if damage <= 0 or minutes <= 0:
                    raise ValueError(f'Missing damage or time: {game_id} {role}')
                group = archetype(role, champions[champ])
                games[game_id].append(Scoreboard(role, champ, group, minutes, kills, deaths, assists, damage, 0, side))
    for game_id in records:
        rows = games[game_id]
        if (len(rows) != 10 or len({(row.side, row.role) for row in rows}) != 10
                or len({row.minutes for row in rows}) != 1):
            raise ValueError(f'Incomplete or inconsistent damage scoreboard: {game_id}')
        # Executions can make deaths exceed kills. Count champion kills from the actual ten KDA lines.
        total_kills = sum(row.kills for row in rows)
        games[game_id] = [row._replace(total_kills=total_kills) for row in rows]
    return games


def features(row):
    minutes = row.minutes
    rate = 32 / minutes
    return [1, math.log(minutes / 32), min(0, math.log(minutes / 29)), max(0, math.log(minutes / 38)),
            math.log1p(min(12, row.kills * rate) / 2), math.log1p(min(9, row.deaths * rate) / 3),
            math.log1p(min(22, row.assists * rate) / 5), math.log1p(min(49, row.total_kills * rate) / 18)]


def estimate(row, model):
    return (np.dot(features(row), model['weights']) + model['groups'].get(row.group, 0)
            + model['champions'].get(row.champion, 0))


def fit(rows):
    groups = sorted({r.group for r in rows})
    default = 'engage' if rows[0].role == 'SUP' else 'damage'
    nudges = [group for group in groups if group != default]
    counts = Counter(r.champion for r in rows)
    champions = sorted(ch for ch, n in counts.items() if n >= 3)
    fixed_columns = [0, 1, 2, 3, 4, 6, 7]
    base = [features(r) for r in rows]
    predictors = np.asarray([[x[i] for i in fixed_columns] + [float(r.group == g) for g in nudges]
                             + [float(r.champion == ch) for ch in champions] for r, x in zip(rows, base)])
    penalty = np.diag(np.sqrt([0, 5, 12, 12, 3, 3, 3] + [4] * len(nudges) + [16] * len(champions)))
    target = np.log([r.damage for r in rows]) - DEATH_WEIGHT * np.asarray([x[5] for x in base])
    coeffs = np.linalg.lstsq(np.vstack((predictors, penalty)), np.r_[target, np.zeros(len(penalty))], rcond=None)[0]
    weights = np.insert(coeffs[:7], 5, DEATH_WEIGHT)
    corrections = coeffs[7:7 + len(nudges)]
    individual = coeffs[7 + len(nudges):]
    model = {'weights': weights.round(5).tolist(), 'groups': {default: 0, **dict(zip(nudges, corrections.round(5)))},
             'champions': dict(zip(champions, individual.round(5)))}
    return model


def summary(rows, predict):
    actual = np.asarray([r.damage for r in rows])
    guess = np.asarray([predict(r) for r in rows])
    return {'samples': len(rows), 'actualMedian': round(np.median(actual)), 'fittedMedian': round(np.median(guess)),
            'medianAbsolutePercentageError': round(float(np.median(np.abs(guess / actual - 1))), 3)}


def upper_envelope(rows, model):
    def residual(row):
        x = features(row)
        return math.log(row.damage) - sum(x[i] * model['weights'][i] for i in TIME_AND_TEMPO)
    # Normalize for the same duration and overall kill tempo before learning each group's ceiling.
    return round(float(np.quantile([residual(row) for row in rows], .98)), 5)


def main(oracle, worlds):
    draft = json.loads((DATA / 'draft-meta.json').read_text())
    champions = {c['id']: c for c in json.loads((DATA / 'champions.json').read_text())}
    games = read_scoreboards(oracle, worlds, draft, champions)
    training, test, all_rows = defaultdict(list), defaultdict(list), defaultdict(list)
    for game_id, game in sorted(games.items()):
        holdout = int(hashlib.sha256(game_id.encode()).hexdigest()[:8], 16) % 5 == 0
        for row in game:
            (test if holdout else training)[row.role].append(row)
            all_rows[row.role].append(row)
    models = {}
    report = {'sources': {'oracleSha256': draft['sourceHash'], 'chainccSha256': draft['worlds']['sha256']},
              'matches': len(games), 'scoreboards': sum(map(len, all_rows.values())),
              'matchMinutes': [round(v, 2) for v in (min(g[0].minutes for g in games.values()), max(g[0].minutes for g in games.values()))],
              'holdoutMatches': sum(map(len, test.values())) // 10, 'models': {}}
    for role, rows in all_rows.items():
        validation = fit(training[role])
        model = fit(rows)
        models[role] = model
        residuals = defaultdict(list)
        categories = defaultdict(list)
        for row in rows:
            categories[row.group].append(row)
        for row in test[role]:
            residuals[row.group].append(math.log(row.damage) - estimate(row, validation))
        model['spread'] = {}
        model['upper'] = {}
        for group, group_rows in categories.items():
            errors = residuals[group] if len(residuals[group]) >= 20 else sum(residuals.values(), [])
            model['spread'][group] = round(float(np.clip(np.std(errors) * .72, .13, .24)), 4)
            model['upper'][group] = upper_envelope(group_rows, model)
        groups = {group: {'samples': len(group_rows), 'timeMedians': [
            (round(np.median([r.damage for r in group_rows if lo <= r.minutes < hi]))
             if any(lo <= r.minutes < hi for r in group_rows) else None)
            for lo, hi in [(0, 28), (28, 35), (35, 40), (40, math.inf)]]}
            for group, group_rows in sorted(categories.items())}
        report['models'][role] = {**summary(test[role], lambda r: math.exp(estimate(r, validation))), 'groups': groups}
    (ROOT / 'dist/damage-calibration-2026.js').write_text(
        '// Generated by scripts/calibrate_2026_damage.py from verified 2026 scoreboards.\n'
        'export const DAMAGE_MODELS=' + json.dumps(models, sort_keys=True, separators=(',', ':')) + ';\n'
        'export const TANK_CHAMPIONS=' + json.dumps(sorted(cid for cid,c in champions.items() if tank(c))) + ';\n'
        'export const ENGAGE_SUPPORTS=' + json.dumps(sorted(cid for cid,c in champions.items() if archetype('SUP', c) == 'engage')) + ';\n'
        'export const UTILITY_SUPPORTS=' + json.dumps(sorted(ENCHANTERS)) + ';\n')
    (ROOT / 'research/2026/damage-scoreboards-2026.json').write_text(json.dumps(report, sort_keys=True, indent=2) + '\n')
    print(json.dumps(report))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('oracle', type=Path)
    parser.add_argument('worlds', type=Path)
    args = parser.parse_args()
    main(args.oracle, args.worlds)
