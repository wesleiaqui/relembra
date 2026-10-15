// Segurança compartilhada: limites atômicos D1 e cabeçalhos de proteção.
// Nenhuma cota depende de estado em memória, pois Workers escalam entre instâncias.
const LIMITS=Object.freeze({
  chat:45,thought:12,image:10,canvas:6
});
const hourMs=60*60*1000;
export async function reserveAIQuota(env,userId,kind){
  if(!Object.hasOwn(LIMITS,kind))throw new Error('Tipo de operação inválido.');
  const stamp=Date.now(),cutoff=stamp-hourMs;
  const bytes=new TextEncoder().encode('relembra-ai:'+kind+':'+userId+':'+env.APP_PASSWORD);
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  const key='ai-'+Array.from(digest,b=>b.toString(16).padStart(2,'0')).join('');
  const row=await env.DB.prepare(
    'INSERT INTO login_attempts(ip_hash,attempts,window_start) VALUES(?,1,?) '+
    'ON CONFLICT(ip_hash) DO UPDATE SET '+
    'attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END, '+
    'window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END '+
    'RETURNING attempts'
  ).bind(key,stamp,cutoff,cutoff).first();
  return Number(row?.attempts||0)<=LIMITS[kind];
}
const BASE_HEADERS=Object.freeze({
  'X-Content-Type-Options':'nosniff',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'X-Frame-Options':'DENY',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Resource-Policy':'same-origin'
});
const PAGE_CSP=[
  "default-src 'self'",
  "script-src 'self' https://challenges.cloudflare.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' https://challenges.cloudflare.com",
  "frame-src https://www.youtube-nocookie.com https://www.instagram.com https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests"
].join('; ');
export function secureResponse(response,{asset=false}={}){
  const headers=new Headers(response.headers);
  for(const [key,value] of Object.entries(BASE_HEADERS))headers.set(key,value);
  headers.set('Content-Security-Policy',asset?PAGE_CSP:"default-src 'none'; frame-ancestors 'none'; base-uri 'none'");
  return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}

// Lê o corpo incrementalmente, inclusive quando falta Content-Length.
// Request.text() sozinho permite que clientes em streaming contornem o limite.
export async function readLimitedText(request,maxBytes){
  const contentLength=Number(request.headers.get('content-length')||0);
  if(contentLength>maxBytes)throw new Error('O arquivo ou texto é muito grande.');
  if(!request.body)throw new Error('JSON inválido.');
  const reader=request.body.getReader(),decoder=new TextDecoder();
  let size=0,body='';
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>maxBytes){
        await reader.cancel().catch(()=>{});
        throw new Error('O arquivo ou texto é muito grande.');
      }
      body+=decoder.decode(value,{stream:true});
    }
    body+=decoder.decode();
  }finally{reader.releaseLock();}
  return body;
}
export async function readLimitedJSON(request,maxBytes){
  const raw=await readLimitedText(request,maxBytes);
  let data;
  try{data=JSON.parse(raw);}catch{throw new Error('JSON inválido.');}
  if(!data||typeof data!=='object'||Array.isArray(data))throw new Error('JSON inválido.');
  return data;
}

// Registro protegido por Turnstile quando a chave pública e a privada forem
// configuradas pelo administrador. Configuração parcial falha de forma segura.
export function turnstileConfig(env){
  const siteKey=String(env.TURNSTILE_SITE_KEY||'').trim();
  const enabled=Boolean(siteKey||env.TURNSTILE_SECRET);
  return {enabled,siteKey:enabled?siteKey:'',configured:!!(siteKey&&env.TURNSTILE_SECRET)};
}
export async function verifyRegistrationTurnstile(request,env,token,fetchImpl=fetch){
  const config=turnstileConfig(env);
  if(!config.enabled)return {ok:true,skipped:true};
  if(!config.configured)return {ok:false,status:503,message:'Proteção de cadastro incompleta. Contate o administrador.'};
  if(typeof token!=='string'||!token.trim()||token.length>2048)
    return {ok:false,status:403,message:'Complete a verificação de segurança para criar sua conta.'};
  try{
    const form=new URLSearchParams({
      secret:env.TURNSTILE_SECRET,response:token,
      remoteip:request.headers.get('CF-Connecting-IP')||''
    });
    const response=await fetchImpl('https://challenges.cloudflare.com/turnstile/v0/siteverify',{
      method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},
      body:form,signal:AbortSignal.timeout(8000)
    });
    if(!response.ok)throw Error('Turnstile indisponível');
    const body=await response.json();
    if(body?.success===true && body.action==='register' &&
       body.hostname===new URL(request.url).hostname)
      return {ok:true};
    return {ok:false,status:403,message:'A verificação expirou ou não foi aprovada. Tente novamente.'};
  }catch{
    return {ok:false,status:503,message:'Não foi possível validar a verificação de segurança. Tente novamente.'};
  }
}
