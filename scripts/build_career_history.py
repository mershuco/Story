"""Reconcile historical official match records for the opening 2026 roster."""

import argparse
import csv
import gzip
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import date
from pathlib import Path

from build_player_match_records import read_json
from build_season_2026 import LEGACY_IDS, N, OUT, PLAYER_ALIASES, ROOT, ROLES, dump


LEAGUERECORDS = 'https://leaguerecords.com/data/players/'
# On the same verified set as Faker's 8/6/5 in the Leaguepedia scoreboard.
FAKER_ZED_FINAL = 'Champions/2013 Season/Summer_Finals_1_5'
FAKER_HIGHLIGHT = 'https://legacies.lol/faker/'


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normal_team(name):
    return {'sktelecomt1': 't1', 'sktelecomt1k': 't1', 'sktelecomt12': 't1'}.get(N(name), N(name))


def game_fingerprint(champion, win, kills, deaths, assists):
    return champion, win, kills, deaths, assists


def compatible(left, right):
    if not left or not right:
        return True
    return abs((date.fromisoformat(left) - date.fromisoformat(right)).days) <= 1


def profile_rows(profile, champions):
    by_id = {row[0]: row[5] for row in profile['series'] if row[5]}
    by_ref = {row[4]: row[5] for row in profile['series'] if row[4] and row[5]}
    seen = set()
    for game_id, team, result, champion, ref, kills, deaths, assists, _ in profile['games']:
        champion_id = champions.get(N(champion))
        if game_id in seen or not champion_id or result not in (0, 1):
            continue
        day = by_id.get(game_id.rsplit('_', 1)[0]) or by_ref.get(ref.rsplit('|', 1)[0])
        fallback_year = re.search(r'20(?:1[3-9]|2[0-6])', game_id)
        if not day and not fallback_year:
            continue
        year = int(day[:4] if day else fallback_year.group())
        seen.add(game_id)
        yield year, day, normal_team(team), game_id, game_fingerprint(champion_id, int(result), kills, deaths, assists)


def source_row(row, champions, chain=False):
    game = row['game_id' if chain else 'gameid']
    team = row['team_name' if chain else 'teamname']
    champion = champions.get(N(row['champion']))
    if not game or not champion or row['result'] not in ('0', '1', 'TRUE', 'FALSE'):
        return None
    win = int(row['result'] in ('1', 'TRUE'))
    kda = tuple(int(float(row[k])) if row[k] else None for k in ('kills', 'deaths', 'assists'))
    moment = 2 if float(row.get('pentakills') or 0) > 0 else 1 if float(row.get('quadrakills') or 0) > 0 else 0
    return row['date'][:10], normal_team(team), game, game_fingerprint(champion, win, *kda), moment


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--oracle-dir', required=True, type=Path)
    parser.add_argument('--chain-dir', required=True, type=Path)
    parser.add_argument('--profiles-dir', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    roster = read_json(OUT / 'players.json') + [p for team in read_json(OUT / 'international.json')['teams'] for p in team['players']]
    ids = {p['id']: set(p['oePlayerIds']) | set(LEGACY_IDS.get(p['id'], [])) for p in roster}
    id_owners = defaultdict(set)
    for player, verified_ids in ids.items():
        for source_id in verified_ids:
            id_owners[source_id].add(player)
    roster_names = {p['id']: N(p['name']) for p in roster}
    champion_names = read_json(ROOT / 'research/mastery-champion-names.json')
    champions = {N(v): c['id'] for c in champion_names for v in (c['nameEn'], c['id'])}
    raw = {p: defaultdict(list) for p in ids}
    profile_hashes = {}
    oracle_hashes = {}
    chain_hashes = {}
    anchors = defaultdict(set)
    matches = defaultdict(Counter)
    names = defaultdict(set)
    for player, name in roster_names.items():
        names[name].add(player)
    for tag, player in PLAYER_ALIASES.items():
        if player in ids:
            names[tag].add(player)

    for year in range(2021, 2027):
        path = args.oracle_dir / f'{year}_LoL_esports_match_data_from_OraclesElixir.csv'
        oracle_hashes[year] = sha256(path)
        seen = set()
        with path.open(encoding='utf-8-sig', newline='') as handle:
            reader = csv.DictReader(handle)
            if not {'playerid', 'gameid', 'date', 'position'} <= set(reader.fieldnames or []):
                raise ValueError(f'Unexpected Oracle’s Elixir format: {path}')
            for row in reader:
                possible = id_owners.get(row['playerid'], set())
                if row['position'] not in ROLES or len(possible) != 1:
                    continue
                player = next(iter(possible))
                record = source_row(row, champions)
                if not record or (player, record[2]) in seen:
                    continue
                seen.add((player, record[2]))
                day, team, *_ = record
                name = N(row['playername'])
                anchors[name, team].add(player)
                names[name].add(player)
                raw[player][int(day[:4])].append(record)
                if year < 2025:
                    matches[year]['oracle'] += 1

    profiles = {}
    for player in ids:
        file = args.profiles_dir / f'{player}.json'
        if not file.exists():
            continue
        profile = read_json(file)
        if N(profile['name'].split(' (', 1)[0]) != roster_names[player]:
            continue
        rows = list(profile_rows(profile, champions))
        reference = defaultdict(list)
        for year, games in raw[player].items():
            for day, _, _, fingerprint, _ in games:
                reference[year, fingerprint].append(day)
        verified = sum(any(compatible(day, original_day) for original_day in reference[year, fingerprint])
                       for year, day, _, _, fingerprint in rows if day)
        if verified < 2:
            continue
        profiles[player] = rows
        profile_hashes[player] = {'slug': profile['slug'], 'sha256': sha256(file)}
        for alias, *_ in profile['names']:
            names[N(alias)].add(player)
        for name in [roster_names[player], *(N(alias) for alias, *_ in profile['names'])]:
            for team in profile['orgs']:
                anchors[name, normal_team(team)].add(player)

    profile_keys = defaultdict(list)
    for player, rows in profiles.items():
        for year, day, _, _, fingerprint in rows:
            profile_keys[player, year, fingerprint].append(day)

    pending = []
    for year in range(2014, 2025):
        path = args.chain_dir / f'{year}.csv.gz'
        chain_hashes[year] = sha256(path)
        with gzip.open(path, 'rt', encoding='utf-8-sig', newline='') as handle:
            for row in csv.DictReader(handle):
                tag = N(row['playername'])
                if tag not in names:
                    continue
                record = source_row(row, champions, chain=True)
                if not record:
                    continue
                day, team, _, fingerprint, _ = record
                proven = {p for p in names[tag] if any(known_day and compatible(day, known_day)
                          for known_day in profile_keys[p, year, fingerprint])}
                if len(proven) == 1:
                    anchors[tag, team].update(proven)
                pending.append((year, tag, record))

    for year, tag, record in pending:
        possible = anchors.get((tag, record[1]), set()) & names[tag]
        if len(possible) != 1:
            matches[year]['unlinkedSourceRows'] += 1
            continue
        player = next(iter(possible))
        previous = raw[player][year]
        if any(old[2] == record[2] for old in previous):
            continue
        previous.append(record)
        matches[year]['chaincc'] += 1

    included = {p: defaultdict(lambda: defaultdict(lambda: [0, 0, 0])) for p in ids}
    first = {}
    def count(player, year, day, fingerprint, moment):
        champion, win, *_ = fingerprint
        entry = included[player][year][champion]
        entry[0] += 1
        entry[1] += win
        entry[2] += moment
        if day:
            first[player] = min(first.get(player, day), day)

    for player, games in raw.items():
        for year, rows in games.items():
            if year < 2025:
                for day, _, _, fingerprint, moment in rows:
                    count(player, year, day, fingerprint, moment)

    for player, rows in profiles.items():
        used = defaultdict(set)
        for year, day, _, game, fingerprint in sorted(rows, key=lambda r: (r[0], not r[1], r[1] or '', r[3])):
            if year < 2013 or year >= 2025:
                continue
            records = raw[player][year]
            chosen = [i for i, (when, _, _, stats, _) in enumerate(records)
                      if i not in used[year] and stats == fingerprint and compatible(day, when)]
            if chosen:
                i = min(chosen, key=lambda i: records[i][0] != day)
                used[year].add(i)
                continue
            if day and any(i not in used[year] and when == day and stats[:2] == fingerprint[:2]
                           for i, (when, _, _, stats, _) in enumerate(records)):
                matches[year]['conflictingProfileRows'] += 1
                continue
            moment = int(player == 'faker' and game == FAKER_ZED_FINAL)
            count(player, year, day, fingerprint, moment)
            matches[year]['leaguepedia'] += 1
            if not day:
                matches[year]['knownTournamentYearOnly'] += 1

    coverage = {str(year): dict(matches[year]) for year in range(2013, 2025)}
    for year in coverage:
        coverage[year]['appearances'] = sum(sum(r[0] for r in scores.get(int(year), {}).values()) for scores in included.values())
    dump(args.output, {'players': included, 'coverage': coverage, 'firstObserved': first,
                       'provenance': {'oracleSha256': oracle_hashes, 'chainccSha256': chain_hashes,
                                      'leaguepediaProfiles': profile_hashes, 'leaguepediaMirror': LEAGUERECORDS,
                                      'highlight': FAKER_HIGHLIGHT,
                                      'verifiedAlias': {'pop9': 'https://liquipedia.net/leagueoflegends/POP9'}}})
    print(json.dumps(coverage, indent=2))


if __name__ == '__main__':
    main()
