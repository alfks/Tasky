-- Phase 3 online projection. Existing personal rows and sessions remain independent.
CREATE TABLE social_profiles (
  id TEXT PRIMARY KEY,
  sub TEXT NOT NULL UNIQUE REFERENCES users(sub) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
  created_at INTEGER NOT NULL
);

CREATE TABLE social_pairs (
  lo TEXT NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  hi TEXT NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('none','pending','accepted')),
  requester TEXT REFERENCES social_profiles(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 0),
  requested_at INTEGER,
  PRIMARY KEY (lo, hi),
  CHECK (lo < hi),
  CHECK ((state = 'pending' AND requester IS NOT NULL AND requester IN (lo,hi)
    AND requested_at IS NOT NULL)
    OR (state <> 'pending' AND requester IS NULL AND requested_at IS NULL))
);
CREATE INDEX social_pairs_hi_state_lo ON social_pairs(hi,state,lo);
CREATE INDEX social_pairs_lo_state_hi ON social_pairs(lo,state,hi);

CREATE TABLE social_blocks (
  blocker TEXT NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  blocked TEXT NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (blocker, blocked),
  CHECK (blocker <> blocked)
);
CREATE INDEX social_blocks_blocked_blocker ON social_blocks(blocked,blocker);

CREATE TABLE social_invites (
  hash TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('active','used','revoked')),
  used_by TEXT REFERENCES social_profiles(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  CHECK ((status = 'used' AND used_by IS NOT NULL) OR (status <> 'used' AND used_by IS NULL))
);
CREATE INDEX social_invites_owner_status_expires ON social_invites(owner,status,expires_at);
CREATE INDEX social_invites_expires ON social_invites(expires_at);

CREATE TABLE social_posts (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  happened_on TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX social_posts_author_created_id ON social_posts(author,created_at DESC,id DESC);

CREATE TABLE social_reactions (
  post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  reactor TEXT NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, reactor)
);
CREATE INDEX social_reactions_reactor_post ON social_reactions(reactor,post_id);

CREATE TABLE social_commands (
  actor TEXT NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  execution_nonce TEXT NOT NULL,
  result_code TEXT NOT NULL,
  resource_id TEXT,
  result_version INTEGER CHECK (result_version IS NULL OR result_version >= 0),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (actor, key)
);
CREATE INDEX social_commands_created ON social_commands(created_at);

CREATE TABLE social_limits (
  subject TEXT NOT NULL,
  bucket TEXT NOT NULL,
  window_start INTEGER NOT NULL,
  count INTEGER NOT NULL CHECK (count >= 0),
  PRIMARY KEY (subject, bucket, window_start)
);
CREATE INDEX social_limits_window_start ON social_limits(window_start);

ALTER TABLE deleted_users ADD COLUMN execution_nonce TEXT;
