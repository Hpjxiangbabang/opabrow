import { app, BrowserWindow, shell, ipcMain } from 'electron';
import * as https from 'node:https';
import { SemVer, compare } from './semver';

// ---------- 更新源配置 ----------
// 支持两种托管平台,默认 GitLab,可切换 GitHub。
// 配置写在 userData/update-source.json,用户可修改。

export type UpdateProvider = 'gitlab' | 'github';

export type UpdateSourceConfig = {
  provider: UpdateProvider;
  // gitlab: https://gitlab.example.com (不含 /api)
  // github: https://api.github.com
  host: string;
  // gitlab: "group/project" 或 "project-id"
  // github: "owner/repo"
  project: string;
  // 可选 private token (GitLab) 或 personal access token (GitHub)
  token?: string;
};

export const DEFAULT_UPDATE_SOURCE: UpdateSourceConfig = {
  provider: 'gitlab',
  host: 'https://gitlab.com',
  project: '',
  token: ''
};

export type UpdateInfo = {
  version: string;        // 最新版本号,如 "1.0.1" (不含 v 前缀)
  releaseUrl: string;     // release 页面链接
  releaseNotes: string;   // 更新说明(markdown 纯文本)
  downloadUrls: PlatformDownloadUrls;
  publishedAt: string;    // ISO 时间
};

type PlatformDownloadUrls = {
  macArm64?: string;
  macX64?: string;
  winX64?: string;
  linuxX64?: string;
};

export type UpdateCheckResult =
  | { available: true; info: UpdateInfo }
  | { available: false; reason: 'up-to-date' | 'network-error' | 'not-configured' | 'parse-error' };

// ---------- 平台匹配 ----------
function platformKey(): keyof PlatformDownloadUrls {
  const platform = process.platform;
  const arch = process.arch;
  if (platform === 'darwin' && arch === 'arm64') return 'macArm64';
  if (platform === 'darwin' && arch === 'x64') return 'macX64';
  if (platform === 'win32' && arch === 'x64') return 'winX64';
  if (platform === 'linux' && arch === 'x64') return 'linuxX64';
  return 'winX64';
}

function matchAsset(name: string, key: keyof PlatformDownloadUrls): boolean {
  const lower = name.toLowerCase();
  switch (key) {
    case 'macArm64':
      return (lower.endsWith('.dmg') || lower.endsWith('.zip')) && lower.includes('arm64');
    case 'macX64':
      return (lower.endsWith('.dmg') || lower.endsWith('.zip')) && (lower.includes('x64') || lower.includes('amd64') || (!lower.includes('arm64') && lower.includes('mac')));
    case 'winX64':
      return lower.endsWith('.exe') && (lower.includes('x64') || lower.includes('amd64') || (!lower.includes('arm') && lower.includes('win')));
    case 'linuxX64':
      return (lower.endsWith('.appimage') || lower.endsWith('.deb') || lower.endsWith('.tar.gz')) && (lower.includes('x64') || lower.includes('amd64'));
  }
}

// ---------- HTTP 请求 ----------
function httpsGetJson(url: string, headers: Record<string, string> = {}): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options: https.RequestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || 443,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': `opabrow/${app.getVersion()}`,
        'Accept': 'application/json',
        ...headers
      },
      timeout: 15000
    };

    const req = https.request(options, (res) => {
      // 跟随重定向
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        httpsGetJson(res.headers.location, headers).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON response'));
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Request timeout')); });
    req.end();
  });
}

// ---------- GitLab API ----------
// GitLab Releases API: GET /api/v4/projects/:id/releases
// 文档: https://docs.gitlab.com/ee/api/releases/
async function fetchGitLabLatest(config: UpdateSourceConfig): Promise<UpdateInfo | null> {
  const projectEncoded = encodeURIComponent(config.project);
  const url = `${config.host}/api/v4/projects/${projectEncoded}/releases/permalink/latest`;
  const headers: Record<string, string> = {};
  if (config.token) headers['PRIVATE-TOKEN'] = config.token;

  const json = await httpsGetJson(url, headers) as {
    tag_name: string;
    description?: string;
    released_at?: string;
    created_at?: string;
    assets?: {
      links?: Array<{ name: string; url: string }>;
    };
    _links?: { self?: string };
  };

  if (!json?.tag_name) return null;

  const version = json.tag_name.replace(/^v/i, '');
  const links = json.assets?.links ?? [];
  const downloadUrls: PlatformDownloadUrls = {};
  for (const link of links) {
    const key = platformKey();
    if (matchAsset(link.name, key) && !downloadUrls[key]) {
      downloadUrls[key] = link.url;
    }
    // 尝试匹配所有平台
    for (const k of ['macArm64', 'macX64', 'winX64', 'linuxX64'] as const) {
      if (!downloadUrls[k] && matchAsset(link.name, k)) {
        downloadUrls[k] = link.url;
      }
    }
  }

  return {
    version,
    releaseUrl: json._links?.self ?? `${config.host}/${config.project}/-/releases/${json.tag_name}`,
    releaseNotes: json.description ?? '',
    downloadUrls,
    publishedAt: json.released_at ?? json.created_at ?? new Date().toISOString()
  };
}

// ---------- GitHub API ----------
// GitHub Releases API: GET /repos/:owner/:repo/releases/latest
async function fetchGitHubLatest(config: UpdateSourceConfig): Promise<UpdateInfo | null> {
  const url = `https://api.github.com/repos/${config.project}/releases/latest`;
  const headers: Record<string, string> = {};
  if (config.token) headers['Authorization'] = `Bearer ${config.token}`;

  const json = await httpsGetJson(url, headers) as {
    tag_name: string;
    body?: string;
    html_url?: string;
    published_at?: string;
    assets?: Array<{ name: string; browser_download_url: string }>;
  };

  if (!json?.tag_name) return null;

  const version = json.tag_name.replace(/^v/i, '');
  const downloadUrls: PlatformDownloadUrls = {};
  for (const asset of json.assets ?? []) {
    for (const k of ['macArm64', 'macX64', 'winX64', 'linuxX64'] as const) {
      if (!downloadUrls[k] && matchAsset(asset.name, k)) {
        downloadUrls[k] = asset.browser_download_url;
      }
    }
  }

  return {
    version,
    releaseUrl: json.html_url ?? `https://github.com/${config.project}/releases/latest`,
    releaseNotes: json.body ?? '',
    downloadUrls,
    publishedAt: json.published_at ?? new Date().toISOString()
  };
}

// ---------- 版本比较 ----------
function isNewerVersion(latest: string, current: string): boolean {
  try {
    const latestVer = new SemVer(latest);
    const currentVer = new SemVer(current);
    return compare(latestVer, currentVer) > 0;
  } catch {
    // 降级为字符串比较
    return latest !== current;
  }
}

// ---------- 公开 API ----------

export async function checkForUpdate(
  config: UpdateSourceConfig,
  currentVersion: string
): Promise<UpdateCheckResult> {
  if (!config.project) {
    return { available: false, reason: 'not-configured' };
  }

  try {
    let info: UpdateInfo | null = null;
    if (config.provider === 'gitlab') {
      info = await fetchGitLabLatest(config);
    } else {
      info = await fetchGitHubLatest(config);
    }

    if (!info) {
      return { available: false, reason: 'parse-error' };
    }

    if (isNewerVersion(info.version, currentVersion)) {
      return { available: true, info };
    }
    return { available: false, reason: 'up-to-date' };
  } catch (error) {
    console.warn('[opabrow] update check failed:', error);
    return { available: false, reason: 'network-error' };
  }
}

export function getDownloadUrl(info: UpdateInfo): string | undefined {
  return info.downloadUrls[platformKey()];
}

// ---------- IPC 注册 ----------
// renderer 可通过 window.opabrow.updater.check() 触发检查,
// 结果通过 updater:check-result 事件推回。

let lastCheckResult: UpdateCheckResult | null = null;
let autoCheckTimer: NodeJS.Timeout | null = null;

export function registerUpdaterIpc(getMainWindow: () => BrowserWindow | null): void {
  // 手动检查更新
  ipcMain.handle('updater:check', async (event) => {
    const mainWindow = getMainWindow();
    if (event.sender.id !== mainWindow?.webContents.id) return null;

    const config = loadUpdateSourceConfig();
    const result = await checkForUpdate(config, app.getVersion());
    lastCheckResult = result;
    mainWindow?.webContents.send('updater:check-result', result);
    return result;
  });

  // 获取上次检查结果
  ipcMain.handle('updater:get-last-result', (event) => {
    const mainWindow = getMainWindow();
    if (event.sender.id !== mainWindow?.webContents.id) return null;
    return lastCheckResult;
  });

  // 打开下载页面
  ipcMain.handle('updater:download', (event, url?: string) => {
    const mainWindow = getMainWindow();
    if (event.sender.id !== mainWindow?.webContents.id) return false;

    let downloadUrl = url;
    if (!downloadUrl && lastCheckResult?.available) {
      downloadUrl = getDownloadUrl(lastCheckResult.info) ?? lastCheckResult.info.releaseUrl;
    }
    if (downloadUrl) {
      void shell.openExternal(downloadUrl);
      return true;
    }
    return false;
  });
}

// ---------- 自动检测(启动后定时) ----------
const AUTO_CHECK_INTERVAL = 60 * 60 * 1000; // 1 小时
const AUTO_CHECK_DELAY = 10 * 1000;         // 启动后 10 秒首次检查

export function startAutoUpdateCheck(getMainWindow: () => BrowserWindow | null): void {
  // 延迟首次检查
  setTimeout(() => {
    void performAutoCheck(getMainWindow);
  }, AUTO_CHECK_DELAY);

  // 定时检查
  autoCheckTimer = setInterval(() => {
    void performAutoCheck(getMainWindow);
  }, AUTO_CHECK_INTERVAL);
}

async function performAutoCheck(getMainWindow: () => BrowserWindow | null): Promise<void> {
  const config = loadUpdateSourceConfig();
  if (!config.project) return; // 未配置则跳过

  const result = await checkForUpdate(config, app.getVersion());
  lastCheckResult = result;

  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed() && result.available) {
    mainWindow.webContents.send('updater:check-result', result);
  }
}

export function stopAutoUpdateCheck(): void {
  if (autoCheckTimer) {
    clearInterval(autoCheckTimer);
    autoCheckTimer = null;
  }
}

// ---------- 配置文件读写 ----------
import { join } from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CONFIG_FILENAME = 'update-source.json';

export function loadUpdateSourceConfig(): UpdateSourceConfig {
  try {
    const configPath = join(app.getPath('userData'), CONFIG_FILENAME);
    if (!existsSync(configPath)) return DEFAULT_UPDATE_SOURCE;
    const raw = readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<UpdateSourceConfig>;
    return { ...DEFAULT_UPDATE_SOURCE, ...parsed };
  } catch {
    return DEFAULT_UPDATE_SOURCE;
  }
}

export function saveUpdateSourceConfig(config: UpdateSourceConfig): void {
  try {
    const configPath = join(app.getPath('userData'), CONFIG_FILENAME);
    writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
  } catch (error) {
    console.warn('[opabrow] failed to save update source config:', error);
  }
}
