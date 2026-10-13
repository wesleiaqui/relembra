// Dicas selecionadas apenas da biblioteca privada já carregada via /api/tips.
// Sem modelos externos, diagnósticos ou gravação de estados emocionais.
export const MOTIVATION_MOMENTS = Object.freeze({
  procrastinar: {label:'Estou procrastinando',keywords:['procrastin','come','iniciar','tarefa','pequen','10 minutos','passo','adiar','concluir','responsabil','disciplina']},
  desanimado: {label:'Estou desanimado',keywords:['desanim','dificil','desist','continu','recome','progresso','resultado','recompensa','prazo','motiv']},
  inseguro: {label:'Estou inseguro',keywords:['insegur','certeza','reac','errar','opiniao','medo','conversa','pessoa','outros','confianca','atitude']},
  foco: {label:'Preciso me concentrar',keywords:['concentr','distra','foco','rede social','celular','estimulo','25 minutos','atencao','ambiente']}
});
export function normalizedAdviceText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
}
export function selectMotivationTips(tips,moment,limit=3) {
  const config=MOTIVATION_MOMENTS[moment];
  if (!config || !Array.isArray(tips)) return [];
  const text=normalizedAdviceText(config.label);
  const accepted=['motivacao e mentalidade','foco e produtividade'];
  return tips.map(t => {
    const situation=normalizedAdviceText(t.situation);
    if (!accepted.includes(situation)) return null;
    const title=normalizedAdviceText(t.title),body=normalizedAdviceText(t.content);
    // A sugestão específica salva pelo usuário vem primeiro; depois dicas correlatas.
    let score=title===text?100:0;
    for(const keyword of config.keywords) {
      if(title.includes(keyword))score+=13;
      if(body.includes(keyword))score+=3;
    }
    if(situation==='motivacao e mentalidade' && score>0) score+=2;
    if(t.favorite && score>0) score+=4;
    return score>0?{tip:t,score}:null;
  }).filter(Boolean).sort((a,b)=>b.score-a.score || String(a.tip.title).localeCompare(String(b.tip.title),'pt-BR'))
    .slice(0,Math.max(1,Math.min(5,limit))).map(x=>x.tip);
}
