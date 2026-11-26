"""Measure 2026 scoreboards and build inputs for the match simulator."""
import argparse
import csv
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean, median, quantiles

from build_season_2026 import LEGACY_IDS, OUT, RESEARCH, ROLES, ROOT, N

MAJOR = {'LCK', 'LPL', 'LCS', 'LEC', 'LCP', 'CBLOL', 'FST', 'MSI', 'WLDs'}
STYLE_LEAGUES = MAJOR | {'LCKC', 'LDL', 'NACL', 'LFL', 'EM', 'LJL', 'LAS', 'LRS'}


def number(row, key):
    value = row[key]
    return float(value) if value else None


def observe_style(row, owners, populations, observations):
    keys = ('killsat15', 'assistsat15', 'deathsat15', 'csdiffat15')
    if any(not row[k] for k in keys):
        return
    kills, assists, deaths, cs = (float(row[k]) for k in keys)
    activity = kills + .55 * assists + .6 * deaths
    role = ROLES[row['position']]
    group = row['league'], role
    populations[group].append(activity)
    if player := owners.get(row['playerid']):
        observations[player, role].append((group, activity, cs))


def style_profiles(observations, populations):
    activity_base = {group: mean(v) for group, v in populations.items()}
    profiles = {}
    for key, games in sorted(observations.items()):
        sample = len(games)
        activity = sum(value - activity_base[group] for group, value, _ in games) / (sample + 28)
        # Close to 0 for a rookie or a role with very few appearances.
        pressure = sum(max(-40, min(40, diff)) for _, _, diff in games) / (sample + 28)
        profiles[key] = [round(activity, 3), round(pressure, 2), sample]
    return profiles


def measure(path, prior_path):
    with path.open(encoding='utf-8-sig', newline='') as stream:
        rows = [r for r in csv.DictReader(stream) if r['league'] in STYLE_LEAGUES and r['position'] in ROLES]
    imported = json.loads((OUT / 'players.json').read_text())
    imported += [p for t in json.loads((OUT / 'international.json').read_text())['teams'] for p in t['players']]
    owners = {source: p['id'] for p in imported for source in [*p['oePlayerIds'], *LEGACY_IDS.get(p['id'], [])]}
    champions = json.loads((ROOT / 'research/mastery-champion-names.json').read_text())
    champ_ids = {N(name): c['id'] for c in champions for name in (c['id'], c['nameEn'])}

    by_game = defaultdict(list)
    damage = defaultdict(list)
    role_damage = defaultdict(list)
    populations = defaultdict(list)
    observations = defaultdict(list)
    for r in rows:
        role, league = ROLES[r['position']], r['league']
        if league == 'LCK':
            by_game[r['gameid']].append(r)
        dpm = number(r, 'dpm')
        if league in MAJOR and dpm and (champion := champ_ids.get(N(r['champion']))):
            damage[role, champion].append(dpm)
            role_damage[role].append(dpm)
        observe_style(r, owners, populations, observations)

    styles = defaultdict(dict)
    for (player, role), profile in style_profiles(observations, populations).items():
        styles[player][role] = profile
    prior_players = []
    if prior_path:
        missing = {source: player for source, player in owners.items() if player not in styles}
        populations, observations = defaultdict(list), defaultdict(list)
        with prior_path.open(encoding='utf-8-sig', newline='') as stream:
            for r in csv.DictReader(stream):
                if r['league'] in STYLE_LEAGUES and r['position'] in ROLES:
                    observe_style(r, missing, populations, observations)
        for (player, role), profile in style_profiles(observations, populations).items():
            styles[player][role] = profile
        prior_players = sorted({player for player, _ in observations})
    role_mid = {role: round(median(v)) for role, v in role_damage.items()}

    # Champion estimates use observed medians and moderate role shrinkage for rare combos.
    baseline = defaultdict(dict)
    for (role, champion), sample in sorted(damage.items()):
        if len(sample) >= 4:
            share = len(sample) / (len(sample) + 12)
            baseline[role][champion] = round(share * median(sample) + (1 - share) * role_mid[role])
    lck = [game for game in by_game.values() if len(game) == 10 and all(r['goldat15'] and r['csat15'] for r in game)]
    by_role = defaultdict(list)
    differences = defaultdict(list)
    blowouts = defaultdict(list)
    close_farm = defaultdict(list)
    for game in lck:
        win_gold = sum(float(r['totalgold']) for r in game if r['result'] == '1')
        lose_gold = sum(float(r['totalgold']) for r in game if r['result'] == '0')
        for r in game:
            role = ROLES[r['position']]
            by_role[role].append(r)
            if r['result'] == '1':
                differences[role].append(abs(float(r['golddiffat15'])))
            if win_gold - lose_gold >= 10000 and r['result'] == '1':
                opponent = next(p for p in game if p['side'] != r['side'] and p['position'] == r['position'])
                blowouts[role].append(float(r['totalgold']) - float(opponent['totalgold']))
            if r['position'] == 'bot':
                for peer in game:
                    if peer['side'] != r['side'] or peer['position'] not in ('top', 'mid'):
                        continue
                    # Compare within the same team/game and near-identical production.
                    if all(abs(float(r[k]) - float(peer[k])) <= tolerance
                           for k, tolerance in [('total cs', 10), ('kills', 1), ('deaths', 1), ('assists', 2)]):
                        close_farm[ROLES[peer['position']]].append(float(r['totalgold']) - float(peer['totalgold']))
    summary = {
        'source': 'https://oracleselixir.com/tools/downloads', 'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
        'asOf': max(r['date'][:10] for game in lck for r in game), 'lckSets': len(lck),
        'playersWithStyleData': len(styles), 'priorYearPlayers': prior_players,
        'majorPlayerSets': sum(r['league'] in MAJOR for r in rows),
        'earlyKillsPerGame': round(sum(float(r['killsat15']) for game in lck for r in game) / len(lck), 3),
        'blowoutSets': len(blowouts['BOT']), 'similarProductionPairs': {
            role: [len(v), round(median(v))] for role, v in close_farm.items() if v},
        'roleStats': {role: {
            'medianCS15': median(float(r['csat15']) for r in v),
            'medianAbsoluteGoldDiff15': median(differences[role]),
            'medianAbsoluteCSDiff15': median(abs(float(r['csdiffat15'])) for r in v),
            'earlyKillsPerPlayer': round(mean(float(r['killsat15']) for r in v), 3),
            'medianCSPM': round(median(float(r['cspm']) for r in v), 2),
            'medianDPM': round(median(float(r['dpm']) for r in v)),
            'DPMQuartiles': [round(n) for n in quantiles([float(r['dpm']) for r in v], n=4)],
            'over20kShare': round(mean(float(r['damagetochampions']) >= 20000 for r in v), 3),
            'blowoutWinnerGoldDiff': round(median(blowouts[role])),
        } for role, v in by_role.items()},
    }
    if prior_path:
        summary['priorYearSha256'] = hashlib.sha256(prior_path.read_bytes()).hexdigest()
    return styles, role_mid, baseline, summary


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('csv', type=Path)
    parser.add_argument('--prior-csv', type=Path)
    args = parser.parse_args()
    styles, role_dpm, damage, summary = measure(args.csv, args.prior_csv)
    rows = '// Generated by scripts/analyze_2026_laning.py from 2026 professional scoreboards.\n'
    for name, data in [('PLAYER_LANE_STYLE', styles), ('ROLE_DPM', role_dpm), ('CHAMPION_ROLE_DPM', damage)]:
        rows += f'export const {name}=' + json.dumps(data, ensure_ascii=False, separators=(',', ':'), sort_keys=True) + ';\n'
    (ROOT / 'dist/lane-calibration-2026.js').write_text(rows)
    (RESEARCH / 'laning-scoreboard-2026.json').write_text(json.dumps(summary, indent=2) + '\n')
    print(json.dumps(summary))


if __name__ == '__main__':
    main()
