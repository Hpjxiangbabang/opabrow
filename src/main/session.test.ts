import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { AppSession } from './session';
import { SessionStore, sanitizeSession, sanitizeSessionPatch, sanitizeTabs } from './session';

describe('session sanitization', () => {
  it('keeps only safe browser state', () => {
    expect(
      sanitizeSession({
        url: 'https://example.com',
        opacity: 1.5,
        alwaysOnTop: true,
        clickThrough: false,
        mobileMode: true,
        bilibiliWebFullscreen: false,
        bounds: { x: 10, y: 20, width: 640, height: 480 },
        downloads: [{
          id: 'download-1',
          url: 'https://example.com/file.zip',
          filename: 'file.zip',
          savePath: '/tmp/file.zip',
          receivedBytes: 100,
          totalBytes: 200,
          state: 'completed',
          createdAt: 1
        }]
      })
    ).toMatchObject({
      url: 'https://example.com',
      opacity: 1,
      alwaysOnTop: true,
      clickThrough: false,
      mobileMode: true,
      bilibiliWebFullscreen: false,
      bounds: { x: 10, y: 20, width: 640, height: 480 },
      downloads: [{ id: 'download-1', state: 'completed' }]
    });
  });

  it('defaults bilibiliWebFullscreen to true when absent', () => {
    expect(sanitizeSession({}).bilibiliWebFullscreen).toBe(true);
  });

  it('accepts bilibiliWebFullscreen in session patch', () => {
    expect(sanitizeSessionPatch({ bilibiliWebFullscreen: false })).toEqual({ bilibiliWebFullscreen: false });
  });

  it('defaults theme to light and content protection to off', () => {
    const session = sanitizeSession({});
    expect(session.theme).toBe('light');
    expect(session.contentProtection).toBe(false);
  });

  it('accepts theme and content protection patches, rejects invalid values', () => {
    expect(sanitizeSessionPatch({ theme: 'dark', contentProtection: true })).toEqual({
      theme: 'dark',
      contentProtection: true
    });
    expect(sanitizeSessionPatch({ theme: 'neon', contentProtection: 'yes' })).toEqual({});
  });

  it('defaults trayOnlyMode to off and accepts it in patch', () => {
    expect(sanitizeSession({}).trayOnlyMode).toBe(false);
    expect(sanitizeSessionPatch({ trayOnlyMode: true })).toEqual({ trayOnlyMode: true });
    expect(sanitizeSessionPatch({ trayOnlyMode: 'yes' })).toEqual({});
  });

  it('defaults click-through to off (v1.1.1)', () => {
    expect(sanitizeSession({}).clickThrough).toBe(false);
    expect(sanitizeSession({ clickThrough: true }).clickThrough).toBe(true);
    expect(sanitizeSession({ clickThrough: 'yes' } as unknown as Partial<AppSession>).clickThrough).toBe(false);
    expect(sanitizeSessionPatch({ clickThrough: true })).toEqual({ clickThrough: true });
  });

  it('persists browser state fields (v1.1.2)', () => {
    const session = sanitizeSession({
      homeUrl: 'https://example.org/',
      history: [{ url: 'https://example.org/a', title: 'A', visitedAt: 1 }],
      tabs: [{ id: 't1', url: 'https://example.org/a', title: 'A' }],
      activeTabId: 't1',
      confirmOnQuit: false
    });
    expect(session.homeUrl).toBe('https://example.org/');
    expect(session.history).toHaveLength(1);
    expect(session.tabs).toHaveLength(1);
    expect(session.activeTabId).toBe('t1');
    expect(session.confirmOnQuit).toBe(false);
    expect(sanitizeSession({}).confirmOnQuit).toBe(true);
    expect(sanitizeSession({ homeUrl: 'javascript:alert(1)' }).homeUrl).toBeNull();
    expect(sanitizeTabs([{ id: '', url: 'x' }, { id: 'ok', url: null }])).toHaveLength(1);
    expect(sanitizeSessionPatch({ homeUrl: 'https://a.test', history: [] })).toEqual({
      homeUrl: 'https://a.test', history: []
    });
  });

  it('persists settings immediately and flushes synchronously (v1.1.2)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'floatpane-session-'));
    const file = join(dir, 'session.json');
    try {
      const store = new SessionStore(file);
      await store.load();
      store.update({ theme: 'dark', homeUrl: 'https://example.org/' });
      await store.flush();
      const first = JSON.parse(readFileSync(file, 'utf8')) as AppSession;
      expect(first.theme).toBe('dark');
      expect(first.homeUrl).toBe('https://example.org/');

      store.update({ confirmOnQuit: false });
      store.flushSync();
      const second = JSON.parse(readFileSync(file, 'utf8')) as AppSession;
      expect(second.confirmOnQuit).toBe(false);
      expect(second.theme).toBe('dark');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('rejects unsafe renderer patches', () => {
    expect(sanitizeSessionPatch({ url: 'file:///private', opacity: -4, alwaysOnTop: 'yes' })).toEqual({ opacity: 0.1 });
  });
});
