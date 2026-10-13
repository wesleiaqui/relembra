-- Módulo financeiro privado: saldos calculados somente sobre movimentações confirmadas.
CREATE TABLE IF NOT EXISTS finance_entries (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK(type IN ('income','expense')),
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  entry_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('planned','confirmed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finance_entries_owner_date ON finance_entries(owner_id,entry_date DESC);
CREATE TABLE IF NOT EXISTS finance_bills (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  due_date TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
  essential INTEGER NOT NULL DEFAULT 0 CHECK(essential IN (0,1)),
  paid_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finance_bills_owner_due ON finance_bills(owner_id,due_date);
CREATE TABLE IF NOT EXISTS finance_goals (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  target_cents INTEGER NOT NULL CHECK(target_cents > 0),
  saved_cents INTEGER NOT NULL DEFAULT 0 CHECK(saved_cents >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finance_goals_owner ON finance_goals(owner_id);
