import { mkdirSync, writeFileSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { HistoryEntry, sanitizeHistoryEntries } from './history';

export type ThemeMode = 'light' | 'dark' | 'system';

export type TabEntry = {
  id: string;
  url: string | null;
  title: string;
};

export type DownloadState = 'progressing' | 'completed' | 'failed';

export type DownloadEntry = {
  id: string;
  url: string;
  filename: string;
  savePath: string;
  receivedBytes: number;
  totalBytes: number;
  state: DownloadState;
  createdAt: number;
};

export type WindowBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type AppSession = {
  url: string | null;
  opacity: number;
  alwaysOnTop: boolean;
  clickThrough: boolean;
  mobileMode: boolean;
  bilibiliWebFullscreen: boolean;
  bounds: WindowBounds | null;
  downloads: DownloadEntry[];
  theme: ThemeMode;
  contentProtection: boolean;
  trayOnlyMode: boolean;
  homeUrl: string | null;
  history: HistoryEntry[];
  tabs: TabEntry[];
  activeTabId: string | null;
  confirmOnQuit: boolean;
};

const DEFAULT_SESSION: AppSession = {
  url: null,
  opacity: 1,
  alwaysOnTop: false,
  clickThrough: false,
  mobileMode: false,
  bilibiliWebFullscreen: true,
  bounds: null,
  downloads: [],
  theme: 'light',
  contentProtection: false,
  trayOnlyMode: false,
  homeUrl: null,
  history: [],
  tabs: [],
  activeTabId: null,
  confirmOnQuit: true
};
const DOWNLOAD_LIMIT = 30;
const TAB_LIMIT = 20;

function isHttpUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function sanitizeBounds(value: unknown): WindowBounds | null {
  if (!value || typeof value !== 'object') return null;
  const { x, y, width, height } = value as Partial<WindowBounds>;
  if (
    typeof x !== 'number' ||
    typeof y !== 'number' ||
    typeof width !== 'number' ||
    typeof height !== 'number' ||
    ![x, y, width, height].every(Number.isFinite)
  ) {
    return null;
  }
  if (width < 120 || height < 100) return null;
  return { x, y, width, height };
}

function sanitizeDownloads(value: unknown): DownloadEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const entries: DownloadEntry[] = [];

  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Partial<DownloadEntry>;
    if (
      typeof entry.id !== 'string' ||
      seen.has(entry.id) ||
      !isHttpUrl(entry.url) ||
      typeof entry.filename !== 'string' ||
      typeof entry.savePath !== 'string' ||
      !['progressing', 'completed', 'failed'].includes(String(entry.state)) ||
      typeof entry.createdAt !== 'number'
    ) {
      continue;
    }

    seen.add(entry.id);
    entries.push({
      id: entry.id,
      url: entry.url,
      filename: entry.filename,
      savePath: entry.savePath,
      receivedBytes: typeof entry.receivedBytes === 'number' ? Math.max(0, entry.receivedBytes) : 0,
      totalBytes: typeof entry.totalBytes === 'number' ? Math.max(0, entry.totalBytes) : 0,
      state: entry.state as DownloadState,
      createdAt: entry.createdAt
    });
    if (entries.length === DOWNLOAD_LIMIT) break;
  }

  return entries;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function sanitizeTabs(value: unknown): TabEntry[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const tabs: TabEntry[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const tab = item as Partial<TabEntry>;
    if (typeof tab.id !== 'string' || !tab.id || seen.has(tab.id)) continue;
    seen.add(tab.id);
    tabs.push({
      id: tab.id.slice(0, 64),
      url: isHttpUrl(tab.url) ? (tab.url as string) : null,
      title: typeof tab.title === 'string' && tab.title.trim()
        ? tab.title.trim().slice(0, 200)
        : '新标签页'
    });
    if (tabs.length === TAB_LIMIT) break;
  }
  return tabs;
}

export function sanitizeSession(value: unknown): AppSession {
  if (!value || typeof value !== 'object') return { ...DEFAULT_SESSION };
  const session = value as Partial<AppSession>;
  return {
    url: isHttpUrl(session.url) ? session.url : null,
    opacity: typeof session.opacity === 'number' && Number.isFinite(session.opacity)
      ? Math.min(1, Math.max(0.1, session.opacity))
      : DEFAULT_SESSION.opacity,
    alwaysOnTop: session.alwaysOnTop === true,
    // v1.1.1: 缺失值时默认关闭；旧数据中显式 true 仍保留，但语义已升级为「移出窗口自动穿透」。
    clickThrough: session.clickThrough === true,
    mobileMode: session.mobileMode === true,
    bilibiliWebFullscreen: session.bilibiliWebFullscreen !== false,
    bounds: sanitizeBounds(session.bounds),
    // 进程重启时没有可继续复用的 DownloadItem，遗留中的任务应明确显示为失败。
    downloads: sanitizeDownloads(session.downloads).map((entry) =>
      entry.state === 'progressing' ? { ...entry, state: 'failed' } : entry
    ),
    theme: isThemeMode(session.theme) ? session.theme : DEFAULT_SESSION.theme,
    contentProtection: session.contentProtection === true,
    trayOnlyMode: session.trayOnlyMode === true,
    homeUrl: isHttpUrl(session.homeUrl) ? session.homeUrl : null,
    history: sanitizeHistoryEntries(session.history),
    tabs: sanitizeTabs(session.tabs),
    activeTabId: typeof session.activeTabId === 'string' ? session.activeTabId : null,
    confirmOnQuit: session.confirmOnQuit !== false
  };
}

export function sanitizeSessionPatch(value: unknown): Partial<AppSession> {
  if (!value || typeof value !== 'object') return {};
  const patch = value as Partial<AppSession>;
  const next: Partial<AppSession> = {};
  if (isHttpUrl(patch.url)) next.url = patch.url;
  if (typeof patch.opacity === 'number' && Number.isFinite(patch.opacity)) next.opacity = Math.min(1, Math.max(0.1, patch.opacity));
  if (typeof patch.alwaysOnTop === 'boolean') next.alwaysOnTop = patch.alwaysOnTop;
  if (typeof patch.clickThrough === 'boolean') next.clickThrough = patch.clickThrough;
  if (typeof patch.mobileMode === 'boolean') next.mobileMode = patch.mobileMode;
  if (typeof patch.bilibiliWebFullscreen === 'boolean') next.bilibiliWebFullscreen = patch.bilibiliWebFullscreen;
  if (isThemeMode(patch.theme)) next.theme = patch.theme;
  if (typeof patch.contentProtection === 'boolean') next.contentProtection = patch.contentProtection;
  if (typeof patch.trayOnlyMode === 'boolean') next.trayOnlyMode = patch.trayOnlyMode;
  if (patch.homeUrl === null || isHttpUrl(patch.homeUrl)) next.homeUrl = patch.homeUrl;
  if (Array.isArray(patch.history)) next.history = sanitizeHistoryEntries(patch.history);
  if (Array.isArray(patch.tabs)) next.tabs = sanitizeTabs(patch.tabs);
  if (patch.activeTabId === null || typeof patch.activeTabId === 'string') next.activeTabId = patch.activeTabId;
  if (typeof patch.confirmOnQuit === 'boolean') next.confirmOnQuit = patch.confirmOnQuit;
  return next;
}

export class SessionStore {
  private data: AppSession = { ...DEFAULT_SESSION };
  // v1.1.2: 取消 250ms 防抖。防抖 + 退出时未等待 flush 是「设置未保存」的直接原因。
  // 写入按队列串行执行，不会乱序；调用频率本身就很低（设置变更、窗口移动 200ms 防抖）。
  private writePromise: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      this.data = sanitizeSession(JSON.parse(await readFile(this.filePath, 'utf8')) as unknown);
    } catch {
      this.data = { ...DEFAULT_SESSION };
    }
  }

  getSnapshot(): AppSession {
    return structuredClone(this.data);
  }

  update(patch: Partial<AppSession>): void {
    this.data = sanitizeSession({ ...this.data, ...patch });
    this.queueWrite();
  }

  async flush(): Promise<void> {
    await this.writePromise;
  }

  // 退出钩子必须是同步的：Electron 不会等待异步 Promise 就结束进程。
  flushSync(): void {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (error) {
      console.warn('[FloatPane] synchronous session flush failed:', error);
    }
  }

  private queueWrite(): void {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.writePromise = this.writePromise
      .catch(() => undefined)
      .then(async () => {
        await mkdir(dirname(this.filePath), { recursive: true });
        await writeFile(this.filePath, snapshot, 'utf8');
      });
  }
}
