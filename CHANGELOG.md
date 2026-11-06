# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。所有版本基于 MPL-2.0 继续开源，
源码仓库：<https://github.com/Hpjxiangbabang/opabrow>。

## [1.1.0] - 2026-11-06

首个二次开发版本。基于上游 `ClaytonPetrosian/opabrow` 的 `4bab39e`（v1.0.0）快照。

### 新增
- **可自定义安装目录**：Windows NSIS 改为 `oneClick: false` + `allowToChangeInstallationDirectory: true`，
  安装向导提供目录选择页；macOS DMG / Linux AppImage 本身可任意放置。
- **统一数据目录与卸载清理**：新增 `src/main/dataPaths.ts`，在 `app.whenReady()` 之前把
  `userData` / `sessionData` / `cache` / `temp` / `crashDumps` / `logs` 全部重定向到单一
  `FloatPane-data/` 目录（优先 `FLOATPANE_DATA_DIR`，其次安装目录，最后 `%APPDATA%` 回退）。
  新增 `build/installer.nsh`，卸载时按 `.floatpane-data` 标记清除该目录。
  视图菜单 / 托盘菜单新增「数据管理」：查看与打开数据目录、清除缓存与 Cookies。
- **显式深浅色主题**：`ThemeMode = light | dark | system`，默认 `light`，不再跟随系统。
  主进程设置 `nativeTheme.themeSource`，并通过 CDP `Emulation.setEmulatedMedia` 覆盖网页
  `prefers-color-scheme`；渲染层用 CSS 变量切换界面配色。视图菜单 / 托盘菜单可切换，状态持久化。
- **防截屏 / 录屏 / 共享屏幕捕获**：视图菜单 / 托盘菜单开关，主进程调用
  `BrowserWindow.setContentProtection`，状态持久化并广播到渲染层。
- **仅托盘模式**：视图菜单 / 托盘菜单开关。开启后 `setSkipTaskbar(true)`，窗口从任务栏隐藏；
  最小化与关闭都改为隐藏，只能单击托盘图标或托盘菜单「显示 / 隐藏」恢复；托盘菜单「退出」
  才真正退出。托盘不可用时拒绝启用并提示。状态持久化。
- 三语落地页新增 v1.1.0 更新日志条目；日文 README 补齐功能说明。

### 变更
- 改名换标为 **FloatPane**（MPL-2.0 §2.3 不授予商标权）：`package.json`、`electron-builder.yml`
  （`appId: com.floatpane.app`）、窗口标题、全部菜单与托盘文案、URL scheme、图标全部重绘。
- 清理上游硬编码：默认主页、三语 README、落地页 HTML、sitemap/robots、release workflow 外链
  全部指向本 fork；删除 `site/googlecfa29d81ca4100e7.html`；新增 `NOTICE.md`（满足 §3.4）。
- 更新源改为 GitHub `Hpjxiangbabang/opabrow`；`packageManager` 固定 `pnpm@12.18.0`。
- 保留内部 `window.opabrow` API 名与 localStorage key，避免破坏契约与已有本地数据。
- `session.ts` 新增 `theme` / `contentProtection` / `trayOnlyMode` 字段与校验；单测 12 → 15 个用例；
  修正 `saveSession` 类型契约（实为 `Partial<SavedSession>` 补丁）。

### 限制
- 防捕获为「尽力而为」：无法阻止手机拍摄、采集卡、高权限捕获工具；Linux 支持有限。
- 下载文件仍保存在系统下载目录（属于用户资产，不随卸载删除）。
- 用 `FLOATPANE_DATA_DIR` 显式指定的自定义数据目录由用户自行管理，卸载脚本不触碰。
- 本版本尚未进行 GUI 交互实测，仅通过类型检查、单测、构建与打包验证。

## [1.0.0] - 上游基线

上游 `ClaytonPetrosian/opabrow` 的零改动快照（提交 `4bab39e`）。功能与变更见上游仓库。

[1.1.0]: https://github.com/Hpjxiangbabang/opabrow/releases/tag/v1.1.0
[1.0.0]: https://github.com/ClaytonPetrosian/opabrow
