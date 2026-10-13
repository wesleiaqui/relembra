import { readFileSync, writeFileSync } from 'node:fs';
const id = process.argv[2];
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || '')) {
  console.error('Uso: npm run configurar:db -- UUID_MOSTRADO_PELO_CLOUDFLARE');
  process.exit(1);
}
const file = new URL('../wrangler.jsonc', import.meta.url);
const old = readFileSync(file, 'utf8');
const next = old.replace(/("database_id"\s*:\s*")[0-9a-f-]+("\s*)/i, `$1${id}$2`);
if (next === old && !old.includes(id)) { console.error('Não encontrei o campo database_id em wrangler.jsonc.'); process.exit(1); }
writeFileSync(file, next);
console.log('Banco D1 configurado no wrangler.jsonc:', id);
