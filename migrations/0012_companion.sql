-- Relembra Companion: radar, life calendar, motivation habits. Isolado por owner_id.
CREATE TABLE IF NOT EXISTS life_profiles (
 owner_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
 birth_date TEXT,
 reference_age INTEGER NOT NULL DEFAULT 90 CHECK(reference_age BETWEEN 1 AND 120),
 updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS life_moments (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 moment_date TEXT NOT NULL,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 150),
 note TEXT NOT NULL DEFAULT '' CHECK(length(note) <= 4000),
 kind TEXT NOT NULL DEFAULT 'good' CHECK(kind IN ('good','milestone','reflection')),
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_life_moments_owner_date ON life_moments(owner_id,moment_date DESC);
CREATE TABLE IF NOT EXISTS radar_tasks (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 due_date TEXT NOT NULL,
 priority INTEGER NOT NULL DEFAULT 2 CHECK(priority BETWEEN 1 AND 3),
 done_at TEXT,
 created_at TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_radar_tasks_due ON radar_tasks(owner_id,done_at,due_date);
CREATE TABLE IF NOT EXISTS motivation_habits (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 150),
 created_at TEXT NOT NULL,
 UNIQUE(owner_id,title)
);
CREATE TABLE IF NOT EXISTS motivation_habit_setup (
 owner_id TEXT PRIMARY KEY REFERENCES app_users(id) ON DELETE CASCADE,
 created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS motivation_habit_days (
 owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 habit_id TEXT NOT NULL REFERENCES motivation_habits(id) ON DELETE CASCADE,
 day TEXT NOT NULL,
 PRIMARY KEY (owner_id,habit_id,day)
);
CREATE INDEX IF NOT EXISTS idx_motivation_habit_days ON motivation_habit_days(owner_id,day);
-- Proteção reversível: versões anteriores de dicas editadas e vídeos.
CREATE TABLE IF NOT EXISTS saved_versions (
 id TEXT PRIMARY KEY,
 owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 entity_type TEXT NOT NULL CHECK(entity_type IN ('tip','video')),
 entity_id TEXT NOT NULL,
 snapshot TEXT NOT NULL,
 archived_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_saved_versions_item ON saved_versions(owner_id,entity_type,entity_id,archived_at DESC);
