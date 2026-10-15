// Relembra Mapas Mentais — ideias, tarefas, vídeos e modelos com mapas privados.
import {MAP_TEMPLATES,makeMentalTemplate,graphFromOutline} from './canvas-templates.js';
// Coordenadas e conexões persistem no D1; visitantes veem apenas um mapa fictício.
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const apiPath=id=>'/api/canvas/'+encodeURIComponent(id);
const colors=['#4d8896','#278a69','#b78050','#9a76b5','#b86572','#71809a'];
let chosenTemplate='mind',creationBusy=false,videoSearchTimer=null,videoSearchEpoch=0;
const bounds=(v,a,b)=>Math.max(a,Math.min(b,v));
const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');};
const makeNode=(type,x,y)=>({
  id:crypto.randomUUID(),type,x:Math.round(x),y:Math.round(y),
  width:type==='group'?430:type==='video'?305:270,height:type==='group'?250:type==='video'?190:170,
  title:{note:'Nova anotação',task:'Nova tarefa',link:'Nova referência',group:'Grupo de ideias',video:'Vídeo da biblioteca'}[type],
  body:'',color:colors[0],
  ...(type==='task'?{due_date:today(),priority:2,done:false}:{}),
  ...(type==='link'?{url:''}:{}),
  ...(type==='video'?{video_id:''}:{})
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
let api,toast,guest,gate,openVideo;
let board=null,boards=[],links=new Map(),selected=null,selectedEdge=null,connectFrom=null,zoom=1,offset={x:90,y:64};
let quickPosition=null,connectDraft=null;
let saveTimer=null,saving=false,editEpoch=0,savedEpoch=0,conflicted=false,initialized=false,retryCount=0;
const viewer=()=>$('canvasViewport');
const snap=()=>board?.snapshot;
const nodeById=id=>snap()?.nodes.find(n=>n.id===id);

export function canvasWorldPoint(clientX,clientY,rect,origin,scale){
  return {x:(clientX-rect.left-origin.x)/scale,y:(clientY-rect.top-origin.y)/scale};
}
export function canvasCanConnect(nodes,edges,from,to){
  return from!==to && nodes.some(n=>n.id===from) && nodes.some(n=>n.id===to)
    && !edges.some(e=>e.from===from&&e.to===to);
}
function worldPoint(x,y){return canvasWorldPoint(x,y,viewer().getBoundingClientRect(),offset,zoom);}
function viewportPoint(p){return {x:p.x*zoom+offset.x,y:p.y*zoom+offset.y};}
function closeQuickCreate(){
  $('canvasQuickCreate').hidden=true;
  $('canvasQuickTitle').value='';
  quickPosition=null;
}
function openQuickCreate(clientX,clientY,from=null){
  if(!ensureWrite()||!board)return;
  const rect=viewer().getBoundingClientRect(),menu=$('canvasQuickCreate');
  const px=bounds(clientX-rect.left,10,Math.max(10,rect.width-10));
  const py=bounds(clientY-rect.top,10,Math.max(10,rect.height-10));
  quickPosition={...worldPoint(clientX,clientY),from};
  menu.hidden=false;
  const menuWidth=Math.min(294,rect.width-20),menuHeight=Math.min(330,rect.height-20);
  menu.style.left=bounds(px,10,Math.max(10,rect.width-menuWidth-10))+'px';
  menu.style.top=bounds(py,10,Math.max(10,rect.height-menuHeight-10))+'px';
  $('canvasQuickTitle').focus();
}
function closeConnection(){
  connectDraft=null;
  connectFrom=null;
  viewer().classList.remove('is-connecting');
  $('canvasNodes').querySelectorAll('.canvas-node.is-connect-target').forEach(n=>n.classList.remove('is-connect-target'));
  updateEdges();
}
function nodePort(node,port){
  const x=node.x,y=node.y,w=node.width,h=node.height;
  return {top:{x:x+w/2,y},right:{x:x+w,y:y+h/2},bottom:{x:x+w/2,y:y+h},left:{x,y:y+h/2}}[port]||{x:x+w,y:y+h/2};
}
function choosePort(node,point){
  const cx=node.x+node.width/2,cy=node.y+node.height/2;
  return Math.abs((point.x-cx)/node.width)>Math.abs((point.y-cy)/node.height)
    ?point.x<cx?'left':'right'
    :point.y<cy?'top':'bottom';
}
// Curvas cúbicas com tangentes opostas. Nunca prolongar o controle final
// além do cartão de destino: isso gerava voltas e laços indesejados.
export function canvasCurve(p,q,fromPort=null,toPort=null){
  const axis=Math.abs(q.x-p.x)>=Math.abs(q.y-p.y)?'horizontal':'vertical';
  const start=fromPort||(axis==='horizontal'?(q.x>=p.x?'right':'left'):(q.y>=p.y?'bottom':'top'));
  const opposite={left:'right',right:'left',top:'bottom',bottom:'top'};
  const finish=toPort||opposite[start];
  const directions={
    left:{x:-1,y:0},right:{x:1,y:0},top:{x:0,y:-1},bottom:{x:0,y:1}
  };
  const a=directions[start],b=directions[finish];
  if(!a||!b)return 'M'+p.x+','+p.y+' L'+q.x+','+q.y;
  const distance=Math.hypot(q.x-p.x,q.y-p.y);
  const aligned=a.x&&b.x?-Math.sign(a.x*b.x)*(q.x-p.x)*a.x
    :a.y&&b.y?-Math.sign(a.y*b.y)*(q.y-p.y)*a.y:distance;
  const length=Math.max(0,Math.min(110,distance*.33,Math.abs(aligned)*.46));
  // No caso de cartões sobrepostos, não alongar as tangentes ao contrário.
  const forward=(q.x-p.x)*a.x+(q.y-p.y)*a.y;
  const backward=(p.x-q.x)*b.x+(p.y-q.y)*b.y;
  const handle=(a.x&&b.x||a.y&&b.y)&&Math.min(forward,backward)<0?0:length;
  const c1={x:p.x+a.x*handle,y:p.y+a.y*handle};
  const c2={x:q.x+b.x*handle,y:q.y+b.y*handle};
  return 'M'+p.x+','+p.y+' C'+c1.x+','+c1.y+' '+c2.x+','+c2.y+' '+q.x+','+q.y;
}
// Define sempre lados opostos das duas bordas, priorizando espaço livre.
export function canvasConnectionRoute(from,to){
  const dx=to.x+to.width/2-from.x-from.width/2;
  const dy=to.y+to.height/2-from.y-from.height/2;
  const clearX=Math.abs(dx)-(from.width+to.width)/2;
  const clearY=Math.abs(dy)-(from.height+to.height)/2;
  const horizontal=clearX>0&&clearY>0?clearX>=clearY
    :clearX>0?true:clearY>0?false
    :Math.abs(dx)/(from.width+to.width)>=Math.abs(dy)/(from.height+to.height);
  const fromPort=horizontal?(dx>=0?'right':'left'):(dy>=0?'bottom':'top');
  const toPort={right:'left',left:'right',bottom:'top',top:'bottom'}[fromPort];
  const p=nodePort(from,fromPort),q=nodePort(to,toPort);
  return {p,q,fromPort,toPort,d:canvasCurve(p,q,fromPort,toPort)};
}
function createConnection(from,to){
  if(!board||!canvasCanConnect(snap().nodes,snap().edges,from,to))return false;
  if(snap().edges.length>=400){toast('Limite de 400 conexões por quadro.',true);return false;}
  snap().edges.push({id:crypto.randomUUID(),from,to,label:''});
  selectedEdge=null;dirty();draw();return true;
}
function selectEdge(id){selected=null;selectedEdge=id;draw();}
function edgeMidpoint(edge){
  const a=nodeById(edge.from),b=nodeById(edge.to);
  if(!a||!b)return {x:0,y:0};
  const {p,q}=canvasConnectionRoute(a,b);
  return viewportPoint({x:(p.x+q.x)/2,y:(p.y+q.y)/2});
}
function positionEdgeEditor(){
  const editor=$('canvasEdgeEditor'),edge=snap()?.edges.find(e=>e.id===selectedEdge);
  editor.hidden=!edge;
  if(!edge)return;
  const rect=viewer().getBoundingClientRect(),point=edgeMidpoint(edge);
  editor.style.left=bounds(point.x-104,10,Math.max(10,rect.width-218))+'px';
  editor.style.top=bounds(point.y-72,10,Math.max(10,rect.height-110))+'px';
  if(document.activeElement!==$('canvasEdgeLabel'))$('canvasEdgeLabel').value=edge.label||'';
}
function removeEdge(){
  if(!selectedEdge||!ensureWrite())return;
  snap().edges=snap().edges.filter(e=>e.id!==selectedEdge);
  selectedEdge=null;dirty();draw();
}

function setStatus(message,kind=''){
  $('canvasSaveState').textContent=message;
  $('canvasSaveState').dataset.state=kind;
}
function dirty(){
  if(guest())return;
  editEpoch++;
  retryCount=0;
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
  const targetBoard=board,targetEpoch=editEpoch;
  let canRetry=false;
  setStatus('Salvando…');
  try{
    // Copia o snapshot antes do envio. Um arrasto em andamento não deve
    // alterar os dados de uma requisição que já saiu.
    const snapshot=structuredClone(snap());
    const result=await api(apiPath(targetBoard.id),{
      method:'PUT',body:JSON.stringify({title:targetBoard.title,revision:targetBoard.revision,snapshot})
    });
    if(board!==targetBoard)return false; // Logout/troca de conta durante o POST.
    targetBoard.revision=result.revision;
    savedEpoch=targetEpoch;
    targetBoard.updated_at=result.updated_at;
    retryCount=0;
    setStatus(editEpoch===savedEpoch?'Salvo':'Alterações pendentes',editEpoch===savedEpoch?'ok':'');
    return true;
  }catch(e){
    if(board!==targetBoard)return false;
    if(/outra aba|recarregue|alterado/i.test(e.message)){
      conflicted=true;setStatus('Conflito de edição — recarregue o mapa','error');
      toast('Outra aba modificou este mapa. Suas alterações locais não serão sobrescritas.',true);
    }else{
      retryCount++;
      canRetry=retryCount<=3&&/rede|network|fetch|conexão|servidor|processar|tempor|timeout|503|502|500/i.test(e.message);
      setStatus(canRetry?'Falha temporária — tentando novamente':'Falha ao salvar — revise o mapa e tente novamente','error');
      if(retryCount===1 || !canRetry)toast('Não foi possível salvar o mapa: '+e.message,true);
    }
    return false;
  }finally{
    saving=false;
    if(board===targetBoard&&!conflicted&&savedEpoch!==editEpoch &&
      (editEpoch!==targetEpoch||canRetry)){
      clearTimeout(saveTimer);
      saveTimer=setTimeout(()=>{void saveNow()},canRetry?Math.min(9000,1000*2**retryCount):900);
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
  $('canvasWorkspaceBar').dataset.hasMap=String(Boolean(board));
  $('canvasMapCount').textContent=boards.length===1?'1 mapa salvo':boards.length+' mapas salvos';
  $('canvasBoardSelect').disabled=!board;
  $('canvasSaveNow').disabled=!board||guest();
  if(board)select.value=board.id;
}
function resetCamera(){
  const nodes=snap()?.nodes||[];
  const rect=viewer().getBoundingClientRect();
  if(!nodes.length||!rect.width||!rect.height){
    zoom=1;offset={x:85,y:64};updateCamera();return;
  }
  const minX=Math.min(...nodes.map(n=>n.x)),maxX=Math.max(...nodes.map(n=>n.x+n.width));
  const minY=Math.min(...nodes.map(n=>n.y)),maxY=Math.max(...nodes.map(n=>n.y+n.height));
  const w=Math.max(1,maxX-minX),h=Math.max(1,maxY-minY);
  zoom=bounds(Math.min((rect.width-100)/w,(rect.height-100)/h,1.1),.35,2.5);
  offset={x:(rect.width-w*zoom)/2-minX*zoom,y:(rect.height-h*zoom)/2-minY*zoom};
  updateCamera();
}
function updateCamera(){
  $('canvasWorld').style.transform=`translate(${offset.x}px,${offset.y}px) scale(${zoom})`;
  $('canvasZoomLevel').textContent=Math.round(zoom*100)+'%';
  positionEdgeEditor();
}
function updateEdges(){
  const svg=$('canvasEdges');svg.replaceChildren();
  if(!board)return;
  const ns='http://www.w3.org/2000/svg';
  const defs=document.createElementNS(ns,'defs');
  const marker=document.createElementNS(ns,'marker');
  marker.setAttribute('id','canvasArrow');marker.setAttribute('markerWidth','9');marker.setAttribute('markerHeight','9');
  marker.setAttribute('refX','8');marker.setAttribute('refY','4.5');marker.setAttribute('orient','auto');
  marker.setAttribute('markerUnits','userSpaceOnUse');
  const tip=document.createElementNS(ns,'path');
  tip.setAttribute('d','M1 1 L8 4.5 L1 8 z');tip.setAttribute('class','canvas-arrow-tip');
  marker.append(tip);defs.append(marker);svg.append(defs);
  for(const edge of snap().edges){
    const a=nodeById(edge.from),b=nodeById(edge.to);
    if(!a||!b)continue;
    const {p,q,d}=canvasConnectionRoute(a,b);
    const visible=document.createElementNS(ns,'path');
    visible.setAttribute('d',d);visible.setAttribute('class','canvas-edge-line'+(selectedEdge===edge.id?' is-selected':''));
    visible.setAttribute('marker-end','url(#canvasArrow)');svg.append(visible);
    const hit=document.createElementNS(ns,'path');
    hit.setAttribute('d',d);hit.setAttribute('class','canvas-edge-hit');
    hit.dataset.canvasEdge=edge.id;hit.setAttribute('aria-label','Editar conexão');hit.setAttribute('tabindex','0');hit.setAttribute('role','button');svg.append(hit);
    if(edge.label){
      const label=document.createElementNS(ns,'text');
      label.setAttribute('x',String((p.x+q.x)/2));
      label.setAttribute('y',String((p.y+q.y)/2-12));
      label.setAttribute('class','canvas-edge-label');
      label.textContent=edge.label;svg.append(label);
    }
  }
  if(connectDraft){
    const start=nodeById(connectDraft.from);
    if(start){
      const p=nodePort(start,connectDraft.port);
      const dest=connectDraft.targetId?nodeById(connectDraft.targetId):null;
      const endPort=dest?choosePort(dest,p):null;
      const q=dest?nodePort(dest,endPort):(connectDraft.point||p);
      const preview=document.createElementNS(ns,'path');
      preview.setAttribute('d',canvasCurve(p,q,connectDraft.port,endPort));
      preview.setAttribute('class','canvas-edge-preview');svg.append(preview);
    }
  }
  positionEdgeEditor();
}
function cardHtml(n){
  const selectedClass=selected===n.id?' is-selected':'';
  const linked=links.get(n.id);
  const snippet=esc(n.body|| (n.type==='task'?'Defina uma data e envie ao Radar.':n.type==='link'?'Adicione um link de referência.':'Clique para editar este cartão.'));
  const badge={note:'Ideia',task:'Tarefa',link:'Link',group:'Grupo',video:'Vídeo salvo'}[n.type];
  return `<article class="canvas-node canvas-type-${n.type}${selectedClass}" data-canvas-node="${n.id}"
    style="left:${n.x}px;top:${n.y}px;width:${n.width}px;height:${n.height}px;--canvas-accent:${n.color}"
    tabindex="0" aria-label="${esc(n.title)}">
    <div class="canvas-node-head" data-canvas-drag="${n.id}"><span class="canvas-node-dot"></span><span class="canvas-node-kind">${badge}</span><span class="canvas-node-grip" aria-hidden="true">⠿</span></div>
    <strong class="canvas-node-title">${esc(n.title)}</strong>
    <p class="canvas-node-body">${snippet}</p>
    ${n.type==='task'?'<div class="canvas-node-foot"><span>'+esc(n.due_date||'Sem prazo')+'</span><span>'+ (linked?(linked.done_at?'✓ Concluída':'↗ Radar'):(n.done?'✓ Concluída':'Não vinculada'))+'</span></div>':''}
    ${n.type==='link'&&n.url?'<small class="canvas-node-url">'+esc(n.url)+'</small>':''}
    ${n.type==='video'?'<span class="mental-video-node-badge">▣ Vídeo da biblioteca</span>':''}
    <div class="canvas-node-ports" aria-label="Conectar cartões">
      ${['top','right','bottom','left'].map(port=>`<button class="canvas-port canvas-port-${port}" type="button"
        data-canvas-port="${port}" data-canvas-owner="${n.id}" aria-label="Arraste para conectar: ${esc(n.title)}"
        title="Arraste para conectar"></button>`).join('')}
    </div>
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
  $('canvasNodeType').textContent={note:'Ideia',task:'Tarefa',link:'Link',group:'Grupo',video:'Vídeo da biblioteca'}[n.type];
  $('canvasVideoOpen').hidden=n.type!=='video';
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
function addNode(type,at=null,title='',linkedFrom=null){
  if(!ensureWrite()||!board)return;
  if(snap().nodes.length>=250){toast('Limite de 250 cartões por quadro.',true);return;}
  const rect=viewer().getBoundingClientRect();
  const point=at||{x:(rect.width*.45-offset.x)/zoom,y:(rect.height*.35-offset.y)/zoom};
  const n=makeNode(type,bounds(point.x,-8000,8000),bounds(point.y,-8000,8000));
  if(title.trim())n.title=title.trim().slice(0,120);
  snap().nodes.push(n);
  if(linkedFrom && snap().edges.length<400 && canvasCanConnect(snap().nodes,snap().edges,linkedFrom,n.id)){
    snap().edges.push({id:crypto.randomUUID(),from:linkedFrom,to:n.id,label:''});
  }
  selected=n.id;selectedEdge=null;
  closeQuickCreate();closeConnection();
  dirty();draw();
  // O cartão é criado pronto para escrever; não é preciso abrir outro formulário.
  if(!title.trim())beginInlineEdit(n.id,'title');
  else $('canvasNodeBody').focus();
  return n;
}
function quickAdd(type){
  const position=quickPosition;
  if(!position)return;
  addNode(type,{x:position.x,y:position.y},$('canvasQuickTitle').value,position.from);
}
function beginInlineEdit(id,field){
  if(!ensureWrite())return;
  const n=nodeById(id),card=$('canvasNodes').querySelector('[data-canvas-node="'+id+'"]');
  if(!n||!card)return;
  selected=id;selectedEdge=null;drawInspector();
  const target=card.querySelector(field==='title'?'.canvas-node-title':'.canvas-node-body');
  if(!target)return;
  if(target.querySelector('input,textarea'))return;
  const edit=document.createElement(field==='title'?'input':'textarea');
  edit.className='canvas-inline-editor';
  edit.value=n[field]||'';
  edit.maxLength=field==='title'?120:2200;
  edit.setAttribute('aria-label',field==='title'?'Editar título diretamente':'Editar descrição diretamente');
  if(field==='body')edit.rows=4;
  target.replaceChildren(edit);edit.focus();edit.select();
  let finished=false;
  const finish=cancel=>{
    if(finished)return;
    finished=true;
    if(!cancel){
      const value=edit.value.trim().slice(0,field==='title'?120:2200);
      if(field!=='title'||value){
        if(n[field]!==value){n[field]=value;dirty();}
      }
    }
    // Recria o cartão de modo seguro, sem inserir HTML digitado pelo usuário.
    draw();
  };
  edit.addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.stopPropagation();e.preventDefault();finish(true);}
    if(e.key==='Enter'&&field==='title'){e.preventDefault();finish(false);}
    if(e.key==='Enter'&&e.ctrlKey&&field==='body'){e.preventDefault();finish(false);}
  });
  edit.addEventListener('blur',()=>finish(false),{once:true});
}
function removeSelected(){
  if(!ensureWrite()||!selectedNode())return;
  const id=selected;snap().nodes=snap().nodes.filter(x=>x.id!==id);
  snap().edges=snap().edges.filter(e=>e.from!==id&&e.to!==id);
  selected=null;selectedEdge=null;dirty();draw();
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
  closeQuickCreate();
  viewer().classList.remove('is-connecting');
  selected=null;selectedEdge=null;connectFrom=null;connectDraft=null;conflicted=false;editEpoch=0;savedEpoch=0;
  resetCamera();paintBoardNames();draw();setStatus('Salvo','ok');
}
async function listBoards(){
  const result=await api('/api/canvas');boards=result.boards;
  paintBoardNames();
  if(!boards.length){
    board=null;selected=null;$('canvasBoardTitle').value='';paintBoardNames();draw();setStatus('Crie seu primeiro mapa mental');
    $('canvasEmpty').hidden=false;return;
  }
  $('canvasEmpty').hidden=true;
  await loadBoard(boards.some(b=>b.id===board?.id)?board.id:boards[0].id);
}
function buildTemplateGallery(){
  const gallery=$('canvasTemplateGallery');gallery.replaceChildren();
  for(const template of MAP_TEMPLATES){
    const btn=document.createElement('button');
    btn.type='button';btn.className='mental-template-card';btn.dataset.template=template.id;
    btn.setAttribute('role','radio');
    btn.setAttribute('aria-checked',String(chosenTemplate===template.id));
    btn.style.setProperty('--mental-color',template.color);
    const header=document.createElement('div');header.className='mental-card-header';
    const tag=document.createElement('span');tag.textContent=template.tag;
    const check=document.createElement('b');check.textContent='✓';
    header.append(tag,check);
    const visual=document.createElement('div');visual.className='mental-template-drawing';
    visual.setAttribute('aria-hidden','true');
    visual.innerHTML='<span class="mental-preview-lines"></span><span class="mental-preview-center"></span>'+
      '<span class="mental-preview-leaf one"></span><span class="mental-preview-leaf two"></span>'+
      '<span class="mental-preview-leaf three"></span><span class="mental-preview-leaf four"></span>';
    if(template.id==='blank')visual.classList.add('mental-preview-blank');
    const title=document.createElement('strong');title.textContent=template.title;
    const detail=document.createElement('small');detail.textContent=template.description;
    btn.append(header,visual,title,detail);
    btn.addEventListener('click',()=>pickTemplate(template.id));
    gallery.append(btn);
  }
}
function pickTemplate(id){
  chosenTemplate=MAP_TEMPLATES.some(t=>t.id===id)?id:'mind';
  $('canvasTemplateGallery').querySelectorAll('[data-template]').forEach(btn=>{
    btn.setAttribute('aria-checked',String(btn.dataset.template===chosenTemplate));
  });
}
function closeCreateDialog(){
  if(creationBusy)return;
  $('canvasCreateOverlay').hidden=true;
}
function openCreateDialog(template='mind'){
  if(!ensureWrite())return;
  chosenTemplate=MAP_TEMPLATES.some(t=>t.id===template)?template:'mind';
  buildTemplateGallery();
  $('mentalNewName').value='';
  $('canvasCreateOverlay').hidden=false;
  $('canvasMapOptions').open=false;
  $('mentalNewName').focus();
}
async function createBoardWithSnapshot(title,startingSnapshot){
  if(!ensureWrite()||!await saveNow())return false;
  const name=String(title||'').trim().slice(0,100);
  if(!name)throw new Error('Escolha um nome para seu mapa mental.');
  // A criação é atômica para a interface: se salvar o modelo falhar, apaga o mapa novo.
  const res=await api('/api/canvas',{method:'POST',body:JSON.stringify({title:name})});
  let created=res.board;
  try{
    if(startingSnapshot?.nodes?.length){
      const updated=await api(apiPath(created.id),{method:'PUT',
        body:JSON.stringify({title:name,revision:created.revision,snapshot:startingSnapshot})});
      created={...created,snapshot:startingSnapshot,revision:updated.revision,updated_at:updated.updated_at};
    }
  }catch(error){
    try{await api(apiPath(created.id),{method:'DELETE'});}catch{}
    throw error;
  }
  boards.unshift({id:created.id,title:name,revision:created.revision});
  board=created;links=new Map();selected=null;selectedEdge=null;connectFrom=null;connectDraft=null;
  editEpoch=0;savedEpoch=0;conflicted=false;
  $('canvasBoardTitle').value=board.title;
  $('canvasEmpty').hidden=true;
  $('canvasCreateOverlay').hidden=true;
  $('canvasAIDialog').hidden=true;
  closeQuickCreate();resetCamera();paintBoardNames();draw();setStatus('Salvo','ok');
  toast('Seu mapa mental foi criado. Você já pode editar as ideias.');
  return true;
}
async function confirmCreateMap(){
  if(creationBusy)return;
  const title=$('mentalNewName').value.trim();
  if(!title){$('mentalNewName').focus();toast('Dê um nome ao mapa para continuar.',true);return;}
  creationBusy=true;$('canvasCreateConfirm').disabled=true;$('canvasCreateConfirm').textContent='Criando mapa…';
  try{await createBoardWithSnapshot(title,makeMentalTemplate(chosenTemplate,title));}
  catch(e){toast(e.message,true);}
  finally{
    creationBusy=false;
    $('canvasCreateConfirm').disabled=false;
    $('canvasCreateConfirm').innerHTML='Criar meu mapa <span>→</span>';
  }
}
function closeAIDialog(){
  if(creationBusy)return;
  $('canvasAIDialog').hidden=true;
}
function openAIDialog(){
  if(!ensureWrite())return;
  $('canvasAIDialog').hidden=false;
  $('mentalAIPrompt').value='';
  $('mentalAIStatus').textContent='Até 6 gerações por hora.';
  $('mentalAIPrompt').focus();
}
async function confirmAIMap(){
  if(creationBusy)return;
  const prompt=$('mentalAIPrompt').value.trim();
  if(prompt.length<8){toast('Descreva o assunto com mais detalhes.',true);$('mentalAIPrompt').focus();return;}
  creationBusy=true;$('canvasAIConfirm').disabled=true;$('mentalAIStatus').textContent='Organizando as ideias…';
  try{
    const outline=await api('/api/canvas/outline',{method:'POST',body:JSON.stringify({prompt})});
    const title=prompt.slice(0,100);
    const graph=graphFromOutline(title,outline);
    if(await createBoardWithSnapshot(title,graph))toast('Seu mapa com IA está pronto para editar.');
  }catch(e){$('mentalAIStatus').textContent='Não foi possível gerar. Tente novamente ou escolha um modelo.';toast(e.message,true);}
  finally{creationBusy=false;$('canvasAIConfirm').disabled=false;}
}
function closeVideoDialog(){
  clearTimeout(videoSearchTimer);
  videoSearchEpoch++;
  $('canvasVideoDialog').hidden=true;
}
async function searchLibraryVideos(){
  if(guest()||$('canvasVideoDialog').hidden)return;
  const q=$('mentalVideoSearch').value.trim();
  const serial=++videoSearchEpoch,results=$('mentalVideoResults');
  results.replaceChildren();
  const loading=document.createElement('p');loading.className='mental-video-empty';loading.textContent='Buscando na sua biblioteca…';results.append(loading);
  try{
    const query=new URLSearchParams({limit:'50',q});
    const response=await api('/api/videos?'+query);
    if(serial!==videoSearchEpoch||$('canvasVideoDialog').hidden)return;
    results.replaceChildren();
    const videos=Array.isArray(response.videos)?response.videos:[];
    if(!videos.length){
      const empty=document.createElement('div');empty.className='mental-video-empty';
      empty.textContent=q?'Nenhum vídeo encontrado. Experimente outra busca.':'Sua biblioteca ainda não tem vídeos salvos.';
      results.append(empty);return;
    }
    for(const video of videos){
      const row=document.createElement('button');row.type='button';row.className='mental-video-row';
      row.setAttribute('role','listitem');
      const icon=document.createElement('span');icon.className='mental-video-icon';icon.textContent='▣';
      const copy=document.createElement('span');
      const title=document.createElement('strong');title.textContent=video.title||'Vídeo sem título';
      const source=document.createElement('small');source.textContent=video.url||'Vídeo salvo no Relembra';
      copy.append(title,source);
      const plus=document.createElement('span');plus.textContent='＋';plus.setAttribute('aria-hidden','true');
      row.append(icon,copy,plus);
      row.addEventListener('click',()=>addVideoToMap(video));
      results.append(row);
    }
  }catch(e){
    if(serial!==videoSearchEpoch)return;
    results.replaceChildren();
    const msg=document.createElement('div');msg.className='mental-video-empty';msg.textContent=e.message;results.append(msg);
  }
}
function openVideoDialog(){
  if(!ensureWrite())return;
  if(!board){toast('Crie um mapa mental antes de adicionar vídeos.',true);openCreateDialog('mind');return;}
  $('canvasVideoDialog').hidden=false;
  $('mentalVideoSearch').value='';
  $('mentalVideoSearch').focus();
  void searchLibraryVideos();
}
function addVideoToMap(video){
  if(!ensureWrite()||!board||snap().nodes.length>=250)return;
  const rect=viewer().getBoundingClientRect();
  const point={x:(rect.width*.43-offset.x)/zoom,y:(rect.height*.34-offset.y)/zoom};
  const node=makeNode('video',bounds(point.x,-8000,8000),bounds(point.y,-8000,8000));
  node.title=String(video.title||'Vídeo salvo').slice(0,120);
  node.body=String(video.summary||video.notes||'Referência da sua biblioteca').slice(0,2200);
  node.video_id=video.id;node.color='#278a69';
  snap().nodes.push(node);selected=node.id;selectedEdge=null;dirty();
  closeVideoDialog();draw();toast('Vídeo adicionado ao mapa mental.');
}
async function changeBoard(id){
  if(board?.id===id)return;
  if(!await saveNow()){$('canvasBoardSelect').value=board.id;return;}
  try{await loadBoard(id);}catch(e){toast(e.message,true);}
}
async function removeBoard(){
  if(!board||!ensureWrite())return;
  if(!confirm('Excluir este mapa mental? As tarefas já enviadas ao Radar continuarão lá.'))return;
  try{
    await api(apiPath(board.id),{method:'DELETE'});
    board=null;await listBoards();
    $('canvasMapOptions').open=false;
    toast('Mapa excluído. Tarefas do Radar preservadas.');
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
  $('canvasCreateBoard').addEventListener('click',()=>openCreateDialog());
  $('canvasEmptyCreate').addEventListener('click',()=>openCreateDialog());
  $('canvasOpenGallery').addEventListener('click',()=>openCreateDialog('mind'));
  $('canvasAIGenerate').addEventListener('click',openAIDialog);
  $('canvasOpenLibrary').addEventListener('click',openVideoDialog);
  $('canvasCreateClose').addEventListener('click',closeCreateDialog);
  $('canvasCreateCancel').addEventListener('click',closeCreateDialog);
  $('canvasCreateConfirm').addEventListener('click',()=>void confirmCreateMap());
  $('mentalNewName').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();void confirmCreateMap();}});
  $('canvasTemplateGallery').addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;
    e.preventDefault();
    const index=MAP_TEMPLATES.findIndex(t=>t.id===chosenTemplate);
    const next=MAP_TEMPLATES[(index+(e.key==='ArrowLeft'||e.key==='ArrowUp'?-1:1)+MAP_TEMPLATES.length)%MAP_TEMPLATES.length];
    pickTemplate(next.id);
    $('canvasTemplateGallery').querySelector('[data-template="'+next.id+'"]')?.focus();
  });
  $('canvasEmptyTemplates').addEventListener('click',e=>{
    const selected=e.target.closest('[data-mental-template]')?.dataset.mentalTemplate;
    if(selected)openCreateDialog(selected);
  });
  $('canvasAIClose').addEventListener('click',closeAIDialog);
  $('canvasAICancel').addEventListener('click',closeAIDialog);
  $('canvasAIConfirm').addEventListener('click',()=>void confirmAIMap());
  $('canvasVideoClose').addEventListener('click',closeVideoDialog);
  $('mentalVideoSearch').addEventListener('input',()=>{
    clearTimeout(videoSearchTimer);
    videoSearchTimer=setTimeout(()=>void searchLibraryVideos(),250);
  });
  $('canvasVideoOpen').addEventListener('click',()=>{
    const node=selectedNode();
    if(node?.type==='video'&&node.video_id&&typeof openVideo==='function')void openVideo(node.video_id);
  });
  for(const id of ['canvasCreateOverlay','canvasAIDialog','canvasVideoDialog']){
    $(id).addEventListener('pointerdown',e=>{
      if(e.target!==$(id))return;
      if(id==='canvasCreateOverlay')closeCreateDialog();
      if(id==='canvasAIDialog')closeAIDialog();
      if(id==='canvasVideoDialog')closeVideoDialog();
    });
  }
  $('canvasRemoveBoard').addEventListener('click',()=>void removeBoard());
  $('canvasBoardTitle').addEventListener('change',e=>{
    if(!board||!ensureWrite())return;
    board.title=e.target.value.trim().slice(0,100)||board.title;
    e.target.value=board.title;
    const item=boards.find(b=>b.id===board.id);if(item)item.title=board.title;
    paintBoardNames();dirty();
  });
  for(const type of ['note','task','link','group']){
    $('canvasAdd'+type[0].toUpperCase()+type.slice(1)).addEventListener('click',()=>addNode(type));
  }
  $('canvasFloatingAdd').addEventListener('click',e=>{
    e.stopPropagation();
    const r=viewer().getBoundingClientRect();
    openQuickCreate(r.left+Math.min(r.width-25,80),r.top+Math.max(65,r.height-350));
  });
  $('canvasQuickClose').addEventListener('click',closeQuickCreate);
  $('canvasQuickCreate').addEventListener('click',e=>{
    const type=e.target.closest('[data-canvas-create]')?.dataset.canvasCreate;
    if(type)addFromMenu(type);
  });
  $('canvasQuickTitle').addEventListener('keydown',e=>{
    if(e.key==='Escape'){e.preventDefault();closeQuickCreate();}
    if(e.key==='Enter'){e.preventDefault();addFromMenu('note');}
  });
  function addFromMenu(type){quickAdd(type);}
  $('canvasEdgeDelete').addEventListener('click',removeEdge);
  $('canvasEdgeLabel').addEventListener('input',e=>{
    const edge=snap()?.edges.find(x=>x.id===selectedEdge);
    if(!edge||!ensureWrite())return;
    edge.label=e.target.value.slice(0,60);
    dirty();updateEdges();
  });
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
  // Fallback acessível: selecionar um cartão e clicar no cartão de destino.
  $('canvasConnect').addEventListener('click',()=>{
    if(!ensureWrite())return;
    connectFrom=selectedNode()?.id||null;
    if(connectFrom){
      viewer().classList.add('is-connecting');
      toast('Clique no cartão de destino ou arraste um ponto na borda.');
    }else toast('Selecione o primeiro cartão antes de conectar.');
  });
  const fields=[
    ['canvasNodeTitle','title'],['canvasNodeBody','body'],['canvasNodeUrl','url'],
    ['canvasNodeColor','color'],['canvasNodeDue','due_date'],['canvasNodePriority','priority']
  ];
  for(const [id,field] of fields){
    $(id).addEventListener('input',e=>{
      const n=selectedNode();if(!n||!ensureWrite())return;
      const val=field==='priority'?Number(e.target.value):e.target.value;
      n[field]=field==='title'?(val.slice(0,120)||'Nova anotação'):field==='body'?val.slice(0,2200):val;
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
  const targetAt=(x,y)=>document.elementFromPoint(x,y)?.closest('[data-canvas-node]')?.dataset.canvasNode||null;
  viewer().addEventListener('pointerdown',e=>{
    if(e.button!==0||!board)return;
    // Formulários flutuantes são interativos; clicar neles não move o mapa.
    if(e.target.closest('#canvasQuickCreate,#canvasEdgeEditor,.canvas-zoom,#canvasFloatingAdd,#canvasEmpty'))return;
    const edge=e.target.closest('[data-canvas-edge]');
    if(edge){
      closeQuickCreate();selectEdge(edge.dataset.canvasEdge);
      e.preventDefault();return;
    }
    const port=e.target.closest('[data-canvas-port]');
    if(port){
      if(!ensureWrite())return;
      closeQuickCreate();
      selectedEdge=null;
      const from=port.dataset.canvasOwner,side=port.dataset.canvasPort;
      const origin=nodeById(from);if(!origin)return;
      connectFrom=null;
      connectDraft={from,port:side,point:nodePort(origin,side),targetId:null};
      gesture={kind:'connect',from,port:side,x:e.clientX,y:e.clientY,moved:false};
      viewer().classList.add('is-connecting');
      updateEdges();viewer().setPointerCapture?.(e.pointerId);
      e.preventDefault();return;
    }
    const item=e.target.closest('[data-canvas-node]');
    if(item){
      const id=item.dataset.canvasNode;
      if(connectFrom){
        if(!ensureWrite())return;
        if(id!==connectFrom)createConnection(connectFrom,id);
        closeConnection();
        e.preventDefault();return;
      }
      closeQuickCreate();
      selected=id;selectedEdge=null;
      drawInspector();
      $('canvasNodes').querySelectorAll('.canvas-node').forEach(el=>el.classList.toggle('is-selected',el.dataset.canvasNode===id));
      $('canvasEdgeEditor').hidden=true;
      if(!e.target.closest('[data-canvas-drag]'))return;
      if(!ensureWrite())return;
      const n=nodeById(id);
      const contained=n.type==='group'?snap().nodes.filter(other=>
        other.id!==n.id&&other.type!=='group'&&
        other.x>=n.x&&other.y>=n.y&&
        other.x+other.width<=n.x+n.width&&other.y+other.height<=n.y+n.height
      ).map(other=>({id:other.id,x:other.x,y:other.y})):[];
      gesture={kind:'node',id,x:e.clientX,y:e.clientY,startX:n.x,startY:n.y,contained,moved:false};
    }else{
      closeQuickCreate();selected=null;selectedEdge=null;drawInspector();
      $('canvasEdgeEditor').hidden=true;
      $('canvasNodes').querySelectorAll('.canvas-node.is-selected').forEach(el=>el.classList.remove('is-selected'));
      gesture={kind:'pan',x:e.clientX,y:e.clientY,startX:offset.x,startY:offset.y,moved:false};
    }
    viewer().setPointerCapture?.(e.pointerId);
  });
  viewer().addEventListener('pointermove',e=>{
    if(!gesture)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;
    if(Math.abs(dx)+Math.abs(dy)>3)gesture.moved=true;
    if(gesture.kind==='connect'){
      const target=targetAt(e.clientX,e.clientY);
      connectDraft.targetId=target&&target!==gesture.from?target:null;
      connectDraft.point=worldPoint(e.clientX,e.clientY);
      $('canvasNodes').querySelectorAll('.canvas-node').forEach(el=>{
        el.classList.toggle('is-connect-target',el.dataset.canvasNode===connectDraft.targetId);
      });
      updateEdges();return;
    }
    if(gesture.kind==='pan'){
      offset.x=gesture.startX+dx;offset.y=gesture.startY+dy;updateCamera();return;
    }
    const n=nodeById(gesture.id);if(!n)return;
    n.x=Math.round(bounds(gesture.startX+dx/zoom,-100000,100000));
    n.y=Math.round(bounds(gesture.startY+dy/zoom,-100000,100000));
    const el=$('canvasNodes').querySelector('[data-canvas-node="'+n.id+'"]');
    if(el){el.style.left=n.x+'px';el.style.top=n.y+'px';}
    for(const child of gesture.contained||[]){
      const inside=nodeById(child.id);if(!inside)continue;
      inside.x=Math.round(bounds(child.x+dx/zoom,-100000,100000));
      inside.y=Math.round(bounds(child.y+dy/zoom,-100000,100000));
      const dom=$('canvasNodes').querySelector('[data-canvas-node="'+child.id+'"]');
      if(dom){dom.style.left=inside.x+'px';dom.style.top=inside.y+'px';}
    }
    updateEdges();
  });
  const finishPointer=(e,cancel=false)=>{
    if(!gesture)return;
    const g=gesture;gesture=null;
    if(g.kind==='node'){
      if(g.moved)dirty();
      return;
    }
    if(g.kind!=='connect')return;
    const target=!cancel?targetAt(e.clientX,e.clientY):null;
    closeConnection();
    if(cancel||!g.moved)return;
    if(target&&target!==g.from){
      if(createConnection(g.from,target))toast('Conexão criada. Clique na linha para editar.');
      else toast('Essa conexão já existe.',true);
    }else if(!target){
      // Soltar no vazio oferece criar imediatamente uma nota já conectada.
      openQuickCreate(e.clientX,e.clientY,g.from);
    }
  };
  viewer().addEventListener('pointerup',e=>finishPointer(e));
  viewer().addEventListener('pointercancel',e=>finishPointer(e,true));
  viewer().addEventListener('lostpointercapture',()=>{if(gesture?.kind==='connect'){gesture=null;closeConnection();}});
  viewer().addEventListener('dblclick',e=>{
    const card=e.target.closest('[data-canvas-node]');
    if(card){
      if(e.target.closest('.canvas-node-title'))beginInlineEdit(card.dataset.canvasNode,'title');
      else if(e.target.closest('.canvas-node-body'))beginInlineEdit(card.dataset.canvasNode,'body');
      return;
    }
    if(e.target.closest('.canvas-quick-create,.canvas-edge-editor,.canvas-zoom,.canvas-empty'))return;
    openQuickCreate(e.clientX,e.clientY);
  });
  viewer().addEventListener('wheel',e=>{
    if(e.target.closest('#canvasQuickCreate,#canvasEdgeEditor'))return;
    e.preventDefault();
    const rect=viewer().getBoundingClientRect();
    adjustZoom(e.deltaY<0?1.10:1/1.10,{x:e.clientX-rect.left,y:e.clientY-rect.top});
  },{passive:false});
  document.addEventListener('keydown',e=>{
    if($('canvasView').hidden)return;
    if(e.key==='Escape'){
      if(!$('canvasCreateOverlay').hidden){e.preventDefault();closeCreateDialog();return;}
      if(!$('canvasAIDialog').hidden){e.preventDefault();closeAIDialog();return;}
      if(!$('canvasVideoDialog').hidden){e.preventDefault();closeVideoDialog();return;}
      if(!$('canvasQuickCreate').hidden){closeQuickCreate();return;}
      if(connectFrom||connectDraft){closeConnection();return;}
      selectedEdge=null;positionEdgeEditor();return;
    }
    if(e.target.closest('input,textarea,select,[contenteditable]'))return;
    const accessibleEdge=e.target.closest('[data-canvas-edge]');
    if(accessibleEdge && (e.key==='Enter'||e.key===' ')){
      e.preventDefault();selectEdge(accessibleEdge.dataset.canvasEdge);return;
    }
    const key=e.key.toLowerCase();
    if((e.key==='Delete'||e.key==='Backspace')&&selectedEdge){e.preventDefault();removeEdge();return;}
    if((e.key==='Delete'||e.key==='Backspace')&&selected){e.preventDefault();removeSelected();return;}
    if(key==='enter'&&selected){e.preventDefault();beginInlineEdit(selected,'title');return;}
    if(key==='/'||key==='insert'){
      e.preventDefault();
      const r=viewer().getBoundingClientRect();
      openQuickCreate(r.left+r.width/2,r.top+r.height/2);
    }
  });
  document.addEventListener('pointerdown',e=>{
    if(!$('canvasQuickCreate').hidden && !e.target.closest('#canvasQuickCreate,#canvasFloatingAdd'))
      closeQuickCreate();
  });
}
export function setupCanvas(deps){
  if(initialized)return;
  initialized=true;
  ({api,toast,isGuest:guest,requireAccount:gate,openVideo}=deps);
  bindCanvasEvents();
}
export async function loadCanvas(){
  if(!initialized)return;
  if(guest()){
    board={id:'demo',title:'Planejamento de viagem (demonstração)',revision:1,snapshot:exampleCanvas()};
    boards=[{id:'demo',title:board.title}];links=new Map();
    closeQuickCreate();selected=null;selectedEdge=null;connectFrom=null;connectDraft=null;conflicted=false;
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
  saving=false;editEpoch=0;savedEpoch=0;conflicted=false;retryCount=0;
  selectedEdge=null;connectFrom=null;connectDraft=null;
  if(initialized){
    $('canvasWorkspaceBar').dataset.hasMap='false';
    $('canvasCreateOverlay').hidden=true;
    $('canvasAIDialog').hidden=true;
    closeVideoDialog();
    closeQuickCreate();
    viewer().classList.remove('is-connecting');
    $('canvasNodes').replaceChildren();$('canvasEdges').replaceChildren();
    $('canvasInspector').hidden=true;$('canvasEdgeEditor').hidden=true;
  }
}
