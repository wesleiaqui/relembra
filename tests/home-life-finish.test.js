import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=filename=>readFileSync(new URL('../public/'+filename,import.meta.url),'utf8');
const html=read('index.html'),css=read('home-life-finish.css'),app=read('companion.js'),guest=read('guest-preview.js');

test('a coluna principal da home contém prioridades e salvos, sem intervalo vazio antes dos atalhos',()=>{
  const focus=html.indexOf('<div class="home-focus-grid">');
  const left=html.indexOf('<div class="home-main-column">',focus);
  const priorities=html.indexOf('class="home-work-section home-work-primary"',left);
  const recent=html.indexOf('<section class="home-recent-section">',priorities);
  const right=html.indexOf('<div class="home-support-column">',recent);
  const shortcuts=html.indexOf('<section class="home-shortcuts"',right);
  assert.ok(focus<left&&left<priorities&&priorities<recent&&recent<right&&right<shortcuts);
  assert.equal((html.match(/<section class="home-recent-section">/g)||[]).length,1);
  assert.match(css,/#homeView \.home-main-column\{display:flex;flex-direction:column/);
  assert.match(css,/#homeView \.home-main-column>\.home-recent-section \.video-grid/);
  assert.match(css,/#homeView \.home-work-primary\{[\s\S]*?min-height:0!important/);
  assert.match(css,/#homeView \.home-empty-priority/);
});

test('criação rápida não repete etiquetas visíveis, mas preserva rótulos acessíveis',()=>{
  const form=html.slice(html.indexOf('<form id="homeQuickTaskForm"'),html.indexOf('id="homeRadar"'));
  assert.match(form,/id="homeQuickTaskTitle"[^>]*aria-label="Título da tarefa rápida"/);
  assert.match(form,/id="homeQuickTaskDate"[^>]*aria-label="Data de vencimento"/);
  assert.doesNotMatch(form,/class="sr-only"/);
  assert.match(form,/name="title" required/);
  assert.match(form,/name="due_date" type="date" required/);
});

test('lateral direita apresenta estados de vencimento e progresso real dos hábitos',()=>{
  assert.match(html,/id="homeBillsMeta"/);
  assert.match(html,/id="homeHabitProgressLabel"/);
  assert.match(html,/id="homeHabitMeter"/);
  assert.match(html,/role="progressbar"/);
  assert.match(html,/id="homeHabitMeterFill"/);
  assert.match(app,/item\.due_date<today\(\)\?'is-overdue'/);
  assert.match(app,/item\.due_date===today\(\)\?'is-today'/);
  assert.match(app,/Math\.round\(finished\/allHabits\.length\*100\)/);
  assert.match(app,/setAttribute\('aria-valuenow',String\(percent\)\)/);
  assert.match(app,/fill\.style\.width=percent\+'%'/);
  assert.match(guest,/homeHabitProgressLabel'\)\.textContent='1 de 3'/);
  assert.match(css,/#homeView \.home-bill-item::before/);
  assert.match(css,/#homeView \.home-habit-progress/);
  assert.match(css,/#homeView \.home-habit-item:last-child/);
});

test('calendário escuro usa tons grafite / prata com realce âmbar e teal, sem verde acinzentado legado',()=>{
  const tokens=[
    '--lv-future:#272b32',
    '--lv-lived:#838e9b',
    '--lv-now:#e6b56e',
    '--lv-saved:#70b2ac'
  ];
  for(const token of tokens)assert.ok(css.includes(token),token);
  assert.match(css,/data-dark-palette="oled"\] #lifeView/);
  assert.match(css,/--lv-lived:#898f98/);
  assert.match(css,/#lifeView \.life-week\.lived/);
  assert.match(css,/#lifeView \.life-week\.present\.saved/);
  assert.match(css,/#lifeView \.life-year:nth-child\(5n\+1\)/);
  assert.match(css,/data-guest="true"\] #lifeView \.life-weeks \.life-week\.saved/);
  assert.doesNotMatch(css,/--lv-lived:#596663|--lv-lived:#657772/);
});

test('refinamento final preserva temas antigos e não reescreve as páginas financeiras ou mapas',()=>{
  const last=html.indexOf('<link rel="stylesheet" href="/home-life-finish.css">');
  const old=html.indexOf('<link rel="stylesheet" href="/workspace-visual-refinement.css">');
  assert.ok(last>old&&old>0);
  assert.match(css,/body\[data-color-mode="dark"\]\[data-dark-palette="oled"\] #homeView/);
  assert.match(css,/--lv-card:var\(--night-card/);
  assert.doesNotMatch(css,/#financeView|#canvasView|#adminView|#chatView|localStorage/);
  assert.match(css,/@media\(max-width:1100px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
});
