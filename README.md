# Relembra v1.3 ✧ — vídeos e diário de pensamentos

Biblioteca pessoal de vídeos com categorias, transcrições, screenshots, várias fichas para um mesmo link e chat apoiado no conteúdo salvo. Agora inclui **Diário de pensamentos**: um exercício de escrita para observar pensamentos automáticos e buscar alternativas mais realistas.

## O que muda na v1.3

- **Diário de pensamentos independente dos vídeos**: situação, emoção, intensidade inicial (0–10), pensamento automático, evidências a favor/contra, interpretação equilibrada, ação pequena e intensidade final opcional.
- **Sugerir âncora com IA**: botão opcional que envia os campos preenchidos ao Workers AI; nunca substitui sua escrita sem você escolher usar a sugestão.
- **Privacidade**: só usuários autenticados têm acesso aos registros; o diário não entra no contexto de busca dos vídeos nem é enviado automaticamente à IA.
- **Backup JSON**: inclui as reflexões, além dos vídeos; a restauração evita repetir IDs. Como são dados pessoais, guarde o arquivo em lugar seguro.
- **Migração aditiva** `0004_thought_journal.sql`: não modifica os vídeos, FTS ou screenshots.
- **Atualizador de um comando** `ATUALIZAR-E-PUBLICAR.sh`: testa, registra bookmark de Time Travel no D1, pede confirmação do backup JSON, salva o código antigo, atualiza, aplica a migração e publica. Preserva o `wrangler.jsonc` e o segredo `APP_PASSWORD` do Worker.
- **GitHub Actions opcional** em `.github/workflows/publicar.yml`: deploy automático após `git push` em `main` (requer token e conexão configurados).

## Atualização para quem já usa a v1.2 na Cloudflare

1. No Relembra online, abra **Backup e dados → Baixar backup** (recomendado antes da migração).
2. Extraia o ZIP `relembra-cloudflare-v1.3.zip` dentro de `~/Downloads`.
3. Na pasta da versão nova, execute:

```bash
cd ~/Downloads/relembra-cloudflare-v1.3
bash ATUALIZAR-E-PUBLICAR.sh ~/Downloads/relembra-cloudflare
```

Acompanhe as mensagens e confirme o backup JSON quando o script perguntar. No fim, atualize a página do site com `Ctrl + Shift + R`.

**Não use `sudo npm` nem `sudo npx wrangler`.** O script nunca pede sua senha do Relembra e nunca tenta restaurar o banco por conta própria.

Veja `GUIA-DE-ATUALIZACAO.md` para troubleshooting e configuração opcional do GitHub Actions.

## Primeira instalação

Para instalação nova, utilize `GUIA-DE-HOSPEDAGEM.md`. A base atual inclui quatro migrações (`0001`–`0004`).

## Desenvolvimento

```bash
npm install
npm test
npm run db:local
npm run dev
```

O backend fica em `src/worker.js`; a interface em `public/`; migrações em `migrations/`; testes em `tests/`. Use Node.js 22+.

### Limitações importantes

- Não baixa vídeos nem transcreve automaticamente links do Instagram.
- A IA visual pode não reconhecer detalhes não legíveis no screenshot.
- O diário não é um tratamento de saúde nem substitui atendimento profissional.
- O JSON do backup **não** contém arquivos de screenshot em binário; D1 Time Travel também não é uma cópia offline independente.
- **Não consigo publicar remotamente na sua conta sem acesso autorizado à conta/repositório**: o script só roda no seu computador, e o GitHub Actions somente depois de configurado pelo proprietário.
