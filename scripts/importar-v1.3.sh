#!/usr/bin/env bash
# Importação inicial segura da v1.3 para o repositório privado.
# Este script NÃO publica na Cloudflare nem altera o banco D1.
set -euo pipefail
fail() { echo "❌ $*" >&2; exit 1; }

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SOURCE="$HOME/Downloads/relembra-cloudflare-v1.3"
INSTALLED="$HOME/Downloads/relembra-cloudflare"
cd "$REPO"

[[ -d .git ]] || fail "Execute a partir do clone do repositório GitHub."
[[ -f "$SOURCE/migrations/0004_thought_journal.sql" ]] || fail "A pasta v1.3 não foi encontrada: $SOURCE"
[[ -f "$INSTALLED/wrangler.jsonc" ]] || fail "A configuração da instalação atual não foi encontrada."
[[ -z "$(git status --porcelain)" ]] || fail "Há alterações locais no clone. Revise-as antes de importar."
command -v node >/dev/null || fail "Node.js não encontrado."
command -v npm >/dev/null || fail "npm não encontrado."

echo "[1/4] Copiando apenas o código e a configuração de ligação ao D1..."
for dir in src public migrations tests scripts; do
  mkdir -p "$REPO/$dir"
  cp -a "$SOURCE/$dir/." "$REPO/$dir/"
done
for f in package.json README.md GUIA-DE-ATUALIZACAO.md GUIA-DE-HOSPEDAGEM.md ATUALIZAR-RELEMBRA.sh ATUALIZAR-E-PUBLICAR.sh; do
  cp "$SOURCE/$f" "$REPO/$f"
done
# Usa o UUID real do banco já existente. Não copia segredos, .dev.vars nem backups.
cp "$INSTALLED/wrangler.jsonc" "$REPO/wrangler.jsonc"
grep -Eq '"binding"[[:space:]]*:[[:space:]]*"DB"' wrangler.jsonc || fail "Binding DB ausente."
if grep -q '00000000-0000-0000-0000-000000000000' wrangler.jsonc; then
  fail "O UUID do D1 ainda está como exemplo."
fi

echo "[2/4] Instalando dependências e testando..."
npm install
npm test

echo "[3/4] Arquivos que serão enviados:"
git status --short
echo
echo "O envio ao GitHub inicia testes, mas NÃO publica esta versão no Cloudflare."
read -r -p "Confirmar envio da v1.3 ao repositório privado? [s/N] " confirm
[[ "$confirm" =~ ^[sSyY]$ ]] || { echo "Cancelado; nada enviado ao GitHub."; exit 0; }

git add src public migrations tests scripts package.json package-lock.json wrangler.jsonc \
  README.md GUIA-DE-ATUALIZACAO.md GUIA-DE-HOSPEDAGEM.md \
  ATUALIZAR-RELEMBRA.sh ATUALIZAR-E-PUBLICAR.sh
if ! git diff --cached --quiet; then
  echo "[4/4] Criando commit e enviando ao GitHub..."
  git commit -m "feat: importar Relembra v1.3 com diario e testes"
  git push origin main
else
  echo "Nenhuma mudança para enviar."
fi

echo
echo "✅ Código v1.3 enviado. A versão em produção NÃO foi alterada."
echo "Verifique os testes em: https://github.com/wesleiaqui/relembra-cloudflare/actions"
