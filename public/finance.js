// Painel financeiro independente da biblioteca de vídeos e da IA do Relembra.
let api;
let toast;
let snapshot = null;
let currentMonth = nowMonth();
function nowMonth(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');}
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
  financeSort = 'priority'; financeQuery = ''; currentMonth = nowMonth();
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

let financeSort = 'priority';
let financeQuery = '';
const financeIcons = {
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="3" y="6" width="18" height="15" rx="3"/><path d="M3 9h18M6 6V5a2 2 0 0 1 2-2h10"/><path d="M16 15h2"/></svg>',
  document: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M7 3h7l5 5v12a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 2 20 5v6c0 5-3.4 8.4-8 11-4.6-2.6-8-6-8-11V5l8-3Z"/><path d="m8 12 3 3 5-6"/></svg>',
  accounts: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 2h9l5 5v14H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h6M8 13h8M8 17h8"/></svg>',
  idea: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M9 18h6M10 22h4M7 14c-1.4-1.2-2-2.8-2-4.4a7 7 0 1 1 14 0c0 1.6-.6 3.2-2 4.4-1.3 1-2 2.2-2 3H9c0-.8-.7-2-2-3Z"/></svg>',
  income: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v13m0 0 5-5m-5 5-5-5M4 20h16"/></svg>',
  goal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg>',
  expense: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M12 3v13m0 0 5-5m-5 5-5-5M4 20h16" transform="rotate(180 12 12)"/></svg>'
};
const icon = (name,cls='') => '<span class="finance-icon '+cls+'">'+(financeIcons[name]||'')+'</span>';
function shiftMonth(shift){
  const [year,month] = currentMonth.split('-').map(Number);
  const date = new Date(year,month-1+shift,1);
  currentMonth = date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0');
  render();
}
const monthLabel = () => {
  const [year, month] = currentMonth.split('-').map(Number);
  const label = new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(year,month-1,1));
  return (label.charAt(0).toUpperCase()+label.slice(1)).replace(' de ',' ');
};
const normalizeFinance = value => String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
const matchFinance = text => !financeQuery || normalizeFinance(text).includes(normalizeFinance(financeQuery));
const summaryRow = (iconText,label,value,emphasis='') => '<div class="finance-summary-row"><span class="finance-summary-symbol">'+iconText+'</span><span>'+label+'</span><strong class="'+emphasis+'">'+value+'</strong></div>';
const paymentMethodNames = Object.freeze({pix:'Pix',debit:'Cartão de débito',credit:'Cartão de crédito',transfer:'Transferência',cash:'Dinheiro',boleto:'Boleto',other:'Outro'});
const menu = (kind,id,paid) => '<details class="finance-row-menu"><summary aria-label="Opções do registro" title="Opções">⋮</summary><div class="finance-menu-options">'+
  button('edit','Editar '+(kind==='bills'?'conta':'registro'),kind,id)+
  (kind==='bills'?button('payment',paid?'Ver / editar pagamento':'Registrar pagamento',kind,id):'')+
  '</div></details>';
function render(){
  if(!snapshot || !node()) return;
  const {entries,bills,goals,balance_cents:balance} = snapshot;
  const [selectedYear,selectedMonth] = currentMonth.split('-').map(Number);
  // Último dia do mês, evitando datas inválidas como 31 de fevereiro.
  const monthLastDay = currentMonth + '-' + String(new Date(selectedYear,selectedMonth,0).getDate()).padStart(2,'0');
  const relevant = bills.filter(b=>b.due_date.slice(0,7)===currentMonth || (!b.paid_at && b.due_date<=monthLastDay));
  const pending = relevant.filter(b=>!b.paid_at);
  const pendingTotal = sum(pending);
  const freeBalance = Math.max(0,Number(balance));
  const covered = Math.min(freeBalance,pendingTotal);
  const coverage = pendingTotal ? Math.min(100,Math.round(covered/pendingTotal*100)) : null;
  const missing = Math.max(0,pendingTotal-freeBalance);
  const ordered = relevant.slice().sort((a,b)=>{
    if (Boolean(a.paid_at)!==Boolean(b.paid_at)) return Number(Boolean(a.paid_at))-Number(Boolean(b.paid_at));
    if(financeSort==='due') return a.due_date.localeCompare(b.due_date)||a.priority-b.priority;
    if(financeSort==='amount') return b.amount_cents-a.amount_cents||a.due_date.localeCompare(b.due_date);
    return a.priority-b.priority || a.due_date.localeCompare(b.due_date);
  });
  const shownBills = ordered.filter(b=>matchFinance(b.name));
  const nextBill = ordered.find(b=>!b.paid_at);
  const monthEntries = entries.filter(e=>e.entry_date.slice(0,7)===currentMonth);
  const received = monthEntries.filter(e=>e.type==='income').sort((a,b)=>b.entry_date.localeCompare(a.entry_date));
  const spent = monthEntries.filter(e=>e.type==='expense').sort((a,b)=>b.entry_date.localeCompare(a.entry_date));
  const shownIncome = received.filter(e=>matchFinance(e.description));
  const shownExpenses = spent.filter(e=>matchFinance(e.description));
  const incomeTotal = sum(received.filter(e=>e.status==='confirmed'));
  const predictedIncome = sum(received.filter(e=>e.status==='planned'));
  const billRows = shownBills.map(b=>{
    const overdue = !b.paid_at && b.due_date < nowDate();
    const status = b.paid_at
      ? '<div class="finance-paid-status">'+pill('Pago','ok')+
          '<small title="'+escapeHtml((paymentMethodNames[b.payment_method]||'Forma não informada')+' · '+(b.payment_source||'Origem não informada'))+'">'+
          escapeHtml(paymentMethodNames[b.payment_method]||'Forma não informada')+' · '+shortDate(b.paid_at)+'</small></div>'
      : pill(overdue?'Atrasado':'Pendente',overdue?'bad':'warn');
    return '<tr class="'+(overdue?'finance-overdue':'')+'">'+
      '<td><span class="finance-priority '+(b.priority<=2?'finance-priority-high':'')+'">'+b.priority+'</span></td>'+
      '<td><strong class="finance-item-name">'+escapeHtml(b.name)+'</strong></td>'+
      '<td>'+shortDate(b.due_date)+'</td>'+
      '<td class="finance-number">'+money(b.amount_cents)+'</td>'+
      '<td>'+(b.essential?pill('Sim','essential'):pill('Não','neutral'))+'</td>'+
      '<td>'+status+'</td>'+
      '<td>'+menu('bills',b.id,Boolean(b.paid_at))+'</td></tr>';
  }).join('');
  const entryRows = array=>array.map(e=>
    '<tr><td>'+shortDate(e.entry_date)+'</td><td><strong class="finance-item-name">'+escapeHtml(e.description)+'</strong></td>'+
    '<td class="finance-number">'+money(e.amount_cents)+'</td><td>'+
    (e.status==='confirmed'?pill(e.type==='expense'?'Registrado':'Recebido','ok'):pill('Previsto','planned'))+'</td>'+
    '<td>'+menu('entries',e.id)+'</td></tr>').join('');
  const goalsList = goals.filter(g=>matchFinance(g.name));
  const goalCards = goalsList.map((g,i)=>{
    const pct=Math.min(100,Math.round(g.saved_cents/g.target_cents*100));
    return '<article class="finance-goal-card"><div class="finance-goal-top">'+icon('goal','finance-icon-goal')+
      '<strong>'+escapeHtml(g.name)+'</strong>'+button('edit','Editar','goals',g.id)+'</div>'+
      '<div class="finance-progress"><span style="width:'+pct+'%"></span></div>'+
      '<div class="finance-goal-bottom"><div><small>Meta</small><b>'+money(g.target_cents)+'</b></div><div><small>Reservado</small><b>'+money(g.saved_cents)+'</b></div>'+
      '<div><small>Falta</small><b class="finance-outstanding">'+money(Math.max(0,g.target_cents-g.saved_cents))+'</b></div></div></article>';
  }).join('');
  const emptyAccounts = blank(financeQuery?'Nenhuma conta encontrada':'Suas próximas contas aparecerão aqui',
    financeQuery?'Tente outra busca.':'Cadastre a primeira conta com data de vencimento e prioridade.');
  const emptyIncome=blank(financeQuery?'Nenhuma entrada encontrada':'Você ainda não registrou entradas',
    financeQuery?'Tente outra busca.':'Adicione um recebimento confirmado ou uma entrada prevista.');
  const emptyGoals=blank(financeQuery?'Nenhuma meta encontrada':'Nenhuma meta cadastrada',
    financeQuery?'Tente outra busca.':'Crie uma reserva de emergência ou outra meta financeira.');
  const emptyExpenses=blank(financeQuery?'Nenhum gasto encontrado':'Nenhum gasto avulso registrado',
    financeQuery?'Tente outra busca.':'Gastos confirmados são descontados do saldo.');
  const tableHead='<thead><tr><th>Prioridade</th><th>Conta</th><th>Vencimento</th><th>Valor</th><th>Essencial</th><th>Status</th><th><span class="sr-only">Ações</span></th></tr></thead>';
  const shortHead='<thead><tr><th>Data</th><th>Origem</th><th>Valor</th><th>Status</th><th><span class="sr-only">Ações</span></th></tr></thead>';
  const monthControls='<div class="finance-month-controls"><button type="button" data-fin-action="prev-month" aria-label="Mês anterior">‹</button>'+
    '<button type="button" data-fin-action="next-month" aria-label="Próximo mês">›</button>'+
    '<label class="finance-month-input" title="Selecionar mês"><span class="sr-only">Mês de referência</span>'+
    '<input id="financeMonth" aria-label="Selecionar mês" type="month" value="'+escapeHtml(currentMonth)+'"></label></div>';
  node().innerHTML =
    '<div class="finance-dashboard">'+
      '<header class="finance-toolbar">'+
        '<div class="finance-toolbar-left"><div class="finance-title-area"><h1>'+escapeHtml(monthLabel())+'</h1><p>Planeje seus pagamentos e acompanhe sua renda variável</p></div>'+monthControls+'</div>'+
        '<label class="finance-search"><span aria-hidden="true">⌕</span><input id="financeSearch" type="search" placeholder="Buscar contas, entradas ou metas..." aria-label="Buscar registros financeiros" value="'+escapeHtml(financeQuery)+'"></label>'+
      '</header>'+
      '<div class="finance-kpis">'+
        '<article class="finance-kpi finance-kpi-balance">'+icon('wallet','finance-icon-balance')+'<div><span>Saldo disponível</span>'+
          '<strong class="'+(balance<0?'finance-negative':'')+'">'+money(balance)+'</strong><small>Dinheiro confirmado, menos pagamentos</small></div></article>'+
        '<article class="finance-kpi finance-kpi-pending">'+icon('document','finance-icon-pending')+'<div><span>Contas pendentes</span>'+
          '<strong>'+money(pendingTotal)+'</strong><small>'+pending.length+' conta(s) a pagar até este mês</small></div></article>'+
        '<article class="finance-kpi finance-kpi-coverage">'+icon('shield','finance-icon-coverage')+'<div><span>Cobertura das contas</span>'+
          '<strong class="'+(coverage===null?'finance-muted':coverage===100?'finance-positive':'finance-negative')+'">'+
          (coverage===null?'Sem contas':coverage+'% coberto')+'</strong><small>Falta para cobrir: '+money(missing)+'</small></div></article>'+
      '</div>'+
      '<div class="finance-layout">'+
        '<div class="finance-column finance-main-column">'+
          '<section class="finance-panel finance-accounts"><div class="finance-panel-head"><div class="finance-heading-group">'+icon('accounts','finance-section-icon')+
            '<div><h2>Próximas contas</h2><p>Organize seus pagamentos por vencimento ou prioridade.</p></div></div>'+
            '<div class="finance-heading-actions"><label class="finance-sort"><span class="sr-only">Ordenar contas</span><select id="financeSort">'+
              '<option value="priority" '+(financeSort==='priority'?'selected':'')+'>Ordenar por prioridade</option>'+
              '<option value="due" '+(financeSort==='due'?'selected':'')+'>Ordenar por vencimento</option>'+
              '<option value="amount" '+(financeSort==='amount'?'selected':'')+'>Maior valor primeiro</option></select></label>'+
              button('new','+ Nova conta','bills')+'</div></div>'+
            '<div class="finance-table-wrap"><table class="finance-table finance-bills-table">'+tableHead+'<tbody>'+billRows+'</tbody></table></div>'+(!shownBills.length?'<div class="finance-table-empty">'+emptyAccounts+'</div>':'')+
          '</section>'+
          '<section class="finance-panel finance-goals"><div class="finance-panel-head"><div class="finance-heading-group">'+icon('goal','finance-section-icon')+
            '<div><h2>Reservas e metas</h2><p>Seus objetivos, separados do dinheiro usado para as contas.</p></div></div>'+button('new','+ Nova meta','goals')+'</div>'+
            (goalCards?'<div class="finance-goal-grid">'+goalCards+'</div>':emptyGoals)+
          '</section>'+
        '</div>'+
        '<div class="finance-column finance-side-column">'+
          '<section class="finance-panel finance-planning"><div class="finance-panel-head">'+
            '<div class="finance-heading-group">'+icon('idea','finance-section-icon')+'<div><h2>Planejamento com renda variável</h2><p>Entradas previstas não aumentam o saldo até serem recebidas.</p></div></div></div>'+
            '<div class="finance-summary">'+
              summaryRow('↘','Recebido neste mês:',money(incomeTotal))+
              summaryRow('▤','Contas a pagar:',money(pendingTotal))+
              summaryRow('✓','Já coberto:',money(covered),'finance-positive')+
              summaryRow('◷','Ainda necessário:',money(missing),missing?'finance-negative':'finance-positive')+
              summaryRow('⚑','Próxima prioridade:',nextBill?escapeHtml(nextBill.name)+' ('+shortDate(nextBill.due_date)+')':'Nenhuma pendente')+
            '</div>'+ (predictedIncome>0?'<p class="finance-planned-note">Recebimentos previstos: '+money(predictedIncome)+' (não incluídos no saldo).</p>':'')+
          '</section>'+
          '<section class="finance-panel finance-income"><div class="finance-panel-head"><div class="finance-heading-group">'+icon('income','finance-section-icon')+
            '<div><h2>Entradas do mês</h2><p>Recebimentos reais e previstos.</p></div></div>'+button('new','+ Adicionar entrada','entries')+'</div>'+
            '<div class="finance-table-wrap"><table class="finance-table finance-income-table">'+shortHead+'<tbody>'+entryRows(shownIncome)+'</tbody></table></div>'+(!shownIncome.length?'<div class="finance-table-empty">'+emptyIncome+'</div>':'')+
            '<div class="finance-panel-footer"><span>Recebido no mês</span><strong>'+money(incomeTotal)+'</strong></div>'+
          '</section>'+
          '<section class="finance-panel finance-expenses"><div class="finance-panel-head"><div class="finance-heading-group">'+icon('expense','finance-section-icon')+
            '<div><h2>Gastos avulsos</h2><p>Despesas que não estão na lista de contas.</p></div></div>'+button('new','+ Adicionar gasto','expenses')+'</div>'+
            '<div class="finance-table-wrap"><table class="finance-table finance-income-table">'+shortHead+'<tbody>'+entryRows(shownExpenses)+'</tbody></table></div>'+(!shownExpenses.length?'<div class="finance-table-empty">'+emptyExpenses+'</div>':'')+
            '<div class="finance-panel-footer"><span>Gastos confirmados do mês</span><strong>'+money(sum(spent.filter(e=>e.status==='confirmed')))+'</strong></div>'+
          '</section>'+
        '</div>'+
      '</div>'+
      '<p class="finance-footnote">Seu saldo considera somente movimentações confirmadas. Registrar uma meta não altera automaticamente o dinheiro disponível.</p>'+
    '</div>';
}

function openPaymentForm(id){
  const bill=snapshot?.bills.find(item=>item.id===id);
  if(!bill)return;
  const editing=Boolean(bill.paid_at);
  const initialAmount=(Number(bill.paid_amount_cents || bill.amount_cents)/100).toFixed(2);
  const methodOptions=[
    ['pix','Pix'],['debit','Cartão de débito'],['credit','Cartão de crédito'],
    ['transfer','Transferência bancária'],['cash','Dinheiro em espécie'],['boleto','Boleto'],['other','Outro método']
  ].map(([value,label])=>'<option value="'+value+'" '+(bill.payment_method===value?'selected':'')+'>'+label+'</option>').join('');
  const overlay=document.createElement('div');
  overlay.className='finance-modal-backdrop finance-payment-backdrop';
  overlay.innerHTML='<section class="finance-modal finance-payment-modal" role="dialog" aria-modal="true" aria-labelledby="financePaymentTitle">'+
    '<div class="finance-modal-title"><div><span class="finance-modal-eyebrow">CONTROLE DE PAGAMENTOS</span>'+
      '<h2 id="financePaymentTitle">'+(editing?'Detalhes do pagamento':'Registrar pagamento')+'</h2>'+
      '<p>Confira os dados antes de atualizar seu saldo.</p></div>'+
      '<button type="button" data-dismiss aria-label="Fechar">×</button></div>'+
    '<div class="finance-payment-bill"><div><small>CONTA</small><strong>'+escapeHtml(bill.name)+'</strong>'+
      '<span>Vencimento: '+shortDate(bill.due_date)+'</span></div>'+
      '<div class="finance-payment-bill-value"><small>VALOR PLANEJADO</small><strong>'+money(bill.amount_cents)+'</strong></div></div>'+
    (editing&&!bill.payment_method?'<div class="finance-payment-legacy">Pagamento registrado anteriormente, sem detalhes de origem. Preencha os campos para completar o histórico.</div>':'')+
    '<form id="financePaymentForm">'+
      '<div class="finance-payment-grid"><label class="finance-field"><span>Data do pagamento *</span>'+
        '<input name="paid_at" type="date" required value="'+escapeHtml(bill.paid_at||nowDate())+'"></label>'+
        '<label class="finance-field"><span>Valor efetivamente pago (R$) *</span>'+
        '<input name="paid_amount" type="number" min="0.01" step="0.01" max="1000000000" required value="'+initialAmount+'"></label></div>'+
      '<label class="finance-field"><span>Como foi paga? *</span>'+
        '<select name="payment_method" required><option value="" '+(!bill.payment_method?'selected':'')+' disabled>Selecione a forma de pagamento</option>'+methodOptions+'</select></label>'+
      '<label class="finance-field"><span>De onde saiu o dinheiro? *</span>'+
        '<input name="payment_source" maxlength="120" required placeholder="Ex.: saldo Nubank PJ, Banco do Brasil, cartão Caixa" value="'+escapeHtml(bill.payment_source||'')+'">'+
        '<small>Informe a conta, cartão ou recurso utilizado no pagamento.</small></label>'+
      '<label class="finance-field"><span>Observações <em>(opcional)</em></span>'+
        '<textarea name="payment_notes" rows="3" maxlength="500" placeholder="Comprovante, referência ou outras informações">'+escapeHtml(bill.payment_notes||'')+'</textarea></label>'+
      '<div class="finance-payment-impact" id="financePaymentImpact" role="status" aria-live="polite"></div>'+
      '<div class="finance-modal-actions finance-payment-actions">'+
        (editing?'<button class="finance-delete" type="button" data-unpay>Desfazer pagamento</button>':'')+
        '<button type="button" class="finance-cancel" data-dismiss>Cancelar</button>'+
        '<button type="submit" class="finance-save">'+(editing?'Salvar alterações':'Confirmar pagamento')+'</button></div>'+
    '</form></section>';
  const refreshImpact=()=>{
    const method=overlay.querySelector('[name="payment_method"]').value;
    const amount=Number(overlay.querySelector('[name="paid_amount"]').value);
    const impact=overlay.querySelector('#financePaymentImpact');
    const formatted=Number.isFinite(amount)&&amount>0?money(Math.round(amount*100)):'o valor pago';
    impact.innerHTML=method==='credit'
      ? '<strong>Pagamento no cartão de crédito</strong><span>Esta conta ficará paga, mas '+formatted+' não será descontado agora do saldo disponível. Registre o pagamento da fatura quando o dinheiro realmente sair.</span>'
      : '<strong>Impacto no saldo</strong><span>Ao confirmar, '+formatted+' será contabilizado como pagamento. Se esta conta já estava paga, o valor anterior será substituído, sem duplicação.</span>';
  };
  node().appendChild(overlay);
  overlay.querySelector('[name="paid_amount"]').addEventListener('input',refreshImpact);
  overlay.querySelector('[name="payment_method"]').addEventListener('change',refreshImpact);
  refreshImpact();
  const close=()=>overlay.remove();
  overlay.addEventListener('click',event=>{if(event.target===overlay||event.target.closest('[data-dismiss]'))close();});
  overlay.querySelector('form').addEventListener('submit',async event=>{
    event.preventDefault();
    const form=event.currentTarget,submit=form.querySelector('[type="submit"]');
    const raw=new FormData(form);
    const amount=Number(raw.get('paid_amount'));
    const payload={
      paid_at:String(raw.get('paid_at')||''),
      paid_amount_cents:Math.round(amount*100),
      payment_method:String(raw.get('payment_method')||''),
      payment_source:String(raw.get('payment_source')||'').trim(),
      payment_notes:String(raw.get('payment_notes')||'').trim()
    };
    submit.disabled=true;
    try{
      await api('/api/finance/bills/'+id+'/payment',{method:'POST',body:JSON.stringify(payload)});
      close();toast(editing?'Pagamento atualizado.':'Pagamento registrado com os detalhes.');
      await loadFinance();
    }catch(err){toast(err.message,true);submit.disabled=false;}
  });
  overlay.querySelector('[data-unpay]')?.addEventListener('click',async event=>{
    if(!confirm('Desfazer o pagamento de "'+bill.name+'"? A conta voltará a ficar pendente e o saldo será recalculado.'))return;
    const btn=event.currentTarget;
    btn.disabled=true;
    try{
      await api('/api/finance/bills/'+id+'/payment',{method:'DELETE'});
      close();toast('Pagamento desfeito; a conta voltou a ficar pendente.');
      await loadFinance();
    }catch(err){toast(err.message,true);btn.disabled=false;}
  });
  overlay.querySelector('[name="paid_at"]')?.focus();
}

function openForm(kind,id=null){
  if(!snapshot) return;
  const normalized = kind==='expenses'?'entries':kind;
  const record = id ? snapshot[normalized].find(e=>e.id===id) : null;
  if(id && !record) return;
  const initialType = kind==='expenses'?'expense':record?.type || 'income';
  const formDate = currentMonth === nowMonth() ? nowDate() : currentMonth+'-01';
  const field = (name,label,type,value='',extra='') => '<label class="finance-field"><span>'+label+'</span><input name="'+name+'" type="'+type+'" value="'+escapeHtml(value)+'" '+extra+'></label>';
  const select = (name,label,options,current) => '<label class="finance-field"><span>'+label+'</span><select name="'+name+'">'+options.map(([value,text])=>'<option value="'+value+'" '+(String(value)===String(current)?'selected':'')+'>'+text+'</option>').join('')+'</select></label>';
  let fields = '';
  if(normalized==='entries'){
    fields = select('type','Movimentação',[['income','Entrada'],['expense','Gasto']],initialType)+
      field('description','Descrição','text',record?.description || '', 'required maxlength="160"')+
      field('amount','Valor (R$)','number',record ? (record.amount_cents/100).toFixed(2):'','required min="0.01" max="1000000000" step="0.01"')+
      field('entry_date','Data','date',record?.entry_date || formDate,'required')+
      select('status','Situação',[['planned','Previsto'],['confirmed','Confirmado']],record?.status || 'confirmed');
  } else if(normalized==='bills'){
    fields = field('name','Nome da conta','text',record?.name || '', 'required maxlength="160"')+
      field('amount','Valor (R$)','number',record ? (record.amount_cents/100).toFixed(2):'','required min="0.01" max="1000000000" step="0.01"')+
      field('due_date','Vencimento','date',record?.due_date || formDate,'required')+
      select('priority','Prioridade (1 = mais importante)',[[1,'1 · Urgente'],[2,'2 · Alta'],[3,'3 · Média'],[4,'4 · Baixa'],[5,'5 · Opcional']],record?.priority || 3)+
      '<label class="finance-check"><input type="checkbox" name="essential" '+(record?.essential?'checked':'')+'> Conta essencial</label>'+
      (record?.paid_at
        ? '<p class="finance-edit-payment-note">Esta conta está paga. Para alterar data, valor ou forma de pagamento, use <b>Ver / editar pagamento</b> no menu da conta.</p>'
        : '<p class="finance-edit-payment-note">Após salvar a conta, use <b>Registrar pagamento</b> para informar a data, a origem e a forma utilizada.</p>');
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
    else if(normalized==='bills') payload={name:get('name'),amount_cents:toCents('amount'),due_date:get('due_date'),priority:Number(get('priority')),essential:formData.has('essential')};
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
  node().addEventListener('click',async e=>{
    const btn=e.target.closest('[data-fin-action]');
    if(!btn)return;
    const action=btn.dataset.finAction,kind=btn.dataset.kind,id=btn.dataset.id;
    if(action==='new')return openForm(kind);
    if(action==='edit')return openForm(kind,id);
    if(action==='prev-month')return shiftMonth(-1);
    if(action==='next-month')return shiftMonth(1);
    if(action==='payment')return openPaymentForm(id);
  });
  node().addEventListener('change',e=>{
    if(e.target.id==='financeMonth' && /^\d{4}-\d{2}$/.test(e.target.value)){currentMonth=e.target.value;render();}
    if(e.target.id==='financeSort'){financeSort=e.target.value;render();}
  });
  node().addEventListener('input',e=>{
    if(e.target.id!=='financeSearch')return;
    const next=e.target.value;
    const caret=e.target.selectionStart;
    financeQuery=next;
    render();
    const input=node().querySelector('#financeSearch');
    input.focus();
    input.setSelectionRange(caret,caret);
  });
}
