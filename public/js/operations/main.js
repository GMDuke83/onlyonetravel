import {api,esc,money,when,status,field} from './api.js';
import {tripView,saveTrip} from './trips.js';
const screen=document.querySelector('#screen'),notice=document.querySelector('#notice');let permissions=[],current=null,view='dashboard',navigation=0;
const tell=m=>{notice.textContent=m;};
async function refresh(v=view){
 const ticket=++navigation;view=v;current=null;const ops=await api('operations');if(ticket!==navigation)return;permissions=ops.permissions;
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===v);b.hidden=(b.dataset.view==='users'&&!permissions.includes('admin'))||(b.dataset.view==='audit'&&!permissions.includes('audit'));});
 if(v==='dashboard'||v==='requests'){
  const rows=ops.attention,open=rows.filter(r=>r.status!=='confirmed');
  screen.innerHTML=`<p class="muted">Ihr persönlicher Operations-Arbeitsplatz</p><h1>${v==='dashboard'?'Reisen möglich machen.':'Anfragen & Reisen'}</h1>${v==='dashboard'?`<div class="grid"><article class="card"><span class="muted">NEUE ANFRAGEN</span><b class="metric">${rows.filter(r=>r.status==='new').length}</b></article><article class="card"><span class="muted">ANGEBOTE OFFEN</span><b class="metric">${rows.filter(r=>r.status==='offer').length}</b></article><article class="card"><span class="muted">ZAHLUNG AUSSTEHEND</span><b class="metric">${rows.filter(r=>['accepted','payopen'].includes(r.status)).length}</b></article></div>`:''}<h2>${v==='dashboard'?'Braucht Aufmerksamkeit':'Alle Reiseakten'}</h2><p class="muted">${v==='dashboard'?'Offene Vorgänge, Angebote und Zahlungsfristen.':'Anfragen werden geräteübergreifend gespeichert.'}</p><div class="card">${(v==='dashboard'?open:rows).length?`<table><thead><tr><th>Reise / Kunde</th><th>Status</th><th class="desktop-only">Reisedatum</th><th>Aktion</th></tr></thead><tbody>${(v==='dashboard'?open:rows).map(r=>`<tr><td>${esc(r.code)}<br><strong>${esc(r.name)}</strong></td><td><span class="badge">${status[r.status]}</span></td><td class="desktop-only">${esc(r.from||'Offen')}</td><td><button data-trip="${r.id}">Öffnen</button></td></tr>`).join('')}</tbody></table>`:'<p class="empty">Keine offenen Vorgänge. Neue Kundenanfragen erscheinen hier.</p>'}</div>`;
 }
 if(v==='calendar'){
  const {events}=await api('calendar');if(ticket!==navigation)return;screen.innerHTML=`<h1>Kalender</h1><p>Operations-Agenda · Europe/Istanbul</p>${events.length?events.map(e=>`<article class="card"><div class="row"><div><span class="badge">Bestätigte Reise</span><h2>${esc(e.title)}</h2><p>${when(e.starts_at)} — ${when(e.ends_at)}</p><small>Ressource: ${esc(e.resource||'Nicht zugewiesen')}</small></div><button data-trip="${e.request_id}">Reiseakte öffnen</button></div>${permissions.includes('operate')?`<details><summary>Planungszeit / Ressource ändern</summary><form data-event="${e.id}" data-version="${e.version}">${field('Beginn (UTC)','starts_at','datetime-local',e.starts_at.slice(0,16),'required')}${field('Ende (UTC)','ends_at','datetime-local',e.ends_at.slice(0,16),'required')}${field('Ressource (z. B. Fahrzeug-ID)','resource','text',e.resource)}<label><input type="checkbox" name="confirmChange" required>Planungsänderung bestätigen; Kundenreisedaten bleiben separat.</label><button>Termin speichern</button></form></details>`:''}</article>`).join(''):'<p class="empty">Bestätigte Reisen erscheinen hier automatisch.</p>'}`;
 }
 if(v==='tasks'){
  const {tasks}=await api('tasks');if(ticket!==navigation)return;screen.innerHTML=`<h1>Aufgaben & Fristen</h1>${tasks.map(t=>`<article class="card row"><div><span class="badge">${t.done?'Erledigt':Date.parse(t.due_at)<Date.now()?'Überfällig':'Offen'}</span><h2>${esc(t.title)}</h2><p>${when(t.due_at)}</p></div><div class="actions"><button data-trip="${t.request_id}">Reiseakte</button>${permissions.includes('operate')&&!t.done?`<button data-task="${t.id}" data-version="${t.version}">Erledigen</button>`:''}</div></article>`).join('')||'<p>Keine Aufgaben vorhanden.</p>'}`;
 }
 if(v==='users'){
  const {users}=await api('users');if(ticket!==navigation)return;screen.innerHTML=`<h1>Mitarbeiter & Rechte</h1><p>Persönliche Zugangstoken werden nur einmal angezeigt. Sperren meldet alle Geräte ab.</p><div class="split"><div>${users.map(u=>`<article class="card"><h2>${esc(u.name)}</h2><p>${esc(u.role)} · ${u.active?'Aktiv':'Gesperrt'}</p>${u.role!=='owner'?`<button data-disable="${u.id}" data-role="${u.role}">Zugang sperren</button>`:''}</article>`).join('')}</div><form id="user" class="card">${field('Name','name','text','','required')}<label>Rolle<select name="role">${['admin','manager','sales','operations','finance','readonly'].map(r=>`<option>${r}</option>`).join('')}</select></label><button>Zugang erstellen</button></form></div>`;
 }
 if(v==='audit'){
  const d=await api('audit');if(ticket!==navigation)return;screen.innerHTML=`<h1>Audit-Protokoll</h1><p>Letzte 200 Zugangsereignisse und 200 Reiseänderungen.</p>${[...d.events.map(e=>({at:e.at,label:e.action,actor:e.actor,id:e.entity_id})),...d.requests.map(e=>({at:e.at,label:'Reiseänderung V'+e.version,actor:e.actor,id:e.request_id}))].sort((a,b)=>b.at-a.at).map(e=>`<article class="card"><strong>${esc(e.label)}</strong> · ${when(e.at)}<p class="muted">${esc(e.actor)} · ${esc(e.id)}</p></article>`).join('')}`;
 }
}
async function openTrip(id){const ticket=++navigation;const result=await tripView(id,permissions);if(ticket!==navigation)return;current=result.r;screen.innerHTML=result.html;}
async function run(fn){try{tell('');await fn();}catch(e){tell(e.message);}}
async function signedIn(s){document.querySelector('#identity').textContent=s.name+' · '+(s.permissionRole||'');document.querySelector('#logout').hidden=false;await refresh();}
document.addEventListener('submit',e=>{e.preventDefault();run(async()=>{
 const f=e.target,b=Object.fromEntries(new FormData(f));
 if(f.id==='login'){const s=await api('session','POST',{staffKey:b.token});await signedIn(s);return;}
 if(f.id==='quote'){current.offer={price:Number(b.price),currency:b.currency,validUntil:b.validUntil,custInfo:b.custInfo,internalNote:b.internalNote};current.status='offer';await saveTrip(current);await openTrip(current.id);tell('Angebotsversion gespeichert. Portallink kann jetzt geteilt werden.');}
 if(f.id==='payment'){
  const id=crypto.randomUUID();current.folio.payments.push({id,type:'balance',method:b.method,amount:Number(b.amount),currency:current.offer.currency,exchangeRate:1,status:'pending',reference:b.reference,instructions:b.notes,due:b.due});current.payment={requestId:id,link:b.link};current.status='payopen';await saveTrip(current);await openTrip(current.id);tell('Zahlungsanforderung gespeichert.');
 }
 if(f.id==='user'){const d=await api('users','POST',b);await refresh();tell('Zugang erstellt. Jetzt sicher übergeben; nur einmal sichtbar: '+d.token);}
 if(f.dataset.event){await api('calendar/'+f.dataset.event,'PUT',{...b,version:Number(f.dataset.version),starts_at:new Date(b.starts_at+'Z').toISOString(),ends_at:new Date(b.ends_at+'Z').toISOString(),confirmChange:true});await refresh('calendar');tell('Planungsänderung protokolliert.');}
 });});
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;run(async()=>{
 if(b.dataset.view)await refresh(b.dataset.view);
 if(b.dataset.trip)await openTrip(b.dataset.trip);
 if(b.hasAttribute('data-back'))await refresh('requests');
 if(b.hasAttribute('data-claim')){await api('requests/'+current.id+'/claim','POST',{});await openTrip(current.id);tell('Anfrage übernommen.');}
 if(b.hasAttribute('data-share')){const d=await api('requests/'+current.id+'/access-link','POST',{});tell('Privater Kundenlink (7 Tage gültig): '+d.url);}
 if(b.dataset.paid){const ref=prompt('Zahlungseingang beim Empfänger geprüft? Beleg-/Partnerbestätigungsreferenz eingeben:');if(!ref)return;const p=current.folio.payments.find(p=>p.id===b.dataset.paid);p.status='paid';p.paidAt=Date.now();current.staffNote=(current.staffNote||'')+'\nZahlungsnachweis: '+ref;await saveTrip(current);await openTrip(current.id);tell('Zahlungseingang verbucht.');}
 if(b.hasAttribute('data-confirm')){current.status='confirmed';await saveTrip(current);await openTrip(current.id);tell('Reise bestätigt; Buchung und Kalendertermin angelegt.');}
 if(b.dataset.task){await api('tasks/'+b.dataset.task,'PUT',{done:true,version:Number(b.dataset.version)});await refresh('tasks');}
 if(b.dataset.disable){await api('users/'+b.dataset.disable,'PUT',{role:b.dataset.role,active:false});await refresh('users');}
 if(b.id==='logout'){await api('session','DELETE');location.reload();}
 });});
run(async()=>{const s=await api('session');if(s.role==='staff')await signedIn(s);});
