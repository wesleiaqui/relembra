> **Atualizado para v1.3:** se você já usa a v1.2, **não refaça a instalação**. Siga `GUIA-DE-ATUALIZACAO.md`. Para instalação nova, as migrações incluem `0004_thought_journal.sql` e a interface inclui o Diário de Pensamentos.

# Relembra v1.1 — como instalar no Cloudflare (grátis)

Este projeto inclui site, API e banco de dados em **um único Cloudflare Worker**. É uma biblioteca **pessoal**, protegida por senha. Você não precisa deixar o computador ligado depois de publicar.

## 0. O que você precisa

- Conta gratuita em <https://dash.cloudflare.com/sign-up>
- Terminal do seu computador com **Node.js 20.0 ou superior** e `npm` (recomendado Node.js 22)
- Baixar/extrair a pasta deste ZIP (preserve subpastas)
- Você **não** precisa comprar domínio, servidor VPS, serviço de banco de dados ou chave de OpenAI.

No Bazzite, abra o Terminal e confira:

```bash
node --version
npm --version
```

Se o Node não estiver instalado, instale uma versão LTS no seu ambiente de usuário (por exemplo, via `nvm`, `brew` se você já usa Homebrew, ou Distrobox). Não é necessário alterar a imagem imutável do Bazzite.

## 1. Entrar na pasta e instalar a ferramenta de publicação

```bash
cd ~/Downloads/relembra-cloudflare
npm install
```

**Ajuste o caminho** se extraiu o ZIP em outra pasta. Isso instala a ferramenta Wrangler, que só roda no seu computador durante a implantação.

## 2. Conectar sua conta Cloudflare

```bash
npx wrangler login
```

A janela do navegador pedirá autorização. Não envie suas credenciais para ninguém.

## 3. Criar o banco de dados gratuito

```bash
npx wrangler d1 create relembra-db
```

O terminal exibirá um campo chamado `database_id`, com um UUID semelhante a `12345678-1234-1234-1234-123456789abc`. **Copie seu UUID real**.

Configure o UUID no projeto (substitua o exemplo pelo seu):

```bash
npm run configurar:db -- 12345678-1234-1234-1234-123456789abc
```

Alternativa: abra `wrangler.jsonc` e substitua somente `00000000-0000-0000-0000-000000000000` pelo seu `database_id`.

Atenção: o D1 pode oferecer para atualizar o arquivo Wrangler automaticamente. Caso isso aconteça, evite acrescentar **duas bindings** `DB`; o projeto precisa de uma só, com `binding: "DB"`.

## 4. Criar as tabelas

```bash
npm run db:remote
```

Confirme a migração se solicitado. Esse passo cria as categorias, vídeos e índice de busca, depois aplica `0002_visual.sql` para screenshots e descrições visuais. Se aparecerem duas migrações, confirme ambas.

## 5. Definir uma senha privada

```bash
npx wrangler secret put APP_PASSWORD
```

Quando aparecer `Enter a secret value`, digite uma senha exclusiva e longa (idealmente 16+ caracteres). **Ela não deve ser colocada no arquivo `wrangler.jsonc`** e não aparece no site público. Guarde em um gerenciador de senhas. Na maioria dos terminais, os caracteres não são mostrados ao digitar.

## 6. Publicar o aplicativo

```bash
npm run deploy
```

No terminal aparecerá um endereço parecido com:

`https://relembra-videos.<seu-subdominio>.workers.dev`

Abra no navegador e entre com a senha definida no passo 5. Pronto: o site poderá ser acessado pelo celular e pelo computador, sem PC ligado.

Se o Cloudflare pedir para habilitar o domínio `workers.dev`, conclua essa etapa gratuita no painel.

## 7. Como usar

1. Clique em **Adicionar vídeo**.
2. Cole o link do Instagram, TikTok, YouTube ou outro site.
3. Informe **título** e **categoria**.
4. Envie o arquivo de vídeo ou áudio ao ChatGPT em uma conversa, se o formato puder ser analisado, e peça uma **transcrição e um resumo**. Cole o resultado no formulário do Relembra.
5. Salve. Na aba **Chat inteligente**, pergunte, por exemplo: `Qual é a receita que usa leite e parmesão?`.
6. Também pode anexar uma imagem ou screenshot à ficha e clicar **Analisar imagem com IA** após salvar. O resultado vai para o índice de busca.
7. Clique nas fontes da resposta para editar a ficha do vídeo e abrir o conteúdo original.

O Relembra **não baixa nem hospeda os vídeos originais** do Instagram. Ele pode guardar screenshots compactados (450 KB por imagem) no D1. A IA de visão exige aceitação prévia da licença Meta conforme `GUIA-DE-ATUALIZACAO.md`. Ele salva links, transcrições, anotações e metadados. Se um post for removido, você ainda terá o texto salvo, mas o vídeo original poderá não abrir.

## 8. Testar no computador antes de publicar (opcional)

Crie seu arquivo de senha de desenvolvimento:

```bash
cp .dev.vars.example .dev.vars
```

Edite `.dev.vars`, defina sua senha, depois:

```bash
npm run db:local
npm run dev
```

Abra `http://localhost:8787` no navegador. O banco local de testes fica isolado do D1 online. **Nunca envie o arquivo `.dev.vars` para GitHub ou outras pessoas**.

## 9. Atualizar o aplicativo depois

No diretório do projeto, depois de modificar arquivos:

```bash
npm run deploy
```

Se houver **novas migrações** de banco de dados (arquivos SQL na pasta `migrations`), rode `npm run db:remote` antes da publicação.

## 10. Backup e restauração

Na área **Backup e dados**, clique em **Baixar backup**. Um arquivo JSON conterá links, títulos, categorias, anotações e transcrições. Guarde-o em local seguro, pois esses dados podem ser pessoais.

Para restaurar, use **Escolher arquivo JSON**. Duplicatas por URL são ignoradas. A interface divide automaticamente a importação em lotes de até 200 vídeos ou ~3 MB por envio. Arquivos locais de backup de até 25 MB são aceitos pela interface; para mais que isso, divida o backup.

**Importante:** backups maiores podem levar mais tempo para exportar; não é um backup automático. Faça exportações regulares.

## 11. Custos e limites

- **Workers Free**: hospeda o site e a API sem cobrança obrigatória, até os limites de uso e requisições.
- **D1 Free**: banco gratuito para transcrições, links, anotações e busca. Existem limites de armazenamento e consultas; o limite por banco gratuito é de 500 MB.
- **Workers AI Free**: tem franquia gratuita diária de IA. Se esgotar a franquia, o chat continua encontrando vídeos por texto, mas pode deixar de gerar respostas narrativas até a quota ser renovada.
- O aplicativo **não usa R2**. Os screenshots compactados usam a capacidade D1 (500 MB por banco no plano gratuito). Não exige ativar armazenamento de objetos nem comprar VPS; fique atento aos limites de armazenamento e processamento de IA.

Consulte a documentação atual: <https://developers.cloudflare.com/workers/>, <https://developers.cloudflare.com/d1/> e <https://developers.cloudflare.com/workers-ai/>.

## Problemas comuns

**`database_id` inválido:** execute `npm run configurar:db -- SEU_UUID`, com o ID real do banco recém-criado.

**`no such table: videos`:** execute `npm run db:remote` na mesma conta usada no deploy.

**`Configure APP_PASSWORD e o banco D1`:** execute `npx wrangler secret put APP_PASSWORD`, confira o banco no `wrangler.jsonc` e publique novamente.

**Erro 401:** digite novamente a senha; se você a alterou, a sessão antiga será invalidada.

**Chat não responde com texto gerado:** confira o painel Workers AI; a quota diária pode ter sido atingida. A busca por texto continua funcionando.

**Instagram não aparece na capa:** isso é esperado; o aplicativo não extrai miniaturas automaticamente de páginas que bloqueiam acesso. Agora você pode anexar um screenshot na edição e usá-lo como capa.

**Não encontra o vídeo:** cole um resumo ou transcrição, ou anexe e analise um screenshot. A busca textual usa FTS5, tolera acentos, mas não é um sistema de embeddings semânticos. No chat, a IA interpreta apenas os vídeos que a busca textual encontrou.

## Segurança

Esta é uma biblioteca **para uma pessoa**, com uma senha única. O backend verifica o login, usa cookie HTTP-only com expiração e impede chamadas vindas de outras origens pelo navegador. A senha fica como `secret` da Cloudflare, não no código. O login possui limite de tentativas por IP.

Não publique a sua senha, o arquivo `.dev.vars` ou backups. Se desejar compartilhar o app com várias contas individuais no futuro, será necessário adicionar autenticação multiusuário e controle de permissões.
