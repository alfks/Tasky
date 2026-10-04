import { execFile } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { describe, expect, it } from 'vitest';

const execute = promisify(execFile);
const script = fileURLToPath(new URL('../../scripts/social-load.mjs', import.meta.url));
const SMALL =
  '--actors 1 --friends 1 --posts 1 --duration-ms 100 --interval-ms 100 --rounds 1'.split(' ');
async function cli(
  args: string[],
  repo?: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const result = await execute(
      process.execPath,
      [repo ? join(repo, 'scripts/social-load.mjs') : script, ...args],
      { timeout: 10_000, cwd: repo ?? process.cwd() },
    );
    return { code: 0, ...result };
  } catch (error) {
    const failed = error as Error & { code: number; stdout: string; stderr: string };
    return { code: failed.code, stdout: failed.stdout, stderr: failed.stderr };
  }
}

async function cleanRepo(root: string): Promise<string> {
  const repo = join(root, 'source');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  for (const name of ['social-load.mjs', 'social-load-fixture.mjs', 'social-load-report.mjs']) {
    copyFileSync(
      fileURLToPath(new URL(`../../scripts/${name}`, import.meta.url)),
      join(repo, 'scripts', name),
    );
  }
  await execute('git', ['init', '-q'], { cwd: repo });
  await execute('git', ['add', 'scripts'], { cwd: repo });
  await execute(
    'git',
    [
      '-c',
      'user.name=alfks',
      '-c',
      'user.email=millie020524@gmail.com',
      'commit',
      '-qm',
      'test fixture source',
    ],
    { cwd: repo },
  );
  return repo;
}

async function server(mode: 'good' | 'redirect' | 'auth-fail' | 'slow'): Promise<{
  instance: Server;
  url: string;
  requests: () => number;
  cookies: () => string[];
}> {
  let requests = 0;
  const cookies: string[] = [];
  const instance = createServer((request, response) => {
    requests += 1;
    if (request.url?.startsWith('/auth/stub-login')) {
      if (mode === 'auth-fail') response.writeHead(401).end();
      else {
        const sub = new URL(request.url, 'http://localhost').searchParams.get('sub');
        response
          .writeHead(302, { Location: '/', 'Set-Cookie': `tasky_session=${sub}; HttpOnly` })
          .end();
      }
    } else if (mode === 'redirect') {
      cookies.push(request.headers.cookie ?? '');
      response.writeHead(302, { Location: 'https://example.test/escape' }).end();
    } else {
      cookies.push(request.headers.cookie ?? '');
      response.writeHead(200, { 'Content-Type': 'application/json' });
      const respond = () =>
        response.end(JSON.stringify({ data: { items: [{ id: 'synthetic' }] } }));
      if (mode === 'slow') setTimeout(respond, 250);
      else respond();
    }
  });
  await new Promise<void>((resolve) => instance.listen(0, '127.0.0.1', resolve));
  const address = instance.address();
  if (typeof address !== 'object' || address === null) throw new Error('Missing local address');
  return {
    instance,
    url: `http://127.0.0.1:${address.port}/`,
    requests: () => requests,
    cookies: () => cookies,
  };
}

async function close(instance: Server): Promise<void> {
  await new Promise<void>((resolve, reject) =>
    instance.close((error) => (error ? reject(error) : resolve())),
  );
}

describe('social load CLI safety boundary', () => {
  it('prints a network-free default plan with bounded target shape', async () => {
    const result = await cli([]);
    expect(result.code).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      mode: 'plan',
      localOnly: true,
      networkRequests: 0,
      fixturePosts: 50_000,
      estimatedFeedRequests: 600,
    });
  });
  it('rejects remote URLs and oversized request budgets before touching a server', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tasky-load-test-'));
    try {
      const repo = await cleanRepo(root);
      const directory = join(root, 'fixture');
      expect((await cli(['--prepare', directory, ...SMALL], repo)).code).toBe(0);
      const manifest = join(directory, 'manifest.json');
      const remote = await cli(
        ['--run', '--manifest', manifest, '--url', 'https://example.test/', ...SMALL],
        repo,
      );
      expect(remote.code).toBe(1);
      expect(JSON.parse(remote.stdout).failure.code).toBe('loopback-http-url-required');
      const ipv6 = await cli(
        ['--run', '--manifest', manifest, '--url', 'http://[::1]:8787/', ...SMALL],
        repo,
      );
      expect(JSON.parse(ipv6.stdout).failure.code).toBe('loopback-http-url-required');
      const budget = await cli(['--duration-ms', '300000', '--interval-ms', '100']);
      expect(budget.code).toBe(1);
      expect(budget.stderr).toContain('request-budget-exceeded');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('executes a bounded local request and refuses a feed redirect without contacting its target', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tasky-load-test-'));
    const good = await server('good');
    const redirect = await server('redirect');
    const slow = await server('slow');
    try {
      const repo = await cleanRepo(root);
      const directory = join(root, 'fixture');
      expect((await cli(['--prepare', directory, ...SMALL], repo)).code).toBe(0);
      const manifest = join(directory, 'manifest.json');
      const args = ['--run', '--manifest', manifest, ...SMALL];
      const success = await cli([...args, '--url', good.url], repo);
      expect(success.code).toBe(0);
      expect(JSON.parse(success.stdout)).toMatchObject({
        status: 'complete',
        scenario: {
          durationMs: 100,
          intervalMs: 100,
          rounds: 1,
        },
        rounds: [{ sampleCount: 1, statusCounts: { 200: 1 }, failures: {} }],
      });
      const rejected = await cli([...args, '--url', redirect.url], repo);
      expect(rejected.code).toBe(1);
      expect(JSON.parse(rejected.stdout).status).toBe('failed');
      expect(JSON.parse(rejected.stdout).rounds[0].failures).toEqual({ 'redirect-rejected': 1 });
      expect(redirect.requests()).toBe(2); // one identity request and one feed request
      expect(rejected.stdout).not.toContain('tasky_session=');
      expect(rejected.stdout).not.toContain('https://example.test/escape');
      const slowShape = [...SMALL];
      slowShape[slowShape.indexOf('--duration-ms') + 1] = '200';
      const slowDir = join(root, 'slow');
      expect((await cli(['--prepare', slowDir, ...slowShape], repo)).code).toBe(0);
      const delayed = await cli(
        ['--run', '--manifest', join(slowDir, 'manifest.json'), '--url', slow.url, ...slowShape],
        repo,
      );
      expect(delayed.code).toBe(0);
      expect(JSON.parse(delayed.stdout).rounds[0].sampleCount).toBe(1);
      expect(slow.requests()).toBe(2); // login + one feed; deadline forbids the second tick
    } finally {
      await close(good.instance);
      await close(redirect.instance);
      await close(slow.instance);
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('uses separate identity cookies for active actors and records authentication failure', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tasky-load-test-'));
    const good = await server('good');
    const denied = await server('auth-fail');
    try {
      const repo = await cleanRepo(root);
      const directory = join(root, 'fixture');
      const pair = [
        '--actors',
        '2',
        '--friends',
        '1',
        '--posts',
        '1',
        '--duration-ms',
        '100',
        '--interval-ms',
        '100',
        '--rounds',
        '1',
      ];
      expect((await cli(['--prepare', directory, ...pair], repo)).code).toBe(0);
      const manifest = join(directory, 'manifest.json');
      const args = ['--run', '--manifest', manifest, ...pair];
      const success = await cli([...args, '--url', good.url], repo);
      expect(success.code).toBe(0);
      expect(JSON.parse(success.stdout).rounds[0].sampleCount).toBe(2);
      expect(new Set(good.cookies()).size).toBe(2);
      expect(
        good.cookies().every((cookie) => /^tasky_session=load-[a-f0-9]{8}-0[01]$/u.test(cookie)),
      ).toBe(true);
      const failed = await cli([...args, '--url', denied.url], repo);
      expect(failed.code).toBe(1);
      expect(JSON.parse(failed.stdout)).toMatchObject({
        status: 'failed',
        failure: { phase: 'identity-or-run', code: 'stub-login-failed' },
      });
      expect(failed.stdout).not.toContain('tasky_session=');
    } finally {
      await close(good.instance);
      await close(denied.instance);
      rmSync(root, { recursive: true, force: true });
    }
  });
  it('rejects changed cadence, seed SQL and dirty source before making a request', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tasky-load-test-'));
    const good = await server('good');
    try {
      const repo = await cleanRepo(root);
      const directory = join(root, 'fixture');
      expect((await cli(['--prepare', directory, ...SMALL], repo)).code).toBe(0);
      const manifest = join(directory, 'manifest.json');
      const base = ['--run', '--manifest', manifest, '--url', good.url];
      const changed = await cli(
        [
          ...base,
          ...SMALL.slice(0, -6),
          '--duration-ms',
          '200',
          '--interval-ms',
          '100',
          '--rounds',
          '1',
        ],
        repo,
      );
      expect(JSON.parse(changed.stdout).failure.code).toBe('fixture-source-or-shape-mismatch');
      expect(good.requests()).toBe(0);
      const seedFile = join(directory, JSON.parse(readFileSync(manifest, 'utf8')).files[0]);
      const originalSeed = readFileSync(seedFile, 'utf8');
      appendFileSync(seedFile, '\n-- changed\n');
      const changedSeed = await cli([...base, ...SMALL], repo);
      expect(JSON.parse(changedSeed.stdout).failure.code).toBe('fixture-checksum-mismatch');
      expect(good.requests()).toBe(0);
      writeFileSync(seedFile, originalSeed);
      appendFileSync(join(repo, 'scripts/social-load.mjs'), '\n// dirty\n');
      const dirty = await cli([...base, ...SMALL], repo);
      expect(JSON.parse(dirty.stdout).failure.code).toBe('source-not-clean');
      expect(good.requests()).toBe(0);
    } finally {
      await close(good.instance);
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not overwrite an existing fixture directory when preparation fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'tasky-load-test-'));
    try {
      const directory = join(root, 'fixture');
      const first = await cli(['--prepare', directory, ...SMALL]);
      expect(first.code).toBe(0);
      const original = readFileSync(join(directory, 'manifest.json'), 'utf8');
      writeFileSync(join(directory, 'sentinel'), 'keep');
      const second = await cli(['--prepare', directory, ...SMALL]);
      expect(second.code).toBe(1);
      expect(readdirSync(directory)).toContain('sentinel');
      expect(readFileSync(join(directory, 'manifest.json'), 'utf8')).toBe(original);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
