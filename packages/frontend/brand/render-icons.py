"""Render every LeMedia icon PNG from lemedia-logo.svg (the logo is code; these are outputs).

    python3 render-icons.py <out-dir>      # needs the `playwright` package + chromium

App icons sit the logo on the app's dark background (#0b0b0f) with padding: iOS fills
transparency with black, and Android "maskable" icons need the art inside the middle 80%.
"""
import sys, pathlib
from playwright.sync_api import sync_playwright

here = pathlib.Path(__file__).parent
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else here / 'out')
out.mkdir(parents=True, exist_ok=True)
svg = (here / 'lemedia-logo.svg').read_text()

# name, size, background (None = transparent), logo scale within the square
TARGETS = [
    ('logo-v2.png', 512, None, 1.0),
    ('icon-v2-192.png', 192, '#0b0b0f', .82),
    ('icon-v2-512.png', 512, '#0b0b0f', .82),
    ('icon-v2-512-maskable.png', 512, '#0b0b0f', .66),
    ('apple-touch-icon-v2.png', 180, '#0b0b0f', .80),
    ('favicon-v2-32.png', 32, None, 1.0),
    ('favicon-v2-16.png', 16, None, 1.0),
]

with sync_playwright() as p:
    b = p.chromium.launch()
    for name, size, bg, scale in TARGETS:
        pg = b.new_page(viewport={'width': size, 'height': size}, device_scale_factor=1)
        art = int(size * scale)
        pg.set_content(f"""<html><body style="margin:0;width:{size}px;height:{size}px;display:flex;align-items:center;justify-content:center;background:{bg or 'transparent'}">
          <div style="width:{art}px;height:{art}px">{svg.replace('<svg ', f'<svg width="{art}" height="{art}" ', 1)}</div></body></html>""")
        pg.screenshot(path=str(out / name), omit_background=bg is None, clip={'x': 0, 'y': 0, 'width': size, 'height': size})
        pg.close()
        print('rendered', name)
    b.close()
