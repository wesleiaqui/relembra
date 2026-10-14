// Telas pequenas e privadas; os dados vêm sempre da sessão autenticada.
const $=id=>document.getElementById(id);
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const human=d=>d&&/^\d{4}-\d\d-\d\d/.test(d)?d.slice(8,10)+'/'+d.slice(5,7)+'/'+d.slice(0,4):'';
const money=n=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(n||0)/100);
let api,navigate,toast,editVideo,openTip,editThought;
let radar=null,life=null,habits=null,selectedWeek=null,lifeLoadSerial=0,radarSerial=0;
function download(name,blob){
  const url=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
function empty(msg){return '<p class="radar-nothing">'+esc(msg)+'</p>';}
function taskHtml(t){
  const done=Boolean(t.done_at),overdue=!done&&t.due_date<today();
  return '<div class="radar-item '+(done?'is-done':'')+'"><input type="checkbox" data-task-check="'+esc(t.id)+'" aria-label="Concluir '+esc(t.title)+'" '+(done?'checked':'')+'><div class="radar-item-main"><strong>'+esc(t.title)+'</strong><small class="'+(overdue?'radar-overdue':'')+'">'+(overdue?'Atrasada · ':'')+human(t.due_date)+'</small></div><button type="button" data-task-delete="'+esc(t.id)+'" aria-label="Excluir tarefa">×</button></div>';
}
function renderRadar(){
  if(!radar)return;
  const date=radar.date||today(),tasks=radar.tasks||[],pending=tasks.filter(t=>!t.done_at),done=tasks.filter(t=>t.done_at);
  const bills=(radar.bills||[]).slice().sort((a,b)=>String(a.due_date).localeCompare(String(b.due_date))||(a.priority||2)-(b.priority||2));
  const overdueBills=bills.filter(b=>b.due_date<date),dueToday=bills.filter(b=>b.due_date===date);
  const overdueTasks=pending.filter(t=>t.due_date<date),upcomingTasks=pending.filter(t=>t.due_date>=date);
  const dateCaption=d=>d<date?'Vencida · '+human(d):d===date?'Vence hoje':'Vence '+human(d);
  const billItem=b=>'<button type="button" class="radar-bill-row '+(b.due_date<date?'radar-bill-late':b.due_date===date?'radar-bill-today':'')+'" data-radar-finance title="Abrir minhas finanças">'+
    '<span class="radar-bill-mark" aria-hidden="true">'+(b.due_date<date?'!':b.due_date===date?'●':'○')+'</span>'+
    '<span class="radar-bill-info"><strong>'+esc(b.name)+'</strong><small>'+esc(dateCaption(b.due_date))+'</small></span>'+
    '<b>'+money(b.amount_cents)+'</b><span class="radar-row-arrow" aria-hidden="true">↗</span></button>';
  const alerts=(overdueBills.length?'<span class="radar-count-alert">'+overdueBills.length+' conta(s) vencida(s)</span>':'<span class="radar-count-good">Sem contas vencidas nesta lista</span>');
  const taskDisplay=overdueTasks.length?'<div class="radar-list-label">Atrasadas <span>'+overdueTasks.length+'</span></div>'+overdueTasks.map(taskHtml).join(''):'';
  const upcomingDisplay=upcomingTasks.length?'<div class="radar-list-label">Próximas <span>'+upcomingTasks.length+'</span></div>'+upcomingTasks.map(taskHtml).join(''):'';
  const doneDisplay=done.length?'<details class="radar-collapsed"><summary>✓ '+done.length+' tarefa(s) concluída(s) hoje</summary><div class="radar-list">'+done.map(taskHtml).join('')+'</div></details>':'';
  const emptyState='<div class="radar-empty-state"><div class="radar-empty-icon" aria-hidden="true">✓</div><strong>Suas tarefas estão em dia</strong><p>Que tal anotar uma prioridade para o próximo passo?</p><button type="button" class="button button-outline" data-radar-create>＋ Criar uma tarefa</button></div>';
  const initialBills=bills.slice(0,4),restBills=bills.slice(4);
  $('radarContent').innerHTML=
    '<div class="radar-snapshot"><div><span class="eyebrow">SEU RESUMO</span><strong>'+pending.length+' tarefa(s) pendente(s)</strong><small>Hoje e próximos 14 dias, incluindo atrasadas</small></div>'+
    '<div>'+alerts+(dueToday.length?'<small>'+dueToday.length+' conta(s) vencendo hoje</small>':'<small>Organize suas contas antes dos vencimentos</small>')+'</div></div>'+
    '<div class="radar-main-grid">'+
      '<section class="radar-panel radar-tasks-panel"><div class="radar-panel-top"><div><span class="eyebrow">FOCO</span><h2>Minhas tarefas</h2></div><span class="radar-soft-count">'+pending.length+' pendente(s)</span></div>'+
      '<p>Marque as tarefas quando concluir. A prioridade começa pelo que está atrasado.</p>'+
      '<div class="radar-list">'+(pending.length?taskDisplay+upcomingDisplay:emptyState)+doneDisplay+'</div></section>'+
      '<section class="radar-panel radar-bills-panel"><div class="radar-panel-top"><div><span class="eyebrow">CONTAS</span><h2>Próximos vencimentos</h2></div><span class="radar-soft-count">'+bills.length+' conta(s)</span></div>'+
      '<p>Contas pendentes registradas nas suas finanças.</p>'+
      '<div class="radar-bills-list">'+(bills.length?initialBills.map(billItem).join(''):'<div class="radar-bills-empty">Nenhuma conta pendente nesta janela.</div>')+
      (restBills.length?'<details class="radar-collapsed radar-bills-more"><summary>Mostrar outras '+restBills.length+' conta(s) <span aria-hidden="true">↓</span></summary>'+restBills.map(billItem).join('')+'</details>':'')+
      '</div><button class="radar-finance-link" data-radar-finance type="button">Abrir painel financeiro <span aria-hidden="true">↗</span></button></section></div>'+
    '<section class="radar-reflection">'+
      '<div><span class="eyebrow">LEMBRETE PARA O DIA</span><h2>'+(radar.tips.length?esc(radar.tips[0].title):'Pequenos passos contam')+'</h2>'+
      '<p>'+(radar.tips.length?esc(radar.tips[0].content):'Adicione uma dica destacada em “Dicas para o momento” para vê-la aqui quando precisar.')+'</p>'+
      (radar.moments.length?'<small>✧ Hoje no seu calendário: '+esc(radar.moments[0].title)+'</small>':'')+'</div>'+
      '<button type="button" class="button button-outline" data-radar-tips>Ver minhas dicas ↗</button></section>';
}
export async function loadRadar(){
  const serial=++radarSerial;
  $('radarContent').textContent='Carregando suas prioridades...';
  const due=$('radarTaskForm').elements.namedItem('due_date');if(!due.value)due.value=today();
  try{const data=await api('/api/radar');if(serial!==radarSerial)return;radar=data;renderRadar();}
  catch(e){if(serial===radarSerial)$('radarContent').textContent=e.message;}
}
function homePriorities(data){
  const tasks=(data.tasks||[]).filter(t=>!t.done_at).slice(0,5);
  const n=$('homeRadar');
  n.replaceChildren();
  if(!tasks.length){
    n.innerHTML='<div class="home-empty-priority"><span aria-hidden="true">✓</span><strong>Suas tarefas estão em dia</strong><p>Adicione abaixo algo que precisa resolver hoje ou nos próximos dias.</p></div>';
    return;
  }
  const list=document.createElement('div');list.className='home-task-list';
  for(const item of tasks){
    const label=document.createElement('label');label.className='home-task-item';
    const box=document.createElement('input');box.type='checkbox';box.dataset.homeTaskId=item.id;
    box.setAttribute('aria-label','Concluir tarefa '+item.title);
    const detail=document.createElement('span');detail.className='home-task-details';
    const title=document.createElement('strong');title.textContent=item.title;
    const meta=document.createElement('small');
    meta.textContent=(item.due_date<today()?'Atrasada · ':item.due_date===today()?'Hoje · ':'')+human(item.due_date)+(item.priority===1?' · Prioridade alta':'');
    if(item.due_date<today())meta.classList.add('home-warning');
    detail.append(title,meta);label.append(box,detail);list.append(label);
  }
  n.append(list);
}
function homeBills(data){
  const target=$('homeBills'),bills=(data.bills||[]).slice(0,4);
  target.replaceChildren();
  if(!bills.length){target.innerHTML='<p class="home-placeholder">Nenhuma conta pendente nos próximos 14 dias.</p>';return;}
  const list=document.createElement('div');list.className='home-bills-list';
  for(const item of bills){
    const line=document.createElement('button');line.type='button';line.className='home-bill-item';line.dataset.go='finance';
    const text=document.createElement('span');
    const title=document.createElement('strong');title.textContent=item.name;
    const date=document.createElement('small');date.textContent=(item.due_date<today()?'Vencida · ':item.due_date===today()?'Hoje · ':'')+human(item.due_date);
    if(item.due_date<=today())date.classList.add('home-warning');
    const amount=document.createElement('b');amount.textContent=money(item.amount_cents);
    text.append(title,date);line.append(text,amount);list.append(line);
  }
  target.append(list);
}
function homeHabitList(data){
  const target=$('homeHabits');target.replaceChildren();
  const rows=(data.habits||[]).slice(0,4);
  if(!rows.length){target.innerHTML='<p class="home-placeholder">Configure seus primeiros hábitos em Motivação.</p>';return;}
  const list=document.createElement('div');list.className='home-habits-list';
  for(const habit of rows){
    const label=document.createElement('label');label.className='home-habit-item'+(habit.done?' checked':'');
    const input=document.createElement('input');input.type='checkbox';input.checked=Boolean(habit.done);input.dataset.homeHabitId=habit.id;
    const name=document.createElement('span');name.textContent=habit.title;
    label.append(input,name);list.append(label);
  }
  target.append(list);
}
export async function loadHomeRadar(){
  const serial=++radarSerial;
  const date=$('homeDate'),quick=$('homeQuickTaskDate');
  if(date)date.textContent=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'numeric',month:'long'}).format(new Date());
  if(quick&&!quick.value)quick.value=today();
  try{
    const [data,habitsData]=await Promise.all([api('/api/radar'),api('/api/habits')]);
    if(serial!==radarSerial)return;
    radar=data;habits=habitsData;
    homePriorities(data);homeBills(data);homeHabitList(habitsData);
  }catch{
    if(serial!==radarSerial)return;
    for(const id of ['homeRadar','homeBills','homeHabits']) $(id).textContent='Não foi possível carregar agora. Tente abrir o Radar.';
  }
}
// A pesquisa agora faz parte do fluxo do Chat, não possui tela ou caixa de resultados próprias.
export async function searchMemory(query,includeFinance=false){
  const q=String(query||'').trim();
  if(q.length<2)return [];
  const result=await api('/api/search/all?q='+encodeURIComponent(q)+'&finance='+(includeFinance?'1':'0')+'&terms=1');
  return Array.isArray(result.results)?result.results:[];
}
export async function openSearchItem(type,id){
  if(type==='video'){await editVideo(id);return;}
  if(type==='tip'){await navigate('tips');openTip(id);return;}
  if(type==='moment'){await navigate('life');selectMoment(id);return;}
  if(type==='task'){await navigate('radar');return;}
  if(type==='reflection'){await navigate('thoughts');await editThought(id);return;}
  if(type==='bill'||type==='income'){await navigate('finance');return;}
}
const dayMs=86400000,weekMs=7*dayMs;
const utc=s=>Date.parse(s+'T00:00:00.000Z');
const iso=ms=>new Date(ms).toISOString().slice(0,10);
function lifeDates(profile) {
  if(!profile?.birth_date)return null;
  const [y,m,d]=profile.birth_date.split('-').map(Number);
  const start=Date.UTC(y,m-1,d),end=Date.UTC(y+profile.reference_age,m-1,d);
  const elapsed=Math.floor((utc(today())-start)/dayMs),total=Math.ceil((end-start)/weekMs);
  return {start,end,elapsed:Math.max(0,elapsed),total,currentWeek:Math.max(0,Math.min(total-1,Math.floor((utc(today())-start)/weekMs)))};
}
function selectMoment(id){
  const m=life?.moments.find(x=>x.id===id);if(!m)return;
  const form=$('lifeMomentForm');form.elements.namedItem('id').value=m.id;
  for(const k of ['moment_date','title','note','kind'])form.elements.namedItem(k).value=m[k]||'';
  $('lifeMomentHeading').textContent='Editar momento';
  $('lifeMomentDelete').hidden=false;
  form.scrollIntoView({behavior:'smooth',block:'nearest'});
}
function clearMoment(){
  const form=$('lifeMomentForm');form.reset();form.elements.namedItem('id').value='';
  form.elements.namedItem('moment_date').value=today();
  $('lifeMomentHeading').textContent='Guarde um momento';$('lifeMomentDelete').hidden=true;
}
function renderLife(){
  const d=lifeDates(life?.profile);
  const weeks=$('lifeWeeks'),summary=$('lifeOverview');
  if(!d){weeks.innerHTML=empty('Informe sua data de nascimento e salve para visualizar suas semanas.');summary.replaceChildren();return;}
  const years=(utc(today())-d.start)/(365.2425*dayMs);
  summary.innerHTML='<div class="life-stat"><strong>'+Math.max(0,Math.floor(years))+' anos</strong><small>Idade aproximada</small></div>'+
    '<div class="life-stat"><strong>'+d.elapsed.toLocaleString('pt-BR')+' dias</strong><small>Dias vividos</small></div>'+
    '<div class="life-stat"><strong>'+Math.max(0,Math.ceil((d.end-utc(today()))/dayMs)).toLocaleString('pt-BR')+' dias</strong><small>Até a idade de referência (não é uma previsão)</small></div>';
  const savedWeeks=new Set(life.moments.map(m=>Math.floor((utc(m.moment_date)-d.start)/weekMs)));
  const all=[];
  for(let i=0;i<d.total;i+=53){
    const cells=[],end=Math.min(i+53,d.total);
    for(let j=i;j<end;j++){
      const cls=[j<d.currentWeek?'lived':j===d.currentWeek?'present':'future'];
      if(savedWeeks.has(j))cls.push('saved');
      if(selectedWeek===j)cls.push('selected');
      const weekStart=iso(d.start+j*weekMs);
      cells.push('<button type="button" class="life-week '+cls.join(' ')+'" data-life-week="'+j+'" aria-label="Semana de '+human(weekStart)+'" title="Semana de '+human(weekStart)+'"></button>');
    }
    all.push('<div class="life-year"><span class="life-year-label">'+Math.floor(i/52)+'</span><div class="life-year-cells">'+cells.join('')+'</div></div>');
  }
  weeks.innerHTML=all.join('');
  $('lifeMomentsList').innerHTML=life.moments.length?life.moments.slice(0,80).map(m=>'<button type="button" class="life-moment-item" data-life-moment="'+esc(m.id)+'"><strong>'+esc(m.title)+'</strong><small>'+human(m.moment_date)+' · '+esc(({good:'Algo bom',milestone:'Conquista',reflection:'Reflexão'})[m.kind]||'Momento')+'</small>'+(m.note?'<p>'+esc(m.note)+'</p>':'')+'</button>').join(''):empty('Nenhum momento registrado. Comece com algo simples que foi bom hoje.');
}
export async function loadLife(){
  const serial=++lifeLoadSerial;
  $('lifeWeeks').textContent='Carregando seu calendário...';
  try{
    const r=await api('/api/life');if(serial!==lifeLoadSerial)return;
    life=r;
    const form=$('lifeProfileForm');form.elements.namedItem('birth_date').value=r.profile?.birth_date||'';
    form.elements.namedItem('reference_age').value=r.profile?.reference_age||90;
    clearMoment();renderLife();
  }catch(e){if(serial===lifeLoadSerial)$('lifeWeeks').textContent=e.message;}
}
function selectLifeWeek(index){
  const dates=lifeDates(life?.profile);
  if(!dates||index<0||index>=dates.total)return;
  selectedWeek=index;clearMoment();
  const weekStart=iso(dates.start+index*weekMs);
  $('lifeMomentForm').elements.namedItem('moment_date').value=weekStart;
  renderLife();
}
export async function loadHabits(){
  const n=$('motivationHabits');n.textContent='Carregando pequenos passos...';
  try{
    const result=await api('/api/habits');habits=result;
    n.innerHTML=result.habits.length?result.habits.map(x=>'<div class="motivation-habit-row '+(x.done?'is-done':'')+'"><label><input type="checkbox" data-habit-check="'+esc(x.id)+'" '+(x.done?'checked':'')+'><span>'+esc(x.title)+'</span></label><button type="button" data-habit-delete="'+esc(x.id)+'" aria-label="Remover hábito '+esc(x.title)+'">×</button></div>').join(''):empty('Adicione um pequeno hábito para hoje.');
  }catch(e){n.textContent=e.message;}
}
export function resetCompanion(){
  ++radarSerial;++lifeLoadSerial;radar=null;life=null;habits=null;selectedWeek=null;
  for(const id of ['radarContent','lifeOverview','lifeWeeks','lifeMomentsList','motivationHabits','homeRadar','homeBills','homeHabits']){
    const el=$(id);if(el)el.replaceChildren();
  }
  $('universalFinance').checked=false;
  $('lifeProfileForm').reset();$('lifeMomentForm').reset();
  $('historyModal').hidden=true;
}
export async function backupImages(){
  const button=$('backupImagesBtn'),old=button.textContent;
  button.disabled=true;button.textContent='Preparando backup...';
  try{
    let cursor=0,total=null,count=0;
    const parts=['{"format":"relembra-images-v1","exported_at":'+JSON.stringify(new Date().toISOString())+',"images":['];
    for(;;){
      const batch=await api('/api/backup/images?limit=5&offset='+cursor);
      if(total===null)total=batch.total;
      if(!Array.isArray(batch.items))throw Error('Lote inválido.');
      if(batch.items.length){
        if(count)parts.push(',');
        parts.push(batch.items.map(x=>JSON.stringify(x)).join(','));
        count+=batch.items.length;
      }
      button.textContent='Preparando imagens: '+count+'/'+total;
      if(batch.next===null)break;
      if(batch.next<=cursor||count>5000)throw Error('A exportação não foi concluída; nenhum backup parcial foi baixado.');
      cursor=batch.next;
    }
    parts.push(']}');
    download('relembra-imagens-'+today()+'.json',new Blob(parts,{type:'application/json'}));
    toast(count+' imagem(ns) incluída(s) no arquivo. Guarde com o backup principal.');
  }catch(e){toast('Backup de imagens não concluído: '+e.message,true);}
  finally{button.disabled=false;button.textContent=old;}
}
export async function restoreImages(file){
  if(!file)return;
  const input=$('restoreImagesFile');
  input.disabled=true;
  try{
    if(file.size>250*1024*1024)throw Error('Arquivo muito grande (máximo 250 MB).');
    const backup=JSON.parse(await file.text());
    if(backup.format!=='relembra-images-v1'||!Array.isArray(backup.images)||backup.images.length>5000)throw Error('Arquivo de imagens inválido.');
    if(!confirm('Restaurar as imagens que estiverem faltando na sua conta? Imagens já existentes não serão substituídas.'))return;
    let added=0,skipped=0;
    for(const img of backup.images){
      try{
        if(!/^[a-f0-9-]{36}$/i.test(String(img.video_id))||!['image/jpeg','image/png','image/webp'].includes(img.media_type)||typeof img.data_base64!=='string'||img.data_base64.length>620000)throw Error('Imagem inválida.');
        const {video}=await api('/api/videos/'+img.video_id);
        if(video.has_image){skipped++;continue;}
        const bytes=Uint8Array.from(atob(img.data_base64),ch=>ch.charCodeAt(0));
        await api('/api/videos/'+img.video_id+'/image',{method:'POST',headers:{'content-type':img.media_type},body:bytes});
        added++;
      }catch{skipped++;}
    }
    toast(added+' imagem(ns) restaurada(s); '+skipped+' ignorada(s).');
  }catch(e){toast('Erro ao restaurar imagens: '+e.message,true);}
  finally{input.value='';input.disabled=false;}
}
export async function openHistory(type,id){
  $('historyModal').hidden=false;
  const box=$('historyContent');box.textContent='Carregando versões anteriores...';
  try{
    const r=await api('/api/history?type='+encodeURIComponent(type)+'&id='+encodeURIComponent(id));
    if(!r.versions.length){box.textContent='Nenhuma versão anterior. As próximas edições ficarão registradas aqui.';return;}
    box.replaceChildren();
    for(const record of r.versions){
      const card=document.createElement('article');card.className='history-entry';
      const h=document.createElement('strong');h.textContent='Versão de '+new Date(record.archived_at).toLocaleString('pt-BR');
      const description=document.createElement('p');description.textContent=type==='tip'?record.data.content:record.data.summary||record.data.notes||record.data.title;
      const button=document.createElement('button');button.textContent='Restaurar esta versão';button.type='button';
      button.addEventListener('click',async()=>{
        if(!confirm('Restaurar esta versão? A versão atual ficará preservada no histórico.'))return;
        button.disabled=true;
        try{
          await api((type==='tip'?'/api/tips/':'/api/videos/')+id,{method:'PUT',body:JSON.stringify(record.data)});
          window.location.reload();
        }catch(e){toast(e.message,true);button.disabled=false;}
      });
      card.append(h,description,button);box.append(card);
    }
  }catch(e){box.textContent='Não foi possível carregar o histórico: '+e.message;}
}
export function setupCompanion(options){
  ({api,navigate,toast,editVideo,openTip,editThought}=options);
  $('homeQuickTaskForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const form=e.currentTarget,title=form.elements.namedItem('title').value.trim();
    const due_date=form.elements.namedItem('due_date').value;
    if(!title||!due_date)return;
    const submit=form.querySelector('button[type=submit]');submit.disabled=true;
    try{
      await api('/api/radar/tasks',{method:'POST',body:JSON.stringify({title,due_date,priority:2})});
      form.elements.namedItem('title').value='';
      await loadHomeRadar();
      toast('Tarefa adicionada ao seu radar.');
    }catch(error){toast(error.message,true);}
    finally{submit.disabled=false;}
  });
  $('homeRadar').addEventListener('change',async e=>{
    const checkbox=e.target.closest('[data-home-task-id]');if(!checkbox)return;
    checkbox.disabled=true;
    try{
      await api('/api/radar/tasks/'+checkbox.dataset.homeTaskId,{method:'PATCH',body:JSON.stringify({done:checkbox.checked})});
      await loadHomeRadar();
    }catch(error){toast(error.message,true);checkbox.disabled=false;checkbox.checked=!checkbox.checked;}
  });
  $('homeHabits').addEventListener('change',async e=>{
    const checkbox=e.target.closest('[data-home-habit-id]');if(!checkbox)return;
    checkbox.disabled=true;
    try{
      await api('/api/habits/'+checkbox.dataset.homeHabitId+'/check',{method:'PATCH',body:JSON.stringify({done:checkbox.checked})});
      await loadHomeRadar();
    }catch(error){toast(error.message,true);checkbox.disabled=false;checkbox.checked=!checkbox.checked;}
  });
  $('radarTaskForm').addEventListener('submit',async e=>{
    e.preventDefault();const b=Object.fromEntries(new FormData(e.currentTarget));
    try{await api('/api/radar/tasks',{method:'POST',body:JSON.stringify(b)});e.currentTarget.elements.namedItem('title').value='';await loadRadar();toast('Tarefa adicionada.');}catch(err){toast(err.message,true);}
  });
  $('radarContent').addEventListener('click',async e=>{
    const del=e.target.closest('[data-task-delete]');if(del){
      if(!confirm('Excluir esta tarefa?'))return;
      try{await api('/api/radar/tasks/'+del.dataset.taskDelete,{method:'DELETE'});await loadRadar();}catch(err){toast(err.message,true);}return;
    }
    if(e.target.closest('[data-radar-create]')){$('radarTaskForm').elements.namedItem('title').focus();return;}
    if(e.target.closest('[data-radar-tips]')){await navigate('tips');return;}
    if(e.target.closest('[data-radar-finance]'))await navigate('finance');
  });
  $('radarContent').addEventListener('change',async e=>{
    const checkbox=e.target.closest('[data-task-check]');if(!checkbox)return;
    try{await api('/api/radar/tasks/'+checkbox.dataset.taskCheck,{method:'PATCH',body:JSON.stringify({done:checkbox.checked})});await loadRadar();}
    catch(err){toast(err.message,true);await loadRadar();}
  });
  $('lifeProfileForm').addEventListener('submit',async e=>{
    e.preventDefault();
    const obj=Object.fromEntries(new FormData(e.currentTarget));
    try{await api('/api/life/profile',{method:'PUT',body:JSON.stringify({birth_date:obj.birth_date,reference_age:Number(obj.reference_age)})});selectedWeek=null;await loadLife();toast('Referência salva.');}
    catch(err){toast(err.message,true);}
  });
  $('lifeMomentForm').addEventListener('submit',async e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),id=data.id;
    try{await api(id?'/api/life/moments/'+id:'/api/life/moments',{method:id?'PUT':'POST',body:JSON.stringify(data)});await loadLife();toast(id?'Momento atualizado.':'Momento salvo.');}
    catch(err){toast(err.message,true);}
  });
  $('lifeMomentClear').addEventListener('click',clearMoment);
  $('lifeMomentDelete').addEventListener('click',async()=>{
    const id=$('lifeMomentForm').elements.namedItem('id').value;if(!id||!confirm('Excluir este momento?'))return;
    try{await api('/api/life/moments/'+id,{method:'DELETE'});await loadLife();toast('Momento excluído.');}catch(e){toast(e.message,true);}
  });
  $('lifeWeeks').addEventListener('click',e=>{const btn=e.target.closest('[data-life-week]');if(btn)selectLifeWeek(Number(btn.dataset.lifeWeek));});
  $('lifeMomentsList').addEventListener('click',e=>{const btn=e.target.closest('[data-life-moment]');if(btn)selectMoment(btn.dataset.lifeMoment);});
  $('lifeOldDiary').addEventListener('click',()=>navigate('thoughts'));
  $('motivationHabits').addEventListener('click',async e=>{
    const del=e.target.closest('[data-habit-delete]');if(!del)return;
    if(!confirm('Remover este hábito? As marcações dele também serão excluídas.'))return;
    try{await api('/api/habits/'+del.dataset.habitDelete,{method:'DELETE'});await loadHabits();}
    catch(err){toast(err.message,true);}
  });
  $('motivationHabits').addEventListener('change',async e=>{
    const checkbox=e.target.closest('[data-habit-check]');if(!checkbox)return;
    try{await api('/api/habits/'+checkbox.dataset.habitCheck+'/check',{method:'PATCH',body:JSON.stringify({done:checkbox.checked})});await loadHabits();}
    catch(err){toast(err.message,true);await loadHabits();}
  });
  $('motivationHabitAddForm').addEventListener('submit',async e=>{
    e.preventDefault();const input=e.currentTarget.elements.namedItem('title');
    try{await api('/api/habits',{method:'POST',body:JSON.stringify({title:input.value})});input.value='';await loadHabits();}
    catch(err){toast(err.message,true);}
  });
  $('backupImagesBtn').addEventListener('click',backupImages);
  $('restoreImagesFile').addEventListener('change',e=>restoreImages(e.target.files[0]));
  $('historyClose').addEventListener('click',()=>$('historyModal').hidden=true);
  $('historyModal').addEventListener('click',e=>{if(e.target===$('historyModal'))$('historyModal').hidden=true;});
}
