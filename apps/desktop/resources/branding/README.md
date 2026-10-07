# CS2 Analyst branding

- `cs2-analyst-mark.png`: supplied icon-only A/crosshair mark, 1254×1254 RGBA.
- `cs2-analyst-logo.png`: supplied lockup including CS2-ANALYST text, 1254×1254 RGBA.
- Both are byte-for-byte copies of the supplied transparent PNGs. No redraw, recoloring, or background flattening.
- Renderer/titlebar/favicon import the mark PNG; BrowserWindow uses the packaged runtime copy under `resources/branding/`.
- Windows EXE/NSIS/uninstaller/shortcuts use `../icon.ico`. Regenerate with `python scripts/generate-branding-icons.py` from repository root (Pillow required). Seven independent alpha-aware Lanczos downsamples retain the full original canvas with 4% symmetric safe area. No crop or sharpening was needed.
- Original PNGs have transparent corners. Very faint nonzero-alpha glow reaches some canvas edges; the complete canvas is retained rather than trimming this supplied detail.
