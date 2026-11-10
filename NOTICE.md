# Notice

This product is a derivative of [ClaytonPetrosian/opabrow](https://github.com/ClaytonPetrosian/opabrow),
used under the Mozilla Public License 2.0 (see LICENSE). All modified and MPL-covered source files
remain licensed under MPL-2.0; no upstream copyright or license notices have been removed.

Modifications made on 2026-11-06 (releases v1.1.0 through v1.1.5):
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
- v1.1.1 fixes from user testing: installer appends a product subdirectory to any chosen
  install path; platform-aware shortcut labels and title bar button placement; title bar and
  address bar now follow the light/dark theme; always-on-top is fully interactive by default,
  with an optional cursor-driven auto click-through mode. New module: `TESTING.md`.
- Release gating: publishing now requires a manual `workflow_dispatch` run with a verified tag.
- v1.1.2: fixed settings persistence (immediate writes, stable data directory, upgrade-safe
  uninstall), tray-level Quit with accidental-click protection, tray-level capture protection
  toggle, and real multi-tab support with a Tabs menu.
- v1.1.3: shortened tray Quit label, moved the capture-protection toggle back to the View
  submenu, added a responsive rounded-triangle opacity stepper for narrow windows, and
  redacted user data from native tray menus while capture protection is enabled.

Trademarks, logos and branding of the upstream project are not licensed under MPL-2.0 (Sec. 2.3);
this derivative therefore uses its own name and artwork.

Original source remains available under MPL-2.0 at the upstream repository.

- v1.1.4: reverted v1.1.3 menu data redaction; when capture protection is enabled on Windows,
  the tray context menu is rendered inside an application-owned BrowserWindow that is itself
  excluded from capture (`src/main/protectedTrayMenu.ts`). Main window capture protection
  verified by the user and left unchanged.
