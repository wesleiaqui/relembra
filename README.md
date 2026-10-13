# Relembra — biblioteca pessoal de vídeos

Repositório privado do aplicativo **Relembra** hospedado no Cloudflare Workers, com D1 e Workers AI.

**Status:** aguardando a primeira importação do código-fonte da v1.3.

## Publicação segura

- Todo push em `main` executará testes automaticamente após o código ser importado.
- A publicação em Cloudflare será iniciada manualmente em **Actions → Publicar Relembra → Run workflow**, com credenciais seguras do GitHub.
- Nunca envie `.dev.vars`, `.env`, `APP_PASSWORD`, tokens, backups JSON/SQL ou conteúdo privado para este repositório.
- O banco D1 já existe no Cloudflare e **não deve ser recriado**.

Configure os secrets `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` em **Settings → Secrets and variables → Actions** antes de executar a publicação.

A importação inicial do código será feita a partir do pacote local `relembra-cloudflare-v1.3`.
