-- Consentimento revogável para leitura administrativa de conteúdo privado.
-- Contas existentes permanecem protegidas até uma escolha explícita.
ALTER TABLE app_users ADD COLUMN admin_view_consent INTEGER NOT NULL DEFAULT 0 CHECK(admin_view_consent IN (0,1));
ALTER TABLE app_users ADD COLUMN admin_view_consent_at TEXT;
CREATE TABLE IF NOT EXISTS admin_consent_audit (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_consent_user_date ON admin_consent_audit(user_id,created_at DESC);
