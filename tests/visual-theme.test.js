import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeVisualTheme, normalizeColorMode, readVisualTheme, readColorModes,
  setVisualTheme, setColorMode, setupVisualTheme} from '../public/visual-theme.js';

function ui(preferences={}){
  const values=new Map(Object.entries(preferences));
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const createControl=(kind,choice)=>({
    dataset:kind==='layout'?{visualOption:choice}:{colorOption:choice},
    attrs:{},handlers:{},classes:new Set(),
    setAttribute(key,value){this.attrs[key]=value},
    classList:null,
    addEventListener(type,callback){this.handlers[type]=callback}
  });
  const layoutButtons=['classic','atlas'].map(x=>createControl('layout',x));
  const colorButtons=['light','dark'].map(x=>createControl('color',x));
  for(const button of [...layoutButtons,...colorButtons]){
    button.classList={toggle:(name,on)=>on?button.classes.add(name):button.classes.delete(name)};
  }
  const meta={attributes:{},setAttribute(key,value){this.attributes[key]=value}};
  const documentRef={
    body:{dataset:{}},
    querySelectorAll:selector=>selector==='[data-visual-option]'?layoutButtons:selector==='[data-color-option]'?colorButtons:[],
    querySelector:selector=>selector==='meta[name="theme-color"]'?meta:null,
    dispatchEvent(){}
  };
  const windowRef={handlers:{},addEventListener(type,fn){this.handlers[type]=fn}};
  return {storage,values,layoutButtons,colorButtons,documentRef,windowRef,meta};
}
test('duas interfaces e dois modos: Clássico escuro e Atlas claro como padrões',()=>{
  assert.equal(normalizeVisualTheme('classic'),'classic');
  assert.equal(normalizeVisualTheme('atlas'),'atlas');
  assert.equal(normalizeVisualTheme('lume'),'classic');
  assert.equal(normalizeVisualTheme('invalid'),'classic');
  assert.equal(normalizeColorMode('light'),'light');
  assert.equal(normalizeColorMode('dark'),'dark');
  assert.equal(normalizeColorMode('solar'),null);
  assert.deepEqual(readColorModes({getItem:()=>null}),{classic:'dark',atlas:'light'});
  assert.equal(readVisualTheme({getItem:()=>null}),'classic');
  const sample=ui();setupVisualTheme(sample);
  assert.equal(sample.documentRef.body.dataset.visualTheme,'classic');
  assert.equal(sample.documentRef.body.dataset.colorMode,'dark');
  assert.equal(sample.layoutButtons[0].attrs['aria-pressed'],'true');
  assert.equal(sample.colorButtons[1].attrs['aria-pressed'],'true');
  assert.equal(sample.meta.attributes.content,'#0c1424');
});
test('Clássico e Atlas lembram cores diferentes e trocam imediatamente, sem recarregar',()=>{
  const sample=ui();setupVisualTheme(sample);
  sample.colorButtons[0].handlers.click(); // Clássico claro
  assert.equal(sample.documentRef.body.dataset.colorMode,'light');
  assert.equal(sample.meta.attributes.content,'#f7f8fc');
  sample.layoutButtons[1].handlers.click(); // Atlas começa claro
  assert.equal(sample.documentRef.body.dataset.visualTheme,'atlas');
  sample.colorButtons[1].handlers.click(); // Atlas escuro
  assert.equal(sample.documentRef.body.dataset.colorMode,'dark');
  sample.layoutButtons[0].handlers.click(); // Clássico volta claro
  assert.equal(sample.documentRef.body.dataset.colorMode,'light');
  sample.layoutButtons[1].handlers.click(); // Atlas volta escuro
  assert.equal(sample.documentRef.body.dataset.colorMode,'dark');
  assert.deepEqual(JSON.parse(sample.values.get('relembra-color-modes')),{classic:'light',atlas:'dark'});
  assert.equal(sample.layoutButtons[1].attrs['aria-pressed'],'true');
  assert.equal(sample.colorButtons[1].attrs['aria-pressed'],'true');
  assert.equal(sample.colorButtons[0].attrs['aria-pressed'],'false');
  sample.colorButtons[0].handlers.click();
  assert.equal(sample.colorButtons[0].classes.has('selected'),true);
});
test('quem usava Lume migra para Clássico claro e não perde a preferência',()=>{
  const old=ui({'relembra-visual-theme':'lume'});
  assert.equal(readVisualTheme(old.storage),'classic');
  assert.equal(readColorModes(old.storage).classic,'light');
  setupVisualTheme(old);
  assert.equal(old.documentRef.body.dataset.visualTheme,'classic');
  assert.equal(old.documentRef.body.dataset.colorMode,'light');
  assert.equal(old.values.get('relembra-visual-theme'),'classic');
  assert.equal(JSON.parse(old.values.get('relembra-color-modes')).classic,'light');
  old.layoutButtons[1].handlers.click();
  assert.equal(old.documentRef.body.dataset.colorMode,'light');
  old.layoutButtons[0].handlers.click();
  assert.equal(old.documentRef.body.dataset.colorMode,'light');
});
test('armazenamento bloqueado, dados inválidos e preferências de outra aba não quebram a UI',()=>{
  const sample=ui();
  const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
  setupVisualTheme({...sample,storage:blocked});
  sample.layoutButtons[1].handlers.click();
  assert.equal(sample.documentRef.body.dataset.visualTheme,'atlas');
  assert.equal(sample.documentRef.body.dataset.colorMode,'light');
  assert.equal(setColorMode('dark',{documentRef:sample.documentRef,storage:blocked}),'dark');
  assert.equal(setVisualTheme('lume',{documentRef:sample.documentRef,storage:blocked}),'classic');
  assert.equal(sample.documentRef.body.dataset.colorMode,'light');
  const sync=ui({'relembra-visual-theme':'atlas','relembra-color-modes':'{"classic":"dark","atlas":"dark"}'});
  setupVisualTheme(sync);
  assert.equal(sync.documentRef.body.dataset.colorMode,'dark');
  sync.values.set('relembra-color-modes','{"classic":"light","atlas":"light"}');
  sync.windowRef.handlers.storage({key:'relembra-color-modes'});
  assert.equal(sync.documentRef.body.dataset.colorMode,'light');
  sync.windowRef.handlers.storage({key:'other'});
  assert.equal(sync.documentRef.body.dataset.colorMode,'light');
  sync.values.set('relembra-color-modes','{invalid');
  assert.deepEqual(readColorModes(sync.storage),{classic:'dark',atlas:'light'});
});
test('duas escolhas separadas no cabeçalho; a lateral acompanha cores também em finanças',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const theme=readFileSync(new URL('../public/visual-theme.js',import.meta.url),'utf8');
  const classicLight=readFileSync(new URL('../public/visual-lume.css',import.meta.url),'utf8');
  const modes=readFileSync(new URL('../public/appearance-modes.css',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  assert.match(html,/aria-label="Escolher interface"/);
  assert.match(html,/aria-label="Escolher modo de cor"/);
  for(const name of ['classic','atlas'])assert.equal((html.match(new RegExp('data-visual-option="'+name+'"','g'))||[]).length,1);
  for(const name of ['light','dark'])assert.equal((html.match(new RegExp('data-color-option="'+name+'"','g'))||[]).length,1);
  assert.doesNotMatch(html,/data-visual-option="lume"/);
  assert.match(html,/href="\/appearance-modes\.css"/);
  assert.match(app,/setupVisualTheme\(\);/);
  assert.match(classicLight,/body\[data-visual-theme="classic"\]\[data-color-mode="light"\] \.sidebar/);
  assert.doesNotMatch(classicLight,/data-visual-theme="lume"/);
  assert.match(modes,/body\[data-visual-theme="atlas"\]\[data-color-mode="light"\] \.sidebar/);
  assert.match(modes,/body\[data-visual-theme="atlas"\]\[data-color-mode="dark"\] \.sidebar/);
  assert.match(modes,/body\.finance-mode\[data-visual-theme="atlas"\]\[data-color-mode="light"\] \.sidebar/);
  assert.match(modes,/body\.finance-mode\[data-color-mode="dark"\] \.finance-kpi/);
  assert.match(modes,/body\.finance-mode\[data-visual-theme="classic"\]\[data-color-mode="dark"\] \.sidebar/);
  assert.doesNotMatch(theme,/fetch\(|\/api\/|password|APP_PASSWORD/);
});
