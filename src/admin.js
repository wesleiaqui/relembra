// Painel do proprietário: nenhuma rota troca o owner_id da sessão.
import {readLimitedJSON} from './security.js';
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const SECTIONS=new Set(['overview','library','finance','radar','maps','notes']);
const response=(value,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store'}
});
const deny=(message,status)=>response({error:message},status);
const getRows=async(stmt,...params)=>(await stmt.bind(...params).all()).results||[];
const memberCountsSQL='SELECT '+
  '(SELECT COUNT(*) FROM videos WHERE owner_id=?) AS videos,'+
  '(SELECT COUNT(*) FROM canvas_boards WHERE owner_id=?) AS maps,'+
  '(SELECT COUNT(*) FROM radar_tasks WHERE owner_id=?) AS tasks,'+
  '(SELECT COUNT(*) FROM finance_bills WHERE owner_id=?) AS bills,'+
  '(SELECT COUNT(*) FROM thought_entries WHERE owner_id=?) AS thoughts,'+
  '(SELECT COUNT(*) FROM situational_tips WHERE owner_id=?) AS tips,'+
  '(SELECT COUNT(*) FROM life_moments WHERE owner_id=?) AS memories';
export async function updateAccountActivity(env,id,{login=false}={}){
  const stamp=new Date().toISOString();
  await env.DB.prepare(login
    ?'UPDATE app_users SET last_login_at=?,last_seen_at=? WHERE id=?'
    :"UPDATE app_users SET last_seen_at=? WHERE id=? AND (last_seen_at IS NULL OR last_seen_at<?)")
    .bind(...(login?[stamp,stamp,id]:[stamp,id,new Date(Date.now()-120000).toISOString()])).run();
}
async function countFor(env,id){
  return await env.DB.prepare(memberCountsSQL).bind(...Array(7).fill(id)).first();
}
async function listMembers(request,env){
  const url=new URL(request.url),search=(url.searchParams.get('q')||'').trim().toLowerCase().slice(0,60);
  const page=Math.max(1,Math.min(100,Number.parseInt(url.searchParams.get('page')||'1',10)||1));
  const cutoff=new Date(Date.now()-10*60*1000).toISOString();
  const where="WHERE role='member' AND instr(lower(username),?)>0";
  const summary=await env.DB.prepare(
    "SELECT COUNT(*) AS total,SUM(CASE WHEN last_seen_at>=? THEN 1 ELSE 0 END) AS active FROM app_users WHERE role='member'"
  ).bind(cutoff).first();
  const filtered=await env.DB.prepare('SELECT COUNT(*) AS total FROM app_users '+where).bind(search).first();
  const users=await getRows(env.DB.prepare(
    'SELECT id,username,role,created_at,last_login_at,last_seen_at,admin_view_consent,'+
    '(SELECT COUNT(*) FROM videos WHERE owner_id=app_users.id) AS videos,'+
    '(SELECT COUNT(*) FROM canvas_boards WHERE owner_id=app_users.id) AS maps '+
    'FROM app_users '+where+' ORDER BY COALESCE(last_seen_at,created_at) DESC LIMIT 25 OFFSET ?'
  ),search,(page-1)*25);
  return response({users:users.map(u=>({...u,admin_view_consent:Boolean(u.admin_view_consent)})),stats:{total:Number(summary?.total||0),recentlyActive:Number(summary?.active||0)},pagination:{
    page,pageSize:25,total:Number(filtered?.total||0),pages:Math.ceil(Number(filtered?.total||0)/25)
  }});
}
async function auditHistory(env,actor){
  const audit=await getRows(env.DB.prepare(
    "SELECT a.id,a.action,a.section,a.created_at,u.username AS target_username "+
    "FROM admin_access_audit a JOIN app_users u ON a.target_id=u.id "+
    "WHERE a.actor_id=? ORDER BY a.created_at DESC, a.rowid DESC LIMIT 50"
  ),actor.id);
  return response({audit});
}
async function dashboard(env,actor,targetId,section){
  if(!UUID.test(targetId)||!SECTIONS.has(section))return deny('Página não encontrada.',404);
  const person=await env.DB.prepare(
    "SELECT id,username,role,created_at,last_seen_at,last_login_at,admin_view_consent FROM app_users WHERE id=? AND role='member'"
  ).bind(targetId).first();
  if(!person)return deny('Usuário não encontrado.',404);
  if(person.admin_view_consent!==1)return deny('Este usuário ainda não autorizou a visualização do painel. O consentimento pode ser concedido em Backup e dados.',403);
  const counts=await countFor(env,person.id);
  const {admin_view_consent,...publicPerson}=person;
  const result={user:publicPerson,counts,section,readonly:true};
  if(section==='overview'){
    result.videos=await getRows(env.DB.prepare(
      'SELECT id,title,url,category,created_at FROM videos WHERE owner_id=? ORDER BY created_at DESC LIMIT 5'),person.id);
    result.tasks=await getRows(env.DB.prepare(
      'SELECT id,title,due_date,priority,done_at FROM radar_tasks WHERE owner_id=? ORDER BY created_at DESC LIMIT 6'),person.id);
    result.maps=await getRows(env.DB.prepare(
      'SELECT id,title,updated_at FROM canvas_boards WHERE owner_id=? ORDER BY updated_at DESC LIMIT 5'),person.id);
    result.finances=await env.DB.prepare(
      "SELECT "+
      "(SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount_cents ELSE -amount_cents END),0) FROM finance_entries WHERE owner_id=? AND status='confirmed') AS confirmed_net_cents,"+
      "(SELECT COALESCE(SUM(COALESCE(paid_amount_cents,amount_cents)),0) FROM finance_bills WHERE owner_id=? AND paid_at IS NOT NULL AND (payment_method IS NULL OR payment_method!='credit')) AS paid_bills_cents,"+
      "(SELECT COALESCE(SUM(amount_cents),0) FROM finance_bills WHERE owner_id=? AND paid_at IS NULL) AS unpaid_bills_cents"
    ).bind(person.id,person.id,person.id).first();
  }
  if(section==='library')result.videos=await getRows(env.DB.prepare(
    'SELECT id,title,url,category,summary,created_at FROM videos WHERE owner_id=? ORDER BY created_at DESC LIMIT 40'
  ),person.id);
  if(section==='finance'){
    result.bills=await getRows(env.DB.prepare(
      'SELECT id,name,amount_cents,due_date,paid_at,essential,priority FROM finance_bills WHERE owner_id=? ORDER BY due_date DESC LIMIT 35'
    ),person.id);
    result.entries=await getRows(env.DB.prepare(
      'SELECT id,description,amount_cents,type,entry_date,status FROM finance_entries WHERE owner_id=? ORDER BY entry_date DESC LIMIT 35'
    ),person.id);
    result.goals=await getRows(env.DB.prepare(
      'SELECT id,name,target_cents,saved_cents FROM finance_goals WHERE owner_id=? ORDER BY created_at DESC LIMIT 25'
    ),person.id);
  }
  if(section==='radar'){
    result.tasks=await getRows(env.DB.prepare(
      'SELECT id,title,due_date,priority,done_at FROM radar_tasks WHERE owner_id=? ORDER BY created_at DESC LIMIT 50'
    ),person.id);
    result.memories=await getRows(env.DB.prepare(
      'SELECT id,title,moment_date,kind,note FROM life_moments WHERE owner_id=? ORDER BY moment_date DESC LIMIT 20'
    ),person.id);
  }
  if(section==='maps'){
    const boards=await getRows(env.DB.prepare(
      'SELECT id,title,snapshot,updated_at FROM canvas_boards WHERE owner_id=? ORDER BY updated_at DESC LIMIT 40'
    ),person.id);
    result.maps=boards.map(b=>{
      let nodes=[];try{nodes=JSON.parse(b.snapshot).nodes||[];}catch{}
      return {id:b.id,title:b.title,updated_at:b.updated_at,nodeCount:nodes.length,
        nodeTitles:nodes.slice(0,12).map(n=>String(n.title||'').slice(0,120))};
    });
  }
  if(section==='notes'){
    result.thoughts=await getRows(env.DB.prepare(
      'SELECT id,situation,automatic_thought,created_at FROM thought_entries WHERE owner_id=? ORDER BY created_at DESC LIMIT 25'
    ),person.id);
    result.tips=await getRows(env.DB.prepare(
      'SELECT id,title,content,created_at FROM situational_tips WHERE owner_id=? ORDER BY created_at DESC LIMIT 25'
    ),person.id);
  }
  // Revalida antes de liberar o conteúdo: o membro pode revogar enquanto
  // as consultas do banco estão em andamento.
  const currentConsent=await env.DB.prepare(
    'SELECT admin_view_consent FROM app_users WHERE id=? AND role=\'member\''
  ).bind(person.id).first();
  if(currentConsent?.admin_view_consent!==1)return deny('A autorização para esta visualização foi revogada.',403);
  const stamp=new Date().toISOString();
  // O registro de acesso é obrigatório: erros de gravação interrompem a entrega.
  await env.DB.prepare('INSERT INTO admin_access_audit(id,actor_id,target_id,action,section,created_at) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),actor.id,person.id,'view-dashboard',section,stamp).run();
  // Retenção: no máximo 90 dias E 2.000 registros por administrador.
  await env.DB.prepare(
    'DELETE FROM admin_access_audit WHERE actor_id=? AND (created_at<? OR rowid<=COALESCE('+
    '(SELECT rowid FROM admin_access_audit WHERE actor_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1 OFFSET 1999),-1))'
  ).bind(actor.id,new Date(Date.now()-90*86400000).toISOString(),actor.id).run();
  return response(result);
}

async function reserveAdminRead(env,user){
  // D1: contagem atômica por proprietário, independente da instância do Worker.
  const raw='relembra-admin-read:'+user.id+':'+env.APP_PASSWORD;
  const hash=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw)));
  const key='admin-'+Array.from(hash,b=>b.toString(16).padStart(2,'0')).join('');
  const stamp=Date.now(),cutoff=stamp-3600000;
  const record=await env.DB.prepare(
    'INSERT INTO login_attempts(ip_hash,attempts,window_start) VALUES(?,1,?) '+
    'ON CONFLICT(ip_hash) DO UPDATE SET '+
    'attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,'+
    'window_start=CASE WHEN window_start<? THEN excluded.window_start ELSE window_start END '+
    'RETURNING attempts'
  ).bind(key,stamp,cutoff,cutoff).first();
  return Number(record?.attempts||0)<=120;
}
export async function handleAdminViewConsent(request,env,user){
  if(user.role==='owner')return deny('Esta preferência é destinada às contas de membros.',403);
  if(request.method==='GET'){
    const setting=await env.DB.prepare(
      'SELECT admin_view_consent,admin_view_consent_at FROM app_users WHERE id=?'
    ).bind(user.id).first();
    return response({enabled:setting?.admin_view_consent===1,updated_at:setting?.admin_view_consent_at||null});
  }
  if(request.method!=='PUT')return deny('Método não permitido.',405);
  const body=await readLimitedJSON(request,1000);
  if(typeof body.enabled!=='boolean')return deny('Informe uma escolha válida: verdadeiro ou falso.',400);
  const enabled=Number(body.enabled),stamp=new Date().toISOString();
  await env.DB.batch([
    env.DB.prepare('UPDATE app_users SET admin_view_consent=?,admin_view_consent_at=? WHERE id=?')
      .bind(enabled,stamp,user.id),
    env.DB.prepare('INSERT INTO admin_consent_audit(id,user_id,enabled,created_at) VALUES(?,?,?,?)')
      .bind(crypto.randomUUID(),user.id,enabled,stamp)
  ]);
  return response({enabled:body.enabled,updated_at:stamp});
}

export async function handleAdministration(request,env,user){
  if(user.role!=='owner')return deny('Esta área é exclusiva do administrador.',403);
  if(request.method!=='GET')return deny('O painel administrativo permite somente consultas.',405);
  if(!await reserveAdminRead(env,user))return deny('Limite de consultas administrativas atingido. Aguarde até uma hora.',429);
  const path=new URL(request.url).pathname;
  if(path==='/api/admin/users')return listMembers(request,env);
  if(path==='/api/admin/audit')return auditHistory(env,user);
  const match=path.match(/^\/api\/admin\/users\/([a-f0-9-]{36})\/dashboard$/i);
  if(match){
    const section=new URL(request.url).searchParams.get('section')||'overview';
    return dashboard(env,user,match[1],section);
  }
  return deny('Página não encontrada.',404);
}
export async function listOwnAdminAccess(env,user){
  return response({accesses:await getRows(env.DB.prepare(
    'SELECT a.created_at,a.section FROM admin_access_audit a WHERE target_id=? ORDER BY a.created_at DESC, a.rowid DESC LIMIT 50'
  ),user.id)});
}
