# Finanças no Relembra

## Objetivo
Um painel de planejamento com poucos indicadores: saldo confirmado, contas pendentes e valor ainda necessário para cobri-las.

## Como funciona
- **Entradas**: recebimento pontual ou previsto. Somente o status `Confirmado` aumenta o saldo; não exige salário fixo.
- **Gastos avulsos**: compras e despesas não associadas às contas. Somente gastos confirmados diminuem o saldo.
- **Contas**: nome, valor, vencimento, prioridade de 1 a 5 e indicação de essencial.
- **Pagamento de contas**: abra o menu ⋮ da conta e escolha "Registrar pagamento". O Relembra solicita data, valor realmente pago, forma (Pix, débito, crédito, transferência, dinheiro, boleto ou outro), conta/cartão de origem e observações opcionais. É possível editar esses dados ou desfazer o pagamento.
- **Saldo**: pagamentos Pix/débito/transferência/dinheiro/boleto/outros descontam o **valor efetivamente pago**, e não o valor planejado. Pagamento com **cartão de crédito** não reduz o dinheiro disponível nesse momento; registre a fatura quando ela for quitada. Evite lançar a mesma saída duas vezes.
- **Reservas e metas**: objetivo e quanto já foi guardado. São marcadores informativos: não retiram automaticamente dinheiro do saldo.
- **Ordenação**: pendentes primeiro, depois prioridade e vencimento. Vencidas são destacadas.
- **Saldo**: soma global de todas as entradas confirmadas menos gastos avulsos confirmados e contas pagas, sem contar promessas de renda futura.

## Importante ao começar
1. Este módulo inicia vazio; os valores que aparecem nos desenhos de exemplo **não foram importados**.
2. Para refletir dinheiro que já existia antes da adoção do módulo, registre o saldo inicial como uma entrada confirmada na data do início do controle; não registre novamente movimentações que já foram lançadas.
3. Para internet, água, luz e outros gastos fixos, marque **Repetir todos os meses** ao cadastrar uma conta. Uma conta antiga também pode ser transformada em recorrente ao editá-la. As regras são gerenciadas em **Contas fixas**; contas avulsas continuam avulsas.
4. Não há envio automático de notificações por e-mail ou push nesta versão; os alertas de atraso aparecem na tela.
5. Nenhuma informação financeira entra no contexto das perguntas ao chat de vídeos.

## Segurança e dados
Os endpoints `/api/finance` exigem a sessão atual do Relembra e restringem todas as leituras, alterações e exclusões ao `owner_id` autenticado. A versão `relembra-v1.10` do backup JSON inclui `finances.entries`, `finances.bills` e `finances.goals`, e o importador ignora IDs já presentes na conta.

## Publicação
Antes de publicar, use **Backup e dados → Baixar backup**, confirme os testes e aplique a migração `migrations/0009_finances.sql` no mesmo D1 da aplicação. A rotina de publicação pelo workflow manual aplica as migrações antes do deploy. Não publique apenas os arquivos estáticos, pois a nova API precisa da migração do banco.

## Testes
```sh
npm install
npm test
npm run db:local
```

A confirmação em ambiente real precisa ocorrer após a aplicação da migração no ambiente de homologação.

## Atualização de pagamento

A migração aditiva `migrations/0010_bill_payment_details.sql` adiciona dados de pagamento sem apagar contas atuais. Contas já marcadas como pagas continuam pagas, com o valor original preservado e meio de pagamento **não informado**, até serem revisadas. A interface não inventa qual banco/cartão foi usado.

## Contas fixas mensais

- Abra **Minhas finanças → + Nova conta**, preencha o vencimento e marque **Repetir todos os meses**. O primeiro vencimento é salvo como uma conta normal pendente e as próximas competências são geradas automaticamente quando o painel é acessado (até 24 meses de atraso por regra a cada consulta).
- As novas contas são geradas como **pendentes**, uma por mês, mesmo após o pagamento da ocorrência anterior. Não são criadas cópias se o painel for reaberto.
- O dia 29/30/31 é ajustado para o último dia nos meses mais curtos; volta ao dia original nos outros meses.
- Para tornar recorrente uma conta já cadastrada, abra **Editar** e marque **Repetir todos os meses**. O mês original e seus pagamentos são preservados.
- Clique em **↻ Contas fixas** para ajustar nome, valor, dia, prioridade, essencialidade ou para pausar e retomar. Mudanças não alteram contas já geradas; pausar não exclui cobranças antigas.
- Este recurso gera contas quando o Relembra for acessado, não envia push e não executa cobranças bancárias automáticas. O sistema não precisa ficar aberto para lembrar a configuração, mas a materialização das parcelas ocorre ao abrir o painel.
- A migração do banco é `migrations/0011_recurring_monthly_bills.sql`; o backup JSON passa a incluir os modelos de recorrência e seus vínculos.
