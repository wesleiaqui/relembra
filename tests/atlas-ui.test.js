import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderAtlasCollections} from '../public/atlas-ui.js';
import {normalizeVisualTheme} from '../public/visual-theme.js';

function fakeDocument(){
  const elements=[];
  const bar={
    children:[],
    replaceChildren(...nodes){this.children=nodes;},
    append(...nodes){this.children.push(...nodes);}
  };
  return {
    elements,bar,
    getElementById(id){return id==='atlasCollectionBar'?bar:null;},
    createElement(tag){
      const attributes={},classes=new Set();
      const node={tag,dataset:{},attributes,children:[],textContent:'',
        className:'',
        classList:{toggle(key,on){if(on)classes.add(key);else classes.delete(key);},contains(key){return classes.has(key);}},
        setAttribute(key,value){attributes[key]=value;},
        append(...nodes){this.children.push(...nodes);}
      };
      elements.push(node);return node;
    }
  };
}
test('faixa de coleções cria botões reais e sincroniza seleção, sem injetar HTML',()=>{
  const old=globalThis.document;
  globalThis.document=fakeDocument();
  try{
    renderAtlasCollections([{id:'turismo',name:'Turismo',emoji:'✈️'},{id:'html',name:'<img src=x onerror=alert(1)>',emoji:'?' }],'turismo');
    const chips=globalThis.document.bar.children;
    assert.equal(chips.length,3);
    assert.deepEqual(chips.map(x=>x.dataset.atlasCategory),['all','turismo','html']);
    assert.equal(chips[1].attributes['aria-pressed'],'true');
    assert.equal(chips[0].attributes['aria-pressed'],'false');
    assert.equal(chips[2].children[1].textContent,'<img src=x onerror=alert(1)>');
    assert.equal(chips[2].children[1].tag,'span');
    assert.equal(chips[1].classList.contains('active'),true);
    renderAtlasCollections([{id:'turismo',name:'Turismo',emoji:'✈️'}],'all');
    assert.equal(globalThis.document.bar.children[0].attributes['aria-pressed'],'true');
    assert.equal(globalThis.document.bar.children[1].classList.contains('active'),false);
  }finally{
    if(old===undefined)delete globalThis.document;
    else globalThis.document=old;
  }
});
test('Atlas é opção separada; visuais antigos preservados; sem migração financeira',()=>{
  const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
  const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
  const css=readFileSync(new URL('../public/visual-atlas.css',import.meta.url),'utf8');
  const oldCss=readFileSync(new URL('../public/styles.css',import.meta.url),'utf8');
  const atlas=readFileSync(new URL('../public/atlas-ui.js',import.meta.url),'utf8');
  assert.equal(normalizeVisualTheme('classic'),'classic');
  assert.equal(normalizeVisualTheme('lume'),'lume');
  assert.equal(normalizeVisualTheme('atlas'),'atlas');
  for(const mode of ['classic','lume','atlas'])
    assert.equal((html.match(new RegExp('data-visual-option="'+mode+'"','g'))||[]).length,1,mode);
  assert.match(html,/visual-atlas\.css/);
  assert.match(html,/id="atlasCommandQuery"/);
  assert.match(html,/id="atlasCollectionBar"/);
  assert.match(app,/setupAtlasUI\(\{api,navigate/);
  assert.match(app,/renderAtlasCollections\(state\.categories,state\.category\)/);
  assert.match(app,/class="atlas-card-footer"/);
  assert.match(atlas,/ctrlKey\|\|e\.metaKey/);
  assert.match(atlas,/openUnifiedSearch\(q\)/);
  assert.doesNotMatch(atlas,/api\/search\/all\?q=/);
  assert.doesNotMatch(atlas,/\?finance=1|localStorage|APP_PASSWORD/);
  assert.match(css,/#homeView:not\(\[hidden\]\)\{[\s\S]{0,100}display:grid/);
  assert.match(css,/\.atlas-command-dialog/);
  assert.match(css,/\.atlas-card-primary/);
  assert.match(css,/\.atlas-collection-chip/);
  assert.match(css,/body\.finance-mode\[data-visual-theme="atlas"\] \.page/);
  assert.doesNotMatch(css,/data-visual-theme="classic"/);
  assert.match(oldCss,/\.video-card\{/);
});
test('menu de comando exclui dados financeiros por padrão e respeita login',()=>{
  const source=readFileSync(new URL('../public/atlas-ui.js',import.meta.url),'utf8');
  assert.match(source,/const canOpen\(\)|function canOpen\(\)/);
  assert.match(source,/loginOverlay.*hidden/);
  assert.doesNotMatch(source,/api\/search\/all/);
  assert.match(source,/openUnifiedSearch\(q\)/);
  assert.match(source,/e\.key==='Escape'/);
  assert.match(source,/e\.key==='Tab'/);
});
