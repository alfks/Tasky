-- Public indexes are hints: readers still check canonical category/account/policy ACL.
CREATE TABLE social_categories (
  id TEXT PRIMARY KEY,
  owner TEXT NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  emoji TEXT,
  visibility TEXT NOT NULL CHECK (visibility IN ('private','friends','public')),
  version INTEGER NOT NULL CHECK (version >= 0),
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER,
  CHECK (deleted_at IS NULL OR visibility = 'private')
);
CREATE INDEX social_categories_owner_id ON social_categories(owner,id);
CREATE INDEX social_categories_owner_live_id ON social_categories(owner,id) WHERE deleted_at IS NULL;
CREATE INDEX social_categories_gc ON social_categories(updated_at,id) WHERE deleted_at IS NOT NULL;
CREATE INDEX social_categories_owner_visibility_id ON social_categories(owner,visibility,id);
ALTER TABLE social_posts ADD COLUMN category_id TEXT REFERENCES social_categories(id);
CREATE INDEX social_posts_category_id ON social_posts(category_id,id);

CREATE TABLE social_public_categories (
  id TEXT PRIMARY KEY REFERENCES social_categories(id) ON DELETE CASCADE
);
CREATE TABLE social_public_posts (
  id TEXT PRIMARY KEY REFERENCES social_posts(id) ON DELETE CASCADE,
  category_id TEXT NOT NULL REFERENCES social_categories(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX social_public_posts_created_id ON social_public_posts(created_at DESC,id DESC);
CREATE INDEX social_public_posts_category_created_id ON social_public_posts(category_id,created_at DESC,id DESC);

CREATE TABLE social_friend_posts (
  id TEXT PRIMARY KEY REFERENCES social_posts(id) ON DELETE CASCADE,
  author TEXT NOT NULL REFERENCES social_profiles(id) ON DELETE CASCADE,
  category_id TEXT REFERENCES social_categories(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);
CREATE INDEX social_friend_posts_author_created_id ON social_friend_posts(author,created_at DESC,id DESC);
CREATE INDEX social_friend_posts_category_id ON social_friend_posts(category_id,id);

-- Category updates affect at most the owner's 1000 retained copies; legacy NULL stays friends-only.
CREATE TRIGGER social_category_public_insert AFTER INSERT ON social_categories
WHEN NEW.visibility = 'public' AND NEW.deleted_at IS NULL
BEGIN
  INSERT INTO social_public_categories(id) VALUES(NEW.id);
END;
CREATE TRIGGER social_category_visibility_update AFTER UPDATE OF visibility,deleted_at ON social_categories
WHEN OLD.visibility IS NOT NEW.visibility OR OLD.deleted_at IS NOT NEW.deleted_at
BEGIN
  DELETE FROM social_public_categories WHERE id = OLD.id;
  DELETE FROM social_public_posts WHERE category_id = OLD.id;
  DELETE FROM social_friend_posts WHERE category_id = OLD.id;
  INSERT INTO social_public_categories(id)
    SELECT NEW.id WHERE NEW.visibility = 'public' AND NEW.deleted_at IS NULL;
  INSERT INTO social_public_posts(id,category_id,created_at)
    SELECT p.id,NEW.id,p.created_at FROM social_posts p
    WHERE p.category_id = NEW.id AND p.author = NEW.owner
      AND NEW.visibility = 'public' AND NEW.deleted_at IS NULL;
  INSERT INTO social_friend_posts(id,author,category_id,created_at)
    SELECT p.id,p.author,NEW.id,p.created_at FROM social_posts p
    WHERE p.category_id = NEW.id AND p.author = NEW.owner
      AND NEW.visibility IN ('friends','public') AND NEW.deleted_at IS NULL;
END;
CREATE TRIGGER social_category_public_delete BEFORE DELETE ON social_categories
BEGIN
  DELETE FROM social_public_posts WHERE category_id = OLD.id;
  DELETE FROM social_public_categories WHERE id = OLD.id;
  DELETE FROM social_friend_posts WHERE category_id = OLD.id;
END;
CREATE TRIGGER social_post_public_insert AFTER INSERT ON social_posts
BEGIN
  INSERT INTO social_public_posts(id,category_id,created_at)
    SELECT NEW.id,c.id,NEW.created_at FROM social_categories c
    WHERE c.id = NEW.category_id AND c.owner = NEW.author
      AND c.visibility = 'public' AND c.deleted_at IS NULL;
  INSERT INTO social_friend_posts(id,author,category_id,created_at)
    SELECT NEW.id,NEW.author,NEW.category_id,NEW.created_at
    WHERE NEW.category_id IS NULL OR EXISTS (SELECT 1 FROM social_categories c
      WHERE c.id = NEW.category_id AND c.owner = NEW.author
        AND c.visibility IN ('friends','public') AND c.deleted_at IS NULL);
END;
CREATE TRIGGER social_post_public_delete BEFORE DELETE ON social_posts
BEGIN
  DELETE FROM social_public_posts WHERE id = OLD.id;
  DELETE FROM social_friend_posts WHERE id = OLD.id;
END;

-- Explicit backfill is safe even if a future rollout applies this after staged projection data.
INSERT INTO social_public_categories(id)
  SELECT id FROM social_categories WHERE visibility = 'public' AND deleted_at IS NULL;
INSERT INTO social_public_posts(id,category_id,created_at)
  SELECT p.id,c.id,p.created_at FROM social_posts p JOIN social_categories c ON c.id = p.category_id
  WHERE c.owner = p.author AND c.visibility = 'public' AND c.deleted_at IS NULL;

CREATE TRIGGER social_post_visibility_update AFTER UPDATE OF category_id,author,created_at ON social_posts
BEGIN
  DELETE FROM social_public_posts WHERE id = OLD.id;
  DELETE FROM social_friend_posts WHERE id = OLD.id;
  INSERT INTO social_public_posts(id,category_id,created_at)
    SELECT NEW.id,c.id,NEW.created_at FROM social_categories c
    WHERE c.id = NEW.category_id AND c.owner = NEW.author
      AND c.visibility = 'public' AND c.deleted_at IS NULL;
  INSERT INTO social_friend_posts(id,author,category_id,created_at)
    SELECT NEW.id,NEW.author,NEW.category_id,NEW.created_at
    WHERE NEW.category_id IS NULL OR EXISTS (SELECT 1 FROM social_categories c
      WHERE c.id = NEW.category_id AND c.owner = NEW.author
        AND c.visibility IN ('friends','public') AND c.deleted_at IS NULL);
END;
INSERT INTO social_friend_posts(id,author,category_id,created_at)
  SELECT p.id,p.author,p.category_id,p.created_at FROM social_posts p
  LEFT JOIN social_categories c ON c.id = p.category_id AND c.owner = p.author
  WHERE p.category_id IS NULL OR (c.visibility IN ('friends','public') AND c.deleted_at IS NULL);
