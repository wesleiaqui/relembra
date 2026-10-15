import test from 'node:test';
import assert from 'node:assert/strict';
import {readLimitedText,readLimitedJSON,secureResponse,reserveAIQuota} from '../src/security.js';
import worker from '../src/worker.js';

test('Security headers disable framing, content sniffing and inline scripts',async()=>{
  const page=secureResponse(new Response('<!doctype html><html></html>',{
    headers:{'content-type':'text/html;charset=UTF-8'}
  }),{asset:true});
  assert.equal(page.status,200);
  assert.equal(page.headers.get('X-Frame-Options'),'DENY');
  assert.equal(page.headers.get('X-Content-Type-Options'),'nosniff');
  assert.equal(page.headers.get('Cross-Origin-Resource-Policy'),'same-origin');
  assert.match(page.headers.get('Content-Security-Policy'),/script-src 'self'/);
  assert.match(page.headers.get('Content-Security-Policy'),/frame-ancestors 'none'/);
  assert.match(page.headers.get('Content-Security-Policy'),/https:\/\/www\.instagram\.com/);
  assert.doesNotMatch(page.headers.get('Content-Security-Policy'),/script-src [^;]*unsafe-inline/);
  assert.equal(await page.text(),'<!doctype html><html></html>');
  const api=secureResponse(new Response('{"ok":true}',{headers:{'cache-control':'no-store'}}));
  assert.equal(api.headers.get('cache-control'),'no-store');
  assert.match(api.headers.get('content-security-policy'),/default-src 'none'/);
});
test('Worker applies security headers to public assets even without login',async()=>{
  const env={ASSETS:{fetch:async()=>new Response('<html>Visitante</html>',{headers:{'content-type':'text/html'}})}};
  const res=await worker.fetch(new Request('https://relembra.example/'),env);
  assert.equal(res.status,200);
  assert.match(res.headers.get('content-security-policy'),/script-src 'self'/);
  assert.equal(res.headers.get('x-frame-options'),'DENY');
});
test('streaming bodies have byte limits even when there is no Content-Length',async()=>{
  const request=(chunks)=>new Request('https://relembra.example/api/test',{
    method:'POST',body:new ReadableStream({
      start(controller){for(const chunk of chunks)controller.enqueue(new TextEncoder().encode(chunk));controller.close();}
    }),duplex:'half'
  });
  assert.deepEqual(await readLimitedJSON(request(['{"ok":','true}']),200),{ok:true});
  await assert.rejects(readLimitedJSON(request(['{"a":"','🙂'.repeat(60),'"}']),200),/grande/);
  await assert.rejects(readLimitedJSON(request(['null']),100),/JSON inválido/);
  await assert.rejects(readLimitedJSON(request(['[]']),100),/JSON inválido/);
  await assert.rejects(readLimitedJSON(request(['{broken']),100),/JSON inválido/);
  assert.equal(await readLimitedText(request(['12345','67']),10),'1234567');
});
test('cotação atômica de IA separa tipo e usuário, evitando consumo irrestrito',async()=>{
  const attempts=new Map();
  const env={APP_PASSWORD:'chave-local-teste',DB:{prepare(query){
    assert.match(query,/RETURNING attempts/);
    return {bind(key,stamp,cutoff){
      return {async first(){
        const prior=attempts.get(key);
        const count=!prior||prior.window_start<cutoff?1:prior.attempts+1;
        attempts.set(key,{attempts:count,window_start:!prior||prior.window_start<cutoff?stamp:prior.window_start});
        return {attempts:count};
      }};
    }};
  }}};
  for(let i=0;i<6;i++)assert.equal(await reserveAIQuota(env,'usuario-a','canvas'),true);
  assert.equal(await reserveAIQuota(env,'usuario-a','canvas'),false);
  assert.equal(await reserveAIQuota(env,'usuario-b','canvas'),true);
  for(let i=0;i<12;i++)assert.equal(await reserveAIQuota(env,'usuario-a','thought'),true);
  assert.equal(await reserveAIQuota(env,'usuario-a','thought'),false);
  for(let i=0;i<10;i++)assert.equal(await reserveAIQuota(env,'usuario-a','image'),true);
  assert.equal(await reserveAIQuota(env,'usuario-a','image'),false);
  for(let i=0;i<45;i++)assert.equal(await reserveAIQuota(env,'usuario-a','chat'),true);
  assert.equal(await reserveAIQuota(env,'usuario-a','chat'),false);
  await assert.rejects(reserveAIQuota(env,'usuario-a','unknown'),/inválido/);
  assert.equal(attempts.size,5);
});
