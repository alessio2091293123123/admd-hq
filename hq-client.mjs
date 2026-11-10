export const SUPABASE_URL='https://aymwwomlvjtcikqzdeqz.supabase.co';
const PUBLIC_KEY='sb_publishable_52y495rtewEGqDfVD5NMPw_hJVElNAW';
const ENDPOINT=SUPABASE_URL+'/functions/v1/hq-dispatch';
const SESSION_KEY='admd-hq-session';
const PENDING_KEY='admd-hq-pending';
const $=id=>document.getElementById(id);
const storage={
 get(key){try{return JSON.parse(sessionStorage.getItem(key));}catch{return null;}},
 set(key,value){try{value===null?sessionStorage.removeItem(key):sessionStorage.setItem(key,JSON.stringify(value));}catch{}}
};
let session=storage.get(SESSION_KEY), pending=storage.get(PENDING_KEY);
let snapshot={auftraege:[],ready:false}, busy=false, polling=false, sessionEpoch=0;
let demo=!(new URLSearchParams(location.search).has('live') || new URLSearchParams(location.search).has('feed'));
const names={pixel:'PIXEL',forge:'FORGE',guard:'GUARD',critic:'CRITIC',planner:'PLANNER',finance:'FINANCE',spark:'SPARK',leno:'LENO'};
function message(text,error=false){$('sendState').textContent=text;$('sendState').classList.toggle('error',error);}
function saveSession(value,refresh=false){if(!refresh)sessionEpoch++;session=value;storage.set(SESSION_KEY,value);}
async function auth(path,body){
 const r=await fetch(SUPABASE_URL+'/auth/v1/'+path,{
  method:'POST',headers:{apikey:PUBLIC_KEY,'Content-Type':'application/json'},body:JSON.stringify(body),
  signal:AbortSignal.timeout(20000)
 });
 const data=await r.json();
 if(!r.ok)throw new Error('Anmeldung fehlgeschlagen. Bitte E-Mail und Passwort prüfen.');
 return data;
}
async function token(){
 if(!session?.access_token)throw new Error('Bitte zuerst anmelden.');
 if(session.expires_at && session.expires_at*1000<Date.now()+60000){
  const epoch=sessionEpoch;
  try{const next=await auth('token?grant_type=refresh_token',{refresh_token:session.refresh_token});
   if(epoch!==sessionEpoch)throw new Error('Die Anmeldung wurde geändert.');saveSession(next,true);}
  catch(error){if(epoch===sessionEpoch)saveSession(null);render();throw error;}
 }
 return session.access_token;
}
async function api(method='GET',body){
 const epoch=sessionEpoch;
 const access=await token();
 const r=await fetch(ENDPOINT,{
  method,headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+access,...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000),cache:'no-store'
 });
 const data=await r.json();
 if(!r.ok){
  if(r.status===401 && epoch===sessionEpoch)saveSession(null);
  const error=new Error(data.error || 'Verbindung fehlgeschlagen.');error.status=r.status;throw error;
 }
 return data;
}
function node(tag,text,className){
 const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(className)el.className=className;return el;
}
function updateSnapshot(data){
 snapshot=data;window.HQ_SERVER_SNAPSHOT=data;
 window.dispatchEvent(new CustomEvent('hq-snapshot',{detail:data}));
 if(pending && data.auftraege.some(x=>x.id===pending.id)){
  if($('tText').value.trim()===pending.text)$('tText').value='';
  pending=null;storage.set(PENDING_KEY,null);message('Auftrag gespeichert. Das Ergebnis erscheint hier automatisch.');
 }
 render();
}
export function render(){
 $('hqLogin').hidden=demo || !!session;
 $('hqAccount').hidden=demo || !session;
 $('hqAccountName').textContent=session?.user?.email || 'Angemeldet';
 $('hqCapability').hidden=demo;
 $('hqCapability').textContent=snapshot.message || 'Die Agenten erstellen Texte, Code und Prüfberichte. Externe Änderungen sind noch nicht angeschlossen.';
 $('tSend').disabled=!demo && (busy || !session || !snapshot.ready);
 $('tSend').textContent=busy?'WIRD GESENDET…':pending?'VERSAND PRÜFEN / ERNEUT SENDEN':'SENDEN';
 $('tText').maxLength=12000;
 if(demo)return;
 const rows=snapshot.auftraege || [];
 const active=rows.filter(t=>t.status!=='erledigt' && !t.error);
 $('bTask').textContent=active.length?'+ AUFTRAG ('+active.length+')':'+ AUFTRAG';
 $('taskListTitle').textContent='AUFTRÄGE & ERGEBNISSE';
 $('done').textContent=rows.filter(t=>t.status==='erledigt').length;
 $('tList').replaceChildren();
 if(!rows.length)$('tList').append(node('div',session?'Noch keine Aufträge.':'Zum Senden und für private Ergebnisse bitte anmelden.','empty'));
 for(const task of rows){
  const row=node('div',undefined,'server-task');
  row.append(node('div',names[task.bot] || task.bot,'bn'),node('div',task.text,'task-text'));
  const stale=task.status==='laeuft' && !task.error && task.claimed_at &&
    Date.now()-Date.parse(task.claimed_at)>180000;
  row.append(node('div',task.error?'Fehlgeschlagen':stale?'Unterbrochen? Bitte prüfen':task.status==='erledigt'?'Erledigt':task.status==='laeuft'?'Agent arbeitet':'Wartet auf Übernahme','st'));
  if(task.error)row.append(node('p',task.error,'error'));
  if(stale)row.append(node('p','Keine aktuelle Rückmeldung. Der Auftrag wird nicht automatisch erneut ausgeführt.','error'));
  if(task.ergebnis){
   const details=node('details');details.append(node('summary','Ergebnis ansehen'));
   details.append(node('pre',task.ergebnis));
   const copy=node('button','KOPIEREN');copy.type='button';
   copy.onclick=async()=>{try{await navigator.clipboard.writeText(task.ergebnis);copy.textContent='KOPIERT';}
    catch{copy.textContent='Bitte Text markieren und kopieren';}};
   details.append(copy);row.append(details);
  }
  $('tList').append(row);
 }
}
export async function poll(){
 if(polling || demo)return;
 polling=true;
 const epoch=sessionEpoch;
 try{
  if(session){
   const data=await api();if(epoch!==sessionEpoch)return;updateSnapshot(data);
  }else{
   const r=await fetch(SUPABASE_URL+'/rest/v1/rpc/hq_feed',{headers:{apikey:PUBLIC_KEY},cache:'no-store',signal:AbortSignal.timeout(15000)});
   if(!r.ok)throw new Error('Feed nicht erreichbar.');
   const data=await r.json();if(epoch!==sessionEpoch)return;updateSnapshot({...data,ready:false});
  }
  $('feedState').textContent='· AKTUELL';$('feedState').style.color='#39ff7a';
 }catch(error){
  if(epoch!==sessionEpoch)return;
  $('feedState').textContent='· VERBINDUNG FEHLT';$('feedState').style.color='#ff6a8a';
  snapshot.ready=false;message(error.message || 'Verbindung unterbrochen. Die letzte Anzeige kann veraltet sein.',true);render();
 }finally{polling=false;}
}
export async function submit(){
 if(demo || busy)return;
 const text=$('tText').value.trim(),bot=$('tBot').value;
 if(!text){$('tText').focus();return;}
 if(pending && (pending.text!==text || pending.bot!==bot)){
  message('Ein früherer Versand ist noch unklar. Bitte zuerst den unveränderten Auftrag erneut senden oder den Status aktualisieren.',true);return;
 }
 if(!session || !snapshot.ready){message('Bitte anmelden und die Agentenverbindung prüfen.',true);return;}
 pending ||= {id:'hq-'+crypto.randomUUID(),bot,text};
 storage.set(PENDING_KEY,pending);
 const epoch=sessionEpoch;
 busy=true;message('Auftrag wird sicher gespeichert…');render();
 try{
  await api('POST',pending);
  if(epoch!==sessionEpoch)return;
  $('tText').value='';pending=null;storage.set(PENDING_KEY,null);
  message('Auftrag gespeichert. Der Agent startet im Hintergrund.');
  await poll();
 }catch(error){
  if(epoch!==sessionEpoch)return;
  // Keep the same id after network/uncertain outcomes. Never silently create a replacement.
  if(error.status && error.status<500){pending=null;storage.set(PENDING_KEY,null);}
  message(error.message || 'Versand unklar. Bitte Status prüfen; erneutes Senden verwendet dieselbe Auftragsnummer.',true);
 }finally{busy=false;render();}
}
$('bTask').onclick=()=>$('tp').classList.toggle('show');
$('tpx').onclick=()=>$('tp').classList.remove('show');
$('tSend').onclick=submit;
$('hqLogin').onsubmit=async event=>{
 event.preventDefault();$('hqSignIn').disabled=true;
 try{
  message('Anmeldung wird geprüft…');
  const data=await auth('token?grant_type=password',{email:$('hqEmail').value.trim(),password:$('hqPassword').value});
  saveSession(data);$('hqPassword').value='';
  // Only show private data after the server has authorised this account.
  await api();message('Angemeldet.');await poll();
 }catch(error){saveSession(null);snapshot={auftraege:[],ready:false};message(error.message,true);}
 finally{$('hqSignIn').disabled=false;render();}
};
$('hqSignOut').onclick=async()=>{
 const access=session?.access_token;saveSession(null);pending=null;storage.set(PENDING_KEY,null);
 snapshot={auftraege:[],ready:false};updateSnapshot(snapshot);message('Abgemeldet.');
 if(access)fetch(SUPABASE_URL+'/auth/v1/logout?scope=local',{method:'POST',headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+access}}).catch(()=>{});
 await poll();
};
$('hqRefresh').onclick=poll;
window.addEventListener('hq-mode',e=>{demo=!!e.detail;render();if(!demo)poll();});
window.HQ_CLIENT={submit,render,poll};
for(const [id,name]of Object.entries(names))if(!$('tBot').querySelector('option[value="'+id+'"]')){
 const option=node('option',name);option.value=id;$('tBot').append(option);
}
if(pending){$('tText').value=pending.text;$('tBot').value=pending.bot;}
render();poll();setInterval(poll,5000);


