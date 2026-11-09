import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = globalThis.__siteSecurity = { authenticated: true, cookies: new Map(), reads: [], calls: [] };
const data = source => `data:text/javascript,${encodeURIComponent(source)}`;
const api = data(`export const call=async(...args)=>{globalThis.__siteSecurity.calls.push(args);return {ok:true,status:200,data:{}}};export const deviceName=async()=> 'fixture';export const TERMS_VERSION='2026-10-24';`);
const session = data(`export const currentAccount=async()=>globalThis.__siteSecurity.authenticated?{id:'account-a',email:'fixture@example.invalid',token:'fixture-token'}:null;export const clearSession=async()=>{};export const REFRESH_COOKIE='axiom_refresh';`);
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === 'server-only') return {url:data('export {};'),shortCircuit:true};
    if (specifier === '@/lib/axiom' || specifier === './axiom' && context.parentURL?.endsWith('/lib/session.ts')) return {url:api,shortCircuit:true};
    if (specifier === '@/lib/session') return {url:session,shortCircuit:true};
    if (specifier === 'next/headers') return {url:data(`export const cookies=async()=>({get:name=>{const value=globalThis.__siteSecurity.cookies.get(name);return value===undefined?undefined:{value}},has:name=>globalThis.__siteSecurity.cookies.has(name),set:cookie=>globalThis.__siteSecurity.cookies.set(cookie.name,cookie.value),delete:name=>globalThis.__siteSecurity.cookies.delete(name)});`),shortCircuit:true};
    if (specifier === 'next/navigation') return {url:data(`export const redirect=()=>{throw new Error('FIXTURE_REDIRECT')};`),shortCircuit:true};
    if (context.parentURL?.includes('/src/web/runtime.ts')) {
      if (specifier.endsWith('/terminal/database')) return {url:data(`export class SessionChanged extends Error{};export const readWorkspace=async id=>{globalThis.__siteSecurity.reads.push(id);return {records:[],allRecords:[]}};export const queueChanges=async()=>{};export const syncWorkspace=async()=>{};`),shortCircuit:true};
      if (specifier === './tauri/event') return {url:data('export const emitNow=()=>{};'),shortCircuit:true};
    }
    let target;
    if (specifier.startsWith('@/')) target = path.join(root,'site/src',specifier.slice(2));
    else if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) target = fileURLToPath(new URL(specifier,context.parentURL));
    if (target && !path.extname(target) && fs.existsSync(target+'.ts')) return {url:pathToFileURL(target+'.ts').href,shortCircuit:true};
    return next(specifier,context);
  },
  load(url, context, next) {
    if (url.includes('/src/web/runtime.ts')) return {format:'module-typescript',source:fs.readFileSync(fileURLToPath(new URL(url)),'utf8').replaceAll('import.meta.env.DEV','false'),shortCircuit:true};
    return next(url,context);
  },
});
const load = relative => import(pathToFileURL(path.join(root,relative)).href);
const headers = {host:'audit.example.invalid',origin:'https://audit.example.invalid','content-type':'application/json'};
const account = await load('site/src/app/api/terminal/account/route.ts');
const books = await load('site/src/app/api/terminal/books/route.ts');
const sync = await load('site/src/app/api/terminal/sync/route.ts');
const calendar = await load('site/src/app/api/terminal/calendar-feed/route.ts');
const request = (body, extra={}) => new Request('https://audit.example.invalid/api/terminal/account',{method:'POST',headers:{...headers,...extra},body:JSON.stringify(body && typeof body==='object' && !Array.isArray(body)?{accountId:'account-a',...body}:body)});

test('API mutation boundaries reject foreign origins, anonymous calls, inherited operations and other accounts', async () => {
  assert.equal((await account.POST(request({op:'profile'},{origin:'https://other.example.invalid'}))).status,403);
  fixture.authenticated=false;
  assert.equal((await account.POST(request({op:'profile'}))).status,401);
  fixture.authenticated=true;
  for(const op of ['__proto__','constructor','toString']) assert.equal((await account.POST(request({op}))).status,400);
  assert.equal((await sync.POST(request({accountId:'account-b',changes:[]}))).status,409);
  assert.equal((await account.POST(request({accountId:'account-b',op:'profile'}))).status,409);
});

for (const [name, handler, limit] of [['account',account.POST,256*1024],['books',books.POST,8192],['sync',sync.POST,512*1024],['calendar',calendar.POST,8192]]) {
  test(`${name} stops oversized streams at the byte limit and cancels the body`, async () => {
    const bytes=new TextEncoder().encode(JSON.stringify({op:'profile',padding:'x'.repeat(1024*1024)}));
    let consumed=0,cancelled=false;
    const body=new ReadableStream({pull(controller){if(consumed===bytes.length)return controller.close();const end=Math.min(bytes.length,consumed+4096);controller.enqueue(bytes.slice(consumed,end));consumed=end;},cancel(){cancelled=true;}},{highWaterMark:0});
    const response=await handler(new Request(`https://audit.example.invalid/api/terminal/${name}`,{method:'POST',headers,body,duplex:'half'}));
    assert.equal(response.status,413);
    assert.ok(consumed<=limit+4096,`consumed ${consumed} bytes for a ${limit}-byte limit`);
    assert.equal(cancelled,true);
  });
}

test('JSON endpoints reject malformed bodies and count UTF-8 bytes rather than characters', async () => {
  for(const handler of [account.POST,books.POST]) for(const value of [null,[],42,'text']) assert.equal((await handler(request(value))).status,400);
  const response=await books.POST(request({op:'search',query:'é'.repeat(5000)}));
  assert.equal(response.status,413);
  const malformed=new Request('https://audit.example.invalid/api/terminal/account',{method:'POST',headers,body:'{"op":'});
  assert.equal((await account.POST(malformed)).status,400);
});

test('website sign-out removes the offline binding cookie and tokens remain httpOnly', async () => {
  const {cookieValues}=await load('site/src/lib/session-cookies.ts');
  const values=cookieValues({access_token:'fixture-access',refresh_token:'fixture-refresh',expires_in:3600});
  assert.equal(values.find(c=>c.name==='axiom_access').httpOnly,true);
  assert.equal(values.find(c=>c.name==='axiom_refresh').httpOnly,true);
  const binding=values.find(c=>c.name==='axiom_browser_session');
  assert.ok(binding?.value,'a separate browser binding is required');
  assert.equal(binding.httpOnly,false);
  const renewed=cookieValues({access_token:'renewed-access',refresh_token:'renewed-refresh',expires_in:3600},binding.value);
  assert.equal(renewed.find(c=>c.name==='axiom_browser_session').value,binding.value,'refresh must preserve the offline binding');
  for(const cookie of values)fixture.cookies.set(cookie.name,cookie.value);
  const {clearSession}=await load('site/src/lib/session.ts');
  await clearSession();
  assert.equal(fixture.cookies.size,0);
});

let revision=0;
async function offlineRuntime(binding, savedBinding) {
  fixture.reads=[];
  fixture.cookies.clear();
  if(binding)fixture.cookies.set('axiom_browser_session',binding);
  const storage=new Map([['axiom.web.account',JSON.stringify({id:'account-a',email:'fixture@example.invalid',session:savedBinding})]]);
  globalThis.localStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
  globalThis.fetch=async()=>{throw new TypeError('Fixture offline');};
  globalThis.location={search:'',href:''};
  const intervals=[];
  globalThis.window={addEventListener(){},clearTimeout(){},setTimeout(){return 1;},setInterval(callback){intervals.push(callback);return 1;}};
  globalThis.document={hidden:false,addEventListener(){},get cookie(){return [...fixture.cookies].map(([key,value])=>`${key}=${value}`).join('; ');}};
  Object.defineProperty(globalThis,'BroadcastChannel',{value:undefined,configurable:true});
  const runtime=await import(pathToFileURL(path.join(root,'src/web/runtime.ts')).href+`?security=${++revision}`);
  runtime.ready.catch(()=>{});
  await delay(0);
  return {runtime,intervals};
}

test('a signed-out or switched browser never opens another remembered offline workspace', async () => {
  for(const [binding,saved] of [[null,'old-session'],['new-session','old-session'],[null,undefined]]) {
    await offlineRuntime(binding,saved);
    assert.deepEqual(fixture.reads,[]);
  }
});

test('a valid offline workspace stays usable and an open tab locks after cookie deletion', async () => {
  const {runtime,intervals}=await offlineRuntime('same-session','same-session');
  assert.equal((await runtime.ready).id,'account-a');
  assert.ok(fixture.reads.includes('account-a'));
  fixture.cookies.clear();
  for(const check of intervals)check();
  await delay(0);
  assert.match(location.href,/sign-in/);
});

test('failed online sign-out reports failure instead of claiming the session ended', async () => {
  const {runtime}=await offlineRuntime('same-session','same-session');
  await runtime.ready;
  await assert.rejects(runtime.signOut(),/sign out|connect|offline/i);
  assert.equal(fixture.cookies.get('axiom_browser_session'),'same-session');
});
