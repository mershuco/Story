"""Bundle Vite's production output as a standalone, offline HTML file."""
from pathlib import Path
import re
ROOT = Path(__file__).resolve().parents[1]
html = (ROOT / 'dist/index.html').read_text()
def inline_script(match):
    source = (ROOT / 'dist' / match.group(1).lstrip('/')).read_text()
    source = re.sub(r'</script', r'<\\/script', source, flags=re.I)
    return '<script type="module">' + source + '</script>'
def inline_style(match):
    return '<style>' + (ROOT / 'dist' / match.group(1).lstrip('/')).read_text() + '</style>'
html = re.sub(r'<script[^>]*src="([^"]+)"[^>]*></script>', inline_script, html)
html = re.sub(r'<link[^>]*href="([^"]+\.css)"[^>]*>', inline_style, html)
release = ROOT / 'releases'
release.mkdir(exist_ok=True)
(release / 'LCK-Manager.html').write_text(html)
print('Created releases/LCK-Manager.html — open in a modern browser, no server needed.')
