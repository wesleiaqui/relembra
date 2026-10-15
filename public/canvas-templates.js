// Modelos de mapa mental. Dados puramente locais; nenhum acesso à conta.
export const MAP_TEMPLATES=Object.freeze([
  {id:'blank',icon:'✦',title:'Começar do zero',description:'Uma tela livre para suas ideias',tag:'Livre',color:'#8296a6'},
  {id:'mind',icon:'◎',title:'Mapa mental',description:'Um tema central ligado a novas ideias',tag:'Popular',color:'#3b9b82'},
  {id:'project',icon:'▤',title:'Planejar projeto',description:'Etapas, objetivos e próximas tarefas',tag:'Organização',color:'#688cc3'},
  {id:'study',icon:'◈',title:'Organizar estudos',description:'Matérias, referências e revisões',tag:'Aprendizado',color:'#a18ac9'},
  {id:'decision',icon:'⚖',title:'Tomar uma decisão',description:'Compare possibilidades e critérios',tag:'Escolhas',color:'#bd9662'},
  {id:'workflow',icon:'⇢',title:'Fluxograma',description:'Monte uma sequência de atividades',tag:'Processo',color:'#b97b88'}
]);
const color={center:'#3b9b82',idea:'#688cc3',task:'#c6945a',group:'#8a7db5',link:'#b37e93'};
export function makeMentalTemplate(kind,title){
  const name=String(title||'Meu mapa mental').trim().slice(0,100)||'Meu mapa mental';
  const nodes=[],edges=[];
  function add(type,x,y,heading,body='',other={}){
    const node={id:crypto.randomUUID(),type,x,y,width:type==='group'?480:260,
      height:type==='group'?240:160,title:heading.slice(0,120),body:body.slice(0,2200),
      color:color[type]||color.idea,...other};
    nodes.push(node);return node;
  }
  function link(a,b,label=''){edges.push({id:crypto.randomUUID(),from:a.id,to:b.id,label});}
  if(kind==='blank')return {nodes,edges};
  if(kind==='mind'){
    const c=add('note',475,280,name,'Tema principal — clique duas vezes para editar.',{color:color.center});
    [
      [35,55,'Primeira ideia','O que você já sabe sobre esse assunto?'],
      [880,55,'Segunda ideia','Quais possibilidades você quer explorar?'],
      [35,535,'Próximos passos','O que precisa ser feito agora?'],
      [880,535,'Referências','Que conteúdos ajudam a entender melhor?']
    ].forEach(([x,y,t,b],i)=>{
      const n=add(i===2?'task':'note',x,y,t,b,i===2?{due_date:'',priority:2,done:false}:{});
      link(c,n);
    });
  }else if(kind==='project'){
    const c=add('note',420,30,name,'Objetivo e resultado esperado.',{color:color.center});
    const a=add('note',20,300,'1. Preparação','Liste o que você precisa organizar.');
    const b=add('task',340,300,'2. Executar tarefas','Divida o trabalho em etapas menores.',{due_date:'',priority:2,done:false});
    const d=add('task',660,300,'3. Revisar e concluir','Confira os resultados e finalize.',{due_date:'',priority:2,done:false});
    link(c,a);link(a,b);link(b,d);
  }else if(kind==='study'){
    const c=add('note',420,45,name,'Tema principal do estudo.',{color:color.center});
    const a=add('note',10,320,'Conceitos importantes','Resumo do que você aprendeu.');
    const b=add('task',320,320,'Exercícios','O que você quer praticar?',{due_date:'',priority:2,done:false});
    const d=add('link',650,320,'Materiais de apoio','Adicione links, vídeos ou documentos.',{url:''});
    link(c,a);link(c,b);link(c,d);
  }else if(kind==='decision'){
    const c=add('note',420,40,name,'Qual decisão você precisa tomar?',{color:color.center});
    const a=add('note',90,315,'Opção A','Vantagens e desvantagens.');
    const b=add('note',625,315,'Opção B','Vantagens e desvantagens.');
    const d=add('note',360,590,'Critérios importantes','Custo, tempo, prioridade e impacto.');
    link(c,a);link(c,b);link(a,d);link(b,d);
  }else if(kind==='workflow'){
    const a=add('note',50,230,'Início',name,{color:color.center});
    const b=add('task',420,230,'Ação ou etapa','O que acontece aqui?',{due_date:'',priority:2,done:false});
    const c=add('note',790,230,'Resultado','O que deve acontecer ao final?');
    link(a,b);link(b,c);
  }else return {nodes,edges};
  return {nodes,edges};
}
// Transformação segura de um plano de tópicos proposto por IA em um mapa local.
// Não confia em IDs, URLs, HTML ou posições fornecidos pelo modelo.
export function graphFromOutline(title,input){
  if(!input||!Array.isArray(input.branches))throw new Error('A IA não retornou tópicos suficientes.');
  const name=String(title||'Mapa gerado').trim().slice(0,100);
  const branches=input.branches.slice(0,6).map(b=>({
    title:String(b?.title||'').trim().slice(0,90),
    ideas:Array.isArray(b?.ideas)?b.ideas.slice(0,4).map(s=>String(s||'').trim().slice(0,110)).filter(Boolean):[]
  })).filter(b=>b.title);
  if(!branches.length)throw new Error('Nenhuma ideia válida foi gerada.');
  const c={id:crypto.randomUUID(),type:'note',x:530,y:390,width:270,height:160,title:name,body:'Tema central',color:color.center};
  const nodes=[c],edges=[];
  branches.forEach((b,i)=>{
    const side=i%2===0?-1:1,slot=Math.floor(i/2);
    const x=side<0?60:1030,y=45+slot*440;
    const parent={id:crypto.randomUUID(),type:'note',x,y,width:260,height:150,title:b.title,body:'',
      color:side<0?color.idea:color.link};
    nodes.push(parent);edges.push({id:crypto.randomUUID(),from:c.id,to:parent.id,label:''});
    b.ideas.forEach((idea,j)=>{
      const child={id:crypto.randomUUID(),type:'note',x:x+(side<0?-50:70),y:y+170+j*168,width:240,height:130,
        title:idea,body:'',color:parent.color};
      nodes.push(child);edges.push({id:crypto.randomUUID(),from:parent.id,to:child.id,label:''});
    });
  });
  return {nodes,edges};
}
