# Electron Desktop App

session2skills can be packaged as a standalone desktop application using Electron.

## Prerequisites

- Node.js ≥ 20
- npm dependencies installed (`npm install`)
- Native modules rebuilt for Electron (`npx @electron/rebuild`)

## Building

### All Platforms

```bash
npm run electron:build
```

This runs the full pipeline:
1. Builds the CLI backend (`npm run build`)
2. Builds the Web UI (`npm run build:web`)
3. Compiles Electron main process TypeScript
4. Packages the app with electron-builder

### Platform-Specific Builds

```bash
npm run electron:build:mac      # macOS .dmg + .zip
npm run electron:build:win      # Windows NSIS installer
npm run electron:build:linux    # Linux AppImage + .deb
```

### Output

Build artifacts are written to the `release/` directory:

```
release/
├── mac-arm64/          # macOS ARM64 (Apple Silicon)
│   └── session2skills.app
├── session2skills-0.1.0-arm64.dmg
├── session2skills-0.1.0-arm64-mac.zip
├── session2skills Setup 0.1.0.exe   # Windows
└── session2skills-0.1.0.AppImage    # Linux
```

## Development

Launch the Electron app in development mode (no packaging):

```bash
npm run electron:dev
```

This builds everything and runs the Electron main process directly.

## App Icons

Placeholder icons are in `electron/build-resources/`. Replace them before production builds:

| File | Platform | Format |
|------|----------|--------|
| `icon.png` | Linux | 512×512 PNG |
| `icon.icns` | macOS | Apple Icon Image |
| `icon.ico` | Windows | 256×256 ICO |

See `electron/build-resources/README.md` for icon generation instructions.

## Smoke Test

After building, verify the packaged app launches correctly:

```bash
npm run electron:smoke
```

This launches the app, waits for the embedded Hono server to respond on `/api/health`, then exits. Requires a display (use Xvfb on headless Linux).

## Architecture

The Electron app embeds the existing Hono web server:

1. `electron/main.ts` — Main process: starts the Hono server, creates a `BrowserWindow`
2. `electron/preload.ts` — Preload script: exposes `session2skills` API via `contextBridge`
3. `electron/settings.ts` — Persists user settings (project directory, LLM config) to `userData/settings.json`
4. The BrowserWindow loads `http://localhost:<port>` from the embedded server

## Native Modules

`better-sqlite3` is a native C++ module that must be compiled against Electron's Node ABI. After installing dependencies:

```bash
npx @electron/rebuild
```

This rebuilds `better-sqlite3` (and any other native modules) for the Electron runtime.

## Known Limitations

### Unsigned Builds

macOS builds are **not code-signed**. When opening the `.dmg` or `.app` for the first time:

1. macOS will show "session2skills can't be opened because it is from an unidentified developer"
2. Right-click the app → Open → Open (bypasses Gatekeeper)
3. Or: `xattr -cr /path/to/session2skills.app`

To enable code signing, set these environment variables before building:

```bash
export CSC_NAME="Developer ID Application: Your Name (TEAM_ID)"
# or
export CSC_LINK="/path/to/certificate.p12"
export CSC_KEY_PASSWORD="certificate-password"
```

### Auto-Update

Auto-update is not yet implemented. Users must download new versions manually.

### Windows/Linux Cross-Compilation

Building Windows installers on macOS requires additional tooling (Wine for NSIS). For reliable cross-platform builds, use CI (GitHub Actions with matrix strategy).

## Configuration

The Electron app reads settings from `<userData>/settings.json`:

```json
{
  "projectDirectory": "/path/to/your/project",
  "llmBaseUrl": "https://api.example.com/v1",
  "llmModel": "gpt-4o",
  "llmApiKey": "sk-...",
  "adapter": "sdk"
}
```

`<userData>` is:
- macOS: `~/Library/Application Support/session2skills/`
- Windows: `%APPDATA%/session2skills/`
- Linux: `~/.config/session2skills/`
