-- Canvas Visual: quadros privados e vínculos opcionais a tarefas já existentes do Radar.
CREATE TABLE IF NOT EXISTS canvas_boards (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 100),
  snapshot TEXT NOT NULL DEFAULT '{"nodes":[],"edges":[]}',
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_canvas_boards_owner ON canvas_boards(owner_id,updated_at DESC);
CREATE TABLE IF NOT EXISTS canvas_task_links (
  board_id TEXT NOT NULL REFERENCES canvas_boards(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  task_id TEXT NOT NULL REFERENCES radar_tasks(id) ON DELETE CASCADE,
  PRIMARY KEY (board_id,node_id),
  UNIQUE(task_id)
);
CREATE INDEX IF NOT EXISTS idx_canvas_links_owner ON canvas_task_links(owner_id,board_id);
