// Cloudflare Turnstile somente no cadastro. Sem chave no Worker o cadastro
// permanece aberto; configuração parcial é sinalizada (backend falha fechado).
let settings={enabled:false,configured:false,siteKey:''};
let token='',widgetId=null,scriptPromise=null,widgetReady=false;
const node=id=>document.getElementById(id);
function setInfo(message){const info=node('registerTurnstileStatus');if(info)info.textContent=message;}
async function loadTurnstile(){
  if(window.turnstile)return window.turnstile;
  if(scriptPromise)return scriptPromise;
  scriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async=true;script.defer=true;
    script.onload=()=>window.turnstile?resolve(window.turnstile):reject(Error('Verificação indisponível'));
    script.onerror=()=>reject(Error('Não foi possível carregar a verificação de segurança'));
    document.head.append(script);
  });
  return scriptPromise;
}
export function configureRegistrationProtection(value){
  settings={
    enabled:Boolean(value?.enabled),
    configured:Boolean(value?.configured),
    siteKey:String(value?.siteKey||'')
  };
  const wrap=node('registerTurnstileWrap');
  if(wrap)wrap.hidden=!settings.enabled;
  token='';widgetReady=false;widgetId=null;
  if(settings.enabled&&!settings.configured)setInfo('Cadastro temporariamente indisponível: configuração de segurança incompleta.');
  if(settings.enabled&&settings.configured && !node('registerForm')?.hidden)void showRegistrationProtection();
}
export async function showRegistrationProtection(){
  if(!settings.enabled)return;
  const wrap=node('registerTurnstileWrap');
  if(!wrap)return;
  wrap.hidden=false;
  if(!settings.configured){setInfo('O administrador precisa concluir a configuração de segurança.');return;}
  if(widgetReady)return;
  setInfo('Preparando verificação de segurança…');
  try{
    const widget=await loadTurnstile();
    if(!settings.enabled||!settings.configured||widgetReady)return;
    const target=node('registerTurnstile');
    widgetId=widget.render(target,{
      sitekey:settings.siteKey,action:'register',
      callback:value=>{token=value;setInfo('Verificação concluída.');},
      'expired-callback':()=>{token='';setInfo('Verificação expirada. Confirme novamente.');},
      'error-callback':()=>{token='';setInfo('Erro ao verificar. Tente novamente.');}
    });
    widgetReady=true;
    setInfo('Confirme a verificação para criar sua conta.');
  }catch{
    scriptPromise=null;
    setInfo('Não foi possível carregar o sistema de verificação. Recarregue a página.');
  }
}
export function registrationChallengeToken(){
  if(!settings.enabled)return {enabled:false,token:''};
  if(!settings.configured)return {enabled:true,token:'',error:'Cadastro indisponível até a proteção ser configurada.'};
  if(!token)return {enabled:true,token:'',error:'Conclua a verificação de segurança antes do cadastro.'};
  return {enabled:true,token};
}
export function resetRegistrationProtection(){
  token='';
  if(widgetReady&&window.turnstile&&widgetId!==null){
    try{window.turnstile.reset(widgetId);}catch{}
  }
}
