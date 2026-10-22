-- Relembra Social v1: perfis opcionais e privados por padrão.
-- Nunca usa tabelas privadas de vídeos, finanças, hábitos, pensamentos ou notas.
CREATE TABLE IF NOT EXISTS social_profiles (
  user_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
  handle TEXT UNIQUE COLLATE NOCASE,
  display_name TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 0 CHECK(is_public IN (0,1)),
  updated_at TEXT NOT NULL,
  CHECK(handle IS NULL OR (length(handle) BETWEEN 3 AND 20))
);
CREATE TABLE IF NOT EXISTS social_posts (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 1200),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_posts_date ON social_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_social_posts_author ON social_posts(author_id,created_at DESC);
CREATE TABLE IF NOT EXISTS social_follows (
  follower_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  followed_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(follower_id,followed_id),
  CHECK(follower_id <> followed_id)
);
CREATE INDEX IF NOT EXISTS idx_social_followed ON social_follows(followed_id);
CREATE TABLE IF NOT EXISTS social_likes (
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,post_id)
);
CREATE TABLE IF NOT EXISTS social_comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 500),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_social_comments_post ON social_comments(post_id,created_at);
