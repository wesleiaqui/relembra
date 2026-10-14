import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DARK_PALETTES,normalizeDarkPalette,readDarkPalette,setDarkPalette,setupVisualTheme} from '../public/visual-theme.js';

const file=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
const all=Object.keys(DARK_PALETTES);
const makeButton=(kind,id)=>{
  const events={};
  const attrs={};
  const classes=new Set();
  return {
    dataset:{[kind]:id},events,attrs,classes,
    classList:{toggle(name,enabled){enabled?classes.add(name):classes.delete(name)}},
    addEventListener(name,fn){events[name]=fn},
    setAttribute(name,value){attrs[name]=value},
    focus(){this.focused=true}
  };
};
function fixture(initial={}){
  const map=new Map(Object.entries(initial));
  const storage={getItem(key){return map.get(key)??null},setItem(key,val){map.set(key,val)}};
  const layout=['classic','atlas'].map(x=>makeButton('visualOption',x));
  const modes=['light','dark'].map(x=>makeButton('colorOption',x));
  const palettes=all.map(x=>makeButton('darkPaletteOption',x));
  const menu={hidden:true};
  const picker={hidden:true};
  const trigger=makeButton('unused','trigger');
  const swatch={dataset:{palette:'graphite'}};
  const meta={value:'',setAttribute(_,value){this.value=value}};
  const documentHandlers={};
  const documentRef={
    body:{dataset:{}},
    querySelectorAll(s){
      return s==='[data-visual-option]'?layout:s==='[data-color-option]'?modes:s==='[data-dark-palette-option]'?palettes:[];
    },
    querySelector(s){
      return {'#darkPalettePicker':picker,'#darkPaletteMenu':menu,'#darkPaletteTrigger':trigger,'#darkPaletteCurrent':swatch,'meta[name="theme-color"]':meta}[s]??null;
    },
    dispatchEvent(){},
    addEventListener(name,fn){documentHandlers[name]=fn}
  };
  const windowHandlers={};
  const windowRef={addEventListener(name,fn){windowHandlers[name]=fn}};
  return {storage,map,layout,modes,palettes,menu,picker,trigger,swatch,meta,documentRef,windowRef,documentHandlers,windowHandlers};
}
test('sete paletas disponíveis, incluindo os dois tons antigos exatos',()=>{
  assert.equal(all.length,7);
  assert.equal(DARK_PALETTES.midnight,'#111b2cf0');
  assert.equal(DARK_PALETTES.deepblue,'#101722');
  assert.equal(readDarkPalette({getItem:()=>null}),'graphite');
  assert.equal(normalizeDarkPalette('__proto__'),'graphite');
  assert.equal(normalizeDarkPalette('invalid'),'graphite');
});
test('trocar cor altera instantaneamente todo o escuro e a cor da barra do navegador',()=>{
  const ui=fixture();
  setupVisualTheme(ui);
  assert.equal(ui.documentRef.body.dataset.darkPalette,'graphite');
  assert.equal(ui.picker.hidden,false);
  ui.trigger.events.click();
  assert.equal(ui.menu.hidden,false);
  assert.equal(ui.trigger.attrs['aria-expanded'],'true');
  ui.palettes.find(b=>b.dataset.darkPaletteOption==='midnight').events.click();
  assert.equal(ui.documentRef.body.dataset.darkPalette,'midnight');
  assert.equal(ui.meta.value,'#111b2c');
  assert.equal(ui.swatch.dataset.palette,'midnight');
  assert.equal(ui.map.get('relembra-dark-palette'),'midnight');
  assert.equal(ui.menu.hidden,true);
  assert.equal(ui.trigger.attrs['aria-expanded'],'false');
  assert.equal(ui.palettes.find(b=>b.dataset.darkPaletteOption==='midnight').attrs['aria-pressed'],'true');
  ui.layout[1].events.click(); // Atlas originalmente claro
  assert.equal(ui.documentRef.body.dataset.colorMode,'light');
  assert.equal(ui.picker.hidden,true);
  assert.equal(ui.meta.value,'#f7f8fc');
  ui.modes[1].events.click();
  assert.equal(ui.documentRef.body.dataset.darkPalette,'midnight');
  assert.equal(ui.picker.hidden,false);
  assert.equal(ui.meta.value,'#111b2c');
});
test('opção salva globalmente entre Clássico e Atlas e recebe mudanças de outras abas',()=>{
  const ui=fixture({'relembra-visual-theme':'atlas','relembra-color-modes':'{"classic":"dark","atlas":"dark"}','relembra-dark-palette':'forest'});
  setupVisualTheme(ui);
  assert.equal(ui.documentRef.body.dataset.darkPalette,'forest');
  ui.layout[0].events.click();
  assert.equal(ui.documentRef.body.dataset.darkPalette,'forest');
  ui.map.set('relembra-dark-palette','oled');
  ui.windowHandlers.storage({key:'relembra-dark-palette'});
  assert.equal(ui.documentRef.body.dataset.darkPalette,'oled');
  assert.equal(ui.meta.value,'#080a0b');
  ui.map.set('relembra-dark-palette','invalid');
  ui.windowHandlers.storage({key:'relembra-dark-palette'});
  assert.equal(ui.documentRef.body.dataset.darkPalette,'graphite');
  ui.trigger.events.click();
  ui.documentHandlers.keydown({key:'Escape'});
  assert.equal(ui.menu.hidden,true);
});
test('sem localStorage, clicar ainda muda o visual sem exceções',()=>{
  const ui=fixture();
  const blocked={getItem(){throw Error('private browsing')},setItem(){throw Error('blocked')}};
  setupVisualTheme({...ui,storage:blocked});
  assert.equal(setDarkPalette('wine',{documentRef:ui.documentRef,storage:blocked}),'wine');
  assert.equal(ui.documentRef.body.dataset.darkPalette,'wine');
});
test('menu contém prévias e estilo só ativa outras paletas no modo escuro',()=>{
  const html=file('index.html');
  const css=file('dark-palettes.css');
  assert.equal((html.match(/href="\/dark-palettes\.css"/g)||[]).length,1);
  assert.ok(html.indexOf('/dark-palettes.css')>html.indexOf('/chat-layout-refined.css'));
  assert.ok(html.indexOf('/dark-palettes.css')>html.indexOf('/finance-dark-refined.css'));
  assert.equal((html.match(/data-dark-palette-option=/g)||[]).length,7);
  for(const id of all){
    assert.match(html,new RegExp('data-dark-palette-option="'+id+'"'));
    assert.match(css,new RegExp('data-dark-palette="'+id+'"'));
  }
  assert.match(css,/\[data-color-mode="dark"\]\[data-dark-palette\]/);
  assert.doesNotMatch(css,/\[data-color-mode="light"\]|fetch\(|APP_PASSWORD|DROP TABLE/);
  assert.match(css,/\.finance-planning \.finance-summary/);
  assert.match(css,/#chatView \.chat-workspace-composer/);
  assert.match(css,/\.dark-palette-picker\[hidden\],\.dark-palette-menu\[hidden\]/);
});
