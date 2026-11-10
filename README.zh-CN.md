<p align="center">
  <img src="./floatpane-icon.png" width="96" alt="FloatPane 图标" />
</p>

<h1 align="center">FloatPane</h1>

<p align="center"><strong>透明浮层浏览器：把想看的网页留在手边，不占走整个桌面。</strong></p>

<p align="center">
  <a href="./README.md">English</a> · <strong>简体中文</strong> · <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MPL--2.0-3B82F6?style=flat-square" alt="MPL-2.0" /></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20macOS%20%7C%20Linux-111827?style=flat-square" alt="支持平台" />
  <img src="https://img.shields.io/badge/runtime-Electron%2043-47848F?style=flat-square&logo=electron" alt="Electron 43" />
  <img src="https://img.shields.io/badge/version-1.1.6-2EA44F?style=flat-square" alt="v1.1.6" />
</p>

<p align="center">
  <a href="https://github.com/Hpjxiangbabang/opabrow">源码仓库</a> ·
  <a href="https://github.com/Hpjxiangbabang/opabrow/releases">发布版本</a> ·
  <a href="https://hpjxiangbabang.github.io/opabrow/">落地页</a> ·
  <a href="CHANGELOG.md">更新日志</a>
</p>

<p align="center">
  <img src="./site/assets/opabrow-preview.svg" width="720" alt="FloatPane 界面预览" />
</p>

> FloatPane 是开源衍生项目：[ClaytonPetrosian/opabrow](https://github.com/ClaytonPetrosian/opabrow) → fork 仓库 [Hpjxiangbabang/opabrow](https://github.com/Hpjxiangbabang/opabrow) → 在该 fork 上做源码级二开并改名换标。完整来源说明见[致谢与来源](#致谢与来源)。

## 它是什么

多数浏览器会占满整个工作区。FloatPane 只给「一个网页」留一小块始终可见的位置：参考资料、实时看板、播放列表、视频页面，都能贴在屏幕边缘，你照常在别的应用里工作。无边框透明窗口默认隐藏标题栏，鼠标移到顶部边缘才显示；标题栏有独立的 32px 区域，显示控件时不会遮挡网页，也不会让页面重排。

| | |
| --- | --- |
| **为浮层而生** | 无边框透明窗口、悬停显示控件、可调透明度、可选置顶与仅托盘模式 |
| **本地优先** | 历史、收藏、密码、标签与设置都只存在本机；无账号、无遥测、无云端同步 |
| **隐私可控** | 显式浅色 / 深色 / 跟随系统主题、可选防屏幕捕获、统一数据目录 |

当前版本 **v1.1.5**（2026-11-10）。开发与实机验证集中在 **Windows x64**；macOS、Linux 有对应构建目标，但验证程度低于 Windows。

## 功能

### 窗口与外观

- **透明浮层**：无边框窗口，32px 标题栏悬停显示，网页内容始终从标题栏下方开始。
- **透明度调节**：宽窗口用拖动条；宽度 ≤760px 时自动切换为「圆角三角步进器 + 百分比数值」。箭头是内联 SVG，使用 `currentColor` 跟随主题，不依赖外部图片。
- **窗口置顶**：默认完全可交互。可另开「鼠标移出窗口时自动穿透」——光标在窗口内正常操作，移出后点击与滚动落到下层应用（主进程轮询光标位置，约 40ms 延迟）。
- **仅托盘模式**：窗口从任务栏隐藏，最小化与关闭改为隐藏；通过托盘图标或菜单恢复，托盘菜单中的「退出」才是真正退出。
- **显式主题**：浅色 / 深色 / 跟随系统，**默认浅色**。界面走 CSS 变量，网页通过 CDP `Emulation.setEmulatedMedia` 覆盖 `prefers-color-scheme`，选择会持久化。

### 浏览能力

- 紧凑地址栏，输入时给出最多 5 条本地历史建议，可拖拽调整长度；支持前进 / 后退 / 刷新 / 主页与自定义主页。
- **菜单式标签页**，不设可见标签栏：「标签」菜单列出全部标签可直接切换，并提供新建 / 关闭；重启后自动恢复（上限 20）。
- 页内查找、命令面板、手机 User-Agent 模式、右键菜单、下载进度、会话恢复（最后页面、窗口位置与尺寸、透明度、置顶、手机模式）。
- 本地历史（100 条）、收藏及 Chrome / Safari / HTML 书签导入；B 站视频页自动切换网页全屏（可关闭）。
- 更新检查读取数据目录下的 `update-source.json`，无需改代码即可切换 GitHub / GitLab 更新源；默认指向本 fork。

### 防屏幕捕获

在「视图」/ 托盘菜单开启，底层为 `BrowserWindow.setContentProtection`（Windows 对应 `WDA_EXCLUDEFROMCAPTURE`，macOS 对应 `NSWindowSharingNone`）。自 v1.1.4 起，Windows 下开启防捕获时会移除原生托盘右键菜单，改用应用自身、同样受保护的 `BrowserWindow` 承载菜单（`src/main/protectedTrayMenu.ts`），让菜单本身也进入捕获排除范围；v1.1.3 的「菜单数据脱敏」方案已撤销。macOS 保持原生菜单。

### 数据管理

- `src/main/dataPaths.ts` 把 `userData`、会话数据、缓存、临时文件、崩溃转储与日志统一重定向到单个目录：默认 `<appData>/FloatPane-data/`，也可用环境变量 `FLOATPANE_DATA_DIR` 指定。自 v1.1.2 起该位置与安装目录解耦，升级不再丢设置；旧便携目录数据会一次性迁移。
- 「视图」/ 托盘 → **数据管理**：打开数据目录、清除缓存与 Cookies。Windows 卸载脚本仅在检测到 `.floatpane-data` 标记时删除该目录；用户显式指定的自定义目录由用户自行管理。
- 密码经 Electron `safeStorage` 调用系统密钥库加密，只能由你主动选择 Chrome 导出的 CSV 导入，且仅在匹配的 HTTPS 站点上**手动触发**填充，绝不自动填充、绝不上传。
- 下载文件保留在系统「下载」目录，卸载时不会删除。

## 快捷键

快捷键统一使用 `CmdOrCtrl`：Windows / Linux 为 **Ctrl**，macOS 为 **⌘**。

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl/⌘+L` | 聚焦地址栏 |
| `Ctrl/⌘+F` · `Ctrl/⌘+G` · `Ctrl/⌘+Shift+G` | 页内查找 · 下一个 · 上一个 |
| `Ctrl/⌘+[` · `Ctrl/⌘+]` · `Ctrl/⌘+R` | 后退 · 前进 · 刷新 |
| `Ctrl/⌘+Shift+H` | 打开主页 |
| `Ctrl/⌘+D` | 收藏 / 取消收藏当前页面 |
| `Ctrl/⌘+Shift+Y` · `Ctrl/⌘+Shift+J` | 显示历史 · 显示下载 |
| `Ctrl/⌘+Shift+P` | 使用已保存密码填充当前页面 |
| `Ctrl/⌘+T` · `Ctrl/⌘+=` · `Ctrl/⌘+-` | 切换置顶 · 提高 / 降低透明度 |
| `Ctrl/⌘+K` · `Ctrl/⌘+Shift+Space` | 命令面板 · 显示 / 隐藏窗口 |
| `Ctrl/⌘+Shift+T` · `Ctrl/⌘+Shift+W` | 新建标签页 · 关闭当前标签页 |
| `Ctrl/⌘+W` | 关闭窗口（仅托盘模式下为隐藏） |

## 获取与安装

安装包通过 [GitHub Releases](https://github.com/Hpjxiangbabang/opabrow/releases) 分发。发布设有人工闸门：release 工作流只能通过 `workflow_dispatch` 手动触发并校验 tag，**推送标签不会自动创建 Release**。若某版本暂无资源，请按下节从源码构建。每个二进制产物都能在本仓库对应 tag 找到源码（MPL-2.0 §3.2(a)）。

| 平台 | 产物 | 说明 |
| --- | --- | --- |
| Windows x64 | `FloatPane-Setup-<版本>-x64.exe`（NSIS） | 多步安装向导，可自选安装目录；部分版本另提供免安装便携 ZIP，不写注册表、删除目录即清理 |
| macOS arm64 / x64 | `.dmg` | 未签名、未公证，首次启动需在系统设置中手动允许 |
| Linux x64 | `.AppImage` | 可放置到任意位置，无安装器 |

**所有二进制均未签名**：Windows SmartScreen / 智能应用控制、macOS Gatekeeper 可能提示或拦截；便携 ZIP 可用于隔离安装器相关问题。彻底消除提示需要有效的 Authenticode 或 Developer ID 证书。安装包目前仅覆盖 Windows x64，不含 ARM64 Windows。

## 从源码构建

环境要求：Node.js 22 及以上、pnpm 12.18.0（由 `packageManager` 固定，经 corepack 启用）、Electron 43。

```bash
git clone https://github.com/Hpjxiangbabang/opabrow.git
cd opabrow
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

```bash
pnpm typecheck                 # 主进程 + 渲染层 TypeScript 检查
pnpm test                     # Vitest：4 个逻辑模块、18 个用例
pnpm build                    # 产出 out/main、out/preload、out/renderer
pnpm package:win:x64          # 或 package:mac:arm64 / package:mac:x64 / package:linux:x64
```

技术栈：Electron 43 + React 19 + TypeScript 5 + electron-vite 5 / Vite 7 + electron-builder 26 + Vitest 4 + pnpm。主进程负责窗口、菜单、托盘、IPC 与本地存储；preload 通过 `contextBridge` 暴露 `window.opabrow`；渲染层负责标题栏与地址栏。运行时依赖仅 `csv-parse`、`lucide-react`、`parse5` 三个；无服务端、无账号体系、无授权校验、无遥测。

## 已知限制

- **防捕获是尽力而为**：在受支持平台上可让软件层面的截图、录屏、共享屏幕看不到窗口；无法阻止手机拍摄、采集卡或高权限捕获工具，Linux 支持有限。托盘图标由系统 Shell 渲染，无法纳入保护；Windows 自绘菜单会失去原生外观、键盘导航与无障碍能力，且仍需人工 GUI 验收。
- **没有插件机制**：不提供扩展 API、SDK 或配置驱动的扩展点，定制必须改源码后重新编译。`src/main/index.ts` 与 `src/renderer/src/App.tsx` 是单体大文件，合并上游更新的成本较高。
- **二进制未签名**，详见「获取与安装」。
- **自动化覆盖有限**：单测仅覆盖 4 个逻辑模块（18 个用例），没有 UI 或主进程的端到端测试；菜单与安装器行为记录在 [TESTING.md](TESTING.md)，仍需人工复测。NSIS 多用户安装模式问题（T-15）已定位根因，**决定暂不修、保留为已知问题**：切换安装模式后目录页不沿用先前路径，点「上一步」可能直接退出；安装配置维持 v1.1.5 现状。
- **不做反检测**：规避第三方会议软件检测的功能明确暂停，不在实现范围内。
- 验证以 Windows 为主；macOS / Linux 由构建配置产出，但未经同等程度的实机测试。

## 项目文档

| 文件 | 内容 |
| --- | --- |
| [CHANGELOG.md](CHANGELOG.md) | 从上游基线到 v1.1.5 的版本历史 |
| [TESTING.md](TESTING.md) | 实测问题、调研、验收步骤与已知问题 |
| [TODO.md](TODO.md) | 后续计划 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 提交 PR 前的约定 |
| [SECURITY.md](SECURITY.md) | 漏洞的私下报告方式 |
| [NOTICE.md](NOTICE.md) | 上游署名与修改清单 |
| [LICENSE](LICENSE) | MPL-2.0 全文 |
| [site/](site/) | 中 / 英 / 日三语落地页 |

## 致谢与来源

FloatPane **并非原创代码库**，而是源码级衍生版本。完整的 fork 链路如下：

| 环节 | 仓库 | 说明 |
| --- | --- | --- |
| **上游原作** | [ClaytonPetrosian/opabrow](https://github.com/ClaytonPetrosian/opabrow)，作者 Clayton Petrosian | 以 MPL-2.0 开源。基线为提交 `4bab39e`（上游 v1.0.0）。 |
| **我的 fork** | [Hpjxiangbabang/opabrow](https://github.com/Hpjxiangbabang/opabrow) | 维护者于 2026-11-06 从上游 fork，初始为零改动快照。GitHub 上的 fork 关系保留，因此仓库 URL 中仍带有 `opabrow`。 |
| **本产品** | **FloatPane**（即本仓库 `main` 分支） | 自 v1.1.0 起在上述 fork 上做源码级二开，使用独立的名称、`appId`（`com.floatpane.app`）、图标与美术资源。 |

**为何改名换标**：MPL-2.0 §2.3 不授予贡献者的商标、服务标记与 Logo 权利，因此衍生版使用独立品牌与原创图标，而不沿用上游标识。

**本 fork 新增的内容**（2026-11-06 起，v1.1.0 → v1.1.5）：改名换标与上游硬编码链接清理、固定 pnpm 版本、NSIS 可自选安装目录、显式主题、防屏幕捕获（含 Windows 自绘受保护托盘菜单）、统一且升级安全的数据目录、仅托盘模式、真实多标签页、设置持久化修复、响应式透明度控件，以及人工发布闸门。逐版本清单见 [CHANGELOG.md](CHANGELOG.md) 与 [NOTICE.md](NOTICE.md)。

**许可合规**：保留 [LICENSE](LICENSE) 全文与上游全部版权声明；被修改的 MPL 覆盖文件继续采用 MPL-2.0（§3.1），未删除任何声明（§3.4）。每个分发的二进制都能在本仓库对应 tag 取得源码（§3.2(a)）。未经修改的原始源码仍可在上游仓库获取。

**致谢**：感谢 Clayton Petrosian 及上游贡献者以 MPL-2.0 开源 opabrow，使本衍生版成为可能；同时感谢 Electron、React、TypeScript、Vite、electron-vite、electron-builder、Vitest、pnpm、`csv-parse`、`lucide-react`、`parse5` 等开源项目的维护者。

## 许可证

本项目采用 [Mozilla Public License 2.0](LICENSE) 发布。上游署名与修改清单见 [NOTICE.md](NOTICE.md)。FloatPane 的名称与图标独立于上游项目品牌。
