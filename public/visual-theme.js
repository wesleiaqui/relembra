// Preferências exclusivamente locais. Nenhum dado ou escolha é enviado ao servidor.
const LAYOUT_KEY='relembra-visual-theme'; // mesmo identificador das versões anteriores
const COLORS_KEY='relembra-color-modes';
const PALETTE_KEY='relembra-dark-palette';
export const DARK_PALETTES=Object.freeze({
  graphite:'#111314',
  midnight:'#111b2cf0',
  deepblue:'#101722',
  forest:'#111d18',
  petrol:'#0f1d21',
  oled:'#080a0b',
  wine:'#20161b'
});
export function normalizeDarkPalette(value){
  return Object.hasOwn(DARK_PALETTES,value)?value:'graphite';
}
export function readDarkPalette(storage){
  return normalizeDarkPalette(safeRead(storage,PALETTE_KEY));
}
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
function paint(layout,mode,documentRef,palette='graphite'){
  palette=normalizeDarkPalette(palette);
  documentRef.body.dataset.darkPalette=palette;
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
  for(const btn of documentRef.querySelectorAll('[data-dark-palette-option]')){
    const active=btn.dataset.darkPaletteOption===palette;
    btn.setAttribute('aria-pressed',String(active));
    btn.classList.toggle('selected',active);
  }
  const picker=documentRef.querySelector?.('#darkPalettePicker');
  if(picker)picker.hidden=mode!=='dark';
  if(mode!=='dark'){
    const menu=documentRef.querySelector?.('#darkPaletteMenu');
    if(menu)menu.hidden=true;
    documentRef.querySelector?.('#darkPaletteTrigger')?.setAttribute?.('aria-expanded','false');
  }
  const swatch=documentRef.querySelector?.('#darkPaletteCurrent');
  if(swatch)swatch.dataset.palette=palette;
  const meta=documentRef.querySelector?.('meta[name="theme-color"]');
  if(meta?.setAttribute)meta.setAttribute('content',mode==='light'?'#f7f8fc':DARK_PALETTES[palette].slice(0,7));
  if(typeof CustomEvent!=='undefined'&&typeof documentRef.dispatchEvent==='function')
    documentRef.dispatchEvent(new CustomEvent('relembra:theme-change',{detail:{theme:layout,colorMode:mode}}));
}
// A assinatura anterior permanece para integrações/clientes internos.
export function setVisualTheme(value,{documentRef=globalThis.document,storage=globalThis.localStorage,persist=true}={}){
  const layout=normalizeVisualTheme(value);
  const modes=readColorModes(storage);
  const mode=value==='lume'?'light':modes[layout];
  if(value==='lume')modes.classic='light';
  paint(layout,mode,documentRef,readDarkPalette(storage));
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
  paint(layout,mode,documentRef,readDarkPalette(storage));
  if(persist){
    safeWrite(storage,LAYOUT_KEY,layout);
    safeWrite(storage,COLORS_KEY,JSON.stringify(modes));
  }
  return mode;
}
// Preferência global para os dois layouts; muda apenas a aparência noturna.
export function setDarkPalette(value,{documentRef=globalThis.document,storage=globalThis.localStorage,persist=true}={}){
  const palette=normalizeDarkPalette(value);
  const layout=normalizeVisualTheme(documentRef.body.dataset.visualTheme);
  const mode=normalizeColorMode(documentRef.body.dataset.colorMode)||'dark';
  paint(layout,mode,documentRef,palette);
  if(persist)safeWrite(storage,PALETTE_KEY,palette);
  return palette;
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
  const menu=documentRef.querySelector?.('#darkPaletteMenu');
  const trigger=documentRef.querySelector?.('#darkPaletteTrigger');
  const closeMenu=()=>{
    if(menu)menu.hidden=true;
    trigger?.setAttribute('aria-expanded','false');
  };
  trigger?.addEventListener('click',()=>{
    if(!menu||documentRef.body.dataset.colorMode!=='dark')return;
    menu.hidden=!menu.hidden;
    trigger.setAttribute('aria-expanded',String(!menu.hidden));
  });
  for(const btn of documentRef.querySelectorAll('[data-dark-palette-option]')){
    btn.addEventListener('click',()=>{
      setDarkPalette(btn.dataset.darkPaletteOption,{documentRef,storage});
      closeMenu();
      trigger?.focus?.();
    });
  }
  documentRef.addEventListener?.('pointerdown',event=>{
    if(menu&&!menu.hidden&&!event.target?.closest?.('#darkPalettePicker'))closeMenu();
  });
  documentRef.addEventListener?.('keydown',event=>{
    if(event.key==='Escape'&&menu&&!menu.hidden){closeMenu();trigger?.focus?.();}
  });
  windowRef?.addEventListener?.('storage',event=>{
    if(event.key===LAYOUT_KEY||event.key===COLORS_KEY)
      setVisualTheme(safeRead(storage,LAYOUT_KEY),{documentRef,storage,persist:false});
    else if(event.key===PALETTE_KEY)
      setDarkPalette(readDarkPalette(storage),{documentRef,storage,persist:false});
  });
}
