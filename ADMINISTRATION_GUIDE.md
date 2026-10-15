# Administração do Relembra (somente proprietário)

A área **Administração** aparece na navegação apenas para quem tiver a função de proprietário (owner), depois da autenticação. As rotas administrativas exigem sessão validada pelo Worker e a permissão de proprietário no servidor.

## Funcionalidades
- **Usuários**: nome de usuário, cadastro, último login e atividade aproximada. Paginação de 25 contas e busca.
- **Atividade recente**: último heartbeat ou login nos 10 minutos anteriores. Não é garantia de conexão online; abas suspensas e bloqueios de rede podem causar diferenças. O navegador envia heartbeat a cada 3 minutos quando visível, com gravação limitada no D1.
- **Painéis somente leitura**: visão geral, biblioteca, finanças, Radar, mapas mentais e anotações. Cada lista mostra um número limitado de registros recentes. Não existem ações de alteração, remoção ou importação em nome de terceiros.
- **Auditoria**: cada abertura de seção gera registro com administrador, membro, seção e data/hora. Senhas, cookies, tokens e IPs não aparecem nas respostas nem no registro.
- **Transparência**: cada membro consulta datas e seções de acesso administrativo em Backup e dados. O texto de cadastro informa essa possibilidade.

## Controles de segurança
A sessão do administrador nunca assume o identificador de outro usuário. As rotas usam API separada e somente métodos GET para a área administrativa, com filtragem por usuário nas consultas ao banco. Contas de membro recebem HTTP 403 nas rotas administrativas, inclusive se digitarem os endereços diretamente.

O recurso necessita da migração **migrations/0014_admin_observability.sql** antes da publicação; o workflow de publicação padrão aplica migrações D1 pendentes. Ela adiciona dois campos opcionais a usuários e uma tabela de auditoria, sem remover conteúdo existente.

## Limitações e recomendações
- É uma visão administrativa dos dados, não uma cópia integral e interativa das páginas de outra conta.
- Atividade recente não confirma que a pessoa está online naquele instante.
- Não permite excluir, bloquear, suspender ou editar contas nesta versão.
- Para uso público: publicar uma Política de Privacidade com finalidades de acesso administrativo, restringir a permissão de proprietário, estabelecer retenção de registros e avaliar obrigações aplicáveis, incluindo a LGPD.
- Os dados visualizados não são copiados para o histórico; apenas os metadados de cada consulta são registrados.

## Testar
1. Entrar como proprietário: a opção Administração aparece. Entrar como membro: ela desaparece e o endpoint retorna 403.
2. Salvar um vídeo e tarefa numa conta membro. Entrar como dono, abrir seu resumo e verificar que é somente leitura.
3. Abrir Finanças, confirmar a seção correspondente no histórico.
4. Voltar à conta membro e consultar os registros de acesso em Backup e dados.
5. Conferir atividade após login e após dez minutos sem heartbeat.
