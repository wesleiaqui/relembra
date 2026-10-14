// Atlas Workspace: navegação rápida e coleções. Nenhuma alteração no servidor ou nos dados.
const $=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const types={video:'Vídeo',tip:'Dica pessoal',moment:'Momento',task:'Tarefa',reflection:'Reflexão'};
let api,navigate,editVideo,openTipEditor,editThought,openEditor,loadUniversalSearch;
let serial=0,timer,priorFocus=null,initialized=false;

export function renderAtlasCollections(categories=[],active='all'){
  const target=$('atlasCollectionBar');
  if(!target)return;
  const chips=[{id:'all',name:'Tudo',emoji:'✳'},...categories];
  target.replaceChildren();
  for(const c of chips){
    const button=document.createElement('button');
    button.type='button';
    button.className='atlas-collection-chip';
    button.dataset.atlasCategory=String(c.id);
    const selected=String(c.id)===active;
    button.setAttribute('aria-pressed',String(selected));
    button.classList.toggle('active',selected);
    const icon=document.createElement('span');icon.setAttribute('aria-hidden','true');icon.textContent=c.emoji||'◈';
    const name=document.createElement('span');name.textContent=c.name;
    button.append(icon,name);target.append(button);
  }
}
function dialogOpen(){return !$('atlasCommandModal').hidden;}
function canOpen(){return document.body.dataset.visualTheme==='atlas'&&$('loginOverlay').hidden;}
export function closeAtlasCommand(){
  clearTimeout(timer);++serial;
  $('atlasCommandModal').hidden=true;
  $('atlasCommandQuery').value='';
  $('atlasCommandResults').replaceChildren();
  if(priorFocus&&typeof priorFocus.focus==='function'&&priorFocus.isConnected)priorFocus.focus();
  priorFocus=null;
}
function resetResult(message){
  const container=$('atlasCommandResults');container.replaceChildren();
  const p=document.createElement('p');p.textContent=message;container.append(p);
}
export function openAtlasCommand(){
  if(!canOpen())return;
  if(dialogOpen())return;
  priorFocus=document.activeElement;
  $('atlasCommandModal').hidden=false;
  $('atlasCommandQuery').value='';
  resetResult('Digite duas ou mais letras para buscar nas suas informações salvas.');
  $('atlasCommandQuery').focus();
}
async function openItem(type,id){
  closeAtlasCommand();
  if(type==='video'){await editVideo(id);return;}
  if(type==='tip'){await navigate('tips');openTipEditor(id);return;}
  if(type==='reflection'){await navigate('thoughts');await editThought(id);return;}
  if(type==='moment'){await navigate('life');return;}
  if(type==='task'){await navigate('radar');return;}
}
export async function searchAtlas(query){
  const token=++serial;
  if(!dialogOpen())return;
  const q=String(query||'').trim();
  if(q.length<2){resetResult('Digite duas ou mais letras para começar.');return;}
  resetResult('Buscando na sua memória...');
  try{
    // Dado financeiro é excluído e não existem chamadas a serviços externos.
    const data=await api('/api/search/all?q='+encodeURIComponent(q));
    if(token!==serial||!dialogOpen())return;
    const results=Array.isArray(data.results)?data.results.filter(item=>types[item.type]).slice(0,8):[];
    if(!results.length){resetResult('Nenhum resultado para esta busca. Tente outras palavras.');return;}
    const root=$('atlasCommandResults');root.replaceChildren();
    for(const item of results){
      const btn=document.createElement('button');btn.type='button';
      btn.className='atlas-command-result';btn.dataset.atlasResultType=item.type;btn.dataset.atlasResultId=item.id;
      const icon=document.createElement('span');icon.className='atlas-command-result-icon';icon.setAttribute('aria-hidden','true');
      icon.textContent=({video:'▣',tip:'✦',moment:'◉',task:'✓',reflection:'✧'})[item.type];
      const body=document.createElement('span');body.className='atlas-command-result-body';
      const title=document.createElement('strong');title.textContent=item.title||'Sem título';
      const detail=document.createElement('small');detail.textContent=types[item.type]+(item.detail?' · '+String(item.detail).slice(0,100):'');
      body.append(title,detail);
      const arrow=document.createElement('span');arrow.setAttribute('aria-hidden','true');arrow.textContent='↗';
      btn.append(icon,body,arrow);root.append(btn);
    }
  }catch(e){if(token===serial&&dialogOpen())resetResult('Não foi possível buscar agora. Tente novamente.');}
}
async function showCompleteSearch(){
  const q=$('atlasCommandQuery').value.trim();
  closeAtlasCommand();
  await navigate('search');
  if(q){
    $('universalQuery').value=q;
    await loadUniversalSearch();
  }else $('universalQuery').focus();
}
export function setupAtlasUI(options){
  if(initialized)return;
  initialized=true;
  ({api,navigate,editVideo,openTipEditor,editThought,openEditor,loadUniversalSearch}=options);
  $('atlasCommandTrigger').addEventListener('click',openAtlasCommand);
  $('atlasCommandClose').addEventListener('click',closeAtlasCommand);
  $('atlasCommandModal').addEventListener('click',e=>{
    if(e.target===$('atlasCommandModal'))closeAtlasCommand();
    const route=e.target.closest('[data-atlas-route]');
    if(route){closeAtlasCommand();navigate(route.dataset.atlasRoute);}
    const result=e.target.closest('[data-atlas-result-id]');
    if(result)openItem(result.dataset.atlasResultType,result.dataset.atlasResultId);
  });
  $('atlasCommandAllSearch').addEventListener('click',showCompleteSearch);
  $('atlasCommandQuery').addEventListener('input',e=>{
    clearTimeout(timer);
    const q=e.target.value;
    timer=setTimeout(()=>searchAtlas(q),220);
  });
  document.addEventListener('keydown',e=>{
    if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&canOpen()){
      e.preventDefault();if(dialogOpen())closeAtlasCommand();else openAtlasCommand();return;
    }
    if(!dialogOpen())return;
    if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();closeAtlasCommand();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      const available=Array.from($('atlasCommandModal').querySelectorAll('[data-atlas-route],[data-atlas-result-id]'));
      if(!available.length)return;
      e.preventDefault();
      const i=available.indexOf(document.activeElement);
      const next=(i+(e.key==='ArrowDown'?1:-1)+available.length)%available.length;
      available[next].focus();
    }
    if(e.key==='Enter'&&document.activeElement===$('atlasCommandQuery')){
      const top=$('atlasCommandResults').querySelector('[data-atlas-result-id]');
      if(top){e.preventDefault();openItem(top.dataset.atlasResultType,top.dataset.atlasResultId);}
      else if($('atlasCommandQuery').value.trim().length>=2){e.preventDefault();showCompleteSearch();}
    }
    if(e.key==='Tab'){
      const nodes=Array.from($('atlasCommandModal').querySelectorAll('button:not([disabled]),input:not([disabled])'));
      if(!nodes.length)return;
      const first=nodes[0],last=nodes[nodes.length-1];
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  },true);
  $('atlasCollectionBar').addEventListener('click',event=>{
    const btn=event.target.closest('[data-atlas-category]');
    if(btn)navigate('library',btn.dataset.atlasCategory);
  });
  document.addEventListener('relembra:theme-change',e=>{
    if(e.detail?.theme!=='atlas'&&dialogOpen())closeAtlasCommand();
  });
}
export function resetAtlasUI(){
  if(dialogOpen())closeAtlasCommand();
  ++serial;clearTimeout(timer);
}
