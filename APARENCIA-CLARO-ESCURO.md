# Relembra v1.16 — Aparência: interface e cores independentes

A antiga opção **Lume** era principalmente o Clássico com cores claras. Agora ela virou oficialmente **Clássico → Claro**. O seletor do cabeçalho possui dois controles independentes:

- **Interface:** Clássico / ✦ Atlas
- **Cores:** ☀ Claro / ☾ Escuro

São quatro combinações: Clássico Escuro (visual original), Clássico Claro (antigo Lume), Atlas Claro e Atlas Escuro.

## Barra lateral e finanças

A lateral do Atlas agora acompanha o modo de cor: fundo **claro** no modo Claro e fundo **escuro** no modo Escuro. O cabeçalho, cartões, área de pesquisa, Chat e componentes pessoais acompanham as cores. O painel financeiro preserva cálculos e dados, mas recebe estilos escuros para tabelas, formulários e cartões quando a pessoa escolhe Escuro. O Clássico também mantém a lateral e o cabeçalho escuros ao abrir Finanças no modo Escuro.

## Preferências existentes

- Quem tinha o tema `lume` selecionado verá automaticamente **Clássico Claro**. Nenhum dado é apagado ou sobrescrito.
- Quem usava `classic` permanece **Clássico Escuro**, exceto se já alterou a nova preferência.
- Quem usava `atlas` permanece **Atlas Claro** por padrão, agora com lateral também clara.
- A cor do **Clássico** e do **Atlas** é lembrada **separadamente**. Por exemplo, escolher Clássico Escuro e Atlas Claro mantém essa combinação mesmo ao alternar.
- Toda a preferência fica somente no `localStorage` do dispositivo. Nada é enviado ao servidor, e nenhuma alteração D1 é necessária.
- Caso o navegador bloqueie armazenamento, a alternância funciona durante a sessão, usando valores padrão ao recarregar.
- Se uma outra aba mudar a aparência, os controles sincronizam automaticamente.

## Arquivos

- `public/visual-theme.js`: estado, migração, sincronização e controles.
- `public/visual-lume.css`: regras do antigo Lume, aplicadas somente ao Clássico Claro.
- `public/appearance-modes.css`: controles, Atlas claro/escuro e acabamento do financeiro escuro, carregado depois das folhas existentes.
- `public/home-workspace.css`: a homepage clara agora se aplica ao Clássico Claro (antigo Lume).

## Validação

1. Rodar `npm test`.
2. Abrir as quatro combinações de aparência e testar a lateral no Início, Biblioteca, Chat, Radar, Calendário da vida e Finanças.
3. Conferir menu lateral no celular, modais de pagamentos e inputs de data sob Claro/Escuro.
4. Confirmar que a escolha permanece após recarregar e que Lume migra corretamente para Clássico Claro.
5. Não publicar em produção sem testes de navegador. O deploy continua **manual** pelo workflow `.github/workflows/publicar.yml` na `main`.
