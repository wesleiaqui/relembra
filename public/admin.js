// Administração: representação isolada e SOMENTE LEITURA; nunca troca user.id
// e nunca reutiliza as rotas privadas de edição de membros.
let api,toast,adminOwner=false,currentId=null,currentSection='overview',page=1,searchTimer=null,requestEpoch=0;
let cachedUsers=[];
const $=id=>document.getElementById(id);
const date=value=>value?new Date(value).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'Ainda sem atividade registrada';
const money=cents=>(Number(cents||0)/100).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const element=(tag,className='',value='')=>{
  const node=document.createElement(tag);
  if(className)node.className=className;
  if(value!==undefined)node.textContent=String(value);
  return node;
};
const activeRecently=value=>Boolean(value&&new Date(value).getTime()>=Date.now()-10*60*1000);
const timeStatus=value=>activeRecently(value)?'Atividade recente':value?'Último acesso: '+date(value):'Sem atividade registrada';
const noData=message=>element('p','admin-no-data',message);
const apiError=(message)=>{toast(message,true);return noData('Não foi possível carregar: '+message)};
function countCard(label,value){
  const box=element('article','admin-stat');
  box.append(element('span','',label),element('strong','',value));
  return box;
}
function paragraph(section,text){
  section.append(element('p','admin-section-description',text));
}
function group(title,items,create){
  const panel=element('section','admin-data-group');
  panel.append(element('h3','',title));
  const body=element('div','admin-data-list');
  if(!items?.length)body.append(noData('Ainda não há registros nesta seção.'));
  else for(const item of items)body.append(create(item));
  panel.append(body);return panel;
}
function record(title,detail,meta='',url=''){
  const row=element('div','admin-record');
  const copy=element('div','admin-record-copy');
  copy.append(element('strong','',title||'Sem título'));
  if(detail)copy.append(element('p','',detail));
  if(meta)copy.append(element('small','',meta));
  row.append(copy);
  if(url){
    try{
      const u=new URL(url);
      if(['https:','http:'].includes(u.protocol)){
        const link=element('a','admin-original-link','↗ Original');
        link.href=u.href;link.target='_blank';link.rel='noopener noreferrer';row.append(link);
      }
    }catch{}
  }
  return row;
}
function overview(result,body){
  const counts=result.counts||{};
  const grid=element('div','admin-section-stats');
  for(const [key,label] of [['videos','Vídeos'],['maps','Mapas mentais'],['tasks','Tarefas'],['bills','Contas'],['thoughts','Reflexões'],['tips','Dicas'],['memories','Lembranças']]){
    grid.append(countCard(label,counts[key]||0));
  }
  body.append(grid);
  paragraph(body,'Resumo atual desta conta. Para conferir os registros individuais, escolha uma seção acima.');
  body.append(group('Últimos vídeos',result.videos,v=>record(v.title,v.category,'Salvo em '+date(v.created_at),v.url)));
  body.append(group('Tarefas recentes',result.tasks,t=>record(t.title,t.done_at?'Concluída':'Pendente','Vence em '+t.due_date)));
  body.append(group('Mapas recentes',result.maps,m=>record(m.title,'Atualizado em '+date(m.updated_at))));
  const f=result.finances||{};
  const finance=element('div','admin-finance-summary');
  finance.append(countCard('Entradas e despesas confirmadas',money(f.confirmed_net_cents)),
    countCard('Contas já pagas (sem crédito)',money(f.paid_bills_cents)),
    countCard('Contas pendentes',money(f.unpaid_bills_cents)));
  body.append(finance);
}
function library(result,body){
  paragraph(body,'Até 40 registros recentes da biblioteca, com links para suas fontes originais.');
  body.append(group('Vídeos e referências',result.videos,v=>record(v.title,v.summary,v.category+' · '+date(v.created_at),v.url)));
}
function finances(result,body){
  paragraph(body,'Consulta privada: contas, entradas e metas. Não é possível editar pagamentos por aqui.');
  body.append(group('Contas e vencimentos',result.bills,b=>record(
    b.name,money(b.amount_cents)+' · '+(b.paid_at?'Paga':'Pendente'),'Vencimento: '+b.due_date)));
  body.append(group('Entradas e movimentações',result.entries,e=>record(e.description,
    (e.type==='income'?'Entrada: ':'Saída: ')+money(e.amount_cents),e.entry_date+' · '+(e.status==='confirmed'?'Confirmado':'Previsto'))));
  body.append(group('Reservas e metas',result.goals,g=>record(g.name,
    'Guardado: '+money(g.saved_cents)+' de '+money(g.target_cents))));
}
function radar(result,body){
  paragraph(body,'Tarefas e lembranças da conta. Nenhuma marcação pode ser alterada.');
  body.append(group('Radar de tarefas',result.tasks,t=>record(t.title,t.done_at?'Concluída':'Pendente',
    'Vencimento: '+t.due_date+' · Prioridade '+t.priority)));
  body.append(group('Calendário da vida',result.memories,m=>record(m.title,m.note,
    'Data: '+m.moment_date+' · '+m.kind)));
}
function maps(result,body){
  paragraph(body,'Mapas mentais e uma amostra dos títulos dos cartões. A edição não é disponibilizada.');
  body.append(group('Mapas do usuário',result.maps,m=>record(m.title,
    (m.nodeCount||0)+' cartões · '+(m.nodeTitles?.join(' • ')||'Mapa vazio'),
    'Atualizado em '+date(m.updated_at))));
}
function notes(result,body){
  paragraph(body,'Anotações pessoais sensíveis. Consultas desta seção são registradas no histórico administrativo.');
  body.append(group('Reflexões pessoais',result.thoughts,t=>record(t.situation,t.automatic_thought,date(t.created_at))));
  body.append(group('Dicas e registros',result.tips,t=>record(t.title,t.content,date(t.created_at))));
}
const RENDERERS={overview,library,finance:finances,radar,maps,notes};
function renderDashboard(result){
  $('adminEmptyState').hidden=true;$('adminDetail').hidden=false;
  $('adminDetailName').textContent='@'+result.user.username;
  $('adminDetailAvatar').textContent=result.user.username[0]?.toUpperCase()||'U';
  $('adminDetailStatus').textContent='Cadastro: '+date(result.user.created_at)+' · '+timeStatus(result.user.last_seen_at);
  const body=$('adminDetailBody');body.replaceChildren();
  RENDERERS[result.section]?.(result,body);
  $('adminTabs').querySelectorAll('[data-admin-section]').forEach(btn=>{
    const selected=btn.dataset.adminSection===result.section;
    btn.setAttribute('aria-selected',String(selected));
    btn.tabIndex=selected?0:-1;
  });
}
async function openDashboard(id,section='overview'){
  if(!adminOwner)return;
  currentId=id;currentSection=section;
  const epoch=++requestEpoch;
  $('adminEmptyState').hidden=true;$('adminDetail').hidden=false;
  $('adminDetailBody').replaceChildren(element('p','admin-no-data','Abrindo painel somente leitura…'));
  $('adminUserList').querySelectorAll('[data-admin-user]').forEach(btn=>{
    const selected=btn.dataset.adminUser===id;
    btn.classList.toggle('is-selected',selected);
    btn.setAttribute('aria-pressed',String(selected));
  });
  try{
    const res=await api('/api/admin/users/'+encodeURIComponent(id)+'/dashboard?section='+encodeURIComponent(section));
    if(epoch!==requestEpoch)return;
    if(res.readonly!==true)throw Error('Resposta inválida: somente leitura não confirmada.');
    renderDashboard(res);
  }catch(e){
    if(epoch!==requestEpoch)return;
    $('adminDetailBody').replaceChildren(apiError(e.message));
  }
}
function renderUsers(data){
  cachedUsers=data.users||[];
  const list=$('adminUserList');list.replaceChildren();
  $('adminStats').replaceChildren(countCard('Contas cadastradas',data.stats.total),
    countCard('Atividade nos últimos 10 min',data.stats.recentlyActive),
    countCard('Resultados da busca',data.pagination.total));
  if(!cachedUsers.length)list.append(noData('Nenhuma conta encontrada.'));
  for(const u of cachedUsers){
    const btn=element('button','admin-user-row');btn.type='button';
    btn.dataset.adminUser=u.id;btn.setAttribute('aria-pressed',String(currentId===u.id));
    btn.classList.toggle('is-selected',currentId===u.id);
    const avatar=element('span','admin-user-avatar',u.username[0]?.toUpperCase()||'U');
    const info=element('span','admin-user-info');
    info.append(element('strong','','@'+u.username),
      element('small','',timeStatus(u.last_seen_at)),
      element('small','',''+(u.videos||0)+' vídeos · '+(u.maps||0)+' mapas'));
    const status=element('span',activeRecently(u.last_seen_at)?'admin-presence active':'admin-presence',
      activeRecently(u.last_seen_at)?'Recente':'Inativo');
    btn.append(avatar,info,status);
    btn.addEventListener('click',()=>void openDashboard(u.id));
    list.append(btn);
  }
  $('adminPageStatus').textContent='Página '+data.pagination.page+' de '+Math.max(1,data.pagination.pages);
  $('adminPrev').disabled=data.pagination.page<=1;
  $('adminNext').disabled=data.pagination.page>=data.pagination.pages;
}
async function listUsers(){
  if(!adminOwner)return;
  const epoch=++requestEpoch;
  $('adminUserList').replaceChildren(noData('Consultando usuários…'));
  try{
    const params=new URLSearchParams({q:$('adminSearch').value.trim(),page:String(page)});
    const data=await api('/api/admin/users?'+params);
    if(epoch!==requestEpoch)return;
    renderUsers(data);
  }catch(e){
    if(epoch!==requestEpoch)return;
    $('adminUserList').replaceChildren(apiError(e.message));
  }
}
async function showAudit(){
  const box=$('adminAuditList');box.hidden=false;box.replaceChildren(noData('Carregando histórico…'));
  try{
    const {audit}=await api('/api/admin/audit');
    box.replaceChildren();
    box.append(group('Últimas consultas',audit,a=>record('@'+a.target_username,
      'Seção: '+a.section,date(a.created_at))));
  }catch(e){box.replaceChildren(apiError(e.message));}
}
export function setupAdmin({api:client,toast:notify}){
  api=client;toast=notify;
  $('adminRefresh').addEventListener('click',()=>void listUsers());
  $('adminPrev').addEventListener('click',()=>{if(page>1){page--;void listUsers();}});
  $('adminNext').addEventListener('click',()=>{page++;void listUsers();});
  $('adminSearch').addEventListener('input',()=>{
    clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=1;void listUsers();},300);
  });
  $('adminTabs').addEventListener('click',e=>{
    const btn=e.target.closest('[data-admin-section]');
    if(currentId&&btn)void openDashboard(currentId,btn.dataset.adminSection);
  });
  $('adminShowAudit').addEventListener('click',()=>void showAudit());
}
export async function loadAdmin(){
  if(!adminOwner)return;
  await listUsers();
}
export async function showOwnAdminAccess(){
  if(adminOwner)return;
  const section=$('myAdminAccess');section.hidden=false;
  const body=$('myAdminAccessList');body.replaceChildren(noData('Consultando histórico…'));
  try{
    const {accesses}=await api('/api/account/admin-access');
    body.replaceChildren();
    if(!accesses.length)body.append(noData('Nenhum acesso administrativo registrado.'));
    for(const item of accesses)body.append(record('Consulta administrativa',item.section,date(item.created_at)));
  }catch(e){body.replaceChildren(apiError(e.message));}
}
export function setAdminOwner(value){
  adminOwner=value===true;
  $('adminNavItem').hidden=!adminOwner;
  $('myAdminAccess').hidden=true;
  if(!adminOwner)resetAdmin();
}
export function resetAdmin(){
  adminOwner=false;currentId=null;currentSection='overview';page=1;requestEpoch++;
  clearTimeout(searchTimer);
  $('adminNavItem').hidden=true;
  $('adminDetail').hidden=true;$('adminEmptyState').hidden=false;
  $('adminDetailBody').replaceChildren();$('adminUserList').replaceChildren();
  $('adminAuditList').replaceChildren();$('adminAuditList').hidden=true;
  $('adminStats').replaceChildren();$('adminSearch').value='';
  $('myAdminAccess').hidden=true;$('myAdminAccessList').replaceChildren();
}
