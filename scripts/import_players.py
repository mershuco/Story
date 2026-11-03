"""Import the supplied unverified workbook without third-party dependencies."""
import json
from pathlib import Path
import zipfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
NS = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
with zipfile.ZipFile(ROOT / 'data/선수능력치_초안.xlsx') as archive:
    rows = ET.fromstring(archive.read('xl/worksheets/sheet1.xml')).findall('.//s:row', NS)
    players = []
    for row in rows[1:]:
        cells = {}
        for cell in row:
            inline = cell.find('s:is', NS)
            value = cell.find('s:v', NS)
            cells[''.join(c for c in cell.attrib['r'] if c.isalpha())] = ''.join(inline.itertext()) if inline is not None else value.text if value is not None else ''
        if cells.get('E') not in ['TOP', 'JGL', 'MID', 'BOT', 'SUP']:
            continue
        players.append({'name': cells['A'], 'position': cells['E'], 'ovr': int(cells['F']), 'potential': int(cells['G']), 'draftTeam': cells['D'], 'draftLeague': cells['C'], 'sourceStatus': 'simulated', 'historicalContractEnd': None})
(ROOT / 'src/data/players.json').write_text(json.dumps(players, ensure_ascii=False, indent=2) + '\n')
print(f'Imported {len(players)} preliminary 2022 player ratings. No historical contracts imported.')
