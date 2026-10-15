import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {turnstileConfig,verifyRegistrationTurnstile} from '../src/security.js';
const read=name=>readFileSync(new URL('../'+name,import.meta.url),'utf8');
const request=new Request('https://relembra.weslleys.com/api/register',{method:'POST',headers:{'CF-Connecting-IP':'203.0.113.42'}});
const env={TURNSTILE_SITE_KEY:'site-key-test',TURNSTILE_SECRET:'secret-key-test'};

test('Turnstile não altera cadastros enquanto não foi ativado',async()=>{
  assert.deepEqual(turnstileConfig({}),{enabled:false,siteKey:'',configured:false});
  assert.equal((await verifyRegistrationTurnstile(request,{},'')).ok,true);
});

test('configuração incompleta falha fechado e impede cadastro sem token',async()=>{
  assert.deepEqual(turnstileConfig({TURNSTILE_SITE_KEY:'site-key-test'}),{enabled:true,siteKey:'site-key-test',configured:false});
  assert.equal((await verifyRegistrationTurnstile(request,{TURNSTILE_SITE_KEY:'site-key-test'},'token')).status,503);
  assert.equal((await verifyRegistrationTurnstile(request,env,'')).status,403);
  assert.equal((await verifyRegistrationTurnstile(request,env,'x'.repeat(2049))).status,403);
});

test('tokens precisam ser aprovados, vir do domínio correto e da ação register',async()=>{
  const fake=body=>async(url,init)=>{
    assert.equal(url,'https://challenges.cloudflare.com/turnstile/v0/siteverify');
    assert.equal(init.method,'POST');
    assert.equal(init.body.get('secret'),'secret-key-test');
    assert.equal(init.body.get('response'),'token-valido');
    assert.equal(init.body.get('remoteip'),'203.0.113.42');
    return new Response(JSON.stringify(body),{status:200});
  };
  assert.equal((await verifyRegistrationTurnstile(request,env,'token-valido',
    fake({success:true,hostname:'relembra.weslleys.com',action:'register'}))).ok,true);
  assert.equal((await verifyRegistrationTurnstile(request,env,'token-valido',
    fake({success:true,hostname:'evil.example',action:'register'}))).status,403);
  assert.equal((await verifyRegistrationTurnstile(request,env,'token-valido',
    fake({success:true,hostname:'relembra.weslleys.com',action:'login'}))).status,403);
  assert.equal((await verifyRegistrationTurnstile(request,env,'token-valido',
    fake({success:false,hostname:'relembra.weslleys.com',action:'register'}))).status,403);
  assert.equal((await verifyRegistrationTurnstile(request,env,'token-valido',
    async()=>new Response('Oops',{status:503}))).status,503);
});

test('cadastro possui widget, token obrigatório e reset após falha; sessão pode ser revogada',()=>{
  const html=read('public/index.html'),app=read('public/app.js'),worker=read('src/worker.js');
  const protect=read('public/register-protection.js'),security=read('src/security.js');
  assert.match(html,/id="registerTurnstileWrap"/);
  assert.match(html,/id="revokeAllSessionsBtn"/);
  assert.match(app,/configureRegistrationProtection\(session.turnstile\)/);
  assert.match(app,/registrationChallengeToken\(\)/);
  assert.match(app,/resetRegistrationProtection\(\)/);
  assert.match(app,/\/api\/sessions\/revoke-all/);
  assert.match(worker,/verifyRegistrationTurnstile\(request,env,body.turnstile_token/);
  assert.match(worker,/session_version=session_version\+1/);
  assert.match(protect,/cf-turnstile|challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
  assert.match(protect,/action:'register'/);
  assert.match(security,/https:\/\/challenges\.cloudflare\.com/);
});

test('Atlas claro usa fundo frio do Clássico também nas finanças, sem vazar ao escuro',()=>{
  const atlas=read('public/visual-atlas.css'),parity=read('public/atlas-light-parity.css');
  const finance=read('public/finance.css');
  assert.match(finance,/body\.finance-mode #financeView\{[^}]*background:#f8fafb/);
  assert.match(atlas,/body\.finance-mode\[data-visual-theme="atlas"\]\[data-color-mode="light"\] #financeView\{background:#f8fafb\}/);
  assert.match(atlas,/body\.finance-mode\[data-visual-theme="atlas"\]\[data-color-mode="light"\] \.finance-dashboard\{background:#f8fafb\}/);
  assert.doesNotMatch(atlas,/body\.finance-mode\[data-visual-theme="atlas"\] #financeView\{background:#f5f4f0\}/);
  assert.match(parity,/\.finance-dashboard \{/);
  assert.match(parity,/background-color:#f8fafb/);
  assert.match(atlas,/--bg:#f7f8fc/);
  assert.match(atlas,/--panel2:#f4f3ff/);
});
