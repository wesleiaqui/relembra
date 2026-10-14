# Relembra Atlas — um workspace novo, não só outra paleta

## O que mudou de verdade

A nova identidade **Atlas** reorganiza o aplicativo, em vez de somente trocar cores.

### 1. Página inicial
- Antes: banner, motivação, radar e quatro métricas empilhados.
- **Atlas:** painel editorial em **duas colunas**: à esquerda, sua memória inteligente; à direita, motivação e Radar. Abaixo, itens recentes.
- Os cartões numéricos decorativos ficam ocultos **apenas no Atlas**. A API e as métricas do Clássico/Lume continuam intactas.
- No celular, o layout vira uma coluna sem sobreposição.

### 2. Biblioteca
- Filtros rápidos de **coleções em chips clicáveis** acima da barra de pesquisa.
- Barra de busca e filtros mais compacta.
- Capas maiores (formato 16:10) e cartões com espaçamento editorial.
- Uma única **ação principal** por cartão — Assistir (quando suportado) ou Abrir ficha.
- Menu **•••** concentra Editar, Criar outra informação e Abrir original. São os mesmos comandos já existentes; não há perda de funcionalidade.
- Os três modos de mídia anteriores (Cartões, Galeria, Foco) continuam funcionando.

### 3. Navegação Atlas
- Barra lateral grafite para diferenciar as áreas da página; conteúdo em superfícies claras com texto mais legível.
- Botão de pesquisa rápida no cabeçalho: **Ctrl+K** (Windows/Linux) ou **⌘K** (macOS).
- Paleta de comandos com acesso ao Início, Biblioteca, Radar, Calendário, Dicas e Finanças.
- A pesquisa mostra conteúdos da conta conectada, **sem dados financeiros por padrão**, e permite abrir uma ficha diretamente.
- Setas para navegar, Enter para abrir, Esc para fechar. Atalho para abrir a busca universal completa.

### 4. Compatibilidade e escolha
No cabeçalho escolha **Clássico | Lume | ✦ Atlas**.
- **Clássico** continua sendo o padrão em novos navegadores.
- **Lume** continua disponível com a interface clara anterior.
- **Atlas** usa uma folha de estilos isolada, `visual-atlas.css`, ativada somente quando `body[data-visual-theme="atlas"]`.
- A preferência é salva localmente. Alternar não modifica D1, registros financeiros, screenshots ou login.
- O painel financeiro permanece com suas funções e disposição próprias; apenas recebe uma barra lateral e uma navegação coerentes com o Atlas.

## Antes de publicar
- Execute `npm test` e confirme todos os testes.
- Faça QA visual em desktop e celular: abrir vídeo, assistir, expandir imagem, menu •••, filtrar coleções, Ctrl+K, abrir um resultado, mudar para Clássico ou Lume e retornar.
- Verifique o painel financeiro e o formulário de pagamento. Não há migrações D1 adicionais.
- Publicação na Cloudflare continua manual via `.github/workflows/publicar.yml` na `main`.
