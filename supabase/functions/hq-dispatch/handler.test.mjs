import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHandler,executeTask,validateTask,extractText,ROLES} from './handler.mjs';
const owner={id:'340d2342-ac18-481a-9fb7-0775a4ab2b0e',email_confirmed_at:'2026-11-01T00:00:00Z'};
const id='hq-12345678-1234-4234-8234-123456789abc';
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function setup({user=owner,key='test-key',claim=true,upstream=200}={}){
 const calls=[],background=[];
 const env=name=>({SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'server-secret',OPENAI_API_KEY:key}[name]);
 const fetchImpl=async(url,options={})=>{
   const body=options.body?JSON.parse(options.body):null;calls.push({url,body,headers:options.headers});
   if(url.endsWith('/auth/v1/user'))return json(user);
   if(url.endsWith('/hq_dashboard'))return json({auftraege:[]});
   if(url.endsWith('/hq_submit'))return json({id,status:'offen'});
   if(url.endsWith('/hq_claim_task'))return json(claim?{id,bot:'forge',text:'Write code',claim_token:'token'}:null);
   if(url==='https://api.openai.com/v1/responses')return json({status:'completed',output:[
    {type:'reasoning'},{type:'message',content:[{type:'output_text',text:'Result code'}]}]},upstream);
   if(url.endsWith('/hq_finish') || url.endsWith('/hq_fail'))return json(true);
   assert.fail('Unexpected request: '+url);
 };
 const handler=createHandler({env,fetchImpl,waitUntil:p=>background.push(p)});
 const request=(method='POST',body={id,bot:'forge',text:'Write code'},headers={})=>new Request('https://test/hq-dispatch',{
   method,headers:{Origin:'https://alessio2091293123123.github.io',Authorization:'Bearer user-token','Content-Type':'application/json',...headers},
   ...(method==='POST'?{body:JSON.stringify(body)}:{})
 });
 return {handler,request,calls,background};
}
test('preflight needs no login; unknown origins denied',async()=>{
 const s=setup();assert.equal((await s.handler(s.request('OPTIONS'))).status,204);
 assert.equal((await s.handler(s.request('GET',null,{Origin:'https://evil.example'}))).status,403);
 assert.equal(s.calls.length,0);
});
test('missing auth and non-owner cannot read or write',async()=>{
 const s=setup({user:{...owner,id:'other-user'}});
 assert.equal((await s.handler(s.request('GET',null,{Authorization:''}))).status,401);
 assert.equal((await s.handler(s.request())).status,403);
 assert.equal(s.calls.filter(x=>x.url.includes('/rpc/')).length,0);
});
test('unconfirmed or anonymous owner is rejected',async()=>{
 for(const user of [{...owner,email_confirmed_at:null},{...owner,is_anonymous:true}]){
 const s=setup({user});assert.equal((await s.handler(s.request())).status,403);
 }
});
test('missing API key disables submission before inserting',async()=>{
 const s=setup({key:''});const r=await s.handler(s.request());
 assert.equal(r.status,503);assert.equal(s.calls.length,1);
 const state=await (await s.handler(s.request('GET'))).json();assert.equal(state.ready,false);
});
test('known bot receives role, result persisted with token, no credentials in response',async()=>{
 const s=setup();const r=await s.handler(s.request());assert.equal(r.status,202);
 assert.deepEqual(await r.json(),{id,status:'offen'});await Promise.all(s.background);
 const model=s.calls.find(x=>x.url==='https://api.openai.com/v1/responses');
 assert.match(model.body.instructions,/FORGE/);assert.equal(model.body.store,false);
 assert.equal(model.body.input,'Write code');assert.equal(model.body.tools,undefined);
 const finish=s.calls.find(x=>x.url.endsWith('/hq_finish'));
 assert.deepEqual(finish.body,{p_id:id,p_claim_token:'token',p_result:'Result code'});
});
test('unclaimed duplicate never calls OpenAI',async()=>{
 const s=setup({claim:false});await s.handler(s.request());await Promise.all(s.background);
 assert.equal(s.calls.some(x=>x.url.includes('api.openai.com')),false);
});
test('provider errors mark failure without a fabricated completion',async()=>{
 const s=setup({upstream:429});await s.handler(s.request());await Promise.all(s.background);
 assert.equal(s.calls.some(x=>x.url.endsWith('/hq_finish')),false);
 assert.match(s.calls.find(x=>x.url.endsWith('/hq_fail')).body.p_error,/Kontingent/);
});
test('unknown bots, missing ids and long input rejected',()=>{
 for(const body of [{id,bot:'__proto__',text:'x'},{id:'x',bot:'forge',text:'x'},{id,bot:'forge',text:'x'.repeat(12001)}])
 assert.throws(()=>validateTask(body));
 assert.equal(Object.keys(ROLES).length,8);
});
test('incomplete model responses are never marked completed',()=>{
 assert.throws(()=>extractText({status:'incomplete',output:[{type:'message',content:[{type:'output_text',text:'Partial'}]}]}));
 assert.throws(()=>extractText({status:'completed',output:[]}));
});


