// 轻量级 SemVer 实现,不依赖外部包。
// 支持 "1.0.0", "1.0.0-beta.1", "1.0" (补0) 格式。

export class SemVer {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];

  constructor(version: string) {
    const cleaned = version.trim().replace(/^v/i, '');
    const [main, pre] = cleaned.split('-');
    const parts = main.split('.');
    this.major = parseInt(parts[0] ?? '0', 10) || 0;
    this.minor = parseInt(parts[1] ?? '0', 10) || 0;
    this.patch = parseInt(parts[2] ?? '0', 10) || 0;
    this.prerelease = pre ? pre.split('.') : [];
  }
}

export function compare(a: SemVer, b: SemVer): number {
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  // 有预发布标签 < 无预发布标签
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;

  // 逐个比较预发布标签
  for (let i = 0; i < Math.max(a.prerelease.length, b.prerelease.length); i++) {
    const ap = a.prerelease[i];
    const bp = b.prerelease[i];
    if (ap === undefined && bp !== undefined) return -1;
    if (ap !== undefined && bp === undefined) return 1;
    if (ap === bp) continue;
    const an = parseInt(ap, 10);
    const bn = parseInt(bp, 10);
    if (!isNaN(an) && !isNaN(bn)) {
      return an > bn ? 1 : -1;
    }
    return ap > bp ? 1 : -1;
  }
  return 0;
}
