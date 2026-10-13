-- v1.3: diário guiado para observar e reformular pensamentos automáticos.
-- Migração aditiva: não altera videos, video_images nem o índice FTS existente.
CREATE TABLE IF NOT EXISTS thought_entries (
  id TEXT PRIMARY KEY,
  situation TEXT NOT NULL,
  emotion TEXT NOT NULL DEFAULT '',
  intensity_before INTEGER NOT NULL DEFAULT 5 CHECK(intensity_before BETWEEN 0 AND 10),
  automatic_thought TEXT NOT NULL,
  evidence_for TEXT NOT NULL DEFAULT '',
  evidence_against TEXT NOT NULL DEFAULT '',
  balanced_thought TEXT NOT NULL DEFAULT '',
  next_step TEXT NOT NULL DEFAULT '',
  intensity_after INTEGER CHECK(intensity_after IS NULL OR intensity_after BETWEEN 0 AND 10),
  source_url TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_thought_entries_date ON thought_entries(created_at DESC);
