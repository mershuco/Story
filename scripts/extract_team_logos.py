"""Extract historical team-emblem bytes from the previously researched Story bundle.

No image generation, cropping, recoloring, or modern team substitutions are used.
"""
import argparse
import base64
import hashlib
import json
from pathlib import Path
import re

ROOT=Path(__file__).resolve().parents[1]
VARIABLES={'T1':'Xg','GEN':'bd','DK':'fd','DRX':'Kg','KT':'xg','KDF':'Bd','LSB':'md','NS':'jg','BRO':'Zg','HLE':'Fg'}

def main():
    p=argparse.ArgumentParser();p.add_argument('--input-dir',type=Path,required=True);args=p.parse_args()
    script=(args.input_dir/'live-story-script-0.js').read_text()
    out=ROOT/'dist/assets/teams';out.mkdir(parents=True,exist_ok=True)
    manifest={};sources={}
    for team,var in VARIABLES.items():
        parsed=args.input_dir/f'live-data-{var}.json'
        if parsed.exists():obj=json.loads(parsed.read_text());origin='JSON.parse literal'
        else:
            match=re.search(r'\b'+var+r'=\{src:"(data:image/[^"\\]+)",name:"([^"\\]+)"\}',script)
            if not match:raise ValueError(f'Missing original historical team asset: {team} / {var}')
            obj={'src':match.group(1),'name':match.group(2)};origin='inline object literal'
        mime=obj['src'].split(';')[0].split(':')[1]
        ext={'image/png':'png','image/webp':'webp','image/svg+xml':'svg','image/jpeg':'jpg'}[mime]
        blob=base64.b64decode(obj['src'].split(',',1)[1]);path=out/f'{team}.{ext}';path.write_bytes(blob)
        manifest[team]=str(path.relative_to(ROOT/'dist'))
        sources[team]={'path':manifest[team],'sourceName':obj.get('name'),'sourceVariable':var,'extraction':origin,
                       'sha256':hashlib.sha256(blob).hexdigest(),'bytes':len(blob)}
    (ROOT/'dist/data/team-logos.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    provenance={'source':'Public Story deployment embedded logo assets','sourceUrl':'https://mershuco.github.io/Story/index.html?v=20261110-road-age',
                'sourceHtmlSha256':hashlib.sha256((args.input_dir/'live-story.html').read_bytes()).hexdigest(),
                'historicalSelection':'2022 identity mapping from Story i2(): DK→DWG(fd), KDF→KDF(Bd), LSB→LSB(md), BRO→BRO(Zg). Modern DPLUS, DNF, BFX and HANJIN BRION variants excluded.',
                'visualReview':'All10files opened and visually inspected. DRX Academy and BRO Academy source labels contain shared team emblems without academy-specific text.',
                'brionCrossCheck':{'officialPage':'https://brion.co.kr/untitled-16','officialImage':'https://contents.sixshop.com/thumbnails/uploadedFiles/78428/default/image_1633690708368_500.png'},
                'assets':sources}
    (ROOT/'research/team-logo-sources.json').write_text(json.dumps(provenance,ensure_ascii=False,indent=2))
    assert len(manifest)==10
    print(json.dumps({'teams':len(manifest),'bytes':sum(x['bytes'] for x in sources.values())}))

if __name__=='__main__':main()
