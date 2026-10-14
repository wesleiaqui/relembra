import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setupFinance, loadFinance, resetFinance } from '../public/finance.js';

test('painel financeiro replica a hierarquia visual e mantém os dados reais', async () => {
  const original = globalThis.document;
  const listeners = {};
  const root = {
    innerHTML: '',
    addEventListener(type, fn) { listeners[type] = fn; },
    replaceChildren() { this.innerHTML = ''; },
    querySelector(selector) {
      if(selector !== '#financeSearch')return null;
      return { focus(){}, setSelectionRange(){} };
    }
  };
  const d = new Date();
  const month = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const id1 = '00000000-0000-4000-8000-000000000001';
  const id2 = '00000000-0000-4000-8000-000000000002';
  const data = {
    balance_cents: 10000,
    bills: [
      { id:id1, name:'Conta prioridade baixa', amount_cents:3000, due_date:month+'-09', priority:3, essential:0, paid_at:null },
      { id:id2, name:'Conta essencial', amount_cents:9000, due_date:month+'-20', priority:1, essential:1, paid_at:null }
    ],
    entries: [
      { id:'00000000-0000-4000-8000-000000000003', type:'income', description:'Recebimento confirmado', amount_cents:10000, entry_date:month+'-01', status:'confirmed' },
      { id:'00000000-0000-4000-8000-000000000004', type:'income', description:'Entrada prevista', amount_cents:90000, entry_date:month+'-02', status:'planned' }
    ],
    goals:[{id:'00000000-0000-4000-8000-000000000005',name:'Reserva',target_cents:80000,saved_cents:0}]
  };
  const calls=[];
  globalThis.document = { getElementById:id => id === 'financeRoot' ? root : null };
  try {
    setupFinance({
      async api(path,options) {calls.push({path,options});return data;},
      toast(){}
    });
    await loadFinance();
    const html = root.innerHTML;
    assert.match(html,/class="finance-dashboard"/);
    assert.match(html,/Próximas contas/);
    assert.match(html,/Cobertura das contas/);
    assert.match(html,/Planejamento com renda variável/);
    assert.match(html,/Reservas e metas/);
    assert.match(html,/Entradas do mês/);
    assert.match(html,/83% coberto/);
    assert.match(html,/R\$&nbsp;2[,.]000|R\$\s?20,00|R\$&nbsp;20,00/, 'cobertura insuficiente precisa aparecer');
    assert.match(html,/Entrada prevista/);
    assert.ok(html.indexOf('Conta essencial')<html.indexOf('Conta prioridade baixa'), 'prioridade controla a ordem');
    assert.equal(calls.length,1);
    assert.match(calls[0].path,/^\/api\/finance\?month=\d{4}-\d{2}$/);

    listeners.change({target:{id:'financeSort',value:'due'}});
    assert.ok(root.innerHTML.indexOf('Conta prioridade baixa')<root.innerHTML.indexOf('Conta essencial'), 'ordem por vencimento');
    listeners.input({target:{id:'financeSearch',value:'Conta essencial',selectionStart:15}});
    assert.match(root.innerHTML,/Conta essencial/);
    assert.doesNotMatch(root.innerHTML,/<strong class="finance-item-name">Conta prioridade baixa<\/strong>/);
    assert.match(root.innerHTML,/Contas pendentes/, 'busca não oculta KPI ou altera seus totais');

    listeners.click({target:{closest:()=>({dataset:{finAction:'next-month'}})}});
    const selected = new Date(d.getFullYear(),d.getMonth()+1,1);
    const label = new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(selected);
    assert.match(root.innerHTML,new RegExp(label.slice(0,3),'i'), 'botão próximo mês funciona');
  } finally {
    resetFinance();
    globalThis.document = original;
  }
});

test('a interface financeira não interfere nas outras telas do Relembra',()=>{
  const app = readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css = readFileSync(new URL('../public/finance.css',import.meta.url),'utf8');
  assert.match(app,/document\.body\.classList\.toggle\('finance-mode', known === 'finance'\)/);
  assert.match(app,/document\.body\.classList\.remove\('finance-mode'\)/);
  assert.match(css,/body\.finance-mode \.page\{[^}]*max-width:none/);
  assert.match(css,/\.finance-layout\{display:grid/);
  assert.match(css,/@media\(max-width:780px\)/);
});


test('ação de pagamento sempre abre formulário com data, valor, método e origem',()=>{
  const src=readFileSync(new URL('../public/finance.js',import.meta.url),'utf8');
  const styles=readFileSync(new URL('../public/finance.css',import.meta.url),'utf8');
  assert.match(src,/if\(action==='payment'\)return openPaymentForm\(id\)/);
  assert.doesNotMatch(src,/if\(action==='toggle-paid'\)/);
  assert.match(src,/id="financePaymentForm"/);
  for (const term of ['Data do pagamento','Valor efetivamente pago','Como foi paga','De onde saiu o dinheiro','Confirmar pagamento']) {
    assert.ok(src.includes(term),term);
  }
  assert.match(src,/\/api\/finance\/bills\/'\+id\+'\/payment'/);
  assert.match(styles,/\.finance-payment-modal/);
});


test('contas fixas: formulário, painel, gerenciamento e mês selecionado',()=>{
 const frontend=readFileSync(new URL('../public/finance.js',import.meta.url),'utf8');
 const css=readFileSync(new URL('../public/finance.css',import.meta.url),'utf8');
 const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
 assert.match(frontend,/Repetir todos os meses/);
 assert.match(frontend,/data-fin-action/);
 assert.match(frontend,/function openRecurringManager/);
 assert.match(frontend,/function openRecurringEditor/);
 assert.match(frontend,/if\(action==='manage-recurring'\)/);
 assert.match(frontend,/api\('\/api\/finance\/recurring'/);
 assert.match(frontend,/recurring_id/);
 assert.match(frontend,/\/api\/finance\?month=/);
 assert.match(css,/finance-recurring-check/);
 assert.match(css,/finance-recurring-modal/);
 assert.match(app,/financeGroups\.recurring/,'backup importa modelos de recorrência');
});
