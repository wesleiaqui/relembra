import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=src('index.html'),style=src('workspace-visual-refinement.css'),companion=src('companion.js'),guest=src('guest-preview.js');

test('Última folha CSS corrige Início, busca e calendário após os antigos temas',()=>{
  const final=html.indexOf('<link rel="stylesheet" href="/workspace-visual-refinement.css">');
  assert.ok(final>0);
  for(const file of ['/admin.css','/appearance-modes.css','/dark-unified.css','/dark-palettes.css','/guest-preview.css','/atlas-light-parity.css']){
    assert.ok(final>html.indexOf(file),file);
  }
  assert.equal((html.match(/\/workspace-visual-refinement\.css/g)||[]).length,1);
});

test('Início exibe três indicadores vivos, criação acima da lista e colunas sem stretch',()=>{
  assert.match(html,/id="homeSummary"/);
  for(const id of ['homeSummaryTasks','homeSummaryBills','homeSummaryHabits'])assert.match(html,new RegExp('id="'+id+'"'));
  const composer=html.indexOf('id="homeQuickTaskForm"');
  const priority=html.indexOf('id="homeRadar"');
  assert.ok(composer>0&&priority>composer);
  assert.match(html,/id="homeQuickTaskTitle"[^>]*required/);
  assert.match(html,/id="homeQuickTaskDate"[^>]*type="date" required/);
  assert.match(style,/#homeView \.home-focus-grid\{[\s\S]*?align-items:start/);
  assert.match(style,/#homeView \.home-support-column\{grid-template-rows:auto auto/);
  assert.match(style,/#homeView \.home-quick-task\{[\s\S]*?order:0/);
  assert.match(style,/#homeView \.home-empty-priority\{[\s\S]*?min-height:146px/);
  assert.match(companion,/function renderHomeSummary\(data,habitsData\)/);
  assert.match(companion,/filter\(task=>!task.done_at\)/);
  assert.match(companion,/allHabits\.filter\(habit=>habit.done\)/);
  assert.match(companion,/renderHomeSummary\(data,habitsData\);\s*homePriorities/);
  assert.match(guest,/homeSummaryHabits'\)\.textContent='1 \/ 3'/);
});

test('Modal busca Atlas escuro respeita paleta ativa até no rodapé e no foco',()=>{
  assert.match(style,/body\[data-visual-theme="atlas"\]\[data-color-mode="dark"\] #atlasCommandModal\{/);
  for(const value of ['--cmd-card:var(--night-card','--cmd-panel:var(--night-elevated',
      '--cmd-border:var(--night-border','--cmd-accent:var(--night-accent','--cmd-text:var(--night-text']){
    assert.ok(style.includes(value),value);
  }
  assert.match(style,/#atlasCommandModal \.atlas-command-dialog\{/);
  assert.match(style,/#atlasCommandModal \.atlas-command-links button/);
  assert.match(style,/#atlasCommandModal \.atlas-command-footer kbd/);
  assert.match(style,/#atlasCommandModal #atlasCommandQuery/);
  assert.match(style,/data-dark-palette="oled"\] #atlasCommandModal/);
  assert.match(style,/--cmd-card:#0b0b0b;--cmd-panel:#141414/);
  assert.match(style,/background:rgb\(0 0 0 \/ 66%\)/);
  assert.doesNotMatch(style,/background:#19273d|background:#223149|background:#273650/);
});

test('Calendário tem cores distintas e semânticas, inclusive visitante',()=>{
  assert.match(html,/class="life-grid-heading"/);
  assert.match(html,/Uma vida em perspectiva/);
  const colors=['--lv-future:#262c2e','--lv-lived:#657772','--lv-now:#e2b980','--lv-saved:#54b6a1'];
  for(const c of colors)assert.ok(style.includes(c),c);
  assert.match(style,/#lifeView \.life-year:nth-child\(5n\+1\)/);
  assert.match(style,/#lifeView \.life-week\.present\.saved/);
  assert.match(style,/#lifeView \.life-week\.selected/);
  assert.match(style,/#lifeView \.life-moment-form/);
  assert.match(style,/data-guest="true"\] #lifeView \.life-weeks \.life-week\.future/);
  assert.match(style,/@media\(prefers-reduced-motion:reduce\)/);
  const life=src('companion.js');
  assert.match(life,/selectedWeek===j/);
  assert.match(life,/savedWeeks\.has\(j\)/);
});

test('Escopos não trocam as cores de Finanças, Chat, Mapas ou paletas salvas',()=>{
  assert.doesNotMatch(style,/\#financeRoot|\#chatView|\#canvasView|\#adminView/);
  assert.doesNotMatch(style,/localStorage|setDarkPalette|setVisualTheme/);
  const modes=src('visual-theme.js');
  assert.match(modes,/midnight:'#111b2cf0'/);
  assert.match(modes,/deepblue:'#101722'/);
  assert.match(modes,/oled:'#000000'/);
});
