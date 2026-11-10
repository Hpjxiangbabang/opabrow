# Changelog

本项目遵循 [语义化版本](https://semver.org/lang/zh-CN/)。所有版本基于 MPL-2.0 继续开源，
源码仓库：<https://github.com/Hpjxiangbabang/opabrow>。

## [1.1.5] - 2026-11-10

v1.1.4 用户实测反馈的小 bug 修复。诊断与验收见 [TESTING.md](TESTING.md)。

### 修复
- **T-16 自绘菜单最后一项看不到**：根因是窗口高度低估约 50px ——
  分隔线按 9px 计算（实际含 `margin-bottom` 与 `border-bottom` 约 15px），
  `.menu` 的 margin / padding / border 共 22px 只按 12px 计入。
  修正为 `SEPARATOR_HEIGHT=15`、`PADDING=30`；并在 `did-finish-load` 后测量
  `.menu` 的实际渲染高度重设窗口与位置，彻底消除计算偏差；
  高度上限改为所在显示器工作区高度，`.menu` 内部允许滚动兜底。
- **T-17 菜单窗口周围一圈灰边**：去掉 `.menu` 的 `box-shadow`（透明窗口上的模糊阴影
  会形成灰边），并为 `BrowserWindow` 增加 `hasShadow: false`、`thickFrame: false`、
  `backgroundColor: '#00000000'`，关闭 Windows DWM 默认阴影与无边框窗口的 thick frame。

### 已知问题（待用户确认方案，本版本未改安装配置）
- **T-15 多用户安装模式**：选择「为全部人安装」后，目录页不沿用「只为我安装」时选的路径；
  点「上一步」安装程序直接退出。根因是 electron-builder NSIS 模板在
  `InstallModeLeave` 里对非管理员进程执行 `UAC_RunElevated` + `Quit`，
  外层退出、内层提权重启，跨进程后 NSIS 变量（含 `$INSTDIR`）全部丢失；
  回到模式页时 PRE 再次进入提权分支。三个修复方案及取舍见 `TESTING.md` 的 T-15，
  待用户确认是否保留「为全部人安装」后再实施。
  **补充核查**：方案 C 受 electron-builder 模板硬约束，尝试性改动已完整回滚，
  详见 `TESTING.md` 的「T-15 补充：方案 C 的技术约束核查与回滚」。

### 项目决定
- **反检测功能暂停开发**：用户明确表示之前不知道它是风险项，只是想摸鱼。
  相关调研与边界说明保留在文档中，但不再推进实现，也不再就该方向安排工作。

### 验证
- typecheck 0 / 18 项单测 / build / Windows 打包；菜单 GUI 表现需人工复测。

## [1.1.4] - 2026-11-10

依据 v1.1.3 用户实测反馈修正 T-12 的实现方向。完整决策与验收见 [TESTING.md](TESTING.md)。

### 变更
- **撤销菜单数据脱敏（理解错误修正）**：v1.1.3 把收藏 / 历史 / 下载 / 密码菜单替换为占位项、
  标签只显序号，保护的是「数据」而非「窗口像素」，不符合用户「通过截图 / 录屏 / 共享屏幕
  根本捕获不到这个窗口」的诉求。本版本完全撤销脱敏，原生菜单恢复完整内容，标签恢复标题显示。
- **主窗口防捕获保持现状**：用户确认主窗口防捕获没问题。Windows 下
  `BrowserWindow.setContentProtection(true)` 对应 `WDA_EXCLUDEFROMCAPTURE`，软件层面的
  截图 / 录屏 / 共享屏幕中窗口不可见，不作改动。
- **托盘菜单改为方案 B（自绘受保护菜单窗口）**：新增 `src/main/protectedTrayMenu.ts`。
  防捕获开启时移除原生 `tray.setContextMenu`，改由托盘 `right-click` 弹出应用自己的
  `BrowserWindow`，该窗口同样 `setContentProtection(true)`，因此菜单本身也落在捕获排除范围内。
  - 按用户选择：**仅防捕获开启时启用**（关闭时回到原生菜单）、**精简一级菜单**。
  - 精简项：显示/隐藏、置顶、主题三态、标签列表（radio 可切换）、新建/关闭标签、
    打开数据目录、清除缓存与 Cookies、防捕获开关（可关闭以退出该模式）、退出。
    标签标题正常显示——窗口已受保护，不再需要数据脱敏。
  - 定位基于 `Tray.getBounds()` 与所在显示器工作区；支持失焦、ESC、点击项后关闭；
    深浅主题配色跟随 `nativeTheme`；动态文本全部 HTML 转义；页面完全自生成，不加载外部内容。
  - 仅 Windows 启用：macOS 状态栏菜单由 AppKit 管理，保持原生行为。
- preload 新增 `protectedTrayMenu.select/dismiss`，主进程 handler 校验请求来自菜单窗口本身；
  `will-quit` 时销毁菜单窗口。

### 已验证
- typecheck / 18 项单测 / build / Windows 打包；T-11 透明度响应式双方案由用户实测通过。

### 限制与待办
- 自绘菜单窗口的交互（定位、失焦关闭、多显示器）**尚未做 GUI 实测**，需人工验收。
- 失去原生菜单的系统外观、键盘导航与无障碍能力，这是方案 B 的固有代价。
- 「突破会议软件置顶识别」按用户选择**暂缓**：技术实质是规避第三方检测机制，
  需先明确具体软件、识别提示原文与使用场景后再判断可行边界，本版本未实现。

## [1.1.3] - 2026-11-07

修复 v1.1.2 用户实测反馈。问题记录、调研与方案对比见 [TESTING.md](TESTING.md)。

### 变更
- **T-09**：托盘一级「退出 FloatPane」精简为「退出」，收窄右键菜单宽度；macOS 应用菜单同步。
- **T-10**：移除托盘一级的「防止被截图 / 录屏 / 共享屏幕捕获」副本，归位「视图」二级菜单
  （该项本就存在于视图菜单，一级重复导致菜单过长）。
- **T-11 透明度控件响应式双方案**：宽度足够保留拖动条；`≤760px` 切换为
  「圆角三角箭头 + 百分比数值」步进器，共用同一 `opacity` 状态。
  箭头为内联 SVG `polygon` + `stroke-linejoin="round"` + `currentColor`，
  自动跟随 `--ui-fg` 深浅主题，无需外部素材、无版权与缓存负担。
  依据成熟设计补充了数值标签（纯左右箭头缺少当前值反馈）与 `aria-label` / 边界禁用。
- **T-12 防捕获结论修正与菜单脱敏**：上一轮将「`BrowserWindow.setContentProtection`
  不覆盖原生托盘菜单」误述为「Electron 无法保护托盘 UI」。准确机制是
  Windows `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)` / macOS
  `NSWindowSharingNone` 按窗口授予，原生菜单窗口只是没被该 API 传入 —— 属
  API 覆盖范围问题，可用工程手段解决。调研了三条路径（A 原生 FFI 覆盖菜单窗口、
  B 自绘受保护菜单窗口、C 数据脱敏），本版本落地 **C**：防捕获开启时，收藏 / 历史 /
  下载 / 密码菜单替换为占位项，标签项只显示序号，不再把用户数据交给系统渲染。
  A / B 属架构级改动（原生依赖或替换托盘交互模型），会改变菜单体验，
  待确认方向后再实施。托盘图标本身由系统 Shell 渲染，A / B 均覆盖不到，
  且仅托盘模式下必须保持可见。

### 已知环境问题（T-13，2026-11-07）
- 有用户反馈安装后 Windows 提示「此应用无法在你的电脑上运行」。已实测排除产物损坏、
  架构不匹配、安装包内容损坏、环境变量污染与本机智能应用控制；解压后的应用在本机可正常启动。
  最可能是文件传输截断或目标机器的未签名应用拦截策略。诊断过程、产物 SHA-256、
  分叉验证步骤与长期签名方案见 `TESTING.md` 的 T-13。
- 额外提供 `FloatPane-1.1.3-win-x64-portable.zip` 免安装便携版，用于绕过安装器与安装路径验证；
  不写注册表、不建快捷方式，删除目录即彻底清理。
- 两个 exe 均为未签名；若需消除 Smart App Control / SmartScreen 拦截，须使用有效的
  Authenticode 代码签名证书。本包仅支持 `x64`，不覆盖 ARM64 Windows。

### 限制
- 已通过 typecheck / 18 项单测 / build / Windows 打包；**尚未做 GUI 交互实测**，
  菜单宽度、窄窗口步进器、脱敏表现需按 `TESTING.md` 人工验收。
- 菜单脱敏保护的是数据，不是菜单窗口像素；若要让托盘菜单窗口本身免于被捕获，
  需采用 T-12 中的方案 A 或 B。

## [1.1.2] - 2026-11-06

修复 v1.1.1 用户实测反馈。问题记录、调研与验收方式见 [TESTING.md](TESTING.md)。

### 修复
- **T-05 用户设置丢失（最严重）**：
  - `SessionStore.update()` 取消 250ms 防抖，写入立即排队；新增 `flushSync()` 并在
    `before-quit` 同步落盘（Electron 退出不等待异步 Promise）。
  - 数据目录默认不再随安装目录走，改为固定 `appData/FloatPane-data`；启动时一次性迁移
    旧便携目录数据；`FLOATPANE_DATA_DIR` 仍可指定到 D 盘。
  - `customUnInstall` 检测 `${isUpdated}`，升级安装时旧卸载器跳过数据删除。
  - 主页与历史迁入主进程 `session.json`（`homeUrl` / `history` 字段），localStorage
    仅用于兼容与旧数据一次性迁移。
- **T-06 托盘退出**：移到一级菜单最底部 + 分隔线隔离；点击弹确认框（默认「取消」，
  可勾选「以后直接退出，不再提示」，状态持久化）。调研结论见 `TESTING.md`：
  不采用「最顶上」兜底，因为右键菜单第一项最容易误触。
- **T-07 托盘防截屏**：托盘一级新增「防止被截图 / 录屏 / 共享屏幕捕获」checkbox，
  与「视图」菜单共享状态。技术边界：托盘图标/菜单由系统 Shell 渲染，
  `setContentProtection` 无法保护托盘 UI 本身，这里提供的是开关入口。

### 新增
- **T-08 标签页**：新增「标签」一级菜单（与编辑/浏览/历史等同级）。二级菜单列出全部
  已打开标签（radio 切换）、分隔线、新建标签页 / 关闭当前标签页。主进程用
  `Map<id, WebContentsView>` 管理多视图，`webContentView` 始终指向活动视图；
  标签列表与活动标签持久化，重启恢复；切换时广播 `tabs-changed` 同步地址栏。
  不做可见标签栏，保持透明浮层窗口的极简定位。
- 快捷键：`Ctrl+Shift+T` 新建标签、`Ctrl+Shift+W` 关闭当前标签
  （`Ctrl+T` / `Ctrl+W` 已被置顶 / 关闭窗口占用，未改动既有习惯）。

### 限制
- 已通过 typecheck / 单测 / build / Windows 打包；**尚未做 GUI 交互实测**，
  升级不丢数据、退出确认、标签切换均需按 `TESTING.md` 人工验收。
- 首次启动恢复全部历史标签会同时加载多个页面，标签较多时启动略慢（上限 20）。

## [1.1.1] - 2026-11-06

修复 v1.1.0 用户实测反馈的四个问题。问题记录、调研与验收标准见 [TESTING.md](TESTING.md)。

### 修复
- **T-01 安装目录**：`build/installer.nsh` 新增 `customInit` 规范化 `$INSTDIR`，目录选择页默认即显示带 `FloatPane` 子目录的完整路径；用户改选任意父目录后，electron-builder 的 `instFilesPre` 仍会兜底追加，安装文件不再散落在父目录根部；目录页补充路径说明；卸载完成后移除空的产品目录。
- **T-02 平台适配**：渲染层 tooltip 按平台显示 `Ctrl+W` / `Ctrl+Shift+G`（macOS 仍为 `⌘W` / `⌘⇧G`）；Windows 上不再显示并不存在的「最小化」快捷键；标题栏控制按钮 macOS 靠左、Windows/Linux 靠右并反转组内顺序（关闭在最右）。`preload` 新增 `platform` 字段。
- **T-03 主题配色**：标题栏、地址栏文字与底色、下拉建议、透明度滑块全部改用 `--ui-fg` / `--ui-bg`，并修正数处前后景变量颠倒的 `color-mix`；深浅色切换不再有浅色残留或深底深字。
- **T-04 置顶交互**：`clickThrough` 默认改为 `false`，置顶不再附带全窗口穿透。「置顶时点击穿透」升级为「鼠标移出窗口时自动穿透」，由主进程按窗口矩形轮询判定（40ms 间隔、移出 120ms 延迟并二次确认）：光标在窗口内完全可交互，移出后事件落到下层应用。方案对比与决策依据见 `TESTING.md`。

### 其它
- `session.test.ts` 新增 1 个用例（15 → 16）；新增 `TESTING.md`。
- `release.yml` 改为仅 `workflow_dispatch` 触发，建立「实测后再发布」闸门；`v1.1.0` 标签已推送且未产生 Release。

### 限制
- 四项改动通过类型检查、单测、构建与打包验证，**尚未做 GUI 交互实测**，需按 `TESTING.md` 的验收方式人工确认。
- 自动穿透采用窗口矩形命中测试，透明区域也会触发激活，且约有 40ms 轮询延迟；这是窗口级 API 的固有限制。

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

[1.1.5]: https://github.com/Hpjxiangbabang/opabrow/releases/tag/v1.1.5
[1.1.4]: https://github.com/Hpjxiangbabang/opabrow/releases/tag/v1.1.4
[1.1.3]: https://github.com/Hpjxiangbabang/opabrow/releases/tag/v1.1.3
[1.1.2]: https://github.com/Hpjxiangbabang/opabrow/releases/tag/v1.1.2
[1.1.1]: https://github.com/Hpjxiangbabang/opabrow/releases/tag/v1.1.1
[1.1.0]: https://github.com/Hpjxiangbabang/opabrow/releases/tag/v1.1.0
[1.0.0]: https://github.com/ClaytonPetrosian/opabrow
