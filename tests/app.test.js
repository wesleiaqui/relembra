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
  db.exec(readFileSync(new URL('../migrations/0010_bill_payment_details.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0011_recurring_monthly_bills.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0012_companion.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0013_canvas_visual.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0014_admin_observability.sql', import.meta.url), 'utf8'));
  db.exec(readFileSync(new URL('../migrations/0015_admin_access_consent.sql', import.meta.url), 'utf8'));
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
  assert.equal(backup.format,'relembra-v1.10');
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
  assert.equal(backup.format,'relembra-v1.10');
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
  const member=await req('/api/register','POST',{username:'convidado',password:'senha-convidado-123'});
  assert.equal(member.status,201);
  assert.equal(member.data.user.role,'member');
  assert.equal((await req('/api/invites','POST',{})).status,404);
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
  assert.equal((await req('/api/register','POST',{username:'convidado',password:'senha-convidado-456'})).status,409);
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


test('tela de contas permite registro aberto e recuperação sem expor dados antigos',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  for(const id of ['loginForm','ownerSetupForm','registerForm','ownerRecoverForm','loginModeTitle','loginModeDescription','accountLabel']) {
    assert.equal((html.match(new RegExp('id="'+id+'"','g')) || []).length,1,id);
  }
  for(const endpoint of ['/api/setup-owner','/api/login','/api/register','/api/recover-owner'])
    assert.ok(js.includes(endpoint),'Endpoint '+endpoint);
  assert.match(html,/Criar conta/);
  assert.doesNotMatch(html,/name="invitation"|Tenho um convite|inviteModal/);
  assert.doesNotMatch(js,/\/api\/invites|inviteRegisterForm/);
  for(const target of ['closeEditor()','resetThoughtForm()','closeImageViewer()','closeMediaPlayer()','chatMessages'])
    assert.ok(js.includes(target),'Limpeza '+target);
});



test('cadastro público exige conta principal configurada, valida dados e cria membro isolado',async()=>{
  const {req,env}=setup();
  assert.equal((await req('/api/register','POST',{username:'primeiro',password:'senha-muito-segura-123'})).status,409);
  const owner=await req('/api/setup-owner','POST',{setup_key:env.APP_PASSWORD,username:'administrador',password:'senha-do-admin-muito-forte'});
  assert.equal(owner.status,201);
  await req('/api/tips','POST',{title:'Particular',content:'Conteúdo reservado do proprietário',situation:'Geral',kind:'dica'});
  assert.equal((await req('/api/register','POST',{username:'ab',password:'senha-muito-segura-123'})).status,400);
  assert.equal((await req('/api/register','POST',{username:'publico',password:'curta'})).status,400);
  const registered=await req('/api/register','POST',{username:'publico',password:'senha-muito-segura-123'});
  assert.equal(registered.status,201);
  assert.deepEqual(registered.data.user,{username:'publico',role:'member'});
  const current=await req('/api/session');
  assert.equal(current.data.authenticated,true);
  assert.equal(current.data.user.role,'member');
  assert.equal((await req('/api/tips')).data.tips.some(x=>x.title==='Particular'),false);
  const ownCategories=(await req('/api/categories')).data.categories;
  assert.ok(ownCategories.some(c=>c.name==='Culinária'));
  assert.equal((await req('/api/register','POST',{username:'publico',password:'outra-senha-forte-123'})).status,409);
  assert.equal((await req('/api/invites','POST',{})).status,404);
  assert.equal((await req('/api/login','POST',{username:'administrador',password:'senha-do-admin-muito-forte'})).status,200);
  assert.equal((await req('/api/tips')).data.tips.some(x=>x.title==='Particular'),true);
});
test('cadastro público limita cinco tentativas por hora e não afeta login normal',async()=>{
  const {req,env}=setup();
  assert.equal((await req('/api/setup-owner','POST',{
    setup_key:env.APP_PASSWORD,username:'admin',password:'senha-do-admin-super-forte'
  })).status,201);
  for(let i=0;i<5;i++){
    const result=await req('/api/register','POST',{username:'membro_'+i,password:'senha-registrada-bem-forte-'+i});
    assert.equal(result.status,201,'novo membro '+i);
  }
  assert.equal((await req('/api/register','POST',{username:'membro_extra',password:'senha-registrada-bem-forte-123'})).status,429);
  assert.equal((await req('/api/login','POST',{username:'admin',password:'senha-do-admin-super-forte'})).status,200);
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM app_users WHERE role='member'").first()).n,5);
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
  const guest=await req('/api/register','POST',{username:'convidado',password:'senha-convidado-123'});
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
  assert.equal((html.match(/data-open-motivation/g)||[]).length,3);
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
  assert.equal((await req('/api/finance/bills/'+created.data.id+'/payment','POST',{paid_at:'2026-10-15',paid_amount_cents:12000,payment_method:'pix',payment_source:'Nubank PJ',payment_notes:'Pago via Pix'})).status,200);
  panel = (await req('/api/finance')).data;
  assert.equal(panel.balance_cents,18000,'conta paga abate o saldo');
  const goal = await req('/api/finance/goals','POST',{name:'Reserva de emergência',target_cents:80000,saved_cents:5000});
  assert.equal(goal.status,201);
  const backup = (await req('/api/export')).data;
  assert.equal(backup.finances.goals.length,1);
  assert.equal(backup.finances.entries.length,1);
  assert.equal((await req('/api/import','POST',backup)).data.financeSkipped,3);
  const register = await req('/api/register','POST',{username:'finance_member',password:'uma-senha-diferente-123'});
  assert.equal(register.status,201);
  const isolated = (await req('/api/finance')).data;
  assert.equal(isolated.entries.length,0);
  assert.equal(isolated.bills.length,0);
  assert.equal(isolated.balance_cents,0);
  assert.equal((await req('/api/finance/bills/'+created.data.id,'DELETE')).status,404);
  assert.equal((await req('/api/finance/bills/'+created.data.id,'PUT',{name:'X',amount_cents:100,due_date:'2026-10-13',priority:1,essential:false,paid_at:null})).status,404);
});


test('pagamento detalhado exige método, fonte e data; usa valor realmente pago sem duplicação', async () => {
  const { req } = setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const income = await req('/api/finance/entries','POST',{
    type:'income',description:'Saldo para pagar',amount_cents:30000,entry_date:'2026-10-10',status:'confirmed'
  });
  assert.equal(income.status,201);
  const bill = await req('/api/finance/bills','POST',{
    name:'Conta de telefone',amount_cents:12000,due_date:'2026-10-14',priority:1,essential:true
  });
  assert.equal(bill.status,201);
  const payment='/api/finance/bills/'+bill.data.id+'/payment';
  assert.equal((await req('/api/finance/bills/'+bill.data.id,'PUT',{
    name:'Conta de telefone',amount_cents:12000,due_date:'2026-10-14',
    priority:1,essential:true,paid_at:'2026-10-14'
  })).status,400,'edição da conta não deve registrar um pagamento sem dados');
  assert.equal((await req(payment,'POST',{
    paid_at:'2026-10-14',paid_amount_cents:11500,payment_method:'pix',payment_source:''
  })).status,400);
  assert.equal((await req(payment,'POST',{
    paid_at:'2026-02-30',paid_amount_cents:11500,payment_method:'pix',payment_source:'Caixa'
  })).status,400);
  assert.equal((await req(payment,'POST',{
    paid_at:'2026-10-14',paid_amount_cents:11500,payment_method:'inventado',payment_source:'Caixa'
  })).status,400);
  assert.equal((await req('/api/finance')).data.balance_cents,30000);
  assert.equal((await req(payment,'POST',{
    paid_at:'2026-10-14',paid_amount_cents:11500,payment_method:'pix',payment_source:'Banco do Brasil',payment_notes:'Comprovante #1'
  })).status,200);
  let panel=(await req('/api/finance')).data;
  assert.equal(panel.balance_cents,18500);
  assert.equal(panel.bills[0].amount_cents,12000,'valor planejado não pode mudar com o pagamento');
  assert.equal(panel.bills[0].paid_amount_cents,11500);
  assert.equal(panel.bills[0].payment_method,'pix');
  assert.equal(panel.bills[0].payment_source,'Banco do Brasil');
  assert.equal(panel.bills[0].payment_notes,'Comprovante #1');
  assert.equal((await req(payment,'POST',{
    paid_at:'2026-10-15',paid_amount_cents:11000,payment_method:'debit',payment_source:'Nubank PJ'
  })).status,200);
  assert.equal((await req('/api/finance')).data.balance_cents,19000,'edição do pagamento substitui o anterior');
  assert.equal((await req(payment,'POST',{
    paid_at:'2026-10-16',paid_amount_cents:11000,payment_method:'credit',payment_source:'Cartão Caixa'
  })).status,200);
  assert.equal((await req('/api/finance')).data.balance_cents,30000,'pagamento com crédito não representa saída de saldo ainda');
  assert.equal((await req(payment,'DELETE')).status,200);
  panel=(await req('/api/finance')).data;
  assert.equal(panel.balance_cents,30000);
  assert.equal(panel.bills[0].paid_at,null);
  assert.equal(panel.bills[0].paid_amount_cents,null);
  assert.equal(panel.bills[0].payment_source,'');
  assert.equal((await req(payment,'DELETE')).status,404);
  assert.equal((await req('/api/finance/bills/'+bill.data.id,'PUT',{
    name:'Conta de telefone atualizada',amount_cents:12000,due_date:'2026-10-14',priority:2,essential:true
  })).status,200,'edição de conta sem campo paid_at deve continuar funcionando');
});

test('pagamentos entram no backup e não são alterados por outra conta', async () => {
  const {req}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const created=await req('/api/finance/bills','POST',{
    name:'Água',amount_cents:7000,due_date:'2026-10-11',priority:2,essential:true
  });
  const payment='/api/finance/bills/'+created.data.id+'/payment';
  await req(payment,'POST',{paid_at:'2026-10-12',paid_amount_cents:7200,
    payment_method:'transfer',payment_source:'Conta Mercado Pago',payment_notes:'Tarifa incluída'});
  const backup=(await req('/api/export')).data;
  assert.equal(backup.finances.bills[0].payment_source,'Conta Mercado Pago');
  assert.equal(backup.finances.bills[0].paid_amount_cents,7200);
  await req('/api/register','POST',{username:'finance_extra',password:'uma-senha-diferente-123'});
  assert.equal((await req(payment,'POST',{paid_at:'2026-10-12',
    paid_amount_cents:7000,payment_method:'pix',payment_source:'Outro'})).status,404);
  assert.equal((await req(payment,'DELETE')).status,404);
  const imported=await req('/api/import','POST',{finances:{bills:backup.finances.bills}});
  assert.equal(imported.data.financeImported,1);
  const restored=(await req('/api/finance')).data;
  assert.equal(restored.bills.length,1);
  assert.equal(restored.bills[0].payment_source,'Conta Mercado Pago');
  assert.equal(restored.bills[0].paid_amount_cents,7200);
  assert.notEqual(restored.bills[0].id,created.data.id,'outro usuário recebe ID diferente');
});


test('migração 0010 preserva pagamentos anteriores sem inventar método',()=>{
  const db=new DatabaseSync(':memory:');
  for (let n=1;n<=9;n++){
    const names=['0001_initial','0002_visual','0003_multiple_records','0004_thought_journal',
      '0005_situational_tips','0006_private_accounts','0007_focus_productivity_tips',
      '0008_motivation_tips','0009_finances'];
    db.exec(readFileSync(new URL('../migrations/'+names[n-1]+'.sql',import.meta.url),'utf8'));
  }
  db.prepare("INSERT INTO app_users(id,username,password_salt,password_hash,role,created_at) VALUES (?,?,?,?,?,?)")
    .run('u1','usuario-teste','sal','hash','owner','2026-10-10');
  db.prepare("INSERT INTO finance_bills(id,owner_id,name,amount_cents,due_date,priority,essential,paid_at,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run('bill1','u1','Conta legada',21000,'2026-10-11',2,1,'2026-10-12','2026-10-10','2026-10-12');
  db.exec(readFileSync(new URL('../migrations/0010_bill_payment_details.sql',import.meta.url),'utf8'));
  const bill=db.prepare('SELECT * FROM finance_bills WHERE id=?').get('bill1');
  assert.equal(bill.amount_cents,21000);
  assert.equal(bill.paid_at,'2026-10-12');
  assert.equal(bill.paid_amount_cents,21000);
  assert.equal(bill.payment_method,null);
  assert.equal(bill.payment_source,'');
  db.close();
});


test('contas fixas: geração mensal, dia 31 em fevereiro, edição futura e idempotência', async () => {
  const {req}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const created=await req('/api/finance/recurring','POST',{
    name:'Internet mensal',amount_cents:14990,due_date:'2026-01-31',priority:1,essential:true
  });
  assert.equal(created.status,201);
  const ruleId=created.data.id;
  let panel=(await req('/api/finance?month=2026-02')).data;
  assert.equal(panel.recurring.length,1);
  assert.equal(panel.recurring[0].id,ruleId);
  assert.equal(panel.bills.filter(b=>b.recurring_month==='2026-01').length,1);
  assert.equal(panel.bills.filter(b=>b.recurring_month==='2026-02').length,1);
  assert.equal(panel.bills.find(b=>b.recurring_month==='2026-02').due_date,'2026-02-28');
  assert.equal(panel.bills.find(b=>b.recurring_month==='2026-03').due_date,'2026-03-31');
  assert.ok(panel.bills.every(b=>!b.paid_at));
  const firstCount=panel.bills.length;
  panel=(await req('/api/finance?month=2026-02')).data;
  assert.equal(panel.bills.length,firstCount,'reabrir não duplica contas');
  assert.equal(panel.bills.filter(b=>b.recurring_month==='2026-02').length,1);
  const febBill=panel.bills.find(b=>b.recurring_month==='2026-02');
  const pay=await req('/api/finance/bills/'+febBill.id+'/payment','POST',{
    paid_at:'2026-02-28',paid_amount_cents:14990,payment_method:'pix',payment_source:'Conta pessoal'
  });
  assert.equal(pay.status,200);
  const updated=await req('/api/finance/recurring/'+ruleId,'PUT',{
    name:'Internet melhorada',amount_cents:19990,day_of_month:15,priority:2,essential:true,active:true
  });
  assert.equal(updated.status,200);
  panel=(await req('/api/finance?month=2027-01')).data;
  const future=panel.bills.find(b=>b.recurring_month==='2027-01');
  assert.equal(future.amount_cents,19990);
  assert.equal(future.due_date,'2027-01-15');
  assert.equal(panel.bills.find(b=>b.recurring_month==='2026-02').name,'Internet mensal','mês já existente não muda');
  assert.equal(panel.bills.find(b=>b.recurring_month==='2026-02').paid_at,'2026-02-28','pagamento anterior preservado');
  assert.equal((await req('/api/finance/recurring/'+ruleId,'PUT',{
    name:'Internet melhorada',amount_cents:19990,day_of_month:15,priority:2,essential:true,active:false
  })).status,200);
  await req('/api/finance?month=2027-03');
  panel=(await req('/api/finance')).data;
  assert.equal(panel.bills.filter(b=>b.recurring_month==='2027-03').length,0,'pausa impede mês futuro');
  assert.equal((await req('/api/finance/recurring/'+ruleId,'PUT',{
    name:'Internet melhorada',amount_cents:19990,day_of_month:15,priority:2,essential:true,active:true
  })).status,200);
  panel=(await req('/api/finance?month=2027-03')).data;
  assert.equal(panel.bills.filter(b=>b.recurring_month==='2027-03').length,1,'retomar volta a gerar cobranças');
});

test('contas fixas: transformar conta existente preserva pagamento e evita duplicação',async()=>{
  const {req}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const bill=await req('/api/finance/bills','POST',{
    name:'SABESP',amount_cents:10930,due_date:'2026-10-13',priority:1,essential:true
  });
  assert.equal(bill.status,201);
  const payment='/api/finance/bills/'+bill.data.id+'/payment';
  assert.equal((await req(payment,'POST',{
    paid_at:'2026-10-13',paid_amount_cents:11000,payment_method:'debit',payment_source:'Nubank'
  })).status,200);
  const rule=await req('/api/finance/recurring','POST',{existing_bill_id:bill.data.id});
  assert.equal(rule.status,201);
  assert.equal((await req('/api/finance/recurring','POST',{existing_bill_id:bill.data.id})).status,409);
  let panel=(await req('/api/finance')).data;
  const oct=panel.bills.filter(b=>b.recurring_id===rule.data.id&&b.recurring_month==='2026-10');
  assert.equal(oct.length,1);
  assert.equal(oct[0].id,bill.data.id);
  assert.equal(oct[0].paid_amount_cents,11000);
  assert.equal(oct[0].payment_source,'Nubank');
  const nov=(await req('/api/finance?month=2026-11')).data.bills.filter(b=>b.recurring_month==='2026-11');
  assert.equal(nov.length,1);
  assert.equal(nov[0].paid_at,null);
});

test('contas fixas: validação, privacidade e backup com vínculos entre usuários',async()=>{
  const {req}=setup();
  assert.equal((await req('/api/finance/recurring','POST',{})).status,401);
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  assert.equal((await req('/api/finance/recurring','POST',{
    name:'Dia inválido',amount_cents:1500,due_date:'2026-02-30',priority:1,essential:true
  })).status,400);
  const created=await req('/api/finance/recurring','POST',{
    name:'Luz',amount_cents:19000,due_date:'2026-10-20',priority:1,essential:true
  });
  assert.equal(created.status,201);
  const backup=(await req('/api/export')).data;
  assert.equal(backup.finances.recurring.length,1);
  assert.equal(backup.finances.bills[0].recurring_id,created.data.id);
  const registered=await req('/api/register','POST',{
    username:'recurring_guest',password:'senha-de-convidado-123'
  });
  assert.equal(registered.status,201);
  assert.equal((await req('/api/finance')).data.recurring.length,0);
  assert.equal((await req('/api/finance/recurring/'+created.data.id,'PUT',{
    name:'Hack',amount_cents:1,day_of_month:1,priority:1,essential:true,active:false
  })).status,404);
  const firstImport=await req('/api/import','POST',{finances:{recurring:backup.finances.recurring}});
  assert.equal(firstImport.status,200);
  assert.equal(firstImport.data.financeImported,1);
  const secondImport=await req('/api/import','POST',{finances:{bills:backup.finances.bills}});
  assert.equal(secondImport.data.financeImported,1);
  let panel=(await req('/api/finance')).data;
  assert.equal(panel.recurring.length,1);
  assert.equal(panel.bills.length,1);
  assert.equal(panel.bills[0].recurring_id,panel.recurring[0].id,'vínculo restaurado mesmo em lotes separados');
  assert.notEqual(panel.recurring[0].id,created.data.id,'nova conta recebe ID diferente');
  const repeated=await req('/api/import','POST',{finances:{recurring:backup.finances.recurring,bills:backup.finances.bills}});
  assert.equal(repeated.data.financeImported,0,'importação repetida não cria mais contas');
  panel=(await req('/api/finance')).data;
  assert.equal(panel.recurring.length,1);
});


test('radar privado cria e conclui tarefas e inclui contas próximas sem renda futura',async()=>{
  const {req,env}=setup();
  assert.equal((await req('/api/radar')).status,401);
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const due='2026-10-14';
  const task=await req('/api/radar/tasks','POST',{title:'Resolver conta importante',due_date:due,priority:1});
  assert.equal(task.status,201);
  const today=new Date().toISOString().slice(0,10);
  const next=new Date(new Date(today+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10);
  const bill=await req('/api/finance/bills','POST',{name:'Internet teste',amount_cents:15000,due_date:next,priority:1,essential:true,paid_at:null});
  assert.equal(bill.status,201);
  const radar=(await req('/api/radar')).data;
  assert.equal(radar.bills.some(b=>b.name==='Internet teste'),true);
  // A tarefa de outubro aparece na busca, mesmo fora da janela de 14 dias.
  assert.equal((await req('/api/search/all?q=Resolver')).data.results.some(x=>x.type==='task'),true);
  assert.equal((await req('/api/radar/tasks/'+task.data.id,'PATCH',{done:true})).status,200);
  assert.equal((await req('/api/radar/tasks/'+task.data.id,'DELETE')).status,200);
  assert.equal((await req('/api/radar/tasks/'+task.data.id,'DELETE')).status,404);
});
test('calendário da vida preserva nascimento, conquistas e anotação editável, sem data futura inventada',async()=>{
  const {req}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  assert.equal((await req('/api/life')).data.profile,null);
  assert.equal((await req('/api/life/profile','PUT',{birth_date:'2026-02-30',reference_age:90})).status,400);
  assert.equal((await req('/api/life/profile','PUT',{birth_date:'2020-04-07',reference_age:90})).status,200);
  const response=await req('/api/life/moments','POST',{moment_date:'2026-10-13',title:'Meu dia bom',note:'Fiz uma caminhada',kind:'good'});
  assert.equal(response.status,201);
  assert.equal((await req('/api/life/moments/'+response.data.id,'PUT',{moment_date:'2026-10-13',title:'Uma conquista',note:'Terminei um projeto',kind:'milestone'})).status,200);
  const loaded=(await req('/api/life')).data;
  assert.equal(loaded.profile.birth_date,'2020-04-07');
  assert.equal(loaded.moments[0].note,'Terminei um projeto');
  assert.equal((await req('/api/search/all?q=conquista')).data.results.some(x=>x.type==='moment'),true);
  assert.equal((await req('/api/export')).data.extras.moments.length,1);
  assert.equal((await req('/api/life/moments/'+response.data.id,'DELETE')).status,200);
  assert.equal((await req('/api/life')).data.moments.length,0);
});
test('busca universal exclui finanças por padrão e nunca cruza usuários',async()=>{
  const {req}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const income=await req('/api/finance/entries','POST',{type:'income',description:'Projeto secretonuvem',amount_cents:7777,entry_date:'2026-10-13',status:'confirmed'});
  assert.equal(income.status,201);
  assert.equal((await req('/api/search/all?q=secretonuvem')).data.results.length,0);
  assert.equal((await req('/api/search/all?q=secretonuvem&finance=1')).data.results[0].type,'income');
  const tip=await req('/api/tips','POST',{title:'Valor da verdade',content:'Uma ideia só minha uniquepessoal',situation:'Para mim',kind:'dica'});
  assert.equal(tip.status,201);
  assert.equal((await req('/api/search/all?q=uniquepessoal')).data.results.length,1);
  await req('/api/register','POST',{username:'convidado_search',password:'senha-convidado-bastante-segura'});
  assert.equal((await req('/api/search/all?q=secretonuvem&finance=1')).data.results.length,0);
  assert.equal((await req('/api/search/all?q=uniquepessoal')).data.results.length,0);
  assert.equal((await req('/api/history?type=tip&id='+tip.data.tip.id)).status,404);
});
test('hábitos motivacionais são opcionais, editáveis e não exigem sequência perfeita',async()=>{
  const {req}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  let data=(await req('/api/habits')).data;
  assert.equal(data.habits.length,4);
  const id=data.habits[0].id;
  assert.equal((await req('/api/habits/'+id+'/check','PATCH',{done:true})).status,200);
  assert.equal((await req('/api/habits')).data.habits[0].done,1);
  assert.equal((await req('/api/habits/'+id+'/check','PATCH',{done:false})).status,200);
  assert.equal((await req('/api/habits')).data.habits[0].done,0);
  assert.equal((await req('/api/habits','POST',{title:'Meu hábito pessoal'})).status,201);
  assert.equal((await req('/api/habits')).data.habits.length,5);
  for(const habit of (await req('/api/habits')).data.habits)
    assert.equal((await req('/api/habits/'+habit.id,'DELETE')).status,200);
  assert.equal((await req('/api/habits')).data.habits.length,0,'remoção dos hábitos não deve recriar padrões');
  assert.equal((await req('/api/export')).data.extras.habitsConfigured,true);
});
test('backup completo de textos inclui itens pessoais e exportação de prints é privada',async()=>{
  const {req,env}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const v=await req('/api/videos','POST',vid);
  assert.equal(v.status,201);
  const owner=(await env.DB.prepare("SELECT id FROM app_users WHERE role='owner'").first()).id;
  const raw='aW1hZ2VfZGF0YQ==';
  await env.DB.prepare('INSERT INTO video_images(video_id,media_type,data_base64,bytes,updated_at) VALUES(?,?,?,?,?)').bind(v.data.video.id,'image/png',raw,10,new Date().toISOString()).run();
  const images=(await req('/api/backup/images')).data;
  assert.equal(images.total,1);
  assert.equal(images.items[0].data_base64,raw);
  await req('/api/life/profile','PUT',{birth_date:'1990-05-05',reference_age:95});
  const backup=(await req('/api/export')).data;
  assert.equal(backup.extras.profile.reference_age,95);
  assert.ok(backup.finances);
  assert.equal((await req('/api/import','POST',backup)).status,200);
  await req('/api/register','POST',{username:'convidado_backup',password:'senha-de-convidado-diferente'});
  assert.equal((await req('/api/backup/images')).data.total,0);
  assert.equal((await req('/api/life')).data.profile,null);
  assert.equal((await req('/api/radar')).data.bills.length,0);
  assert.equal(owner.length,36);
});
test('histórico de versões arquiva alterações e respeita a conta dona',async()=>{
  const {req,env}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const item={title:'Meu conselho importante',content:'Versão original',situation:'Para mim',kind:'dica',favorite:false,source_url:''};
  const created=await req('/api/tips','POST',item);
  const id=created.data.tip.id;
  assert.equal((await req('/api/tips/'+id,'PUT',{...item,content:'Versão nova'})).status,200);
  const prior=(await req('/api/history?type=tip&id='+id)).data.versions;
  assert.equal(prior.length,1);
  assert.equal(prior[0].data.content,'Versão original');
  const version=await req('/api/tips/'+id,'PUT',prior[0].data);
  assert.equal(version.status,200);
  assert.equal((await req('/api/history?type=tip&id='+id)).data.versions.length,2);
  assert.equal((await req('/api/tips/'+id)).data.tip.content,'Versão original');
  assert.equal((await req('/api/tips/'+id,'DELETE')).status,200);
  const versionCount=(await env.DB.prepare("SELECT COUNT(*) AS n FROM saved_versions WHERE entity_id=?").bind(id).first()).n;
  assert.equal(versionCount,0);
});
test('novos componentes existem sem substituir ou excluir os dados do diário antigo',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const client=readFileSync(new URL('../public/companion.js',import.meta.url),'utf8');
  for(const id of ['radarView','chatView','lifeView','lifeWeeks','lifeOverview','lifeMomentForm','chatInput','universalFinance','radarContent','homeBills','homeHabits','homeQuickTaskForm','backupImagesBtn','restoreImagesFile','historyModal','motivationHabits'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  assert.match(html,/id="thoughtsView"/);
  assert.match(html,/lifeOldDiary/);
  assert.match(app,/setupCompanion/);
  assert.match(client,/function renderLife/);
  assert.match(html,/idade de referência.*não é uma previsão/i);
});


test('home acionável e busca universal integrada ao Chat em todos os temas', () => {
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const companion=readFileSync(new URL('../public/companion.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/home-workspace.css',import.meta.url),'utf8');
  const atlas=readFileSync(new URL('../public/atlas-ui.js',import.meta.url),'utf8');
  for(const id of ['homeRadar','homeQuickTaskForm','homeQuickTaskTitle','homeQuickTaskDate','homeBills','homeHabits','homeGrid','chatView','chatMessages','universalFinance','chatInput','chatForm'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  assert.doesNotMatch(html,/id="searchView"|id="universalQuery"|data-view="favorites"|data-view="unwatched"|data-view="search"/);
  assert.doesNotMatch(html,/name="watched" type="checkbox"><span>|Marcar como favorito|Já assisti<\/label>/);
  assert.doesNotMatch(app,/function toggleFavorite\(|data-fav=/);
  assert.doesNotMatch(html,/data-chat-mode=|id="universalResults"|id="chatModeDescription"/);
  assert.equal((html.match(/id="chatForm"/g)||[]).length,1);
  assert.match(app,/Promise\.allSettled\(\[/);
  assert.match(app,/searchMemory\(q,includeFinance\)/);
  assert.match(app,/api\('\/api\/chat',\{method:'POST'/);
  assert.match(app,/appendMemoryResults\(block,results/);
  assert.match(app,/openSearchItem\(item\.dataset\.memoryType,item\.dataset\.memoryId\)/);
  assert.match(companion,/api\('\/api\/radar\/tasks\/'\+checkbox\.dataset\.homeTaskId/);
  assert.match(companion,/api\('\/api\/habits\/'\+checkbox\.dataset\.homeHabitId/);
  assert.match(companion,/api\('\/api\/search\/all\?q='\+encodeURIComponent\(q\)\+'&finance='/);
  assert.match(atlas,/openUnifiedSearch\(q\)/);
  assert.doesNotMatch(atlas,/api\/search\/all/);
  assert.match(css,/\.home-focus-grid/);
  assert.match(readFileSync(new URL('../public/chat-radar-refinement.css',import.meta.url),'utf8'),/\.chat-single-shell/);
  assert.match(css,/body\[data-visual-theme="atlas"\] #homeView:not\(\[hidden\]\)\{display:block!important\}/);
});

test('Chat pesquisa perguntas naturais sem busca duplicada e não expõe finanças sem consentimento',async()=>{
  const {req}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const tip=await req('/api/tips','POST',{title:'Economizar dinheiro',content:'Planejar gastos e montar reserva',situation:'Financeiro pessoal',kind:'dica'});
  assert.equal(tip.status,201);
  const termQuery=encodeURIComponent('Quais dicas eu tenho sobre economizar dinheiro?');
  const results=(await req('/api/search/all?q='+termQuery+'&terms=1')).data.results;
  assert.ok(results.some(x=>x.type==='tip'&&x.title==='Economizar dinheiro'));
  const bill=await req('/api/finance/bills','POST',{name:'Conta particular do mês',amount_cents:10500,due_date:'2026-10-14',essential:true,priority:1});
  assert.equal(bill.status,201);
  const q=encodeURIComponent('Preciso rever conta particular do mês');
  assert.equal((await req('/api/search/all?q='+q+'&terms=1')).data.results.some(x=>x.type==='bill'),false);
  assert.equal((await req('/api/search/all?q='+q+'&terms=1&finance=1')).data.results.some(x=>x.type==='bill'),true);
  // O endpoint de IA continua isolado dos registros financeiros e dicas.
  const chat=(await req('/api/chat','POST',{message:'Conta particular do mês'})).data;
  assert.equal(chat.sources.some(x=>x.title==='Conta particular do mês'),false);
});
test('Radar não cria painéis vazios altos; separa atrasos e mantém ações privadas',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const companion=readFileSync(new URL('../public/companion.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/chat-radar-refinement.css',import.meta.url),'utf8');
  const formIndex=html.indexOf('id="radarTaskForm"'),listIndex=html.indexOf('id="radarContent"');
  assert.ok(formIndex>=0&&formIndex<listIndex,'A criação de tarefas deve vir antes do painel');
  assert.match(companion,/radar-main-grid/);
  assert.match(companion,/radar-empty-state/);
  assert.match(companion,/radar-bills-more/);
  assert.match(companion,/data-radar-create/);
  assert.match(companion,/data-radar-finance/);
  assert.match(css,/\.radar-main-grid\{[\s\S]{0,160}align-items:start/);
  assert.match(css,/\.radar-bills-more/);
  assert.match(css,/body\[data-color-mode="light"\] \.radar-bill-row/);
});


test('modo financeiro escuro usa seletores reais e mantém rodapés, estados e tabela em paleta uniforme',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const original=readFileSync(new URL('../public/finance.css',import.meta.url),'utf8');
  const night=readFileSync(new URL('../public/finance-night.css',import.meta.url),'utf8');
  const appearance=readFileSync(new URL('../public/appearance-modes.css',import.meta.url),'utf8');
  assert.match(html,/href="\/finance-night\.css"/);
  assert.ok(html.indexOf('/finance-night.css')>html.indexOf('/appearance-modes.css'),
    'CSS noturno deve vir depois dos estilos anteriores');
  for(const selector of [
    '.finance-kpi','.finance-kpi-balance','.finance-kpi-pending','.finance-kpi-coverage',
    '.finance-panel','.finance-table','.finance-table-empty','.finance-panel-footer',
    '.finance-empty','.finance-overdue','.finance-pill','.finance-bad',
    '.finance-warn','.finance-ok','.finance-menu-options','.finance-payment-modal',
    '.finance-goal-card','.finance-planned-note','.finance-summary-row'
  ]) {
    assert.ok(original.includes(selector),'O seletor deve existir no financeiro: '+selector);
    assert.ok(night.includes(selector),'Faltou harmonizar '+selector);
  }
  assert.match(night,/body\.finance-mode\[data-color-mode="dark"\] #financeRoot \.finance-panel-footer[\s\S]{0,240}background:\s*#162131/);
  assert.match(night,/body\.finance-mode\[data-color-mode="dark"\] #financeRoot \.finance-empty strong/);
  assert.match(night,/body\.finance-mode\[data-color-mode="dark"\] #financeRoot \.finance-table tbody tr\.finance-overdue/);
  assert.match(night,/body\.finance-mode\[data-color-mode="dark"\] #financeRoot \.finance-kpi-balance::before/);
  assert.match(night,/body\.finance-mode\[data-color-mode="dark"\] #financeRoot \.finance-menu-options \.finance-btn/);
  assert.match(appearance,/body\.finance-mode\[data-color-mode="dark"\] \.finance-dashboard/);
  assert.doesNotMatch(night,/CREATE TABLE|ALTER TABLE|DROP TABLE|DELETE FROM|fetch\(/i);
});


test('Chat redesenhado apresenta boas-vindas após login, sugere ações úteis e preserva conversa única',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/chat-workspace.css',import.meta.url),'utf8');
  for(const id of ['chatMessages','chatForm','chatInput','sendChatBtn','chatWelcomeTemplate','chatNewConversation','universalFinance']){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  }
  assert.ok(html.indexOf('id="chatWelcomeTemplate"')>html.indexOf('id="chatMessages"'));
  assert.match(html,/<textarea id="chatInput" rows="1"[^>]*maxlength="500"/);
  assert.equal((html.match(/data-prompt="/g)||[]).length,4);
  assert.doesNotMatch(html,/data-chat-mode="search"|data-chat-mode="ai"|id="universalResults"/);
  assert.ok(html.indexOf('/chat-workspace.css')>html.indexOf('/chat-radar-refinement.css'),
    'O visual novo deve ser carregado depois dos estilos antigos');
  assert.match(app,/function resetChatConversation\(\)/);
  assert.match(app,/area\.replaceChildren\(template\.content\.cloneNode\(true\)\)/);
  assert.match(app,/resetChatConversation\(\);\s*setupFinance/);
  assert.match(app,/resetChatConversation\(\);\s*resetAtlasUI/);
  assert.match(app,/chatNewConversation'\)\.addEventListener\('click'/);
  assert.match(app,/if\(e\.key==='Enter'&&!e\.shiftKey&&!e\.isComposing&&!e\.repeat\)/);
  assert.match(app,/if\(generation!==chatGeneration\)return/);
  assert.match(app,/searchMemory\(q,includeFinance\)/);
  assert.match(app,/api\('\/api\/chat'/);
  assert.match(css,/#chatView \.chat-welcome-suggestions/);
  assert.match(css,/#chatView \.chat-workspace-composer textarea/);
  assert.match(css,/body\[data-color-mode="light"\] #chatView/);
  assert.match(css,/@media\(max-width:700px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.doesNotMatch(css,/body\.finance-mode|#financeRoot|\.finance-dashboard/);
});


test('modo escuro não contém violeta ou lilás e mantém cores semânticas',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/dark-unified.css',import.meta.url),'utf8');
  const oldAtlas=readFileSync(new URL('../public/appearance-modes.css',import.meta.url),'utf8');
  const theme=readFileSync(new URL('../public/visual-theme.js',import.meta.url),'utf8');
  assert.ok(html.includes('href="/dark-unified.css"'),'camada de cores precisa ser carregada');
  assert.ok(html.indexOf('/dark-unified.css')>html.indexOf('/appearance-modes.css'),'cores noturnas devem prevalecer sobre estilos antigos');
  assert.match(css,/--night-bg:\s*#111314/);
  assert.match(css,/--night-sidebar:\s*#141718/);
  assert.match(css,/--night-card:\s*#1d2122/);
  assert.match(css,/--night-accent:\s*#c9b18f/);
  assert.match(css,/--night-green:\s*#80b69d/);
  assert.match(css,/--night-yellow:\s*#e2b980/);
  assert.match(css,/--night-red:\s*#e29a94/);
  assert.doesNotMatch(css,/#(?:b9a8ff|82c4cc|8b7fff|307d8c|a295ff)\b/i);
  assert.match(css,/body\[data-visual-theme\]\[data-color-mode="dark"\] \.sidebar/);
  assert.match(css,/body\[data-visual-theme\]\[data-color-mode="dark"\] #chatView \.chat-avatar/);
  assert.match(css,/body\.finance-mode\[data-visual-theme\]\[data-color-mode="dark"\] #financeRoot \.finance-panel-footer/);
  assert.ok(!css.includes('--night-purple'));
  assert.ok(!css.includes('#b9a8ff')&&!oldAtlas.includes('#b9a8ff'));
  assert.ok(!/rgb\(139 127 255/.test(css));
  assert.match(theme,/mode==='light'\?'#f7f8fc':DARK_PALETTES\[palette\]\.slice\(0,7\)/);
  for(const match of css.matchAll(/#([a-f0-9]{6})\b/gi)){
    const hex=match[1];
    const [r,g,b]=[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)/255);
    const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
    let hue=0;
    if(delta>0){
      hue=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;
      hue=(hue*60+360)%360;
    }
    assert.ok(!(hue>=233&&hue<=310&&max>.2&&delta/(max||1)>.13),
      'A cor #'+hex+' reintroduziu roxo/lilás no escuro');
  }
});


test('Canvas: API exige sessão, quadros isolados e salvamento com revisão',async()=>{
  const {req,env}=setup();
  assert.equal((await req('/api/canvas')).status,401);
  assert.equal((await req('/api/canvas','POST',{title:'Tentativa visitante'})).status,401);
  assert.equal((await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'})).status,200);
  const created=await req('/api/canvas','POST',{title:'Plano de estudos'});
  assert.equal(created.status,201);
  const boardId=created.data.board.id;
  assert.equal(created.data.board.revision,1);
  assert.deepEqual(created.data.board.snapshot,{nodes:[],edges:[]});
  assert.equal((await req('/api/canvas')).data.boards[0].title,'Plano de estudos');
  const noteId=crypto.randomUUID(),taskId=crypto.randomUUID(),groupId=crypto.randomUUID(),edgeId=crypto.randomUUID();
  const due=new Date().toISOString().slice(0,10);
  const snapshot={nodes:[
    {id:groupId,type:'group',x:30,y:50,width:500,height:360,title:'Meu plano',body:'Projetos importantes',color:'#278a69'},
    {id:noteId,type:'note',x:75,y:125,width:240,height:165,title:'Aprender SQL',body:'SELECT, JOIN e índices',color:'#4d8896'},
    {id:taskId,type:'task',x:380,y:125,width:245,height:160,title:'Revisar exercícios',body:'Uma hora',due_date:due,priority:1,done:false,color:'#b78050'}
  ],edges:[{id:edgeId,from:noteId,to:taskId,label:''}]};
  const updated=await req('/api/canvas/'+boardId,'PUT',{title:'Plano visual',revision:1,snapshot});
  assert.equal(updated.status,200);
  assert.equal(updated.data.revision,2);
  const loaded=await req('/api/canvas/'+boardId);
  assert.equal(loaded.data.board.snapshot.nodes.length,3);
  assert.equal(loaded.data.board.snapshot.edges[0].from,noteId);
  assert.equal((await req('/api/canvas/'+boardId,'PUT',{title:'Perdi',revision:1,snapshot})).status,409);
  assert.equal((await req('/api/canvas/'+boardId,'PUT',{title:'Inválido',revision:2,snapshot:{
    nodes:[snapshot.nodes[0],snapshot.nodes[0]],edges:[]}})).status,400);
  assert.equal((await req('/api/canvas/'+boardId,'PUT',{title:'Inválido',revision:2,snapshot:{
    nodes:[{...snapshot.nodes[1],type:'link',url:'javascript:alert(1)'}],edges:[]}})).status,400);
  const member=await req('/api/register','POST',{username:'membrocanvas',password:'senha-muito-segura-123'});
  assert.equal(member.status,201);
  assert.deepEqual((await req('/api/canvas')).data.boards,[]);
  assert.equal((await req('/api/canvas/'+boardId)).status,404);
  assert.equal((await req('/api/canvas/'+boardId,'PUT',{title:'Ataque',revision:2,snapshot})).status,404);
  assert.equal((await req('/api/canvas/'+boardId,'DELETE')).status,404);
  assert.equal((await req('/api/canvas/'+boardId+'/tasks','POST',{nodeId:taskId})).status,404);
  const memberBoard=await req('/api/canvas','POST',{title:'Quadro particular'});
  assert.equal(memberBoard.status,201);
  assert.notEqual(memberBoard.data.board.id,boardId);
  assert.equal((await req('/api/login','POST',{username:'principal',password:'um-passphrase-longo-de-verdade'})).status,200);
  assert.equal((await req('/api/canvas')).data.boards.length,1);
  assert.equal((await req('/api/canvas/'+memberBoard.data.board.id)).status,404);
});
test('Canvas: vínculo real com Radar, conclusão compartilhada e exclusão sem perder tarefa',async()=>{
  const {req,env}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const id=(await req('/api/canvas','POST',{title:'Minhas prioridades'})).data.board.id;
  const nodeId=crypto.randomUUID();
  const due=new Date().toISOString().slice(0,10);
  const snapshot={nodes:[{
    id:nodeId,type:'task',x:100,y:200,width:260,height:160,
    title:'Enviar currículo',body:'Tarefa ligada ao Radar',color:'#278a69',
    due_date:due,priority:1,done:false
  }],edges:[]};
  assert.equal((await req('/api/canvas/'+id+'/tasks','POST',{nodeId})).status,404);
  assert.equal((await req('/api/canvas/'+id,'PUT',{title:'Minhas prioridades',revision:1,snapshot})).status,200);
  const linked=await req('/api/canvas/'+id+'/tasks','POST',{nodeId});
  assert.equal(linked.status,201);
  const taskId=linked.data.task_id;
  assert.match(taskId,/^[0-9a-f-]{36}$/);
  const duplicate=await req('/api/canvas/'+id+'/tasks','POST',{nodeId});
  assert.equal(duplicate.status,200);
  assert.equal(duplicate.data.task_id,taskId);
  const radar=await req('/api/radar');
  assert.ok(radar.data.tasks.some(t=>t.id===taskId && t.title==='Enviar currículo'));
  assert.equal((await req('/api/radar/tasks/'+taskId,'PATCH',{done:true})).status,200);
  const board=(await req('/api/canvas/'+id)).data;
  assert.equal(board.links.length,1);
  assert.equal(board.links[0].task_id,taskId);
  assert.ok(board.links[0].done_at);
  assert.equal((await req('/api/canvas/'+id,'DELETE')).status,200);
  assert.equal((await req('/api/canvas/'+id)).status,404);
  const preserved=await env.DB.prepare('SELECT id FROM radar_tasks WHERE id=?').bind(taskId).first();
  assert.ok(preserved);
});


test('Canvas entra no backup completo e restaura mapas e vínculos do próprio usuário',async()=>{
  const {req}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const id=(await req('/api/canvas','POST',{title:'Meu mapa para backup'})).data.board.id;
  const nodeId=crypto.randomUUID();
  const snapshot={nodes:[{id:nodeId,type:'task',x:55,y:88,width:270,height:170,
    title:'Uma tarefa do mapa',body:'Preservada no backup',color:'#4d8896',
    due_date:new Date().toISOString().slice(0,10),priority:2,done:false}],edges:[]};
  assert.equal((await req('/api/canvas/'+id,'PUT',{title:'Meu mapa para backup',revision:1,snapshot})).status,200);
  const link=await req('/api/canvas/'+id+'/tasks','POST',{nodeId});
  assert.equal(link.status,201);
  const backup=(await req('/api/export')).data;
  assert.equal(backup.canvases.length,1);
  assert.equal(backup.canvases[0].task_links[0].task_id,link.data.task_id);
  assert.equal((await req('/api/canvas/'+id,'DELETE')).status,200);
  const restore=await req('/api/import','POST',{canvases:backup.canvases});
  assert.equal(restore.status,200);
  assert.equal(restore.data.canvasImported,1);
  const returned=(await req('/api/canvas/'+id)).data;
  assert.equal(returned.board.snapshot.nodes[0].title,'Uma tarefa do mapa');
  assert.equal(returned.links.length,1);
  assert.equal(returned.links[0].task_id,link.data.task_id);
  const again=await req('/api/import','POST',{canvases:backup.canvases});
  assert.equal(again.data.canvasSkipped,1);
});


test('Mapas mentais: cartões de vídeo exigem propriedade da própria biblioteca',async()=>{
  const {req}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const created=(await req('/api/videos','POST',vid)).data.video;
  const boardId=(await req('/api/canvas','POST',{title:'Referências de culinária'})).data.board.id;
  const node={id:crypto.randomUUID(),type:'video',video_id:created.id,x:50,y:60,width:305,height:190,title:'Receita de exemplo',body:'Resumo da aula',color:'#278a69'};
  const save=await req('/api/canvas/'+boardId,'PUT',{title:'Referências de culinária',revision:1,snapshot:{nodes:[node],edges:[]}});
  assert.equal(save.status,200);
  assert.equal((await req('/api/canvas/'+boardId)).data.board.snapshot.nodes[0].video_id,created.id);
  const fake={...node,id:crypto.randomUUID(),video_id:crypto.randomUUID()};
  assert.equal((await req('/api/canvas/'+boardId,'PUT',{title:'Mapa indevido',revision:2,snapshot:{nodes:[fake],edges:[]}})).status,403);
  assert.equal((await req('/api/canvas/'+boardId,'PUT',{title:'Sem vínculo',revision:2,snapshot:{nodes:[{...node,video_id:''}],edges:[]}})).status,400);
  const attacker=await req('/api/register','POST',{username:'mapas_visitante',password:'senha-segura-do-visitante-123'});
  assert.equal(attacker.status,201);
  const his=(await req('/api/canvas','POST',{title:'Mapa próprio'})).data.board.id;
  assert.equal((await req('/api/canvas/'+his,'PUT',{title:'Tentativa de vínculo',revision:1,snapshot:{nodes:[node],edges:[]}})).status,403);
});
test('Mapas mentais: esboço IA exige login, valida entrada e limita consumo por conta',async()=>{
  let count=0;
  const ai={async run(_model,opts){
    count++;
    assert.match(opts.messages[1].content,/organizar estudos/i);
    return {response:'{"branches":[{"title":"Matemática","ideas":["Revisão","Exercícios"]},{"title":"Português","ideas":["Leitura","Escrita"]}]}'};
  }};
  const {req}=setup(ai);
  assert.equal((await req('/api/canvas/outline','POST',{prompt:'organizar estudos'})).status,401);
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  assert.equal((await req('/api/canvas/outline','POST',{prompt:'curto'})).status,400);
  for(let i=0;i<6;i++){
    const response=await req('/api/canvas/outline','POST',{prompt:'organizar estudos e minhas matérias'});
    assert.equal(response.status,200);
    assert.equal(response.data.branches.length,2);
  }
  assert.equal((await req('/api/canvas/outline','POST',{prompt:'organizar estudos e minhas matérias'})).status,429);
  assert.equal(count,6);
});


test('login usa reserva atômica para conter várias tentativas simultâneas',async()=>{
  const {req}=setup();
  const owner=await req('/api/setup-owner','POST',{setup_key:'um-passphrase-longo-de-verdade',username:'principal',password:'senha-do-dono-de-teste-123'});
  assert.equal(owner.status,201);
  for(let i=0;i<8;i++)assert.equal((await req('/api/login','POST',{username:'principal',password:'senha-incorreta-123'})).status,401);
  assert.equal((await req('/api/login','POST',{username:'principal',password:'senha-do-dono-de-teste-123'})).status,429);
});

test('sessões podem ser invalidadas simultaneamente sem excluir conteúdo da conta',async()=>{
  const {req}=setup();
  const owner=await req('/api/setup-owner','POST',{setup_key:'um-passphrase-longo-de-verdade',username:'principal',password:'senha-do-dono-de-teste-123'});
  assert.equal(owner.status,201);
  const saved=await req('/api/videos','POST',vid);
  assert.equal(saved.status,201);
  assert.equal((await req('/api/session')).data.authenticated,true);
  assert.equal((await req('/api/sessions/revoke-all','POST')).status,200);
  assert.equal((await req('/api/session')).data.authenticated,false);
  assert.equal((await req('/api/export')).status,401);
  assert.equal((await req('/api/login','POST',{username:'principal',password:'senha-do-dono-de-teste-123'})).status,200);
  assert.equal((await req('/api/videos')).data.videos.length,1);
});

test('Turnstile configurado bloqueia cadastro sem token e com configuração parcial',async()=>{
  const {req,env}=setup();
  assert.equal((await req('/api/setup-owner','POST',{setup_key:'um-passphrase-longo-de-verdade',username:'principal',password:'senha-do-dono-de-teste-123'})).status,201);
  env.TURNSTILE_SITE_KEY='example-sitekey';
  env.TURNSTILE_SECRET='example-secret';
  const settings=(await req('/api/session')).data.turnstile;
  assert.deepEqual(settings,{enabled:true,configured:true,siteKey:'example-sitekey'});
  const payload={username:'cadastroseguro',password:'senha-forte-de-teste-123'};
  assert.equal((await req('/api/register','POST',payload)).status,403);
  env.TURNSTILE_SECRET=undefined;
  assert.equal((await req('/api/register','POST',payload)).status,503);
});


test('administração: apenas dono acessa diretório e painéis de membros, com auditoria e isolamento',async()=>{
  const {env}=setup();
  async function call(path,method='GET',body=null,cookie=''){
    const headers={origin:'https://relembra.example'};
    if(body!==null)headers['content-type']='application/json';
    if(cookie)headers.cookie=cookie;
    const res=await worker.fetch(new Request('https://relembra.example'+path,{
      method,headers,...(body!==null?{body:JSON.stringify(body)}:{})
    }),env);
    return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  }
  const owner=await call('/api/setup-owner','POST',{
    username:'principal',password:'senha-dono-muito-segura-123',setup_key:'um-passphrase-longo-de-verdade'
  });
  assert.equal(owner.status,201);
  const ownerCookie=owner.cookie;
  const member=await call('/api/register','POST',{
    username:'cliente01',password:'senha-membro-muito-segura-123'
  });
  assert.equal(member.status,201);
  const memberCookie=member.cookie;
  assert.equal((await call('/api/admin/users','GET',null,memberCookie)).status,403);
  assert.equal((await call('/api/admin/users','GET')).status,401);
  assert.equal((await call('/api/admin/audit','GET',null,memberCookie)).status,403);
  assert.equal((await call('/api/admin/users','POST',{},ownerCookie)).status,405);
  assert.equal((await call('/api/admin/users?section=overview','GET',null,ownerCookie)).status,200);
  assert.equal((await call('/api/admin/users','GET',null,ownerCookie)).data.stats.total,1);
  const users=(await call('/api/admin/users?q=cliente&page=1','GET',null,ownerCookie)).data;
  assert.equal(users.users.length,1);
  assert.equal(users.users[0].username,'cliente01');
  assert.equal(users.users[0].password_hash,undefined);
  assert.equal(users.users[0].password_salt,undefined);
  const id=users.users[0].id;
  // A conta proprietária consulta os painéis independentemente de preferências antigas.
  assert.equal(users.users[0].admin_view_consent,undefined);
  assert.equal((await call('/api/account/admin-view-consent','GET',null,memberCookie)).status,404);
  assert.equal((await call('/api/account/admin-view-consent','PUT',{enabled:false},memberCookie)).status,404);
  const memberCategories=(await call('/api/categories','GET',null,memberCookie)).data.categories;
  const category=memberCategories.find(c=>c.name==='Culinária')?.id||memberCategories[0]?.id;
  const video=await call('/api/videos','POST',{
    ...vid,category,url:'https://www.instagram.com/reel/AdminMember01/'
  },memberCookie);
  assert.equal(video.status,201);
  const before=(await call('/api/admin/audit','GET',null,ownerCookie)).data.audit.length;
  for(const section of ['overview','library','finance','radar','maps','notes']){
    const seen=await call('/api/admin/users/'+id+'/dashboard?section='+section,'GET',null,ownerCookie);
    assert.equal(seen.status,200,JSON.stringify(seen.data));
    assert.equal(seen.data.readonly,true);
    assert.equal(seen.data.section,section);
    assert.equal(seen.data.user.username,'cliente01');
    assert.equal(seen.data.user.password_hash,undefined);
    if(section==='library')assert.equal(seen.data.videos[0].title,vid.title);
  }
  const log=(await call('/api/admin/audit','GET',null,ownerCookie)).data.audit;
  assert.equal(log.length,before+6);
  assert.equal(log[0].target_username,'cliente01');
  assert.equal(log[0].section,'notes');
  assert.equal((await call('/api/admin/users/'+id+'/dashboard?section=invalid','GET',null,ownerCookie)).status,404);
  assert.equal((await call('/api/admin/users/'+id+'/dashboard?section=finance','GET',null,memberCookie)).status,403);
  assert.equal((await call('/api/videos/'+video.data.video.id,'GET',null,ownerCookie)).status,404);
  assert.equal((await call('/api/videos','GET',null,ownerCookie)).data.total,0);
  const memberLog=(await call('/api/account/admin-access','GET',null,memberCookie)).data.accesses;
  assert.equal(memberLog.length,6);
  assert.equal(memberLog[0].section,'notes');
  assert.equal(memberLog[0].actor_id,undefined);
  assert.equal((await call('/api/admin/users/'+id+'/dashboard?section=finance','GET',null,ownerCookie)).status,200);
  assert.equal((await call('/api/admin/audit','GET',null,ownerCookie)).data.audit.length,7);
  assert.equal((await call('/api/account/admin-access','GET',null,memberCookie)).data.accesses.length,7);
});
test('atividade recente é registrada no login e em heartbeat sem confiar em identificadores enviados',async()=>{
  const {env}=setup();
  async function call(path,method='GET',body=null,cookie=''){
    const headers={origin:'https://relembra.example'};
    if(body!==null)headers['content-type']='application/json';
    if(cookie)headers.cookie=cookie;
    const res=await worker.fetch(new Request('https://relembra.example'+path,{
      method,headers,...(body!==null?{body:JSON.stringify(body)}:{})
    }),env);
    return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
  }
  const owner=await call('/api/setup-owner','POST',{
    username:'principal',password:'senha-dono-muito-segura-123',setup_key:'um-passphrase-longo-de-verdade'
  });
  const member=await call('/api/register','POST',{username:'contaatividade',password:'senha-membro-muito-segura-123'});
  const id=(await call('/api/admin/users','GET',null,owner.cookie)).data.users[0].id;
  const row=await env.DB.prepare('SELECT last_seen_at,last_login_at FROM app_users WHERE id=?').bind(id).first();
  assert.ok(row.last_seen_at&&row.last_login_at);
  await env.DB.prepare('UPDATE app_users SET last_seen_at=? WHERE id=?').bind('2020-01-01T00:00:00.000Z',id).run();
  const beat=await call('/api/activity','POST',{owner_id:'qualquer-outro'},member.cookie);
  assert.equal(beat.status,200);
  const refreshed=await env.DB.prepare('SELECT last_seen_at FROM app_users WHERE id=?').bind(id).first();
  assert.ok(refreshed.last_seen_at>row.last_login_at||refreshed.last_seen_at===row.last_login_at);
  assert.equal((await call('/api/activity','POST',{},'')).status,401);
  const active=(await call('/api/admin/users','GET',null,owner.cookie)).data;
  assert.equal(active.stats.recentlyActive,1);
});
test('página de administração não fornece função de edição nem sessão de outro membro',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const js=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');
  const workerSrc=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
  assert.match(html,/id="adminNavItem" data-view="admin" hidden/);
  assert.match(html,/Somente leitura/);
  assert.match(html,/id="adminAuditList"/);
  assert.match(html,/id="myAdminAccess"/);
  assert.match(html,/proprietário da plataforma pode consultar painéis de usuários/);
  assert.doesNotMatch(html,/id="myAdminConsentToggle"/);
  assert.doesNotMatch(js,/myAdminConsentToggle|admin_view_consent/);
  assert.match(js,/readonly!==true/);
  assert.doesNotMatch(js,/method:\s*'PUT'|method:\s*'DELETE'|method:\s*'PATCH'/);
  assert.match(workerSrc,/handleAdministration\(request,env,user\)/);
});


test('administração: proprietário não depende de campo histórico de autorização',async()=>{
  const {req,env}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  await req('/api/register','POST',{username:'acessodono02',password:'senha-membro-admin-123'});
  const member=await env.DB.prepare("SELECT id FROM app_users WHERE role='member'").first();
  // Dados históricos de versões anteriores não modificam permissões administrativas.
  await env.DB.prepare('UPDATE app_users SET admin_view_consent=0 WHERE id=?').bind(member.id).run();
  await req('/api/login','POST',{username:'principal',password:'um-passphrase-longo-de-verdade'});
  const view=await req('/api/admin/users/'+member.id+'/dashboard?section=notes');
  assert.equal(view.status,200);
  assert.equal(view.data.readonly,true);
  assert.equal(view.data.user.admin_view_consent,undefined);
  const users=await req('/api/admin/users');
  assert.equal(users.data.users[0].admin_view_consent,undefined);
  assert.equal((await req('/api/account/admin-view-consent')).status,404);
  assert.equal((await req('/api/account/admin-view-consent','PUT',{enabled:false})).status,404);
  const audit=(await req('/api/admin/audit')).data.audit;
  assert.equal(audit.length,1);
  assert.equal(audit[0].section,'notes');
});
test('auditoria: limite de leitura administrativa do proprietário aplica 429 sem revelar dados',async()=>{
  const {req}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  for(let i=0;i<120;i++){
    const result=await req('/api/admin/users');
    assert.equal(result.status,200,'consulta '+i);
  }
  assert.equal((await req('/api/admin/users')).status,429);
  assert.equal((await req('/api/admin/audit')).status,429);
});
test('auditoria: logs antigos são podados e histórico da conta não revela IDs do administrador',async()=>{
  const {req,env}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  await req('/api/register','POST',{username:'historico02',password:'senha-membro-historico-123'});
  const member=await env.DB.prepare("SELECT id FROM app_users WHERE role='member'").first();
  const owner=await env.DB.prepare("SELECT id FROM app_users WHERE role='owner'").first();
  const oldStamp='2020-01-01T00:00:00.000Z';
  await env.DB.prepare(
    'INSERT INTO admin_access_audit(id,actor_id,target_id,action,section,created_at) VALUES(?,?,?,?,?,?)'
  ).bind(crypto.randomUUID(),owner.id,member.id,'view-dashboard','overview',oldStamp).run();
  await req('/api/login','POST',{username:'principal',password:'um-passphrase-longo-de-verdade'});
  assert.equal((await req('/api/admin/users/'+member.id+'/dashboard?section=overview')).status,200);
  const rows=(await env.DB.prepare('SELECT created_at FROM admin_access_audit WHERE actor_id=?').bind(owner.id).all()).results;
  assert.equal(rows.length,1);
  assert.notEqual(rows[0].created_at,oldStamp);
  await req('/api/login','POST',{username:'historico02',password:'senha-membro-historico-123'});
  const accesses=(await req('/api/account/admin-access')).data.accesses;
  assert.equal(accesses.length,1);
  assert.equal(accesses[0].actor_id,undefined);
  assert.equal(accesses[0].target_id,undefined);
  assert.equal(accesses[0].section,'overview');
});


test('auditoria: rotina diária elimina logs vencidos mesmo sem novas visitas de administrador',async()=>{
  const {req,env}=setup();
  await req('/api/login','POST',{password:'um-passphrase-longo-de-verdade'});
  const owner=await env.DB.prepare("SELECT id FROM app_users WHERE role='owner'").first();
  await req('/api/register','POST',{username:'expiracaolog',password:'senha-membro-expiracao-123'});
  const member=await env.DB.prepare("SELECT id FROM app_users WHERE role='member'").first();
  for(const [date,i] of [['2020-01-01T00:00:00.000Z',0],[new Date().toISOString(),1]]){
    await env.DB.prepare('INSERT INTO admin_access_audit(id,actor_id,target_id,action,section,created_at) VALUES(?,?,?,?,?,?)')
      .bind(crypto.randomUUID(),owner.id,member.id,'view-dashboard','overview',date).run();
  }
  const prior=(await env.DB.prepare('SELECT COUNT(*) AS n FROM admin_access_audit').first()).n;
  assert.equal(prior,2);
  await worker.scheduled({},env);
  const remaining=(await env.DB.prepare('SELECT created_at FROM admin_access_audit').all()).results;
  assert.equal(remaining.length,1);
  assert.ok(remaining[0].created_at.startsWith(String(new Date().getFullYear())));
});

test('interface administrativa ignora consultas que chegam após logout e renderiza conteúdo como texto',()=>{
  const script=readFileSync(new URL('../public/admin.js',import.meta.url),'utf8');
  const backend=readFileSync(new URL('../src/admin.js',import.meta.url),'utf8');
  const view=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  assert.match(script,/adminAuditEpoch\+\+/);
  assert.match(script,/accessLoadEpoch\+\+/);
  assert.match(script,/epoch!==accessLoadEpoch\|\|adminOwner/);
  assert.match(script,/epoch!==adminAuditEpoch\|\|!adminOwner/);
  assert.match(script,/node.textContent=String\(value\)/);
  assert.doesNotMatch(view,/id="myAdminConsentToggle"/);
  assert.doesNotMatch(backend,/admin_view_consent/);
  assert.match(view,/proprietário da plataforma pode consultar painéis de usuários/);
  assert.match(backend,/reserveAdminRead\(env,user\)/);
  assert.match(backend,/LIMIT 1 OFFSET 1999/);
  assert.doesNotMatch(script,/\.innerHTML\s*=/);
});
