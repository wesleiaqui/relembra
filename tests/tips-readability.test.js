import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const read=filename=>readFileSync(new URL('../public/'+filename,import.meta.url),'utf8');
const css=read('tips-readability.css'),html=read('index.html'),app=read('app.js');

test('nova correção de legibilidade vem após CSS antigo de Dicas sem afetar Radar, Finanças, Chat e Admin',()=>{
  const before=html.indexOf('href="/tips-radar-preview-v2.css"'),after=html.indexOf('href="/tips-readability.css"');
  assert.ok(before>0&&after>before);
  assert.equal((html.match(/tips-readability\.css/g)||[]).length,1);
  assert.match(css,/#tipsView \.tips-hero/);
  assert.match(css,/#tipsView \.tip-card \.tip-content/);
  assert.doesNotMatch(css,/#financeView|#radarView|#chatView|#canvasView|#adminView/);
  assert.doesNotMatch(css,/#b9a8ff|#5e7eea|#7161d3/i);
});

test('títulos, textos e categorias são maiores e com cores próprias de alto contraste',()=>{
  assert.match(css,/#tipsView \.tip-card h3\{[\s\S]*?19px\/1\.42/);
  assert.match(css,/#tipsView \.tip-card \.tip-content\{[\s\S]*?15px\/1\.77/);
  assert.match(css,/#tipsView \.tip-card \.tip-content\{[\s\S]*?color:var\(--tips-body\)/);
  assert.match(css,/#tipsView \.tip-card\{[\s\S]*?background:var\(--tips-card-bg\)/);
  assert.match(css,/#tipsView \.tip-card-actions a,#tipsView \.tip-card-actions button\{/);
  assert.match(css,/#tipsView \.tips-preset strong\{[\s\S]*?12\.5px/);
  assert.match(css,/#tipsView \.tips-preset small,[\s\S]*?11px/);
  assert.match(css,/#tipsView \.tips-preset.active,[\s\S]*?border-color:var\(--tips-ink\)/);
  assert.match(css,/--tips-body:#e2e2e6/);
  assert.match(css,/--tips-card-bg:#1c1c1e/);
  assert.match(css,/--tips-body:#455366/);
  assert.match(css,/--tips-card-bg:#fff/);
});

test('cabeçalho tem menos altura e indicadores não exibem placeholders quebrados',()=>{
  assert.match(css,/#tipsView \.tips-hero\{[\s\S]*?padding:22px 25px/);
  assert.match(css,/#tipsView \.tips-hero-stats\{[\s\S]*?display:flex/);
  assert.match(css,/#tipsView \.tips-stat\{[\s\S]*?border-right:1px/);
  for(const id of ['tipsStatTotal','tipsStatFavorites','tipsStatContexts']){
    assert.match(html,new RegExp('id="'+id+'">0<'));
  }
  assert.match(app,/tipsStatTotal'\)\.textContent=String\(state\.tips\.length\)/);
  assert.match(app,/tipsStatFavorites'\)\.textContent=String\(state\.tips\.filter\(t=>t\.favorite\)\.length\)/);
  assert.match(app,/tipsStatContexts'\)\.textContent=String\(contexts\.length\)/);
  assert.match(app,/state\.tips=\[\];[\s\S]*?tipsStatTotal','tipsStatFavorites','tipsStatContexts/);
  assert.match(html,/src="\/app\.js\?v=tips-readable-20261015"/);
});

test('continua responsivo e acessível, com tema preto sem azul legado',()=>{
  assert.match(css, /body\[data-color-mode="dark"\]\[data-dark-palette="oled"\] #tipsView/);
  assert.match(css, /#tipsView :is\(button,input,select,a\):focus-visible/);
  assert.match(css, /@media\(max-width:1050px\)/);
  assert.match(css, /@media\(max-width:800px\)/);
  assert.match(css, /@media\(max-width:520px\)/);
  assert.match(css, /@media\(prefers-reduced-motion:reduce\)/);
  assert.match(css, /#tipsView \.tips-grid\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css, /#tipsView \.tips-grid\{grid-template-columns:1fr\}/);
  assert.match(html, /id="tipsPresets" role="group"/);
  assert.match(html, /id="tipsGrid" class="tips-grid" aria-live="polite"/);
});
