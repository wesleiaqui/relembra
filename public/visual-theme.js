// Preferências exclusivamente locais. Nenhum dado ou escolha é enviado ao servidor.
const LAYOUT_KEY='relembra-visual-theme'; // mesmo identificador das versões anteriores
const COLORS_KEY='relembra-color-modes';
const LAYOUTS=Object.freeze(['classic','atlas']);
const MODES=Object.freeze(['light','dark']);
const DEFAULT_MODES=Object.freeze({classic:'dark',atlas:'light'});
const safeRead=(storage,key)=>{try{return storage?.getItem(key)??null;}catch{return null;}};
const safeWrite=(storage,key,value)=>{try{storage?.setItem(key,value);}catch{}};
export function normalizeVisualTheme(value){
  return value==='atlas'?'atlas':'classic'; // migração de "lume" -> Clássico
}
export function normalizeColorMode(value){return MODES.includes(value)?value:null;}
export function readVisualTheme(storage){return normalizeVisualTheme(safeRead(storage,LAYOUT_KEY));}
export function readColorModes(storage){
  let persisted={};
  try{
    const value=JSON.parse(safeRead(storage,COLORS_KEY)||'null');
    if(value&&typeof value==='object'&&!Array.isArray(value))persisted=value;
  }catch{}
  const result={...DEFAULT_MODES};
  for(const layout of LAYOUTS){
    const color=normalizeColorMode(persisted[layout]);
    if(color)result[layout]=color;
  }
  // Quem usava o antigo tema Lume continua no Clássico claro.
  if(safeRead(storage,LAYOUT_KEY)==='lume'&&!normalizeColorMode(persisted.classic))result.classic='light';
  return result;
}
function paint(layout,mode,documentRef){
  documentRef.body.dataset.visualTheme=layout;
  documentRef.body.dataset.colorMode=mode;
  for(const btn of documentRef.querySelectorAll('[data-visual-option]')){
    const active=btn.dataset.visualOption===layout;
    btn.setAttribute('aria-pressed',String(active));
    btn.classList.toggle('selected',active);
  }
  for(const btn of documentRef.querySelectorAll('[data-color-option]')){
    const active=btn.dataset.colorOption===mode;
    btn.setAttribute('aria-pressed',String(active));
    btn.classList.toggle('selected',active);
  }
  const meta=documentRef.querySelector?.('meta[name="theme-color"]');
  if(meta?.setAttribute)meta.setAttribute('content',mode==='light'?'#f7f8fc':'#0c1424');
  if(typeof CustomEvent!=='undefined'&&typeof documentRef.dispatchEvent==='function')
    documentRef.dispatchEvent(new CustomEvent('relembra:theme-change',{detail:{theme:layout,colorMode:mode}}));
}
// A assinatura anterior permanece para integrações/clientes internos.
export function setVisualTheme(value,{documentRef=globalThis.document,storage=globalThis.localStorage,persist=true}={}){
  const layout=normalizeVisualTheme(value);
  const modes=readColorModes(storage);
  const mode=value==='lume'?'light':modes[layout];
  if(value==='lume')modes.classic='light';
  paint(layout,mode,documentRef);
  if(persist){
    safeWrite(storage,LAYOUT_KEY,layout);
    safeWrite(storage,COLORS_KEY,JSON.stringify(modes));
  }
  return layout;
}
export function setColorMode(value,{documentRef=globalThis.document,storage=globalThis.localStorage,persist=true}={}){
  const layout=normalizeVisualTheme(documentRef.body.dataset.visualTheme);
  const modes=readColorModes(storage);
  const mode=normalizeColorMode(value)||modes[layout];
  modes[layout]=mode;
  paint(layout,mode,documentRef);
  if(persist){
    safeWrite(storage,LAYOUT_KEY,layout);
    safeWrite(storage,COLORS_KEY,JSON.stringify(modes));
  }
  return mode;
}
export function setupVisualTheme({documentRef=globalThis.document,windowRef=globalThis.window,storage=globalThis.localStorage}={}){
  const legacy=safeRead(storage,LAYOUT_KEY);
  setVisualTheme(legacy,{documentRef,storage,persist:true}); // migração sem apagar preferências
  for(const btn of documentRef.querySelectorAll('[data-visual-option]')){
    btn.addEventListener('click',()=>setVisualTheme(btn.dataset.visualOption,{documentRef,storage}));
  }
  for(const btn of documentRef.querySelectorAll('[data-color-option]')){
    btn.addEventListener('click',()=>setColorMode(btn.dataset.colorOption,{documentRef,storage}));
  }
  windowRef?.addEventListener?.('storage',event=>{
    if(event.key===LAYOUT_KEY||event.key===COLORS_KEY)
      setVisualTheme(safeRead(storage,LAYOUT_KEY),{documentRef,storage,persist:false});
  });
}
