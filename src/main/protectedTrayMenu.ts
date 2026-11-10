import { BrowserWindow, nativeTheme, screen, Tray } from 'electron';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// 自绘受保护托盘菜单（T-12 方案 B，v1.1.4）
//
// 原生 Tray.setContextMenu 的菜单窗口由系统/Chromium 菜单实现渲染，不属于我们
// 能调用 setContentProtection 的 BrowserWindow，因此会被截图/录屏/共享屏幕捕获。
// 方案 B：防捕获开启时移除原生菜单，改由本模块弹出一个应用自己的 BrowserWindow，
// 该窗口 setContentProtection(true)，菜单内容整体落在受保护窗口内。
//
// 仅 Windows 启用：macOS 状态栏菜单由 AppKit 管理且应用层菜单行为不同，保持原生。
// ---------------------------------------------------------------------------

export type TrayMenuItem =
  | { type: 'separator' }
  | {
      id: string;
      label: string;
      kind?: 'checkbox' | 'radio';
      checked?: boolean;
      disabled?: boolean;
      danger?: boolean;
    };

export type TrayTheme = 'light' | 'dark' | 'system';

const MENU_WIDTH = 268;
const ROW_HEIGHT = 30;
const SEPARATOR_HEIGHT = 9;
const PADDING = 12;

let menuWindow: BrowserWindow | null = null;

export function isProtectedTrayMenuSupported(): boolean {
  return process.platform === 'win32';
}

function escapeHtml(value: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return value.replace(/[&<>"']/g, (char) => map[char] ?? char);
}

function palette(theme: TrayTheme): { bg: string; fg: string; hover: string; border: string; sep: string } {
  const dark = theme === 'dark' || (theme === 'system' && nativeTheme.shouldUseDarkColors);
  return dark
    ? {
        bg: '#1c1c1e',
        fg: '#ffffff',
        hover: 'rgba(255,255,255,0.10)',
        border: 'rgba(255,255,255,0.16)',
        sep: 'rgba(255,255,255,0.12)'
      }
    : {
        bg: '#ffffff',
        fg: '#1c1c1e',
        hover: 'rgba(0,0,0,0.06)',
        border: 'rgba(0,0,0,0.14)',
        sep: 'rgba(0,0,0,0.10)'
      };
}

function buildHtml(items: TrayMenuItem[], theme: TrayTheme): string {
  const p = palette(theme);
  const rows = items
    .map((item) => {
      // 联合类型用 `in` 判别：普通菜单项不含 `type` 字段。
      if ('type' in item) return '<div class="sep"></div>';
      const mark =
        item.kind === 'checkbox'
          ? item.checked
            ? '✓'
            : ''
          : item.kind === 'radio'
            ? item.checked
              ? '●'
              : ''
            : '';
      const classes = ['item', item.danger ? 'danger' : '', item.disabled ? 'disabled' : '']
        .filter(Boolean)
        .join(' ');
      return (
        `<button type="button" class="${classes}" data-id="${escapeHtml(item.id)}"` +
        `${item.disabled ? ' disabled' : ''}>` +
        `<span class="mark">${mark}</span>` +
        `<span class="label">${escapeHtml(item.label)}</span></button>`
      );
    })
    .join('');

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { width: 100%; height: 100%; background: transparent; overflow: hidden; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif;
      color: ${p.fg}; user-select: none; -webkit-user-select: none;
    }
    .menu {
      width: calc(100% - 8px); margin: 4px; padding: 6px;
      background: ${p.bg}; border: 1px solid ${p.border}; border-radius: 10px;
      box-shadow: 0 10px 30px rgba(0,0,0,0.32); overflow: hidden;
    }
    .item {
      display: flex; align-items: center; width: 100%; height: ${ROW_HEIGHT}px;
      padding: 0 10px; border: 0; border-radius: 6px; background: transparent;
      color: ${p.fg}; font-size: 12px; text-align: left; cursor: pointer;
      outline: none; white-space: nowrap;
    }
    .item:hover:not(.disabled), .item:focus-visible { background: ${p.hover}; }
    .item.disabled { opacity: 0.42; cursor: default; }
    .item.danger { color: ${p.fg}; }
    .mark { flex: 0 0 18px; font-size: 12px; line-height: 1; }
    .label { flex: 1; overflow: hidden; text-overflow: ellipsis; }
    .sep { height: ${SEPARATOR_HEIGHT}px; margin: 0 6px ${SEPARATOR_HEIGHT / 2}px;
      border-bottom: 1px solid ${p.sep}; }
  `;

  // 所有动态文本都经 escapeHtml；页面完全自生成，不加载任何外部内容。
  const script = `
    document.addEventListener('click', function (event) {
      var button = event.target.closest('button.item');
      if (!button || button.disabled) return;
      var api = window.opabrow && window.opabrow.protectedTrayMenu;
      if (api) Promise.resolve(api.select(button.dataset.id)).catch(function () {});
    });
    document.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      var api = window.opabrow && window.opabrow.protectedTrayMenu;
      if (api) Promise.resolve(api.dismiss()).catch(function () {});
    });
    document.addEventListener('contextmenu', function (event) { event.preventDefault(); });
  `;

  return (
    '<!doctype html><html><head><meta charset="utf-8"><style>' +
    css +
    '</style></head><body><div class="menu">' +
    rows +
    '</div><script>' +
    script +
    '</script></body></html>'
  );
}

export function isProtectedTrayMenuSender(webContentsId: number): boolean {
  return !!menuWindow && !menuWindow.isDestroyed() && menuWindow.webContents.id === webContentsId;
}

export function dismissProtectedTrayMenu(): void {
  if (menuWindow && !menuWindow.isDestroyed()) {
    menuWindow.destroy();
  }
  menuWindow = null;
}

export function showProtectedTrayMenu(
  tray: Tray,
  items: TrayMenuItem[],
  theme: TrayTheme
): void {
  dismissProtectedTrayMenu();

  const rows = items.reduce((sum, item) => sum + ('type' in item ? SEPARATOR_HEIGHT : ROW_HEIGHT), 0);
  const height = Math.min(rows + PADDING, 620);
  const bounds = tray.getBounds();
  const anchor = {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2
  };
  const workArea = screen.getDisplayNearestPoint(anchor).workArea;

  // 托盘通常位于屏幕底部，菜单优先向上展开；空间不足时改向下。
  let y = bounds.y - height;
  if (y < workArea.y) y = bounds.y + bounds.height;
  y = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height));
  const x = Math.max(
    workArea.x,
    Math.min(bounds.x, workArea.x + workArea.width - MENU_WIDTH)
  );

  const win = new BrowserWindow({
    x,
    y,
    width: MENU_WIDTH,
    height,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    alwaysOnTop: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // 核心：菜单窗口本身也排除在捕获之外。
  win.setContentProtection(true);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setMenu(null);
  win.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'Escape' && input.type === 'keyDown') dismissProtectedTrayMenu();
  });
  // 仅在菜单已显示后才响应失焦，避免窗口创建/加载阶段的 blur 把菜单立即关掉。
  win.on('blur', () => {
    if (win.isVisible()) dismissProtectedTrayMenu();
  });
  win.on('closed', () => {
    if (menuWindow === win) menuWindow = null;
  });

  menuWindow = win;
  const html = buildHtml(items, theme);
  void win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  win.webContents.once('did-finish-load', () => {
    if (win.isDestroyed()) return;
    win.show();
    win.focus();
  });
}

export function destroyProtectedTrayMenu(): void {
  dismissProtectedTrayMenu();
}
