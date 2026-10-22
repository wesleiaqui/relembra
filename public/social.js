// Comunidade do Relembra: todas as ações usam a sessão existente e a API D1.
const $=id=>document.getElementById(id);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','"':'&quot;',"'":'&#39;'}[c]));
const time=value=>{try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}).format(new Date(value));}catch{return '';}};
let api,toast,navigate,isGuest;
let profile=null,feedMode='all',feedOffset=0,hasMore=false,feedItems=[];
let availabilitySerial=0;
let ready=false;
const request=(url,options)=>api(url,options);
function avatar(name){return '<span class="social-avatar" aria-hidden="true">'+esc((name||'?').trim().slice(0,1).toUpperCase())+'</span>';}
function notice(text){$('socialNotice').textContent=text; $('socialNotice').hidden=!text;}
function showProfileStatus(message,type='info'){$('socialHandleStatus').textContent=message;$('socialHandleStatus').dataset.status=type;}
function profileCard(){
  const handle=profile?.handle||null,name=profile?.display_name||'Seu espaço';
  $('socialMyBadge').innerHTML=avatar(name)+'<span><strong>'+esc(name)+'</strong><small>'+(handle?'@'+esc(handle):'Escolha seu @')+'</small></span>';
  const on=Boolean(profile?.is_public&&handle);
  $('socialPublishGate').hidden=on;
  $('socialPostForm').hidden=!on;
  $('socialPublishGate').innerHTML=handle
    ? 'Seu perfil está privado. <button type="button" class="social-text-action" data-social-go="profile">Ative a visibilidade</button> para publicar.'
    : 'Antes de participar, <button type="button" class="social-text-action" data-social-go="profile">crie seu @ personalizado</button>. Seus dados continuam privados.';
}
function populateForm(){
  $('socialDisplayName').value=profile?.display_name||'';
  $('socialHandle').value=profile?.handle||'';
  $('socialBio').value=profile?.bio||'';
  $('socialPublic').checked=Boolean(profile?.is_public);
  $('socialProfileAddress').textContent=profile?.handle?'relembra.weslleys.com/?perfil='+profile.handle:'Escolha seu nome de usuário';
  $('socialProfileHero').innerHTML=avatar(profile?.display_name||'Relembra')+'<div><strong>'+esc(profile?.display_name||'Seu perfil')+'</strong><span>'+esc(profile?.handle?'@'+profile.handle:'Ainda sem @')+'</span></div>';
  $('socialProfileVisibility').textContent=profile?.is_public?'Público — visível para pessoas conectadas':'Privado — ninguém consegue encontrar seu perfil';
}
async function fetchMe(){
  const data=await request('/api/social/me');
  profile=data.profile;
  populateForm();profileCard();
  return profile;
}
function renderPost(post){
  const following=Boolean(post.following),mine=post.handle===profile?.handle;
  return '<article class="social-post" data-post-id="'+esc(post.id)+'">'+
    '<div class="social-post-top">'+avatar(post.display_name)+
    '<div class="social-post-author"><strong>'+esc(post.display_name)+'</strong><button type="button" data-profile="'+esc(post.handle)+'">@'+esc(post.handle)+'</button><small>'+esc(time(post.created_at))+'</small></div>'+
    (mine?'<button type="button" class="social-post-follow" data-delete-post="'+esc(post.id)+'">Excluir</button>':
    '<button type="button" class="social-post-follow" data-follow="'+esc(post.handle)+'">'+(following?'Seguindo':'Seguir')+'</button>')+
    '</div><p class="social-post-copy">'+esc(post.content).replace(/\n/g,'<br>')+'</p>'+
    '<div class="social-post-actions"><button type="button" data-like="'+esc(post.id)+'" aria-pressed="'+(post.liked?'true':'false')+'"><span aria-hidden="true">'+(post.liked?'♥':'♡')+'</span> '+esc(post.likes)+' Curtidas</button>'+
    '<button type="button" data-comments="'+esc(post.id)+'"><span aria-hidden="true">☏</span> '+esc(post.comments)+' Comentários</button></div>'+
    '<div class="social-comment-panel" hidden></div></article>';
}
function paintFeed(append=false){
  const feed=$('socialFeed');
  if(!append)feed.innerHTML='';
  if(!feedItems.length){
    feed.innerHTML='<div class="social-empty"><span>✧</span><strong>O começo de uma boa conversa.</strong><p>'+(feedMode==='following'?'Siga pessoas para ver as novas publicações por aqui.':'Ainda não há publicações. Compartilhe uma descoberta e inspire outras pessoas.')+'</p></div>';return;
  }
  feed.innerHTML=feedItems.map(renderPost).join('');
  $('socialLoadMore').hidden=!hasMore;
}
async function loadFeed({append=false}={}){
  $('socialFeed').setAttribute('aria-busy','true');
  try{
    const data=await request('/api/social/feed?mode='+encodeURIComponent(feedMode)+'&offset='+(append?feedOffset:0));
    feedItems=append?[...feedItems,...data.posts]:data.posts;
    hasMore=!!data.has_more;feedOffset=feedItems.length;
    paintFeed();
  }catch(e){notice(e.message);if(!append)$('socialFeed').innerHTML='<p class="social-error">Não foi possível carregar as publicações.</p>';}
  finally{$('socialFeed').removeAttribute('aria-busy');}
}
async function saveProfile(event){
  event.preventDefault();
  const button=$('socialProfileSave'),before=button.textContent;button.disabled=true;button.textContent='Salvando...';
  const data={display_name:$('socialDisplayName').value,handle:$('socialHandle').value,bio:$('socialBio').value,is_public:$('socialPublic').checked};
  try{
    const response=await request('/api/social/me',{method:'PUT',body:JSON.stringify(data)});
    profile=response.profile;populateForm();profileCard();toast('Perfil salvo com sucesso.');
    showProfileStatus('Seu @ foi salvo.','success');
  }catch(e){showProfileStatus(e.message,'error');toast(e.message,true);}
  finally{button.disabled=false;button.textContent=before;}
}
async function checkHandle(){
  const serial=++availabilitySerial,value=$('socialHandle').value.trim().toLowerCase().replace(/^@/,'');
  if(!value){showProfileStatus('Digite um @ para verificar a disponibilidade.');return;}
  showProfileStatus('Verificando disponibilidade...');
  try{
    const result=await request('/api/social/availability?handle='+encodeURIComponent(value));
    if(serial!==availabilitySerial)return;
    showProfileStatus(result.available?'@'+value+' está disponível.':result.reason||'Esse @ já está em uso.',result.available?'success':'error');
  }catch(e){if(serial===availabilitySerial)showProfileStatus('Não foi possível consultar agora.','error');}
}
async function submitPost(event){
  event.preventDefault();
  const content=$('socialPostContent').value.trim();
  if(!content)return;
  const button=$('socialPostSubmit');button.disabled=true;
  try{
    await request('/api/social/posts',{method:'POST',body:JSON.stringify({content})});
    $('socialPostContent').value='';notice('Publicação compartilhada com a comunidade.');
    feedMode='all';document.querySelectorAll('[data-social-tab]').forEach(t=>t.setAttribute('aria-selected',String(t.dataset.socialTab==='all')));
    await loadFeed();
  }catch(e){toast(e.message,true);}
  finally{button.disabled=false;}
}
async function openProfile(handle){
  if(handle===profile?.handle){navigate('profile');return;}
  try{
    const {profile:p}=await request('/api/social/profile/'+encodeURIComponent(handle));
    $('socialOtherProfileName').textContent=p.display_name;
    $('socialOtherProfileHandle').textContent='@'+p.handle;
    $('socialOtherProfileBio').textContent=p.bio||'Este perfil ainda não tem uma biografia.';
    $('socialOtherProfileStats').textContent=p.followers+' seguidores · '+p.following+' seguindo · '+p.posts+' publicações';
    $('socialOtherProfileAvatar').innerHTML=avatar(p.display_name);
    const btn=$('socialOtherProfileFollow');btn.dataset.follow=p.handle;btn.textContent=p.is_following?'Seguindo':'Seguir';
    $('socialOtherProfileModal').hidden=false;
  }catch(e){toast(e.message,true);}
}
async function toggleFollow(handle){
  try{
    const {following}=await request('/api/social/follow/'+encodeURIComponent(handle),{method:'POST'});
    toast(following?'Agora você está seguindo @'+handle:'Você deixou de seguir @'+handle);
    if(!$('socialOtherProfileModal').hidden && $('socialOtherProfileFollow').dataset.follow===handle){
      $('socialOtherProfileFollow').textContent=following?'Seguindo':'Seguir';
    }
    await loadFeed();
  }catch(e){toast(e.message,true);}
}
async function toggleLike(id){
  try{await request('/api/social/posts/'+encodeURIComponent(id)+'/like',{method:'POST'});await loadFeed();}
  catch(e){toast(e.message,true);}
}
async function openComments(id){
  const post=document.querySelector('[data-post-id="'+CSS.escape(id)+'"]');
  const box=post?.querySelector('.social-comment-panel');if(!box)return;
  if(!box.hidden){box.hidden=true;return;}
  box.hidden=false;box.textContent='Carregando comentários...';
  try{
    const {comments}=await request('/api/social/posts/'+encodeURIComponent(id)+'/comments');
    box.innerHTML='<div class="social-comment-list">'+(comments.length?comments.map(c=>'<div class="social-comment">'+avatar(c.display_name)+'<div><strong>'+esc(c.display_name)+'</strong><small> @'+esc(c.handle)+'</small><p>'+esc(c.content)+'</p></div></div>').join(''):'<p class="social-muted">Seja a primeira pessoa a comentar.</p>')+'</div>'+
      '<form data-social-comment-form="'+esc(id)+'"><input name="content" maxlength="500" placeholder="Escreva um comentário..." required aria-label="Escreva um comentário"><button class="social-button" type="submit">Enviar</button></form>';
  }catch(e){box.textContent=e.message;}
}
async function submitComment(event){
  event.preventDefault();const form=event.target,id=form.dataset.socialCommentForm;
  const content=form.elements.namedItem('content').value.trim();if(!content)return;
  const button=form.querySelector('button');button.disabled=true;
  try{
    await request('/api/social/posts/'+encodeURIComponent(id)+'/comments',{method:'POST',body:JSON.stringify({content})});
    await loadFeed();await openComments(id);
  }catch(e){toast(e.message,true);button.disabled=false;}
}
async function deletePost(id){
  if(!confirm('Excluir esta publicação e seus comentários?'))return;
  try{await request('/api/social/posts/'+encodeURIComponent(id),{method:'DELETE'});await loadFeed();toast('Publicação excluída.');}
  catch(e){toast(e.message,true);}
}
export function setupSocial(options){
  if(ready)return;ready=true;
  ({api,toast,navigate,isGuest}=options);
  $('socialProfileForm').addEventListener('submit',saveProfile);
  $('socialPostForm').addEventListener('submit',submitPost);
  $('socialHandle').addEventListener('input',()=>{showProfileStatus('Verifique a disponibilidade antes de salvar.');clearTimeout($('socialHandle')._checkTimer);$('socialHandle')._checkTimer=setTimeout(checkHandle,350);});
  $('socialProfileCopy').addEventListener('click',async()=>{
    if(!profile?.handle){toast('Escolha seu @ primeiro.',true);return;}
    try{await navigator.clipboard.writeText(location.origin+'/?perfil='+encodeURIComponent(profile.handle));toast('Link copiado.');}
    catch{toast('Não foi possível copiar o link.',true);}
  });
  $('socialLoadMore').addEventListener('click',()=>loadFeed({append:true}));
  $('socialOtherProfileClose').addEventListener('click',()=>{$('socialOtherProfileModal').hidden=true;});
  $('socialOtherProfileModal').addEventListener('click',e=>{if(e.target===$('socialOtherProfileModal'))e.currentTarget.hidden=true;});
  document.addEventListener('click',e=>{
    const tab=e.target.closest('[data-social-tab]');if(tab){feedMode=tab.dataset.socialTab;document.querySelectorAll('[data-social-tab]').forEach(t=>t.setAttribute('aria-selected',String(t===tab)));loadFeed();return;}
    const go=e.target.closest('[data-social-go]');if(go){navigate(go.dataset.socialGo);return;}
    const follow=e.target.closest('[data-follow]');if(follow){toggleFollow(follow.dataset.follow);return;}
    const modalFollow=e.target.closest('#socialOtherProfileFollow');if(modalFollow){toggleFollow(modalFollow.dataset.follow);return;}
    const handle=e.target.closest('[data-profile]');if(handle){openProfile(handle.dataset.profile);return;}
    const like=e.target.closest('[data-like]');if(like){toggleLike(like.dataset.like);return;}
    const comments=e.target.closest('[data-comments]');if(comments){openComments(comments.dataset.comments);return;}
    const deletion=e.target.closest('[data-delete-post]');if(deletion){deletePost(deletion.dataset.deletePost);}
  });
  document.addEventListener('submit',e=>{if(e.target.matches('[data-social-comment-form]'))submitComment(e);});
}
export async function loadSocial(view){
  if(isGuest()){
    document.querySelectorAll('.social-guest-gate').forEach(el=>el.hidden=false);
    $('socialProfileContent').hidden=true;
    $('socialCommunityContent').hidden=true;
    return;
  }
  document.querySelectorAll('.social-guest-gate').forEach(el=>el.hidden=true);
  $('socialProfileContent').hidden=view!=='profile';
  $('socialCommunityContent').hidden=view!=='community';
  try{
    await fetchMe();
    if(view==='community'){notice('');await loadFeed();const target=new URLSearchParams(location.search).get('perfil');if(target){await openProfile(target);}}
  }catch(e){toast('Não foi possível abrir a área social: '+e.message,true);}
}
export function resetSocial(){
  profile=null;feedItems=[];feedOffset=0;hasMore=false;feedMode='all';
  if($('socialFeed'))$('socialFeed').replaceChildren();
  if($('socialOtherProfileModal'))$('socialOtherProfileModal').hidden=true;
}
