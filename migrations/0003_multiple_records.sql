-- v1.2: permite várias fichas independentes referenciando o mesmo URL.
-- Para preservar screenshots e os dados existentes, reconstrói apenas
-- a tabela videos (SQLite não permite remover UNIQUE com ALTER TABLE).
-- As imagens são copiadas antes da reconstrução e restauradas depois.
CREATE TABLE video_images_v12_backup AS
  SELECT video_id, media_type, data_base64, bytes, updated_at FROM video_images;

DROP TABLE video_images;
DROP TRIGGER IF EXISTS videos_fts_insert;
DROP TRIGGER IF EXISTS videos_fts_update;
DROP TRIGGER IF EXISTS videos_fts_delete;
DROP TABLE IF EXISTS videos_fts;

CREATE TABLE videos_v12_new (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
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
  updated_at TEXT NOT NULL,
  visual_description TEXT NOT NULL DEFAULT ''
);
INSERT INTO videos_v12_new (
 id, url, title, category, summary, transcript, notes, tags, cover_url,
 favorite, watched, created_at, updated_at, visual_description
)
SELECT id, url, title, category, summary, transcript, notes, tags, cover_url,
 favorite, watched, created_at, updated_at, visual_description FROM videos;

DROP TABLE videos;
ALTER TABLE videos_v12_new RENAME TO videos;
CREATE INDEX idx_videos_created ON videos(created_at DESC);
CREATE INDEX idx_videos_category ON videos(category, created_at DESC);
CREATE INDEX idx_videos_favorite ON videos(favorite, created_at DESC);
CREATE INDEX idx_videos_url ON videos(url);

CREATE TABLE video_images (
  video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK(media_type IN ('image/png', 'image/jpeg', 'image/webp')),
  data_base64 TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes > 0 AND bytes <= 450000),
  updated_at TEXT NOT NULL
);
INSERT INTO video_images (video_id, media_type, data_base64, bytes, updated_at)
SELECT video_id, media_type, data_base64, bytes, updated_at FROM video_images_v12_backup;
DROP TABLE video_images_v12_backup;

CREATE VIRTUAL TABLE videos_fts USING fts5(
  id UNINDEXED, title, category, summary, transcript, notes, tags, visual_description,
  tokenize='unicode61 remove_diacritics 2'
);
INSERT INTO videos_fts (id, title, category, summary, transcript, notes, tags, visual_description)
SELECT id, title, category, summary, transcript, notes, tags, visual_description FROM videos;
CREATE TRIGGER videos_fts_insert AFTER INSERT ON videos BEGIN
  INSERT INTO videos_fts(id, title, category, summary, transcript, notes, tags, visual_description)
  VALUES(new.id,new.title,new.category,new.summary,new.transcript,new.notes,new.tags,new.visual_description);
END;
CREATE TRIGGER videos_fts_update AFTER UPDATE ON videos BEGIN
  DELETE FROM videos_fts WHERE id=old.id;
  INSERT INTO videos_fts(id, title, category, summary, transcript, notes, tags, visual_description)
  VALUES(new.id,new.title,new.category,new.summary,new.transcript,new.notes,new.tags,new.visual_description);
END;
CREATE TRIGGER videos_fts_delete AFTER DELETE ON videos BEGIN
  DELETE FROM videos_fts WHERE id=old.id;
END;
