# Build Resources

This directory contains build resources used by `electron-builder`.

## Required Icons

Replace these placeholder files with real icons before production builds:

| File | Platform | Format | Recommended Size |
|------|----------|--------|------------------|
| `icon.png` | Linux | PNG | 512×512 px |
| `icon.icns` | macOS | Apple Icon Image | 512×512 px (1024×1024 retina) |
| `icon.ico` | Windows | ICO | 256×256 px |

### Generating Icons

From a 1024×1024 PNG source:

```bash
# macOS .icns (requires macOS)
mkdir icon.iconset
sips -z 512 512 icon.png --out icon.iconset/icon_256x256.png
sips -z 1024 1024 icon.png --out icon.iconset/icon_512x512.png
iconutil -c icns icon.iconset -o icon.icns

# Windows .ico (requires ImageMagick)
convert icon.png -resize 256x256 icon.ico
```

### Current Status

- `icon.png` — placeholder (1×1 white pixel). Replace before production.
- `icon.icns` — not yet generated. electron-builder will use defaults.
- `icon.ico` — not yet generated. electron-builder will use defaults.
