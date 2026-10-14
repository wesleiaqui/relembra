# Relembra 1.12 — Radar, Calendário da vida, Busca e Segurança

## Dependência: contas recorrentes
Esta PR foi construída sobre a **PR #13** `feat/finance-recurring-monthly-bills`. A PR #13 deve ser revisada e mesclada antes desta implementação. A migração `0012_companion.sql` exige as tabelas criadas até `0011_recurring_monthly_bills.sql`. **Não publicar um branch diretamente em produção.**

## Radar do dia
- Prioriza tarefas próximas, contas pendentes nos próximos 14 dias, dicas favoritadas e momentos anotados para hoje.
- Oferece criação e conclusão de tarefas. **Não executa pagamentos**, não informa que renda prevista já entrou e não substitui os lançamentos financeiros.
- Contas recorrentes são geradas pelas regras do painel de finanças conforme o mês é consultado; a lista do radar só inclui cobranças que já estão no banco.

## Busca universal
- Consulta vídeos/transcrições, dicas, tarefas, momentos e reflexões antigas, **somente da conta conectada**.
- O checkbox **Incluir meus dados financeiros** é opt-in, desmarcado por padrão. O chat de vídeos permanece separado dos dados financeiros.
- Texto pode ser encontrado por partes; a interface não executa HTML nem código contido em uma nota.

## Calendário da vida
- Substitui **apenas a navegação principal** do diário. Os pensamentos antigos permanecem salvos e acessíveis pelo botão `Abrir diário anterior`.
- Após escolher data de nascimento e **idade de referência** (1 a 120 anos), mostra semanas vividas, semana atual, momentos anotados e semanas até a referência visual.
- **Importante:** a idade de referência é escolhida pela pessoa. Os dias até essa referência **não** estimam quando a pessoa morrerá.
- Permite guardar um momento bom, uma conquista ou uma reflexão e editar ou apagar depois.
- A data de nascimento e os registros ficam somente na conta autenticada.

## Motivação
- Checklist de 4 hábitos iniciais. A pessoa pode adicionar outros, desmarcar e excluir hábitos; não há recompensas, comparações nem exigência de sequência de dias.
- O Relembra guarda as marcações diárias por usuário. Excluir um hábito também exclui as suas marcações.
- A primeira configuração só acontece uma vez: hábitos deliberadamente removidos **não reaparecem**.

## Segurança, histórico e backups
- **Dois arquivos para recuperar os registros atuais e seus screenshots:** em `Backup e dados`, primeiro use `Baixar backup` para textos, calendários, tarefas, hábitos e finanças; depois `Baixar imagens` para anexos.
- A exportação de imagens consulta até 5 imagens por requisição, respeita owner_id, verifica a conclusão e só então gera o arquivo `relembra-imagens-AAAA-MM-DD.json`. A restauração pula anexos que já estão no destino e vídeos não pertencentes à conta; **não substitui imagens existentes**.
- Guarde os dois arquivos em **armazenamento protegido**: JSON não é criptografado pela aplicação e pode conter dados financeiros, data de nascimento e outros dados sensíveis.
- O histórico dos últimos **30 estados anteriores** é guardado quando uma dica ou vídeo é editado. O botão `Histórico` permite rever e restaurar uma versão; a versão atual também fica arquivada nesse processo.
- **Limite conhecido:** o backup JSON principal não contém o histórico de edições anterior e o backup de imagens tem limite de 5.000 anexos por execução. O D1 Time Travel é uma proteção separada, com janela de retenção limitada. Guarde também backups D1 quando necessário.
- A exclusão definitiva de uma dica ou vídeo **elimina seu histórico** no D1. Screenshots devem ser guardados no backup das imagens, porque o histórico de versões não inclui os binários.
- A importação de um backup não apaga itens atuais e pula IDs existentes; não confunda `backup local` com `D1 Time Travel`, que exige permissões e janela de recuperação próprias.

## Verificação antes de produção
1. Confirme que a PR #13 foi integrada e as migrações até 0011 estão aplicadas.
2. Baixe o backup atual e, se houver, exporte imagens antes de aplicar a nova migração.
3. Execute `npm test`; confira privacidade entre usuários, checklists, importação, busca e restauração de imagens.
4. Teste no navegador a usabilidade da grade de semanas (desktop e celular), os filtros de busca e as alterações de hábitos.
5. Utilize o workflow manual `publicar.yml` na `main` após revisão. O workflow cria um bookmark do D1 e aplica migrações antes do deploy.

**Estado:** PR em rascunho; ainda não foi publicada na Cloudflare.
