// Finanças ficam isoladas por owner_id e não são usadas no chat de vídeos.
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const fail = (message, status = 400) => json({ error: message }, status);
const stamp = () => new Date().toISOString();
const str = (value, max) => String(value ?? '').trim().slice(0, max);
const validDate = (value, optional = false) => {
  if (optional && (value === undefined || value === null || value === '')) return null;
  const text = String(value ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || Number.isNaN(Date.parse(text + 'T00:00:00Z'))
    || new Date(text + 'T00:00:00Z').toISOString().slice(0, 10) !== text)
    throw Error('Informe uma data válida (AAAA-MM-DD).');
  return text;
};
const cents = (value, { zero = false } = {}) => {
  if (!Number.isSafeInteger(value) || value < (zero ? 0 : 1) || value > 100000000000)
    throw Error('Informe um valor válido em centavos.');
  return value;
};
const paymentMethods = new Set(['pix','debit','credit','transfer','cash','boleto','other']);
const paymentData = body => {
  const method = String(body.payment_method ?? '');
  const source = str(body.payment_source,120);
  if (!paymentMethods.has(method)) throw Error('Selecione como a conta foi paga.');
  if (!source) throw Error('Informe de qual conta, cartão ou dinheiro o pagamento saiu.');
  return {
    paid_at: validDate(body.paid_at),
    paid_amount_cents: cents(body.paid_amount_cents),
    payment_method:method,
    payment_source:source,
    payment_notes:str(body.payment_notes,500)
  };
};
const validate = (kind, body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Registro inválido.');
  if (kind === 'entries') {
    const type = body.type;
    const status = body.status;
    const description = str(body.description, 160);
    if (!['income', 'expense'].includes(type) || !['planned', 'confirmed'].includes(status) || !description)
      throw Error('Informe descrição, tipo e situação válidos.');
    return { type, description, amount_cents: cents(body.amount_cents), entry_date: validDate(body.entry_date), status };
  }
  if (kind === 'bills') {
    const name = str(body.name, 160);
    const priority = Number(body.priority);
    if (!name || !Number.isInteger(priority) || priority < 1 || priority > 5)
      throw Error('Informe conta e prioridade válidas.');
    return { name, amount_cents: cents(body.amount_cents), due_date: validDate(body.due_date),
      priority, essential: body.essential === true || body.essential === 1 ? 1 : 0,
      paid_at:validDate(body.paid_at,true),
      payment_method:body.payment_method || null,
      payment_source:str(body.payment_source,120),
      paid_amount_cents:body.paid_at ? cents(body.paid_amount_cents ?? body.amount_cents) : null,
      payment_notes:str(body.payment_notes,500),recurring_id:null,recurring_month:null };
  }
  if (kind === 'goals') {
    const name = str(body.name, 120);
    if (!name) throw Error('Informe o nome da meta.');
    return { name, target_cents: cents(body.target_cents), saved_cents: cents(body.saved_cents, { zero:true }) };
  }
  throw Error('Tipo financeiro desconhecido.');
};

const monthFormat = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const monthNow = () => new Date().toISOString().slice(0,7);
const monthOf = date => date.slice(0,7);
const monthShift = (month,delta) => {
  const [y,m]=month.split('-').map(Number);
  const d=new Date(Date.UTC(y,m-1+delta,1));
  return d.toISOString().slice(0,7);
};
const dueDate = (month,day) => {
  const [year,m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(year,m,0)).getUTCDate();
  return month+'-'+String(Math.min(day,last)).padStart(2,'0');
};
function recurringInput(body){
  if(!body || typeof body!=='object' || Array.isArray(body))throw Error('Regra mensal inválida.');
  const name=str(body.name,160),amount_cents=cents(body.amount_cents);
  const day_of_month=Number(body.day_of_month),priority=Number(body.priority);
  if(!name || !Number.isInteger(day_of_month) || day_of_month<1 || day_of_month>31 ||
    !Number.isInteger(priority)||priority<1||priority>5)throw Error('Informe nome, dia e prioridade válidos.');
  return {name,amount_cents,day_of_month,priority,
    essential:body.essential===true||body.essential===1?1:0,active:body.active===false||body.active===0?0:1};
}
async function materializeRecurring(env,ownerId,selectedMonth){
  const items=(await env.DB.prepare('SELECT * FROM finance_recurring_rules WHERE owner_id=? AND active=1 ORDER BY created_at ASC LIMIT 200')
    .bind(ownerId).all()).results||[];
  const target=selectedMonth>monthNow()?selectedMonth:monthNow();
  const commands=[];
  for (const item of items){
    let cursor=monthShift(item.last_generated_month,1);
    if(cursor<item.start_month)cursor=item.start_month;
    let last=null,count=0;
    // Limite de 24 ocorrências por regra por requisição; evita geração ilimitada.
    while(cursor<=target && count<24 && commands.length<2400){
      const stampNow=stamp();
      commands.push(env.DB.prepare(
        'INSERT OR IGNORE INTO finance_bills (id,owner_id,name,amount_cents,due_date,priority,essential,paid_at,payment_method,payment_source,paid_amount_cents,payment_notes,recurring_id,recurring_month,created_at,updated_at) VALUES (?,?,?,?,?,?,?,NULL,NULL,\'\',NULL,\'\',?,?,?,?)'
      ).bind(crypto.randomUUID(),ownerId,item.name,item.amount_cents,dueDate(cursor,item.day_of_month),
        item.priority,item.essential,item.id,cursor,stampNow,stampNow));
      last=cursor;cursor=monthShift(cursor,1);count++;
    }
    if(last)commands.push(env.DB.prepare(
      'UPDATE finance_recurring_rules SET last_generated_month=CASE WHEN last_generated_month<? THEN ? ELSE last_generated_month END WHERE id=? AND owner_id=?'
    ).bind(last,last,item.id,ownerId));
  }
  if(commands.length)await env.DB.batch(commands);
}
async function createRecurring(env,ownerId,body){
  const existingId=typeof body.existing_bill_id==='string'?body.existing_bill_id:'';
  let entry;
  if(existingId){
    if(!/^[a-f0-9-]{36}$/i.test(existingId))return fail('Conta inválida.',400);
    const bill=await env.DB.prepare('SELECT * FROM finance_bills WHERE id=? AND owner_id=?')
      .bind(existingId,ownerId).first();
    if(!bill)return fail('Conta não encontrada.',404);
    if(bill.recurring_id)return fail('Esta conta já está vinculada a uma recorrência.',409);
    entry={name:bill.name,amount_cents:bill.amount_cents,day_of_month:Number(bill.due_date.slice(8)),
      priority:bill.priority,essential:bill.essential,active:1};
  }else {
    const v=recurringInput({...body,day_of_month:Number(String(body.due_date||'').slice(8))});
    validDate(body.due_date);entry=v;
  }
  const date=existingId
    ? await env.DB.prepare('SELECT due_date FROM finance_bills WHERE id=? AND owner_id=?').bind(existingId,ownerId).first()
    : {due_date:body.due_date};
  const startMonth=monthOf(date.due_date);
  const id=crypto.randomUUID(),now=stamp();
  const insert=env.DB.prepare('INSERT INTO finance_recurring_rules (id,owner_id,name,amount_cents,day_of_month,priority,essential,active,start_month,last_generated_month,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
    .bind(id,ownerId,entry.name,entry.amount_cents,entry.day_of_month,entry.priority,entry.essential,
      1,startMonth,startMonth,now,now);
  let linked;
  if(existingId){
    linked=env.DB.prepare('UPDATE finance_bills SET recurring_id=?,recurring_month=?,updated_at=? WHERE id=? AND owner_id=? AND recurring_id IS NULL')
      .bind(id,startMonth,now,existingId,ownerId);
  }else {
    linked=env.DB.prepare(
      'INSERT INTO finance_bills (id,owner_id,name,amount_cents,due_date,priority,essential,recurring_id,recurring_month,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)'
    ).bind(crypto.randomUUID(),ownerId,entry.name,entry.amount_cents,date.due_date,entry.priority,entry.essential,id,startMonth,now,now);
  }
  await env.DB.batch([insert,linked]);
  return json({ok:true,id},201);
}
async function updateRecurring(env,ownerId,id,body){
  let input;try{input=recurringInput(body)}catch(e){return fail(e.message)}
  const previous=await env.DB.prepare('SELECT * FROM finance_recurring_rules WHERE id=? AND owner_id=?')
    .bind(id,ownerId).first();
  if(!previous)return fail('Recorrência não encontrada.',404);
  // Pausar e retomar não deve gerar cobranças dos meses em que a regra ficou pausada.
  const last=previous.active===0 && input.active===1
    ? (previous.start_month>monthNow()?monthShift(previous.start_month,-1):monthShift(monthNow(),-1))
    : previous.last_generated_month;
  await env.DB.prepare('UPDATE finance_recurring_rules SET name=?,amount_cents=?,day_of_month=?,priority=?,essential=?,active=?,last_generated_month=?,updated_at=? WHERE id=? AND owner_id=?')
    .bind(input.name,input.amount_cents,input.day_of_month,input.priority,input.essential,input.active,last,stamp(),id,ownerId).run();
  return json({ok:true,id});
}

const tables = { entries: 'finance_entries', bills: 'finance_bills', goals: 'finance_goals' };
const bodyPaidChanged = (body, paidAt) => Object.hasOwn(body,'paid_at') && (body.paid_at || null)!==(paidAt || null);
const pathPayment = path => {
  const match=path.match(/^\/api\/finance\/bills\/([a-f0-9-]{36})\/payment$/i);
  return match ? match[1] : null;
};
const fields = {
  entries: ['type','description','amount_cents','entry_date','status'],
  bills: ['name','amount_cents','due_date','priority','essential','paid_at','payment_method','payment_source','paid_amount_cents','payment_notes','recurring_id','recurring_month'],
  goals: ['name','target_cents','saved_cents']
};
export async function handleFinance(request, env, user) {
  const url = new URL(request.url);
  const route = url.pathname.match(/^\/api\/finance(?:\/(entries|bills|goals))?(?:\/([a-f0-9-]{36}))?$/i);
  const recurringRoute=url.pathname.match(/^\/api\/finance\/recurring(?:\/([a-f0-9-]{36}))?$/i);
  if(recurringRoute){
    const id=recurringRoute[1];
    if(request.method==='POST' && !id){
      let body;try{body=JSON.parse(await request.text());if(!body||typeof body!=='object')throw Error('Dados inválidos.')}
      catch(e){return fail('Dados inválidos.')}
      try{return await createRecurring(env,user.id,body)}catch(e){return fail(e.message||'Falha ao criar recorrência.')}
    }
    if(request.method==='PUT' && id){
      let body;try{body=JSON.parse(await request.text())}catch{return fail('Dados inválidos.')}
      return updateRecurring(env,user.id,id,body);
    }
    return fail('Método não permitido.',405);
  }
  const paymentId = pathPayment(url.pathname);
  if (paymentId) {
    const method = request.method;
    if (method === 'POST') {
      const raw = await request.text();
      if (raw.length > 4000) return fail('Pagamento muito grande.',413);
      let data;
      try { data=paymentData(JSON.parse(raw)); } catch(e) { return fail(e.message); }
      const result = await env.DB.prepare(
        'UPDATE finance_bills SET paid_at=?,paid_amount_cents=?,payment_method=?,payment_source=?,payment_notes=?,updated_at=? WHERE id=? AND owner_id=?'
      ).bind(data.paid_at,data.paid_amount_cents,data.payment_method,data.payment_source,data.payment_notes,stamp(),paymentId,user.id).run();
      return result.meta.changes ? json({ok:true,id:paymentId}) : fail('Conta não encontrada.',404);
    }
    if (method === 'DELETE') {
      const result=await env.DB.prepare(
        "UPDATE finance_bills SET paid_at=NULL,paid_amount_cents=NULL,payment_method=NULL,payment_source='',payment_notes='',updated_at=? WHERE id=? AND owner_id=? AND paid_at IS NOT NULL"
      ).bind(stamp(),paymentId,user.id).run();
      return result.meta.changes ? json({ok:true,id:paymentId}) : fail('Pagamento não encontrado.',404);
    }
    return fail('Método não permitido.',405);
  }
  if (!route) return fail('Rota financeira não encontrada.', 404);
  const [, kind, id] = route, method = request.method;
  if (!kind && method === 'GET') {
    const selectedMonth=url.searchParams.get('month')||monthNow();
    if(!monthFormat.test(selectedMonth))return fail('Mês inválido.',400);
    await materializeRecurring(env,user.id,selectedMonth);
    // Saldo é global, histórico: entradas confirmadas menos gastos confirmados e contas pagas.
    const totals = await env.DB.prepare(
      "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount_cents ELSE -amount_cents END),0) AS net_cents FROM finance_entries WHERE owner_id=? AND status='confirmed'"
    ).bind(user.id).first();
    const billsPaid = await env.DB.prepare(
      "SELECT COALESCE(SUM(CASE WHEN payment_method='credit' THEN 0 ELSE COALESCE(paid_amount_cents,amount_cents) END),0) AS total_cents FROM finance_bills WHERE owner_id=? AND paid_at IS NOT NULL"
    ).bind(user.id).first();
    const [entries, bills, goals] = await Promise.all(
      ['entries','bills','goals'].map(k => env.DB.prepare(
        'SELECT * FROM ' + tables[k] + ' WHERE owner_id=? ORDER BY created_at DESC LIMIT 2000'
      ).bind(user.id).all().then(r => r.results || []))
    );
    const recurring=(await env.DB.prepare('SELECT * FROM finance_recurring_rules WHERE owner_id=? ORDER BY active DESC,name COLLATE NOCASE ASC LIMIT 200').bind(user.id).all()).results || [];
    return json({ balance_cents: Number(totals.net_cents) - Number(billsPaid.total_cents), entries, bills, goals, recurring,
      limits: { per_list: 2000 } });
  }
  if (!kind) return fail('Método inválido.', 405);
  const table = tables[kind], columns = fields[kind];
  if (!table || (id && !/^[a-f0-9-]{36}$/i.test(id))) return fail('Registro inválido.', 400);
  if (method === 'DELETE' && id) {
    const result = await env.DB.prepare('DELETE FROM ' + table + ' WHERE id=? AND owner_id=?').bind(id,user.id).run();
    return result.meta.changes ? json({ ok: true }) : fail('Registro não encontrado.', 404);
  }
  if ((method === 'POST' && !id) || (method === 'PUT' && id)) {
    const raw = await request.text();
    if (raw.length > 5000) return fail('Registro muito grande.', 413);
    let data;
    try { data = validate(kind, JSON.parse(raw)); }
    catch (e) { return fail(e.message || 'Dados inválidos.'); }
    // Pagamento só pode ser definido / corrigido na rota /payment.
    if (kind === 'bills') {
      if (method === 'POST' && data.paid_at !== null) return fail('Cadastre a conta pendente; depois registre o pagamento.',400);
      if (method === 'PUT') {
        const prior=await env.DB.prepare('SELECT paid_at FROM finance_bills WHERE id=? AND owner_id=?').bind(id,user.id).first();
        if (!prior) return fail('Conta não encontrada.',404);
        if (bodyPaidChanged(JSON.parse(raw),prior.paid_at)) return fail('Utilize Registrar pagamento para informar data, valor e origem.',400);
        const result=await env.DB.prepare(
          'UPDATE finance_bills SET name=?,amount_cents=?,due_date=?,priority=?,essential=?,updated_at=? WHERE id=? AND owner_id=?'
        ).bind(data.name,data.amount_cents,data.due_date,data.priority,data.essential,stamp(),id,user.id).run();
        return result.meta.changes ? json({ok:true,id}) : fail('Conta não encontrada.',404);
      }
    }
    const values = columns.map(k => data[k]), timestamp = stamp();
    if (method === 'POST') {
      const newId = crypto.randomUUID();
      await env.DB.prepare(
        'INSERT INTO ' + table + ' (id,owner_id,' + columns.join(',') + ',created_at,updated_at) VALUES (' +
        Array(columns.length + 4).fill('?').join(',') + ')'
      ).bind(newId,user.id,...values,timestamp,timestamp).run();
      return json({ id:newId, ok:true }, 201);
    }
    const result = await env.DB.prepare(
      'UPDATE ' + table + ' SET ' + columns.map(k => k + '=?').join(',') + ',updated_at=? WHERE id=? AND owner_id=?'
    ).bind(...values,timestamp,id,user.id).run();
    return result.meta.changes ? json({ id,ok:true }) : fail('Registro não encontrado.', 404);
  }
  return fail('Método não permitido.', 405);
}

export async function exportFinances(env,ownerId) {
  const output = {};
  for (const kind of Object.keys(tables)) {
    const result = await env.DB.prepare('SELECT * FROM ' + tables[kind] + ' WHERE owner_id=? ORDER BY created_at DESC LIMIT 5000')
      .bind(ownerId).all();
    output[kind] = result.results || [];
  }
  output.recurring=(await env.DB.prepare('SELECT * FROM finance_recurring_rules WHERE owner_id=? ORDER BY created_at DESC LIMIT 5000')
    .bind(ownerId).all()).results || [];
  return output;
}
export async function importFinances(env,ownerId,finance) {
  if (!finance || typeof finance !== 'object' || Array.isArray(finance)) return { imported:0,skipped:0 };
  let imported = 0, skipped = 0;
  const recurringMap=new Map();
  const incoming=finance.recurring || [];
  if(!Array.isArray(incoming) || incoming.length>250)throw Error('Importe até 250 contas fixas por lote.');
  // Restaura modelos antes das contas ligadas a eles; resolve IDs em conflito entre usuários.
  for(const raw of incoming){
    try{
      const v=recurringInput(raw);
      if(!monthFormat.test(raw.start_month)||!monthFormat.test(raw.last_generated_month))
        throw Error('Mês inválido.');
      const oldId=typeof raw.id==='string'&&/^[a-f0-9-]{36}$/i.test(raw.id)?raw.id:'';
      const found=oldId?await env.DB.prepare('SELECT owner_id FROM finance_recurring_rules WHERE id=?')
        .bind(oldId).first():null;
      if(found?.owner_id===ownerId){recurringMap.set(oldId,oldId);skipped++;continue;}
      const newId=found?crypto.randomUUID():oldId||crypto.randomUUID();
      const time=stamp();
      await env.DB.prepare('INSERT INTO finance_recurring_rules (id,owner_id,name,amount_cents,day_of_month,priority,essential,active,start_month,last_generated_month,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .bind(newId,ownerId,v.name,v.amount_cents,v.day_of_month,v.priority,v.essential,v.active,
          raw.start_month,raw.last_generated_month,time,time).run();
      if(oldId)recurringMap.set(oldId,newId);
      imported++;
    }catch{skipped++;}
  }
  for (const kind of Object.keys(tables)) {
    const rows = finance[kind] || [];
    if (!Array.isArray(rows) || rows.length > 250) throw Error('Importe até 250 registros financeiros por tipo em cada lote.');
    for (const row of rows) {
      try {
        const valid = validate(kind,row);
        const rawId = typeof row.id === 'string' && /^[a-f0-9-]{36}$/i.test(row.id) ? row.id : '';
        const collision = rawId
          ? await env.DB.prepare('SELECT owner_id FROM ' + tables[kind] + ' WHERE id=?').bind(rawId).first()
          : null;
        if (collision?.owner_id === ownerId) { skipped++; continue; }
        const id = collision ? crypto.randomUUID() : rawId || crypto.randomUUID();
        const cols = fields[kind];
        const date = stamp();
        await env.DB.prepare('INSERT INTO ' + tables[kind] +
          ' (id,owner_id,' + cols.join(',') + ',created_at,updated_at) VALUES (' +
          Array(cols.length + 4).fill('?').join(',') + ')')
          .bind(id,ownerId,...cols.map(c => c==='recurring_id'
            ? (recurringMap.get(raw.recurring_id) || null)
            : c==='recurring_month'
              ? (recurringMap.has(raw.recurring_id) && monthFormat.test(raw.recurring_month || '') ? raw.recurring_month : null)
              : valid[c]),date,date).run();
        imported++;
      } catch { skipped++; }
    }
  }
  return { imported, skipped };
}
