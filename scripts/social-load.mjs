#!/usr/bin/env node
// Local-only bounded HTTP probe. Default mode does not open a socket or create files.
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import {
  fixtureDigest,
  identity,
  prepareFixture,
  readManifest,
  requireCleanSource,
  sourceSha,
} from './social-load-fixture.mjs';
import { createReport, measureRound } from './social-load-report.mjs';

const DEFAULTS = {
  actors: 20,
  friends: 50,
  posts: 1000,
  durationMs: 300_000,
  intervalMs: 30_000,
  rounds: 3,
};
const MAX_RESPONSE_BYTES = 1_048_576;
const REQUEST_TIMEOUT_MS = 5_000;
const ALLOWED = new Set([
  '--prepare',
  '--run',
  '--manifest',
  '--url',
  '--actors',
  '--friends',
  '--posts',
  '--duration-ms',
  '--interval-ms',
  '--rounds',
]);

function fail(code) {
  throw new Error(code);
}

function emitJson(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function options(argv) {
  const parsed = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!ALLOWED.has(key) || key in parsed) fail('invalid-option');
    if (key === '--run') parsed[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) fail('missing-option-value');
      parsed[key] = argv[++i];
    }
  }
  if (parsed['--run'] && parsed['--prepare']) fail('conflicting-modes');
  if (!parsed['--run'] && (parsed['--url'] || parsed['--manifest'])) fail('run-required');
  if (parsed['--run'] && (!parsed['--manifest'] || !parsed['--url']))
    fail('manifest-and-url-required');
  return parsed;
}

function bounded(value, fallback, maximum, name) {
  const actual = value === undefined ? fallback : Number(value);
  if (!Number.isSafeInteger(actual) || actual < 1 || actual > maximum) fail(`invalid-${name}`);
  return actual;
}

function scenario(parsed) {
  const result = {
    actors: bounded(parsed['--actors'], DEFAULTS.actors, 20, 'actors'),
    friends: bounded(parsed['--friends'], DEFAULTS.friends, 50, 'friends'),
    posts: bounded(parsed['--posts'], DEFAULTS.posts, 1000, 'posts'),
    durationMs: bounded(parsed['--duration-ms'], DEFAULTS.durationMs, 300_000, 'duration'),
    intervalMs: bounded(parsed['--interval-ms'], DEFAULTS.intervalMs, 30_000, 'interval'),
    rounds: bounded(parsed['--rounds'], DEFAULTS.rounds, 3, 'rounds'),
  };
  if (
    result.intervalMs < 100 ||
    result.durationMs < 100 ||
    result.intervalMs > result.durationMs ||
    result.actors * Math.ceil(result.durationMs / result.intervalMs) * result.rounds > 6000
  ) {
    fail('request-budget-exceeded');
  }
  return result;
}

function localUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail('invalid-local-url');
  }
  if (
    url.protocol !== 'http:' ||
    !['127.0.0.1', 'localhost'].includes(url.hostname) ||
    !url.port ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    fail('loopback-http-url-required');
  }
  return url;
}

async function readBounded(response) {
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body ?? []) {
    size += chunk.byteLength;
    if (size > MAX_RESPONSE_BYTES) {
      await response.body?.cancel().catch(() => {});
      fail('response-too-large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function login(base, runId, index) {
  const { sub } = identity(runId, index);
  const url = new URL('/auth/stub-login', base);
  url.searchParams.set('sub', sub);
  url.searchParams.set('email', `${sub}@example.test`);
  const response = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status !== 302 || response.headers.get('location') !== '/')
    fail('stub-login-failed');
  const cookie = response.headers.get('set-cookie')?.split(';', 1)[0];
  if (!cookie || !/^tasky_session=/u.test(cookie)) fail('stub-cookie-missing');
  return cookie;
}

function failureCode(error) {
  if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return 'timeout';
  if (
    [
      'redirect-rejected',
      'response-too-large',
      'empty-feed',
      'invalid-json',
      'stub-login-failed',
      'stub-cookie-missing',
    ].includes(error?.message)
  )
    return error.message;
  return 'network-or-protocol';
}

function validationCode(error) {
  const allowed = new Set([
    'invalid-fixture-manifest',
    'fixture-source-or-shape-mismatch',
    'fixture-checksum-mismatch',
    'source-not-clean',
    'source-git-unavailable',
    'invalid-local-url',
    'loopback-http-url-required',
  ]);
  return allowed.has(error?.message) ? error.message : 'invalid-input-or-filesystem';
}

async function probe(base, cookie) {
  const started = performance.now();
  const response = await fetch(new URL('/api/social/feed?limit=20', base), {
    headers: { Cookie: cookie, Origin: base.origin, 'X-Tasky': '1' },
    redirect: 'manual',
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (response.status >= 300 && response.status < 400) fail('redirect-rejected');
  const body = await readBounded(response);
  const elapsed = Math.round(performance.now() - started);
  if (response.status === 200) {
    let parsed;
    try {
      parsed = JSON.parse(body);
    } catch {
      fail('invalid-json');
    }
    if (!Array.isArray(parsed?.data?.items) || parsed.data.items.length === 0) fail('empty-feed');
  }
  return { status: response.status, elapsed };
}

async function run(parsed, config) {
  const manifest = readManifest(resolve(parsed['--manifest']));
  if (
    manifest.sourceSha !== sourceSha() ||
    ['actors', 'friends', 'posts', 'durationMs', 'intervalMs', 'rounds'].some(
      (key) => manifest[key] !== config[key],
    )
  )
    fail('fixture-source-or-shape-mismatch');
  if (
    fixtureDigest(dirname(resolve(parsed['--manifest'])), manifest.files) !== manifest.fixtureSha256
  ) {
    fail('fixture-checksum-mismatch');
  }
  requireCleanSource();
  const base = localUrl(parsed['--url']);
  const report = createReport({ ...manifest, ...config, seed: manifest.runId });
  try {
    const cookies = [];
    for (let i = 0; i < config.actors; i += 1) cookies.push(await login(base, manifest.runId, i));
    for (let round = 0; round < config.rounds; round += 1)
      report.rounds.push(
        await measureRound(cookies, config, (cookie) => probe(base, cookie), failureCode),
      );
    report.status = report.rounds.some((item) => Object.keys(item.failures).length > 0)
      ? 'failed'
      : 'complete';
  } catch (error) {
    report.status = 'failed';
    report.failure = { phase: 'identity-or-run', code: failureCode(error) };
  }
  report.completedAt = new Date().toISOString();
  emitJson(report);
  if (report.status !== 'complete') process.exitCode = 1;
}

async function main() {
  const parsed = options(process.argv.slice(2));
  const config = scenario(parsed);
  if (parsed['--run']) {
    try {
      return await run(parsed, config);
    } catch (error) {
      emitJson({
        mode: 'run',
        status: 'failed',
        completedAt: new Date().toISOString(),
        failure: { phase: 'validation', code: validationCode(error) },
      });
      process.exitCode = 1;
      return;
    }
  }
  if (parsed['--prepare']) {
    const manifest = prepareFixture(resolve(parsed['--prepare']), {
      runId: randomBytes(4).toString('hex'),
      sourceSha: sourceSha(),
      createdAt: Date.now(),
      ...config,
    });
    emitJson({
      mode: 'fixture',
      manifest: resolve(parsed['--prepare'], 'manifest.json'),
      runId: manifest.runId,
      sourceSha: manifest.sourceSha,
      sourceState: 'HEAD-only-unverified',
      fixtureSha256: manifest.fixtureSha256,
      seedFiles: manifest.files.length,
    });
    return;
  }
  emitJson({
    mode: 'plan',
    localOnly: true,
    sourceSha: sourceSha(),
    sourceState: 'HEAD-only-unverified',
    scenario: config,
    estimatedFeedRequests:
      config.actors * Math.ceil(config.durationMs / config.intervalMs) * config.rounds,
    fixturePosts: config.friends * config.posts,
    networkRequests: 0,
  });
}

try {
  await main();
} catch (error) {
  console.error(
    `social-load: ${error?.message?.startsWith('E') ? 'filesystem-error' : (error?.message ?? 'failed')}`,
  );
  process.exitCode = 1;
}
