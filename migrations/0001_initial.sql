CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '📁',
  color TEXT NOT NULL DEFAULT '#64748b',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO categories (id, name, emoji, color) VALUES
  ('apartamento', 'Apartamento', '🏠', '#8a85ef'),
  ('culinaria', 'Culinária', '🍝', '#f19a65'),
  ('turismo', 'Turismo', '✈️', '#54b7a7'),
  ('cs2', 'CS2', '🎮', '#73a5f5'),
  ('outros', 'Outros', '📚', '#929aad');

CREATE TABLE IF NOT EXISTS videos (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'outros',
  summary TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  cover_url TEXT NOT NULL DEFAULT '',
  favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0, 1)),
  watched INTEGER NOT NULL DEFAULT 0 CHECK(watched IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_videos_created ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_category ON videos(category, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_favorite ON videos(favorite, created_at DESC);

-- FTS5 permite busca por texto nas transcricoes e descricoes, inclusive com acentos.
CREATE VIRTUAL TABLE IF NOT EXISTS videos_fts USING fts5(
  id UNINDEXED, title, category, summary, transcript, notes, tags,
  tokenize='unicode61 remove_diacritics 2'
);
CREATE TRIGGER IF NOT EXISTS videos_fts_insert AFTER INSERT ON videos BEGIN
  INSERT INTO videos_fts(id, title, category, summary, transcript, notes, tags)
    VALUES (new.id, new.title, new.category, new.summary, new.transcript, new.notes, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS videos_fts_update AFTER UPDATE ON videos BEGIN
  DELETE FROM videos_fts WHERE id = old.id;
  INSERT INTO videos_fts(id, title, category, summary, transcript, notes, tags)
    VALUES (new.id, new.title, new.category, new.summary, new.transcript, new.notes, new.tags);
END;
CREATE TRIGGER IF NOT EXISTS videos_fts_delete AFTER DELETE ON videos BEGIN
  DELETE FROM videos_fts WHERE id = old.id;
END;

CREATE TABLE IF NOT EXISTS login_attempts (
  ip_hash TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_start INTEGER NOT NULL DEFAULT 0
);
