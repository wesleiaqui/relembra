# Relembra 1.13 — Clássico e Lume

Esta atualização **não substitui o visual existente**: ela adiciona uma identidade visual alternativa chamada **Lume**.

## Onde trocar
No cabeçalho, em **Aparência**, clique em **Clássico** (layout escuro que você já utiliza) ou **✦ Novo** (Lume).

- A mudança é imediata: não precisa recarregar a página.
- A escolha é lembrada no **navegador atual** por meio de `localStorage`. Em outro dispositivo ou navegador, o padrão continua **Clássico**.
- Se a preferência estiver ausente, inválida ou o armazenamento local estiver bloqueado, o sistema mantém **Clássico**.
- A troca é apenas de aparência; não altera contas, vídeos, screenshots, pensamentos, dicas, finanças, sessão de login ou informações armazenadas em D1.

## Identidade Lume
- Superfícies claras off-white, lavanda suave e detalhes verde-água; texto em tinta escura e alto contraste.
- Barra lateral mais espaçosa, seleção legível, cabeçalho translúcido e controles claros.
- Biblioteca com cartões maiores, capas ampliadas, títulos e resumos mais legíveis e ações menos compactas.
- Página inicial, Radar, Busca universal, Calendário da vida, Motivação, Dicas, Chat e Configurações com cores coerentes.
- O painel financeiro mantém seus dados e a disposição de tela cheia; apenas elementos de navegação e aparência são harmonizados com o Lume.
- Adaptação para celular, teclado e preferência por movimento reduzido.

## Arquitetura e segurança
O arquivo `public/visual-lume.css` só altera as páginas quando `body[data-visual-theme="lume"]` estiver ativo. A folha original `public/styles.css`, `public/finance.css` e `public/companion.css` não foi reescrita.
A lógica em `public/visual-theme.js` é independente de API: não envia preferências para a Cloudflare.

## Publicação
A mudança não possui migração D1. Execute `npm test` e revise no navegador os dois estilos em desktop/celular (biblioteca, finanças, abrir/fechar editor, login, Radar e Calendário da vida). Publique somente após o workflow manual do GitHub Actions; o merge na `main` não equivale a deploy na Cloudflare.
