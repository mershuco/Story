"""Reconcile historical official match records for the opening 2026 roster."""

import argparse
import base64
import csv
import gzip
import hashlib
import json
import re
from collections import Counter, defaultdict
from datetime import date, timedelta
from itertools import accumulate
from pathlib import Path
from struct import iter_unpack

from build_player_match_records import read_json
from build_season_2026 import LEGACY_IDS, N, OUT, PLAYER_ALIASES, RESEARCH, ROOT, ROLES, dump


LEAGUERECORDS = 'https://leaguerecords.com/data/players/'
ROSTER_ARCHIVE = 'https://raw.githubusercontent.com/liveldy/Nous-Plugin-LoL-Almanac/c6607434ed8760f6332586bb22ba96ea4e45d61d/ui/data/dex.js'
TEAM_ALIASES = (
    ('T1', 'SK Telecom T1', 'SK Telecom T1 K', 'SK Telecom T1 #2'),
    ('T1 Esports Academy', 'T1 Challengers'),
    ('DN SOOPers', 'DN Freecs', 'Kwangdong Freecs', 'Afreeca Freecs'),
    ('DN SOOPers Challengers', 'DN Freecs Challengers', 'Kwangdong Freecs Challengers', 'Afreeca Freecs Challengers'),
    ('DN SOOPers Academy', 'DN Freecs Academy', 'Kwangdong Freecs Academy', 'Afreeca Freecs Academy'),
    ('HANJIN BRION', 'Fredit BRION', 'BRION', 'OKSavingsBank BRION'),
    ('HANJIN BRION Challengers', 'Fredit BRION Challengers', 'BRION Challengers', 'OKSavingsBank BRION Challengers'),
    ('HANJIN BRION Academy', 'Fredit BRION Academy', 'BRION Academy', 'OKSavingsBank BRION Academy'),
    ('Kiwoom DRX', 'DRX', 'DragonX', 'Kingzone DragonX'),
    ('Kiwoom DRX Challengers', 'DRX Challengers'),
    ('DRX Academy', 'DragonX Academy', 'DRX Shinhan Bank'),
    ('Gen.G Global Academy', 'Gen.G Challengers'),
    ('Gen.G Scholars', 'Gen.G Academy'),
    ('FlyQuest NZXT', 'FlyQuest Challengers', 'FlyQuest Academy'),
    ('Oh My God Academy', 'Oh My Dream'),
)
TEAM_KEYS = {N(alias): N(group[0]) for group in TEAM_ALIASES for alias in group}
VERIFIED_TENURES = (
    ('on', ('on', 'owo'), 'Suning-S', '2019-06-01', '2019-09-30',
     'https://lol.fandom.com/wiki/Suning-S/Statistics/2019'),
    ('ruler', ('ruler', 'bung'), 'Stardust', '2016-01-17', '2016-05-17',
     'https://liquipedia.net/leagueoflegends/Stardust'),
    ('sero', ('sero',), 'KT Rolster Academy', '2022-10-22', '2024-12-18',
     'https://liquipedia.net/leagueoflegends/Sero'),
    ('empyros', ('empyros',), 'Valerion', '2026-11-21', '2026-11-21',
     'https://yourmomsarena.app/pro-builds/game?id=Hellenic+Legends+League%2F2026+Season%2FSuper+Cup_Stage+1+Round+2_4_1'),
)
TOURNAMENT_YEARS = {'Champions/2014 Season/Winter Season_Group A': 2013}
WINTER_SCHEDULE = 'https://lol.fandom.com/wiki/Champions/2014_Season/Winter_Season/VODs'
# These series have scoreboard sets missing from the reviewed Oracle CSVs.
VERIFIED_MISSING_SETS = {
    'LEC/2025 Season/Summer Playoffs_Round 2_1': ((3, 4), 'https://pem.lol/lec/2025/summer/matches/fnatic-vs-karmine-corp-2025-09-26'),
    'Demacia Cup 2025_Quarterfinals_1': ((1, 2, 3, 4), 'https://riftwise.gg/tournament/demacia-cup-2025'),
    'Demacia Cup 2025_Semifinals_2': ((2, 3), 'https://riftwise.gg/tournament/demacia-cup-2025'),
    'Demacia Cup 2025_Finals_1': ((2, 3), 'https://riftwise.gg/tournament/demacia-cup-2025'),
}
# Each highlight refers to an exact scoreboard and a source describing the play.
HIGHLIGHTS = (
    ('faker', 'Champions/2013 Season/Summer_Finals_1_5', 'Zed', 'https://legacies.lol/faker/'),
    ('faker', 'Champions/2013 Season/Spring_Week 3_1_2', 'Leblanc', 'https://www.invenglobal.com/articles/15075/the-best-leblanc-game-ever-played-faker-vs-mvp-blue-ogn-spring-2013'),
    ('ruler', 'TRLH3/1002320098', 'Varus', 'https://leaguerecords.com/championships/worlds/2017/88/3'),
    ('canyon', 'ESPORTSTMNT02_2664248', 'Nidalee', 'https://www.youtube.com/watch?v=iSq2TP1ynYo&t=3979s'),
    ('chovy', 'ESPORTSTMNT02_2664248', 'Ahri', 'https://www.youtube.com/watch?v=iSq2TP1ynYo&t=3979s'),
    ('faker', 'ESPORTSTMNT03_3227455', 'Azir', 'https://www.oneesports.gg/league-of-legends/t1-worlds-2023-semifinals-yone/'),
)


def sha256(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def normal_team(name):
    key = N(name)
    return TEAM_KEYS.get(key, key)


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
        if not day:
            year = next((y for stage, y in TOURNAMENT_YEARS.items() if game_id.startswith(stage + '_')), year)
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


def packed_column(column):
    codes = {'u8': '<B', 'u16': '<H', 'u32': '<I'}
    return [value for value, in iter_unpack(codes[column['w']], base64.b64decode(column['d']))]


def roster_history(path, names, roster_names, identity_rows):
    """Use Leaguepedia's dated team tenures to resolve missing scoreboard identities."""
    encoded = re.search(rb'window\.__DEX__="([A-Za-z0-9+/=]+)"', path.read_bytes())
    archive = json.loads(gzip.decompress(base64.b64decode(encoded[1])))
    columns = archive['columns']
    tags = [{N(tag)} for tag in columns['ID']]
    for index, tag in zip(packed_column(archive['aliases']['p']), archive['aliases']['names']):
        if key := N(tag):
            tags[index].add(key)

    tenures = archive['tenures']
    base = date(archive['base'], 1, 1)
    team_names = list(map(normal_team, archive['teams']))
    by_profile = defaultdict(list)
    for index, team, joined, left in zip(accumulate(packed_column(tenures['pd'])),
                                         packed_column(tenures['t']), packed_column(tenures['j']),
                                         packed_column(tenures['l'])):
        if team and joined:
            by_profile[index].append((team_names[team],
                                      (base + timedelta(days=joined - 2)).isoformat(),
                                      (base + timedelta(days=left)).isoformat() if left else archive['generatedAt']))

    matches = defaultdict(list)
    for index, tenures in by_profile.items():
        candidates = set().union(*(names.get(tag, set()) for tag in tags[index]))
        proven = []
        for player in candidates:
            overlap = {day for tag, team, day in identity_rows[player] if tag in tags[index]
                       and any(team == club and joined <= day <= left for club, joined, left in tenures)}
            if len(overlap) >= 2:
                proven.append(player)
        if len(proven) == 1:
            matches[proven[0]].append(index)

    spans = defaultdict(set)
    linked = {}
    for player, indices in matches.items():
        if len(indices) != 1:
            indices = [index for index in indices if N(columns['ID'][index]) == roster_names[player]]
        if len(indices) != 1:
            continue
        index = indices[0]
        linked[player] = columns['OverviewPage'][index] or columns['ID'][index]
        for tag in tags[index]:
            for team, joined, left in by_profile[index]:
                spans[tag, team].add((player, joined, left))
    return spans, {'source': ROSTER_ARCHIVE, 'asOf': archive['generatedAt'],
                   'sha256': sha256(path), 'profiles': linked}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--oracle-dir', required=True, type=Path)
    parser.add_argument('--chain-dir', required=True, type=Path)
    parser.add_argument('--profiles-dir', required=True, type=Path)
    parser.add_argument('--roster-archive', required=True, type=Path)
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
    identity_rows = defaultdict(set)
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
                identity_rows[player].add((name, team, day))
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

    spans, roster_provenance = roster_history(args.roster_archive, names, roster_names, identity_rows)
    for player, tags, team, start, finish, _ in VERIFIED_TENURES:
        for tag in tags:
            spans[tag, normal_team(team)].add((player, start, finish))
    for (tag, _), tenures in spans.items():
        names[tag].update(player for player, _, _ in tenures)

    profile_keys = defaultdict(list)
    recent_supplement = defaultdict(list)
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
                if row['position'] not in ROLES or tag not in names:
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
        day, team, *_ = record
        anchored = anchors.get((tag, team), set())
        dated = {player for player, joined, left in spans.get((tag, team), ()) if joined <= day <= left}
        possible = dated & anchored if dated and anchored else dated or anchored
        if len(possible) != 1:
            matches[year]['unlinkedSourceRows'] += 1
            continue
        player = next(iter(possible))
        previous = raw[player][year]
        if any(old[2] == record[2] for old in previous):
            continue
        previous.append(record)
        matches[year]['chaincc'] += 1
        if dated and not anchored:
            matches[year]['tenureVerified'] += 1

    included = {p: defaultdict(lambda: defaultdict(lambda: [0, 0, 0])) for p in ids}
    early_source = read_json(RESEARCH / 'early-scoreboards.json')
    early_player = early_source['player']
    early_scores = defaultdict(list)
    first = {}
    highlights = {(pid, game, champ) for pid, game, champ, _ in HIGHLIGHTS}
    applied_highlights = set()

    def count(player, year, day, game, fingerprint, moment=0):
        champion, win, *_ = fingerprint
        if (player, game, champion) in highlights:
            applied_highlights.add((player, game, champion))
            moment = max(moment, 1)
        entry = included[player][year][champion]
        entry[0] += 1
        entry[1] += win
        entry[2] += moment
        if player == early_player and year in (2013, 2014):
            early_scores[year].append((day, fingerprint))
        if day:
            first[player] = min(first.get(player, day), day)

    for player, games in raw.items():
        for year, rows in games.items():
            if year < 2025:
                for day, _, game, fingerprint, moment in rows:
                    count(player, year, day, game, fingerprint, moment)

    for player, rows in profiles.items():
        used = defaultdict(set)
        for year, day, _, game, fingerprint in sorted(rows, key=lambda r: (r[0], not r[1], r[1] or '', r[3])):
            if year < 2013:
                continue
            series, _, set_number = game.rpartition('_')
            if year >= 2025 and (not day or series not in VERIFIED_MISSING_SETS
                                 or set_number not in map(str, VERIFIED_MISSING_SETS[series][0])):
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
            if year >= 2025:
                champion, win, *_ = fingerprint
                recent_supplement[player].append([day, game, champion, win])
                continue
            count(player, year, day, game, fingerprint)
            matches[year]['leaguepedia'] += 1
            if not day:
                matches[year]['knownTournamentYearOnly'] += 1

    used_early = defaultdict(set)
    for edition in early_source['editions']:
        for day, label, champion, win, kills, deaths, assists in edition['games']:
            year = int(day[:4])
            fingerprint = game_fingerprint(champions[N(champion)], win, kills, deaths, assists)
            overlapping = [i for i, (when, stats) in enumerate(early_scores[year])
                           if i not in used_early[year] and stats == fingerprint and compatible(day, when)]
            if overlapping:
                entry = min(overlapping, key=lambda i: early_scores[year][i][0] != day)
                used_early[year].add(entry)
                if not early_scores[year][entry][0]:
                    matches[year]['knownTournamentYearOnly'] -= 1
                continue
            count(early_player, year, day, label, fingerprint)
            used_early[year].add(len(early_scores[year]) - 1)
            matches[year]['inven'] += 1

    if applied_highlights != highlights:
        raise ValueError(f'Unmatched highlight scoreboards: {highlights - applied_highlights}')
    coverage = {str(year): dict(matches[year]) for year in range(2013, 2025)}
    for year in coverage:
        coverage[year]['appearances'] = sum(sum(r[0] for r in scores.get(int(year), {}).values()) for scores in included.values())
    dump(args.output, {'players': included, 'coverage': coverage, 'firstObserved': first,
                       'recentSupplement': recent_supplement,
                       'provenance': {'oracleSha256': oracle_hashes, 'chainccSha256': chain_hashes,
                                      'leaguepediaProfiles': profile_hashes, 'leaguepediaMirror': LEAGUERECORDS,
                                      'leaguepediaTenures': roster_provenance,
                                      'teamAliases': TEAM_ALIASES,
                                      'verifiedTenures': VERIFIED_TENURES,
                                      'tournamentDates': WINTER_SCHEDULE,
                                      'earlyScoreboards': 'early-scoreboards.json',
                                      'recentSupplementSources': VERIFIED_MISSING_SETS,
                                      'highlights': HIGHLIGHTS,
                                      'verifiedAlias': {'pop9': 'https://liquipedia.net/leagueoflegends/POP9'}}})
    print(json.dumps(coverage, indent=2))


if __name__ == '__main__':
    main()
