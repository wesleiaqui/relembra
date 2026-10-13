// Painel financeiro independente da biblioteca de vídeos e da IA do Relembra.
let api;
let toast;
let snapshot = null;
let currentMonth = new Date().toLocaleDateString('en-CA').slice(0,7);
let version = 0;
const node = () => document.getElementById('financeRoot');
const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const money = c => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(c || 0)/100);
const shortDate = d => d ? d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4) : '—';
const nowDate = () => {
  const d = new Date();
  return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
};
const sum = items => items.reduce((n,item)=>n+Number(item.amount_cents || 0),0);
const blank = (heading,detail) => '<div class="finance-empty"><strong>'+heading+'</strong><p>'+detail+'</p></div>';
const button = (action,label,kind='',id='') => '<button type="button" class="finance-btn" data-fin-action="'+action+'" data-kind="'+kind+'" data-id="'+escapeHtml(id)+'">'+label+'</button>';
const pill = (label,variant) => '<span class="finance-pill finance-'+variant+'">'+label+'</span>';

export function resetFinance(){
  version++; snapshot = null;
  if (node()) node().replaceChildren();
}
export async function loadFinance(){
  const localVersion = ++version;
  if (node() && !snapshot) node().innerHTML = '<div class="finance-loading">Carregando suas finanças...</div>';
  try {
    const loaded = await api('/api/finance');
    if (localVersion !== version) return;
    snapshot = loaded;
    render();
  } catch(e) {
    if(localVersion === version && node()) node().innerHTML = blank('Não foi possível carregar as finanças',escapeHtml(e.message));
    toast(e.message,true);
  }
}
function render(){
  if (!snapshot || !node()) return;
  const {entries,bills,goals,balance_cents:balance} = snapshot;
  const periodEnd = currentMonth + '-31';
  const relevant = bills.filter(b => (b.due_date.slice(0,7) === currentMonth) || (!b.paid_at && b.due_date <= periodEnd));
  const pending = relevant.filter(b=>!b.paid_at);
  const pendingTotal = sum(pending);
  const missing = Math.max(0,pendingTotal - Math.max(0,balance));
  const ordered = relevant.slice().sort((a,b)=>(Boolean(a.paid_at)-Boolean(b.paid_at)) || Number(a.priority)-Number(b.priority) || a.due_date.localeCompare(b.due_date));
  const received = entries.filter(e => e.type==='income' && e.entry_date.slice(0,7)===currentMonth)
    .sort((a,b)=>b.entry_date.localeCompare(a.entry_date));
  const spent = entries.filter(e => e.type==='expense' && e.entry_date.slice(0,7)===currentMonth)
    .sort((a,b)=>b.entry_date.localeCompare(a.entry_date));
  const formatEntry = e => '<div class="finance-list-row">'+
    '<div><strong>'+escapeHtml(e.description)+'</strong><small>'+shortDate(e.entry_date)+' · '+(e.status==='confirmed'?'Confirmado':'Previsto')+'</small></div>'+
    '<div class="finance-row-end"><b>'+money(e.amount_cents)+'</b>'+button('edit','Editar','entries',e.id)+'</div></div>';
  node().innerHTML =
    '<div class="finance-shell">'+
      '<div class="finance-head"><div><span class="finance-eyebrow">PLANEJAMENTO PESSOAL</span><h1>Minhas finanças</h1><p>Organize pagamentos por vencimento e prioridade, mesmo com renda variável.</p></div>'+
      '<label class="finance-month">Mês de referência <input type="month" id="financeMonth" value="'+escapeHtml(currentMonth)+'"></label></div>'+
      '<div class="finance-kpis">'+
        '<article class="finance-kpi"><span>Saldo disponível registrado</span><strong class="'+(balance<0?'finance-negative':'')+'">'+money(balance)+'</strong><small>Recebimentos − gastos confirmados − contas pagas, em todo o histórico</small></article>'+
        '<article class="finance-kpi"><span>Contas pendentes até este mês</span><strong>'+money(pendingTotal)+'</strong><small>'+pending.length+' conta(s) aguardando pagamento</small></article>'+
        '<article class="finance-kpi"><span>Falta para cobrir as contas</span><strong class="'+(missing>0?'finance-negative':'finance-positive')+'">'+money(missing)+'</strong><small>Não inclui entradas previstas</small></article>'+
      '</div>'+
      '<div class="finance-layout">'+
        '<div class="finance-column">'+
          '<section class="finance-panel"><div class="finance-panel-head"><div><h2>Contas e vencimentos</h2><p>Primeiro as pendentes; organize a prioridade de 1 a 5.</p></div>'+button('new','+ Nova conta','bills')+'</div>'+
          (ordered.length ? '<div class="finance-table-wrap"><table class="finance-table"><thead><tr><th>Prior.</th><th>Conta</th><th>Vence</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>'+
          ordered.map(b => '<tr class="'+(!b.paid_at && b.due_date < nowDate()?'finance-overdue':'')+'"><td><span class="finance-priority">'+b.priority+'</span></td><td><b>'+escapeHtml(b.name)+'</b>'+(b.essential?'<small>Essencial</small>':'')+'</td><td>'+shortDate(b.due_date)+'</td><td>'+money(b.amount_cents)+'</td><td>'+(b.paid_at?pill('Paga','ok'):pill(b.due_date<nowDate()?'Atrasada':'Pendente',b.due_date<nowDate()?'bad':'warn'))+'</td><td>'+button('edit','Editar','bills',b.id)+'</td></tr>').join('')+
          '</tbody></table></div>' : blank('Sem contas neste período','Cadastre uma conta com valor, vencimento e prioridade.'))+
          '</section>'+
          '<section class="finance-panel"><div class="finance-panel-head"><div><h2>Reservas e metas</h2><p>Acompanhe seus objetivos sem poluir o painel.</p></div>'+button('new','+ Nova meta','goals')+'</div>'+
            '<div class="finance-goals">'+(goals.length ? goals.map(g => {
              const pct = Math.min(100,Math.round(g.saved_cents / g.target_cents*100));
              return '<div class="finance-goal"><div class="finance-goal-top"><strong>'+escapeHtml(g.name)+'</strong>'+button('edit','Editar','goals',g.id)+'</div>'+
                '<div class="finance-goal-amount">'+money(g.saved_cents)+' <span>de '+money(g.target_cents)+'</span></div>'+
                '<div class="finance-track"><span style="width:'+pct+'%"></span></div><small>'+pct+'% concluído · Faltam '+money(Math.max(0,g.target_cents-g.saved_cents))+'</small></div>';
              }).join('') : blank('Você ainda não criou metas','Adicione sua reserva de emergência, casa ou outro objetivo.'))+
            '</div><p class="finance-disclaimer">Valores das metas são informativos: registrar uma reserva não movimenta automaticamente o saldo.</p>'+
          '</section>'+
        '</div>'+
        '<div class="finance-column">'+
          '<section class="finance-panel"><div class="finance-panel-head"><div><h2>Entradas do mês</h2><p>Receitas previstas não aumentam seu saldo.</p></div>'+button('new','+ Entrada','entries')+'</div>'+
            '<div class="finance-list">'+(received.length ? received.map(formatEntry).join('') : blank('Nenhuma entrada neste mês','Anote os recebimentos somente quando chegarem ou como previsão.'))+'</div>'+
            '<div class="finance-total"><span>Recebido no período</span><strong>'+money(sum(received.filter(e=>e.status==='confirmed')))+'</strong></div>'+
          '</section>'+
          '<section class="finance-panel"><div class="finance-panel-head"><div><h2>Gastos avulsos</h2><p>Compras e despesas fora das contas cadastradas.</p></div>'+button('new','+ Gasto','expenses')+'</div>'+
            '<div class="finance-list">'+(spent.length ? spent.map(formatEntry).join('') : blank('Nenhum gasto avulso','Evite duplicar aqui uma conta que você já marcou como paga.'))+'</div>'+
            '<div class="finance-total"><span>Gasto confirmado no período</span><strong>'+money(sum(spent.filter(e=>e.status==='confirmed')))+'</strong></div>'+
          '</section>'+
        '</div>'+
      '</div></div>';
}
function openForm(kind,id=null){
  if(!snapshot) return;
  const normalized = kind==='expenses'?'entries':kind;
  const record = id ? snapshot[normalized].find(e=>e.id===id) : null;
  if(id && !record) return;
  const initialType = kind==='expenses'?'expense':record?.type || 'income';
  const field = (name,label,type,value='',extra='') => '<label class="finance-field"><span>'+label+'</span><input name="'+name+'" type="'+type+'" value="'+escapeHtml(value)+'" '+extra+'></label>';
  const select = (name,label,options,current) => '<label class="finance-field"><span>'+label+'</span><select name="'+name+'">'+options.map(([value,text])=>'<option value="'+value+'" '+(String(value)===String(current)?'selected':'')+'>'+text+'</option>').join('')+'</select></label>';
  let fields = '';
  if(normalized==='entries'){
    fields = select('type','Movimentação',[['income','Entrada'],['expense','Gasto']],initialType)+
      field('description','Descrição','text',record?.description || '', 'required maxlength="160"')+
      field('amount','Valor (R$)','number',record ? (record.amount_cents/100).toFixed(2):'','required min="0.01" max="1000000000" step="0.01"')+
      field('entry_date','Data','date',record?.entry_date || nowDate(),'required')+
      select('status','Situação',[['planned','Previsto'],['confirmed','Confirmado']],record?.status || 'confirmed');
  } else if(normalized==='bills'){
    fields = field('name','Nome da conta','text',record?.name || '', 'required maxlength="160"')+
      field('amount','Valor (R$)','number',record ? (record.amount_cents/100).toFixed(2):'','required min="0.01" max="1000000000" step="0.01"')+
      field('due_date','Vencimento','date',record?.due_date || nowDate(),'required')+
      select('priority','Prioridade (1 = mais importante)',[[1,'1 · Urgente'],[2,'2 · Alta'],[3,'3 · Média'],[4,'4 · Baixa'],[5,'5 · Opcional']],record?.priority || 3)+
      '<label class="finance-check"><input type="checkbox" name="essential" '+(record?.essential?'checked':'')+'> Conta essencial</label>'+
      field('paid_at','Data do pagamento (vazio = pendente)','date',record?.paid_at || '');
  } else {
    fields = field('name','Nome da meta','text',record?.name || '','required maxlength="120"')+
      field('target','Objetivo (R$)','number',record ? (record.target_cents/100).toFixed(2):'','required min="0.01" max="1000000000" step="0.01"')+
      field('saved','Já reservado (R$)','number',record ? (record.saved_cents/100).toFixed(2):'0.00','required min="0" max="1000000000" step="0.01"');
  }
  const title = normalized==='bills'?'conta':normalized==='goals'?'meta':initialType==='income'?'entrada':'gasto';
  const overlay = document.createElement('div');
  overlay.className = 'finance-modal-backdrop';
  overlay.innerHTML = '<section class="finance-modal" role="dialog" aria-modal="true" aria-labelledby="financeModalTitle">'+
      '<div class="finance-modal-title"><h2 id="financeModalTitle">'+(record?'Editar ':'Adicionar ')+title+'</h2><button type="button" data-dismiss aria-label="Fechar">×</button></div>'+
      '<form id="financeForm">'+fields+'<div class="finance-modal-actions">'+(record?'<button type="button" data-remove class="finance-delete">Excluir</button>':'')+
      '<button type="button" data-dismiss class="finance-cancel">Cancelar</button><button type="submit" class="finance-save">Salvar</button></div></form></section>';
  node().appendChild(overlay);
  overlay.addEventListener('click',e=>{if(e.target===overlay || e.target.closest('[data-dismiss]')) overlay.remove();});
  const form=overlay.querySelector('form');
  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const formData = new FormData(form), get = key => String(formData.get(key) || '');
    const toCents = key => Math.round(Number(get(key))*100);
    let payload;
    if(normalized==='entries') payload={type:get('type'),description:get('description'),amount_cents:toCents('amount'),entry_date:get('entry_date'),status:get('status')};
    else if(normalized==='bills') payload={name:get('name'),amount_cents:toCents('amount'),due_date:get('due_date'),priority:Number(get('priority')),essential:formData.has('essential'),paid_at:get('paid_at') || null};
    else payload={name:get('name'),target_cents:toCents('target'),saved_cents:toCents('saved')};
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await api('/api/finance/'+normalized+(id?'/'+id:''),{method:id?'PUT':'POST',body:JSON.stringify(payload)});
      overlay.remove(); toast('Registro financeiro salvo.'); await loadFinance();
    }catch(err){toast(err.message,true)}finally{submit.disabled=false}
  });
  overlay.querySelector('[data-remove]')?.addEventListener('click',async ()=>{
    if(!confirm('Excluir este registro financeiro?')) return;
    try{await api('/api/finance/'+normalized+'/'+id,{method:'DELETE'});overlay.remove();toast('Registro excluído.');await loadFinance();}
    catch(err){toast(err.message,true)}
  });
  form.querySelector('input:not([type="checkbox"])')?.focus();
}
export function setupFinance(deps){
  api = deps.api;
  toast = deps.toast;
  node().addEventListener('click',e=>{
    const btn = e.target.closest('[data-fin-action]');
    if(!btn) return;
    const kind=btn.dataset.kind;
    if(btn.dataset.finAction==='new') openForm(kind);
    if(btn.dataset.finAction==='edit') openForm(kind,btn.dataset.id);
  });
  node().addEventListener('change',e=>{
    if(e.target.id==='financeMonth'){currentMonth=e.target.value;render();}
  });
}
