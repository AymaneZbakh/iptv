# MPV IPTV Player

A desktop IPTV player built with **Electron + React + MPV**. Supports HLS/MPEG-TS streams in the browser, and native MPV playback for streams that CORS blocks.

---

## Download (Windows .exe)

👉 Go to the [**Releases**](../../releases) tab and download the latest `MPV-IPTV-Player-Setup-x.x.x.exe`

---

## Features

- 📺 **Dual player modes** — Web player (HLS.js / mpegts.js) + native MPV subprocess
- 🔑 **MPV bypasses CORS** — plays streams that the browser blocks
- 📋 **M3U playlist manager** — load from URL or upload a file
- 📡 **EPG program guide** — XMLTV support with synthetic fallback
- ⭐ Favorites, 🕐 Recents, 🔍 Search, 📂 Category filters
- ⌨️ MPV keyboard shortcuts: `Space`, `F`, `M`, `9/0`, `I`, `[/]`
- 📥 Export full playlist as `.m3u` for external players

---

## Run Locally (Development)

**Prerequisites:** Node.js 18+, Git

```bash
git clone https://github.com/YOUR_USERNAME/mpv-iptv-player.git
cd mpv-iptv-player
npm install
npm run dev          # Web-only mode (browser at http://localhost:3000)
npm run dev:electron # Full Electron app
```

For native MPV in dev mode, place `mpv.exe` in the `mpv-bin/` folder  
or ensure `mpv` is on your system PATH.

---

## Build the .exe Yourself

```bash
npm run build:electron
# Output: release/MPV-IPTV-Player-Setup-1.0.0.exe
```

---

## Trigger a Release via GitHub

1. Push a version tag:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```
2. GitHub Actions automatically builds and publishes the `.exe` to the Releases page.

---

## MPV Setup

The installer bundles `mpv.exe` automatically. If it's missing, download from:  
👉 https://mpv.io/installation/

Place `mpv.exe` in:
- `C:\Program Files\MPV IPTV Player\resources\mpv-bin\mpv.exe` (installed)
- Or anywhere on your system `PATH`
