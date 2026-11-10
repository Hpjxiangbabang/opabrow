<p align="center">
  <img src="./floatpane-icon.png" width="96" alt="FloatPane icon" />
</p>

<h1 align="center">FloatPane</h1>

<p align="center"><strong>A transparent floating browser: keep one page close without giving up your desktop.</strong></p>

<p align="center">
  <strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a> · <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MPL--2.0-3B82F6?style=flat-square" alt="MPL-2.0" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-111827?style=flat-square" alt="Platforms" />
  <img src="https://img.shields.io/badge/runtime-Electron%2043-47848F?style=flat-square&logo=electron" alt="Electron 43" />
  <img src="https://img.shields.io/badge/version-1.1.6-2EA44F?style=flat-square" alt="v1.1.6" />
</p>

<p align="center">
  <a href="https://github.com/Hpjxiangbabang/opabrow">Source</a> ·
  <a href="https://github.com/Hpjxiangbabang/opabrow/releases">Releases</a> ·
  <a href="https://hpjxiangbabang.github.io/opabrow/">Landing page</a> ·
  <a href="CHANGELOG.md">Changelog</a>
</p>

<p align="center">
  <img src="./site/assets/opabrow-preview.svg" width="720" alt="FloatPane interface preview" />
</p>

> FloatPane is an open-source derivative: [ClaytonPetrosian/opabrow](https://github.com/ClaytonPetrosian/opabrow) → fork [Hpjxiangbabang/opabrow](https://github.com/Hpjxiangbabang/opabrow) → source-level customization and rebranding. Full attribution in [Credits & origin](#credits--origin).

## What it is

Most browsers ask for a whole workspace. FloatPane gives a single page a small, always-available place at the edge of the screen — a reference document, a live dashboard, a playlist, a video — while you keep working in another application. The frameless transparent window reveals its own 32px title bar only when the pointer reaches the top edge, so showing the controls never covers or reflows the page.

| | |
| --- | --- |
| **Floating by design** | Frameless transparent window, hover-revealed controls, adjustable opacity, optional always-on-top and tray-only mode |
| **Local-first** | History, bookmarks, passwords, tabs and settings stay on this machine; no account, no telemetry, no cloud sync |
| **Privacy controls** | Explicit light / dark / system theme, optional screen-capture protection, one consolidated data directory |

Current version: **v1.1.5** (2026-11-10). Development and hands-on validation are concentrated on **Windows x64**; macOS and Linux build targets exist but have not been validated to the same extent.

## Features

### Window and appearance

- **Transparent overlay** — frameless window with a 32px title bar that appears on hover; the webview always starts below it.
- **Opacity control** — slider on wide windows, automatically replaced by a rounded-triangle stepper with a percentage readout at widths of 760px or less; arrows are inline SVG using `currentColor`, so they follow the active theme without external assets.
- **Always-on-top** — fully interactive by default. Optionally enable "auto click-through when the cursor leaves the window": the pointer is interactive inside the window, while clicks and scrolling outside it pass through to the application below (main-process cursor polling, ~40ms).
- **Tray-only mode** — hides the window from the taskbar; minimize and close become hide; the tray icon or menu restores it. "Quit" in the tray menu is the real exit.
- **Explicit theme** — Light / Dark / Follow system, **Light by default**. Applied to the app UI via CSS variables and to web content via CDP `Emulation.setEmulatedMedia`. The choice persists.

### Browsing

- Compact address bar with up to five local-history suggestions, drag-resizable, plus back / forward / reload / home and a custom home page.
- **Tabs through the menu**, without a visible tab strip: the Tabs menu lists open tabs for switching, and new / close actions are one click away. Tabs are restored on restart (limit 20).
- Page find, command panel, mobile user-agent mode, right-click menu, download progress and session restore (last page, window geometry, opacity, always-on-top, mobile mode).
- Local history (100 entries), bookmarks with Chrome / Safari / HTML import, and automatic web-fullscreen for Bilibili video pages (can be disabled).
- Update checks read `update-source.json` in the data directory, so the GitHub / GitLab source can be changed without recompiling; the default points at this fork.

### Screen-capture protection

Toggled from View / tray menu, backed by `BrowserWindow.setContentProtection` (Windows: `WDA_EXCLUDEFROMCAPTURE`; macOS: `NSWindowSharingNone`). Since v1.1.4, when protection is enabled on Windows the native tray context menu is replaced by an application-owned, equally protected `BrowserWindow` (`src/main/protectedTrayMenu.ts`), so the menu itself is excluded from capture as well. The v1.1.3 approach of redacting menu data was reverted. macOS keeps its native menu.

### Data handling

- `src/main/dataPaths.ts` redirects `userData`, session data, cache, temp, crash dumps and logs into a single directory: `<appData>/FloatPane-data/` by default, or the path given in `FLOATPANE_DATA_DIR`. Since v1.1.2 this location is independent of the install directory, so upgrades do not lose settings; old portable data is migrated once.
- View / tray → **Data management**: open the data directory, clear cache and cookies. The Windows uninstaller removes the directory only when its `.floatpane-data` marker is present; an explicit custom directory stays under your control.
- Passwords are encrypted with the OS keystore through Electron `safeStorage`, imported only from a Chrome-exported CSV you explicitly choose, and filled **only on your command** at a matching HTTPS origin — never automatically, never uploaded.
- Downloaded files remain in the OS Downloads folder and are never removed by the uninstaller.

## Keyboard shortcuts

Shortcuts use `CmdOrCtrl`: **Ctrl** on Windows / Linux, **⌘** on macOS.

| Shortcut | Action |
| --- | --- |
| `Ctrl/⌘+L` | Focus the address bar |
| `Ctrl/⌘+F` · `Ctrl/⌘+G` · `Ctrl/⌘+Shift+G` | Find in page · next · previous |
| `Ctrl/⌘+[` · `Ctrl/⌘+]` · `Ctrl/⌘+R` | Back · forward · reload |
| `Ctrl/⌘+Shift+H` | Open the home page |
| `Ctrl/⌘+D` | Add / remove the current bookmark |
| `Ctrl/⌘+Shift+Y` · `Ctrl/⌘+Shift+J` | Show history · show downloads |
| `Ctrl/⌘+Shift+P` | Fill the current page from a saved password |
| `Ctrl/⌘+T` · `Ctrl/⌘+=` · `Ctrl/⌘+-` | Toggle always-on-top · increase / decrease opacity |
| `Ctrl/⌘+K` · `Ctrl/⌘+Shift+Space` | Command panel · show / hide window |
| `Ctrl/⌘+Shift+T` · `Ctrl/⌘+Shift+W` | New tab · close current tab |
| `Ctrl/⌘+W` | Close window (hides it in tray-only mode) |

## Getting the app

Installers are distributed through [GitHub Releases](https://github.com/Hpjxiangbabang/opabrow/releases). Publishing is deliberately gated: the release workflow only runs on manual `workflow_dispatch` with a verified tag, so pushing a tag does **not** create a release. If no asset is listed for a version, build it from source as described below. Every binary corresponds to a tagged source state in this repository (MPL-2.0 §3.2(a)).

| Platform | Artifact | Notes |
| --- | --- | --- |
| Windows x64 | `FloatPane-Setup-<version>-x64.exe` (NSIS) | Multi-step wizard with a selectable install directory; portable ZIP builds are also produced for some versions and leave no registry entries |
| macOS arm64 / x64 | `.dmg` | Unsigned and not notarized; Gatekeeper requires manual approval on first launch |
| Linux x64 | `.AppImage` | Place anywhere; no installer |

**All binaries are unsigned.** Windows SmartScreen / Smart App Control and macOS Gatekeeper may warn or block an unsigned app; a portable ZIP can be used to isolate installer-related issues. Removing that warning requires a valid Authenticode or Developer ID certificate. Only Windows x64 is covered by the installers; ARM64 Windows is not.

## Build from source

Requirements: Node.js 22 or later, pnpm 12.18.0 (pinned by `packageManager`, enabled through corepack), Electron 43.

```bash
git clone https://github.com/Hpjxiangbabang/opabrow.git
cd opabrow
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

```bash
pnpm typecheck                 # node + web TypeScript checks
pnpm test                     # Vitest: 18 tests across 4 logic modules
pnpm build                    # out/main, out/preload, out/renderer
pnpm package:win:x64          # or package:mac:arm64 / package:mac:x64 / package:linux:x64
```

Stack: Electron 43 + React 19 + TypeScript 5 + electron-vite 5 / Vite 7 + electron-builder 26 + Vitest 4 + pnpm. The main process owns windows, menus, tray, IPC and local storage; the preload exposes `window.opabrow` through `contextBridge`; the renderer owns the title bar and address bar. Runtime dependencies are limited to `csv-parse`, `lucide-react` and `parse5`. There is no server, account system, license check or telemetry.

## Known limitations

- **Capture protection is best-effort.** It removes the window from software screenshots, recording and screen sharing on supported platforms; it cannot stop a physical camera, a capture card or privileged capture tools. Linux support is limited. The tray icon is rendered by the OS shell and cannot be protected. The self-drawn Windows menu loses native appearance, keyboard navigation and accessibility, and needs manual GUI verification.
- **No plugin system.** There is no extension API, SDK or configuration-driven extension point: customization means editing the source and rebuilding. `src/main/index.ts` and `src/renderer/src/App.tsx` are large single files, which makes merging upstream changes costly.
- **Unsigned binaries**, as described above.
- **Test coverage is narrow.** Automated tests cover four logic modules (18 cases); there is no UI or main-process end-to-end suite. Menu and installer behaviour is tracked in [TESTING.md](TESTING.md) and still requires manual verification. The NSIS multi-user install mode issue (T-15) is diagnosed and deliberately kept as a known issue: switching install modes does not carry over the chosen path and "Back" may exit the wizard. The installer configuration remains as shipped in v1.1.5.
- **Anti-detection is out of scope.** Evading detection by third-party meeting software is deliberately not implemented.
- Validation is Windows-centric; macOS and Linux builds are produced by CI configuration but have not received equivalent hands-on testing.

## Project documents

| File | Contents |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | Version history from the upstream baseline to v1.1.5 |
| [TESTING.md](TESTING.md) | User test findings, investigations, acceptance steps and known issues |
| [TODO.md](TODO.md) | Backlog and direction |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Guidance before opening a pull request |
| [SECURITY.md](SECURITY.md) | Private vulnerability reporting |
| [NOTICE.md](NOTICE.md) | Upstream attribution and modification log |
| [LICENSE](LICENSE) | Full text of MPL-2.0 |
| [site/](site/) | Trilingual landing pages |

## Credits & origin

FloatPane is **not an original codebase**. It is a source-level derivative, and the fork chain is:

| Stage | Repository | Details |
| --- | --- | --- |
| **Upstream project** | [ClaytonPetrosian/opabrow](https://github.com/ClaytonPetrosian/opabrow) by Clayton Petrosian | Released under MPL-2.0. Baseline is commit `4bab39e` (upstream v1.0.0). |
| **This fork** | [Hpjxiangbabang/opabrow](https://github.com/Hpjxiangbabang/opabrow) | The maintainer forked the upstream repository on 2026-11-06 as a zero-change snapshot. The GitHub fork relationship is retained, which is why the repository URL still contains `opabrow`. |
| **This product** | **FloatPane** (this repository, `main`) | Source-level customization of that fork from v1.1.0 onward, with its own name, `appId` (`com.floatpane.app`), icons and artwork. |

**Why the rename.** MPL-2.0 §2.3 does not grant rights to the contributor's trademarks, service marks or logos. The derivative therefore uses an independent name and original artwork rather than the upstream brand.

**What was added in this fork** (since 2026-11-06, v1.1.0 → v1.1.5): rebranding and hardcoded-link cleanup, pinned pnpm version, selectable NSIS install directory, explicit theme, screen-capture protection (including the protected self-drawn tray menu on Windows), a unified and upgrade-safe data directory, tray-only mode, real multi-tab support, settings persistence fixes, responsive opacity control, and a manual release gate. The complete, version-by-version list is in [CHANGELOG.md](CHANGELOG.md) and [NOTICE.md](NOTICE.md).

**License compliance.** The full [LICENSE](LICENSE) and all upstream copyright notices are retained; modified MPL-covered files remain under MPL-2.0 (§3.1) and no notices were removed (§3.4). Source for every distributed binary is available in this repository at the matching tag (§3.2(a)). The original, unmodified source remains available at the upstream repository.

**Thanks** to Clayton Petrosian and the upstream contributors for releasing opabrow under MPL-2.0, which made this derivative possible; and to the maintainers of Electron, React, TypeScript, Vite, electron-vite, electron-builder, Vitest, pnpm, `csv-parse`, `lucide-react` and `parse5`.

## License

Released under the [Mozilla Public License 2.0](LICENSE). See [NOTICE.md](NOTICE.md) for the upstream attribution and the list of modifications. The FloatPane name and artwork are independent of the upstream project's branding.
