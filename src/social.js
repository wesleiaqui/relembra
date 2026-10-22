import { readLimitedJSON } from './security.js';

// Rotas autenticadas. Dados pessoais de outros módulos nunca são consultados.
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(message,status=400)=>json({error:message},status);
const trim=(value,max)=>String(value??'').trim().slice(0,max);
const stamp=()=>new Date().toISOString();
const validHandle=value=>/^[a-z][a-z0-9_]{2,19}$/.test(value) && !new Set(['admin','root','support','relembra','official','api','login','settings','profile','moderator','moderacao','security','help']).has(value);
async function body(request){return readLimitedJSON(request,4500);}
async function rate(env,userId,kind,limit){
  const key='social:'+kind+':'+userId;
  const now=Date.now(),cutoff=now-60000;
  const res=await env.DB.prepare('INSERT INTO login_attempts(ip_hash,attempts,window_start) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END RETURNING attempts').bind(key,now,cutoff,cutoff).first();
  return Number(res?.attempts||0)<=limit;
}
async function mine(env,user){
  const row=await env.DB.prepare('SELECT handle,display_name,bio,is_public,updated_at FROM social_profiles WHERE user_id=?').bind(user.id).first();
  return row||{handle:null,display_name:user.username,bio:'',is_public:0,updated_at:null};
}
async function publicProfile(env,handle){
  return env.DB.prepare('SELECT user_id,handle,display_name,bio FROM social_profiles WHERE handle=? AND is_public=1').bind(handle).first();
}
async function counts(env,userId,viewerId){
  const [followers,following,followed,posts]=await Promise.all([
    env.DB.prepare('SELECT count(*) AS n FROM social_follows WHERE followed_id=?').bind(userId).first(),
    env.DB.prepare('SELECT count(*) AS n FROM social_follows WHERE follower_id=?').bind(userId).first(),
    env.DB.prepare('SELECT 1 AS yes FROM social_follows WHERE follower_id=? AND followed_id=?').bind(viewerId,userId).first(),
    env.DB.prepare('SELECT count(*) AS n FROM social_posts WHERE author_id=?').bind(userId).first()
  ]);
  return {followers:Number(followers.n),following:Number(following.n),is_following:!!followed,posts:Number(posts.n)};
}
async function postVisible(env,id){
  return env.DB.prepare('SELECT p.id,p.author_id FROM social_posts p JOIN social_profiles s ON s.user_id=p.author_id AND s.is_public=1 WHERE p.id=?').bind(id).first();
}
function routeParam(path,prefix){
  const name=path.slice(prefix.length);
  if(!name||name.includes('/')||name.length>80)return null;
  try{return decodeURIComponent(name).toLowerCase();}catch{return null;}
}
export async function handleSocial(request,env,user){
  const url=new URL(request.url),path=url.pathname,method=request.method;
  if(path==='/api/social/me'&&method==='GET')return json({profile:await mine(env,user)});
  if(path==='/api/social/availability'&&method==='GET'){
    const handle=trim(url.searchParams.get('handle'),80).toLowerCase();
    if(!validHandle(handle))return json({available:false,reason:'Use de 3 a 20 caracteres: letras minúsculas, números e _. Comece por letra.'});
    const existing=await env.DB.prepare('SELECT user_id FROM social_profiles WHERE handle=?').bind(handle).first();
    return json({available:!existing||existing.user_id===user.id});
  }
  if(path==='/api/social/me'&&method==='PUT'){
    if(!await rate(env,user.id,'profile',10))return fail('Muitas alterações. Tente novamente em um minuto.',429);
    const data=await body(request);
    const handle=trim(data.handle,80).toLowerCase().replace(/^@/,'');
    if(!validHandle(handle))return fail('O @ precisa começar por letra e ter 3 a 20 caracteres (a-z, 0-9, _).');
    const displayName=trim(data.display_name,60),bio=trim(data.bio,240);
    if(displayName.length<2)return fail('Informe um nome com pelo menos 2 caracteres.');
    const publicValue=data.is_public===true?1:0;
    const existing=await env.DB.prepare('SELECT user_id FROM social_profiles WHERE handle=?').bind(handle).first();
    if(existing&&existing.user_id!==user.id)return fail('Este @ já está em uso.',409);
    try{
      await env.DB.prepare('INSERT INTO social_profiles(user_id,handle,display_name,bio,is_public,updated_at) VALUES(?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET handle=excluded.handle,display_name=excluded.display_name,bio=excluded.bio,is_public=excluded.is_public,updated_at=excluded.updated_at')
      .bind(user.id,handle,displayName,bio,publicValue,stamp()).run();
    }catch(e){if(/UNIQUE constraint/i.test(String(e?.message)))return fail('Este @ já está em uso.',409);throw e;}
    return json({profile:await mine(env,user)});
  }
  if(path.startsWith('/api/social/profile/')&&method==='GET'){
    const handle=routeParam(path,'/api/social/profile/');
    if(!handle||!validHandle(handle))return fail('Perfil não encontrado.',404);
    const profile=await publicProfile(env,handle);
    if(!profile)return fail('Perfil privado ou inexistente.',404);
    const stats=await counts(env,profile.user_id,user.id);
    return json({profile:{handle:profile.handle,display_name:profile.display_name,bio:profile.bio,...stats,is_self:profile.user_id===user.id}});
  }
  if(path==='/api/social/feed'&&method==='GET'){
    const following=url.searchParams.get('mode')==='following';
    const offset=Math.max(0,Math.min(500,Number.parseInt(url.searchParams.get('offset')||'0',10)||0));
    const limit=20;
    const query=`SELECT p.id,p.content,p.created_at,s.handle,s.display_name,
      (SELECT COUNT(*) FROM social_likes l WHERE l.post_id=p.id) AS likes,
      (SELECT COUNT(*) FROM social_comments c WHERE c.post_id=p.id) AS comments,
      EXISTS(SELECT 1 FROM social_likes l WHERE l.post_id=p.id AND l.user_id=?) AS liked,
      EXISTS(SELECT 1 FROM social_follows f WHERE f.followed_id=p.author_id AND f.follower_id=?) AS following
      FROM social_posts p JOIN social_profiles s ON s.user_id=p.author_id AND s.is_public=1
      WHERE (?=0 OR EXISTS(SELECT 1 FROM social_follows f WHERE f.follower_id=? AND f.followed_id=p.author_id))
      ORDER BY p.created_at DESC LIMIT ? OFFSET ?`;
    const rows=(await env.DB.prepare(query).bind(user.id,user.id,following?1:0,user.id,limit,offset).all()).results||[];
    return json({posts:rows,has_more:rows.length===limit});
  }
  if(path==='/api/social/posts'&&method==='POST'){
    if(!await rate(env,user.id,'post',5))return fail('Limite de 5 publicações por minuto atingido.',429);
    const profile=await mine(env,user);
    if(!profile.handle||!profile.is_public)return fail('Ative seu perfil público e escolha seu @ para publicar.',403);
    const data=await body(request),content=trim(data.content,1200);
    if(!content)return fail('Escreva algo para publicar.');
    const id=crypto.randomUUID();
    await env.DB.prepare('INSERT INTO social_posts(id,author_id,content,created_at) VALUES(?,?,?,?)').bind(id,user.id,content,stamp()).run();
    return json({ok:true,id},201);
  }
  if(path.startsWith('/api/social/posts/')){
    const parts=path.split('/').filter(Boolean),id=parts[3];
    if(parts.length<4||!id||!/^[a-f0-9-]{36}$/i.test(id))return fail('Publicação inválida.',404);
    if(parts.length===4&&method==='DELETE'){
      const r=await env.DB.prepare('DELETE FROM social_posts WHERE id=? AND author_id=?').bind(id,user.id).run();
      return r.meta?.changes?json({ok:true}):fail('Publicação não encontrada.',404);
    }
    if(parts[4]==='like'&&parts.length===5&&method==='POST'){
      if(!await rate(env,user.id,'react',50))return fail('Muitas ações. Tente novamente.',429);
      if(!await postVisible(env,id))return fail('Publicação indisponível.',404);
      const current=await env.DB.prepare('SELECT 1 AS yes FROM social_likes WHERE post_id=? AND user_id=?').bind(id,user.id).first();
      if(current)await env.DB.prepare('DELETE FROM social_likes WHERE post_id=? AND user_id=?').bind(id,user.id).run();
      else await env.DB.prepare('INSERT OR IGNORE INTO social_likes(user_id,post_id,created_at) VALUES(?,?,?)').bind(user.id,id,stamp()).run();
      return json({liked:!current});
    }
    if(parts[4]==='comments'&&parts.length===5){
      if(!await postVisible(env,id))return fail('Publicação indisponível.',404);
      if(method==='GET'){
        const rows=(await env.DB.prepare('SELECT c.id,c.content,c.created_at,s.handle,s.display_name FROM social_comments c JOIN social_profiles s ON s.user_id=c.author_id AND s.is_public=1 WHERE c.post_id=? ORDER BY c.created_at ASC LIMIT 100').bind(id).all()).results||[];
        return json({comments:rows});
      }
      if(method==='POST'){
        if(!await rate(env,user.id,'comment',15))return fail('Limite de comentários atingido. Tente novamente em um minuto.',429);
        const profile=await mine(env,user);
        if(!profile.handle||!profile.is_public)return fail('Ative seu perfil público para comentar.',403);
        const data=await body(request),content=trim(data.content,500);
        if(!content)return fail('Escreva um comentário.');
        await env.DB.prepare('INSERT INTO social_comments(id,post_id,author_id,content,created_at) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),id,user.id,content,stamp()).run();
        return json({ok:true},201);
      }
    }
  }
  if(path.startsWith('/api/social/follow/')&&method==='POST'){
    if(!await rate(env,user.id,'follow',30))return fail('Muitas ações. Tente novamente.',429);
    const handle=routeParam(path,'/api/social/follow/');
    if(!handle||!validHandle(handle))return fail('Perfil inválido.',404);
    const target=await publicProfile(env,handle);
    if(!target)return fail('Perfil privado ou inexistente.',404);
    if(target.user_id===user.id)return fail('Você não pode seguir seu próprio perfil.');
    const current=await env.DB.prepare('SELECT 1 AS yes FROM social_follows WHERE follower_id=? AND followed_id=?').bind(user.id,target.user_id).first();
    if(current)await env.DB.prepare('DELETE FROM social_follows WHERE follower_id=? AND followed_id=?').bind(user.id,target.user_id).run();
    else await env.DB.prepare('INSERT OR IGNORE INTO social_follows(follower_id,followed_id,created_at) VALUES(?,?,?)').bind(user.id,target.user_id,stamp()).run();
    return json({following:!current});
  }
  return fail('Rota social não encontrada.',404);
}
