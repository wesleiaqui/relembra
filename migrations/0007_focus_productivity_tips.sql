-- v1.9.2: sete lembretes em "Foco e produtividade" extraídos das orientações do usuário.
-- Migração aditiva: preserva dados, funciona antes ou depois da ativação da conta principal.
-- Se ainda não existir proprietário, o primeiro cadastro assumirá os itens "legacy".
-- Não cria conteúdo para membros convidados nem acessa suas bibliotecas.
INSERT OR IGNORE INTO situational_tips
  (id,title,content,situation,kind,favorite,source_url,created_at,updated_at,owner_id)
SELECT '00000000-0000-4000-8000-000000000201', 'Reduza o consumo de estímulos rápidos', 'Evite passar horas rolando Reels, TikTok e Shorts, especialmente antes de estudar ou realizar tarefas importantes.',
       'Foco e produtividade', 'dica', 0, '',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy')
WHERE NOT EXISTS (
  SELECT 1 FROM situational_tips
  WHERE owner_id=COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy') AND title='Reduza o consumo de estímulos rápidos' COLLATE NOCASE
);

INSERT OR IGNORE INTO situational_tips
  (id,title,content,situation,kind,favorite,source_url,created_at,updated_at,owner_id)
SELECT '00000000-0000-4000-8000-000000000202', 'Aprenda a tolerar o tédio', 'Nem todo momento precisa ser preenchido com entretenimento. Experimente ficar alguns minutos sem celular, música ou vídeos, apenas observando o ambiente.',
       'Foco e produtividade', 'dica', 0, '',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy')
WHERE NOT EXISTS (
  SELECT 1 FROM situational_tips
  WHERE owner_id=COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy') AND title='Aprenda a tolerar o tédio' COLLATE NOCASE
);

INSERT OR IGNORE INTO situational_tips
  (id,title,content,situation,kind,favorite,source_url,created_at,updated_at,owner_id)
SELECT '00000000-0000-4000-8000-000000000203', 'Valorize recompensas de longo prazo', 'Estudar, desenvolver habilidades e construir uma carreira exigem esforço antes dos resultados. Não abandone uma atividade somente porque a recompensa não é imediata.',
       'Foco e produtividade', 'dica', 0, '',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy')
WHERE NOT EXISTS (
  SELECT 1 FROM situational_tips
  WHERE owner_id=COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy') AND title='Valorize recompensas de longo prazo' COLLATE NOCASE
);

INSERT OR IGNORE INTO situational_tips
  (id,title,content,situation,kind,favorite,source_url,created_at,updated_at,owner_id)
SELECT '00000000-0000-4000-8000-000000000204', 'Substitua o celular por atividades simples', 'Quando perceber que está consumindo conteúdo sem necessidade, experimente caminhar, organizar alguma coisa, ler algumas páginas ou fazer uma pausa sem telas.',
       'Foco e produtividade', 'dica', 0, '',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy')
WHERE NOT EXISTS (
  SELECT 1 FROM situational_tips
  WHERE owner_id=COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy') AND title='Substitua o celular por atividades simples' COLLATE NOCASE
);

INSERT OR IGNORE INTO situational_tips
  (id,title,content,situation,kind,favorite,source_url,created_at,updated_at,owner_id)
SELECT '00000000-0000-4000-8000-000000000205', 'Reaprenda a fazer atividades menos estimulantes', 'Reserve pequenos períodos para tarefas que exigem paciência e concentração. Aumente gradualmente a duração, sem depender de sentir vontade o tempo todo.',
       'Foco e produtividade', 'dica', 0, '',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy')
WHERE NOT EXISTS (
  SELECT 1 FROM situational_tips
  WHERE owner_id=COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy') AND title='Reaprenda a fazer atividades menos estimulantes' COLLATE NOCASE
);

INSERT OR IGNORE INTO situational_tips
  (id,title,content,situation,kind,favorite,source_url,created_at,updated_at,owner_id)
SELECT '00000000-0000-4000-8000-000000000206', 'Comece antes de sentir motivação', 'Se estiver procrastinando, escolha uma tarefa e comprometa-se com apenas dez minutos. Começar pode ser mais eficaz do que esperar a disposição aparecer.',
       'Foco e produtividade', 'dica', 0, '',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy')
WHERE NOT EXISTS (
  SELECT 1 FROM situational_tips
  WHERE owner_id=COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy') AND title='Comece antes de sentir motivação' COLLATE NOCASE
);

INSERT OR IGNORE INTO situational_tips
  (id,title,content,situation,kind,favorite,source_url,created_at,updated_at,owner_id)
SELECT '00000000-0000-4000-8000-000000000207', 'Desafio diário de concentração', 'Checklist para fazer no seu ritmo:
☐ Deixar o celular longe durante 25 minutos
☐ Realizar uma tarefa importante sem abrir redes sociais
☐ Passar 10 minutos sem estímulos digitais
☐ Fazer uma caminhada ou atividade fora das telas
☐ Anotar uma pequena conquista do dia',
       'Foco e produtividade', 'dica', 0, '',
       strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy')
WHERE NOT EXISTS (
  SELECT 1 FROM situational_tips
  WHERE owner_id=COALESCE((SELECT id FROM app_users WHERE role='owner' LIMIT 1),'legacy') AND title='Desafio diário de concentração' COLLATE NOCASE
);
