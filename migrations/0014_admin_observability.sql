-- Administração: presença aproximada, último login e auditoria de leituras de membros.
-- Não salva IP, User-Agent, senha, token nem valores financeiros nos logs.
ALTER TABLE app_users ADD COLUMN last_seen_at TEXT;
ALTER TABLE app_users ADD COLUMN last_login_at TEXT;
CREATE INDEX IF NOT EXISTS idx_app_users_seen ON app_users(last_seen_at DESC);
CREATE TABLE IF NOT EXISTS admin_access_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  target_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('view-dashboard')),
  section TEXT NOT NULL CHECK(section IN ('overview','library','finance','radar','maps','notes')),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_admin_access_actor_date ON admin_access_audit(actor_id,created_at DESC);
