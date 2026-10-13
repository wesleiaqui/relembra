#!/usr/bin/env bash
# Um comando para instalar atualização local, proteger estado atual do D1 e publicar.
set -euo pipefail
SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-$HOME/Downloads/relembra-cloudflare}"
TARGET_DIR="$(realpath -m "$TARGET_DIR")"

abort() { echo "❌ $*" >&2; exit 1; }
[[ -f "$SOURCE_DIR/migrations/0004_thought_journal.sql" ]] || abort "Execute este script da pasta relembra-cloudflare-v1.3."
[[ "$SOURCE_DIR" != "$TARGET_DIR" ]] || abort "O destino deve ser a pasta instalada antiga, não a pasta da atualização."
[[ -f "$TARGET_DIR/wrangler.jsonc" && -f "$TARGET_DIR/migrations/0003_multiple_records.sql" ]] || abort "Instalação anterior v1.2 não encontrada em $TARGET_DIR"
command -v node >/dev/null || abort "Instale Node.js 22 ou superior."
command -v npm >/dev/null || abort "npm não foi encontrado."
[[ -w "$TARGET_DIR" ]] || abort "Sem permissão para escrever na pasta. Corrija a propriedade; não use sudo npm."
node -v
if ! grep -Eq '"binding"[[:space:]]*:[[:space:]]*"DB"' "$TARGET_DIR/wrangler.jsonc"; then abort "Binding D1 DB não encontrado na configuração antiga."; fi
if grep -q '00000000-0000-0000-0000-000000000000' "$TARGET_DIR/wrangler.jsonc"; then abort "Seu banco D1 ainda possui UUID de exemplo."; fi

printf "\n[1/6] Testando a atualização ANTES de substituir o código atual..."
(cd "$SOURCE_DIR" && npm test) || abort "Testes falharam; a versão atual não será alterada."

printf "\n[2/6] Criando referência de recuperação do D1 remoto ANTES da migração..."
STAMP="$(date +%Y%m%d-%H%M%S)"
mkdir -p "$TARGET_DIR/backups-locais"
RECOVERY="$TARGET_DIR/backups-locais/time-travel-antes-v1.3-$STAMP.txt"
(cd "$TARGET_DIR" && npx --no-install wrangler d1 time-travel info DB) | tee "$RECOVERY" || abort "Não consegui obter o bookmark; não vou migrar o banco."
grep -q 'current bookmark' "$RECOVERY" || abort "A resposta não confirmou bookmark do D1. Não vou migrar."
echo "Bookmark armazenado em: $RECOVERY"
echo "IMPORTANTE: Time Travel não é uma cópia independente. Baixe também um backup JSON pelo site."
read -r -p "Você já baixou seu backup JSON do Relembra? [s/N] " ok
[[ "$ok" =~ ^[sSyY]$ ]] || abort "Atualização cancelada. Seu banco e código publicado não foram alterados."

printf "\n[3/6] Salvando cópia do código antigo..."
BACKUP="$TARGET_DIR/.backup-codigo-$STAMP"
mkdir -p "$BACKUP"
for dir in src public migrations tests scripts; do
  [[ -d "$TARGET_DIR/$dir" ]] && cp -a "$TARGET_DIR/$dir" "$BACKUP/$dir"
done
for file in package.json package-lock.json README.md GUIA-DE-ATUALIZACAO.md ATUALIZAR-RELEMBRA.sh; do
  [[ -e "$TARGET_DIR/$file" ]] && cp -a "$TARGET_DIR/$file" "$BACKUP/$file"
done

printf "\n[4/6] Instalando arquivos da v1.3 (sem alterar wrangler.jsonc, senha ou .dev.vars)..."
for dir in src public migrations tests scripts; do
  mkdir -p "$TARGET_DIR/$dir"
  cp -a "$SOURCE_DIR/$dir/." "$TARGET_DIR/$dir/"
done
for file in package.json README.md GUIA-DE-ATUALIZACAO.md ATUALIZAR-RELEMBRA.sh ATUALIZAR-E-PUBLICAR.sh; do
  cp -a "$SOURCE_DIR/$file" "$TARGET_DIR/$file"
done
(cd "$TARGET_DIR" && npm install && npm test) || abort "Testes/instalação no destino falharam. Código anterior em $BACKUP. Nada novo foi publicado."

printf "\n[5/6] Aplicando migrações pendentes ao D1 remoto..."
(cd "$TARGET_DIR" && npm run db:remote) || abort "Falha na migração; não vou fazer deploy. Examine o erro e o bookmark em $RECOVERY."

printf "\n[6/6] Publicando no Cloudflare..."
(cd "$TARGET_DIR" && npm run deploy) || abort "Falha no deploy. A migração pode ter sido aplicada; preserve seus backups e veja os logs."
printf '\n✅ Relembra v1.3 publicado.\n✅ Código antigo: %s\n✅ Referência Time Travel: %s\n✅ wrangler.jsonc e APP_PASSWORD preservados.\n' "$BACKUP" "$RECOVERY"
