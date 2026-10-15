import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderGuestPreview,EXAMPLE_INSTAGRAM_REEL} from '../public/guest-preview.js';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const html=read('index.html'),css=read('tips-radar-preview-v2.css'),app=read('app.js'),guest=read('guest-preview.js');

test('estilo refinado Dicas / Radar / Prévia é carregado por último sem afetar outras áreas',()=>{
  const newer=html.indexOf('/tips-radar-preview-v2.css'),previous=html.indexOf('/home-life-finish.css');
  assert.ok(newer>previous && previous>0);
  assert.match(css,/#tipsView \.tips-hero/);
  assert.match(css,/#radarView \.radar-snapshot/);
  assert.match(css,/data-guest="true"\] #homeView \.guest-showcase-grid/);
  assert.doesNotMatch(css,/#financeView|#canvasView|#chatView|#adminView/);
});

test('Dicas têm bússola contextual, métricas reais e contagem por situação',()=>{
  for(const id of ['tipsStatTotal','tipsStatFavorites','tipsStatContexts'])assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/SUA BÚSSOLA PESSOAL/);
  assert.match(html,/tips-hero-note/);
  assert.equal((html.match(/class="tips-preset-count"/g)||[]).length,8);
  assert.match(app,/tipsStatTotal'\)\.textContent=String\(state\.tips\.length\)/);
  assert.match(app,/tipsStatFavorites'\)\.textContent=String\(state\.tips\.filter\(t=>t\.favorite\)\.length\)/);
  assert.match(app,/tipsStatContexts'\)\.textContent=String\(contexts\.length\)/);
  assert.match(app,/tips-preset-count/);
  assert.match(app,/tip-card'\+\(\(t\.favorite\|\|index===0\)/);
  assert.match(css,/#tipsView \.tips-preset\.active/);
  assert.match(css,/#tipsView \.tip-card\.is-highlighted/);
});

test('Radar usa os componentes reais e herda a paleta selecionada',()=>{
  for(const cls of ['radar-snapshot','radar-quick-form','radar-main-grid','radar-panel','radar-bill-row','radar-empty-state','radar-reflection']){
    assert.ok(css.includes(cls),cls);
  }
  assert.match(css,/--tr-card:var\(--night-card/);
  assert.match(css,/--tr-border:var\(--night-border/);
  assert.match(css,/--tr-accent:var\(--night-accent/);
  assert.match(css,/data-dark-palette="oled"\] #radarView/);
  assert.match(css,/#radarView \.radar-bill-late \.radar-bill-mark/);
  assert.match(css,/#radarView \.radar-bill-today \.radar-bill-mark/);
  assert.doesNotMatch(css,/#5e7eea|#b9a8ff|#7161d3/);
});

test('Início do modo visitante não carrega player vertical e contadores combinam com exemplos',()=>{
  const before=globalThis.document,store=new Map();
  globalThis.document={getElementById(id){
    if(!store.has(id))store.set(id,{innerHTML:'',textContent:'',style:{},hidden:false,
      setAttribute(name,value){this[name]=value;},querySelector(){return null;}});
    return store.get(id);
  }};
  try{
    renderGuestPreview('home');
    const cards=store.get('homeGrid').innerHTML;
    assert.match(cards,/guest-reel-teaser/);
    assert.doesNotMatch(cards,/<iframe/);
    assert.match(cards,/Dboi557ocop/);
    assert.equal(store.get('homeSummaryTasks').textContent,'2');
    assert.equal((store.get('homeRadar').innerHTML.match(/guest-demo-task"/g)||[]).length,2);
    assert.equal(store.get('homeSummaryBills').textContent,'2');
    assert.equal((store.get('homeBills').innerHTML.match(/guest-demo-bill"/g)||[]).length,2);
    assert.equal(store.get('homeSummaryHabits').textContent,'1 / 3');
    assert.equal((store.get('homeHabits').innerHTML.match(/guest-demo-habit/g)||[]).length,3);
    assert.equal(store.get('homeHabitProgressLabel').textContent,'1 de 3');
    assert.equal(store.get('homeHabitMeterFill').style.width,'33%');
    assert.equal(store.get('homeHabitMeter')['aria-valuenow'],'33');
    assert.ok(!/fetch\(/.test(guest));
  }finally{globalThis.document=before;}
});

test('Reel real continua incorporado na Biblioteca, mas não na Home',()=>{
  assert.equal(EXAMPLE_INSTAGRAM_REEL,'https://www.instagram.com/reel/Dboi557ocop/');
  const before=globalThis.document,store=new Map();
  globalThis.document={getElementById(id){
    if(!store.has(id))store.set(id,{innerHTML:'',textContent:'',hidden:false,querySelector(){return null;}});
    return store.get(id);
  }};
  try{
    renderGuestPreview('library');
    assert.match(store.get('libraryGrid').innerHTML,/<iframe/);
    assert.match(store.get('libraryGrid').innerHTML,/Dboi557ocop\/embed/);
    assert.match(store.get('libraryGrid').innerHTML,/sandbox="allow-scripts/);
  }finally{globalThis.document=before;}
});

test('Layout novo responde a telas estreitas e mantém acessibilidade',()=>{
  assert.match(css,/@media\(max-width:900px\)/);
  assert.match(css,/@media\(max-width:640px\)/);
  assert.match(css,/@media\(prefers-reduced-motion:reduce\)/);
  assert.match(html,/id="tipsPresets" role="group"/);
  assert.match(html,/id="radarTaskForm"/);
  assert.match(css,/#tipsView :is\(button,input,select\):focus-visible/);
});
