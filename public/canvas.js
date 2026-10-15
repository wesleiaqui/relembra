// Relembra Canvas v1 — quadro de nós e setas, sem bibliotecas externas.
// Coordenadas e conexões persistem no D1; visitantes veem apenas um mapa fictício.
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const apiPath=id=>'/api/canvas/'+encodeURIComponent(id);
const colors=['#4d8896','#278a69','#b78050','#9a76b5','#b86572','#71809a'];
const bounds=(v,a,b)=>Math.max(a,Math.min(b,v));
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const makeNode=(type,x,y)=>({
  id:crypto.randomUUID(),type,x:Math.round(x),y:Math.round(y),
  width:type==='group'?430:270,height:type==='group'?250:170,
  title:{note:'Nova anotação',task:'Nova tarefa',link:'Nova referência',group:'Grupo de ideias'}[type],
  body:'',color:colors[0],
  ...(type==='task'?{due_date:today(),priority:2,done:false}:{}),
  ...(type==='link'?{url:''}:{})
});
export const exampleCanvas=()=>({
  nodes:[
    {...makeNode('group',70,68),id:'11111111-1111-4111-8111-111111111111',title:'Planejando uma viagem',body:'Organize o que importa antes de partir',width:690,height:540,color:'#278a69'},
    {...makeNode('note',108,167),id:'22222222-2222-4222-8222-222222222222',title:'Ideias de destinos',body:'Pesquise lugares, datas e experiências',color:'#4d8896'},
    {...makeNode('task',437,171),id:'33333333-3333-4333-8333-333333333333',title:'Pesquisar passagens',body:'Compare os preços com antecedência',due_date:today(),priority:1,color:'#b78050'},
    {...makeNode('link',245,378),id:'44444444-4444-4444-8444-444444444444',title:'Referências úteis',body:'Guarde artigos e vídeos de viagem',url:'https://example.com',color:'#9a76b5'}
  ],
  edges:[
    {id:'55555555-5555-4555-8555-555555555555',from:'22222222-2222-4222-8222-222222222222',to:'33333333-3333-4333-8333-333333333333',label:''},
    {id:'66666666-6666-4666-8666-666666666666',from:'33333333-3333-4333-8333-333333333333',to:'44444444-4444-4444-8444-444444444444',label:''}
  ]
});
let api,toast,guest,gate;
let board=null,boards=[],links=new Map(),selected=null,connectFrom=null,zoom=1,offset={x:90,y:64};
let saveTimer=null,saving=false,editEpoch=0,savedEpoch=0,conflicted=false,initialized=false;
const viewer=()=>$('canvasViewport');
const snap=()=>board?.snapshot;
const nodeById=id=>snap()?.nodes.find(n=>n.id===id);
function setStatus(message,kind=''){
  $('canvasSaveState').textContent=message;
  $('canvasSaveState').dataset.state=kind;
}
function dirty(){
  if(guest())return;
  editEpoch++;
  setStatus('Alterações pendentes');
  clearTimeout(saveTimer);
  saveTimer=setTimeout(()=>{void saveNow()},850);
}
async function saveNow(){
  clearTimeout(saveTimer);
  if(!board||guest()||conflicted)return !conflicted;
  if(saving)return new Promise(resolve=>{
    const wait=()=>saving?setTimeout(wait,80):resolve(saveNow());
    wait();
  });
  if(savedEpoch===editEpoch)return true;
  saving=true;
  const targetEpoch=editEpoch;
  setStatus('Salvando…');
  try{
    const result=await api(apiPath(board.id),{method:'PUT',body:JSON.stringify({title:board.title,revision:board.revision,snapshot:snap()})});
    board.revision=result.revision;
    savedEpoch=targetEpoch;
    board.updated_at=result.updated_at;
    setStatus(editEpoch===savedEpoch?'Salvo':'Alterações pendentes',editEpoch===savedEpoch?'ok':'');
    return true;
  }catch(e){
    if(/outra aba|recarregue|alterado/i.test(e.message)){
      conflicted=true;setStatus('Conflito de edição — recarregue o quadro','error');
      toast('Outra aba modificou este quadro. Seu rascunho não será sobrescrito; copie o texto antes de recarregar.',true);
    }else{setStatus('Erro ao salvar — tentar novamente','error');toast(e.message,true);}
    return false;
  }finally{
    saving=false;
    if(!conflicted && savedEpoch!==editEpoch){
      clearTimeout(saveTimer);
      saveTimer=setTimeout(()=>{void saveNow()},1000);
    }
  }
}
function paintBoardNames(){
  const select=$('canvasBoardSelect');select.replaceChildren();
  for(const b of boards){
    const opt=document.createElement('option');opt.value=b.id;opt.textContent=b.title;select.append(opt);
  }
  select.hidden=!boards.length;
  $('canvasRemoveBoard').disabled=!board||guest();
  if(board)select.value=board.id;
}
function resetCamera(){zoom=1;offset={x:85,y:64};updateCamera();}
function updateCamera(){
  $('canvasWorld').style.transform=`translate(${offset.x}px,${offset.y}px) scale(${zoom})`;
  $('canvasZoomLevel').textContent=Math.round(zoom*100)+'%';
}
function endpoint(node,other){
  const cx=node.x+node.width/2,cy=node.y+node.height/2;
  const ox=other.x+other.width/2,oy=other.y+other.height/2;
  if(Math.abs(ox-cx)>Math.abs(oy-cy)){
    return {x:cx+(ox>cx?node.width/2:-node.width/2),y:cy};
  }
  return {x:cx,y:cy+(oy>cy?node.height/2:-node.height/2)};
}
function updateEdges(){
  const svg=$('canvasEdges');
  svg.replaceChildren();
  if(!board)return;
  for(const edge of snap().edges){
    const a=nodeById(edge.from),b=nodeById(edge.to);
    if(!a||!b)continue;
    const p=endpoint(a,b),q=endpoint(b,a);
    const curve=Math.max(40,Math.min(180,Math.abs(q.x-p.x)*.45));
    const isHorizontal=Math.abs(q.x-p.x)>=Math.abs(q.y-p.y);
    const d=isHorizontal
      ?`M${p.x},${p.y} C${p.x+(q.x>p.x?curve:-curve)},${p.y} ${q.x+(q.x>p.x?-curve:curve)},${q.y} ${q.x},${q.y}`
      :`M${p.x},${p.y} C${p.x},${p.y+(q.y>p.y?curve:-curve)} ${q.x},${q.y+(q.y>p.y?-curve:curve)} ${q.x},${q.y}`;
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',d);path.setAttribute('class','canvas-edge-line');svg.append(path);
  }
}
function cardHtml(n){
  const selectedClass=selected===n.id?' is-selected':'';
  const linked=links.get(n.id);
  const snippet=esc(n.body|| (n.type==='task'?'Defina uma data e envie ao Radar.':n.type==='link'?'Adicione um link de referência.':'Clique para editar este cartão.'));
  const badge={note:'Nota',task:'Tarefa',link:'Link',group:'Grupo'}[n.type];
  return `<article class="canvas-node canvas-type-${n.type}${selectedClass}" data-canvas-node="${n.id}"
    style="left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;--canvas-accent:${n.color}"
    tabindex="0" aria-label="${esc(n.title)}">
    <div class="canvas-node-head" data-canvas-drag="${n.id}"><span class="canvas-node-dot"></span><span class="canvas-node-kind">${badge}</span><span class="canvas-node-grip" aria-hidden="true">⠿</span></div>
    <strong class="canvas-node-title">${esc(n.title)}</strong>
    <p class="canvas-node-body">${snippet}</p>
    ${n.type==='task'?'<div class="canvas-node-foot"><span>'+esc(n.due_date||'Sem prazo')+'</span><span>'+ (linked?(linked.done_at?'✓ Concluída':'↗ Radar'):(n.done?'✓ Concluída':'Não vinculada'))+'</span></div>':''}
    ${n.type==='link'&&n.url?'<small class="canvas-node-url">'+esc(n.url)+'</small>':''}
  </article>`;
}
function draw(){
  const root=$('canvasNodes');root.replaceChildren();
  if(!board)return;
  for(const n of [...snap().nodes].sort((a,b)=>Number(b.type==='group')-Number(a.type==='group'))){
    const tpl=document.createElement('template');tpl.innerHTML=cardHtml(n);
    root.append(tpl.content);
  }
  updateEdges();
  updateCamera();
  drawInspector();
}
function selectedNode(){
  return nodeById(selected);
}
function drawInspector(){
  const shell=$('canvasInspector');
  const n=selectedNode();
  shell.hidden=!n;
  if(!n)return;
  $('canvasNodeTitle').value=n.title;
  $('canvasNodeBody').value=n.body;
  $('canvasNodeType').textContent={note:'Anotação',task:'Tarefa',link:'Link',group:'Grupo'}[n.type];
  $('canvasNodeUrlWrap').hidden=n.type!=='link';
  $('canvasNodeUrl').value=n.url||'';
  $('canvasNodeTaskWrap').hidden=n.type!=='task';
  $('canvasNodeDue').value=n.due_date||'';
  $('canvasNodePriority').value=String(n.priority||2);
  const link=links.get(n.id);
  $('canvasTaskLink').hidden=n.type!=='task';
  $('canvasTaskLink').textContent=link?(link.done_at?'✓ Tarefa concluída no Radar':'✓ Marcar concluída'):'↗ Enviar tarefa ao Radar';
  $('canvasTaskLink').disabled=guest();
  $('canvasNodeColor').value=n.color;
  $('canvasNodeWidth').value=n.width;
  $('canvasNodeHeight').value=n.height;
  $('canvasDeleteNode').disabled=guest();
}
function setSelected(id){
  selected=id;connectFrom=null;draw();
}
function ensureWrite(){
  if(!guest())return true;
  gate();
  return false;
}
function addNode(type){
  if(!ensureWrite()||!board)return;
  const rect=viewer().getBoundingClientRect();
  const x=(rect.width*.45-offset.x)/zoom,y=(rect.height*.35-offset.y)/zoom;
  const n=makeNode(type,bounds(x,-8000,8000),bounds(y,-8000,8000));
  snap().nodes.push(n);selected=n.id;dirty();draw();
  $('canvasNodeTitle').focus();$('canvasNodeTitle').select();
}
function removeSelected(){
  if(!ensureWrite()||!selectedNode())return;
  const id=selected;snap().nodes=snap().nodes.filter(x=>x.id!==id);
  snap().edges=snap().edges.filter(e=>e.from!==id&&e.to!==id);
  selected=null;dirty();draw();
}
async function sendTask(){
  if(!ensureWrite())return;
  const n=selectedNode();
  if(!n||n.type!=='task')return;
  const current=links.get(n.id);
  if(current){
    try{
      await api('/api/radar/tasks/'+current.task_id,{method:'PATCH',body:JSON.stringify({done:!current.done_at})});
      current.done_at=current.done_at?null:new Date().toISOString();
      links.set(n.id,current);draw();toast('Estado da tarefa atualizado no Radar.');
    }catch(e){toast(e.message,true);}
    return;
  }
  const saved=await saveNow();
  if(!saved){toast('Salve o quadro antes de vincular a tarefa.',true);return;}
  try{
    const result=await api(apiPath(board.id)+'/tasks',{method:'POST',body:JSON.stringify({nodeId:n.id})});
    links.set(n.id,{task_id:result.task_id,done_at:result.done_at,title:n.title});
    draw();toast('Tarefa vinculada ao Radar do dia.');
  }catch(e){toast(e.message,true);}
}
async function loadBoard(id){
  if(guest())return;
  const result=await api(apiPath(id));
  board=result.board;links=new Map(result.links.map(l=>[l.node_id,l]));
  $('canvasBoardTitle').value=board.title;
  selected=null;connectFrom=null;conflicted=false;editEpoch=0;savedEpoch=0;
  resetCamera();paintBoardNames();draw();setStatus('Salvo','ok');
}
async function listBoards(){
  const result=await api('/api/canvas');boards=result.boards;
  paintBoardNames();
  if(!boards.length){
    board=null;selected=null;$('canvasBoardTitle').value='';draw();setStatus('Crie seu primeiro quadro');
    $('canvasEmpty').hidden=false;return;
  }
  $('canvasEmpty').hidden=true;
  await loadBoard(boards.some(b=>b.id===board?.id)?board.id:boards[0].id);
}
async function createBoard(){
  if(!ensureWrite())return;
  const title=prompt('Nome do novo quadro:', 'Meu mapa visual');
  if(title===null)return;
  if(!title.trim())return toast('Informe o nome do quadro.',true);
  if(!await saveNow())return;
  try{
    const result=await api('/api/canvas',{method:'POST',body:JSON.stringify({title:title.trim()})});
    boards.unshift({id:result.board.id,title:result.board.title});
    board=result.board;links=new Map();selected=null;editEpoch=0;savedEpoch=0;conflicted=false;
    $('canvasBoardTitle').value=board.title;
    $('canvasEmpty').hidden=true;
    resetCamera();paintBoardNames();draw();setStatus('Salvo','ok');
  }catch(e){toast(e.message,true);}
}
async function changeBoard(id){
  if(board?.id===id)return;
  if(!await saveNow()){$('canvasBoardSelect').value=board.id;return;}
  try{await loadBoard(id);}catch(e){toast(e.message,true);}
}
async function removeBoard(){
  if(!board||!ensureWrite())return;
  if(!confirm('Excluir este quadro visual? As tarefas já enviadas ao Radar continuarão lá.'))return;
  try{
    await api(apiPath(board.id),{method:'DELETE'});
    board=null;await listBoards();
    toast('Quadro excluído. Tarefas do Radar preservadas.');
  }catch(e){toast(e.message,true);}
}
function adjustZoom(delta,point){
  const rect=viewer().getBoundingClientRect(),px=point?.x??rect.width/2,py=point?.y??rect.height/2;
  const z=bounds(zoom*delta,.35,2.5);
  offset.x=px-(px-offset.x)/zoom*z;
  offset.y=py-(py-offset.y)/zoom*z;
  zoom=z;updateCamera();
}
function bindCanvasEvents(){
  $('canvasBoardSelect').addEventListener('change',e=>void changeBoard(e.target.value));
  $('canvasCreateBoard').addEventListener('click',()=>void createBoard());
  $('canvasEmptyCreate').addEventListener('click',()=>void createBoard());
  $('canvasRemoveBoard').addEventListener('click',()=>void removeBoard());
  $('canvasBoardTitle').addEventListener('change',e=>{
    if(!board||!ensureWrite())return;
    board.title=e.target.value.trim().slice(0,100)||board.title;
    e.target.value=board.title;
    const item=boards.find(b=>b.id===board.id);if(item)item.title=board.title;
    paintBoardNames();dirty();
  });
  for(const type of ['note','task','link','group'])$('canvasAdd'+type[0].toUpperCase()+type.slice(1))
    .addEventListener('click',()=>addNode(type));
  $('canvasZoomIn').addEventListener('click',()=>adjustZoom(1.2));
  $('canvasZoomOut').addEventListener('click',()=>adjustZoom(1/1.2));
  $('canvasFit').addEventListener('click',resetCamera);
  $('canvasSaveNow').addEventListener('click',()=>void saveNow());
  $('canvasDeleteNode').addEventListener('click',removeSelected);
  for(const [input,key,min,max] of [['canvasNodeWidth','width',180,1000],['canvasNodeHeight','height',108,900]]){
    $(input).addEventListener('change',e=>{
      const n=selectedNode();if(!n||!ensureWrite())return;
      const minSize=n.type==='group'?(key==='width'?260:160):min;
      n[key]=bounds(Number(e.target.value)||n[key],minSize,max);
      e.target.value=n[key];dirty();draw();
    });
  }
  $('canvasTaskLink').addEventListener('click',()=>void sendTask());
  $('canvasConnect').addEventListener('click',()=>{
    if(!ensureWrite())return;
    connectFrom=selectedNode()?.id||null;
    toast(connectFrom?'Selecione outro cartão para criar a conexão.':'Selecione um cartão para iniciar a conexão.');
  });
  const fields=[
    ['canvasNodeTitle','title'],['canvasNodeBody','body'],['canvasNodeUrl','url'],
    ['canvasNodeColor','color'],['canvasNodeDue','due_date'],['canvasNodePriority','priority']
  ];
  for(const [id,field] of fields){
    $(id).addEventListener('input',e=>{
      const n=selectedNode();if(!n||!ensureWrite())return;
      const val=field==='priority'?Number(e.target.value):e.target.value;
      n[field]=field==='title'?val.slice(0,120):field==='body'?val.slice(0,2200):val;
      const dom=$('canvasNodes').querySelector('[data-canvas-node="'+n.id+'"]');
      if(dom){
        dom.querySelector('.canvas-node-title').textContent=n.title||'Sem título';
        dom.querySelector('.canvas-node-body').textContent=n.body||'';
        dom.style.setProperty('--canvas-accent',n.color);
      }
      dirty();
    });
  }
  let gesture=null;
  viewer().addEventListener('pointerdown',e=>{
    if(e.button!==0)return;
    const item=e.target.closest('[data-canvas-node]');
    if(item){
      const id=item.dataset.canvasNode;
      if(connectFrom && id!==connectFrom){
        if(!ensureWrite())return;
        const existing=snap().edges.find(edge=>(edge.from===connectFrom&&edge.to===id)||(edge.from===id&&edge.to===connectFrom));
        if(existing){
          snap().edges=snap().edges.filter(e=>e.id!==existing.id);
          toast('Conexão removida.');
        }else{
          snap().edges.push({id:crypto.randomUUID(),from:connectFrom,to:id,label:''});
          toast('Cartões conectados.');
        }
        dirty();connectFrom=null;selected=id;draw();return;
      }
      if(connectFrom===id){connectFrom=null;setSelected(id);return;}
      selected=id;drawInspector();
      $('canvasNodes').querySelectorAll('.canvas-node').forEach(el=>el.classList.toggle('is-selected',el.dataset.canvasNode===id));
      if(!e.target.closest('[data-canvas-drag]')){return;}
      if(!ensureWrite())return;
      const n=nodeById(id);
      gesture={kind:'node',id,x:e.clientX,y:e.clientY,startX:n.x,startY:n.y,moved:false};
    }else{
      if(e.target.closest('button,input,textarea'))return;
      selected=null;drawInspector();
      gesture={kind:'pan',x:e.clientX,y:e.clientY,startX:offset.x,startY:offset.y,moved:false};
    }
    viewer().setPointerCapture?.(e.pointerId);
  });
  viewer().addEventListener('pointermove',e=>{
    if(!gesture)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(Math.abs(dx)+Math.abs(dy)>2)gesture.moved=true;
    if(gesture.kind==='pan'){
      offset.x=gesture.startX+dx;offset.y=gesture.startY+dy;updateCamera();return;
    }
    const n=nodeById(gesture.id);if(!n)return;
    n.x=Math.round(gesture.startX+dx/zoom);n.y=Math.round(gesture.startY+dy/zoom);
    const el=$('canvasNodes').querySelector('[data-canvas-node="'+n.id+'"]');
    if(el){el.style.left=n.x+'px';el.style.top=n.y+'px';}
    updateEdges();
  });
  const finishPointer=()=>{
    if(!gesture)return;
    if(gesture.kind==='node'&&gesture.moved)dirty();
    gesture=null;
  };
  viewer().addEventListener('pointerup',finishPointer);
  viewer().addEventListener('pointercancel',finishPointer);
  viewer().addEventListener('dblclick',e=>{
    if(e.target.closest('[data-canvas-node]'))return;
    addNode('note');
  });
  viewer().addEventListener('wheel',e=>{
    e.preventDefault();
    const rect=viewer().getBoundingClientRect();
    adjustZoom(e.deltaY<0?1.10:1/1.10,{x:e.clientX-rect.left,y:e.clientY-rect.top});
  },{passive:false});
  document.addEventListener('keydown',e=>{
    if($('canvasView').hidden)return;
    if(e.key==='Escape'){connectFrom=null;return;}
    if(e.target.closest('input,textarea,select,[contenteditable]'))return;
    if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();removeSelected();}
  });
}
export function setupCanvas(deps){
  if(initialized)return;
  initialized=true;
  ({api,toast,isGuest:guest,requireAccount:gate}=deps);
  bindCanvasEvents();
}
export async function loadCanvas(){
  if(!initialized)return;
  if(guest()){
    board={id:'demo',title:'Planejamento de viagem (demonstração)',revision:1,snapshot:exampleCanvas()};
    boards=[{id:'demo',title:board.title}];links=new Map();selected=null;conflicted=false;
    $('canvasEmpty').hidden=true;
    $('canvasBoardTitle').value=board.title;
    $('canvasBoardTitle').disabled=true;
    paintBoardNames();resetCamera();draw();
    setStatus('Demonstração — sem salvar');
    return;
  }
  $('canvasBoardTitle').disabled=false;
  if(board && !await saveNow())return;
  try{await listBoards();}catch(e){setStatus('Erro ao carregar','error');toast(e.message,true);}
}
export function resetCanvas(){
  clearTimeout(saveTimer);saveTimer=null;board=null;boards=[];links=new Map();selected=null;
  saving=false;editEpoch=0;savedEpoch=0;conflicted=false;
  if(initialized){$('canvasNodes').replaceChildren();$('canvasEdges').replaceChildren();$('canvasInspector').hidden=true;}
}
