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
      priority, essential: body.essential === true || body.essential === 1 ? 1 : 0, paid_at: validDate(body.paid_at, true) };
  }
  if (kind === 'goals') {
    const name = str(body.name, 120);
    if (!name) throw Error('Informe o nome da meta.');
    return { name, target_cents: cents(body.target_cents), saved_cents: cents(body.saved_cents, { zero:true }) };
  }
  throw Error('Tipo financeiro desconhecido.');
};
const tables = { entries: 'finance_entries', bills: 'finance_bills', goals: 'finance_goals' };
const fields = {
  entries: ['type','description','amount_cents','entry_date','status'],
  bills: ['name','amount_cents','due_date','priority','essential','paid_at'],
  goals: ['name','target_cents','saved_cents']
};
export async function handleFinance(request, env, user) {
  const url = new URL(request.url);
  const route = url.pathname.match(/^\/api\/finance(?:\/(entries|bills|goals))?(?:\/([a-f0-9-]{36}))?$/i);
  if (!route) return fail('Rota financeira não encontrada.', 404);
  const [, kind, id] = route, method = request.method;
  if (!kind && method === 'GET') {
    // Saldo é global, histórico: entradas confirmadas menos gastos confirmados e contas pagas.
    const totals = await env.DB.prepare(
      "SELECT COALESCE(SUM(CASE WHEN type='income' THEN amount_cents ELSE -amount_cents END),0) AS net_cents FROM finance_entries WHERE owner_id=? AND status='confirmed'"
    ).bind(user.id).first();
    const billsPaid = await env.DB.prepare(
      'SELECT COALESCE(SUM(amount_cents),0) AS total_cents FROM finance_bills WHERE owner_id=? AND paid_at IS NOT NULL'
    ).bind(user.id).first();
    const [entries, bills, goals] = await Promise.all(
      ['entries','bills','goals'].map(k => env.DB.prepare(
        'SELECT * FROM ' + tables[k] + ' WHERE owner_id=? ORDER BY created_at DESC LIMIT 2000'
      ).bind(user.id).all().then(r => r.results || []))
    );
    return json({ balance_cents: Number(totals.net_cents) - Number(billsPaid.total_cents), entries, bills, goals,
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
  return output;
}
export async function importFinances(env,ownerId,finance) {
  if (!finance || typeof finance !== 'object' || Array.isArray(finance)) return { imported:0,skipped:0 };
  let imported = 0, skipped = 0;
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
          .bind(id,ownerId,...cols.map(c => valid[c]),date,date).run();
        imported++;
      } catch { skipped++; }
    }
  }
  return { imported, skipped };
}
