<p align="center">
  <img src="./floatpane-icon.png" width="88" alt="FloatPane" />
</p>

<h1 align="center">FloatPane</h1>

<p align="center">A transparent floating browser. Keep a page close without giving up your desktop.</p>

<p align="center">
  <strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/Hpjxiangbabang/opabrow/releases">Download</a> ·
  <a href="https://github.com/Hpjxiangbabang/opabrow">Source</a> ·
  <a href="https://hpjxiangbabang.github.io/opabrow/">Website</a>
</p>

<p align="center">
  <img src="./site/assets/opabrow-preview.svg" width="720" alt="FloatPane preview" />
</p>

Most browsers take over the whole screen. FloatPane keeps just one page at the edge of your desktop — a reference, a dashboard, a video — while you work in another app. The frameless window is transparent, and its title bar appears only when the pointer reaches the top edge.

## Features

- Frameless transparent window with a hover-revealed title bar
- Adjustable opacity — slider on wide windows, compact stepper on narrow ones
- Always-on-top, optional auto click-through when the cursor leaves, and tray-only mode
- Light / Dark / System theme, applied to both the UI and web pages
- Screen-capture protection; on Windows the tray menu is protected as well
- Tabs from the menu, restored on restart, with no visible tab strip
- Address bar with local history suggestions, page find, downloads, session restore
- Bookmarks with Chrome / Safari / HTML import; passwords from a Chrome CSV, encrypted locally and filled only on request
- Mobile user-agent mode and automatic web-fullscreen for Bilibili videos
- Everything stays on this machine: no account, no cloud sync, no telemetry

## Download

Get the installer for Windows x64, macOS (arm64 / x64) or Linux x64 from [Releases](https://github.com/Hpjxiangbabang/opabrow/releases). The Windows installer lets you choose the install folder, and portable ZIP builds are available too. Binaries are unsigned, so your OS may ask for confirmation on first launch.

## Shortcuts

`CmdOrCtrl` means Ctrl on Windows / Linux and ⌘ on macOS.

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘+L` | Focus the address bar |
| `Ctrl/⌘+F` · `G` · `Shift+G` | Find · next · previous |
| `Ctrl/⌘+[` · `]` · `R` | Back · forward · reload |
| `Ctrl/⌘+Shift+H` | Open home page |
| `Ctrl/⌘+D` | Bookmark this page |
| `Ctrl/⌘+Shift+Y` · `Shift+J` | History · downloads |
| `Ctrl/⌘+Shift+P` | Fill a saved password |
| `Ctrl/⌘+T` | Toggle always-on-top |
| `Ctrl/⌘+=` · `-` | Adjust opacity |
| `Ctrl/⌘+K` | Command panel |
| `Ctrl/⌘+Shift+Space` | Show / hide window |
| `Ctrl/⌘+Shift+T` · `Shift+W` | New tab · close tab |
| `Ctrl/⌘+W` | Close window |

## Development

Requires Node.js 22+ and pnpm 12.18.0 (via corepack).

```bash
pnpm install
pnpm dev
pnpm typecheck && pnpm test && pnpm build
pnpm package:win:x64
```

Use `package:mac:arm64`, `package:mac:x64` or `package:linux:x64` for the other platforms.

## Credits

Based on [ClaytonPetrosian/opabrow](https://github.com/ClaytonPetrosian/opabrow) by Clayton Petrosian.

## License

[MPL-2.0](LICENSE).
