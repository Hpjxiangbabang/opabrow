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

---

## v1.1.1 — 用户实测反馈（2026-11-06，Windows）

| 编号 | 现象 | 根因 | 处理版本 |
| --- | --- | --- | --- |
| T-05 | 深色主题、自定义主页未保存；历史有时保存，更新后又没了 | ① `SessionStore` 用 250ms 防抖且退出时 `flush()` 未等待，最后一次写入常丢失；② 数据目录默认随安装目录走，升级时安装路径变化 + 旧卸载器先删除数据目录，导致全部数据丢失；③ 主页与历史存在渲染层 localStorage，随 userData 路径漂移 | v1.1.2 |
| T-06 | 托盘右键「退出」藏在「窗口」二级菜单，希望能直达一级但防止误触 | 退出项位于 `trayWindowMenu` 子菜单 | v1.1.2（含设计决策） |
| T-07 | 托盘右键希望也能切换「防止被截图 / 录屏 / 共享屏幕捕获」 | 该开关仅在「视图」二级菜单 | v1.1.2 |
| T-08 | 需要标签页功能 | 上游仅支持单个 `WebContentsView` | v1.1.2（含设计决策） |

> **修复状态**：T-05 ~ T-08 均已在 v1.1.2 完成代码修复，通过 typecheck / 单测 / build / Windows 打包。
> 交互与升级行为仍需人工验收。

### T-05 数据丢失：修复决策

- **立即落盘**：`SessionStore.update()` 去掉 250ms 防抖，写入按串行队列立即执行；
  新增 `flushSync()`，`before-quit` 同步写入（Electron 不会等待异步 Promise 就结束进程）。
- **数据目录稳定化（设计变更）**：默认不再跟随安装目录，改用固定的
  `appData/FloatPane-data`。这是数据丢失的结构性根因：程序目录会随升级变化，且旧卸载器
  会删除其中的数据。启动时一次性把旧便携目录（安装目录下 `FloatPane-data`）迁移到新目录。
  `FLOATPANE_DATA_DIR` 环境变量仍可把数据放到 D 盘任意位置。
- **升级保护**：`customUnInstall` 检测 `${isUpdated}`，升级安装时旧卸载器跳过数据删除；
  只有用户主动卸载才清理。
- **主页与历史改为单一数据源**：迁入主进程 `session.json`（新增 `homeUrl` / `history` 字段），
  localStorage 仅保留写入兼容与旧数据一次性迁移。所有用户数据集中在一个目录，升级、卸载、
  备份都可控。

### T-06 托盘「退出」：调研与决策

调研来源：TrayMenu 完整设计指南、UX StackExchange 系统托盘讨论、Electron 官方 Tray 教程、
主流 Electron 托盘应用实践。结论：

- **Quit 放一级菜单最底部并用分隔线隔离**；高频操作放顶部；仅对破坏性操作加确认。
- Electron 官方示例把 `{ role: 'quit' }` 放在菜单最后且前面有 separator。
- 常见模式是菜单第一项为 disabled 的应用名做视觉标识，退出在末尾。

**决策：不采用「放一级目录最顶上」的兜底方案。** 右键菜单在光标位置展开，第一项恰好
最容易误触，与防误触目标冲突。采用：一级菜单最底部 + 分隔线隔离 + 确认对话框
（默认焦点「取消」、提供「以后直接退出，不再提示」持久化开关）。既满足「一级直达」，
又把误触代价降为一次可取消的确认。

### T-07 托盘防截屏：实现与技术边界

- 托盘右键一级新增「防止被截图 / 录屏 / 共享屏幕捕获」checkbox，调用同一个
  `applyContentProtection()`，与「视图」菜单状态实时同步。
- **表述修正（v1.1.3，见 T-12）**：原文写「Electron 无法保护托盘 UI」**不严谨**。
  准确说法是：`BrowserWindow.setContentProtection()` 这一特定 API 只覆盖
  BrowserWindow / BaseWindow 持有的原生窗口（Windows 为
  `SetWindowDisplayAffinity(WDA_EXCLUDEFROMCAPTURE)`，macOS 为 `NSWindowSharingNone`），
  原生托盘菜单窗口不在其参数范围内。这是 **API 覆盖范围问题，不是物理限制**，
  可以用工程手段解决。开启后托盘图标仍必须可见，否则仅托盘模式下无法恢复窗口。

### T-08 标签页：解读与设计决策

**需求解读**：用户原话「我们不同的是只放在托盘右键」（语音转写为「只防止」），
结合「和现在的 编辑 浏览 历史 下载 收藏 密码 视图 窗口 同级」，
理解为：本应用是极简透明浮层，**不引入可见标签栏**，而是通过托盘右键新增「标签」
一级菜单管理标签页；二级菜单列出已打开标签、分隔线、再放「新建标签页」。

**成熟设计参考**：macOS「窗口」菜单列出已打开窗口 + 分隔线 + 新建类命令；
Chrome / Firefox 的标签管理扩展（如 Tab Menu）把全部标签平铺为可点击列表；
Firefox 交互热力图显示标签栏是最高频区域，但浮层窗口无法容纳常驻标签栏，
故用菜单列表替代。

**实现**：
- 新增多 `WebContentsView` 管理（`tabViews` Map + `activeTabId`）。关键设计是让全局变量
  `webContentView` 始终指向当前活动视图，使现有约 25 处 `webContentView.webContents.xxx()`
  调用自动作用于当前标签，避免逐一改造。
- 「标签」菜单：所有已打开标签以 radio 列出可切换，分隔线后为「新建标签页」
  「关闭当前标签页」；关闭最后一个标签时自动回退到主页新建标签。
- 标签列表与活动标签持久化到 `session.json`，启动时恢复；切换时广播 `tabs-changed`
  让渲染层同步地址栏。
- **快捷键冲突**：浏览器惯例 `Ctrl+T` / `Ctrl+W` 已被本项目的「切换置顶」「关闭窗口」
  占用，重映射会破坏既有习惯。本版本用 `Ctrl+Shift+T` / `Ctrl+Shift+W`，
  后续版本可评估把置顶改为其它组合后回归浏览器惯例。

### 验收方式（人工）

1. 设置深色主题 + 自定义主页 + 访问若干页面，立即正常退出再启动，三项均应保留。
2. 安装 v1.1.2 覆盖 v1.1.1（可换安装目录），旧主题/主页/历史/标签应完整保留；
   主动卸载时才清空数据目录。
3. 托盘右键一级最底部点「退出」→ 出现确认框且默认「取消」；勾选「不再提示」后
   下次直接退出；「窗口」二级里不再有退出项。
4. 托盘右键一级切换防截屏 → 「视图」菜单里的勾选项同步变化。
5. 「标签」菜单新建多个标签、分别访问不同网站、切换后地址栏与页面同步；
   关闭最后一个标签应自动新建主页标签；重启后标签列表恢复。

---

## v1.1.2 — 用户实测反馈（2026-11-06，Windows）

| 编号 | 现象 | 处理版本 |
| --- | --- | --- |
| T-09 | 托盘一级「退出 FloatPane」过长，把右键菜单撑宽 | v1.1.3：精简为「退出」两字（macOS 应用菜单同步） |
| T-10 | 「防止被截图/录屏/共享屏幕捕获」在托盘一级与视图菜单重复 | v1.1.3：移除托盘一级副本，归位「视图」二级 |
| T-11 | 窗口调窄后透明度拖动条整块消失，希望保留两种呈现 | v1.1.3：宽 → 滑块；窄 → 圆角三角步进器（含数值） |
| T-12 | 质疑上一轮「setContentProtection 技术边界」结论，认为应当用技术解决 | v1.1.3：修正表述、调研方案、落地菜单脱敏 |

> **修复状态**：T-09 ~ T-12 均已在 v1.1.3 完成，typecheck（exit 0）/ 18 项单测 /
> production build / Windows NSIS 打包全部通过，产物 `FloatPane-Setup-1.1.3-x64.exe`。
> 交互效果（菜单宽度、窄窗口步进器、脱敏表现）仍需按下方验收方式人工确认。

### T-11 透明度控件：调研与决策

调研来源：滑块替代控件的 UX 指南（Code Canel）、Mobbin Stepper 设计词汇表、
响应式 stepper/slider 实践。成熟设计的结论：

- **窄容器会压缩数值的物理距离，使精确选择变困难**， slider 不再合适；
  替代方案包括更少档位、预设按钮、数值输入、以及 **stepper（步进器）**。
- Stepper 适用于「小增量、设置与偏好」场景（本项目透明度正是 0.1~1.0、步长 0.1）。
- **关键改进**：Mobbin 的分类指出，除「字号调整」这类有即时视觉反馈的场景外，
  stepper 应保留数值标签。用户设想的「只有左右两个箭头」缺少当前值反馈，
  因此落地为 `◀ 85% ▶`，即圆角三角按钮 + 百分比数值。

**素材怎么找、怎么用（回答用户提问）**：不需要找外部图片素材，也不需要新增图标文件。

1. **内联 SVG + `currentColor`（本版本采用）**：`<polygon>` 画三角，
   `stroke-linejoin="round"` / `stroke-linecap="round"` 得到圆角；
   `fill`/`stroke` 用 `currentColor`，自动继承 `--ui-fg`，浅色/深色主题同步变化。
   优点是矢量、零资源文件、零版权问题、不产生 C 盘缓存，且随主题实时切换。
2. **现成图标库**：项目已装 `lucide-react`，可用 `ChevronLeft/Right`（V 形）或
   `Play`（实心三角）旋转 180°，但不是圆角三角；适合愿意接受折线风格的场景。
3. **图标站点下载 SVG**（Lucide / Heroicons / Tabler）：需关注许可证声明与
   深浅色两套资源，维护成本更高，本项目不采用。

使用要点：按钮必须有 `aria-label`（SVG 设 `aria-hidden="true"`），
到边界时 `disabled`，点击区域不小于 22×22px，且 `-webkit-app-region: no-drag`
以免触发窗口拖动。

### T-12 托盘菜单防捕获：结论修正与技术方案

**用户质疑成立。** 上一轮把「`BrowserWindow.setContentProtection` 不覆盖原生托盘菜单」
写成「Electron 无法保护托盘 UI」，属于把 API 覆盖范围误述为技术上限。准确机制
（Electron 官方 BrowserWindow / BaseWindow 文档）：

- Windows：该 API 调用 `SetWindowDisplayAffinity(hwnd, WDA_EXCLUDEFROMCAPTURE)`；
- macOS：设置 `NSWindow.sharingType = NSWindowSharingNone`（但 ScreenCaptureKit
  仍可能捕获，这是 Apple 的刻意行为）。

也就是说，保护能力是**按原生窗口 HWND / NSWindow 授予**的，原生托盘菜单窗口
只是没有被这个 API 传入，并非不可保护。

| 方案 | 做法 | 优点 | 代价 / 限制 |
| --- | --- | --- | --- |
| A. 原生 API 覆盖菜单窗口 | Windows 下在 `menu-will-show` 时用 `FindWindowW('#32768')` 找到菜单 HWND，调用 `SetWindowDisplayAffinity`（需 `koffi` 之类 FFI） | 保留原生外观、键盘导航、无障碍 | 仅 Windows；新增原生依赖；菜单窗口生命周期短、需按 PID 校验；macOS 不适用 |
| B. 自绘受保护菜单窗口 | 取消 `tray.setContextMenu`，改为 `right-click` 弹出一个 `setContentProtection(true)` 的无边框 `BrowserWindow`，自行渲染菜单 | 跨平台一致、100% 落在受保护窗口内、外观完全可控 | 需自己实现定位（含多显示器）、点击外部关闭、键盘导航、暗色模式；菜单项需重做，原生体验与无障碍退化 |
| C. 菜单脱敏（本版本落地） | 防捕获开启时不把书签/历史/下载文件名/密码条目/标签标题送进原生菜单，只保留无数据的功能项 | 零依赖、零体验变化、即时消除泄露面 | 保护的是「数据」而非「菜单窗口像素」 |

**本版本实现 C**，理由：A、B 都是架构级改动（引入原生依赖或替换托盘交互模型），
会改变用户在防捕获开启时的菜单体验，属于产品取舍，不宜在小版本里擅自替换。
C 先消除实质性风险（菜单被截屏时不再泄露任何用户数据），A/B 的实现路径已在上表
列明，确认方向后可在下一版本实施。

**补充事实**：托盘图标本身由操作系统 Shell（Windows Explorer / macOS 状态栏）渲染，
不属于应用进程窗口，A/B 都覆盖不到；且「仅托盘模式」下图标必须保持可见，
否则无法恢复窗口。这一层是系统所有权边界，不是本应用能改的。

### 验收方式（人工）

1. 托盘右键菜单宽度明显收窄，末项为「退出」；「视图」二级里仍有防截屏开关且状态同步。
2. 把窗口宽度调到 760px 以下：滑块变为 `◀ N% ▶`，点击可增减、到边界按钮禁用，
   深浅主题下箭头颜色与文字一致；拉宽后恢复滑块，数值连续不跳变。
3. 开启防捕获后展开托盘菜单：收藏 / 历史 / 下载 / 密码显示「内容已隐藏」，
   标签项只显示序号不含网页标题；关闭防捕获后内容恢复。


---

## T-13 重大事故：安装后提示「此应用无法在你的电脑上运行」（2026-11-07）

**现象**：用户安装 v1.1.3 后运行，Windows 弹出
「此应用无法在你的电脑上运行。若要找到适用于你的电脑的版本，请咨询软件发布者。」
（英文 *This app can't run on your PC. To find a version for your PC, check with the software publisher.*）

### 已逐项排除（本机实测）

| 排查项 | 方法 | 结果 |
| --- | --- | --- |
| 产物损坏 / 磁盘写满残留空洞 | 解析应用 exe 与安装器 exe 的 PE 节表，检查 `PointerToRawData + SizeOfRawData` 是否越界、尾部 2KB/4KB 是否全零 | 应用 exe 15 节、最大 raw end = 225,485,824 = 文件大小；安装器 5 节、最大 raw end 71,168；均无越界、尾部有非零数据 → **完好** |
| 架构不匹配 | `PROCESSOR_ARCHITECTURE=AMD64`、OS 64 位 Build 22631；应用 exe `Machine=0x8664 PE32+`，安装器 `0x14c PE32`（NSIS 32 位，x64 Windows 可运行） | **匹配** |
| 安装包压缩数据损坏 | `7za l` 列出 75 个文件 / 395,126,516 字节；`7za x` 完整解压出 377 MB | **完好** |
| 解压后的应用能否启动 | 干净环境（`env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS`）运行解压出的 `FloatPane.exe` | 成功加载 `resources/app.asar` 并进入主进程（打印托盘图标路径与页面加载日志）→ **可运行** |
| 环境变量污染 | 查 Process / User / Machine 三级 `ELECTRON_RUN_AS_NODE`、`NODE_OPTIONS` | 仅 Agent 进程有；**用户级/系统级均未设置** |
| 智能应用控制（SAC） | `HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy\VerifiedAndReputablePolicyState` | `0`（关闭）→ 本机未启用 |
| 下载标记（MOTW） | `Get-Item -Stream *` | 两个 exe 均只有 `:$DATA`，无 `Zone.Identifier` |

**结论**：v1.1.3 的代码、编译产物、NSIS 安装包内容均无损，在本机可运行。
错误来自 Windows 运行侧的策略判定，或用户实际拿到的文件与构建产物不一致。

### 产物校验值（用于核对用户手上的文件是否被截断）

- `FloatPane-Setup-1.1.3-x64.exe`：108,185,408 字节，
  SHA-256 `430fede0484db9015a54fcddd3cd91fca65564e26b496feda219d7eb2c2064fa`
- `FloatPane-1.1.3-win-x64-portable.zip`：149,760,590 字节，
  SHA-256 `0c27a363d635199a4ef76d004671efa457a8b4a87c1ad4b54f8e1b16e6f30219`
- 解压后的主程序 `FloatPane.exe`：225,485,824 字节，
  SHA-256 `9891192cf830d2431ed9f0570dbe6c7cfb7657fab512604c8b2e077e36dd672d`
- 两个 exe 均为 **未签名**（`Get-AuthenticodeSignature` = `NotSigned`）。

### 可能原因（按概率排序）

1. **文件在复制/传输中被截断**：D 盘刚经历 100% 占满，108 MB 安装包复制过程可能中断。
   Windows 对不完整 PE 会显示本错误。→ 先核对上面的大小与 SHA-256。
2. **另一台电脑的策略拦截**：Windows 11 智能应用控制 / SmartScreen / AppLocker /
   第三方安全软件对**未签名**可执行文件拦截。微软官方说明：无法对单个应用绕过 SAC，
   开发者需用有效证书签名。本机 SAC 为关闭，但用户可能在其他设备上安装。
3. **安装路径 / 快捷方式**：安装到 `D://Program Files (x86)\...` 等受保护目录时，
   部分安全策略会限制未签名程序运行。
4. **ARM64 设备运行 x64 包**：本包仅 `x64`，不支持 ARM64 Windows。

### 立即可执行的分叉验证

1. 核对用户手上安装包的 SHA-256 / 大小与上述一致。
2. 使用 **免安装便携版** `FloatPane-1.1.3-win-x64-portable.zip`：解压到任意普通目录
   （避开 `Program Files`），直接双击 `FloatPane.exe`。
   - 便携版能运行 → 问题在 NSIS 安装器或安装路径/快捷方式；
   - 便携版同样报错 → 问题在系统策略或未签名拦截。
   便携版不写注册表、不创建快捷方式，删除文件夹即彻底清理。
3. 右键 exe → 属性 → 若有「解除阻止」勾选后应用；再试「以管理员身份运行」。
4. 检查 Windows 安全中心 → 应用和浏览器控制 → SmartScreen / 智能应用控制状态。
   **注意**：关闭智能应用控制不可逆（需重置系统才能重新开启），仅在确认文件可信后操作。

### 长期方案（工程侧）

- 根本解决是 **Authenticode 代码签名**：OV/EV 代码签名证书、Azure Trusted Signing，
  或面向开源项目的 SignPath 免费签名服务。签名后 SAC / SmartScreen 才会把应用判为可信。
- 若要覆盖 ARM64 设备，需在 CI 增加 `--arm64` 构建并分发对应安装包。
- 自签名证书 + 导入受信任根对 SmartScreen / SAC **无效**（微软要求受信任 CA 签发的有效签名），
  因此不作为方案。

### 需要用户确认的信息

1. 错误发生在**双击安装包时**，还是**安装完成后运行应用 / 桌面快捷方式时**？
2. 是否在本机（Windows 11 专业版 22631、AMD64）运行，还是拷贝到了其他电脑？
3. 安装目标路径、完整错误截图、以及 Windows 事件查看器对应时间点的记录。


---

## v1.1.3 用户实测结论（2026-11-10）

- **T-11 透明度控件响应式双方案：测试通过。** 宽窗口滑块、窄窗口圆角三角步进器（含数值）
  均按预期工作，深浅主题下箭头颜色随 `--ui-fg` 变化，边界禁用生效。该项可关闭。
- **T-12 需求理解修正（重要）**：用户明确「我要求的不是数据脱敏，而是真正的
  「防止被截图 / 录屏 / 共享屏幕捕获」，即通过截图 / 录屏 / 共享屏幕根本捕获不到这个窗口」。
  v1.1.3 落地的菜单脱敏（收藏/历史/下载/密码占位、标签只显序号）属于**理解错误**，
  保护的是数据而非窗口像素，不能替代用户的诉求；后续版本应撤销或降级该脱敏，
  回到「让窗口在捕获中不可见」这一本体目标。
- **托盘菜单**：用户明确支持 **方案 B（自绘受保护菜单窗口）**，替代原生
  `tray.setContextMenu`，使托盘右键菜单本身落在 `setContentProtection(true)` 的
  `BrowserWindow` 内。
- **待确认方向（已向用户提问，未擅自实现）**：
  1. 主窗口防捕获：当前开关是否已实测失效、验收标准是哪些捕获工具；
     以及「根本捕获不到」是否包含物理拍摄/采集卡（软件层无法实现）。
  2. 自绘菜单：启用条件（仅防捕获开启时 / 始终）与功能范围（完整子菜单 / 精简一级）。
  3. 新增的「突破会议软件置顶识别」功能：技术实质是规避第三方检测机制，
     需先确认可接受的技术方向与权限边界；本轮未实现。


---

## T-14 方案 B 落地与验收（v1.1.4，2026-11-10）

用户确认：**主窗口防捕获没问题**；托盘菜单采用**仅防捕获时启用 + 精简菜单**的自绘受保护窗口。

### 实现

- 新增 `src/main/protectedTrayMenu.ts`。防捕获开启（且 `process.platform === 'win32'`）时，
  `syncTrayMenuMode()` 执行 `tray.setContextMenu(null)`，托盘 `right-click` 改为
  `showProtectedTrayMenu()` 弹出一个 `frame:false / transparent / skipTaskbar / alwaysOnTop`
  的 `BrowserWindow`，并调用 `win.setContentProtection(true)`。
- 菜单内容由主进程 `buildProtectedTrayItems()` 生成，经 `escapeHtml` 后内联为
  `data:text/html` 页面；不加载任何外部内容，无网络依赖、不产生缓存。
- 点击项经 preload `protectedTrayMenu.select(id)` → IPC → `handleProtectedTrayMenuAction(id)`，
  主进程 handler 用 `isProtectedTrayMenuSender(event.sender.id)` 校验来源。
- 关闭路径：失焦、ESC、点击任意项、`will-quit`。窗口创建阶段不响应 blur，避免立即自毁。
- 深浅主题由 `nativeTheme.shouldUseDarkColors` 解析 `system` 后生成配色。
- **撤销 v1.1.3 的菜单脱敏**：原生菜单恢复完整内容，标签项恢复标题显示；防捕获时
  菜单整体落在受保护窗口内，不再需要隐藏数据。

### 验收方式（人工）

1. 开启「防止被截图 / 录屏 / 共享屏幕捕获」后右键托盘：出现自绘菜单，
   用任意截图 / 录屏 / 会议共享均**看不到主窗口与托盘菜单**（两者都在捕获排除范围内）。
2. 菜单项可用：显示/隐藏、置顶、主题切换、标签切换与新建/关闭、打开数据目录、
   清除缓存、关闭防捕获（回到原生菜单）、退出。
3. 菜单位置贴合托盘图标、不超出所在显示器工作区；多显示器下位置正确；
   点击菜单外部或按 ESC 可关闭。
4. 深浅主题下菜单配色与文字对比度正常；关闭防捕获后托盘恢复原生完整菜单。

### 已知代价

- 自绘菜单失去系统原生外观、键盘导航与无障碍能力；这是方案 B 的固有取舍。
- `data:` URL 页面依赖 Electron 对该 WebContents 执行 preload；已在代码里做严格转义与
  来源校验，但**交互仍需 GUI 实测**确认。

### 暂缓项

「突破会议软件置顶识别」按用户选择先收集场景细节，未实现。需用户提供：具体会议软件与版本、
识别提示原文、出现时机（共享屏幕 / 加入会议 / 全程）、以及期望的使用场景。
在拿到这些信息前不开发规避第三方检测的能力。

---

## v1.1.4 实测反馈（2026-11-10）与 v1.1.5 处理

| 编号 | 现象 | 处理 |
| --- | --- | --- |
| T-15 | 安装时选「为全部人安装」，进入下一步后没有识别到之前「只为我安装」的路径；再点「上一步」安装程序直接退出 | 已定位根因，三个方案待用户确认，本版本未改安装配置 |
| T-16 | 自绘受保护菜单看不到最下面一个选项（排除任务栏遮挡） | 已修复：高度计算 + 运行时实测校正 |
| T-17 | 自绘受保护菜单窗口周围有一圈灰边影响美观 | 已修复：去掉阴影与 thick frame |

### T-15 安装器多用户模式：根因与方案（待确认）

**根因**（electron-builder 26.15.3 NSIS 模板 `multiUserUi.nsh` / `multiUser.nsh`）：

1. 安装模式页的 `InstallModeLeave` 在用户选择「为全部人安装」且当前进程非管理员时，
   执行 `ShowWindow $HWNDPARENT SW_HIDE` → `!insertmacro UAC_RunElevated` →
   外层进程 `Quit`，由提权后的内层进程重新拉起安装器。
2. 内层进程的 `InstallModePre` 命中 `UAC_IsInnerInstance && UAC_IsAdmin` 分支，
   直接 `setInstallModePerAllUsers; Abort` 跳过模式页。
   该宏从 HKLM 读 `InstallLocation`，读不到就用 `$PROGRAMFILES` 默认值重设 `$INSTDIR`。
   **跨进程后 NSIS 变量全部丢失**，因此「只为我安装」时用户选的自定义路径不会带过来。
3. 点「上一步」回到模式页时 PRE 再次进入提权分支 / 内外双实例检测
   （`ALLOW_ONLY_ONE_INSTALLER_INSTANCE`），表现为安装程序直接退出。

这不是本项目 `installer.nsh` 引入的，属于 `perMachine: false` +
`allowToChangeInstallationDirectory: true` + 多用户选择页组合下的模板既有缺陷。

| 方案 | 做法 | 优点 | 代价 |
| --- | --- | --- | --- |
| A. 固定「只为我安装」 | 定义 `!macro customInstallMode` 置 `$isForceCurrentInstall=1`，PRE 直接 `setInstallModePerUser; Abort` 跳过模式页 | 彻底避开 UAC 重启与路径丢失；最稳、无需 GUI 深度验证 | 不再提供「为全部人安装」 |
| B. 固定「为所有用户安装」 | `nsis.perMachine: true`，模板定义 `INSTALL_MODE_PER_ALL_USERS` 后不再插入模式页；安装器启动时即需管理员权限 | 保留全用户安装能力、路径稳定 | 每次安装都要 UAC；默认落在 Program Files |
| C. 保留两种模式并修复路径传递 | 切换模式时把 `$INSTDIR` 经命令行参数传给提权内层，内层读取恢复；同时处理「上一步」不重复提权 | 功能完整 | 需改 NSIS 模板级逻辑，跨进程状态传递，风险最高且只能靠人工安装实测验证 |

**待用户确认**：是否必须保留「为全部人安装」。若不需要，采用方案 A。

### T-16 菜单末项裁剪：修复

- 常量修正：分隔线 `SEPARATOR_HEIGHT` 9 → 15（含 `margin-bottom: 4.5px` 与
  `border-bottom: 1px`）；`PADDING` 12 → 30（`.menu` 的 margin 8 + padding 12 +
  border 2 = 22，再留 8px 余量）。原实现合计低估约 50px，正好裁掉最后一个 30px 选项。
- `did-finish-load` 后用 `executeJavaScript` 读取 `.menu` 的
  `getBoundingClientRect().height`，按实测值重设窗口高度并重新计算贴托盘的 y 坐标。
- 高度上限由固定 620 改为所在显示器 `workArea.height - 16`；`.menu` 增加
  `max-height: calc(100vh - 8px)` 与 `overflow-y: auto`（隐藏滚动条）作为极端兜底。

### T-17 灰边：修复

- 删除 `.menu` 的 `box-shadow`（透明无边框窗口上的模糊阴影正是那圈灰）。
- `BrowserWindow` 增加 `hasShadow: false`、`thickFrame: false`、
  `backgroundColor: '#00000000'`，关闭 Windows DWM 默认阴影与 thick frame 边框。

### 反检测功能：暂停

用户明确表示「之前不知道它是风险项，只是想摸鱼」，该功能**暂停开发**。
T-14 末尾记录的场景细节清单不再索要，相关调研与边界说明保留备查，不安排实现。

### 验收方式（人工）

1. 开启防捕获后右键托盘：菜单最后一项「退出」完整可见，点击可用；标签很多时菜单不超出屏幕。
2. 菜单周围无灰边 / 阴影，深浅主题下背景与文字清晰。
3. 安装器方案确认后，按所选方案重新验证：模式切换、目录页路径、「上一步」不退出。

---

## T-15 补充：方案 C 的技术约束核查与回滚（2026-11-10）

用户选择「C. 保留双模式并修路径传递」后进行了实现尝试，核查发现 electron-builder
NSIS 模板存在硬约束，**该方案无法通过常规配置达成**：

| 核查项 | 结果 |
| --- | --- |
| 安装器执行级别来源 | `installer.nsi:20-28`：`!ifdef INSTALL_MODE_PER_ALL_USERS` 时 `RequestExecutionLevel admin`，否则 `user` |
| 定义 `INSTALL_MODE_PER_ALL_USERS` | 安装器变 admin，但 `assistedInstaller.nsh:18` 会跳过 `PAGE_INSTALL_MODE`，**双模式选择页消失**，退化为方案 B |
| 不定义该宏 | 保留双模式，但安装器 `asInvoker`；选择「为全部人安装」必然触发 `UAC_RunElevated + Quit`，跨进程丢 `$INSTDIR` |
| `win.requestedExecutionLevel` | **只作用于应用 exe 的 manifest，对 NSIS 安装器无效**。实测把 `FloatPane.exe` 改为 `requireAdministrator`（每次启动弹 UAC），安装器仍是 `asInvoker` —— 属于有害副作用 |
| `MUI_PAGE_CUSTOMFUNCTION_LEAVE` 恢复路径 | UAC 提权分支里 `Abort` 使模式页 LEAVE 末尾的 `MUI_PAGE_FUNCTION_CUSTOM LEAVE` 不执行，钩子无效；且该 define 的页面消费顺序依赖模板，不可靠 |

**处置**：已完整回滚 `build/installer.nsh` 与 `electron-builder.yml` 的尝试性改动，
重新打包恢复干净的 v1.1.5 产物。复核结果：应用 exe manifest 恢复 `asInvoker`、
安装器 `asInvoker`、`git status` 无未提交改动。已重新生成安装包与便携版：

- `FloatPane-Setup-1.1.5-x64.exe` 108,194,035 B，SHA-256 `348d7095…`
- `FloatPane-1.1.5-win-x64-portable.zip` 149,773,284 B，SHA-256 `7f7a7dd9…`

**方案 C 真正可行的路径**：通过 `nsis.script` 提供自定义 `installer.nsi`
（复制模板，把 `RequestExecutionLevel user` 改为 `admin` 并保留 `PAGE_INSTALL_MODE`），
再配合页面钩子在 `setInstallModePer*` 之后恢复 `$INSTDIR`。
代价：需维护一份模板副本（electron-builder 升级要同步）、改动 NSIS 编译层、
且**必须人工安装实测**，静态检查无法验证运行时行为。

**需用户重新决策**：A 固定当前用户 / B 固定所有用户 / C′ 自定义 NSIS 脚本 / 暂不修保留已知问题。
在确认前不再改动安装配置。
