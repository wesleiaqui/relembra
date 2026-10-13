import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';

function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0002_visual.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0003_multiple_records.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0004_thought_journal.sql', import.meta.url), 'utf8'));
  db.exec('PRAGMA foreign_keys = ON');
  const prepare = sql => {
    const statement = db.prepare(sql);
    let args = [];
    const wrapper = {
      bind(...values) { args = values; return wrapper; },
      async first() { return statement.get(...args) || null; },
      async all() { return { results: statement.all(...args) }; },
      async run() { const result = statement.run(...args); return { meta: { changes: Number(result.changes) } }; }
    };
    return wrapper;
  };
  return { prepare, async batch(commands) { const res = []; for (const command of commands) res.push(await command.run()); return res; } };
}
function setup(ai = null) {
  const env = { DB: makeDB(), APP_PASSWORD: 'um-passphrase-longo-de-verdade', ...(ai ? { AI: ai } : {}), ASSETS: { fetch: () => new Response('OK') } };
  let cookie = '';
  async function req(path, method = 'GET', body = null, useCookie = true) {
    const headers = { origin: 'https://relembra.example' };
    if (body !== null) headers['content-type'] = 'application/json';
    if (cookie && useCookie) headers.cookie = cookie;
    const r = await worker.fetch(new Request('https://relembra.example' + path, { method, headers, ...(body !== null ? { body: JSON.stringify(body) } : {}) }), env);
    const result = await r.json();
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    return { status: r.status, data: result };
  }
  return { req, env };
}
const vid = {
  title: 'Macarrão com molho branco fácil', url: 'https://www.instagram.com/reel/ABCDEF1234/', category: 'culinaria',
  summary: 'Receita de jantar rápido com molho branco e queijo parmesão.',
  transcript: 'Cozinhe o macarrão. Adicione leite, manteiga e parmesão. Misture até engrossar.',
  tags: 'cozinha, molho, jantar', notes: 'Comprar leite integral antes de tentar', favorite: true, watched: false
};
test('login protegido, D1, CRUD, filtros, chat, backup e importação', async () => {
  const { req } = setup();
  assert.equal((await req('/api/session')).data.authenticated, false);
  assert.equal((await req('/api/videos')).status, 401);
  assert.equal((await req('/api/login','POST',{password:'errado'})).status, 401);
  assert.equal((await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'})).status, 200);
  assert.equal((await req('/api/session')).data.authenticated, true);
  const created = await req('/api/videos', 'POST', vid);
  assert.equal(created.status, 201);
  assert.ok(created.data.video.id);
  const id = created.data.video.id;
  const additional = await req('/api/videos','POST',{...vid,title:'Outra informação sobre o mesmo vídeo',notes:'Segunda técnica de molho branco'});
  assert.equal(additional.status,201);
  const secondId = additional.data.video.id;
  assert.notEqual(secondId,id);
  assert.equal((await req('/api/videos?category=culinaria&favorite=1')).data.total,2);
  assert.equal((await req('/api/videos')).data.videos[0].related_count,2);
  assert.equal((await req('/api/videos?category=culinaria&favorite=1')).data.total, 2);
  assert.equal((await req('/api/videos?q=parmesao')).data.total, 2);
  assert.equal((await req('/api/videos?q=molho%20branco')).data.total, 2);
  assert.equal((await req('/api/videos?q=avi%C3%A3o')).data.total, 0);
  const answer = await req('/api/chat','POST',{message:'Qual receita tem leite e parmesão?'});
  assert.equal(answer.status,200);
  assert.equal(answer.data.sources.length,2);
  assert.equal(answer.data.sources[0].id,id);
  assert.equal((await req('/api/stats')).data.stats.favorites,2);
  assert.equal((await req('/api/videos/'+id)).data.related.length,1);
  const exportRes = await req('/api/export');
  assert.equal(exportRes.status,200);
  assert.equal(exportRes.data.videos.length,2);
  assert.equal(exportRes.data.videos[0].transcript,vid.transcript);
  const updated = await req('/api/videos/' + id,'PUT',{...vid,watched:true,favorite:false});
  assert.equal(updated.status,200);
  assert.equal((await req('/api/videos?unwatched=1')).data.total,1);
  assert.equal((await req('/api/videos/' + id, 'DELETE')).status,200);
  assert.equal((await req('/api/videos')).data.total,1);
  const imported = await req('/api/import','POST',exportRes.data);
  assert.equal(imported.data.imported,1);
  assert.equal((await req('/api/videos')).data.total,2);
  assert.equal((await req('/api/import','POST',exportRes.data)).data.skipped,2);
  assert.equal((await req('/api/logout','POST')).status,200);
  assert.equal((await req('/api/videos')).status,401);
});

test('impede URL maliciosa, origem desconhecida e limita falhas de login', async () => {
  const { req, env } = setup();
  for(let i=0;i<8;i++) assert.equal((await req('/api/login','POST',{password:'errado'})).status,401);
  assert.equal((await req('/api/login','POST',{password:'certa'})).status,429);
  const otherRequest = new Request('https://relembra.example/api/login', {method:'POST',headers:{origin:'https://evil.example','content-type':'application/json'}, body:'{"password":"x"}'});
  assert.equal((await worker.fetch(otherRequest,env)).status,403);
  const fresh = setup();
  await fresh.req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  assert.equal((await fresh.req('/api/videos','POST',{...vid,url:'javascript:alert(1)'})).status,400);
  assert.equal((await fresh.req('/api/videos','POST',{...vid,title:''})).status,400);
});

test('resposta da IA cita fonte e não chama IA se não houver correspondências', async () => {
  let called = 0;
  const ai = { async run(model, opts) { called++; assert.ok(model.includes('llama')); assert.ok(opts.messages[1].content.includes('parmesão')); return { response: 'Use leite e queijo parmesão [1].' }; } };
  const { req } = setup(ai);
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  await req('/api/videos','POST',vid);
  assert.equal((await req('/api/chat','POST',{message:'Como faço a receita de parmesão?'})).data.aiUsed,true);
  assert.equal(called,1);
  assert.equal((await req('/api/chat','POST',{message:'exoplaneta quasar heliosfera'})).data.sources.length,0);
  assert.equal(called,1);
});

test('migração mantém vídeos antigos, captura e análise visual entram na busca e podem ser apagadas', async () => {
  let called = 0;
  const ai = { async run(model, opts) {
    called++;
    if (model.includes('vision')) {
      assert.ok(Array.isArray(opts.messages[0].content));
      assert.ok(opts.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'));
      return { response: 'Counter-Strike 2, mapa Mirage, screenshot da posição janela e escada. O detalhe técnico exato não está visível.' };
    }
    return { response: 'A fonte visual mostra a posição da janela na Mirage [1].' };
  } };
  const { req, env } = setup(ai);
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const made = await req('/api/videos','POST', {...vid, url:'https://www.instagram.com/p/VISUAL123/',title:'Imagem que vou analisar', category:'cs2',transcript:'',summary:''});
  assert.equal(made.status,201);
  const id = made.data.video.id;
  assert.equal(made.data.video.has_image,0);
  assert.equal((await req(`/api/videos/${id}/analyze-image`,'POST')).status,400);
  // Arquivo PNG com assinatura correta (mock do armazenamento sem decodificação de bitmap).
  const png = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,0,0]);
  const headers = { origin:'https://relembra.example', 'content-type':'image/png' };
  // login separado para reproduzir a sessão obtida pelo req
  const logged = await worker.fetch(new Request('https://relembra.example/api/login',{method:'POST',headers:{origin:'https://relembra.example','content-type':'application/json'},body:JSON.stringify({password:'um-passphrase-longo-de-verdade'})}),env);
  const c = logged.headers.get('set-cookie').split(';')[0];
  headers.cookie = c;
  const upload = await worker.fetch(new Request(`https://relembra.example/api/videos/${id}/image`, {method:'POST',headers,body:png}),env);
  assert.equal(upload.status,200);
  const photo = await worker.fetch(new Request(`https://relembra.example/api/videos/${id}/image`,{headers}),env);
  assert.equal(photo.status,200);
  assert.equal(photo.headers.get('content-type'),'image/png');
  assert.deepEqual(new Uint8Array(await photo.arrayBuffer()),png);
  assert.equal((await req(`/api/videos/${id}`)).data.video.has_image,1);
  const vision = await req(`/api/videos/${id}/analyze-image`,'POST');
  assert.equal(vision.status,200);
  assert.match(vision.data.visual_description,/janela e escada/);
  assert.equal((await req('/api/videos?q=escada')).data.total,1);
  assert.equal((await req('/api/chat','POST',{message:'Como era a posição de escada da Mirage?'})).data.sources[0].id,id);
  const backed = await req('/api/export');
  assert.match(backed.data.videos[0].visual_description,/Mirage/);
  assert.equal(backed.data.images,undefined);
  const modified = await req(`/api/videos/${id}`,'PUT',{...made.data.video, visual_description:'Ponto de referência janela do meio'});
  assert.equal(modified.status,200);
  assert.equal((await req('/api/videos?q=janela')).data.total,1);
  assert.equal((await req(`/api/videos/${id}/image`,'DELETE')).status,200);
  assert.equal((await req(`/api/videos/${id}`)).data.video.has_image,0);
  assert.equal((await req('/api/videos?q=escada')).data.total,0);
  assert.equal((await req(`/api/videos/${id}`,'DELETE')).status,200);
  assert.equal((await req(`/api/videos/${id}/image`)).status,404);
  assert.equal(called,2);
});

test('upload de imagem exige login, formatos válidos e tamanho limitado', async () => {
  const { req, env } = setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const { data } = await req('/api/videos','POST',vid);
  const id = data.video.id;
  async function img(method, bytes, type, cookie='') {
    return worker.fetch(new Request(`https://relembra.example/api/videos/${id}/image`,{
      method, headers:{origin:'https://relembra.example','content-type':type, ...(cookie ? {cookie}: {})}, body:bytes
    }),env);
  }
  const wrongType = await img('POST',Uint8Array.from([60,115,118,103,62]),'image/svg+xml');
  assert.equal(wrongType.status,401); // sem sessão sequer há acesso
  const login = await worker.fetch(new Request('https://relembra.example/api/login',{method:'POST',headers:{origin:'https://relembra.example','content-type':'application/json'},body:JSON.stringify({password:'um-passphrase-longo-de-verdade'})}),env);
  const cookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await img('POST',Uint8Array.from([60,115,118,103,62]),'image/svg+xml',cookie)).status,413);
  assert.equal((await img('POST',new Uint8Array(450001),'image/png',cookie)).status,413);
  assert.equal((await req(`/api/videos/${id}/import-image`,'POST',{url:'http://localhost/admin'})).status,400);
  assert.equal((await req(`/api/videos/${id}/import-image`,'POST',{url:'https://127.0.0.1/internal'})).status,400);
});

test('a migração v1.1 preserva dados gravados pela versão 1.0', () => {
  const database = new DatabaseSync(':memory:');
  database.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  database.prepare(`INSERT INTO videos(id,url,title,category,summary,transcript,notes,tags,cover_url,favorite,watched,created_at,updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).run('old-1','https://instagram.com/p/old/','Meu vídeo antigo','cs2','mirage','smoke janela','','','','0','0',nowForTest(),nowForTest());
  database.exec(readFileSync(new URL('../migrations/0002_visual.sql', import.meta.url), 'utf8'));
  assert.equal(database.prepare('SELECT title FROM videos WHERE id=?').get('old-1').title, 'Meu vídeo antigo');
  assert.equal(database.prepare('SELECT visual_description FROM videos WHERE id=?').get('old-1').visual_description, '');
  assert.equal(database.prepare('SELECT COUNT(*) AS total FROM videos_fts WHERE videos_fts MATCH ?').get('mirage').total, 1);
  database.close();
});
function nowForTest() { return new Date().toISOString(); }


test('categoria nova funciona, nome duplicado retorna erro legível', async () => {
  const {req} = setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const made = await req('/api/categories','POST',{name:'Reforma futura',emoji:'🏡',color:'#aabbcc'});
  assert.equal(made.status,201);
  assert.ok(made.data.categories.find(c => c.name === 'Reforma futura'));
  const duplicate = await req('/api/categories','POST',{name:'Reforma futura'});
  assert.equal(duplicate.status,409);
  assert.match(duplicate.data.error,/já existe/i);
});

test('migração 0003 preserva ficha, FTS, screenshot e permite vários registros no mesmo URL', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0002_visual.sql', import.meta.url), 'utf8'));
  db.prepare(`INSERT INTO videos(id,url,title,category,summary,created_at,updated_at,visual_description)
      VALUES(?,?,?,?,?,?,?,?)`).run('old','https://instagram.com/p/1','Janela Mirage','cs2','posição A','ontem','hoje','Screenshot com janela');
  db.prepare(`INSERT INTO video_images(video_id,media_type,data_base64,bytes,updated_at)
      VALUES(?,?,?,?,?)`).run('old','image/png','aGVsbG8=',5,'hoje');
  db.exec(readFileSync(new URL('../migrations/0003_multiple_records.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0004_thought_journal.sql', import.meta.url), 'utf8'));
  db.prepare(`INSERT INTO videos(id,url,title,category,created_at,updated_at)
     VALUES(?,?,?,?,?,?)`).run('new','https://instagram.com/p/1','Escada Mirage','cs2','hoje','hoje');
  assert.equal(db.prepare('SELECT COUNT(*) as n FROM videos WHERE url=?').get('https://instagram.com/p/1').n,2);
  assert.equal(db.prepare('SELECT data_base64 FROM video_images WHERE video_id=?').get('old').data_base64,'aGVsbG8=');
  assert.equal(db.prepare(`SELECT COUNT(*) as n FROM videos_fts WHERE videos_fts MATCH 'janela'`).get().n,1);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('várias fichas do mesmo link são pesquisáveis e restauradas sem duplicar', async () => {
  const {req} = setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const main = await req('/api/videos','POST',{...vid,url:'https://instagram.com/p/CS2/',title:'Mirage janela',transcript:'posição na janela lado CT'});
  const extra = await req('/api/videos','POST',{...vid,url:'https://instagram.com/p/CS2/',title:'Mirage B',transcript:'posição no bomb B escadaria'});
  assert.equal(main.status,201);
  assert.equal(extra.status,201);
  assert.equal((await req('/api/videos?q=escadaria')).data.total,1);
  assert.equal((await req('/api/videos?q=janela')).data.total,1);
  assert.equal((await req('/api/videos/'+main.data.video.id)).data.related[0].id,extra.data.video.id);
  const backup = (await req('/api/export')).data;
  assert.equal((await req('/api/import','POST',backup)).data.skipped,2);
  assert.equal((await req('/api/videos')).data.total,2);
  await req('/api/videos/'+main.data.video.id,'DELETE');
  assert.equal((await req('/api/videos?q=escadaria')).data.total,1);
  assert.equal((await req('/api/import','POST',backup)).data.imported,1);
  assert.equal((await req('/api/videos')).data.total,2);
});

const reflection = {
  situation: 'Durante uma conversa, me preocupei com a reação.',
  emotion: 'ansiedade', intensity_before: 8,
  automatic_thought: 'Certamente vão me achar estranho.',
  evidence_for: 'A outra pessoa ficou em silêncio por um momento.',
  evidence_against: 'Ela também demonstrou interesse e fez perguntas.',
  balanced_thought: 'O silêncio pode ter diferentes causas. Não sei o que ela pensou.',
  next_step: 'Continuar a conversa sem exigir uma resposta perfeita.',
  intensity_after: 5,
  source_url: 'https://www.instagram.com/reel/exemplo/'
};
test('diário é privado e permite cadastrar, editar, listar, excluir e validar campos', async () => {
  const { req } = setup();
  assert.equal((await req('/api/thoughts')).status,401);
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  assert.equal((await req('/api/thoughts','POST',{...reflection,situation:''})).status,400);
  assert.equal((await req('/api/thoughts','POST',{...reflection,intensity_before:12})).status,400);
  assert.equal((await req('/api/thoughts','POST',{...reflection,source_url:'javascript:evil()'})).status,400);
  const made = await req('/api/thoughts','POST',reflection);
  assert.equal(made.status,201);
  assert.match(made.data.thought.automatic_thought,/estranho/);
  const id = made.data.thought.id;
  assert.equal((await req('/api/thoughts')).data.thoughts.length,1);
  const updated = await req('/api/thoughts/'+id,'PUT',{...reflection, intensity_after:3, balanced_thought:'Não preciso saber o que todos pensam.'});
  assert.equal(updated.data.thought.intensity_after,3);
  assert.equal((await req('/api/thoughts/'+id)).data.thought.balanced_thought,'Não preciso saber o que todos pensam.');
  assert.equal((await req('/api/thoughts/'+id,'DELETE')).status,200);
  assert.equal((await req('/api/thoughts/'+id)).status,404);
});
test('registros entram no backup, não vazam ao chat de vídeos e importação não duplica IDs', async () => {
  const {req}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  await req('/api/thoughts','POST',reflection);
  const backup = (await req('/api/export')).data;
  assert.equal(backup.format,'relembra-v1.3');
  assert.equal(backup.thoughts.length,1);
  assert.equal((await req('/api/chat','POST',{message:'conversa estranho reação'})).data.sources.length,0);
  const res = await req('/api/import','POST',backup);
  assert.equal(res.data.thoughtsImported,0);
  assert.equal(res.data.thoughtsSkipped,1);
  assert.equal((await req('/api/thoughts')).data.thoughts.length,1);
  const another = setup();
  await another.req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const restored = await another.req('/api/import','POST',backup);
  assert.equal(restored.data.thoughtsImported,1);
  assert.equal((await another.req('/api/thoughts')).data.thoughts.length,1);
});
test('sugestão usa IA somente por solicitação explícita', async () => {
  let calls=0;
  const ai={ async run(model,options) { calls++;
    assert.match(options.messages[1].content,/Certamente vão me achar estranho/);
    return {response:'Não tenho como saber o que a pessoa pensou; posso observar fatos e seguir a conversa.'};
  }};
  const {req}=setup(ai);
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  await req('/api/thoughts','POST',reflection);
  assert.equal(calls,0);
  const result=await req('/api/thoughts/suggest','POST',reflection);
  assert.equal(result.status,200);
  assert.match(result.data.suggestion,/Não tenho como saber/);
  assert.equal(calls,1);
  assert.equal((await req('/api/thoughts/suggest','POST',{situation:'ok'})).status,400);
});
test('migração 0004 é aditiva e mantém vídeos, imagens e busca FTS', () => {
  const db = new DatabaseSync(':memory:');
  for (const f of ['0001_initial.sql','0002_visual.sql','0003_multiple_records.sql'])
    db.exec(readFileSync(new URL('../migrations/'+f, import.meta.url), 'utf8'));
  db.prepare('INSERT INTO videos(id,url,title,category,created_at,updated_at) VALUES(?,?,?,?,?,?)')
    .run('old','https://example.com/video','Mirage smoke janela','cs2','agora','agora');
  db.prepare('INSERT INTO video_images(video_id,media_type,data_base64,bytes,updated_at) VALUES(?,?,?,?,?)')
    .run('old','image/png','YWJj',3,'agora');
  db.exec(readFileSync(new URL('../migrations/0004_thought_journal.sql', import.meta.url), 'utf8'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM videos').get().n,1);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM videos_fts WHERE videos_fts MATCH 'mirage'").get().n,1);
  assert.equal(db.prepare('SELECT bytes FROM video_images').get().bytes,3);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM thought_entries').get().n,0);
  db.close();
});

test('chat filtra Mirage e lista fichas salvas', async () => {
  const { req } = setup();
  await req('/api/login', 'POST', { password: 'um-passphrase-longo-de-verdade' });
  const base = { url: 'https://instagram.com/p/CS2/', category: 'cs2', summary: '', transcript: '', notes: '' };
  const mirage = await req('/api/videos', 'POST', { ...base, title: 'POSIÇÃO JANELA MIRAGE' });
  await req('/api/videos', 'POST', { ...base, title: 'POSIÇÃO MID INFERNO' });
  const result = (await req('/api/chat', 'POST', { message: 'Quais posições da Mirage eu salvei?' })).data;
  assert.equal(result.sources.length, 1);
  assert.equal(result.sources[0].id, mirage.data.video.id);
  assert.match(result.answer, /JANELA MIRAGE/);
});

test('chat de viagens mostra titulos mesmo sem transcricao', async () => {
  const { req } = setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const base = { url:'https://instagram.com/p/turismo/', category:'turismo', summary:'', transcript:'', notes:'' };
  await req('/api/videos','POST',{...base,title:'PRAIA DO PONTAL ARRAIAL DO CABO'});
  await req('/api/videos','POST',{...base,title:'PARQUE AQUATICO WET N WILD'});
  const result = (await req('/api/chat','POST',{message:'Quais lugares para viajar eu salvei?'})).data;
  assert.equal(result.sources.length,2);
  assert.match(result.answer,/PRAIA DO PONTAL/);
  assert.match(result.answer,/WET N WILD/);
  assert.equal(result.aiUsed,false);
});

test('chat diferencia busca nominal de instrucao que nao foi anotada', async () => {
  let aiCalls = 0;
  const { req } = setup({ async run() { aiCalls++; return { response:'nao ha detalhes' }; } });
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const base = { url:'https://instagram.com/p/cs2/', category:'cs2', transcript:'', notes:'' };
  await req('/api/videos','POST',{...base,title:'SMOKE JANELA MIRAGE',summary:'SMOKE JANELA MIRAGE'});
  const result = (await req('/api/chat','POST',{message:'Como faco a smoke da janela da Mirage?'})).data;
  assert.equal(result.sources.length,1);
  assert.match(result.answer,/detalhes suficientes/);
  assert.equal(aiCalls,0);
  const inferno = (await req('/api/chat','POST',{message:'posicoes de inferno cs2'})).data;
  assert.equal(inferno.sources.length,0);
});

test('chat informa captura Lightshot e imagem anexada sem expor o arquivo publicamente', async () => {
  const { req, env } = setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const created = await req('/api/videos','POST',{
    url:'https://instagram.com/p/mirage-janela/', category:'cs2',
    title:'POSICAO JANELA MIRAGE https://prnt.sc/b_SJsjKWTean',
    summary:'POSICAO JANELA MIRAGE',
    cover_url:'https://i.imgur.com/captura.png',
    transcript:'', notes:''
  });
  assert.equal(created.status,201);
  const id = created.data.video.id;
  const first = (await req('/api/chat','POST',{message:'posicoes mirage cs2'})).data.sources[0];
  assert.equal(first.has_image,false);
  assert.equal(first.cover_url,'https://i.imgur.com/captura.png');
  assert.equal(first.screenshot_link,'https://prnt.sc/b_SJsjKWTean');
  await env.DB.prepare('INSERT INTO video_images (video_id, media_type, data_base64, bytes, updated_at) VALUES (?, ?, ?, ?, ?)')
    .bind(id, 'image/png', 'iVBORw0KGgo=', 8, 'agora').run();
  const second = (await req('/api/chat','POST',{message:'posicoes mirage cs2'})).data.sources[0];
  assert.equal(second.has_image,true);
  assert.equal(second.screenshot_link,first.screenshot_link);
  const withoutLogin = await req('/api/videos/'+id+'/image','GET',null,false);
  assert.equal(withoutLogin.status,401);
});

test('chat não inventa screenshot em ficha sem link e sem imagem', async () => {
  const {req} = setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  await req('/api/videos','POST',{...vid,category:'turismo',title:'VIAGEM AO PONTAL'});
  const result = (await req('/api/chat','POST',{message:'lugares para viajar'})).data;
  assert.equal(result.sources.length,1);
  assert.equal(result.sources[0].screenshot_link,'');
  assert.equal(result.sources[0].has_image,false);
});
