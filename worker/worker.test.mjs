import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRpc, runOnce } from './worker.mjs';
const claim = { id:'t1', bot:'forge', text:'Check', claim_token:'token' };

test('unknown/unconfigured bot never claims', async () => {
  for (const bot of ['stark', 'forge'])
    await assert.rejects(runOnce({ bot, handlers:{}, rpc:() => assert.fail('claimed') }));
});
test('idle does not invoke handler', async () => {
  assert.deepEqual(await runOnce({bot:'forge',handlers:{forge:()=>assert.fail()},rpc:async()=>null}),{status:'idle'});
});
test('routes result and token; handler sees no token', async () => {
  const calls=[];
  const result=await runOnce({bot:'forge',handlers:{forge:async task=>{
    assert.deepEqual(task,{id:'t1',bot:'forge',text:'Check'}); return 'Done';
  }},rpc:async(name,args)=>{calls.push([name,args]);return name==='hq_claim'?claim:true;}});
  assert.equal(result.status,'completed');
  assert.deepEqual(calls[1],['hq_finish',{p_id:'t1',p_claim_token:'token',p_result:'Done'}]);
});
test('handler failure or invalid output never marks completed', async () => {
  for(const handler of [async()=>{throw Error('failed')},async()=>'',async()=>({})]){
    const calls=[];
    await assert.rejects(runOnce({bot:'forge',handlers:{forge:handler},rpc:async name=>{calls.push(name);return claim;}}));
    assert.deepEqual(calls,['hq_claim']);
  }
});
test('rejected finish stops; no automatic retry', async () => {
  let n=0;
  await assert.rejects(runOnce({bot:'forge',handlers:{forge:async()=>'Done'},rpc:async()=>++n===1?claim:false}));
  assert.equal(n,2);
});
test('wrong bot is never executed', async () => {
  await assert.rejects(runOnce({bot:'forge',handlers:{forge:()=>assert.fail()},rpc:async()=>({...claim,bot:'pixel'})}));
});
test('RPC sends server credentials in headers; checks HTTP errors', async () => {
  const rpc=createRpc({url:'https://example.supabase.co',key:'secret',fetchImpl:async(url,options)=>{
    assert.equal(url.search,''); assert.equal(options.headers.apikey,'secret');
    assert.equal(options.method,'POST'); return {ok:false,status:403};
  }});
  await assert.rejects(rpc('hq_claim',{p_bot:'forge'}),/HTTP 403/);
  assert.throws(()=>createRpc({url:'http://example.com',key:'secret'}));
});
