import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {normalizeVisualTheme,readVisualTheme,setVisualTheme,setupVisualTheme} from '../public/visual-theme.js';

function fakeUI(saved='classic') {
  const values=new Map([['relembra-visual-theme',saved]]);
  const storage={
    getItem:key=>values.get(key)??null,
    setItem:(key,value)=>values.set(key,value)
  };
  const controls=['classic','lume','atlas'].map(mode=>{
    const attrs={};
    const classes=new Set();
    return {
      dataset:{visualOption:mode},attrs,classes,handlers:{},
      setAttribute:(key,value)=>attrs[key]=value,
      classList:{toggle:(key,flag)=>flag?classes.add(key):classes.delete(key)},
      addEventListener:(type,callback)=>{controls.find(c=>c.dataset.visualOption===mode).handlers[type]=callback;}
    };
  });
  const documentRef={body:{dataset:{}},querySelectorAll:()=>controls};
  const windowRef={handlers:{},addEventListener(type,handler){this.handlers[type]=handler;}};
  return {values,storage,controls,documentRef,windowRef};
}

test('visual Clássico continua sendo o padrão, mesmo com configuração inválida ou storage indisponível',()=>{
  assert.equal(normalizeVisualTheme('lume'),'lume');
  assert.equal(normalizeVisualTheme('atlas'),'atlas');
  assert.equal(normalizeVisualTheme('classic'),'classic');
  assert.equal(normalizeVisualTheme('foobar'),'classic');
  assert.equal(readVisualTheme({getItem:()=>{throw Error('bloqueado');}}),'classic');
  assert.equal(readVisualTheme({getItem:()=>null}),'classic');
});

test('troca Clássico / Lume imediatamente, persiste no dispositivo e sincroniza aria-pressed',()=>{
  const ui=fakeUI();
  setupVisualTheme(ui);
  assert.equal(ui.documentRef.body.dataset.visualTheme,'classic');
  assert.equal(ui.controls[0].attrs['aria-pressed'],'true');
  assert.equal(ui.controls[1].attrs['aria-pressed'],'false');
  ui.controls[1].handlers.click();
  assert.equal(ui.documentRef.body.dataset.visualTheme,'lume');
  assert.equal(ui.values.get('relembra-visual-theme'),'lume');
  assert.equal(ui.controls[1].attrs['aria-pressed'],'true');
  assert.equal(ui.controls[1].classes.has('selected'),true);
  ui.controls[0].handlers.click();
  assert.equal(ui.documentRef.body.dataset.visualTheme,'classic');
  assert.equal(ui.values.get('relembra-visual-theme'),'classic');
  ui.values.set('relembra-visual-theme','lume');
  ui.windowRef.handlers.storage({key:'relembra-visual-theme',newValue:'lume'});
  assert.equal(ui.documentRef.body.dataset.visualTheme,'lume');
  ui.controls[2].handlers.click();
  assert.equal(ui.documentRef.body.dataset.visualTheme,'atlas');
  assert.equal(ui.values.get('relembra-visual-theme'),'atlas');
  assert.equal(ui.controls[2].attrs['aria-pressed'],'true');
  ui.windowRef.handlers.storage({key:'other',newValue:'classic'});
  assert.equal(ui.documentRef.body.dataset.visualTheme,'atlas');
});

test('Lume não depende de permissões de storage e não grava dados pessoais no servidor',()=>{
  const ui=fakeUI();
  const blocked={getItem:()=>{throw Error('storage bloqueado');},setItem:()=>{throw Error('storage bloqueado');}};
  setupVisualTheme({...ui,storage:blocked});
  ui.controls[1].handlers.click();
  assert.equal(ui.documentRef.body.dataset.visualTheme,'lume');
  assert.equal(setVisualTheme('invalid',{documentRef:ui.documentRef,storage:blocked}),'classic');
  const source=readFileSync(new URL('../public/visual-theme.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/fetch\(|\/api\/|password|APP_PASSWORD/);
});

test('controle existe no cabeçalho, CSS Lume separado e aparência clássica continua acessível',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/visual-lume.css',import.meta.url),'utf8');
  for(const mode of ['classic','lume','atlas'])assert.equal((html.match(new RegExp('data-visual-option="'+mode+'"','g'))||[]).length,1);
  assert.match(html,/aria-label="Escolher aparência"/);
  assert.match(html,/href="\/visual-lume\.css"/);
  assert.match(app,/setupVisualTheme\(\);/);
  assert.match(css,/body\[data-visual-theme="lume"\] \.video-card/);
  assert.match(css,/body\[data-visual-theme="lume"\] \.sidebar/);
  assert.match(css,/body\.finance-mode\[data-visual-theme="lume"\]/);
  assert.doesNotMatch(css,/\[data-visual-theme="classic"\]/);
});
