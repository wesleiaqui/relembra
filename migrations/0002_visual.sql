-- v1.1: screenshots pessoais guardados no próprio D1; não depende de R2.
ALTER TABLE videos ADD COLUMN visual_description TEXT NOT NULL DEFAULT '';
CREATE TABLE IF NOT EXISTS video_images (
  video_id TEXT PRIMARY KEY REFERENCES videos(id) ON DELETE CASCADE,
  media_type TEXT NOT NULL CHECK(media_type IN ('image/png', 'image/jpeg', 'image/webp')),
  data_base64 TEXT NOT NULL,
  bytes INTEGER NOT NULL CHECK(bytes > 0 AND bytes <= 450000),
  updated_at TEXT NOT NULL
);

DROP TRIGGER IF EXISTS videos_fts_insert;
DROP TRIGGER IF EXISTS videos_fts_update;
DROP TRIGGER IF EXISTS videos_fts_delete;
DROP TABLE IF EXISTS videos_fts;
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
