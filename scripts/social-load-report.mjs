import { performance } from 'node:perf_hooks';

export function percentile(samples, percent) {
  if (samples.length === 0) return null;
  const ordered = [...samples].sort((a, b) => a - b);
  return ordered[Math.ceil((percent / 100) * ordered.length) - 1];
}

export function createReport(config) {
  return {
    runId: config.runId,
    sourceSha: config.sourceSha,
    sourceVerifiedClean: true,
    fixtureSha256: config.fixtureSha256,
    seed: config.seed,
    scenario: {
      actors: config.actors,
      friends: config.friends,
      postsPerFriend: config.posts,
      durationMs: config.durationMs,
      intervalMs: config.intervalMs,
      rounds: config.rounds,
    },
    command: `node scripts/social-load.mjs --run --manifest <fixture> --url <loopback> --actors ${config.actors} --friends ${config.friends} --posts ${config.posts} --duration-ms ${config.durationMs} --interval-ms ${config.intervalMs} --rounds ${config.rounds}`,
    startedAt: new Date().toISOString(),
    localOnly: true,
    serverIdentity: 'unverified-loopback',
    rounds: [],
  };
}

export function finishRound(startedAt, samples, statuses, failures, elapsedMs) {
  return {
    startedAt,
    completedAt: new Date().toISOString(),
    elapsedMs,
    sampleCount: samples.length,
    latencyMs: {
      p50: percentile(samples, 50),
      p95: percentile(samples, 95),
      p99: percentile(samples, 99),
    },
    statusCounts: statuses,
    failures,
  };
}

export async function measureRound(cookies, config, probe, failureCode) {
  const startedAt = new Date().toISOString();
  const started = performance.now();
  const deadline = started + config.durationMs;
  const samples = [];
  const statuses = {};
  const failures = {};
  for (let tick = 0; tick * config.intervalMs < config.durationMs; tick += 1) {
    if (performance.now() >= deadline) break;
    await Promise.all(
      cookies.map(async (cookie) => {
        if (performance.now() >= deadline) return;
        try {
          const result = await probe(cookie);
          statuses[result.status] = (statuses[result.status] ?? 0) + 1;
          if (result.status === 200) samples.push(result.elapsed);
          else failures[`status-${result.status}`] = (failures[`status-${result.status}`] ?? 0) + 1;
        } catch (error) {
          const code = failureCode(error);
          failures[code] = (failures[code] ?? 0) + 1;
        }
      }),
    );
    const nextTick = started + (tick + 1) * config.intervalMs;
    if (nextTick >= deadline) break;
    const remaining = nextTick - performance.now();
    if (remaining > 0) await new Promise((done) => setTimeout(done, remaining));
  }
  return finishRound(
    startedAt,
    samples,
    statuses,
    failures,
    Math.round(performance.now() - started),
  );
}
