import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {MAP_TEMPLATES,makeMentalTemplate,graphFromOutline} from '../public/canvas-templates.js';
import {validateCanvas} from '../src/canvas.js';

const file=name=>readFileSync(new URL('../public/'+name,import.meta.url),'utf8');
test('Todos os seis modelos geram mapas editáveis e compatíveis com D1',()=>{
  assert.equal(MAP_TEMPLATES.length,6);
  assert.deepEqual(MAP_TEMPLATES.map(t=>t.id),['blank','mind','project','study','decision','workflow']);
  for(const template of MAP_TEMPLATES){
    const data=makeMentalTemplate(template.id,'Minha ideia central');
    const parsed=JSON.parse(validateCanvas(data));
    assert.deepEqual(parsed.nodes,data.nodes);
    assert.equal(new Set(parsed.nodes.map(n=>n.id)).size,parsed.nodes.length);
    assert.equal(new Set(parsed.edges.map(e=>e.id)).size,parsed.edges.length);
    assert.equal(parsed.nodes.length,template.id==='blank'?0:parsed.nodes.length);
    if(template.id!=='blank')assert.ok(parsed.edges.length>=2,template.id);
  }
});
test('IA é transformada em grafo com IDs próprios e tamanho limitado',()=>{
  const raw={branches:Array.from({length:10},(_,i)=>({
    title:'Tópico '+i,
    ideas:Array.from({length:10},(_,j)=>'Ideia '+i+'.'+j)
  }))};
  const data=graphFromOutline('Meu tema',raw);
  assert.equal(data.nodes.length,31);
  assert.equal(data.edges.length,30);
  assert.equal(JSON.parse(validateCanvas(data)).nodes.length,31);
  assert.throws(()=>graphFromOutline('Tema',{branches:[]}),/Nenhuma ideia/);
  assert.throws(()=>graphFromOutline('Tema',{branches:null}),/tópicos suficientes/);
});
test('Interface substitui Quadro por Mapa mental e oferece criação guiada',()=>{
  const html=file('index.html'),script=file('canvas.js'),styles=file('mental-maps.css'),app=file('app.js');
  assert.match(html,/Mapas mentais/);
  assert.match(html,/<h2 id="mentalCreateTitle">Criar mapa mental<\/h2>/);
  assert.match(html,/id="canvasMapCount"/);
  assert.match(html,/id="canvasCreateOverlay"/);
  assert.match(html,/id="canvasTemplateGallery"/);
  assert.match(html,/id="canvasCreateConfirm"/);
  assert.match(html,/id="canvasEmptyTemplates"/);
  assert.match(html,/id="canvasAIDialog"/);
  assert.match(html,/id="canvasVideoDialog"/);
  assert.match(html,/id="mentalVideoSearch"/);
  assert.match(html,/id="canvasVideoOpen"/);
  assert.match(html,/href="\/mental-maps.css"/);
  assert.match(script,/function openCreateDialog/);
  assert.match(script,/async function createBoardWithSnapshot/);
  assert.match(script,/function paintBoardNames/);
  assert.match(script,/makeMentalTemplate\(chosenTemplate,title\)/);
  assert.match(script,/graphFromOutline\(title,outline\)/);
  assert.match(script,/function addVideoToMap/);
  assert.match(script,/dataset\.hasMap/);
  assert.match(script,/video_id=video.id/);
  assert.match(script,/contained=n.type==='group'/);
  assert.match(script,/function resetCamera/);
  assert.doesNotMatch(script,/prompt\('Nome do novo quadro/);
  assert.match(app,/openVideo:editVideo/);
  assert.match(styles,/mental-template-gallery/);
  assert.match(styles,/data-has-map="false"/);
  assert.match(styles,/data-dark-palette="oled"|var\(--cv-surface\)/);
});
