import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DARK_PALETTES} from '../public/visual-theme.js';

const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const css=read('dark-neutral-fix.css');
const palettes=read('dark-palettes.css');
const html=read('index.html');
const oled=palettes.match(/body\[data-visual-theme\]\[data-color-mode="dark"\]\[data-dark-palette="oled"\]\s*\{([^}]+)\}/)?.[1]||'';
test('Preto OLED é realmente #000000 com superfícies sem tonalidade marrom',()=>{
  assert.equal(DARK_PALETTES.oled,'#000000');
  assert.match(palettes,/dark-palette-swatch\[data-palette="oled"\]\{background:#000000\}/);
  const expected={
    '--palette-bg':'#000000',
    '--palette-sidebar':'#050505',
    '--palette-top':'#080808',
    '--palette-surface':'#111111',
    '--palette-raised':'#1b1b1b',
    '--palette-base':'#0c0c0c',
    '--palette-accent':'#dddddd',
    '--palette-kpi':'#151515'
  };
  for(const [key,value] of Object.entries(expected)){
    assert.ok(oled.includes(key+':'+value+';'),key+' inesperada');
  }
  for(const match of oled.matchAll(/:\s*(#[a-f\d]{6})/gi)){
    const rgb=match[1].slice(1).match(/../g);
    assert.equal(new Set(rgb).size,1,'OLED deve usar somente cinzas neutros: '+match[1]);
  }
});
test('correção é carregada por último e não altera o modo claro',()=>{
  assert.equal((html.match(/href="\/dark-neutral-fix\.css"/g)||[]).length,1);
  assert.ok(html.indexOf('/dark-neutral-fix.css')>html.indexOf('/dark-palettes.css'));
  assert.match(css,/\[data-dark-palette="graphite"\]/);
  assert.match(css,/\[data-dark-palette="oled"\]/);
  assert.doesNotMatch(css,/\[data-color-mode="light"\]|!important|fetch\(|DROP TABLE/);
  assert.doesNotMatch(css,/#c2a77f|#cebc9e|#b89b77|#b9a8ff/i);
  assert.match(css,/--neutral-bg:#000000/);
  assert.match(css,/--neutral-fin-btn:#dddddd/);
  assert.match(css,/--neutral-fin-btn:#19735b/);
});
test('finanças, chat, cabeçalho e cartões usam o mesmo conjunto de cores',()=>{
  for(const selector of [
    '#financeRoot .finance-kpi-balance',
    '#financeRoot .finance-kpi-pending',
    '#financeRoot .finance-kpi-coverage',
    '#financeRoot .finance-planning .finance-summary',
    '#financeRoot .finance-table tbody tr.finance-overdue',
    '#financeRoot .finance-panel-head .finance-btn',
    '#financeRoot .finance-panel-head .finance-btn[data-fin-action="manage-recurring"]',
    '#chatView .chat-workspace-composer',
    '#chatView .chat-workspace-messages .message.user .bubble',
    '.sidebar','.topbar','.dark-palette-menu'
  ])assert.ok(css.includes(selector),'Faltou corrigir: '+selector);
  assert.match(css,/#financeRoot \.finance-table tbody tr\.finance-overdue:nth-child\(even\)/);
  assert.doesNotMatch(css,/\.finance-pill\.finance-bad\s*\{|\.finance-pill\.finance-warn\s*\{|\.finance-pill\.finance-ok\s*\{/);
});
