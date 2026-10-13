-- Relembra v1.9.3: lembretes iniciais para o recurso de motivação contextual.
-- Insere somente para a conta principal (ou para 'legacy' antes do primeiro cadastro).
-- Não altera dicas preexistentes nem cria conteúdo na biblioteca dos convidados.
INSERT OR IGNORE INTO situational_tips
(id,title,content,situation,kind,favorite,source_url,created_at,updated_at,owner_id)
SELECT '00000000-0000-4000-8000-000000000301','Estou procrastinando','Escolha uma tarefa pequena e comece por 10 minutos. Não precisa terminar tudo agora.',
'Motivação e mentalidade','dica',0,'',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy')
WHERE NOT EXISTS (SELECT 1 FROM situational_tips WHERE owner_id=COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy') AND title='Estou procrastinando' COLLATE NOCASE);

INSERT OR IGNORE INTO situational_tips
(id,title,content,situation,kind,favorite,source_url,created_at,updated_at,owner_id)
SELECT '00000000-0000-4000-8000-000000000302','Estou desanimado','Relembre por que começou. Um dia difícil não define todo o seu progresso.',
'Motivação e mentalidade','dica',0,'',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy')
WHERE NOT EXISTS (SELECT 1 FROM situational_tips WHERE owner_id=COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy') AND title='Estou desanimado' COLLATE NOCASE);

INSERT OR IGNORE INTO situational_tips
(id,title,content,situation,kind,favorite,source_url,created_at,updated_at,owner_id)
SELECT '00000000-0000-4000-8000-000000000303','Estou inseguro','Você pode agir mesmo sem ter certeza de como tudo vai acontecer. Comece pelo que está ao seu alcance.',
'Motivação e mentalidade','dica',0,'',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy')
WHERE NOT EXISTS (SELECT 1 FROM situational_tips WHERE owner_id=COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy') AND title='Estou inseguro' COLLATE NOCASE);

INSERT OR IGNORE INTO situational_tips
(id,title,content,situation,kind,favorite,source_url,created_at,updated_at,owner_id)
SELECT '00000000-0000-4000-8000-000000000304','Preciso me concentrar','Afaste as distrações, escolha uma prioridade e dedique 25 minutos a ela.',
'Motivação e mentalidade','dica',0,'',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now'),COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy')
WHERE NOT EXISTS (SELECT 1 FROM situational_tips WHERE owner_id=COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy') AND title='Preciso me concentrar' COLLATE NOCASE);
