import { app, BrowserWindow, clipboard, dialog, shell, ipcMain, Menu, MenuItemConstructorOptions, Tray, nativeImage, screen, session, WebContentsView, nativeTheme } from 'electron';
import { basename, extname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import {
  BookmarkNode,
  BookmarkStore,
  importChromeBookmarksFromDisk,
  importHtmlBookmarksFromFile,
  importSafariBookmarksFromDisk
} from './bookmarks';
import { PasswordStore } from './passwords';
import { HistoryEntry, sanitizeHistoryEntries } from './history';
import { AppSession, DownloadEntry, SessionStore, TabEntry, ThemeMode, sanitizeSessionPatch } from './session';
import { registerUpdaterIpc, startAutoUpdateCheck, stopAutoUpdateCheck } from './updater';
// 副作用模块：必须在 app.whenReady() 之前重定向所有数据路径
import { dataLocation } from './dataPaths';

// ---------- 窗口引用 ----------
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let bookmarkStore: BookmarkStore | null = null;
let passwordStore: PasswordStore | null = null;
let sessionStore: SessionStore | null = null;
let mobileModeEnabled = false;
let clickThroughEnabled = false;
// 光标是否位于窗口矩形内；仅在自动穿透模式下影响窗口交互状态。
let cursorInsideWindow = true;
let themeMode: ThemeMode = 'light';
let contentProtectionEnabled = false;
let trayOnlyMode = false;
let isAppQuitting = false;
let ipcHandlersRegistered = false;
let recentHistory: HistoryEntry[] = [];
let recentDownloads: DownloadEntry[] = [];
const TITLEBAR_HEIGHT = 32;
const DOWNLOAD_LIMIT = 30;

// ---------- WebContentsView 管理 ----------
// 取代 <webview> tag。WebContentsView 是 Electron 30+ 推荐方案,
// 直接由 main 进程持有,无 guest view IPC 序列化开销。
let webContentView: WebContentsView | null = null;
// webview 区域(相对窗口左上角)。标题栏占顶部 32px,webview 占剩余区域。
let webContentBounds = { x: 0, y: TITLEBAR_HEIGHT, width: 0, height: 0 };

// macOS 现代 Chrome UA(避免 B 站"浏览器版本过低")
const CHROME_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36 FloatPane/0.1';
const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

// ---------- 外观主题与屏幕捕获保护 ----------
// 主题不再跟随系统：默认 light，用户可在视图/托盘菜单中显式切换，
// 选择写入 session.json 并同时作用于应用 UI 与网页 prefers-color-scheme。
async function applyWebColorScheme(
  theme: ThemeMode,
  contents = webContentView?.webContents
): Promise<void> {
  if (!contents || contents.isDestroyed()) return;
  try {
    if (!contents.debugger.isAttached()) contents.debugger.attach('1.3');
    await contents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-color-scheme', value: theme === 'system' ? '' : theme }]
    });
  } catch (error) {
    console.warn('[FloatPane] failed to apply web color scheme:', error);
  }
}

function applyTheme(theme: ThemeMode, persist = true): void {
  themeMode = theme;
  nativeTheme.themeSource = theme;
  void applyWebColorScheme(theme);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('theme-changed', theme);
  }
  if (persist) sessionStore?.update({ theme });
  refreshApplicationMenu();
}

function applyContentProtection(enabled: boolean, persist = true): void {
  contentProtectionEnabled = enabled;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setContentProtection(enabled);
    mainWindow.webContents.send('content-protection-changed', enabled);
  }
  if (persist) sessionStore?.update({ contentProtection: enabled });
  refreshApplicationMenu();
}

function applyTrayOnlyMode(enabled: boolean, persist = true): void {
  if (enabled && (!tray || tray.isDestroyed())) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      void dialog.showMessageBox(mainWindow, {
        type: 'warning',
        title: '无法启用仅托盘模式',
        message: '系统托盘不可用，启用后将无法恢复窗口，操作已取消。'
      });
    }
    return;
  }
  trayOnlyMode = enabled;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setSkipTaskbar(enabled);
    if (!enabled && !mainWindow.isVisible()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
    mainWindow.webContents.send('tray-only-mode-changed', enabled);
  }
  if (persist) sessionStore?.update({ trayOnlyMode: enabled });
  refreshApplicationMenu();
}

// v1.1.2：托盘一级「退出」的防误触。
// 调研结论（TrayMenu 设计指南、Electron 官方 Tray 示例、主流桌面应用）：
//   Quit 应放在一级菜单最底部并用分隔线隔离；高频操作放顶部；
//   仅对破坏性操作加确认。右键菜单在光标位置展开，第一项恰恰最容易被误触，
//   因此不采用「放最顶上」的兜底方案。
// 实现：底部 + 分隔线 + 确认框（默认焦点在「取消」）+ 「不再提示」可关闭确认。
async function requestQuit(): Promise<void> {
  const shouldConfirm = sessionStore?.getSnapshot().confirmOnQuit !== false;
  if (shouldConfirm) {
    const answer = await dialog.showMessageBox({
      type: 'question',
      title: '退出 FloatPane',
      message: '确定要退出 FloatPane 吗？',
      detail: '退出后窗口与托盘图标都会关闭，所有标签页将关闭。',
      buttons: ['取消', '退出'],
      defaultId: 0,
      cancelId: 0,
      checkboxLabel: '以后直接退出，不再提示',
      checkboxChecked: false,
      noLink: true
    });
    if (answer.response !== 1) return;
    if (answer.checkboxChecked) sessionStore?.update({ confirmOnQuit: false });
  }
  isAppQuitting = true;
  sessionStore?.flushSync();
  app.quit();
}

async function clearBrowsingData(win: BrowserWindow): Promise<void> {
  const answer = await dialog.showMessageBox(win, {
    type: 'warning',
    title: '清除浏览数据',
    message: '将清除网页缓存、Cookies、localStorage 与站点数据。收藏夹、历史记录、密码和窗口设置不受影响。',
    buttons: ['取消', '清除'],
    defaultId: 0,
    cancelId: 0
  });
  if (answer.response !== 1) return;
  const target = webContentView?.webContents.session ?? session.defaultSession;
  try {
    await target.clearCache();
    await target.clearStorageData({
      storages: [
        'cookies', 'filesystem', 'indexdb', 'localstorage',
        'shadercache', 'serviceworkers', 'cachestorage'
      ]
    });
    await dialog.showMessageBox(win, {
      type: 'info', title: '清除完成', message: '缓存、Cookies 与站点数据已清除。'
    });
  } catch (error) {
    await dialog.showMessageBox(win, {
      type: 'warning',
      title: '清除失败',
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

function syncWebContentBounds(): void {
  if (!mainWindow || mainWindow.isDestroyed() || !webContentView) return;
  const [winWidth, winHeight] = mainWindow.getContentSize();
  webContentBounds = {
    x: 0,
    y: TITLEBAR_HEIGHT,
    width: winWidth,
    height: Math.max(0, winHeight - TITLEBAR_HEIGHT)
  };
  webContentView.setBounds(webContentBounds);
}

function createWebContentView(initialUrl: string): WebContentsView {
  const view = new WebContentsView({
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false
    }
  });

  // 自定义 UA
  view.webContents.setUserAgent(mobileModeEnabled ? MOBILE_UA : CHROME_UA);

  // 拦截新窗口:在当前 webContents 内导航
  view.webContents.setWindowOpenHandler((details) => {
    if (is.dev) {
      console.log('[FloatPane] view setWindowOpenHandler:', details.url);
    }
    view.webContents.loadURL(details.url);
    return { action: 'deny' };
  });

  // 事件转发给 renderer
  const send = (channel: string, ...args: unknown[]): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  };

  view.webContents.on('dom-ready', () => send('webview:dom-ready'));
  view.webContents.on('did-navigate', (_e, url) => send('webview:did-navigate', url));
  view.webContents.on('did-navigate-in-page', (_e, url) => send('webview:did-navigate-in-page', url));
  view.webContents.on('page-title-updated', (_e, title) => send('webview:page-title-updated', title));
  view.webContents.on('found-in-page', (_e, result) => send('webview:found-in-page', result));
  view.webContents.on('did-finish-load', () => {
    send('webview:did-finish-load');
    void applyWebColorScheme(themeMode, view.webContents);
  });

  // ---------- 右键菜单 ----------
  // 为网页内容提供复制/粘贴/搜索等常见右键操作。
  view.webContents.on('context-menu', async (_event, params) => {
    const wc = view.webContents;
    const menuItems: MenuItemConstructorOptions[] = [];

    // 选中文本相关操作
    if (params.selectionText) {
      menuItems.push({
        label: '复制',
        click: () => clipboard.writeText(params.selectionText)
      });
      // 搜索选中文本
      menuItems.push({
        label: `用 Google 搜索"${params.selectionText.slice(0, 20)}${params.selectionText.length > 20 ? '…' : ''}"`,
        click: () => {
          const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(params.selectionText)}`;
          void wc.loadURL(searchUrl);
        }
      });
      // 用 Bing 搜索(备选)
      menuItems.push({
        label: `用 Bing 搜索"${params.selectionText.slice(0, 20)}${params.selectionText.length > 20 ? '…' : ''}"`,
        click: () => {
          const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(params.selectionText)}`;
          void wc.loadURL(searchUrl);
        }
      });
      menuItems.push({ type: 'separator' });
    }

    // 可编辑区域: 粘贴
    if (params.isEditable) {
      const clipText = clipboard.readText();
      if (clipText) {
        menuItems.push({
          label: '粘贴',
          click: () => wc.paste()
        });
      }
      menuItems.push({
        label: '全选',
        click: () => wc.selectAll()
      });
      menuItems.push({ type: 'separator' });
    }

    // 链接相关
    if (params.linkURL) {
      menuItems.push({
        label: '打开链接',
        click: () => void wc.loadURL(params.linkURL)
      });
      menuItems.push({
        label: '复制链接地址',
        click: () => clipboard.writeText(params.linkURL)
      });
      menuItems.push({ type: 'separator' });
    }

    // 图片相关
    if (params.mediaType === 'image' && params.srcURL) {
      menuItems.push({
        label: '复制图片地址',
        click: () => clipboard.writeText(params.srcURL)
      });
      menuItems.push({
        label: '在新标签打开图片',
        click: () => void wc.loadURL(params.srcURL)
      });
      menuItems.push({ type: 'separator' });
    }

    // 导航操作
    menuItems.push({
      label: '后退',
      enabled: wc.navigationHistory.canGoBack(),
      click: () => wc.goBack()
    });
    menuItems.push({
      label: '前进',
      enabled: wc.navigationHistory.canGoForward(),
      click: () => wc.goForward()
    });
    menuItems.push({
      label: '重新加载',
      click: () => wc.reload()
    });
    menuItems.push({ type: 'separator' });

    // 复制当前页面 URL
    menuItems.push({
      label: '复制页面地址',
      click: () => clipboard.writeText(wc.getURL())
    });

    // 检查元素(开发模式)
    if (is.dev) {
      menuItems.push({ type: 'separator' });
      menuItems.push({
        label: '检查元素',
        click: () => wc.inspectElement(params.x, params.y)
      });
    }

    if (menuItems.length > 0) {
      const menu = Menu.buildFromTemplate(menuItems);
      menu.popup({ window: mainWindow ?? undefined });
    }
  });

  // 初始加载
  if (initialUrl) {
    void view.webContents.loadURL(initialUrl).catch((error) => {
      console.warn('[FloatPane] initial loadURL failed:', error);
    });
  }

  return view;
}

// ---------- 多标签页（v1.1.2） ----------
// 设计：webContentView 始终指向当前活动视图，因此所有既有的
// webContentView.webContents.xxx() 调用自动作用于当前标签，无需逐一改造。
// 本应用是透明浮层窗口，不引入可见标签栏；标签通过「标签」菜单管理。
type TabState = { id: string; url: string | null; title: string; view: WebContentsView };

const tabViews = new Map<string, TabState>();
let activeTabId: string | null = null;
let attachedViewId: string | null = null;

const NEW_TAB_URL = 'about:blank';

function listTabs(): TabEntry[] {
  return [...tabViews.values()].map((tab) => ({
    id: tab.id,
    url: tab.url,
    title: tab.title
  }));
}

function persistTabs(): void {
  sessionStore?.update({ tabs: listTabs(), activeTabId });
}

function broadcastTabs(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('tabs-changed', {
    tabs: listTabs(),
    activeTabId,
    currentUrl: webContentView?.webContents.getURL() ?? ''
  });
}

function tabMenuLabel(tab: TabState, index: number): string {
  let title = tab.title?.trim() || '';
  if (!title && tab.url) {
    try {
      title = new URL(tab.url).hostname;
    } catch {
      title = tab.url;
    }
  }
  if (!title) title = '新标签页';
  if (title.length > 42) title = `${title.slice(0, 42)}…`;
  return `${index + 1}. ${title}`;
}

function switchTab(id: string): void {
  const win = mainWindow;
  const next = tabViews.get(id);
  if (!win || win.isDestroyed() || !next) return;

  if (attachedViewId && attachedViewId !== id) {
    const previous = tabViews.get(attachedViewId);
    if (previous) {
      try {
        win.contentView.removeChildView(previous.view);
      } catch {
        // 视图可能已随窗口销毁，忽略。
      }
    }
  }
  if (attachedViewId !== id) {
    win.contentView.addChildView(next.view);
    attachedViewId = id;
  }

  webContentView = next.view;
  activeTabId = id;
  syncWebContentBounds();
  void applyWebColorScheme(themeMode);
  void applyClickThrough(win);
  broadcastTabs();
  persistTabs();
  refreshApplicationMenu();
}

function newTab(url: string | null, activate = true, title?: string): string {
  const id = randomUUID();
  const view = createWebContentView(url ?? NEW_TAB_URL);
  const tab: TabState = {
    id,
    url,
    title: title?.trim() || (url ? (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return '新标签页';
      }
    })() : '新标签页'),
    view
  };
  tabViews.set(id, tab);

  view.webContents.on('page-title-updated', (_event, pageTitle) => {
    tab.title = pageTitle?.trim() || tab.title;
    const current = view.webContents.getURL();
    if (current && current !== NEW_TAB_URL) tab.url = current;
    persistTabs();
    refreshApplicationMenu();
  });
  view.webContents.on('did-navigate', (_event, navigatedUrl) => {
    if (navigatedUrl && navigatedUrl !== NEW_TAB_URL) tab.url = navigatedUrl;
    persistTabs();
    refreshApplicationMenu();
  });

  if (activate) switchTab(id);
  else persistTabs();
  return id;
}

function closeTab(id: string): void {
  const tab = tabViews.get(id);
  if (!tab) return;
  const ids = [...tabViews.keys()];
  const index = ids.indexOf(id);

  if (attachedViewId === id && mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.contentView.removeChildView(tab.view);
    } catch {
      // ignore
    }
    attachedViewId = null;
    webContentView = null;
  }
  try {
    tab.view.webContents.close();
  } catch {
    // ignore
  }
  tabViews.delete(id);

  const remaining = [...tabViews.keys()];
  if (remaining.length === 0) {
    const home = sessionStore?.getSnapshot().homeUrl ?? null;
    newTab(home, true);
  } else {
    const nextId = remaining[Math.min(index, remaining.length - 1)];
    switchTab(nextId);
  }
  refreshApplicationMenu();
}

function attachWebContentView(
  win: BrowserWindow,
  initialUrl: string,
  savedTabs: TabEntry[] = [],
  savedActiveId: string | null = null
): void {
  if (webContentView) return;
  const initial = savedTabs.length
    ? savedTabs.map((tab) => ({ url: tab.url, title: tab.title }))
    : [{ url: initialUrl || null, title: '' }];
  for (const item of initial) newTab(item.url, false, item.title);
  const firstId = savedActiveId && tabViews.has(savedActiveId)
    ? savedActiveId
    : [...tabViews.keys()][0];
  if (firstId) switchTab(firstId);
  // 窗口尺寸变化时同步 view bounds
  win.on('resize', () => syncWebContentBounds());
}

// ---------- Chromium 性能开关 ----------
// 必须在 app.whenReady() 之前调用。Electron 默认关闭了 Chrome 的部分加速特性,
// 这里手动打开,缩小与原生 Chrome 的性能差距。
function installChromiumPerformanceSwitches(): void {
  // 1. 忽略 GPU 黑名单 —— 部分 Mac 机型会被 Chromium 列入 blocklist 而回退到软件渲染,
  //    软件渲染下透明窗口合成会显著拖慢主线程。
  app.commandLine.appendSwitch('ignore-gpu-blocklist');
  // 2. GPU 栅格化 —— 让图块栅格化走 GPU 而不是 CPU。
  app.commandLine.appendSwitch('enable-gpu-rasterization');
  // 3. 零拷贝光栅化 —— 减少光栅化结果到合成器的内存拷贝。
  app.commandLine.appendSwitch('enable-zero-copy');
  // 4. Back/Forward Cache —— 前进后退时不重新加载页面,直接复用之前冻结的渲染进程。
  //    B 站这种 SPA 来回切会快非常多。
  app.commandLine.appendSwitch('enable-features', 'BackForwardCache');
  // 5. 关闭进程外光栅化防御性回退,保持上述开关稳定生效。
  app.commandLine.appendSwitch('disable-features', 'OutOfProcessRasterization');
}

installChromiumPerformanceSwitches();

// ---------- 全局拦截所有 webContents 的新窗口请求 ----------
// 关键:webview 标签内的 <a target="_blank"> 链接会创建新的 BrowserWindow
// setWindowOpenHandler 只对 BrowserWindow 主 webContents 生效,
// 但通过 app.on('web-contents-created') 可以拦截所有 webContents(包括 webview guest)
//
// 同时在这里做安全策略: 阻止 navigation 到非 http(s)/file: 协议。
// 之前有两处 web-contents-created 监听,每个都会给同一 contents 绑
// will-navigate,导致事件被处理两次。合并到一处。
app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler((details) => {
    if (is.dev) {
      console.log('[FloatPane] setWindowOpenHandler intercepted:', details.url, 'in wc', contents.id);
    }
    // 在当前 webContents 内直接 navigate —— 这样 history 累积,前进后退能用
    // 不能用 send IPC 通知 renderer 改 webview.src,那样会重置 history
    contents.loadURL(details.url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url, isInPlace, isMainFrame) => {
    if (is.dev) {
      console.log('[FloatPane] will-navigate:', url, 'isInPlace=', isInPlace, 'isMainFrame=', isMainFrame, 'wc=', contents.id);
    }
    // 安全: 阻止 navigation 到非 http(s)/file: 协议
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:' && parsed.protocol !== 'file:') {
      event.preventDefault();
    }
  });
});

// ---------- 创建主窗口 ----------
function createMainWindow(sessionState: AppSession): BrowserWindow {
  const bounds = sessionState.bounds;
  const win = new BrowserWindow({
    width: bounds?.width ?? 1200,
    height: bounds?.height ?? 832,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    show: true, // 立刻显示,免得 macOS 透明窗口被吞
    // 用 transparent: true 让顶部 32px 标题栏区域在非 hover 时完全透明,
    // 能看到桌面/下层应用。vibrancy 会让整个窗口恒显毛玻璃,标题栏无法
    // "hover 才显示",所以不能用。
    transparent: true,
    frame: false,
    titleBarStyle: 'hiddenInset', // macOS 隐藏标题栏
    trafficLightPosition: { x: -100, y: -100 }, // 把红绿黄按钮挪出可见区
    hasShadow: true,
    opacity: sessionState.opacity,
    backgroundColor: '#00000000', // 完全透明
    movable: true, // 允许拖动
    resizable: true,
    center: true,
    title: 'FloatPane',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // iframe 用 allow-same-origin,需要这一关
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false
    }
  });

  // 自定义 UA
  win.webContents.setUserAgent(CHROME_UA);
  win.setAlwaysOnTop(sessionState.alwaysOnTop, sessionState.alwaysOnTop ? 'floating' : 'normal');
  win.setContentProtection(contentProtectionEnabled);
  win.setSkipTaskbar(trayOnlyMode);
  // 仅托盘模式：最小化与关闭都改为隐藏，只能从托盘恢复。
  win.on('minimize', () => {
    if (trayOnlyMode) win.hide();
  });
  win.on('close', (event) => {
    if (trayOnlyMode && !isAppQuitting) {
      event.preventDefault();
      win.hide();
    }
  });
  applyClickThrough(win);

  // 加载 dev / prod URL
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'));
  }

  // 阻止 renderer 主页面新开窗口 —— 把 URL 交给当前 webview 导航
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      win.webContents.send('navigate-iframe', url);
    }
    return { action: 'deny' };
  });

  // 阻止外跳(在当前 webContents 内 navigate 到外部 URL)
  win.webContents.on('will-navigate', (event, url) => {
    // renderer 内的 webview 跳转不走这里
    // 这里拦截的是 renderer 主页面本身的导航
    const rendererUrl = process.env['ELECTRON_RENDERER_URL'] ?? '';
    if (rendererUrl && url.startsWith(rendererUrl)) return;
    event.preventDefault();
    shell.openExternal(url);
  });

  // 拦截 iframe 内部 fullscreen request——B 站视频全屏限制在窗口内
  // (Electron 的 enter-full-screen 事件签名是 will-resize,需要换个方式)
  // 思路:拦截 webContents 'enter-html-full-screen',然后立刻让 window 退出 fullscreen
  // 这样视频虽然没全屏,但窗口不会被推到屏幕全屏
  win.webContents.on('enter-html-full-screen', () => {
    // 立刻退出 native fullscreen,让视频回到窗口内大小
    win.setFullScreen(false);
  });

  installTitlebarHoverTracking(win);
  installWindowSessionTracking(win);

  return win;
}

// 控制窗口交互状态（v1.1.1，见 TESTING.md 的 T-04 决策）。
// - 默认 clickThroughEnabled=false：置顶只是置顶，窗口始终完全可交互。
// - 开启「鼠标移出窗口时自动穿透」后：光标在窗口矩形内 -> 完全可交互；
//   移出窗口 -> setIgnoreMouseEvents(true)，事件落到下层应用。
// 判定由主进程屏幕坐标轮询完成：网页由独立 WebContentsView 承载，渲染层 DOM
// 拿不到网页区域的鼠标命中信息，forward:true 无法可靠覆盖 WebContentsView。
// forward:false 表示穿透时鼠标事件不转发给 webContents，窗口彻底不阻挡下层。
function applyClickThrough(win = mainWindow): void {
  if (!win || win.isDestroyed()) return;
  const shouldIgnore = win.isAlwaysOnTop() && clickThroughEnabled && !cursorInsideWindow;
  win.setIgnoreMouseEvents(shouldIgnore, { forward: false });
}

function installWindowSessionTracking(win: BrowserWindow): void {
  let saveTimer: NodeJS.Timeout | null = null;
  const saveBounds = (): void => {
    if (!win.isDestroyed()) sessionStore?.update({ bounds: win.getBounds() });
  };
  const scheduleSave = (): void => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      saveBounds();
    }, 200);
  };

  win.on('resize', scheduleSave);
  win.on('move', scheduleSave);
  win.on('close', () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveBounds();
    void sessionStore?.flush();
  });
  win.once('closed', () => {
    if (saveTimer) clearTimeout(saveTimer);
  });
}

// 标题栏区域独立占据窗口顶部 32px,通过屏幕坐标检测 hover,不依赖 webview 的鼠标事件。
// 轮询仅在窗口置顶 + 点击穿透时启动 —— 这是唯一需要主进程帮忙检测的场景。
// 非置顶模式下 webview 的 DOM mousemove 能正常触发,renderer 自己处理 hover 即可,
// 此时 50ms setInterval 纯属空转,会持续唤醒主进程事件循环。
function installTitlebarHoverTracking(win: BrowserWindow): void {
  let lastVisible: boolean | null = null;
  let timer: NodeJS.Timeout | null = null;
  let leaveTimer: NodeJS.Timeout | null = null;

  // 切换「光标在窗口内 / 外」状态。进入立即恢复交互；移出延迟 120ms 并二次确认，
  // 避免拖动窗口穿越边界时反复切换穿透状态。
  const setCursorInside = (inside: boolean): void => {
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    if (inside) {
      if (!cursorInsideWindow) {
        cursorInsideWindow = true;
        applyClickThrough(win);
      }
      return;
    }
    leaveTimer = setTimeout(() => {
      leaveTimer = null;
      if (win.isDestroyed() || !cursorInsideWindow) return;
      const b = win.getBounds();
      const c = screen.getCursorScreenPoint();
      const stillOutside =
        c.x < b.x || c.x >= b.x + b.width || c.y < b.y || c.y >= b.y + b.height;
      if (!stillOutside) return;
      cursorInsideWindow = false;
      applyClickThrough(win);
    }, 120);
  };

  const update = (): void => {
    if (win.isDestroyed()) return;

    const bounds = win.getBounds();
    const cursor = screen.getCursorScreenPoint();
    const insideWindow =
      cursor.x >= bounds.x &&
      cursor.x < bounds.x + bounds.width &&
      cursor.y >= bounds.y &&
      cursor.y < bounds.y + bounds.height;
    const visible = insideWindow && cursor.y < bounds.y + TITLEBAR_HEIGHT;

    if (visible !== lastVisible) {
      lastVisible = visible;
      win.webContents.send('titlebar-visibility', visible);
    }

    // 自动穿透模式下按整个窗口矩形切换；其它情况保证窗口始终可交互。
    if (win.isAlwaysOnTop() && clickThroughEnabled) {
      setCursorInside(insideWindow);
    } else if (!cursorInsideWindow) {
      cursorInsideWindow = true;
      applyClickThrough(win);
    }
  };

  const start = (): void => {
    if (timer) return;
    timer = setInterval(update, 40);
  };
  const stop = (): void => {
    if (leaveTimer) {
      clearTimeout(leaveTimer);
      leaveTimer = null;
    }
    if (!timer) return;
    clearInterval(timer);
    timer = null;
    // 停止时把标题栏隐藏,避免残留
    if (!win.isDestroyed()) win.webContents.send('titlebar-visibility', false);
    lastVisible = null;
    cursorInsideWindow = true;
    applyClickThrough(win);
  };

  // 根据置顶状态动态启停
  const sync = (): void => {
    if (win.isDestroyed()) return;
    if (win.isAlwaysOnTop()) start();
    else stop();
  };

  win.on('always-on-top-changed', () => {
    lastVisible = null;
    sync();
  });
  win.webContents.on('did-finish-load', () => {
    lastVisible = null;
    sync();
    if (timer) update();
  });
  win.once('closed', () => {
    stop();
  });

  // 初始状态
  sync();
}

// ---------- macOS 顶部菜单栏 ----------
function bookmarkMenuItems(nodes: BookmarkNode[], win: BrowserWindow): MenuItemConstructorOptions[] {
  return nodes.map((node) => {
    if (node.type === 'folder') {
      return {
        label: node.title,
        submenu: bookmarkMenuItems(node.children, win)
      };
    }

    return {
      label: node.title,
      toolTip: node.url,
      click: () => win.webContents.send('menu-action', 'bookmark_open', node.url)
    };
  });
}

function historyMenuItems(entries: HistoryEntry[], win: BrowserWindow): MenuItemConstructorOptions[] {
  if (entries.length === 0) {
    return [{ label: '暂无历史记录', enabled: false }];
  }

  return entries.slice(0, 10).map((entry) => ({
    label: entry.title,
    toolTip: entry.url,
    click: () => win.webContents.send('menu-action', 'history_open', entry.url)
  }));
}

function downloadMenuItems(entries: DownloadEntry[]): MenuItemConstructorOptions[] {
  if (entries.length === 0) return [{ label: '暂无下载记录', enabled: false }];

  return entries.slice(0, 8).map((entry) => ({
    label: entry.filename,
    toolTip: entry.state === 'completed' ? '在 Finder 中显示' : entry.state === 'failed' ? '下载失败' : '正在下载',
    enabled: entry.state === 'completed',
    click: () => shell.showItemInFolder(entry.savePath)
  }));
}

function nextDownloadPath(filename: string): string {
  const directory = app.getPath('downloads');
  const safeFilename = basename(filename) || 'download';
  const extension = extname(safeFilename);
  const name = extension ? safeFilename.slice(0, -extension.length) : safeFilename;
  let candidate = join(directory, safeFilename);
  let suffix = 1;
  while (existsSync(candidate)) {
    candidate = join(directory, `${name} (${suffix})${extension}`);
    suffix += 1;
  }
  return candidate;
}

function updateDownload(entry: DownloadEntry): void {
  recentDownloads = [entry, ...recentDownloads.filter((item) => item.id !== entry.id)].slice(0, DOWNLOAD_LIMIT);
  sessionStore?.update({ downloads: recentDownloads });
  refreshApplicationMenu();
  mainWindow?.webContents.send('download-update', entry);
}

function installDownloadTracking(): void {
  session.defaultSession.on('will-download', (_event, item, contents) => {
    if (!mainWindow || contents.id === mainWindow.webContents.id) return;

    const entry: DownloadEntry = {
      id: randomUUID(),
      url: item.getURL(),
      filename: item.getFilename(),
      savePath: nextDownloadPath(item.getFilename()),
      receivedBytes: item.getReceivedBytes(),
      totalBytes: item.getTotalBytes(),
      state: 'progressing',
      createdAt: Date.now()
    };
    item.setSavePath(entry.savePath);
    updateDownload(entry);

    item.on('updated', (_event, state) => {
      updateDownload({
        ...entry,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state: state === 'interrupted' ? 'failed' : 'progressing'
      });
    });
    item.once('done', (_event, state) => {
      updateDownload({
        ...entry,
        receivedBytes: item.getReceivedBytes(),
        totalBytes: item.getTotalBytes(),
        state: state === 'completed' ? 'completed' : 'failed'
      });
    });
  });
}

// 菜单重建: Menu.buildFromTemplate 会序列化整棵树跨进程发送给 cocoa,
// 包含全部书签/历史/下载子菜单。频繁触发(如下载 progress 每秒数次、
// SPA 页面 did-navigate 触发 history sync)会让主进程卡顿。
// 用 200ms debounce 合并高频调用。
let refreshMenuTimer: NodeJS.Timeout | null = null;
function refreshApplicationMenu(): void {
  if (refreshMenuTimer) return;
  refreshMenuTimer = setTimeout(() => {
    refreshMenuTimer = null;
    refreshApplicationMenuNow();
  }, 200);
}

function refreshApplicationMenuNow(): void {
  if (refreshMenuTimer) {
    clearTimeout(refreshMenuTimer);
    refreshMenuTimer = null;
  }
  if (!mainWindow || mainWindow.isDestroyed() || !bookmarkStore || !passwordStore) return;
  const menu = buildAppMenu(mainWindow, bookmarkStore, passwordStore);
  Menu.setApplicationMenu(menu);
  // Windows / Linux 下同步刷新托盘右键菜单
  if (tray && !tray.isDestroyed()) {
    tray.setContextMenu(menu);
  }
}

async function showImportResult(win: BrowserWindow, source: string, importBookmarks: () => Promise<number>): Promise<void> {
  try {
    const added = await importBookmarks();
    refreshApplicationMenu();
    await dialog.showMessageBox(win, {
      type: 'info',
      title: '收藏导入完成',
      message: added > 0 ? `${source} 收藏已导入 ${added} 条链接。` : `${source} 中没有新的收藏链接。`
    });
  } catch (error) {
    await dialog.showMessageBox(win, {
      type: 'warning',
      title: '无法导入收藏',
      message: error instanceof Error ? error.message : '导入过程中发生未知错误。'
    });
  }
}

async function confirmAndClearHistory(win: BrowserWindow): Promise<boolean> {
  if (recentHistory.length === 0) return false;

  const result = await dialog.showMessageBox(win, {
    type: 'warning',
    title: '清空历史记录',
    message: '确定要删除 FloatPane 本机保存的全部历史记录吗？此操作无法撤销。',
    buttons: ['取消', '清空'],
    defaultId: 0,
    cancelId: 0
  });
  if (result.response !== 1) return false;

  recentHistory = [];
  refreshApplicationMenu();
  win.webContents.send('menu-action', 'history_clear');
  return true;
}

function buildAppMenu(win: BrowserWindow, bookmarks: BookmarkStore, passwords: PasswordStore): Menu {
  const isMac = process.platform === 'darwin';

  // macOS 专属应用菜单（关于/服务/隐藏/退出），Windows/Linux 托盘不需要这些
  const appMenu: MenuItemConstructorOptions = {
    label: 'FloatPane',
    submenu: [
      { role: 'about', label: '关于 FloatPane' },
      { type: 'separator' },
      { role: 'services', label: '服务' },
      { type: 'separator' },
      { role: 'hide', label: '隐藏 FloatPane' },
      { role: 'hideOthers', label: '隐藏其他' },
      { role: 'unhide', label: '显示全部' },
      { type: 'separator' },
      { role: 'quit', label: '退出' }
    ]
  };

  const browseMenu: MenuItemConstructorOptions = {
    label: '浏览',
    submenu: [
      {
        label: '聚焦地址栏',
        accelerator: 'CmdOrCtrl+L',
        click: () => win.webContents.send('menu-action', 'go_url')
      },
      { type: 'separator' },
      {
        label: '在页面中查找',
        accelerator: 'CmdOrCtrl+F',
        click: () => win.webContents.send('menu-action', 'show_find')
      },
      {
        label: '查找下一个',
        accelerator: 'CmdOrCtrl+G',
        click: () => win.webContents.send('menu-action', 'find_next')
      },
      {
        label: '查找上一个',
        accelerator: 'CmdOrCtrl+Shift+G',
        click: () => win.webContents.send('menu-action', 'find_previous')
      },
      { type: 'separator' },
      {
        label: '后退',
        // 用 ⌘+[ 而不是 ⌘+←,避免跟 webview 内部 Chromium 抢键盘事件
        // (⌘+← 会被 webview 内的 B 站自己响应)
        accelerator: 'CmdOrCtrl+[',
        click: () => win.webContents.send('menu-action', 'go_back')
      },
      {
        label: '前进',
        accelerator: 'CmdOrCtrl+]',
        click: () => win.webContents.send('menu-action', 'go_forward')
      },
      { type: 'separator' },
      {
        label: '刷新',
        accelerator: 'CmdOrCtrl+R',
        click: () => win.webContents.send('menu-action', 'reload')
      },
      {
        label: '回到主页',
        accelerator: 'CmdOrCtrl+Shift+H',
        click: () => win.webContents.send('menu-action', 'home')
      },
      { type: 'separator' },
      {
        label: '将当前页面设为主页',
        click: () => win.webContents.send('menu-action', 'set_home')
      },
      {
        label: '恢复项目主页',
        click: () => win.webContents.send('menu-action', 'reset_home')
      }
    ]
  };

  const bookmarksMenu: MenuItemConstructorOptions = {
    label: '收藏',
    submenu: [
      {
        label: '收藏 / 取消收藏当前页面',
        accelerator: 'CmdOrCtrl+D',
        click: () => win.webContents.send('menu-action', 'bookmark_toggle')
      },
      { type: 'separator' },
      ...bookmarkMenuItems(bookmarks.getItems(), win),
      { type: 'separator' },
      {
        label: '从 Chrome 导入…',
        click: () => {
          void showImportResult(win, 'Chrome', async () => {
            const imported = await importChromeBookmarksFromDisk();
            return bookmarks.importFolder(imported);
          });
        }
      },
      {
        label: '从 Safari 导入…',
        click: () => {
          void showImportResult(win, 'Safari', async () => {
            const imported = await importSafariBookmarksFromDisk();
            return bookmarks.importFolder(imported);
          });
        }
      },
      {
        label: '导入书签 HTML…',
        click: () => {
          void (async () => {
            const selection = await dialog.showOpenDialog(win, {
              title: '导入书签 HTML',
              buttonLabel: '导入',
              properties: ['openFile'],
              filters: [
                { name: '书签 HTML', extensions: ['html', 'htm'] },
                { name: '所有文件', extensions: ['*'] }
              ]
            });
            if (selection.canceled || selection.filePaths.length === 0) return;
            await showImportResult(win, 'HTML', async () => {
              const imported = await importHtmlBookmarksFromFile(selection.filePaths[0]);
              return bookmarks.importFolder(imported);
            });
          })().catch((error) => console.warn('Could not select bookmark HTML:', error));
        }
      },
      { type: 'separator' },
      {
        label: '清空全部收藏…',
        enabled: bookmarks.getItems().length > 0,
        click: () => {
          void (async () => {
            const result = await dialog.showMessageBox(win, {
              type: 'warning',
              title: '清空全部收藏',
              message: '确定要删除所有本机收藏吗？此操作无法撤销。',
              buttons: ['取消', '清空'],
              defaultId: 0,
              cancelId: 0
            });
            if (result.response !== 1) return;
            await bookmarks.clear();
            refreshApplicationMenuNow();
          })().catch((error) => console.warn('Could not clear bookmarks:', error));
        }
      }
    ]
  };

  const historyMenu: MenuItemConstructorOptions = {
    label: '历史',
    submenu: [
      {
        label: '显示历史记录',
        accelerator: 'CmdOrCtrl+Shift+Y',
        click: () => win.webContents.send('menu-action', 'show_history')
      },
      { type: 'separator' },
      ...historyMenuItems(recentHistory, win),
      { type: 'separator' },
      {
        label: '清空历史记录…',
        enabled: recentHistory.length > 0,
        click: () => {
          void confirmAndClearHistory(win).catch((error) => console.warn('Could not clear history:', error));
        }
      }
    ]
  };

  const downloadsMenu: MenuItemConstructorOptions = {
    label: '下载',
    submenu: [
      {
        label: '显示下载',
        accelerator: 'CmdOrCtrl+Shift+J',
        click: () => win.webContents.send('menu-action', 'show_downloads')
      },
      { type: 'separator' },
      ...downloadMenuItems(recentDownloads)
    ]
  };

  const passwordsMenu: MenuItemConstructorOptions = {
    label: '密码',
    submenu: [
      {
        label: '填充当前页面',
        accelerator: 'CmdOrCtrl+Shift+P',
        enabled: passwords.hasPasswords(),
        click: () => win.webContents.send('menu-action', 'password_fill')
      },
      { type: 'separator' },
      {
        label: '从 Chrome 密码 CSV 导入…',
        click: () => {
          void (async () => {
            const selection = await dialog.showOpenDialog(win, {
              title: '导入 Chrome 密码 CSV',
              buttonLabel: '选择文件',
              properties: ['openFile'],
              filters: [
                { name: 'Chrome 密码 CSV', extensions: ['csv'] },
                { name: '所有文件', extensions: ['*'] }
              ]
            });
            if (selection.canceled || selection.filePaths.length === 0) return;

            const confirmation = await dialog.showMessageBox(win, {
              type: 'warning',
              title: '导入 Chrome 密码',
              message: 'Chrome 导出的 CSV 含有明文密码。FloatPane 只会读取这一次，并使用 macOS 钥匙串加密保存。',
              buttons: ['取消', '导入'],
              defaultId: 0,
              cancelId: 0
            });
            if (confirmation.response !== 1) return;

            const result = await passwords.importChromeCsv(selection.filePaths[0]);
            refreshApplicationMenuNow();
            const changes = [`新增 ${result.added} 条`, `更新 ${result.updated} 条`];
            if (result.rejected > 0) changes.push(`跳过 ${result.rejected} 条无效记录`);
            await dialog.showMessageBox(win, {
              type: 'info',
              title: '密码导入完成',
              message: changes.join('，') + '。'
            });
          })().catch((error) => {
            void dialog.showMessageBox(win, {
              type: 'warning',
              title: '无法导入密码',
              message: error instanceof Error ? error.message : '导入过程中发生未知错误。'
            });
          });
        }
      },
      { type: 'separator' },
      {
        label: '清空本机已保存的密码…',
        enabled: passwords.hasPasswords(),
        click: () => {
          void (async () => {
            const result = await dialog.showMessageBox(win, {
              type: 'warning',
              title: '清空本机密码',
              message: '确定要删除 FloatPane 本机保存的全部密码吗？此操作无法撤销。',
              buttons: ['取消', '清空'],
              defaultId: 0,
              cancelId: 0
            });
            if (result.response !== 1) return;
            await passwords.clear();
            refreshApplicationMenuNow();
          })().catch((error) => console.warn('Could not clear passwords:', error));
        }
      }
    ]
  };

  const editMenu: MenuItemConstructorOptions = {
    label: '编辑',
    submenu: [
      { role: 'undo', label: '撤销' },
      { role: 'redo', label: '重做' },
      { type: 'separator' },
      { role: 'cut', label: '剪切' },
      { role: 'copy', label: '复制' },
      { role: 'paste', label: '粘贴' },
      { role: 'selectAll', label: '全选' }
    ]
  };

  const viewMenu: MenuItemConstructorOptions = {
    label: '视图',
    submenu: [
      {
        label: '仅托盘模式（不显示在任务栏）',
        type: 'checkbox',
        checked: trayOnlyMode,
        click: (menuItem) => applyTrayOnlyMode(menuItem.checked)
      },
      {
        label: '数据管理',
        submenu: [
          { label: `数据目录：${dataLocation.root}`, enabled: false },
          { type: 'separator' },
          { label: '打开数据目录', click: () => void shell.openPath(dataLocation.root) },
          { label: '清除缓存与 Cookies…', click: () => void clearBrowsingData(win) },
          { type: 'separator' },
          {
            label: dataLocation.source === 'env'
              ? '模式：自定义目录（FLOATPANE_DATA_DIR）'
              : '模式：固定用户数据目录（升级不丢失，卸载清理）',
            enabled: false
          }
        ]
      },
      { type: 'separator' },
      {
        label: '外观主题',
        submenu: (['light', 'dark', 'system'] as const).map((mode) => ({
          label: mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : '跟随系统',
          type: 'radio' as const,
          checked: themeMode === mode,
          click: () => applyTheme(mode)
        }))
      },
      {
        label: '防止被截图 / 录屏 / 共享屏幕捕获',
        type: 'checkbox',
        checked: contentProtectionEnabled,
        click: (menuItem) => applyContentProtection(menuItem.checked)
      },
      { type: 'separator' },
      {
        label: '切换置顶',
        accelerator: 'CmdOrCtrl+T',
        click: () => win.webContents.send('menu-action', 'ontop_toggle')
      },
      {
        label: '鼠标移出窗口时自动穿透',
        type: 'checkbox',
        enabled: win.isAlwaysOnTop(),
        checked: clickThroughEnabled,
        click: (menuItem) => {
          clickThroughEnabled = menuItem.checked;
          sessionStore?.update({ clickThrough: clickThroughEnabled });
          cursorInsideWindow = true;
          applyClickThrough(win);
        }
      },
      { type: 'separator' },
      {
        label: '手机模式访问网页',
        type: 'checkbox',
        checked: mobileModeEnabled,
        click: (menuItem) => {
          mobileModeEnabled = menuItem.checked;
          sessionStore?.update({ mobileMode: mobileModeEnabled });
          win.webContents.send('menu-action', 'mobile_mode_toggle', menuItem.checked);
        }
      },
      { type: 'separator' },
      {
        label: 'B站视频默认网页全屏',
        type: 'checkbox',
        checked: sessionStore?.getSnapshot().bilibiliWebFullscreen !== false,
        click: (menuItem) => {
          sessionStore?.update({ bilibiliWebFullscreen: menuItem.checked });
          win.webContents.send('menu-action', 'bilibili_fullscreen_toggle', menuItem.checked);
        }
      },
      { type: 'separator' },
      {
        label: '调整透明度…',
        click: () => win.webContents.send('menu-action', 'show_opacity_dialog')
      },
      {
        label: '增加透明度',
        accelerator: 'CmdOrCtrl+=',
        click: () => win.webContents.send('menu-action', 'opacity_inc')
      },
      {
        label: '降低透明度',
        accelerator: 'CmdOrCtrl+-',
        click: () => win.webContents.send('menu-action', 'opacity_dec')
      },
      { type: 'separator' },
      {
        label: '打开命令面板',
        accelerator: 'CmdOrCtrl+K',
        click: () => win.webContents.send('menu-action', 'show_quickbar')
      },
      { type: 'separator' },
      {
        label: '检查更新…',
        click: () => win.webContents.send('menu-action', 'check_for_updates')
      }
    ]
  };

  const windowMenu: MenuItemConstructorOptions = {
    label: '窗口',
    submenu: [
      { role: 'minimize', label: '最小化' },
      { type: 'separator' },
      {
        label: '关闭窗口',
        accelerator: 'CmdOrCtrl+W',
        click: () => win.close()
      }
    ]
  };

  // Windows / Linux 托盘菜单专属：显示/隐藏窗口、退出
  const trayWindowMenu: MenuItemConstructorOptions = {
    label: '窗口',
    submenu: [
      {
        label: '显示 / 隐藏',
        accelerator: 'CmdOrCtrl+Shift+Space',
        click: () => {
          if (win.isVisible()) {
            win.hide();
          } else {
            if (win.isMinimized()) win.restore();
            win.show();
            win.focus();
          }
        }
      },
      { type: 'separator' },
      { role: 'minimize', label: '最小化' }
    ]
  };

  // v1.1.2「标签」一级菜单：列出已打开标签（radio 可切换）、分隔线、新建标签页。
  // 本应用是透明浮层窗口，不引入可见标签栏，标签完全由菜单管理。
  // 注：浏览器惯例的 Ctrl+T / Ctrl+W 已被「切换置顶」「关闭窗口」占用，
  // 因此新建/关闭标签使用 Ctrl+Shift+T / Ctrl+Shift+W，避免破坏既有习惯。
  const tabList = [...tabViews.values()];
  const tabsMenu: MenuItemConstructorOptions = {
    label: '标签',
    submenu: [
      ...tabList.map((tab, index) => ({
        // 原生菜单窗口不受 setContentProtection 覆盖；防捕获开启时不把页面标题
        // / URL 送进菜单，只保留序号，功能不减但消除数据泄露面。
        label: contentProtectionEnabled ? `标签 ${index + 1}` : tabMenuLabel(tab, index),
        type: 'radio' as const,
        checked: tab.id === activeTabId,
        click: () => switchTab(tab.id)
      })),
      { type: 'separator' },
      {
        label: '新建标签页',
        accelerator: 'CmdOrCtrl+Shift+T',
        click: () => newTab(sessionStore?.getSnapshot().homeUrl ?? null)
      },
      {
        label: '关闭当前标签页',
        accelerator: 'CmdOrCtrl+Shift+W',
        enabled: tabList.length > 0,
        click: () => { if (activeTabId) closeTab(activeTabId); }
      }
    ]
  };

  // 托盘右键一级只保留「退出」（v1.1.3：标签精简为两字以收窄菜单宽度；
  // 防截屏开关已归位到「视图」二级菜单，避免一级菜单过长）。
  // 退出位于最底部并用分隔线隔离，降低误触概率。
  const trayQuickActions: MenuItemConstructorOptions[] = isMac
    ? []
    : [
        { type: 'separator' },
        {
          label: '退出',
          click: () => void requestQuit()
        }
      ];

  // 防捕获开启时，把含用户数据的四个菜单替换为占位项（菜单脱敏）。
  // 这是数据层防护：原生菜单窗口由系统渲染，无法用 BrowserWindow.setContentProtection
  // 排除在捕获之外，因此不把书签 / 历史 / 下载文件名 / 密码条目交给系统渲染。
  const redacted = (label: string): MenuItemConstructorOptions => ({
    label,
    submenu: [{ label: '内容已隐藏（防捕获已开启）', enabled: false }]
  });
  const safeBookmarksMenu = contentProtectionEnabled ? redacted('收藏') : bookmarksMenu;
  const safeHistoryMenu = contentProtectionEnabled ? redacted('历史') : historyMenu;
  const safeDownloadsMenu = contentProtectionEnabled ? redacted('下载') : downloadsMenu;
  const safePasswordsMenu = contentProtectionEnabled ? redacted('密码') : passwordsMenu;

  const template: MenuItemConstructorOptions[] = isMac
    ? [appMenu, editMenu, browseMenu, tabsMenu, safeHistoryMenu, safeDownloadsMenu, safeBookmarksMenu, safePasswordsMenu, viewMenu, windowMenu]
    : [editMenu, browseMenu, tabsMenu, safeHistoryMenu, safeDownloadsMenu, safeBookmarksMenu, safePasswordsMenu, viewMenu, trayWindowMenu, ...trayQuickActions];

  return Menu.buildFromTemplate(template);
}

// ---------- Windows / Linux 系统托盘 ----------
// macOS 有顶部菜单栏承载全部功能；Windows / Linux 无边框窗口没有菜单栏，
// 通过任务栏托盘图标的右键菜单提供同样的功能入口。
function createTray(win: BrowserWindow): Tray {
  // 托盘图标路径：使用多尺寸查找,优先小尺寸 PNG。
  // Windows 托盘推荐 16x16 或 32x32,macOS 状态栏推荐 16x16@2x。
  const isDev = !app.isPackaged;
  const iconCandidates = isDev
    ? [
        join(__dirname, '../../build/icon.iconset/icon_32.png'),
        join(__dirname, '../../build/icon.iconset/icon_64.png'),
        join(__dirname, '../../build/icon.iconset/icon_128.png'),
        join(__dirname, '../../build/icon.png')
      ]
    : [
        join(process.resourcesPath, 'build/icon.iconset/icon_32.png'),
        join(process.resourcesPath, 'build/icon.iconset/icon_64.png'),
        join(process.resourcesPath, 'build/icon.iconset/icon_128.png'),
        join(process.resourcesPath, 'build/icon.png')
      ];

  let iconPath = iconCandidates[iconCandidates.length - 1];
  for (const candidate of iconCandidates) {
    if (existsSync(candidate)) {
      iconPath = candidate;
      break;
    }
  }

  // Windows 上 resize 到 16x16,使用 nearest 插值获得清晰边缘
  const icon = nativeImage.createFromPath(iconPath);
  if (icon.isEmpty()) {
    console.warn('[FloatPane] tray icon not found at:', iconPath);
  }
  const trayIcon = icon.resize({ width: 16, height: 16 });
  const trayInstance = new Tray(trayIcon);
  trayInstance.setToolTip('FloatPane');
  if (bookmarkStore && passwordStore) {
    trayInstance.setContextMenu(buildAppMenu(win, bookmarkStore, passwordStore));
  }

  // 单击托盘图标显示/隐藏窗口（Windows 惯例）
  trayInstance.on('click', () => {
    if (win.isDestroyed()) return;
    if (win.isVisible() && win.isFocused()) {
      win.hide();
    } else {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });

  return trayInstance;
}

// ---------- IPC handlers ----------
function registerIpc(bookmarks: BookmarkStore, passwords: PasswordStore): void {
  if (ipcHandlersRegistered) return;

  ipcMain.handle('set-theme', (event, theme: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id) return;
    if (theme === 'light' || theme === 'dark' || theme === 'system') applyTheme(theme);
  });
  ipcMain.handle('set-content-protection', (event, enabled: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id) return;
    if (typeof enabled === 'boolean') applyContentProtection(enabled);
  });
  ipcMain.handle('set-tray-only-mode', (event, enabled: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id) return;
    if (typeof enabled === 'boolean') applyTrayOnlyMode(enabled);
  });
  ipcMain.handle('tabs:new', (event, url: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id) return null;
    return newTab(typeof url === 'string' && url ? url : null);
  });
  ipcMain.handle('tabs:close', (event, id: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id) return false;
    if (typeof id === 'string') closeTab(id);
    return true;
  });
  ipcMain.handle('tabs:switch', (event, id: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id) return false;
    if (typeof id === 'string') switchTab(id);
    return true;
  });
  ipcMain.handle('tabs:list', () => ({ tabs: listTabs(), activeTabId }));
  ipcHandlersRegistered = true;

  // 设置窗口透明度 0.1 - 1.0
  ipcMain.handle('set-opacity', (_e, opacity: number) => {
    const v = Math.max(0.1, Math.min(1.0, opacity));
    mainWindow?.setOpacity(v);
    sessionStore?.update({ opacity: v });
    return v;
  });

  // 设置窗口置顶
  ipcMain.handle('set-always-on-top', (_e, onTop: boolean) => {
    mainWindow?.setAlwaysOnTop(onTop, onTop ? 'floating' : 'normal');
    sessionStore?.update({ alwaysOnTop: onTop === true });
    cursorInsideWindow = true;
    applyClickThrough();
    refreshApplicationMenu();
    return onTop;
  });

  // 关闭
  ipcMain.handle('close-window', () => {
    mainWindow?.close();
  });

  // 最小化
  ipcMain.handle('minimize-window', () => {
    mainWindow?.minimize();
  });

  // 强制激活(透明窗口有时需要)
  ipcMain.handle('focus-window', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  // 手动开始拖动窗口 —— CSS -webkit-app-region: drag 在透明窗口上有时不灵,这里手动调
  ipcMain.handle('start-drag', () => {
    try {
      (mainWindow as (BrowserWindow & { startDragging?: () => void }) | null)?.startDragging?.();
    } catch (e) {
      // 某些情况下 startDragging 抛错,忽略
    }
  });

  ipcMain.handle('toggle-bookmark', async (_event, page: unknown) => {
    if (!page || typeof page !== 'object') throw new Error('Invalid bookmark page.');
    const { url, title } = page as { url?: unknown; title?: unknown };
    if (typeof url !== 'string') throw new Error('Invalid bookmark URL.');

    const bookmarked = await bookmarks.toggle(url, typeof title === 'string' ? title : '');
    refreshApplicationMenuNow();
    return bookmarked;
  });

  ipcMain.handle('sync-history', (event, entries: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id) return;
    recentHistory = sanitizeHistoryEntries(entries);
    refreshApplicationMenu();
  });

  ipcMain.handle('clear-history', async (event) => {
    if (event.sender.id !== mainWindow?.webContents.id || !mainWindow) return false;
    return confirmAndClearHistory(mainWindow);
  });

  ipcMain.handle('get-session', (event) => {
    if (event.sender.id !== mainWindow?.webContents.id) return null;
    return sessionStore?.getSnapshot() ?? null;
  });

  ipcMain.handle('save-session', (event, patch: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id) return null;
    sessionStore?.update(sanitizeSessionPatch(patch));
    return sessionStore?.getSnapshot() ?? null;
  });

  ipcMain.handle('get-downloads', (event) => {
    if (event.sender.id !== mainWindow?.webContents.id) return [];
    return recentDownloads;
  });

  ipcMain.handle('show-download-in-folder', (event, id: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id || typeof id !== 'string') return false;
    const entry = recentDownloads.find((item) => item.id === id && item.state === 'completed');
    if (!entry) return false;
    shell.showItemInFolder(entry.savePath);
    return true;
  });

  ipcMain.handle('list-password-matches', (event, url: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id || typeof url !== 'string') return [];
    return passwords.getMatches(url);
  });

  ipcMain.handle('get-password-for-fill', async (event, request: unknown) => {
    if (
      event.sender.id !== mainWindow?.webContents.id ||
      !request ||
      typeof request !== 'object'
    ) {
      return null;
    }

    const { id, url } = request as { id?: unknown; url?: unknown };
    if (typeof id !== 'string' || typeof url !== 'string') return null;
    return passwords.getForFill(id, url);
  });

  registerWebContentIpc();
}

// ---------- WebContentsView IPC ----------
// renderer 不再持有 webview 对象,所有操作通过 IPC 转发到 main。
function registerWebContentIpc(): void {
  // 加载 URL
  ipcMain.handle('webview:load-url', (event, url: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id || typeof url !== 'string') return false;
    if (!webContentView) return false;
    if (webContentView.webContents.getURL() === url) return true;
    void webContentView.webContents.loadURL(url).catch((error) => {
      console.warn('[FloatPane] webview loadURL failed:', error);
    });
    return true;
  });

  // 重新加载
  ipcMain.handle('webview:reload', (event) => {
    if (event.sender.id !== mainWindow?.webContents.id || !webContentView) return;
    try {
      webContentView.webContents.reload();
    } catch (error) {
      console.warn('[FloatPane] webview reload failed:', error);
    }
  });

  // 后退 / 前进
  ipcMain.handle('webview:go-back', (event) => {
    if (event.sender.id !== mainWindow?.webContents.id || !webContentView) return;
    try {
      webContentView.webContents.goBack();
    } catch (error) {
      console.warn('[FloatPane] webview goBack failed:', error);
    }
  });
  ipcMain.handle('webview:go-forward', (event) => {
    if (event.sender.id !== mainWindow?.webContents.id || !webContentView) return;
    try {
      webContentView.webContents.goForward();
    } catch (error) {
      console.warn('[FloatPane] webview goForward failed:', error);
    }
  });

  // 获取当前 URL / 标题
  ipcMain.handle('webview:get-url', (event) => {
    if (event.sender.id !== mainWindow?.webContents.id || !webContentView) return '';
    return webContentView.webContents.getURL();
  });
  ipcMain.handle('webview:get-title', (event) => {
    if (event.sender.id !== mainWindow?.webContents.id || !webContentView) return '';
    return webContentView.webContents.getTitle();
  });

  // 设置 UA (mobile 模式切换)
  ipcMain.handle('webview:set-user-agent', (event, userAgent: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id || typeof userAgent !== 'string') return;
    if (!webContentView) return;
    webContentView.webContents.setUserAgent(userAgent);
  });

  // 页面内查找
  ipcMain.handle('webview:find-in-page', (event, query: unknown, options: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id || !webContentView) return;
    if (typeof query !== 'string') return;
    try {
      webContentView.webContents.findInPage(query, (options as Electron.FindInPageOptions) ?? {});
    } catch (error) {
      console.warn('[FloatPane] webview findInPage failed:', error);
    }
  });
  ipcMain.handle('webview:stop-find-in-page', (event, action: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id || !webContentView) return;
    try {
      webContentView.webContents.stopFindInPage((action as 'clearSelection' | 'keepSelection' | 'activateSelection') ?? 'clearSelection');
    } catch (error) {
      console.warn('[FloatPane] webview stopFindInPage failed:', error);
    }
  });

  // 执行 JS (用于密码填充、B 站网页全屏)
  ipcMain.handle('webview:execute-javascript', async (event, script: unknown) => {
    if (event.sender.id !== mainWindow?.webContents.id || typeof script !== 'string') return null;
    if (!webContentView) return null;
    try {
      return await webContentView.webContents.executeJavaScript(script);
    } catch (error) {
      console.warn('[FloatPane] webview executeJavaScript failed:', error);
      return null;
    }
  });
}

// ---------- App 生命周期 ----------
app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.floatpane.app');

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  bookmarkStore = new BookmarkStore(join(app.getPath('userData'), 'bookmarks.json'));
  passwordStore = new PasswordStore(join(app.getPath('userData'), 'passwords.json'));
  sessionStore = new SessionStore(join(app.getPath('userData'), 'session.json'));
  await bookmarkStore.load();
  await passwordStore.load();
  await sessionStore.load();
  const sessionState = sessionStore.getSnapshot();
  mobileModeEnabled = sessionState.mobileMode;
  clickThroughEnabled = sessionState.clickThrough;
  themeMode = sessionState.theme;
  contentProtectionEnabled = sessionState.contentProtection;
  trayOnlyMode = sessionState.trayOnlyMode;
  nativeTheme.themeSource = themeMode;
  recentDownloads = sessionState.downloads;
  installDownloadTracking();

  mainWindow = createMainWindow(sessionState);
  // 初始 URL 从 session 读取,由 renderer 通过 IPC 调用 loadURL 控制
  attachWebContentView(mainWindow, sessionState.url ?? '', sessionState.tabs, sessionState.activeTabId);
  registerIpc(bookmarkStore, passwordStore);

  // 自动更新检测
  registerUpdaterIpc(() => mainWindow);
  startAutoUpdateCheck(() => mainWindow);

  // Windows / Linux: 创建系统托盘图标,右键菜单承载全部应用功能
  if (process.platform !== 'darwin') {
    tray = createTray(mainWindow);
  }

  refreshApplicationMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow(sessionStore?.getSnapshot() ?? sessionState);
      const snapshot = sessionStore?.getSnapshot() ?? sessionState;
      attachWebContentView(mainWindow, snapshot.url ?? '', snapshot.tabs, snapshot.activeTabId);
      refreshApplicationMenu();
    }
  });
});

app.on('before-quit', () => {
  isAppQuitting = true;
  // 同步写入，确保退出前最后一次设置变更一定落盘。
  sessionStore?.flushSync();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  stopAutoUpdateCheck();
  tray?.destroy();
  tray = null;
});
