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
  const colors=['#101416','#151c1f','#111719','#1b2427','#243034','#314044','#eaf1f0','#b2c2c3','#82c4cc'];
  for(const color of colors)assert.ok(palette.includes(color),'Cor ausente: '+color);
  assert.ok(contrast('#eaf1f0','#1b2427')>=12,'texto deve ter contraste alto');
  assert.ok(contrast('#b2c2c3','#1b2427')>=7,'texto secundário deve permanecer legível');
  assert.ok(contrast('#eaf1f0','#243034')>=11,'texto deve permanecer legível em superfícies elevadas');
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
  assert.match(palette,/--night-card:\s*#1b2427/);
  assert.match(palette,/--night-accent:\s*#82c4cc/);
  assert.match(palette,/--night-green:\s*#66c9a5/);
  assert.match(palette,/--night-yellow:\s*#e7b975/);
  assert.match(palette,/--night-red:\s*#e68b90/);
});

test('as ações destrutivas continuam sinalizadas em vermelho, mesmo com botões azul-aço',()=>{
  const deleteRule=palette.match(/#financeRoot \.finance-delete\s*\{[^}]+\}/);
  assert.ok(deleteRule,'Estilo de excluir deve existir');
  assert.match(deleteRule[0],/#ffb3bc/);
  assert.match(palette,/body\.finance-mode\[data-visual-theme\]\[data-color-mode="dark"\] #financeRoot \.finance-btn:hover/);
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
