import { describe, expect, it } from 'vitest';
import type { AppSession } from './session';
import { sanitizeSession, sanitizeSessionPatch } from './session';

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

  it('rejects unsafe renderer patches', () => {
    expect(sanitizeSessionPatch({ url: 'file:///private', opacity: -4, alwaysOnTop: 'yes' })).toEqual({ opacity: 0.1 });
  });
});
