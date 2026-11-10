import {test} from 'node:test';
import assert from 'node:assert/strict';
class Element {
 constructor(tag='div'){this.tagName=tag;this.children=[];this.textContent='';this.value='';this.style={};this.classList={toggle(){}};}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 querySelector(selector){const value=/value="([^"]+)"/.exec(selector)?.[1];return this.children.find(x=>x.value===value)||null;}
 focus(){}
}
const dataResponse=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function harness({signedIn=true,ready=true,fetchOverride}={}){
 const ids=['sendState','hqLogin','hqAccount','hqAccountName','hqCapability','tSend','tText','tBot','bTask','taskListTitle',
 'done','tList','feedState','tp','tpx','hqSignIn','hqEmail','hqPassword','hqSignOut','hqRefresh'];
 const elements=Object.fromEntries(ids.map(id=>[id,new Element()]));
 const storage=new Map();
 if(signedIn)storage.set('admd-hq-session',JSON.stringify({access_token:'user-token',refresh_token:'refresh',
 expires_at:Math.floor(Date.now()/1000)+3600,user:{email:'owner@example.com'}}));
 globalThis.document={getElementById:id=>elements[id],createElement:tag=>new Element(tag)};
 globalThis.location={search:'?live=1'};
 globalThis.sessionStorage={getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)};
 globalThis.window=new EventTarget();
 globalThis.setInterval=()=>0;
 const calls=[];
 const defaultFetch=async(url,options={})=>{
  calls.push([url,options]);
  if(fetchOverride){const value=await fetchOverride(url,options);if(value!==undefined)return value;}
  if(url.includes('hq_feed'))return dataResponse({auftraege:[]});
  if(url.includes('/logout'))return dataResponse({});
  if(options.method==='POST')return dataResponse({id:JSON.parse(options.body).id,status:'offen'});
  return dataResponse({auftraege:[],ready});
 };
 globalThis.fetch=defaultFetch;
 const module=await import('./hq-client.mjs?test='+Math.random());
 await tick();
 return {module,elements,storage,calls};
}
test('anonymous viewer cannot submit and sees login',async()=>{
 const h=await harness({signedIn:false});
 assert.equal(h.elements.hqLogin.hidden,false);assert.equal(h.elements.tSend.disabled,true);
 h.elements.tText.value='Task';await h.module.submit();
 assert.equal(h.calls.some(([,o])=>o.method==='POST'),false);
});
test('missing server key keeps send disabled after login',async()=>{
 const h=await harness({ready:false});assert.equal(h.elements.tSend.disabled,true);
 assert.equal(h.elements.hqAccount.hidden,false);
});
test('uncertain network submission reuses id on explicit retry',async()=>{
 let first=true;const sent=[];
 const h=await harness({fetchOverride:async(url,options)=>{
  if(url.includes('hq-dispatch')&&options.method==='POST'){
   sent.push(JSON.parse(options.body));
   if(first){first=false;throw new Error('Network interruption');}
  }
 }});
 h.elements.tText.value='Write copy';h.elements.tBot.value='pixel';
 await h.module.submit();assert.ok(h.storage.has('admd-hq-pending'));
 await h.module.submit();assert.equal(sent.length,2);assert.equal(sent[0].id,sent[1].id);
 assert.equal(h.storage.has('admd-hq-pending'),false);
});
test('late private response after logout is discarded',async()=>{
 let resolveResponse;let defer=false;
 const h=await harness({fetchOverride:(url,options)=>{
  if(defer && url.includes('hq-dispatch') && options.method==='GET')
   return new Promise(resolve=>{resolveResponse=resolve;});
 }});
 defer=true;
 const inFlight=h.module.poll();await tick();
 await h.elements.hqSignOut.onclick();
 resolveResponse(dataResponse({ready:true,auftraege:[{id:'private',bot:'forge',text:'PRIVATE CONTENT',status:'erledigt',ergebnis:'PRIVATE RESULT'}]}));
 await inFlight;
 assert.equal(h.elements.hqLogin.hidden,false);
 assert.equal(h.elements.tSend.disabled,true);
 assert.equal(window.HQ_SERVER_SNAPSHOT.auftraege.length,0);
 assert.equal(h.storage.has('admd-hq-session'),false);
});


