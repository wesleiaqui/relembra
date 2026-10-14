// A escolha é local a este navegador: nenhuma preferência ou dado pessoal é enviado ao servidor.
const STORAGE_KEY = 'relembra-visual-theme';
const OPTIONS = Object.freeze(['classic','lume']);
export function normalizeVisualTheme(value) {
  return OPTIONS.includes(value) ? value : 'classic';
}
export function readVisualTheme(storage) {
  try { return normalizeVisualTheme(storage.getItem(STORAGE_KEY)); }
  catch { return 'classic'; }
}
export function setVisualTheme(value,{documentRef=globalThis.document,storage=globalThis.localStorage,persist=true}={}) {
  const theme=normalizeVisualTheme(value);
  documentRef.body.dataset.visualTheme=theme;
  const groups=documentRef.querySelectorAll('[data-visual-option]');
  for(const control of groups) {
    const selected=control.dataset.visualOption===theme;
    control.setAttribute('aria-pressed',String(selected));
    control.classList.toggle('selected',selected);
  }
  if(persist){try{storage?.setItem(STORAGE_KEY,theme)}catch{}}
  return theme;
}
export function setupVisualTheme({documentRef=globalThis.document,windowRef=globalThis.window,storage=globalThis.localStorage}={}) {
  setVisualTheme(readVisualTheme(storage),{documentRef,storage,persist:false});
  const buttons=[...documentRef.querySelectorAll('[data-visual-option]')];
  for(const button of buttons){
    button.addEventListener('click',()=>{
      const theme=normalizeVisualTheme(button.dataset.visualOption);
      setVisualTheme(theme,{documentRef,storage,persist:true});
    });
  }
  windowRef?.addEventListener?.('storage',event=>{
    if(event.key===STORAGE_KEY) setVisualTheme(event.newValue,{documentRef,storage,persist:false});
  });
}
