import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { handleSocial } from '../src/social.js';

function makeEnv(){
  const db=new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys=ON');
  db.exec("CREATE TABLE app_users (id TEXT PRIMARY KEY,username TEXT NOT NULL UNIQUE,role TEXT NOT NULL DEFAULT 'member');");
  db.exec("CREATE TABLE login_attempts (ip_hash TEXT PRIMARY KEY, attempts INTEGER NOT NULL DEFAULT 0, window_start INTEGER NOT NULL DEFAULT 0);");
  db.exec(readFileSync(new URL('../migrations/0016_social_community.sql',import.meta.url),'utf8'));
  db.prepare("INSERT INTO app_users(id,username) VALUES (?,?)").run('user-alice','alice');
  db.prepare("INSERT INTO app_users(id,username) VALUES (?,?)").run('user-bob','bob');
  return {raw:db,DB:{prepare(sql){
    const statement=db.prepare(sql);
    return {bind(...values){
      return {
        first:async()=>statement.get(...values)||null,
        all:async()=>({results:statement.all(...values)}),
        run:async()=>{const r=statement.run(...values);return {meta:{changes:Number(r.changes)}};}
      };
    }};
  }}};
}
async function call(env,who,path,method='GET',body=null){
  const request=new Request('https://relembra.example'+path,{method,headers:body?{'content-type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const res=await handleSocial(request,env,{id:who,username:who==='user-alice'?'alice':'bob'});
  return {status:res.status,data:await res.json()};
}
test('Social: perfis são privados por padrão e não revelam outras áreas',async()=>{
  const env=makeEnv();
  const me=await call(env,'user-alice','/api/social/me');
  assert.equal(me.status,200);assert.equal(me.data.profile.is_public,0);
  const cannotPost=await call(env,'user-alice','/api/social/posts','POST',{content:'testando'});
  assert.equal(cannotPost.status,403);
  assert.equal((await call(env,'user-bob','/api/social/feed')).data.posts.length,0);
  assert.equal((await call(env,'user-bob','/api/social/profile/alice')).status,404);
});
test('Social: @ é único, valida nomes e controla perfil público',async()=>{
  const env=makeEnv();
  assert.equal((await call(env,'user-alice','/api/social/availability?handle=admin')).data.available,false);
  assert.equal((await call(env,'user-alice','/api/social/availability?handle=alice_dev')).data.available,true);
  const saved=await call(env,'user-alice','/api/social/me','PUT',{handle:'alice_dev',display_name:'Alice Dev',bio:'Estudo Linux',is_public:true});
  assert.equal(saved.status,200);assert.equal(saved.data.profile.handle,'alice_dev');
  assert.equal((await call(env,'user-bob','/api/social/availability?handle=ALICE_DEV')).data.available,false);
  const collision=await call(env,'user-bob','/api/social/me','PUT',{handle:'alice_dev',display_name:'Bob',is_public:true});
  assert.equal(collision.status,409);
  const pub=await call(env,'user-bob','/api/social/profile/alice_dev');
  assert.equal(pub.status,200);assert.equal(pub.data.profile.display_name,'Alice Dev');
  assert.equal(pub.data.profile.bio,'Estudo Linux');
  const hidden=await call(env,'user-alice','/api/social/me','PUT',{handle:'alice_dev',display_name:'Alice Dev',bio:'',is_public:false});
  assert.equal(hidden.status,200);
  assert.equal((await call(env,'user-bob','/api/social/profile/alice_dev')).status,404);
});
test('Social: feed, seguir, curtir, comentar e ocultar ao privatizar',async()=>{
  const env=makeEnv();
  for(const [id,handle] of [['user-alice','alice_dev'],['user-bob','bob_dev']]){
    assert.equal((await call(env,id,'/api/social/me','PUT',{handle,display_name:handle,is_public:true})).status,200);
  }
  const created=await call(env,'user-alice','/api/social/posts','POST',{content:'Aprendi a usar Linux!'});
  assert.equal(created.status,201);
  const id=created.data.id;
  assert.equal((await call(env,'user-bob','/api/social/feed')).data.posts.length,1);
  assert.equal((await call(env,'user-bob','/api/social/feed?mode=following')).data.posts.length,0);
  assert.equal((await call(env,'user-bob','/api/social/follow/alice_dev','POST')).data.following,true);
  assert.equal((await call(env,'user-bob','/api/social/feed?mode=following')).data.posts.length,1);
  assert.equal((await call(env,'user-bob','/api/social/posts/'+id+'/like','POST')).data.liked,true);
  assert.equal((await call(env,'user-bob','/api/social/posts/'+id+'/comments','POST',{content:'Parabéns!'})).status,201);
  const post=(await call(env,'user-bob','/api/social/feed')).data.posts[0];
  assert.equal(post.likes,1);assert.equal(post.comments,1);assert.equal(post.liked,1);
  const comments=(await call(env,'user-bob','/api/social/posts/'+id+'/comments')).data.comments;
  assert.equal(comments.length,1);assert.equal(comments[0].content,'Parabéns!');
  assert.equal((await call(env,'user-bob','/api/social/posts/'+id,'DELETE')).status,404);
  await call(env,'user-alice','/api/social/me','PUT',{handle:'alice_dev',display_name:'Alice Dev',is_public:false});
  assert.equal((await call(env,'user-bob','/api/social/feed')).data.posts.length,0);
  assert.equal((await call(env,'user-bob','/api/social/posts/'+id+'/comments')).status,404);
});
test('Navegação contém os dois módulos sociais e estilos claros/escuros',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/social-pleny.css',import.meta.url),'utf8');
  const client=readFileSync(new URL('../public/social.js',import.meta.url),'utf8');
  assert.match(html,/id="communityView"/);assert.match(html,/id="profileView"/);
  assert.match(html,/social-pleny.css/);assert.match(app,/loadSocial\(known\)/);
  assert.match(css,/data-color-mode="light"/);assert.match(css,/data-color-mode="dark"/);
  assert.match(client,/data-social-comment-form/);
});
