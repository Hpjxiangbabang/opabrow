import { app } from 'electron';
import { cpSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// 单一数据根目录：userData / sessionData / cache / temp / crashDumps / logs
// 全部集中于此，卸载时由 NSIS 一次性删除。
//
// v1.1.2 重要变更：不再默认「随安装目录走」。
//   根因：升级安装时安装目录可能变化，且旧卸载器会先删除安装目录内的数据，
//   导致主题、主页、历史等用户设置在升级后全部丢失（v1.1.1 实测反馈）。
//   现在默认使用与安装位置无关的稳定目录，升级不丢数据；
//   FLOATPANE_DATA_DIR 环境变量仍可把数据放到 D 盘任意位置。
//
// 优先级：
//   1) FLOATPANE_DATA_DIR（开发 / 企业部署 / 用户显式指定）
//   2) 固定 appData 下 FloatPane-data/（默认，稳定）
//
// 必须在 app.whenReady() 之前执行，因此本模块以 import 副作用形式加载。
// ---------------------------------------------------------------------------

export const DATA_DIR_NAME = 'FloatPane-data';

export type DataLocation = {
  root: string;
  source: 'env' | 'appdata';
};

function ensureWritable(directory: string): boolean {
  try {
    mkdirSync(directory, { recursive: true });
    const probe = join(directory, '.write-probe');
    writeFileSync(probe, 'ok', 'utf8');
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

// 一次性迁移：把 v1.1.0 / v1.1.1 放在安装目录下的数据搬到稳定目录。
function migrateLegacyPortableData(target: string): void {
  if (!app.isPackaged) return;
  const legacy = join(dirname(app.getPath('exe')), DATA_DIR_NAME);
  if (resolve(legacy) === resolve(target)) return;
  if (!existsSync(join(legacy, 'session.json'))) return;
  if (existsSync(join(target, 'session.json'))) return;
  try {
    cpSync(legacy, target, { recursive: true, force: false });
    console.info('[FloatPane] migrated legacy portable data to', target);
  } catch (error) {
    console.warn('[FloatPane] legacy data migration failed:', error);
  }
}

function computeDataLocation(): DataLocation {
  const configured = process.env.FLOATPANE_DATA_DIR?.trim();
  if (configured) {
    const root = resolve(configured);
    if (ensureWritable(root)) return { root, source: 'env' };
  }
  const root = join(app.getPath('appData'), DATA_DIR_NAME);
  ensureWritable(root);
  return { root, source: 'appdata' };
}

export const dataLocation: DataLocation = computeDataLocation();
migrateLegacyPortableData(dataLocation.root);

const redirectedPaths: Record<string, string> = {
  userData: dataLocation.root,
  sessionData: join(dataLocation.root, 'session'),
  cache: join(dataLocation.root, 'cache'),
  temp: join(dataLocation.root, 'temp'),
  crashDumps: join(dataLocation.root, 'crashes'),
  logs: join(dataLocation.root, 'logs')
};

for (const [name, path] of Object.entries(redirectedPaths)) {
  try {
    mkdirSync(path, { recursive: true });
    app.setPath(name, path);
  } catch (error) {
    console.warn(`[FloatPane] cannot redirect ${name} to ${path}:`, error);
  }
}

// 标记文件：供卸载脚本确认该目录属于本应用，避免误删同名用户目录。
try {
  writeFileSync(join(dataLocation.root, '.floatpane-data'), 'FloatPane application data\n', 'utf8');
} catch {
  // 只读环境下忽略标记写入。
}
