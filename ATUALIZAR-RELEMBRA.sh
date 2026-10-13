#!/usr/bin/env bash
# Compatibilidade: o instalador antigo agora encaminha para o fluxo seguro em um comando.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
exec bash "$ROOT/ATUALIZAR-E-PUBLICAR.sh" "${1:-$HOME/Downloads/relembra-cloudflare}"
