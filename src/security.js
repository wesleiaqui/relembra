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
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' https: data: blob:",
  "connect-src 'self'",
  "frame-src https://www.youtube-nocookie.com https://www.instagram.com",
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
