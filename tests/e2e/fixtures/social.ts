// 읽기 조건: 소셜 두 계정 E2E의 로컬 Worker/D1 기동과 정리를 바꿀 때.
// 인증 쿠키만 AUTH_STUB으로 만들고, 소셜 요청은 격리된 실제 loopback Worker/D1으로 보낸다.
import { spawn, execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { test as base, expect, randomAccount } from './stub-login';

import type { Account } from './stub-login';
import type { ChildProcess } from 'node:child_process';

const execFile = promisify(execFileCallback);
const root = process.cwd();
const wrangler = join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

type Mode = 'enabled' | 'read-only' | 'off';
export type SocialServer = {
  origin: string;
  a: Account;
  b: Account;
  setMode: (mode: Mode) => Promise<void>;
};

async function freePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('No loopback port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return address.port;
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

async function sourceIdentity(): Promise<{ commit: string; tree: string; asset: string }> {
  const git = async (...args: string[]) =>
    (await execFile('git', args, { cwd: root, timeout: 10_000 })).stdout.trim();
  if ((await git('status', '--porcelain')) !== '') throw new Error('social E2E source is dirty');
  const index = join(root, 'dist', 'client', 'index.html');
  if (!existsSync(index)) throw new Error('Run the production build before social E2E');
  return {
    commit: await git('rev-parse', 'HEAD'),
    tree: await git('rev-parse', 'HEAD^{tree}'),
    asset: sha256(readFileSync(index)),
  };
}

async function waitForWorker(
  child: ChildProcess,
  origin: string,
  asset: string,
  spawnError: () => Error | null,
): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const failure = spawnError();
    if (failure !== null) throw failure;
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`social Worker exited before ready: ${child.exitCode}/${child.signalCode}`);
    try {
      const response = await fetch(origin, { signal: AbortSignal.timeout(1500) });
      if (response.ok) {
        const served = sha256(await response.text());
        if (served !== asset) throw new Error('served index differs from built source');
        return;
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'served index differs from built source')
        throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('social Worker did not become ready in 45 seconds');
}

async function exitsWithin(exited: Promise<void>, ms: number): Promise<boolean> {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      exited.then(() => true),
      new Promise<false>((resolve) => {
        timeout = setTimeout(() => resolve(false), ms);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function stopWorker(child: ChildProcess | null): Promise<void> {
  if (
    child === null ||
    child.pid === undefined ||
    child.exitCode !== null ||
    child.signalCode !== null
  )
    return;
  const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
  // Only the process tree started here is targeted; another Wrangler is never pattern-killed.
  if (process.platform === 'win32') {
    try {
      await execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { timeout: 10_000 });
    } catch (error) {
      if (child.exitCode === null && child.signalCode === null) throw error;
    }
    if (!(await exitsWithin(exited, 5000))) throw new Error('social Worker tree did not exit');
    return;
  }
  try {
    process.kill(-child.pid, 'SIGTERM');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return;
    throw error;
  }
  const graceful = await exitsWithin(exited, 5000);
  if (!graceful) {
    try {
      process.kill(-child.pid, 'SIGKILL');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
    }
    if (!(await exitsWithin(exited, 5000))) throw new Error('social Worker group did not exit');
  }
}

export const test = base.extend<{ social: SocialServer }>({
  social: async ({}, provide) => {
    if (!existsSync(wrangler)) throw new Error('Wrangler is not installed');
    const identity = await sourceIdentity();
    const a = randomAccount();
    const b = randomAccount();
    const port = await freePort();
    const origin = `http://127.0.0.1:${port}`;
    const persist = mkdtempSync(join(tmpdir(), 'tasky-social-e2e-'));
    const allowlist = JSON.stringify([a.sub, b.sub]);
    let child: ChildProcess | null = null;
    let tail = '';
    let spawnError: Error | null = null;
    const start = async (mode: Mode) => {
      spawnError = null;
      child = spawn(
        process.execPath,
        [
          wrangler,
          'dev',
          '--config',
          'wrangler.jsonc',
          '--ip',
          '127.0.0.1',
          '--port',
          String(port),
          '--persist-to',
          persist,
          '--var',
          'AUTH_STUB:1',
          '--var',
          'SESSION_SECRET:social-e2e',
          '--var',
          `SOCIAL_MODE:${mode}`,
          '--var',
          `SOCIAL_ALLOWLIST:${allowlist}`,
        ],
        { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32' },
      );
      child.once('error', (error) => {
        spawnError = error;
      });
      for (const stream of [child.stdout, child.stderr]) {
        stream?.on('data', (chunk: Buffer) => {
          tail = (tail + chunk.toString()).slice(-8192);
        });
      }
      try {
        await waitForWorker(child, origin, identity.asset, () => spawnError);
      } catch (error) {
        const safeTail = tail
          .replaceAll(a.sub, '[actor]')
          .replaceAll(b.sub, '[actor]')
          .replaceAll('social-e2e', '[secret]');
        throw new Error(`${String(error)}\nWrangler tail:\n${safeTail}`);
      }
      process.stdout.write(`social-e2e source ${JSON.stringify({ ...identity, port, mode })}\n`);
    };
    try {
      await execFile(
        process.execPath,
        [wrangler, 'd1', 'migrations', 'apply', 'tasky', '--local', '--persist-to', persist],
        { cwd: root, timeout: 60_000, maxBuffer: 1024 * 1024 },
      );
      await start('enabled');
      await provide({
        origin,
        a,
        b,
        setMode: async (mode) => {
          await stopWorker(child);
          child = null;
          await start(mode);
        },
      });
    } finally {
      await stopWorker(child);
      rmSync(persist, { recursive: true, force: true });
    }
  },
});

export { expect };
