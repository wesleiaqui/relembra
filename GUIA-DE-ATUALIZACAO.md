# Guia de atualização: Relembra v1.2 → v1.3

## Atualização fácil (Bazzite)

1. Entre no aplicativo publicado, vá em **Backup e dados** e clique em **Baixar backup**. Guarde o JSON fora da pasta de Downloads se possível. Ele traz os textos, **mas não os binários das imagens**.
2. Baixe e extraia `relembra-cloudflare-v1.3.zip` em `~/Downloads`.
3. Execute **um único comando**:

```bash
cd ~/Downloads/relembra-cloudflare-v1.3
bash ATUALIZAR-E-PUBLICAR.sh ~/Downloads/relembra-cloudflare
```

O script irá: (1) rodar os testes, (2) consultar o **bookmark remoto D1 Time Travel**, (3) confirmar que você tem o JSON, (4) copiar a versão antiga para `.backup-codigo-...`, (5) aplicar os novos arquivos mantendo seu `wrangler.jsonc` e o segredo `APP_PASSWORD`, (6) executar migrações e publicar. O link `.workers.dev` não muda.

**Atenção:** o bookmark do Time Travel serve para recuperação por tempo limitado e **não é um backup SQL independente**. O D1 não exporta bancos com FTS5 via `wrangler d1 export`. No plano Free, a retenção do Time Travel é de até 7 dias. Nunca execute `time-travel restore` sem avaliar quais dados novos seriam perdidos.

A migração `0004_thought_journal.sql` só cria uma tabela nova e um índice. O diário não usa nem modifica a tabela de vídeos.

Se o script falhar, **não tente rodar tudo com `sudo`**. Envie o erro do terminal; o deploy não deve ocorrer se os testes ou a migração falharem.

## Publicação automática no futuro (opcional, GitHub)

Se você quiser não precisar abrir o terminal para publicar novas versões:

1. Crie um repositório **privado** no GitHub para o código-fonte do Relembra. Antes de publicar, ajuste `wrangler.jsonc` para o Worker e o UUID D1 da sua conta. Esses IDs não são senhas, mas não publique arquivos `.dev.vars`, cookies, backups ou chaves.
2. No painel Cloudflare, crie um **API Token de permissões mínimas** para deploy de Workers e migrações D1, restrito à sua conta. Use o guia oficial: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/
3. No GitHub: **Settings → Secrets and variables → Actions → New repository secret**. Cadastre `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID`. **Nunca envie os tokens pelo chat nem os adicione ao código.**
4. A automação `.github/workflows/publicar.yml` foi incluída. Depois de um `git push` para `main`, ela instala dependências, testa, guarda um bookmark do D1 nos artefatos da execução, migra o banco e publica.

Isso atualiza o Worker **automaticamente quando o repositório recebe código novo**; não significa que o ChatGPT tem acesso permanente ao seu PC, à Cloudflare ou ao GitHub, nem que novas versões serão instaladas sozinhas sem ninguém enviar o novo código ao repositório. Como as migrações de produção são automáticas nesse fluxo, só coloque código testado em `main`.

## Diagnósticos

```bash
cd ~/Downloads/relembra-cloudflare
npm test
npx wrangler d1 migrations list DB --remote
npx wrangler d1 time-travel info DB
```

Para teste local: `npm run db:local` e `npm run dev`. A senha local vem de `.dev.vars`. Não compartilhe os arquivos de backup, pois o diário pode conter conteúdo pessoal.
