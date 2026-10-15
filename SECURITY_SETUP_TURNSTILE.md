# Ativar proteção do cadastro — Relembra

Este recurso é opcional até configurar as duas chaves no Cloudflare. **O cadastro não é bloqueado por padrão.** Se apenas uma das chaves estiver presente, a API desativa novos cadastros de forma segura (503) para evitar proteção aparente que não verifica tokens.

## Ativação (sem colocar segredo no GitHub)

1. No painel Cloudflare, abra **Turnstile → Add widget** e permita o hostname \`relembra.weslleys.com\` (e outros domínios efetivamente utilizados, se necessário). Escolha modo Managed. O widget gerará **Site Key** e **Secret Key**.
2. Em **Workers & Pages → relembra-videos → Settings → Variables and Secrets**, adicione:
   - \`TURNSTILE_SITE_KEY\`: chave pública do widget.
   - \`TURNSTILE_SECRET\`: chave privada do widget, tipo **Secret** (não escreva a chave no repositório, tickets, prints ou chat).
3. Confira se ambas estão no **ambiente de produção**. Publique a versão do Worker que inclui esta integração.
4. Abra a página de cadastro de \`https://relembra.weslleys.com\` em janela anônima. O formulário exibirá o Turnstile e somente aceitará a criação de conta depois que o backend validar o token.
5. Teste também: falta de token (403), expiração (pedir novo desafio), hostname errado (403), login de conta preexistente (continua funcionando), e modo visitante (continua livre).

**Validação no backend:** a API consulta \`https://challenges.cloudflare.com/turnstile/v0/siteverify\`, verifica \`success\`, \`action=register\` e o domínio correspondente ao hostname da requisição. Tokens são de uso único e expiram. O widget cliente é resetado após falhas.

**Não é necessário publicar chaves na configuração do Wrangler.** Se utilizar Wrangler para administrar segredos, forneça a chave através de entrada interativa (ex.: \`npx wrangler secret put TURNSTILE_SECRET\`), nunca na linha de comando.

## Sair de todos os dispositivos

Depois de entrar, vá a **Backup e dados → Segurança da conta → Sair de todos os dispositivos**. A ação incrementa \`session_version\` no D1 e invalida todos os cookies de sessão dessa conta (inclusive os copiados). O usuário deve fazer login novamente. Não remove vídeos, mapas ou finanças.

## Limites atuais e recomendações

- O endpoint de login usa reserva atômica D1 antes do PBKDF2; permite até 8 tentativas no intervalo de 15 minutos por origem IP. Um login bem-sucedido zera a cota.
- Novos cadastros continuam limitados a 5 tentativas por hora por IP, além do Turnstile quando ativado.
- Em caso de abuso, configure regras de proteção no Cloudflare WAF e monitore métricas do Turnstile. **Ainda não há verificação de email**, e isso não é substituído pelo Turnstile.
- O mecanismo \`Sair de todos os dispositivos\` não lista sessões individuais; um painel com sessão por dispositivo e revogação seletiva exige migração adicional e consentimento sobre quais metadados registrar.
- A política de segurança do navegador autoriza o iframe oficial do Instagram no exemplo do visitante e o widget do Turnstile. Players do Instagram podem ser indisponibilizados pelo próprio serviço; neste caso é oferecido o link direto fornecido pelo usuário.

## Validar a interface Atlas claro

O CSS original do Atlas incluía explicitamente \`#f5f4f0\` nas Finanças, sobrepondo temas claros posteriores. Esse tom foi substituído em \`public/visual-atlas.css\` e reforçado por uma regra final em \`public/atlas-light-parity.css\`. Em Finanças, a cor correta do fundo passa a ser \`#f8fafb\`, igual ao Clássico; nas demais páginas, \`#f7f8fc\`. Verifique após publicar e atualizar com **Ctrl + Shift + R**.
