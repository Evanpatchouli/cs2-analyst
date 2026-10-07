"""Derive the Windows ICO from the checked-in, unmodified RGBA mark (Pillow)."""
from pathlib import Path
from PIL import Image
import struct

root = Path(__file__).resolve().parents[1]
resources = root / 'apps/desktop/resources'
source = Image.open(resources / 'branding/cs2-analyst-mark.png')
assert source.mode == 'RGBA'
assert all(source.getpixel(p)[3] == 0 for p in [(0, 0), (source.width-1, 0), (0, source.height-1), (source.width-1, source.height-1)])
# Retain the entire original canvas/glow; add a symmetric 4% safe area.
side = max(source.size)
padding = round(side * 0.04)
canvas = Image.new('RGBA', (side + padding * 2,) * 2)
canvas.paste(source, ((canvas.width-source.width)//2, (canvas.height-source.height)//2))
sizes = [16, 24, 32, 48, 64, 128, 256]
# Pillow uses alpha-aware Lanczos scaling independently from the high-res canvas.
canvas.save(resources / 'icon.ico', sizes=[(s, s) for s in sizes])
data = (resources / 'icon.ico').read_bytes()
assert struct.unpack_from('<HHH', data) == (0, 1, len(sizes))
actual = [tuple(v or 256 for v in struct.unpack_from('BB', data, 6+i*16)) for i in range(len(sizes))]
assert actual == [(s, s) for s in sizes], actual
print('ICO RGBA sizes:', actual)
