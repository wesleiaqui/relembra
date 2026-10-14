// Relembra Companion: rotas privadas, sem dados entre contas e sem contexto financeiro na IA.
const respond=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'private, no-store','x-content-type-options':'nosniff'}});
const fail=(message,status=400)=>respond({error:message},status);
const now=()=>new Date().toISOString();
const clamp=(s,n)=>String(s??'').trim().slice(0,n);
const ymd=(date)=>date.toISOString().slice(0,10);
function localDay(request) {
  const zone=String(request.headers.get('x-relembra-timezone')||'').slice(0,80);
  if(zone && /^[A-Za-z0-9_+\-/]+$/.test(zone)){
    try{
      const parts=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      const pick=name=>parts.find(x=>x.type===name)?.value;
      const day=pick('year')+'-'+pick('month')+'-'+pick('day');
      if(dateOK(day))return day;
    }catch{}
  }
  return ymd(new Date());
}
function dateOK(s,allowFuture=true) {
  if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
  const d=new Date(s+'T00:00:00.000Z');
  return !Number.isNaN(d.getTime())&&ymd(d)===s&&(allowFuture||s<=ymd(new Date()));
}
function inputDate(s,allowFuture=true){
  if(!dateOK(s,allowFuture))throw Error('Informe uma data válida.');
  return s;
}
function bodyLimit(request,max=6000){return request.text().then(raw=>{
  if(raw.length>max)throw Error('Registro muito grande.');
  const obj=JSON.parse(raw);
  if(!obj||typeof obj!=='object'||Array.isArray(obj))throw Error('Registro inválido.');
  return obj;
});}
async function fromDB(statement,...args){return (await statement.bind(...args).all()).results||[];}
async function exists(env,table,id,owner){return Boolean(await env.DB.prepare('SELECT id FROM '+table+' WHERE id=? AND owner_id=?').bind(id,owner).first());}
const safeId=/^[a-f0-9-]{36}$/i;
const plusDays=(v,n)=>{const d=new Date(v+'T00:00:00.000Z');d.setUTCDate(d.getUTCDate()+n);return ymd(d);};
const rate= (v,n)=>Math.max(1,Math.min(n,Number(v)||1));
const escLike=q=>q.replace(/[\\%_]/g, '\\$&');
export async function exportCompanion(env,owner) {
  const tables={moments:'life_moments',tasks:'radar_tasks',habits:'motivation_habits',habit_days:'motivation_habit_days'};
  const out={profile:await env.DB.prepare('SELECT birth_date,reference_age FROM life_profiles WHERE owner_id=?').bind(owner).first(), habitsConfigured:Boolean(await env.DB.prepare('SELECT owner_id FROM motivation_habit_setup WHERE owner_id=?').bind(owner).first())};
  for(const [key,table] of Object.entries(tables))
    out[key]=await fromDB(env.DB.prepare('SELECT * FROM '+table+' WHERE owner_id=? ORDER BY rowid ASC LIMIT 5000'),owner);
  return out;
}
export async function importCompanion(env,owner,extras){
  if(!extras||typeof extras!=='object'||Array.isArray(extras))return {imported:0,skipped:0};
  let imported=0,skipped=0;
  const profile=extras.profile;
  if(profile&&dateOK(profile.birth_date,false)&&Number.isInteger(profile.reference_age)&&profile.reference_age>=1&&profile.reference_age<=120){
    await env.DB.prepare('INSERT INTO life_profiles(owner_id,birth_date,reference_age,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO NOTHING')
      .bind(owner,profile.birth_date,profile.reference_age,now()).run();
  }
  if(extras.habitsConfigured===true||(Array.isArray(extras.habits)&&extras.habits.length)){
    await env.DB.prepare('INSERT OR IGNORE INTO motivation_habit_setup(owner_id,created_at) VALUES(?,?)').bind(owner,now()).run();
  }
  const specs=[
    ['moments','life_moments',['moment_date','title','note','kind'],r=>({
      moment_date:inputDate(r.moment_date),title:clamp(r.title,150),note:clamp(r.note,4000),kind:['good','milestone','reflection'].includes(r.kind)?r.kind:'good'})],
    ['tasks','radar_tasks',['title','due_date','priority','done_at'],r=>({
      title:clamp(r.title,160),due_date:inputDate(r.due_date),priority:[1,2,3].includes(Number(r.priority))?Number(r.priority):2,
      done_at:typeof r.done_at==='string'&&dateOK(r.done_at.slice(0,10))?r.done_at:null})],
    ['habits','motivation_habits',['title'],r=>({title:clamp(r.title,150)})]
  ];
  for(const [key,table,cols,validate] of specs){
    const rows=Array.isArray(extras[key])?extras[key].slice(0,250):[];
    for(const item of rows){
      try{
        const obj=validate(item);
        if(!obj.title)throw Error('Título vazio.');
        const id=safeId.test(String(item.id))?item.id:crypto.randomUUID();
        const used=await env.DB.prepare('SELECT owner_id FROM '+table+' WHERE id=?').bind(id).first();
        if(used){skipped++;continue;}
        const result=await env.DB.prepare('INSERT OR IGNORE INTO '+table+'(id,owner_id,'+cols.join(',')+(table!=='motivation_habits'?',created_at,updated_at':',created_at')+') VALUES('+Array(cols.length+(table!=='motivation_habits'?4:3)).fill('?').join(',')+')')
          .bind(id,owner,...cols.map(col=>obj[col]),... (table!=='motivation_habits'?[now(),now()]:[now()])).run();
        if(result.meta.changes)imported++;else skipped++;
      }catch{skipped++;}
    }
  }
  const completions=Array.isArray(extras.habit_days)?extras.habit_days.slice(0,250):[];
  for(const item of completions){
    if(!dateOK(item.day)||!safeId.test(String(item.habit_id))) {skipped++;continue;}
    const habit=await env.DB.prepare('SELECT id FROM motivation_habits WHERE id=? AND owner_id=?').bind(item.habit_id,owner).first();
    if(!habit){skipped++;continue;}
    const result=await env.DB.prepare('INSERT OR IGNORE INTO motivation_habit_days(owner_id,habit_id,day) VALUES(?,?,?)').bind(owner,item.habit_id,item.day).run();
    if(result.meta.changes)imported++;else skipped++;
  }
  return {imported,skipped};
}
export async function archiveVersion(env,owner,type,id,snapshot){
  await env.DB.prepare('INSERT INTO saved_versions(id,owner_id,entity_type,entity_id,snapshot,archived_at) VALUES(?,?,?,?,?,?)')
    .bind(crypto.randomUUID(),owner,type,id,JSON.stringify(snapshot),now()).run();
  await env.DB.prepare('DELETE FROM saved_versions WHERE owner_id=? AND entity_type=? AND entity_id=? AND id NOT IN (SELECT id FROM saved_versions WHERE owner_id=? AND entity_type=? AND entity_id=? ORDER BY archived_at DESC LIMIT 30)')
    .bind(owner,type,id,owner,type,id).run();
}
export async function handleCompanion(request,env,user){
  const u=new URL(request.url),path=u.pathname,method=request.method,owner=user.id,today=localDay(request);
  try{
    if(path==='/api/radar'&&method==='GET'){
      const upper=plusDays(today,14);
      const tasks=await fromDB(env.DB.prepare('SELECT id,title,due_date,priority,done_at FROM radar_tasks WHERE owner_id=? AND (done_at IS NULL OR substr(done_at,1,10)=?) AND due_date<=? ORDER BY done_at IS NOT NULL,due_date ASC,priority ASC LIMIT 30'),owner,today,upper);
      const bills=await fromDB(env.DB.prepare('SELECT id,name,amount_cents,due_date,priority,essential FROM finance_bills WHERE owner_id=? AND paid_at IS NULL AND due_date<=? ORDER BY due_date ASC,priority ASC LIMIT 12'),owner,upper);
      const moments=await fromDB(env.DB.prepare('SELECT id,title,moment_date,kind FROM life_moments WHERE owner_id=? AND moment_date=? ORDER BY created_at DESC LIMIT 4'),owner,today);
      const tips=await fromDB(env.DB.prepare('SELECT id,title,content,situation FROM situational_tips WHERE owner_id=? AND favorite=1 ORDER BY updated_at DESC LIMIT 2'),owner);
      return respond({date:today,tasks,bills,moments,tips});
    }
    if(path==='/api/radar/tasks'&&method==='POST'){
      const b=await bodyLimit(request),title=clamp(b.title,160),due=inputDate(b.due_date);
      const priority=Number(b.priority||2);
      if(!title||![1,2,3].includes(priority))return fail('Informe tarefa e prioridade válidas.');
      const id=crypto.randomUUID(),time=now();
      await env.DB.prepare('INSERT INTO radar_tasks(id,owner_id,title,due_date,priority,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
        .bind(id,owner,title,due,priority,time,time).run();
      return respond({ok:true,id},201);
    }
    const taskId=path.match(/^\/api\/radar\/tasks\/([a-f0-9-]{36})$/i);
    if(taskId){
      const id=taskId[1];
      if(!await exists(env,'radar_tasks',id,owner))return fail('Tarefa não encontrada.',404);
      if(method==='DELETE'){await env.DB.prepare('DELETE FROM radar_tasks WHERE id=? AND owner_id=?').bind(id,owner).run();return respond({ok:true});}
      if(method==='PATCH'){
        const b=await bodyLimit(request);
        if(typeof b.done!=='boolean')return fail('Informe o estado da tarefa.');
        await env.DB.prepare('UPDATE radar_tasks SET done_at=?,updated_at=? WHERE id=? AND owner_id=?').bind(b.done?now():null,now(),id,owner).run();
        return respond({ok:true});
      }
    }
    if(path==='/api/life'&&method==='GET'){
      return respond({profile:await env.DB.prepare('SELECT birth_date,reference_age FROM life_profiles WHERE owner_id=?').bind(owner).first(),
        moments:await fromDB(env.DB.prepare('SELECT id,moment_date,title,note,kind,created_at FROM life_moments WHERE owner_id=? ORDER BY moment_date DESC LIMIT 3000'),owner)});
    }
    if(path==='/api/life/profile'&&method==='PUT'){
      const b=await bodyLimit(request),birth=inputDate(b.birth_date,false),age=Number(b.reference_age);
      if(!Number.isInteger(age)||age<1||age>120)return fail('Idade de referência deve ficar entre 1 e 120.');
      await env.DB.prepare('INSERT INTO life_profiles(owner_id,birth_date,reference_age,updated_at) VALUES(?,?,?,?) ON CONFLICT(owner_id) DO UPDATE SET birth_date=excluded.birth_date,reference_age=excluded.reference_age,updated_at=excluded.updated_at')
        .bind(owner,birth,age,now()).run();
      return respond({ok:true});
    }
    if(path==='/api/life/moments'&&method==='POST'){
      const b=await bodyLimit(request),title=clamp(b.title,150),date=inputDate(b.moment_date),note=clamp(b.note,4000),kind=b.kind||'good';
      if(!title||!['good','milestone','reflection'].includes(kind))return fail('Preencha título e tipo válidos.');
      const id=crypto.randomUUID(),time=now();
      await env.DB.prepare('INSERT INTO life_moments(id,owner_id,moment_date,title,note,kind,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)')
        .bind(id,owner,date,title,note,kind,time,time).run();
      return respond({ok:true,id},201);
    }
    const momentId=path.match(/^\/api\/life\/moments\/([a-f0-9-]{36})$/i);
    if(momentId){
      const id=momentId[1];
      if(!await exists(env,'life_moments',id,owner))return fail('Momento não encontrado.',404);
      if(method==='DELETE'){await env.DB.prepare('DELETE FROM life_moments WHERE id=? AND owner_id=?').bind(id,owner).run();return respond({ok:true});}
      if(method==='PUT'){
        const b=await bodyLimit(request),title=clamp(b.title,150),date=inputDate(b.moment_date),note=clamp(b.note,4000),kind=b.kind||'good';
        if(!title||!['good','milestone','reflection'].includes(kind))return fail('Preencha título e tipo válidos.');
        await env.DB.prepare('UPDATE life_moments SET title=?,moment_date=?,note=?,kind=?,updated_at=? WHERE id=? AND owner_id=?')
          .bind(title,date,note,kind,now(),id,owner).run();
        return respond({ok:true});
      }
    }
    if(path==='/api/habits'&&method==='GET'){
      const defaults=['Levantar no horário planejado','Ficar 25 minutos sem redes sociais','Fazer uma tarefa importante','Preparar as prioridades de amanhã'];
      const setup=await env.DB.prepare('SELECT owner_id FROM motivation_habit_setup WHERE owner_id=?').bind(owner).first();
      if(!setup){
        for(const title of defaults)
          await env.DB.prepare('INSERT OR IGNORE INTO motivation_habits(id,owner_id,title,created_at) VALUES(?,?,?,?)')
            .bind(crypto.randomUUID(),owner,title,now()).run();
        await env.DB.prepare('INSERT OR IGNORE INTO motivation_habit_setup(owner_id,created_at) VALUES(?,?)').bind(owner,now()).run();
      }
      const habits=await fromDB(env.DB.prepare('SELECT h.id,h.title,EXISTS(SELECT 1 FROM motivation_habit_days d WHERE d.habit_id=h.id AND d.owner_id=? AND d.day=?) AS done FROM motivation_habits h WHERE h.owner_id=? ORDER BY h.created_at ASC LIMIT 30'),owner,today,owner);
      return respond({date:today,habits});
    }
    if(path==='/api/habits'&&method==='POST'){
      const b=await bodyLimit(request),title=clamp(b.title,150);
      if(!title)return fail('Informe o nome do hábito.');
      const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM motivation_habits WHERE owner_id=?').bind(owner).first();
      if(count.n>=30)return fail('Limite de 30 hábitos atingido.');
      const id=crypto.randomUUID();
      await env.DB.prepare('INSERT OR IGNORE INTO motivation_habits(id,owner_id,title,created_at) VALUES(?,?,?,?)').bind(id,owner,title,now()).run();
      return respond({ok:true},201);
    }
    const habitDelete=path.match(/^\/api\/habits\/([a-f0-9-]{36})$/i);
    if(habitDelete&&method==='DELETE'){
      const id=habitDelete[1];
      if(!await exists(env,'motivation_habits',id,owner))return fail('Hábito não encontrado.',404);
      await env.DB.prepare('DELETE FROM motivation_habit_days WHERE owner_id=? AND habit_id=?').bind(owner,id).run();
      await env.DB.prepare('DELETE FROM motivation_habits WHERE id=? AND owner_id=?').bind(id,owner).run();
      return respond({ok:true});
    }
    const habitId=path.match(/^\/api\/habits\/([a-f0-9-]{36})\/check$/i);
    if(habitId&&method==='PATCH'){
      const id=habitId[1],b=await bodyLimit(request);
      if(!await exists(env,'motivation_habits',id,owner))return fail('Hábito não encontrado.',404);
      if(typeof b.done!=='boolean'||(b.day&&b.day!==today))return fail('Você só pode marcar o hábito de hoje.');
      if(b.done)await env.DB.prepare('INSERT OR IGNORE INTO motivation_habit_days(owner_id,habit_id,day) VALUES(?,?,?)').bind(owner,id,today).run();
      else await env.DB.prepare('DELETE FROM motivation_habit_days WHERE owner_id=? AND habit_id=? AND day=?').bind(owner,id,today).run();
      return respond({ok:true});
    }
    if(path==='/api/search/all'&&method==='GET'){
      const q=clamp(u.searchParams.get('q'),120);
      if(q.length<2)return respond({results:[],query:q});
      const pattern='%'+escLike(q.toLowerCase())+'%',results=[];
      const sources=[
        ['video','videos','id,title,substr(summary,1,180) AS detail,created_at AS stamp',['title','summary','transcript','notes','tags','visual_description']],
        ['tip','situational_tips','id,title,substr(content,1,180) AS detail,created_at AS stamp',['title','content','situation']],
        ['moment','life_moments','id,title,substr(note,1,180) AS detail,moment_date AS stamp',['title','note']],
        ['task','radar_tasks','id,title,due_date AS detail,due_date AS stamp',['title']],
        ['reflection','thought_entries','id,situation AS title,substr(automatic_thought,1,180) AS detail,created_at AS stamp',['situation','automatic_thought','balanced_thought']]
      ];
      if(u.searchParams.get('finance')==='1'){
        sources.push(['bill','finance_bills','id,name AS title,due_date AS detail,due_date AS stamp',['name']],
          ['income','finance_entries','id,description AS title,entry_date AS detail,entry_date AS stamp',['description']]);
      }
      for(const [type,table,cols,fields]of sources){
        const filter=fields.map(col=>'LOWER('+col+') LIKE ? ESCAPE \'\\\'').join(' OR ');
        const params=[owner,...fields.map(()=>pattern)];
        const rows=await fromDB(env.DB.prepare('SELECT '+cols+' FROM '+table+' WHERE owner_id=? AND ('+filter+') ORDER BY stamp DESC LIMIT 12'),...params);
        for(const r of rows)results.push({type,id:r.id,title:r.title,detail:r.detail||'',date:r.stamp||''});
      }
      results.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
      return respond({query:q,results:results.slice(0,55)});
    }
    if(path==='/api/backup/images'&&method==='GET'){
      const limit=Math.max(1,Math.min(5,Number(u.searchParams.get('limit'))||5)),offset=Math.max(0,Math.min(100000,Number(u.searchParams.get('offset'))||0));
      const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM video_images i JOIN videos v ON v.id=i.video_id WHERE v.owner_id=?').bind(owner).first();
      const items=await fromDB(env.DB.prepare('SELECT i.video_id,i.media_type,i.data_base64,i.bytes FROM video_images i JOIN videos v ON v.id=i.video_id WHERE v.owner_id=? ORDER BY i.video_id LIMIT ? OFFSET ?'),owner,limit,offset);
      return respond({items,total:count.n,next:offset+items.length<count.n?offset+items.length:null});
    }
    if(path==='/api/history'&&method==='GET'){
      const type=u.searchParams.get('type'),id=u.searchParams.get('id');
      const table={video:'videos',tip:'situational_tips'}[type];
      if(!table||!safeId.test(String(id)))return fail('Registro inválido.');
      if(!await exists(env,table,id,owner))return fail('Registro não encontrado.',404);
      const versions=await fromDB(env.DB.prepare('SELECT id,snapshot,archived_at FROM saved_versions WHERE owner_id=? AND entity_type=? AND entity_id=? ORDER BY archived_at DESC LIMIT 30'),owner,type,id);
      return respond({versions:versions.map(v=>({id:v.id,archived_at:v.archived_at,data:JSON.parse(v.snapshot)}))});
    }
    return fail('Rota não encontrada.',404);
  }catch(e){
    // Não registrar no console texto privado de notas ou dados financeiros.
    return fail(e instanceof SyntaxError?'JSON inválido.':e.message||'Erro ao processar a solicitação.',400);
  }
}
