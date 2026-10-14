import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const file = path => readFileSync(new URL('../public/'+path,import.meta.url),'utf8');
const html = file('index.html');
const css = file('chat-layout-refined.css');
const app = file('app.js');

test('chat usa toda a largura e a altura útil, mantendo rolagem apenas na conversa',()=>{
  assert.ok(html.indexOf('/chat-layout-refined.css')>html.indexOf('/dark-unified.css'));
  assert.ok(html.indexOf('/chat-layout-refined.css')>html.indexOf('/chat-workspace.css'));
  assert.equal((html.match(/\/chat-layout-refined\.css/g)||[]).length,1);
  assert.match(css,/#page:has\(> #chatView:not\(\[hidden\]\)\)/);
  assert.match(css,/height:calc\(100dvh - 79px\)/);
  assert.match(css,/#chatView:not\(\[hidden\]\)/);
  assert.match(css,/#chatView \.chat-unified-shell\s*\{[^}]*max-width:none/s);
  assert.match(css,/#chatView \.chat-single-shell\s*\{[^}]*height:100%/s);
  assert.match(css,/#chatView \.chat-single-shell \.chat-messages\.chat-workspace-messages\s*\{[^}]*flex:1 1 0;[^}]*max-height:none;[^}]*overflow-y:auto/s);
  assert.match(css,/@media\(max-width:760px\)/);
  assert.match(css,/@media\(max-width:480px\)/);
  assert.doesNotMatch(css,/!important/);
});

test('composer é campo único, acessível e preserva Enter, Shift+Enter e busca',()=>{
  assert.match(html,/<form class="chat-compose chat-workspace-composer" id="chatForm">/);
  assert.match(html,/<textarea id="chatInput" rows="1"[^>]*aria-label="Digite sua pergunta ou o que deseja encontrar"><\/textarea>/);
  assert.doesNotMatch(html,/<label class="sr-only" for="chatInput">/);
  assert.match(html,/<button class="button button-primary send-btn" id="sendChatBtn" type="submit"[^>]*><svg viewBox="0 0 24 24"/);
  assert.match(html,/id="universalFinance" type="checkbox"/);
  assert.match(css,/#chatView \.chat-workspace-composer textarea\s*\{[^}]*flex:1 1 auto/s);
  assert.match(css,/font:500 14px\/1\.55/);
  assert.match(css,/#chatView \.chat-workspace-composer \.send-btn svg/);
  assert.match(app,/function resizeChatComposer\(\)/);
  assert.match(app,/\$\('chatInput'\)\.addEventListener\('keydown',e=>/);
  assert.match(app,/if\(e\.key==='Enter'&&!e\.shiftKey/);
  assert.match(app,/searchMemory\(q,includeFinance\)/);
  assert.match(app,/document\.createElement\('div'\)/);
});
