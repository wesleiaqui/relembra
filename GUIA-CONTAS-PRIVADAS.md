# Relembra v1.9 — Guia de ativação das contas privadas

> **Atenção:** Esta atualização modifica a autenticação. Não publique sem preservar um backup JSON recente e o ponto de recuperação do D1.

## O que muda
- Cada pessoa tem **nome de usuário, senha, categorias, vídeos, imagens, chat, dicas e reflexões próprios**.
- Somente o proprietário pode gerar códigos de convite, válidos por 24 horas e usados uma vez.
- Não há cadastro público sem convite, nem envio de e-mail.
- A senha do proprietário pode ser redefinida com a chave administrativa `APP_PASSWORD` configurada na Cloudflare.

## 1. Backup ANTES de ativar
No Relembra atual: **Backup e dados → Baixar backup JSON**. Guarde em local seguro.
O JSON **não inclui os bytes dos screenshots**. Para esses arquivos, use o **D1 Time Travel** como ponto de recuperação adicional.
Exemplo:

```bash
cd ~/Downloads/relembra-cloudflare
npx wrangler d1 time-travel info relembra-db
```

Guarde o bookmark completo. **Não execute restore** agora. O Time Travel é temporário e não substitui uma cópia independente.

## 2. Se você esqueceu APP_PASSWORD
Você NÃO precisa saber a senha anterior.

```bash
cd ~/Downloads/relembra-cloudflare
npx wrangler secret put APP_PASSWORD
```

Digite uma **nova chave administrativa longa e aleatória**. O valor não aparece no terminal.
O Wrangler atualizará o segredo remoto e invalidará as sessões anteriores, sem apagar o D1.
Nunca coloque essa chave em arquivos do repositório, screenshots ou mensagens.
Ela é **diferente da nova senha pessoal que você vai criar para entrar no Relembra**.

## 3. Publicação manual v1.9
Confira os testes no PR e na branch main. Depois:
1. Abra **GitHub → Actions → Relembra - testes e publicação**.
2. **Run workflow**, confirme e execute.
3. Certifique-se de que as etapas de migração e deploy terminaram em **Success**.
4. Recarregue o Relembra com Ctrl+Shift+R.

A migração SQL `0006_private_accounts.sql` adiciona tabelas e colunas `owner_id`. Ela **não apaga** as fichas anteriores.

## 4. Criar sua conta principal
Na primeira visita após a publicação, a tela oferece:
- **Chave administrativa** — valor atual de `APP_PASSWORD`, que você mesmo definiu no Cloudflare.
- **Usuário** — nome desejado (3 a 32 caracteres, sem espaços).
- **Senha pessoal** — crie outra senha (mínimo 12 caracteres).

Ao confirmar, as categorias, os vídeos, screenshots, reflexões e dicas antigos serão vinculados a essa conta. Isso é feito uma única vez.
Se você não lembrar a chave administrativa, volte ao passo 2.

## 5. Convidar outra pessoa
Depois do seu login como administrador:
- Selecione **Convidar outra pessoa**.
- Clique **Gerar código de convite**.
- Envie o código à pessoa por um canal seguro. É válido por **24 horas** e apenas **uma vez**.
- Ela abre o mesmo site, clica **Tenho um convite** e cria seu usuário e senha.
- Seus conteúdos **não aparecerão** na biblioteca dela, e vice-versa.

## 6. Esqueci a senha pessoal
No login, clique **Esqueci minha senha**, informe `APP_PASSWORD` e escolha uma nova senha pessoal da conta principal.
Se esqueceu também `APP_PASSWORD`, execute o comando do passo 2 antes.
A recuperação da conta principal **invalida todas as sessões antigas** dessa conta.
A recuperação automática por e-mail não foi implementada, e contas convidadas não possuem fluxo de recuperação próprio nesta versão; guarde as credenciais delas com cuidado.

## Observações de segurança
O APP_PASSWORD é um segredo com poder administrativo: quem o conhece poderá redefinir a conta principal. Ele não deve ser compartilhado com pessoas convidadas.
Não existe acesso direto entre as bibliotecas de usuários pela interface e API. O proprietário da infraestrutura Cloudflare mantém acesso técnico ao banco de dados, como qualquer operador do servidor.
