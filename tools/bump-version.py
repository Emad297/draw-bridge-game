#!/usr/bin/env python3
"""Stamp every local file the page loads with ?v=<version> so phones fetch fresh code after each update
(GitHub Pages lets browsers cache files for 10 minutes). Run before committing: python3 tools/bump-version.py"""
import re, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = time.strftime('%Y%m%d%H%M%S')
tag = lambda m: f"{m.group(1)}{m.group(2)}?v={v}{m.group(4)}"
for f in list((root / 'js').glob('*.js')):
    s = f.read_text()
    s = re.sub(r"""(from\s+['"])(\.{1,2}/[^'"?]+)(\?v=\w+)?(['"])""", tag, s)
    f.write_text(s)
h = root / 'index.html'; s = h.read_text()
s = re.sub(r"""((?:src|href)=")((?:js|css|vendor)/[^"?]+)(\?v=\w+)?(")""", tag, s)
s = re.sub(r"""("three":\s*")(\./vendor/three\.module\.js)(\?v=\w+)?(")""", tag, s)
s = re.sub(r"v !== '\w+'", f"v !== '{v}'", s)
h.write_text(s)
(root / 'version.txt').write_text(v + '\n')
print('version', v)
