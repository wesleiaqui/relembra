import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderGuestLifeCalendar} from '../public/guest-preview.js';
import {setVisualTheme,setColorMode,readVisualTheme} from '../public/visual-theme.js';
const read=f=>readFileSync(new URL('../public/'+f,import.meta.url),'utf8');

test('calendário visitante usa a mesma estrutura da conta real e semanas distintas',()=>{
  const prev=globalThis.document,items=new Map();
  const form={elements:{namedItem:()=>({value:''})}};
  globalThis.document={getElementById(id){
    if(id==='lifeProfileForm'||id==='lifeMomentForm')return form;
    if(!items.has(id))items.set(id,{innerHTML:'',textContent:''});
    return items.get(id);
  }};
  try{
    renderGuestLifeCalendar();
    const grid=items.get('lifeWeeks').innerHTML;
    assert.equal((grid.match(/class="life-year"/g)||[]).length,90);
    assert.equal((grid.match(/class="life-week /g)||[]).length,90*53);
    assert.match(grid,/life-week lived/);
    assert.match(grid,/life-week present/);
    assert.match(grid,/life-week future/);
    assert.match(grid,/life-week lived saved/);
    assert.match(items.get('lifeOverview').innerHTML,/Idade ilustrativa/);
    assert.match(items.get('lifeMomentsList').innerHTML,/Minha primeira conquista/);
  }finally{globalThis.document=prev;}
});

test('prévia oferece exemplos de Instagram sem dados privados e sem embeds remotos',()=>{
  const js=read('guest-preview.js');
  assert.match(js,/https:\/\/www\.instagram\.com\/reel\/Dboi557ocop\//);
  assert.match(js,/https:\/\/www\.instagram\.com\/reel\/Dboi557ocop\/embed\//);
  assert.match(js,/INSTAGRAM · EXEMPLO REAL/);
  assert.match(js,/sandbox="allow-scripts/);
  assert.match(js,/loading="lazy"/);
  assert.match(js,/data-guest-action/);
  assert.doesNotMatch(js,/EXEMPLO FICTÍCIO/);
  const css=read('guest-preview.css');
  assert.match(css,/\.guest-reel-screen/);
  assert.match(css,/\.guest-reel-play/);
  assert.match(css,/\.life-year-cells/);
});

test('Atlas claro no visitante não sobrescreve preferência guardada',()=>{
  const js=read('app.js'),theme=read('visual-theme.js');
  assert.match(js,/setVisualTheme\('atlas',\{persist:false\}\)/);
  assert.match(js,/setColorMode\('light',\{persist:false\}\)/);
  assert.match(js,/setVisualTheme\(readVisualTheme\(localStorage\),\{persist:false\}\)/);
  assert.match(theme,/persist:documentRef\.body\.dataset\.guest!=='true'/);
  const saved=new Map([['relembra-visual-theme','classic'],['relembra-color-modes','{"classic":"dark","atlas":"dark"}']]);
  const storage={getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)};
  const body={dataset:{guest:'true'}};
  const documentRef={body,querySelectorAll:()=>[],querySelector:()=>null,dispatchEvent(){}};
  setVisualTheme('atlas',{documentRef,storage,persist:false});
  setColorMode('light',{documentRef,storage,persist:false});
  assert.equal(body.dataset.visualTheme,'atlas');
  assert.equal(body.dataset.colorMode,'light');
  assert.equal(readVisualTheme(storage),'classic');
  assert.equal(JSON.parse(saved.get('relembra-color-modes')).atlas,'dark');
  body.dataset.guest='false';
  setVisualTheme(readVisualTheme(storage),{documentRef,storage,persist:false});
  assert.equal(body.dataset.visualTheme,'classic');
  assert.equal(body.dataset.colorMode,'dark');
});

test('Atlas claro acompanha tokens do Clássico e não modifica o modo escuro',()=>{
  const style=read('atlas-light-parity.css'),classic=read('visual-lume.css'),html=read('index.html');
  assert.match(classic,/--bg:#f7f8fc/);
  assert.match(style,/--bg:#f7f8fc/);
  assert.match(style,/--panel:#ffffff/);
  assert.match(style,/--panel2:#f4f3ff/);
  assert.match(style,/--primary:#5749c7/);
  assert.match(style,/background:#f7f8fc/);
  assert.match(style,/background:rgb\(255 255 255 \/ 94%\)/);
  assert.ok(html.indexOf('/atlas-light-parity.css')>html.indexOf('/mental-maps.css'));
  assert.doesNotMatch(style,/body\[data-visual-theme="atlas"\]:not/);
  assert.match(style,/\[data-color-mode="light"\]/);
});
