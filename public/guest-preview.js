// Tour público: exemplos estáticos. Nenhum conteúdo é carregado de contas reais.
export const guestCategories=Object.freeze([
  {id:'culinaria',name:'Culinária',emoji:'🍝',color:'#32a883'},
  {id:'turismo',name:'Turismo',emoji:'✈️',color:'#5197c6'},
  {id:'aprendizado',name:'Aprendizado',emoji:'📚',color:'#9d91cf'}
]);
const $=id=>document.getElementById(id);
const note=(title,detail,action='Criar minha conta')=>'<div class="guest-demo-empty"><span class="guest-demo-symbol" aria-hidden="true">✦</span><strong>'+title+'</strong><p>'+detail+'</p><button type="button" class="button button-primary" data-guest-action>'+action+' ↗</button></div>';
const sample=(icon,title,subtitle)=>'<article class="guest-showcase-card"><div class="guest-showcase-cover"><span aria-hidden="true">'+icon+'</span><span>EXEMPLO</span></div><div class="guest-showcase-body"><strong>'+title+'</strong><p>'+subtitle+'</p><button type="button" class="button button-outline" data-guest-action>Guardar na minha biblioteca →</button></div></article>';
export function renderGuestPreview(view){
  if(view==='home'){
    $('homeGreeting').textContent='Sua segunda memória começa aqui.';
    $('homeRadar').innerHTML='<div class="home-empty-priority"><span aria-hidden="true">✦</span><strong>Planeje o que importa hoje</strong><p>Organize tarefas, prioridades e lembretes em um único lugar.</p></div>';
    $('homeBills').innerHTML='<div class="guest-home-preview"><strong>Contas e vencimentos</strong><span>Veja o que precisa pagar, sem perder nenhuma data.</span></div>';
    $('homeHabits').innerHTML='<div class="guest-home-preview"><strong>Rotinas e hábitos</strong><span>Acompanhe os hábitos e pequenas conquistas do dia.</span></div>';
    $('homeGrid').innerHTML='<div class="guest-showcase-grid">'+
      sample('🍝','Uma receita que vale guardar','Salve links, resumos e descobertas para consultar depois.')+
      sample('✈️','Ideias para sua próxima viagem','Organize referências com imagens e anotações.')+
      sample('📚','O que aprendeu recentemente','Transforme vídeos em uma biblioteca pesquisável.')+'</div>';
  }
  if(view==='library'){
    $('libraryTitle').textContent='Minha biblioteca';
    $('librarySubtitle').textContent='Explore como seus vídeos e referências ficam organizados.';
    $('resultsCount').textContent='3 exemplos ilustrativos';
    $('loadMore').hidden=true;
    $('libraryGrid').innerHTML='<div class="guest-showcase-grid">'+
      sample('📚','Aprendizado em um só lugar','Guarde vídeo, link, resumo, transcrição e imagens.')+
      sample('🧠','Referências para lembrar','Categorize o que aprendeu e encontre por pesquisa.')+
      sample('📷','Anotações e capturas','Adicione diferentes informações ao mesmo conteúdo.')+'</div>';
  }
  if(view==='chat'){
    // A tela já inclui sua demonstração visual nativa de boas-vindas.
    const info=$('chatMessages');
    if(info && !info.querySelector('.chat-welcome'))info.innerHTML=note('Chat e pesquisa inteligente','Depois de criar sua conta, pesquise suas memórias e converse com o que salvou.','Começar a pesquisar');
  }
  if(view==='radar'){
    $('radarContent').innerHTML='<div class="radar-snapshot"><div><span class="eyebrow">COMO FUNCIONA</span><strong>Prioridades, em um único radar</strong><small>Exemplos de tarefas e contas, sem dados reais</small></div><div><span class="radar-count-good">Prévia demonstrativa</span></div></div>'+
      '<div class="radar-main-grid"><section class="radar-panel radar-tasks-panel"><div class="radar-panel-top"><div><span class="eyebrow">FOCO</span><h2>Minhas tarefas</h2></div></div>'+
      '<p>Organize o dia por prioridade e vencimento.</p><div class="radar-list">'+
      '<div class="radar-item"><span class="guest-check" aria-hidden="true">○</span><div class="radar-item-main"><strong>Revisar uma anotação importante</strong><small>Exemplo · Prioridade normal</small></div></div>'+
      '<div class="radar-item"><span class="guest-check" aria-hidden="true">○</span><div class="radar-item-main"><strong>Organizar documentos</strong><small>Exemplo · Próximos dias</small></div></div></div></section>'+
      '<section class="radar-panel radar-bills-panel"><div class="radar-panel-top"><div><span class="eyebrow">CONTAS</span><h2>Próximos vencimentos</h2></div></div>'+
      '<p>As contas cadastradas aparecem aqui automaticamente.</p>'+note('Seu painel, suas prioridades','Crie uma conta para organizar tarefas e pagamentos.','Adicionar uma prioridade')+'</section></div>';
  }
  if(view==='life'){
    $('lifeOverview').innerHTML='<div class="guest-demo-card"><strong>Calendário da vida</strong><p>Veja suas semanas e marque momentos que deseja recordar. A visualização abaixo é apenas ilustrativa.</p></div>';
    $('lifeWeeks').innerHTML=Array.from({length:104},(_,i)=>'<span class="guest-life-week '+(i<45?'past':i===45?'present':'')+'" title="Semana de exemplo"></span>').join('');
    $('lifeMomentsList').innerHTML=note('Colecione momentos importantes','Guarde conquistas, reflexões e lembranças pessoais.','Registrar um momento');
  }
  if(view==='tips'){
    $('tipsResultCount').textContent='Exemplos de situações e lembretes';
    $('tipsGrid').innerHTML='<div class="guest-showcase-grid">'+
      sample('🎯','Antes de começar um projeto','Tenha à mão as dicas que ajudam você a manter o foco.')+
      sample('💬','Antes de uma conversa','Recupere anotações que fez em momentos importantes.')+
      sample('🧭','Na hora de decidir','Salve frases e lembretes para consultar quando precisar.')+'</div>';
  }
  if(view==='thoughts'){
    $('thoughtList').innerHTML=note('Seu diário particular','Reflita em etapas e reveja o que escreveu. Nada é compartilhado.','Salvar minha primeira reflexão');
    $('thoughtCount').textContent='0';
  }
  if(view==='backup'){
    // A página já apresenta o guia de backup; nenhuma exportação é feita no tour.
  }
}
