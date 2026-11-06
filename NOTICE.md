# Notice

This product is a derivative of [ClaytonPetrosian/opabrow](https://github.com/ClaytonPetrosian/opabrow),
used under the Mozilla Public License 2.0 (see LICENSE). All modified and MPL-covered source files
remain licensed under MPL-2.0; no upstream copyright or license notices have been removed.

Modifications made on 2026-11-06 (release v1.1.0):
- Rebranded to FloatPane: name, appId, window/menu/tray text, icons; upstream links and the
  upstream Google site-verification file removed; AppUserModelId unified.
- Pinned the package manager to pnpm 12.18.0 via the `packageManager` field.
- Windows installer: selectable installation directory (non-one-click NSIS wizard).
- Explicit light / dark / system theme (light by default), applied to UI and web content.
- Optional screen-capture protection via `BrowserWindow.setContentProtection`.
- Unified data directory (`FloatPane-data/`) for userData, session data, caches, cookies, temp,
  crash dumps and logs, with menu actions to open it or clear caches/cookies, and NSIS uninstall
  cleanup. New module: `src/main/dataPaths.ts`, `build/installer.nsh`.
- Tray-only mode: hidden from the taskbar, minimize/close hide the window, restore from tray.

Trademarks, logos and branding of the upstream project are not licensed under MPL-2.0 (Sec. 2.3);
this derivative therefore uses its own name and artwork.

Original source remains available under MPL-2.0 at the upstream repository.
