import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, join, resolve } from 'node:path';

const MAX_FIXTURE_BYTES = 128_000;

function gitDirectory() {
  try {
    let gitDir = statSync('.git').isDirectory()
      ? '.git'
      : readFileSync('.git', 'utf8')
          .trim()
          .replace(/^gitdir: /u, '');
    if (!existsSync(gitDir) && /^[A-Za-z]:[\\/]/u.test(gitDir)) {
      gitDir = `/mnt/${gitDir[0].toLowerCase()}/${gitDir.slice(3).replaceAll('\\', '/')}`;
    }
    return gitDir;
  } catch {
    throw new Error('source-git-unavailable');
  }
}

function gitOutput(args) {
  try {
    return execFileSync(
      'git',
      ['--git-dir', gitDirectory(), '--work-tree', process.cwd(), ...args],
      {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
      },
    ).trim();
  } catch {
    throw new Error('source-git-unavailable');
  }
}

export function sourceSha() {
  return gitOutput(['rev-parse', 'HEAD']);
}

export function requireCleanSource() {
  if (
    realpathSync(process.argv[1]) !== realpathSync(resolve('scripts/social-load.mjs')) ||
    gitOutput(['status', '--porcelain', '--untracked-files=all']) !== ''
  ) {
    throw new Error('source-not-clean');
  }
}

function quoted(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function identity(runId, index) {
  return {
    sub: `load-${runId}-${index.toString().padStart(2, '0')}`,
    profile: `${runId}${index.toString(16).padStart(24, '0')}`,
  };
}

function accountSql(runId, total) {
  const lines = [];
  for (let index = 0; index < total; index += 1) {
    const { sub, profile } = identity(runId, index);
    lines.push(
      `INSERT INTO users(sub,email,created_at) VALUES (${quoted(sub)},${quoted(`${sub}@example.test`)},'2026-01-01T00:00:00.000Z');`,
    );
    lines.push(
      `INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (${quoted(profile)},${quoted(sub)},'Load ${index}',0,0);`,
    );
  }
  return lines;
}

function pairSql(runId, actors, friends) {
  const lines = [];
  for (let actor = 0; actor < actors; actor += 1) {
    for (let friend = 0; friend < friends; friend += 1) {
      const a = identity(runId, actor).profile;
      const b = identity(runId, actors + friend).profile;
      lines.push(
        `INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES (${quoted(a < b ? a : b)},${quoted(a < b ? b : a)},'accepted',NULL,1,NULL);`,
      );
    }
  }
  return lines;
}

function postSql(runId, actors, friends, posts, createdAt) {
  const lines = [];
  for (let friend = 0; friend < friends; friend += 1) {
    const author = identity(runId, actors + friend).profile;
    lines.push(`WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<${posts})
      INSERT INTO social_posts(id,author,text,happened_on,created_at)
      SELECT printf('${runId}%04x%020x',${friend},i),${quoted(author)},
        printf('Synthetic %04d',i),${quoted(new Date(createdAt).toISOString().slice(0, 10))},${createdAt}-i FROM n;`);
  }
  return lines;
}

function cleanupSql(runId, total) {
  const subjects = Array.from({ length: total }, (_, i) => quoted(identity(runId, i).sub)).join(
    ',',
  );
  const profiles = Array.from({ length: total }, (_, i) => quoted(identity(runId, i).profile)).join(
    ',',
  );
  return (
    [
      `DELETE FROM social_reactions WHERE post_id IN (SELECT id FROM social_posts WHERE author IN (${profiles}));`,
      `DELETE FROM social_posts WHERE author IN (${profiles});`,
      `DELETE FROM social_invites WHERE owner IN (${profiles}) OR used_by IN (${profiles});`,
      `DELETE FROM social_commands WHERE actor IN (${profiles});`,
      `DELETE FROM social_limits WHERE subject IN (${Array.from({ length: total }, (_, i) => quoted(`p:${identity(runId, i).profile}`)).join(',')});`,
      `DELETE FROM social_blocks WHERE blocker IN (${profiles}) OR blocked IN (${profiles});`,
      `DELETE FROM social_pairs WHERE lo IN (${profiles}) OR hi IN (${profiles});`,
      `DELETE FROM social_profiles WHERE id IN (${profiles});`,
      `DELETE FROM sessions WHERE sub IN (${subjects});`,
      `DELETE FROM users WHERE sub IN (${subjects});`,
    ].join('\n') + '\n'
  );
}

export function fixtureDigest(directory, files) {
  const hash = createHash('sha256');
  for (const name of [...files, 'cleanup.sql', 'allowlist.json']) {
    if (statSync(join(directory, name)).size > MAX_FIXTURE_BYTES)
      throw new Error('fixture-checksum-mismatch');
    const bytes = readFileSync(join(directory, name));
    hash.update(`${name}:${bytes.byteLength}:`);
    hash.update(bytes);
  }
  return hash.digest('hex');
}

export function prepareFixture(directory, config) {
  mkdirSync(directory, { recursive: false });
  try {
    const lines = [
      ...accountSql(config.runId, config.actors + config.friends),
      ...pairSql(config.runId, config.actors, config.friends),
      ...postSql(config.runId, config.actors, config.friends, config.posts, config.createdAt),
    ];
    const files = [];
    let chunk = '';
    for (const line of lines) {
      if (Buffer.byteLength(chunk + line) > MAX_FIXTURE_BYTES && chunk) {
        const name = `seed-${files.length.toString().padStart(3, '0')}.sql`;
        writeFileSync(join(directory, name), chunk, { flag: 'wx' });
        files.push(name);
        chunk = '';
      }
      chunk += `${line}\n`;
    }
    if (chunk) {
      const name = `seed-${files.length.toString().padStart(3, '0')}.sql`;
      writeFileSync(join(directory, name), chunk, { flag: 'wx' });
      files.push(name);
    }
    writeFileSync(
      join(directory, 'cleanup.sql'),
      cleanupSql(config.runId, config.actors + config.friends),
      { flag: 'wx' },
    );
    writeFileSync(
      join(directory, 'allowlist.json'),
      JSON.stringify(
        Array.from({ length: config.actors }, (_, index) => identity(config.runId, index).sub),
      ),
      { flag: 'wx' },
    );
    const manifest = {
      version: 1,
      ...config,
      files,
      cleanup: 'cleanup.sql',
      fixtureSha256: fixtureDigest(directory, files),
    };
    writeFileSync(join(directory, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: 'wx',
    });
    return manifest;
  } catch (error) {
    rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}

export function readManifest(path) {
  if (statSync(path).size > 65_536) throw new Error('invalid-fixture-manifest');
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error('invalid-fixture-manifest');
  }
  if (
    manifest.version !== 1 ||
    !/^[a-f0-9]{8}$/u.test(manifest.runId) ||
    !/^[a-f0-9]{40}$/u.test(manifest.sourceSha) ||
    !Array.isArray(manifest.files) ||
    !/^[a-f0-9]{64}$/u.test(manifest.fixtureSha256) ||
    manifest.files.length < 1 ||
    manifest.files.length > 16 ||
    manifest.files.some((file) => basename(file) !== file || !/^seed-\d{3}\.sql$/u.test(file))
  ) {
    throw new Error('invalid-fixture-manifest');
  }
  return manifest;
}

export { identity };
