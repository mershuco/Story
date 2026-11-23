"""Cache official default champion loading portraits used by broadcast-style cards."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT/'dist/assets/champions-loading'
OUT.mkdir(parents=True,exist_ok=True)
data = json.loads((ROOT/'dist/data/champions.json').read_text())
champions = data if isinstance(data,list) else data['champions']

def collect(champion):
    cid = champion['id']
    url = f'https://ddragon.leagueoflegends.com/cdn/img/champion/loading/{cid}_0.jpg'
    path = OUT/f'{cid}.jpg'
    for attempt in range(3):
        try:
            if not path.exists():
                with urllib.request.urlopen(url,timeout=35) as response:blob=response.read()
                assert blob[:2] == b'\xff\xd8', 'Expected JPEG'
                path.write_bytes(blob)
            blob = path.read_bytes()
            return {'id':cid,'file':str(path.relative_to(ROOT/'dist')),'url':url,'bytes':len(blob),'sha256':hashlib.sha256(blob).hexdigest()}
        except Exception as exc:
            if attempt==2:return {'id':cid,'url':url,'error':str(exc)}
            time.sleep(.5*(attempt+1))

if __name__=='__main__':
    results=[]
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures=[pool.submit(collect,c) for c in champions]
        for count,future in enumerate(as_completed(futures),1):
            results.append(future.result())
            if count%25==0:print('Loading portraits',count,'/',len(champions),flush=True)
    results.sort(key=lambda x:x['id'])
    manifest={'source':'Riot Games Data Dragon default champion loading art','note':'Unversioned current default artwork; visual reference does not define historical kit, balance or tournament eligibility. Research broadcast screenshots are separate and are not game assets.','assets':results,'errors':[r for r in results if 'error' in r]}
    (ROOT/'research/champion-loading-sources.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    print(json.dumps({'total':len(results),'bytes':sum(r.get('bytes',0) for r in results),'errors':manifest['errors']},ensure_ascii=False),flush=True)
