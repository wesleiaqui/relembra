# Auditoria técnica e de segurança — Relembra

Data: 15/10/2026 · Escopo: revisão estática de código do Worker Cloudflare, frontend, APIs do Canvas, D1, Finanças, Companion, autenticação e pipeline GitHub Actions. **Não é teste de intrusão em produção nem certificação de invulnerabilidade.**

## Resumo de problemas encontrados e correções

| Prioridade | Problema | Evidência | Situação |
|---|---|---|---|
| Funcional alta | Conexões de cartões formam laços e contornos exagerados | `public/canvas.js`, antiga `canvasCurve()`: segundo ponto de controle seguia além do destino em vez de vir da direção oposta; portas podiam alternar eixo | **Corrigido**: `canvasConnectionRoute` escolhe bordas que se encaram, `canvasCurve` limita controles ao intervalo entre origem e destino. Testes vertical, horizontal, invertido, diagonal e sobreposição |
| Segurança alta (custo/abuso) | IA do Chat, sugestões de reflexões e análise de capturas sem cota própria | `src/worker.js`, chamadas `env.AI.run` dessas funcionalidades | **Corrigido**: limites D1 atômicos por usuário e operação: Chat com IA 45/h, sugestões 12/h, imagens 10/h, mapas com IA 6/h. A pesquisa sem IA continua disponível |
| Segurança média | Falta de política centralizada para scripts, enquadramento, tipo MIME e permissões | Worker respondia ativos por `env.ASSETS.fetch()` sem endurecer cabeçalhos | **Corrigido**: Content-Security-Policy, frame-ancestors none, X-Frame-Options DENY, nosniff, Referrer-Policy, CORP e Permissions-Policy; CSP permite os players conhecidos e as fontes já usadas |
| Segurança média | Requisições `Transfer-Encoding: chunked` podiam exceder limites de JSON antes da verificação por `request.text()` | `src/worker.js`, `src/canvas.js`, `src/finance.js`, `src/companion.js` | **Corrigido**: leitor incremental com contador em **bytes**, cancelamento após o limite e validação de objeto JSON |
| Confiabilidade média | Salvamento automático fazia novas tentativas sem limite em caso de validação ou API permanentemente indisponível | `public/canvas.js` `saveNow()` | **Corrigido**: no máximo três novas tentativas automáticas para falhas transitórias, espera progressiva; erros permanentes pedem intervenção; resposta antiga não modifica outro mapa |
| Cadeia de suprimentos média | GitHub Actions instalava pacotes por `npm install` apesar de possuir lockfile | `.github/workflows/publicar.yml` | **Corrigido**: instalação reproduzível com `npm ci` e atualização automática via Dependabot |

## Verificações com resultado positivo

- **Sessão e CSRF:** cookie `HttpOnly`, `SameSite=Strict`, flag `Secure` sob HTTPS, assinatura HMAC e prazo de validade. O Worker compara `Origin` e bloqueia `Sec-Fetch-Site: cross-site`.
- **Dados de cada conta:** as consultas verificadas do Canvas, vídeos, Radar, Finanças, reflexões e lembretes usam `owner_id`; IDs enviados pelo cliente não substituem a identidade da sessão.
- **SQL:** parâmetros de entrada em consultas e inserções passam por `.bind(...)`; nomes de tabelas construídos em rotas específicas vêm de listas estáticas.
- **Canvas:** validador impede IDs e ligações duplicadas, URLs não HTTP(S), posição não finita, mais de 250 cartões, mais de 400 ligações e payload excessivo; limite de 40 mapas por usuário; controle de revisão evita sobrescrever silenciosamente alterações concorrentes.
- **Vídeos:** vínculo do mapa verifica que `video_id` pertence ao mesmo usuário também no fluxo de importação. Uploads de imagens validam tipo e assinatura e têm limite de tamanho; importação remota restringe hosts e desabilita redirecionamentos automáticos.
- **Privacidade do visitante:** amostras de mapas, calendários, vídeos e finanças usam dados fictícios locais; acesso às rotas de usuário continua protegido no backend.
- **Backup:** consulta/restore condicionados à sessão, vínculos de tarefas limitados ao mesmo `owner_id`, e o fluxo de publicação exige disparo manual, com bookmark D1 antes de migrações.

## Riscos remanescentes e trabalhos recomendados

1. **Proteção de contas (médio):** cadastro público limitado por IP, mas não há CAPTCHA/desafio adaptativo nem verificação de email. O fluxo de login verifica tentativas antes do cálculo de senha; tráfego simultâneo muito intenso pode passar a verificação de limite antes da atualização. Considerar Cloudflare WAF/Turnstile e uma reserva atômica de tentativas no login.
2. **Segredo compartilhado (médio):** `APP_PASSWORD` sustenta a assinatura de sessões e a recuperação administrativa; a exposição desse segredo afeta ambos. Separar chaves de assinatura, recovery e geração de tokens em futuras versões exige migração e planejamento.
3. **Revogação de sessão (médio):** `logout` remove o cookie do navegador, mas não revoga individualmente um token copiado. Implementar identificadores de sessão persistentes, revogação por dispositivo e opção “sair de todos os dispositivos”.
4. **Operações de lote (médio):** restauração de backup pode ter êxito parcial ao importar entidades; melhorar pré-validação, relatório por item e recuperação/rollback. Preservar backup JSON externo antes de operações de massa.
5. **Interface e desempenho (médio):** redimensionamento de grupos e renderização de centenas de conexões devem ser ensaiados com navegador real e celular. Testes Node não medem fluidez, acessibilidade total ou qualidade visual.
6. **Política de scripts (baixo/médio):** `style-src 'unsafe-inline'` permanece para suportar posicionamento de cartões por CSS inline. Manter `script-src 'self'`, sanitização de HTML e atenção a bibliotecas futuras.
7. **Auditoria externa (pendente):** conferir alertas de dependência no GitHub, executar `npm audit` em ambiente com rede, verificar cabeçalhos e proteção na URL publicada e realizar ensaio autorizado multiusuário com navegador. A revisão atual não reproduz um teste de invasão ou varredura externa real.
8. **Deploy e permissões (médio):** proteger a branch `main`, exigir revisão/CI, restringir permissões do token Cloudflare e proteger o ambiente `producao`. Avaliar fixação de ações GitHub por SHA (atualmente tags `@v4`).

## Testes automatizados

- Geometria: cima/baixo, lados, orientação invertida, diagonal, sobreposição e deslocamento.
- Segurança: CSP/cabeçalhos em respostas estáticas e APIs, corpo JSON fracionado sem `Content-Length`, limite por operação e usuário, isolamento multiusuário já coberto nos testes existentes.
- Confiabilidade: revisão otimista, vínculos Radar, importação e exportação e validação dos mapas já cobertos na suíte.

**Limitação:** nenhum teste automatizado substitui uma auditoria independente no domínio já publicado. Publicação no Cloudflare continua manual após aprovação dos testes.
