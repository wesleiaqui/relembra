-- v1.9: separação de bibliotecas por conta, preservando os registros legados.
-- Registros antigos começam como 'legacy' até o proprietário ativar sua conta.
CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('owner','member')),
  invite_hash TEXT UNIQUE,
  session_version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_app_one_owner ON app_users(role) WHERE role='owner';
CREATE TABLE IF NOT EXISTS app_invites (
  token_hash TEXT PRIMARY KEY,
  created_by TEXT NOT NULL REFERENCES app_users(id),
  expires_at INTEGER NOT NULL,
  used_by TEXT REFERENCES app_users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_invites_expires ON app_invites(expires_at);
ALTER TABLE videos ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE categories ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE thought_entries ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE situational_tips ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'legacy';
CREATE INDEX IF NOT EXISTS idx_videos_owner ON videos(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_categories_owner ON categories(owner_id);
CREATE INDEX IF NOT EXISTS idx_thoughts_owner ON thought_entries(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tips_owner ON situational_tips(owner_id,created_at DESC);
