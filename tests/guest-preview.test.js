import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {guestCategories,renderGuestPreview} from '../public/guest-preview.js';
import {loadFinance,setupFinance,resetFinance} from '../public/finance.js';
const read=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('modo visitante expõe todas as telas, registra CTA e usa apenas exemplos estáticos',()=>{
  const html=read('index.html'),js=read('app.js'),style=read('guest-preview.css');
  assert.ok(html.includes('id="exploreGuestBtn"'));
  assert.ok(html.includes('id="guestBanner" hidden'));
  assert.ok(html.includes('id="guestRegisterBtn"'));
  assert.ok(html.includes('id="guestLoginBtn"'));
  assert.ok(html.indexOf('/guest-preview.css')>html.indexOf('/dark-neutral-fix.css'));
  assert.match(js,/async function showGuestMode\(\)/);
  assert.match(js,/if\(state\.guest\)\{/);
  assert.match(js,/renderGuestPreview\(known\)/);
  assert.match(js,/if\(state\.guest && !\[/);
  assert.match(js,/document\.addEventListener\('submit',e=>\{/);
  assert.match(js,/document\.addEventListener\('click',e=>\{/);
  assert.match(js,/e\.stopImmediatePropagation\(\)/);
  assert.match(js,/if\(state\.guest\)\{renderGuestPreview\('home'\);return;\}/);
  assert.match(js,/if\(state\.guest\)\{renderGuestPreview\('library'\);return;\}/);
  assert.match(style,/\.guest-banner\[hidden\]\{display:none\}/);
  for(const page of ['home','library','chat','radar','life','tips','thoughts','backup']){
    assert.match(read('guest-preview.js'),new RegExp("if\\(view==='"+page+"'\\)"));
  }
  assert.equal(guestCategories.length,3);
  assert.ok(!read('guest-preview.js').includes("fetch("));
});
test('todas as telas públicas podem ser exibidas sem tocar em rede ou em dados reais',()=>{
  const original=globalThis.document;
  const store=new Map();
  globalThis.document={
    getElementById(id){
      if(!store.has(id))store.set(id,{
        innerHTML:'',textContent:'',hidden:false,
        querySelector(){return null;}
      });
      return store.get(id);
    }
  };
  try{
    for(const page of ['home','library','chat','radar','life','tips','thoughts','backup']){
      assert.doesNotThrow(()=>renderGuestPreview(page),page);
    }
    assert.match(store.get('radarContent').innerHTML,/Exemplo/);
    assert.match(store.get('libraryGrid').innerHTML,/EXEMPLO/);
    assert.match(store.get('lifeWeeks').innerHTML,/life-year-cells/);
    assert.match(store.get('lifeWeeks').innerHTML,/life-week lived/);
    assert.match(store.get('lifeWeeks').innerHTML,/life-week future/);
    assert.match(store.get('lifeMomentsList').innerHTML,/Minha primeira conquista/);
    assert.match(store.get('libraryGrid').innerHTML,/INSTAGRAM · EXEMPLO REAL/);
    assert.match(store.get('libraryGrid').innerHTML,/Dboi557ocop/);
    assert.match(store.get('homeGrid').innerHTML,/EXEMPLO/);
    assert.match(store.get('tipsGrid').innerHTML,/EXEMPLO/);
    assert.match(store.get('thoughtList').innerHTML,/Criar minha conta|Salvar minha primeira reflexão/);
  }finally{globalThis.document=original;}
});
test('finanças do visitante são fictícias; troca de mês não chama API',async()=>{
  const original=globalThis.document;
  const node={
    innerHTML:'',
    addEventListener(){},
    querySelector(){return null;},
    replaceChildren(){this.innerHTML='';}
  };
  globalThis.document={getElementById:id=>id==='financeRoot'?node:null};
  let calls=0;
  try{
    setupFinance({
      isGuest:()=>true,requireAccount:()=>false,
      api:()=>{calls++;throw Error('API privada não deve ser chamada');},
      toast:()=>{}
    });
    await loadFinance();
    assert.equal(calls,0);
    assert.match(node.innerHTML,/Demonstração com valores fictícios/);
    assert.match(node.innerHTML,/Internet \(exemplo\)/);
    assert.match(node.innerHTML,/Reserva de emergência \(exemplo\)/);
    assert.match(node.innerHTML,/Saldo disponível/);
    assert.match(node.innerHTML,/Adicionar entrada/);
  }finally{resetFinance();globalThis.document=original;}
});
