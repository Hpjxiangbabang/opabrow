import { app } from 'electron';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// 单一数据根目录：应用产生的 userData / sessionData / cache / temp /
// crashDumps / logs 全部集中于此，卸载时由 NSIS 一次性删除。
//
// 优先级：
//   1) FLOATPANE_DATA_DIR 环境变量（开发或企业部署可显式指定）
//   2) 便携模式：安装目录下 FloatPane-data/（随安装地址走，卸载即清除）
//   3) 回退：appData 下 FloatPane-data/（仅当安装目录不可写，如 Program Files）
//
// 必须在 app.whenReady() 之前执行，因此本模块以 import 副作用形式加载。
// ---------------------------------------------------------------------------

export const DATA_DIR_NAME = 'FloatPane-data';

export type DataLocation = {
  root: string;
  source: 'env' | 'portable' | 'fallback';
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

function computeDataLocation(): DataLocation {
  const configured = process.env.FLOATPANE_DATA_DIR?.trim();
  if (configured) {
    const root = resolve(configured);
    if (ensureWritable(root)) return { root, source: 'env' };
  }

  if (app.isPackaged) {
    const portable = join(dirname(app.getPath('exe')), DATA_DIR_NAME);
    if (ensureWritable(portable)) return { root: portable, source: 'portable' };
  }

  const fallback = join(app.getPath('appData'), DATA_DIR_NAME);
  ensureWritable(fallback);
  return { root: fallback, source: 'fallback' };
}

export const dataLocation: DataLocation = computeDataLocation();

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

// 标记文件：供卸载脚本确认该目录属于本应用，避免误删用户目录。
try {
  writeFileSync(join(dataLocation.root, '.floatpane-data'), 'FloatPane application data\n', 'utf8');
} catch {
  // 只读环境下忽略标记写入。
}
