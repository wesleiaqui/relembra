-- Regras de contas fixas mensais; migração aditiva, sem alterar cobranças já existentes.
CREATE TABLE IF NOT EXISTS finance_recurring_rules (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK(amount_cents > 0),
  day_of_month INTEGER NOT NULL CHECK(day_of_month BETWEEN 1 AND 31),
  priority INTEGER NOT NULL DEFAULT 3 CHECK(priority BETWEEN 1 AND 5),
  essential INTEGER NOT NULL DEFAULT 0 CHECK(essential IN (0,1)),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
  start_month TEXT NOT NULL,
  last_generated_month TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_finance_recurring_owner ON finance_recurring_rules(owner_id,active);
ALTER TABLE finance_bills ADD COLUMN recurring_id TEXT REFERENCES finance_recurring_rules(id) ON DELETE SET NULL;
ALTER TABLE finance_bills ADD COLUMN recurring_month TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_finance_bills_recurring_unique
  ON finance_bills(owner_id, recurring_id, recurring_month)
  WHERE recurring_id IS NOT NULL;
