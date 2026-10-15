import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {canvasWorldPoint,canvasCanConnect,canvasCurve,canvasConnectionRoute,exampleCanvas} from '../public/canvas.js';
import {validateCanvas} from '../src/canvas.js';
const load=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');

test('duplo clique oferece criação contextual, título no local e atalhos',()=>{
  const html=load('index.html'),js=load('canvas.js'),css=load('canvas.css');
  for(const id of ['canvasQuickCreate','canvasQuickTitle','canvasQuickClose','canvasFloatingAdd',
    'canvasEdgeEditor','canvasEdgeLabel','canvasEdgeDelete'])assert.ok(html.includes('id="'+id+'"'),id);
  for(const type of ['note','task','link','group'])assert.ok(html.includes('data-canvas-create="'+type+'"'));
  assert.match(js,/function openQuickCreate\(clientX,clientY,from=null\)/);
  assert.match(js,/openQuickCreate\(e.clientX,e.clientY\)/);
  assert.match(js,/quickAdd\(type\)/);
  assert.match(js,/beginInlineEdit\(n.id,'title'\)/);
  assert.match(js,/beginInlineEdit\(card.dataset.canvasNode,'body'\)/);
  assert.match(js,/e.key==='Escape'/);
  assert.match(js,/key==='\/'\|\|key==='insert'/);
  assert.match(css,/\.canvas-quick-create\[hidden\]/);
  assert.match(css,/\.canvas-floating-add/);
  assert.match(css,/@media\(hover:none\),\(pointer:coarse\)/);
});

test('conexões por arrastar têm snap no cartão de destino e prévia SVG',()=>{
  const html=load('index.html'),js=load('canvas.js'),css=load('canvas.css');
  assert.match(js,/data-canvas-port/);
  assert.match(js,/data-canvas-owner/);
  assert.match(js,/gesture=\{kind:'connect'/);
  assert.match(js,/document.elementFromPoint\(x,y\)/);
  assert.match(js,/connectDraft.targetId=target/);
  assert.match(js,/createConnection\(g.from,target\)/);
  assert.match(js,/openQuickCreate\(e.clientX,e.clientY,g.from\)/);
  assert.match(js,/class','canvas-edge-preview'/);
  assert.match(js,/class','canvas-edge-hit'/);
  assert.match(js,/marker-end','url\(#canvasArrow\)'/);
  assert.match(js,/function selectEdge\(id\)/);
  assert.match(js,/function removeEdge\(\)/);
  assert.match(js,/edge.label=e.target.value.slice\(0,60\)/);
  assert.match(js,/hit.setAttribute\('tabindex','0'\)/);
  assert.match(css,/\.canvas-port-right/);
  assert.match(css,/\.canvas-edge-hit/);
  assert.match(css,/pointer-events:stroke/);
  assert.match(css,/\.canvas-edge-editor\[hidden\]/);
  assert.match(html,/id="canvasConnect"/);
});

test('coordenadas de criação correspondem ao ponto selecionado mesmo com pan e zoom',()=>{
  const rect={left:100,top:80};
  assert.deepEqual(canvasWorldPoint(515,400,rect,{x:75,y:20},2),{x:170,y:150});
  assert.deepEqual(canvasWorldPoint(100,80,rect,{x:0,y:0},.5),{x:0,y:0});
  assert.deepEqual(canvasWorldPoint(140,135,rect,{x:-20,y:5},1),{x:60,y:50});
});

test('conexões rejeitam auto ligação, nós inexistentes e duplicatas direcionais',()=>{
  const example=exampleCanvas();
  const [a,b,c]=example.nodes;
  assert.equal(canvasCanConnect(example.nodes,example.edges,a.id,a.id),false);
  assert.equal(canvasCanConnect(example.nodes,example.edges,'missing',a.id),false);
  assert.equal(canvasCanConnect(example.nodes,example.edges,a.id,'missing'),false);
  assert.equal(canvasCanConnect(example.nodes,example.edges,b.id,c.id),false);
  assert.equal(canvasCanConnect(example.nodes,example.edges,c.id,b.id),true);
  assert.equal(canvasCanConnect(example.nodes,example.edges,a.id,b.id),true);
  const curve=canvasCurve({x:0,y:15},{x:250,y:55},'right','left');
  assert.match(curve,/^M0,15 C[\d.]+,15 [\d.]+,55 250,55$/);
  assert.equal(canvasCurve({x:20,y:10},{x:20,y:200},'bottom','top').includes('20,200'),true);
});

test('cartões e conexões antigas continuam compatíveis com servidor e backup',()=>{
  const example=exampleCanvas();
  assert.equal(JSON.parse(validateCanvas(example)).edges.length,2);
  const js=load('canvas.js');
  assert.match(js,/snap\(\)\.edges.push\(\{id:crypto.randomUUID\(\),from,to,label:''\}\)/);
  assert.match(js,/revision:targetBoard.revision/);
  assert.match(js,/dirty\(\);draw\(\)/);
  assert.doesNotMatch(js,/eval\(|innerHTML\s*=\s*e.target.value/);
});

test('conexões existentes não dão voltas e terminam na borda de destino',()=>{
  const cards=[
    [{x:7,y:20,width:230,height:140},{x:156,y:305,width:230,height:160}],
    [{x:10,y:15,width:230,height:140},{x:450,y:15,width:230,height:140}],
    [{x:450,y:15,width:230,height:140},{x:10,y:15,width:230,height:140}],
    [{x:150,y:470,width:230,height:140},{x:150,y:10,width:230,height:140}],
    [{x:30,y:20,width:230,height:140},{x:370,y:380,width:230,height:140}]
  ];
  for(const [first,second] of cards){
    const {p,q,d,fromPort,toPort}=canvasConnectionRoute(first,second);
    assert.match(d,/^M[-\d.]+,[-\d.]+ C[-\d.]+,[-\d.]+ [-\d.]+,[-\d.]+ [-\d.]+,[-\d.]+$/);
    const values=d.match(/[-]?\d+(?:\.\d+)?/g).map(Number);
    const [x1,y1,c1x,c1y,c2x,c2y,x2,y2]=values;
    assert.deepEqual([x1,y1,x2,y2],[p.x,p.y,q.x,q.y]);
    const horiz=['left','right'].includes(fromPort);
    assert.equal(toPort,{left:'right',right:'left',top:'bottom',bottom:'top'}[fromPort]);
    const axis=horiz?[x1,c1x,c2x,x2]:[y1,c1y,c2y,y2];
    const min=Math.min(axis[0],axis[3]),max=Math.max(axis[0],axis[3]);
    for(const value of axis)assert.ok(value>=min-0.001&&value<=max+0.001,
      'Conexão não pode ultrapassar o cartão-alvo: '+d);
  }
});
test('cartões alinhados e sobrepostos não geram coordenadas inválidas',()=>{
  const a={x:0,y:0,width:260,height:170};
  for(const b of [
    {x:0,y:180,width:260,height:170},
    {x:130,y:90,width:260,height:170},
    {x:0,y:0,width:260,height:170},
    {x:-260,y:-180,width:260,height:170}
  ]){
    const route=canvasConnectionRoute(a,b);
    assert.ok(!route.d.includes('NaN'));
    assert.ok(!route.d.includes('Infinity'));
  }
});
