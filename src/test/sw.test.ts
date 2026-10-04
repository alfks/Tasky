import { afterEach, expect, it, vi } from 'vitest';

const observed = vi.hoisted(() => ({ options: [] as unknown[], listeners: 0 }));

vi.mock('serwist', () => ({
  Serwist: class {
    constructor(options: unknown) {
      observed.options.push(options);
    }

    addEventListeners() {
      observed.listeners += 1;
    }
  },
}));

afterEach(() => vi.unstubAllGlobals());

it('keeps the service worker on static precache only, so social HTTP is never stored offline', async () => {
  vi.stubGlobal('self', { __SW_MANIFEST: [{ url: 'index.html', revision: 'test' }] });
  // vi.importActual executes the SW entry while keeping its WebWorker-only types out of
  // the DOM app tsconfig; tsconfig.sw.json checks that entry separately.
  await vi.importActual('@/sw');
  expect(observed.listeners).toBe(1);
  expect(observed.options).toEqual([
    {
      precacheEntries: [{ url: 'index.html', revision: 'test' }],
      skipWaiting: false,
      clientsClaim: true,
      navigationPreload: false,
      precacheOptions: { cleanupOutdatedCaches: true },
    },
  ]);
});
