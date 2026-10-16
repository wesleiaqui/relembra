import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=filename=>readFileSync(new URL('../public/'+filename,import.meta.url),'utf8');
const html=read('index.html'),css=read('mobile-experience.css'),app=read('app.js'),viewer=read('media-links.js');

test('estilo mobile é o último, limitado a telas estreitas; desktop preservado',()=>{
  const last=html.indexOf('href="/mobile-experience.css"');
  assert.ok(last>html.indexOf('href="/tips-readability.css"'));
  assert.equal((html.match(/mobile-experience\.css/g)||[]).length,1);
  assert.match(css,/\.mobile-bottom-nav\{display:none\}/);
  assert.match(css,/@media\(max-width:760px\)\{/);
  assert.match(css, /@media\(max-width:390px\)/);
  assert.match(css, /@media\(max-width:335px\)/);
  assert.match(css,/env\(safe-area-inset-bottom,0px\)/);
});

test('Biblioteca mostra duas fichas por linha em Cartões, Galeria e Foco ampliam',()=>{
  assert.match(css,/body\[data-visual-theme\] #libraryGrid\[data-mode="standard"\][\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/body\[data-visual-theme\] #libraryGrid\[data-mode="gallery"\][\s\S]*?grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css,/body\[data-visual-theme\] #libraryGrid\[data-mode="focus"\]/);
  assert.match(css,/#libraryGrid\[data-mode="gallery"\] \.card-art img,[\s\S]*?object-fit:contain/);
  assert.match(css,/#libraryGrid\[data-mode="standard"\] \.card-art,[\s\S]*?aspect-ratio:4\/3/);
  assert.match(css,/#libraryGrid \.card-title,[\s\S]*?font-size:13px/);
  assert.match(css,/#libraryView \.view-mode-btn span\{display:inline/);
  for(const mode of ['standard','gallery','focus'])assert.match(html,new RegExp('data-view-mode="'+mode+'"'));
  assert.match(app,/localStorage\.setItem\('relembra-view-mode', mode\)/);
});

test('No celular, todas as fichas mantêm assistir, editar, ver original e mais opções',()=>{
  assert.match(app,/class="atlas-card-footer"/);
  assert.match(app,/data-watch=/);
  assert.match(app,/data-edit=/);
  assert.match(app,/atlas-card-more/);
  assert.match(app,/Abrir original/);
  assert.match(css,/#libraryGrid \.atlas-card-footer/);
  assert.match(css,/#libraryGrid \.atlas-card-primary/);
  assert.match(css,/#libraryGrid \.atlas-card-more summary/);
  assert.match(css,/#libraryGrid \.atlas-card-menu/);
});

test('Player ocupa altura útil do celular, sem cortar iframe vertical ou rodapé',()=>{
  assert.match(html,/id="mediaPlayerModal"/);
  assert.match(html,/id="mediaPlayerFrame"/);
  assert.match(css,/#mediaPlayerModal \.media-player-dialog\{[\s\S]*?height:100dvh;max-height:100dvh/);
  assert.match(css,/#mediaPlayerModal \.media-player-content\{[\s\S]*?flex:1 1 auto/);
  assert.match(css,/#mediaPlayerModal \.media-player-frame iframe,[\s\S]*?height:100%;max-height:100%/);
  assert.match(css,/#mediaPlayerModal \.media-frame-instagram iframe,[\s\S]*?width:min\(100%,520px\)/);
  assert.match(css,/#mediaPlayerModal \.media-player-footer\{[\s\S]*?safe-area-inset-bottom/);
  assert.match(app,/closeMediaPlayer\(\)[\s\S]*?mediaPlayerFrame'\)\.replaceChildren\(\)/);
  assert.match(app,/frame\.setAttribute\('sandbox'/);
  assert.match(viewer,/instagram/);
});

test('barra inferior navega pelas rotas existentes e indica a página ativa',()=>{
  const tabs=['home','library','chat','finance'];
  for(const route of tabs){
    assert.match(html,new RegExp('data-go="'+route+'" data-mobile-route="'+route+'"'));
  }
  assert.match(html,/id="mobileBottomNav" aria-label="Navegação principal do celular"/);
  assert.match(html,/id="mobileMoreBtn" aria-label="Abrir todas as seções"/);
  assert.match(app,/document\.querySelectorAll\('\[data-mobile-route\]'\)/);
  assert.match(app,/el\.setAttribute\('aria-current','page'\)/);
  assert.match(app,/el\.removeAttribute\('aria-current'\)/);
  assert.match(app,/mobileMoreBtn'\)\.addEventListener\('click'/);
  assert.match(css,/#mediaPlayerModal:not\(\[hidden\]\)/);
  assert.match(css,/#loginOverlay:not\(\[hidden\]\)/);
  assert.match(css,/#atlasCommandModal:not\(\[hidden\]\)/);
  assert.match(css,/\.mobile-nav-link:focus-visible/);
});

test('Prévia pública mobile mostra duas referências e vídeo real sem reduzir iframe a metade',()=>{
  assert.match(css,/#libraryView #libraryGrid>\.guest-showcase-grid\{[\s\S]*?repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/#libraryView \.guest-reel-card\{[\s\S]*?grid-column:1\/-1/);
  assert.match(css,/#libraryView \.guest-reel-frame\{[\s\S]*?max-width:100%/);
  assert.match(css,/#homeView \.guest-reel-teaser\{[\s\S]*?grid-column:1\/-1/);
  const demo=read('guest-preview.js');
  assert.match(demo,/https:\/\/www\.instagram\.com\/reel\/Dboi557ocop\//);
});

test('Busca e formulário também são responsivos e continuam acessíveis',()=>{
  assert.match(css,/#libraryView \.filter-bar[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/#libraryView \.filter-bar \.search-field\{[\s\S]*?grid-column:1\/-1/);
  assert.match(css,/#videoModal \.editor-modal\{[\s\S]*?max-height:96dvh/);
  assert.match(css,/#videoModal \.modal-footer-right \.button\{flex:1/);
  assert.match(css,/#imageViewerModal \.image-viewer-dialog\{[\s\S]*?height:100dvh/);
  assert.match(html,/id="mediaPlayerOriginal"/);
  assert.match(html,/id="mediaPlayerClose" aria-label="Fechar vídeo"/);
});
