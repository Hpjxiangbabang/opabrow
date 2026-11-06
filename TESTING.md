# 测试问题记录

本文件记录各版本的实测反馈、根因、修复决策与验收方式。开发闭环（typecheck / 单测 / 构建 / 打包）
只能保证代码可编译，界面与交互行为必须由人工实测确认。

## v1.1.0 — 用户实测反馈（2026-11-06，Windows）

| 编号 | 现象 | 根因 | 处理版本 |
| --- | --- | --- | --- |
| T-01 | 安装时选择 `D:\Program Files (x86)`，期望实际安装到 `D:\Program Files (x86)\FloatPane`，目录选择页显示的却只是父目录 | electron-builder assisted 安装器只在 `MUI_PAGE_INSTFILES` 的 PRE 回调里追加产品目录（`assistedInstaller.nsh` 的 `instFilesPre`），目录选择页所见并非最终路径 | v1.1.1 |
| T-02 | Windows 上仍显示 macOS 快捷键，例如「关闭窗口 (⌘W)」；标题栏控制按钮位置未适配平台习惯 | 菜单 accelerator 已用 `CmdOrCtrl`（Electron 会自动显示 Ctrl），但渲染层 tooltip 硬编码了 `⌘`；`.traffic-buttons` 固定在左侧，是 macOS 布局 | v1.1.1 |
| T-03 | 切到深色主题后地址栏仍是浅色，视觉刺眼 | `.titlebar` 背景写死 `rgba(246,248,251,.88)`，`.titlebar-address-*` 文字写死 `#354052`；另有数处 `color-mix` 把 `--ui-fg` / `--ui-bg` 用反 | v1.1.1 |
| T-04 | 开启「置顶」后窗口虽置顶，但无法交互 | `clickThrough` 默认 `true`，置顶即触发 `setIgnoreMouseEvents(true)` 全窗口穿透，仅标题栏 32px 区域临时恢复交互 | v1.1.1（含设计决策） |

> **修复状态**：T-01 ~ T-04 均已在 v1.1.1 完成代码修复，并通过 typecheck（exit 0）、
> 16 项单测、production build 与 Windows NSIS 打包。交互效果属于静态检查无法覆盖的部分，
> 仍需按下方验收方式人工确认后才可发布。

---

## T-04 置顶交互：调研与决策

### 用户期望

> 光标置于窗口内可以交互，光标在窗口外就不交互。

### 调研结论（2026-11-06）

1. **Electron 官方做法**（Custom Window Interactions 教程）：
   `setIgnoreMouseEvents(true, { forward: true })` 让窗口默认穿透但仍转发鼠标移动，
   渲染层用 `mouseenter` / `mouseleave` 或 `mousemove` 命中交互元素后，再 IPC 通知主进程
   `setIgnoreMouseEvents(false)`；移出后恢复穿透。核心模式是
   **「穿透为默认态，命中交互区时临时关闭穿透」**。
2. **现行浮层产品**（Electron overlay 实践、OverlayPic、Floaty、PowerToys Always On Top）：
   - 置顶本身**不改变交互性**（PowerToys / 画中画的普遍行为）；
   - 点击穿透是**显式可选开关**，不是置顶的副作用；
   - 工具栏普遍采用 hover 显现，穿透模式下仍保留可控的交互入口；
   - Linux 因 `forward` 不可靠，通常用主进程 `screen.getCursorScreenPoint()` 轮询兜底。
3. **本项目的硬约束**：网页由独立的 `WebContentsView` 承载，渲染层 DOM 不覆盖网页区域。
   `forward: true` 转发到的是主窗口 `webContents`，无法可靠覆盖 WebContentsView 的命中测试；
   而 `setIgnoreMouseEvents` 是窗口级 API，不能按区域控制。项目已有主进程屏幕坐标轮询
   （原用于标题栏 hover），是唯一能同时覆盖 UI 层与网页层的判定通道。

### 方案对比

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A. 置顶与穿透解耦 | `clickThrough` 默认关闭，穿透改为独立显式开关 | 改动最小、行为最可预测；符合 PowerToys / PiP 习惯 | 不实现「移出窗口自动穿透」 |
| B. 渲染层 forward 命中 | `forward:true` + DOM 命中交互元素动态切换 | 可精细到元素级，透明区域不误激活 | 对 `WebContentsView` 网页区域不可靠；Windows/macOS 行为有差异 |
| C. 主进程光标位置驱动 | 复用轮询，按整个窗口矩形判定：在内则完全可交互、在外则穿透 | 覆盖 UI 与网页两层；行为与用户描述完全一致；跨平台一致 | 矩形命中会把透明区域也算作窗口内；轮询有约 40ms 延迟 |

### 决策：**A + C 组合**

- **默认行为改为 A**：`clickThrough` 默认 `false`。开启「置顶」后窗口始终可交互，
  不再出现「置顶即无法点击」。这是用户反馈的直接根因。
- 「置顶时点击穿透」开关语义升级为 C：**「鼠标移出窗口时自动穿透」**。
  开启后由主进程轮询判定光标与窗口矩形的关系：
  - 光标在窗口内 → `setIgnoreMouseEvents(false)`，标题栏、地址栏、网页全部可交互；
  - 光标移出窗口 → `setIgnoreMouseEvents(true, { forward: false })`，事件落到下层应用；
  - 移出时加 120ms 延迟并二次确认，避免拖动窗口穿越边界时抖动。
- 标题栏 hover 显现逻辑保留，但不再用 `forceDisable` 做「仅标题栏可交互」。
- 选择 C 而非 B 的决定性理由是 `WebContentsView` 架构：渲染层拿不到网页区域的鼠标命中信息。

### 已知限制

- 矩形命中测试无法区分窗口内的透明像素，光标经过透明区域时窗口会短暂激活并阻挡下层点击；
  这是窗口级 API 的固有限制，若后续需要像素级精度，需改用 `forward:true` + 渲染层透明确区域上报。
- 轮询间隔 40ms，快速划过窗口时可能有可感知的激活延迟。
- 窗口在穿透状态下若保持键盘焦点，Electron 仍会接收键盘事件（框架行为）。

### 验收方式（人工）

1. 全新配置启动，开启「置顶」→ 地址栏可输入、网页可点击滚动、按钮可点。
2. 开启「鼠标移出窗口时自动穿透」→ 光标在窗口内可交互；移到下层应用可正常点击；移回窗口可立即恢复交互。
3. 置顶状态下拖动窗口跨越边界，不应出现穿透状态抖动。
4. 取消置顶后，穿透开关自动失效，窗口恢复普通交互。

---

## 其它三项的验收方式（人工）

- **T-01**：全新安装，目录选择页默认路径应已包含 `FloatPane` 子目录；手动改为
  `D:\Program Files (x86)` 后完成安装，实际文件应位于 `D:\Program Files (x86)\FloatPane`，
  父目录根部不出现散落的 exe / dll / pak。
- **T-02**：Windows 上 tooltip 显示 `Ctrl+W` / `Ctrl+Shift+G` 等；控制按钮组位于标题栏右侧，
  从右到左为「关闭、最小化、置顶」；macOS 上显示 `⌘W` 且按钮组仍在左侧。
- **T-03**：分别切到浅色 / 深色 / 跟随系统，标题栏、地址栏文字与底色、地址栏下拉建议、
  透明度滑块文字均随主题变化，无浅色残留或深底深字。
