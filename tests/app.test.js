import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../src/worker.js';
import { embeddedMediaLink } from '../public/media-links.js';
import { MOTIVATION_MOMENTS, selectMotivationTips } from '../public/motivation.js';

function makeDB() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_initial.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0002_visual.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0003_multiple_records.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0004_thought_journal.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0005_situational_tips.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0006_private_accounts.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0007_focus_productivity_tips.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0008_motivation_tips.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0009_finances.sql', import.meta.url), 'utf8'));
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
  let testOwnerCreated = false;
  async function req(path, method = 'GET', body = null, useCookie = true) {
    let legacyBootstrap = false;
    // Os testes antigos verificam o CRUD, não a migração do login.
    // Criamos a conta principal explicitamente antes de usá-los.
    if (path === '/api/login' && body && !body.username) {
      if (body.password === env.APP_PASSWORD && !testOwnerCreated) {
        legacyBootstrap = true;
        path = '/api/setup-owner';
        body = {username:'principal',password:env.APP_PASSWORD,setup_key:env.APP_PASSWORD};
      } else body = {username:'principal',password:body.password};
    }
    const headers = { origin: 'https://relembra.example' };
    if (body !== null) headers['content-type'] = 'application/json';
    if (cookie && useCookie) headers.cookie = cookie;
    const r = await worker.fetch(new Request('https://relembra.example' + path, { method, headers, ...(body !== null ? { body: JSON.stringify(body) } : {}) }), env);
    const result = await r.json();
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
    if (path === '/api/setup-owner' && r.status === 201) testOwnerCreated = true;
    return { status: legacyBootstrap && r.status === 201 ? 200 : r.status, data: result };
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
  const logged = await worker.fetch(new Request('https://relembra.example/api/login',{method:'POST',headers:{origin:'https://relembra.example','content-type':'application/json'},body:JSON.stringify({username:'principal',password:'um-passphrase-longo-de-verdade'})}),env);
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
  const login = await worker.fetch(new Request('https://relembra.example/api/login',{method:'POST',headers:{origin:'https://relembra.example','content-type':'application/json'},body:JSON.stringify({username:'principal',password:'um-passphrase-longo-de-verdade'})}),env);
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
  assert.equal(backup.format,'relembra-v1.9');
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


test('diário redesenhado mantém todos os campos e controles essenciais', () => {
  const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../public/styles.css', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const thoughtHtml = html.split('<section id="thoughtsView"')[1].split('<section id="tipsView"')[0];
  for (const name of ['situation','emotion','intensity_before','automatic_thought','evidence_for','evidence_against','balanced_thought','next_step','intensity_after','source_url']) {
    assert.equal((thoughtHtml.match(new RegExp('name="' + name + '"','g')) || []).length, 1, 'Campo '+name);
  }
  for (const id of ['thoughtForm','thoughtFormTitle','thoughtSaveBtn','thoughtCancelBtn','thoughtNewBtn','thoughtSuggestion','thoughtSuggestionText','suggestThoughtBtn','useThoughtSuggestion','thoughtList','thoughtCount','thoughtProgressBar','thoughtProgressFill','thoughtProgressText']) {
    // O track tem um ID próprio para a leitura de progresso por acessibilidade.
    const actual = id === 'thoughtProgressBar' ? 'thoughtProgressTrack' : id;
    assert.equal((thoughtHtml.match(new RegExp('id="' + actual + '"','g')) || []).length, 1, 'Controle '+actual);
  }
  assert.equal((thoughtHtml.match(/class="thought-step"/g)||[]).length, 5);
  assert.match(thoughtHtml,/name="situation"[^>]*required/);
  assert.match(thoughtHtml,/name="automatic_thought"[^>]*required/);
  assert.match(css,/@media\(max-width:680px\)/);
  assert.match(js,/function updateThoughtProgress\(\)/);
  assert.match(js,/thoughtForm'\)\.addEventListener\('input', updateThoughtProgress\)/);
});


test('dicas iniciais de conversas e frases ficam disponíveis somente com login', async () => {
  const { req } = setup();
  assert.equal((await req('/api/tips')).status, 401);
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const data = (await req('/api/tips')).data;
  assert.equal(data.tips.length, 24);
  assert.equal(data.tips.filter(t => t.situation === 'Conversar').length, 11);
  assert.equal(data.tips.filter(t => t.kind === 'frase').length, 6);
  assert.ok(data.tips.some(t => t.title.includes('Escute antes')));
  assert.ok(data.tips.some(t => t.content.includes('Como você chegou')));
  assert.ok(data.tips.some(t => t.situation === 'Sair de casa'));
});

test('dicas pessoais: criar, editar, favoritar, pesquisar, excluir, validar', async () => {
  const { req } = setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const item = {title:'Checar o trajeto',content:'Verificar caminho e horário antes de ir',situation:'Na rua',kind:'dica',favorite:false,source_url:''};
  assert.equal((await req('/api/tips','POST',{...item,title:''})).status,400);
  assert.equal((await req('/api/tips','POST',{...item,source_url:'javascript:alert(1)'})).status,400);
  const created = await req('/api/tips','POST',item);
  assert.equal(created.status,201);
  const id = created.data.tip.id;
  assert.equal((await req('/api/tips/'+id)).data.tip.title,item.title);
  const changed = await req('/api/tips/'+id,'PUT',{...item,kind:'frase',situation:'Para mim',content:'Falar com calma'});
  assert.equal(changed.status,200);
  assert.equal(changed.data.tip.kind,'frase');
  assert.equal((await req('/api/tips/'+id,'PATCH',{favorite:true})).data.tip.favorite,1);
  assert.equal((await req('/api/tips/'+id,'PATCH',{favorite:'sim'})).status,400);
  assert.equal((await req('/api/tips')).data.tips[0].id,id);
  assert.equal((await req('/api/tips/'+id,'DELETE')).status,200);
  assert.equal((await req('/api/tips/'+id)).status,404);
});

test('backup de dicas restaura registros sem duplicação e não mistura com o chat de vídeos', async () => {
  const { req } = setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const entry = await req('/api/tips','POST',{title:'Lembrete pessoal',content:'Meu texto reservado',situation:'Para mim',kind:'dica',favorite:true});
  const backup = (await req('/api/export')).data;
  assert.equal(backup.format,'relembra-v1.9');
  assert.ok(backup.tips.some(x=>x.id===entry.data.tip.id));
  assert.equal((await req('/api/chat','POST',{message:'Meu texto reservado'})).data.sources.length,0);
  await req('/api/tips/'+entry.data.tip.id,'DELETE');
  const restore = (await req('/api/import','POST',backup)).data;
  assert.equal(restore.tipsImported,1);
  assert.equal((await req('/api/tips/'+entry.data.tip.id)).status,200);
  const again = (await req('/api/import','POST',backup)).data;
  assert.equal(again.tipsImported,0);
  assert.ok(again.tipsSkipped>=24);
});

test('migração de dicas é aditiva e não afeta os dados de vídeos e diário', () => {
  const db = new DatabaseSync(':memory:');
  for(const name of ['0001_initial.sql','0002_visual.sql','0003_multiple_records.sql','0004_thought_journal.sql'])
    db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const stamp = new Date().toISOString();
  db.prepare('INSERT INTO videos (id,url,title,category,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run('video-antigo','https://example.com/','Video antigo','cs2',stamp,stamp);
  db.prepare('INSERT INTO thought_entries (id,situation,automatic_thought,intensity_before,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .run('thought-antigo','Teste','Pensamento de teste',5,stamp,stamp);
  db.exec(readFileSync(new URL('../migrations/0005_situational_tips.sql',import.meta.url),'utf8'));
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM situational_tips').get().total,13);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM videos').get().total,1);
  assert.equal(db.prepare('SELECT COUNT(*) AS total FROM thought_entries').get().total,1);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});


test('interface de dicas possui navegação, filtros, edição e campos esperados', () => {
  const html = readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app = readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  for (const id of ['tipsView','tipsAddBtn','tipsPresets','tipsCustomContexts','tipsSearch','tipsKind','tipsFavoritesOnly','tipsGrid','tipsCurrentHeading','tipsResultCount','tipModal','tipModalTitle','tipForm','tipCloseBtn','tipCancelBtn','tipSaveBtn','tipDeleteBtn']) {
    assert.equal((html.match(new RegExp('id="' + id + '"','g')) || []).length,1,id);
  }
  for(const name of ['title','content','situation','kind','source_url','favorite'])
    assert.equal((html.match(new RegExp('name="' + name + '"','g'))||[]).length>=1,true,name);
  assert.match(html,/data-view="tips"/);
  assert.match(app,/async function loadTips\(\)/);
  assert.match(app,/async function saveTip\(event\)/);
  assert.match(app,/async function toggleTipFavorite\(id\)/);
  assert.match(app,/tipGroups\[index\]/);
});


test('links de Instagram e YouTube usam iframes restritos a domínios oficiais', () => {
  const reels = embeddedMediaLink('https://www.instagram.com/reel/Dexample1234/?igsh=123&utm_source=share');
  assert.equal(reels.provider, 'Instagram');
  assert.equal(reels.embedUrl, 'https://www.instagram.com/reel/Dexample1234/embed/');
  assert.equal(reels.format, 'vertical');
  assert.equal(embeddedMediaLink('https://instagram.com/p/Ab_cd1234/').provider, 'Instagram');
  assert.equal(embeddedMediaLink('https://instagram.com/tv/ABCde1234/').format, 'instagram');
  const youtube = embeddedMediaLink('https://youtu.be/dQw4w9WgXcQ?t=42');
  assert.equal(youtube.embedUrl, 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0');
  assert.equal(embeddedMediaLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ').provider, 'YouTube');
  assert.equal(embeddedMediaLink('https://www.youtube.com/shorts/dQw4w9WgXcQ').provider, 'YouTube');
  for (const input of [
    'javascript:alert(1)','http://www.instagram.com/reel/Abcde12345/',
    'https://instagram.com.evil.test/reel/Abcde12345/',
    'https://www.instagram.com@evil.test/reel/Abcde12345/',
    'https://www.instagram.com/story/Abcde12345/',
    'https://www.instagram.com/reel/x/../../evil',
    'https://www.instagram.com:8443/reel/Abcde12345/',
    'https://www.youtube.com/watch?v=invalid',
    'https://www.tiktok.com/@user/video/123'
  ]) assert.equal(embeddedMediaLink(input), null, input);
});

test('visualização possui três modos e viewers com controles válidos', () => {
  const html = readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app = readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css = readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  for (const mode of ['standard','gallery','focus'])
    assert.equal((html.match(new RegExp('data-view-mode="'+mode+'"','g')) || []).length,1);
  for (const id of [
    'libraryGrid','mediaPlayerModal','mediaPlayerFrame','mediaPlayerClose','mediaPlayerOriginal','mediaPlayerEdit',
    'imageViewerModal','imageViewerImage','imageViewerTitle','imageViewerCount',
    'imageViewerPrevious','imageViewerNext','imageViewerClose','imageViewerEdit'
  ]) assert.equal((html.match(new RegExp('id="'+id+'"','g')) || []).length,1,id);
  assert.match(app, /import \{ embeddedMediaLink \}/);
  assert.match(app, /function setViewMode\(/);
  assert.match(app, /function openMediaPlayer\(/);
  assert.match(app, /function closeMediaPlayer\(/);
  assert.match(app, /function openImageViewer\(/);
  assert.match(app, /data-preview/);
  assert.match(app, /data-watch/);
  assert.match(app, /replaceChildren\(\); \/\/ desmonta iframe/);
  assert.match(css, /#libraryGrid\[data-mode="gallery"\] \.card-art img \{object-fit:contain;\}/);
  assert.match(css, /#libraryGrid\[data-mode="focus"\] \.card-art img \{object-fit:contain;\}/);
});


test('contas distintas não enxergam nem alteram vídeos, dicas, diário e imagens de outra pessoa',async()=>{
  const {req}=setup();
  const owner=await req('/api/setup-owner','POST',{setup_key:'um-passphrase-longo-de-verdade',username:'principal',password:'uma-senha-segura-123'});
  assert.equal(owner.status,201);
  const video=await req('/api/videos','POST',vid);
  assert.equal(video.status,201);
  const id=video.data.video.id;
  const thought=await req('/api/thoughts','POST',{situation:'Privado',automatic_thought:'Pensamento pessoal',intensity_before:5});
  const tip=await req('/api/tips','POST',{title:'Privado',content:'Minha dica particular',situation:'Para mim',kind:'dica'});
  const invite=await req('/api/invites','POST',{});
  assert.equal(invite.status,201);
  assert.equal(invite.data.invitation.length>20,true);
  const member=await req('/api/register','POST',{invitation:invite.data.invitation,username:'convidado',password:'senha-convidado-123'});
  assert.equal(member.status,201);
  assert.equal((await req('/api/invites','POST',{})).status,403);
  assert.equal((await req('/api/videos')).data.total,0);
  assert.equal((await req('/api/videos/'+id)).status,404);
  assert.equal((await req('/api/videos/'+id,'DELETE')).status,404);
  assert.equal((await req('/api/videos/'+id,'PUT',vid)).status,404);
  assert.equal((await req('/api/videos/'+id+'/image')).status,404);
  assert.equal((await req('/api/videos/'+id+'/import-image','POST',{url:'https://i.imgur.com/x.png'})).status,404);
  assert.equal((await req('/api/thoughts/'+thought.data.thought.id)).status,404);
  assert.equal((await req('/api/thoughts/'+thought.data.thought.id,'DELETE')).status,404);
  assert.equal((await req('/api/tips/'+tip.data.tip.id)).status,404);
  assert.equal((await req('/api/tips/'+tip.data.tip.id,'DELETE')).status,404);
  assert.equal((await req('/api/thoughts')).data.thoughts.length,0);
  assert.equal((await req('/api/tips')).data.tips.length,0);
  assert.equal((await req('/api/export')).data.videos.length,0);
  assert.equal((await req('/api/chat','POST',{message:'macarrão branco parmesão'})).data.sources.length,0);
  const guestVideo=await req('/api/videos','POST',{...vid,category:(await req('/api/categories')).data.categories.find(c=>c.name==='Culinária').id});
  assert.equal(guestVideo.status,201);
  assert.equal((await req('/api/register','POST',{invitation:invite.data.invitation,username:'outro',password:'senha-convidado-456'})).status,401);
  const back=await req('/api/login','POST',{username:'principal',password:'uma-senha-segura-123'});
  assert.equal(back.status,200);
  assert.equal((await req('/api/videos')).data.total,1);
  assert.equal((await req('/api/thoughts')).data.thoughts.length,1);
  assert.ok((await req('/api/tips')).data.tips.some(x=>x.id===tip.data.tip.id));
  assert.equal((await req('/api/videos/'+guestVideo.data.video.id)).status,404);
});

test('recuperação da conta principal invalida a senha anterior sem apagar dados',async()=>{
  const {req}=setup();
  assert.equal((await req('/api/setup-owner','POST',{setup_key:'errada',username:'admin',password:'senha-admin-123456'})).status,401);
  const created=await req('/api/setup-owner','POST',{setup_key:'um-passphrase-longo-de-verdade',username:'admin',password:'senha-admin-123456'});
  assert.equal(created.status,201);
  await req('/api/videos','POST',vid);
  assert.equal((await req('/api/recover-owner','POST',{setup_key:'errada',password:'nova-senha-123456'})).status,401);
  assert.equal((await req('/api/recover-owner','POST',{setup_key:'um-passphrase-longo-de-verdade',password:'nova-senha-123456'})).status,200);
  await req('/api/logout','POST');
  assert.equal((await req('/api/login','POST',{username:'admin',password:'senha-admin-123456'})).status,401);
  assert.equal((await req('/api/login','POST',{username:'admin',password:'nova-senha-123456'})).status,200);
  assert.equal((await req('/api/videos')).data.total,1);
});

test('primeiro cadastro preserva os conteúdos anteriores da instância',async()=>{
  const {req,env}=setup();
  const time=new Date().toISOString();
  await env.DB.prepare('INSERT INTO videos(id,url,title,category,created_at,updated_at) VALUES (?,?,?,?,?,?)')
    .bind('legacy-asset','https://example.com/legacy','Vídeo legado','cs2',time,time).run();
  await env.DB.prepare('INSERT INTO situational_tips(id,title,content,situation,kind,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
    .bind('legacy-tip','Dica antiga','Reservada','Conversar','dica',time,time).run();
  assert.equal((await req('/api/session')).data.setupRequired,true);
  const res=await req('/api/setup-owner','POST',{setup_key:'um-passphrase-longo-de-verdade',username:'principal',password:'senha-dono-123456'});
  assert.equal(res.status,201);
  assert.equal((await req('/api/videos')).data.total,1);
  assert.ok((await req('/api/tips')).data.tips.some(x=>x.id==='legacy-tip'));
  assert.equal((await req('/api/session')).data.setupRequired,false);
  assert.equal((await req('/api/setup-owner','POST',{setup_key:'um-passphrase-longo-de-verdade',username:'outro',password:'senha-dono-123456'})).status,409);
});


test('tela de contas oferece cadastro por convite e recuperação sem expor dados antigos',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  for(const id of ['loginForm','ownerSetupForm','inviteRegisterForm','ownerRecoverForm','loginModeTitle','loginModeDescription','inviteBtn','inviteModal','inviteCode','generateInviteBtn','accountLabel']) {
    assert.equal((html.match(new RegExp('id="'+id+'"','g')) || []).length,1,id);
  }
  for(const endpoint of ['/api/setup-owner','/api/login','/api/register','/api/recover-owner','/api/invites'])
    assert.ok(js.includes(endpoint),'Endpoint '+endpoint);
  for(const target of ['closeEditor()','resetThoughtForm()','closeImageViewer()','closeMediaPlayer()','chatMessages'])
    assert.ok(js.includes(target),'Limpeza '+target);
});


test('PBKDF2 respeita limite de 100 mil iterações do Cloudflare Workers', async () => {
  const source = readFileSync(new URL('../src/worker.js', import.meta.url), 'utf8');
  const matched = source.match(/const ITERATIONS = (\d+);/);
  assert.ok(matched, 'Parâmetro de derivação de senha está definido');
  const iterations = Number(matched[1]);
  assert.equal(iterations, 100000, 'Não ultrapassar 100000 iterações no Workers sem migrar os hashes');
  const { req } = setup();
  const owner = await req('/api/setup-owner', 'POST', {
    username: 'principal', setup_key: 'um-passphrase-longo-de-verdade', password: 'uma-senha-bem-forte-123'
  });
  assert.equal(owner.status, 201, JSON.stringify(owner.data));
  await req('/api/logout', 'POST');
  const login = await req('/api/login', 'POST', {
    username: 'principal', password: 'uma-senha-bem-forte-123'
  });
  assert.equal(login.status, 200, JSON.stringify(login.data));
});


test('dicas de foco e rotina entram na conta principal sem alterar as dicas anteriores', async () => {
  const {req,env} = setup();
  const before = env.DB;
  // A migração foi aplicada antes da criação da conta: as novas dicas serão herdadas.
  const legacy = (await before.prepare("SELECT COUNT(*) AS n FROM situational_tips WHERE owner_id='legacy' AND situation=?")
    .bind('Foco e produtividade').first()).n;
  assert.equal(legacy,7);
  const login = await req('/api/setup-owner','POST',{
    setup_key:'um-passphrase-longo-de-verdade',username:'dono',password:'uma-senha-de-teste-123'
  });
  assert.equal(login.status,201);
  const result = (await req('/api/tips')).data.tips;
  assert.equal(result.filter(x => x.situation === 'Foco e produtividade').length,7);
  assert.equal(result.filter(x => x.situation === 'Conversar').length,11);
  assert.equal(result.filter(x => x.situation === 'Sair de casa').length,2);
  for (const title of ['Reduza o consumo de estímulos rápidos','Aprenda a tolerar o tédio','Valorize recompensas de longo prazo','Substitua o celular por atividades simples','Reaprenda a fazer atividades menos estimulantes','Comece antes de sentir motivação']) {
    assert.equal(result.filter(x=>x.title===title).length,1,title);
  }
  const routine=result.find(x=>x.title==='Desafio diário de concentração');
  assert.ok(routine);
  assert.ok(routine.content.includes('Deixar o celular longe durante 25 minutos'));
  assert.ok(routine.content.includes('Realizar uma tarefa importante sem abrir redes sociais'));
  assert.ok(routine.content.includes('Passar 10 minutos sem estímulos digitais'));
  assert.ok(routine.content.includes('Fazer uma caminhada ou atividade fora das telas'));
  assert.ok(routine.content.includes('Anotar uma pequena conquista do dia'));
  assert.equal((await before.prepare("SELECT COUNT(*) AS n FROM situational_tips WHERE owner_id='legacy'").first()).n,0);
  assert.equal((await req('/api/export')).data.tips.some(x=>x.id===routine.id),true);
});

test('se o proprietário já existe, a migração entrega as dicas apenas para ele e não altera dados de convidados', () => {
  const db=new DatabaseSync(':memory:');
  for(const filename of ['0001_initial.sql','0002_visual.sql','0003_multiple_records.sql','0004_thought_journal.sql','0005_situational_tips.sql','0006_private_accounts.sql']) {
    db.exec(readFileSync(new URL('../migrations/'+filename,import.meta.url),'utf8'));
  }
  const now=new Date().toISOString();
  const owner='11111111-1111-4111-8111-111111111111';
  const guest='22222222-2222-4222-8222-222222222222';
  const stmt=db.prepare('INSERT INTO app_users(id,username,password_salt,password_hash,role,created_at) VALUES (?,?,?,?,?,?)');
  stmt.run(owner,'owner','salt','hash','owner',now);
  stmt.run(guest,'guest','salt','hash','member',now);
  db.prepare("INSERT INTO situational_tips(id,title,content,situation,kind,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run('manual-owner-tip','Meu lembrete anterior','Preservar meu texto','Para mim','dica',owner,now,now);
  db.prepare("INSERT INTO situational_tips(id,title,content,situation,kind,owner_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)")
    .run('guest-private-tip','Dica secreta de convidado','Não alterar','Para mim','dica',guest,now,now);
  const migration=readFileSync(new URL('../migrations/0007_focus_productivity_tips.sql',import.meta.url),'utf8');
  db.exec(migration);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM situational_tips WHERE situation='Foco e produtividade' AND owner_id=?").get(owner).n,7);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM situational_tips WHERE situation='Foco e produtividade' AND owner_id=?").get(guest).n,0);
  assert.equal(db.prepare('SELECT content FROM situational_tips WHERE id=?').get('manual-owner-tip').content,'Preservar meu texto');
  assert.equal(db.prepare('SELECT content FROM situational_tips WHERE id=?').get('guest-private-tip').content,'Não alterar');
  db.exec(migration);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM situational_tips WHERE situation='Foco e produtividade' AND owner_id=?").get(owner).n,7);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('atalho de foco aparece nas opções de consulta e de criação de dica', () => {
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.equal((html.match(/data-tip-context="Foco e produtividade"/g)||[]).length,1);
  assert.equal((html.match(/<option value="Foco e produtividade"/g)||[]).length,1);
  assert.match(app,/const standardTipContexts = .*'Foco e produtividade'/);
  assert.match(app,/'Foco e produtividade':'Foco e produtividade'/);
});


test('botão de motivação escolhe somente lembretes pessoais relacionados ao momento', () => {
  const tips=[
    {title:'Estou procrastinando',content:'Comece por 10 minutos.',situation:'Motivação e mentalidade'},
    {title:'Estou desanimado',content:'Um dia difícil não define seu progresso.',situation:'Motivação e mentalidade'},
    {title:'Estou inseguro',content:'Comece pelo que está ao alcance.',situation:'Motivação e mentalidade'},
    {title:'Preciso me concentrar',content:'Afaste as distrações.',situation:'Motivação e mentalidade'},
    {title:'Dica sobre imóvel',content:'Consultar financiamento para comprar imóvel.',situation:'Comprar imóvel'},
    {title:'Termine uma tarefa',content:'Concluir algo pequeno ajuda a começar.',situation:'Foco e produtividade'}
  ];
  for(const [moment,title] of [
    ['procrastinar','Estou procrastinando'],['desanimado','Estou desanimado'],
    ['inseguro','Estou inseguro'],['foco','Preciso me concentrar']
  ]) {
    const found=selectMotivationTips(tips,moment,3);
    assert.ok(found.length > 0);
    assert.equal(found[0].title,title);
    assert.ok(!found.some(t=>t.situation==='Comprar imóvel'));
    assert.ok(found.every(t=>tips.includes(t)));
  }
  assert.deepEqual(selectMotivationTips(tips,'inexistente'),[]);
  assert.deepEqual(selectMotivationTips([{title:'Outro',content:'x',situation:'Comprar imóvel'}],'foco'),[]);
  assert.deepEqual(Object.keys(MOTIVATION_MOMENTS).sort(),['desanimado','foco','inseguro','procrastinar']);
});

test('quatro dicas de motivação entram somente na conta principal e são privadas para convidados', async () => {
  const {req,env}=setup();
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM situational_tips WHERE owner_id='legacy' AND situation='Motivação e mentalidade'").first()).n,4);
  const owner=await req('/api/setup-owner','POST',{
    setup_key:'um-passphrase-longo-de-verdade',username:'principal',password:'senha-owner-forte-123'
  });
  assert.equal(owner.status,201);
  let tips=(await req('/api/tips')).data.tips;
  assert.equal(tips.filter(t=>t.situation==='Motivação e mentalidade').length,4);
  const invite=(await req('/api/invites','POST',{})).data.invitation;
  const guest=await req('/api/register','POST',{invitation:invite,username:'convidado',password:'senha-convidado-123'});
  assert.equal(guest.status,201);
  tips=(await req('/api/tips')).data.tips;
  assert.equal(tips.filter(t=>t.situation==='Motivação e mentalidade').length,0);
  assert.deepEqual(selectMotivationTips(tips,'inseguro'),[]);
  assert.equal((await req('/api/export')).data.tips.some(t=>t.situation==='Motivação e mentalidade'),false);
  await req('/api/login','POST',{username:'principal',password:'senha-owner-forte-123'});
  tips=(await req('/api/tips')).data.tips;
  assert.equal(tips.filter(t=>t.situation==='Motivação e mentalidade').length,4);
});

test('migração motivacional protege registros preexistentes e pode ser reexecutada', () => {
  const db=new DatabaseSync(':memory:');
  for(const name of [
    '0001_initial.sql','0002_visual.sql','0003_multiple_records.sql',
    '0004_thought_journal.sql','0005_situational_tips.sql','0006_private_accounts.sql','0007_focus_productivity_tips.sql'
  ]) db.exec(readFileSync(new URL('../migrations/'+name,import.meta.url),'utf8'));
  const now=new Date().toISOString();
  const owner='11111111-1111-4111-8111-111111111111',guest='22222222-2222-4222-8222-222222222222';
  const insert=db.prepare('INSERT INTO app_users(id,username,password_salt,password_hash,role,created_at) VALUES (?,?,?,?,?,?)');
  insert.run(owner,'principal','s','h','owner',now);
  insert.run(guest,'convidado','s','h','member',now);
  db.prepare('INSERT INTO situational_tips (id,title,content,situation,kind,created_at,updated_at,owner_id) VALUES (?,?,?,?,?,?,?,?)')
    .run('ja-salvo','Estou procrastinando','Meu texto personalizado','Motivação e mentalidade','dica',now,now,owner);
  db.prepare('INSERT INTO situational_tips (id,title,content,situation,kind,created_at,updated_at,owner_id) VALUES (?,?,?,?,?,?,?,?)')
    .run('convidado-salvo','Estou desanimado','Texto do convidado','Motivação e mentalidade','dica',now,now,guest);
  const migration=readFileSync(new URL('../migrations/0008_motivation_tips.sql',import.meta.url),'utf8');
  db.exec(migration);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM situational_tips WHERE owner_id=? AND situation='Motivação e mentalidade'").get(owner).n,4);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM situational_tips WHERE owner_id=? AND situation='Motivação e mentalidade'").get(guest).n,1);
  assert.equal(db.prepare("SELECT content FROM situational_tips WHERE id='ja-salvo'").get().content,'Meu texto personalizado');
  assert.equal(db.prepare("SELECT content FROM situational_tips WHERE id='convidado-salvo'").get().content,'Texto do convidado');
  db.exec(migration);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM situational_tips WHERE owner_id=? AND situation='Motivação e mentalidade'").get(owner).n,4);
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length,0);
});

test('interface motivação oferece contexto, dica editável e limpa dados no logout', () => {
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  assert.equal((html.match(/data-tip-context="Motivação e mentalidade"/g)||[]).length,1);
  assert.equal((html.match(/<option value="Motivação e mentalidade"/g)||[]).length,1);
  assert.equal((html.match(/data-open-motivation/g)||[]).length,2);
  for(const id of ['motivationModal','motivationTitle','motivationCloseBtn','motivationResult','motivationSeeAll','motivationAddTip'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  for(const context of Object.keys(MOTIVATION_MOMENTS))
    assert.equal((html.match(new RegExp('data-motivation-moment="'+context+'"','g'))||[]).length,1);
  assert.match(app,/async function openMotivation\(\)/);
  assert.match(app,/function renderMotivation\(\)/);
  assert.match(app,/function wipePreviousAccount\(\) \{\s*closeMotivation\(\)/);
  assert.match(css,/#motivationModal\[hidden\]\{display:none!important;\}/);
});


test('finanças: renda prevista, pagamento, validação e privacidade entre usuários', async () => {
  const { req } = setup();
  assert.equal((await req('/api/finance')).status,401);
  assert.equal((await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'})).status,200);
  const planned = await req('/api/finance/entries','POST',{type:'income',description:'Receita prevista',amount_cents:30000,entry_date:'2026-10-13',status:'planned'});
  assert.equal(planned.status,201);
  assert.equal((await req('/api/finance')).data.balance_cents,0,'previsão não deve contar como dinheiro');
  const confirmed = await req('/api/finance/entries/'+planned.data.id,'PUT',{type:'income',description:'Receita recebida',amount_cents:30000,entry_date:'2026-10-13',status:'confirmed'});
  assert.equal(confirmed.status,200);
  const bad = await req('/api/finance/bills','POST',{name:'Conta inválida',amount_cents:5000,due_date:'2026-02-30',priority:1,essential:true,paid_at:null});
  assert.equal(bad.status,400);
  const created = await req('/api/finance/bills','POST',{name:'Internet',amount_cents:12000,due_date:'2026-10-16',priority:1,essential:true,paid_at:null});
  assert.equal(created.status,201);
  let panel = (await req('/api/finance')).data;
  assert.equal(panel.balance_cents,30000);
  assert.equal(panel.bills.length,1);
  assert.equal(panel.bills[0].paid_at,null);
  assert.equal((await req('/api/finance/bills/'+created.data.id,'PUT',{name:'Internet',amount_cents:12000,due_date:'2026-10-16',priority:1,essential:true,paid_at:'2026-10-15'})).status,200);
  panel = (await req('/api/finance')).data;
  assert.equal(panel.balance_cents,18000,'conta paga abate o saldo');
  const goal = await req('/api/finance/goals','POST',{name:'Reserva de emergência',target_cents:80000,saved_cents:5000});
  assert.equal(goal.status,201);
  const backup = (await req('/api/export')).data;
  assert.equal(backup.finances.goals.length,1);
  assert.equal(backup.finances.entries.length,1);
  assert.equal((await req('/api/import','POST',backup)).data.financeSkipped,3);
  const invite = await req('/api/invites','POST',{});
  assert.equal(invite.status,201);
  const register = await req('/api/register','POST',{username:'finance_member',password:'uma-senha-diferente-123',invitation:invite.data.invitation});
  assert.equal(register.status,201);
  const isolated = (await req('/api/finance')).data;
  assert.equal(isolated.entries.length,0);
  assert.equal(isolated.bills.length,0);
  assert.equal(isolated.balance_cents,0);
  assert.equal((await req('/api/finance/bills/'+created.data.id,'DELETE')).status,404);
  assert.equal((await req('/api/finance/bills/'+created.data.id,'PUT',{name:'X',amount_cents:100,due_date:'2026-10-13',priority:1,essential:false,paid_at:null})).status,404);
});
