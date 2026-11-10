<p align="center">
  <img src="./floatpane-icon.png" width="88" alt="FloatPane" />
</p>

<h1 align="center">FloatPane</h1>

<p align="center">透明浮层浏览器。把想看的网页留在手边，不占走整个桌面。</p>

<p align="center">
  <a href="./README.md">English</a> · <strong>简体中文</strong> · <a href="./README.ja.md">日本語</a>
</p>

<p align="center">
  <a href="https://github.com/Hpjxiangbabang/opabrow/releases">下载</a> ·
  <a href="https://github.com/Hpjxiangbabang/opabrow">源码</a> ·
  <a href="https://hpjxiangbabang.github.io/opabrow/">官网</a>
</p>

<p align="center">
  <img src="./site/assets/opabrow-preview.svg" width="720" alt="FloatPane 界面预览" />
</p>

多数浏览器要占满整个屏幕。FloatPane 只把一个网页留在桌面边缘——参考资料、看板、视频——你照常在别的应用里工作。窗口无边框透明，标题栏只在鼠标移到顶部时出现。

## 功能

- 无边框透明窗口，标题栏悬停显示
- 透明度可调：宽窗口用拖动条，窄窗口自动切换为步进器
- 窗口置顶、鼠标移出时可自动穿透、仅托盘模式
- 浅色 / 深色 / 跟随系统主题，界面与网页同时生效
- 防截图 / 录屏 / 共享屏幕捕获，Windows 下托盘菜单同样受保护
- 菜单式标签页，重启自动恢复，不设可见标签栏
- 地址栏与本地历史建议、页内查找、下载、会话恢复
- 收藏支持 Chrome / Safari / HTML 导入；密码从 Chrome CSV 导入，本地加密、按需手动填充
- 手机 User-Agent 模式，B 站视频页自动网页全屏
- 数据全部留在本机：无账号、无云同步、无遥测

## 下载

从 [Releases](https://github.com/Hpjxiangbabang/opabrow/releases) 获取 Windows x64 安装包或 Linux x64 AppImage。macOS 支持从源码构建，但不提供预编译 DMG。Windows 安装向导可自选目录，另有免安装便携 ZIP。二进制未签名，首次启动可能被系统拦截并要求确认。

## 快捷键

`CmdOrCtrl`：Windows / Linux 为 Ctrl，macOS 为 ⌘。

| 快捷键 | 操作 |
| --- | --- |
| `Ctrl/⌘+L` | 聚焦地址栏 |
| `Ctrl/⌘+F` · `G` · `Shift+G` | 查找 · 下一个 · 上一个 |
| `Ctrl/⌘+[` · `]` · `R` | 后退 · 前进 · 刷新 |
| `Ctrl/⌘+Shift+H` | 打开主页 |
| `Ctrl/⌘+D` | 收藏当前页面 |
| `Ctrl/⌘+Shift+Y` · `Shift+J` | 历史 · 下载 |
| `Ctrl/⌘+Shift+P` | 填充已保存密码 |
| `Ctrl/⌘+T` | 切换置顶 |
| `Ctrl/⌘+=` · `-` | 调整透明度 |
| `Ctrl/⌘+K` | 命令面板 |
| `Ctrl/⌘+Shift+Space` | 显示 / 隐藏窗口 |
| `Ctrl/⌘+Shift+T` · `Shift+W` | 新建标签页 · 关闭标签页 |
| `Ctrl/⌘+W` | 关闭窗口 |

## 开发

需要 Node.js 22+ 和 pnpm 12.18.0（通过 corepack）。

```bash
pnpm install
pnpm dev
pnpm typecheck && pnpm test && pnpm build
pnpm package:win:x64
```

其他平台用 `package:mac:arm64`、`package:mac:x64` 或 `package:linux:x64`。

## 致谢

基于 [ClaytonPetrosian/opabrow](https://github.com/ClaytonPetrosian/opabrow)，作者 Clayton Petrosian。

## 许可证

[MPL-2.0](LICENSE)。
