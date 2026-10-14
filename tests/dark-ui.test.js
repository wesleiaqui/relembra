import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file=path=>readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const palette=file('dark-unified.css');
const index=file('index.html');

function brightness(hex){
  const rgb=hex.match(/[a-f0-9]{2}/gi).map(x=>parseInt(x,16)/255);
  return rgb.map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
}
function contrast(a,b){const x=brightness(a),y=brightness(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05)}

test('paleta noturna legível, com quatro superfícies separadas por contraste controlado',()=>{
  const colors=['#111314','#171a1b','#141718','#1d2122','#272c2c','#343b3b','#ecede9','#b9c1bc','#c9b18f'];
  for(const color of colors)assert.ok(palette.includes(color),'Cor ausente: '+color);
  assert.ok(contrast('#ecede9','#1d2122')>=12,'texto deve ter contraste alto');
  assert.ok(contrast('#b9c1bc','#1d2122')>=7,'texto secundário deve permanecer legível');
  assert.ok(contrast('#ecede9','#272c2c')>=11,'texto deve permanecer legível em superfícies elevadas');
});

test('estilo noturno está isolado e é a última folha CSS — sem tocar no modo claro',()=>{
  assert.equal((index.match(/\/dark-unified\.css/g)||[]).length,1);
  assert.ok(index.indexOf('/dark-unified.css')>index.indexOf('/chat-workspace.css'));
  assert.ok(index.indexOf('/dark-unified.css')>index.indexOf('/finance-night.css'));
  assert.ok(index.indexOf('/dark-unified.css')>index.indexOf('/appearance-modes.css'));
  assert.match(palette,/body\[data-visual-theme\]\[data-color-mode="dark"\]/);
  assert.match(palette,/body\.finance-mode\[data-visual-theme\]\[data-color-mode="dark"\]/);
  assert.doesNotMatch(palette,/\[data-color-mode="light"\]|\[data-visual-theme="lume"\]/);
  assert.doesNotMatch(palette,/fetch\(|DROP TABLE|DELETE FROM|ALTER TABLE|APP_PASSWORD/);
});

test('sidebar, cartões, Radar, Chat, Dicas, Calendário e Finanças compartilham a paleta',()=>{
  for(const selector of [
    '.sidebar','.topbar','.nav-item.active','.video-card','.home-work-section',
    '.radar-panel','.radar-snapshot','.radar-reflection','.chat-workspace-top',
    '.chat-workspace-composer','.chat-welcome-suggestions button',
    '.tips-preset','.life-calendar-panel','.life-moment-panel',
    '.finance-kpi','.finance-panel-footer','.finance-table tbody tr.finance-overdue',
    '.finance-pill.finance-bad','.finance-pill.finance-warn','.finance-pill.finance-ok'
  ]){
    assert.ok(palette.includes(selector),'Faltou componentizar: '+selector);
  }
  assert.match(palette,/--night-card:\s*#1d2122/);
  assert.match(palette,/--night-accent:\s*#c9b18f/);
  assert.match(palette,/--night-green:\s*#80b69d/);
  assert.match(palette,/--night-yellow:\s*#e2b980/);
  assert.match(palette,/--night-red:\s*#e29a94/);
});

test('as ações destrutivas continuam sinalizadas em vermelho, mesmo com botões areia fosca',()=>{
  const deleteRule=palette.match(/#financeRoot \.finance-delete\s*\{[^}]+\}/);
  assert.ok(deleteRule,'Estilo de excluir deve existir');
  assert.match(deleteRule[0],/#f0b3af/);
  assert.match(palette,/body\.finance-mode\[data-visual-theme\]\[data-color-mode="dark"\] #financeRoot \.finance-btn:hover/);
  assert.doesNotMatch(palette,/#(?:b9a8ff|82c4cc|8b7fff|307d8c|a295ff)\b/i);
  assert.ok(contrast('#1a1b19','#c2a77f')>=7,'O CTA areia precisa ter texto escuro legível');
});

test('Chat redesenhado e paleta noturna coabitam sem perda da interface de pesquisa',()=>{
  const app=file('app.js'),html=file('index.html'),chat=file('chat-workspace.css');
  assert.match(html,/id="chatWelcomeTemplate"/);
  assert.match(html,/id="chatNewConversation"/);
  assert.match(html,/id="chatForm"/);
  assert.match(app,/resetChatConversation\(\)/);
  assert.match(app,/searchMemory\(q,includeFinance\)/);
  assert.match(chat,/#chatView \.chat-workspace-composer/);
  assert.match(palette,/#chatView \.chat-workspace-composer/);
});
