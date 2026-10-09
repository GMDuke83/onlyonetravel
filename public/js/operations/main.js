import {api,esc,when,field,h} from './api.js';
import {tripView,saveTrip} from './trips.js';
import {mountWorkspace,workspaceViews} from './workspace.js';
import {t,label,errorText,applyTranslations,getLanguage,setLanguage,taskTitle} from './i18n.js';
const screen=document.querySelector('#screen'),notice=document.querySelector('#notice'),languageSelect=document.querySelector('#operationsLanguage');
let permissions=[],current=null,view='dashboard',navigation=0,session=null,busy=false,lastNotice=null;
function renderNotice(){notice.textContent=lastNotice?(lastNotice.error?errorText(lastNotice.error):t(lastNotice.key,lastNotice.params)):'';}
function tell(key,params){lastNotice=key?{key,params}:null;renderNotice();}
function translateShell(){applyTranslations();languageSelect.value=getLanguage();document.querySelectorAll('nav [data-view]').forEach(b=>{b.disabled=!session;});if(session)document.querySelector('#identity').textContent=session.name+' · '+label('role',session.permissionRole);}
async function refresh(v=view){
 const ticket=++navigation;view=v;current=null;screen.innerHTML='<p data-loading role="status">'+h('loading')+'</p>';const ops=await api('operations');if(ticket!==navigation)return;permissions=ops.permissions;
 document.querySelectorAll('[data-view]').forEach(b=>{b.classList.toggle('active',b.dataset.view===v);if(b.dataset.view===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');b.hidden=(b.dataset.view==='users'&&!permissions.includes('admin'))||(b.dataset.view==='audit'&&!permissions.includes('audit'));});
 if(workspaceViews.includes(v))mountWorkspace(screen,ops,v);
 if(v==='calendar'){
  const {events}=await api('calendar');if(ticket!==navigation)return;screen.innerHTML=`<h1>${h('calendar')}</h1><p>${h('agenda')}</p>${events.length?events.map(e=>`<article class="card"><div class="row"><div><span class="badge">${h('confirmedTrip')}</span><h2>${esc(e.title)}</h2><p>${when(e.starts_at)} — ${when(e.ends_at)}</p><small>${h('resource')}: ${esc(e.resource||t('unassigned'))}</small></div><button data-trip="${esc(e.request_id)}">${h('openFile')}</button></div>${permissions.includes('operate')?`<details><summary>${h('editSchedule')}</summary><form id="event-${esc(e.id)}" data-event="${esc(e.id)}" data-version="${e.version}">${field(h('startUTC'),'starts_at','datetime-local',e.starts_at.slice(0,16),'required')}${field(h('endUTC'),'ends_at','datetime-local',e.ends_at.slice(0,16),'required')}${field(h('resourceHint'),'resource','text',e.resource)}<label><input type="checkbox" name="confirmChange" required>${h('confirmSchedule')}</label><button>${h('saveEvent')}</button></form></details>`:''}</article>`).join(''):'<p class="empty">'+h('emptyCalendar')+'</p>'}`;
 }
 if(v==='tasks'){
  const {tasks}=await api('tasks');if(ticket!==navigation)return;screen.innerHTML=`<h1>${h('tasksTitle')}</h1>${tasks.map(task=>`<article class="card row"><div><span class="badge">${h(task.done?'done':Date.parse(task.due_at)<Date.now()?'overdue':'pending')}</span><h2>${esc(taskTitle(task.title))}</h2><p>${when(task.due_at)}</p></div><div class="actions"><button data-trip="${esc(task.request_id)}">${h('tripFile')}</button>${permissions.includes('operate')&&!task.done?`<button data-task="${esc(task.id)}" data-version="${task.version}">${h('complete')}</button>`:''}</div></article>`).join('')||'<p>'+h('emptyTasks')+'</p>'}`;
 }
 if(v==='users'){
  const {users}=await api('users');if(ticket!==navigation)return;screen.innerHTML=`<h1>${h('usersTitle')}</h1><p>${h('usersDescription')}</p><div class="split"><div>${users.map(u=>`<article class="card"><h2>${esc(u.name)}</h2><p>${esc(u.username||t('legacyAccess'))} · ${esc(label('role',u.role))} · ${h(u.active?'active':'blocked')}</p>${u.role!=='owner'&&u.active?`<button data-disable="${esc(u.id)}" data-role="${esc(u.role)}">${h('blockAccess')}</button>`:''}</article>`).join('')}</div><form id="user" class="card">${field(h('name'),'name','text','','required autocomplete="name" maxlength="120"')}${field(h('username'),'username','text','','required autocomplete="off" autocapitalize="none" spellcheck="false" pattern="[a-zA-Z0-9][a-zA-Z0-9._\\-]{2,63}" minlength="3" maxlength="64" aria-describedby="usernameHint"')}<p id="usernameHint" class="fieldHint">${h('usernameHint')}</p>${field(h('password'),'password','password','','required autocomplete="new-password" minlength="12" maxlength="128" aria-describedby="passwordHint"')}<p id="passwordHint" class="fieldHint">${h('passwordHint')}</p><label>${h('role')}<select name="role" aria-label="${h('role')}">${['admin','manager','sales','operations','finance','readonly'].map(r=>`<option value="${r}">${esc(label('role',r))}</option>`).join('')}</select></label><button>${h('createAccess')}</button></form></div>`;
 }
 if(v==='audit'){
  const d=await api('audit');if(ticket!==navigation)return;screen.innerHTML=`<h1>${h('audit')}</h1><p>${h('auditDescription')}</p>${[...d.events.map(e=>({at:e.at,label:label('audit',e.action),actor:e.actor,id:e.entity_id})),...d.requests.map(e=>({at:e.at,label:t('tripChanged',{version:e.version}),actor:e.actor,id:e.request_id}))].sort((a,b)=>b.at-a.at).map(e=>`<article class="card"><strong>${esc(e.label)}</strong> · ${when(e.at)}<p class="muted">${esc(e.actor)} · ${esc(e.id)}</p></article>`).join('')}`;
 }
}
async function openTrip(id){const ticket=++navigation;const result=await tripView(id,permissions);if(ticket!==navigation)return;current=result.r;screen.innerHTML=result.html;}
async function run(fn,{clear=true}={}){
 if(busy)return;busy=true;languageSelect.disabled=true;
 try{if(clear)tell();screen.setAttribute('aria-busy','true');await fn();}
 catch(error){lastNotice={error};renderNotice();const loading=screen.querySelector('[data-loading]');if(loading)loading.textContent=t('loadFailed');}
 finally{screen.setAttribute('aria-busy','false');languageSelect.disabled=false;busy=false;}
}
async function signedIn(s){session=s;translateShell();document.querySelector('#logout').hidden=false;await refresh();}
// A language change redraws labels while preserving drafts and filter controls.
function captureDrafts(){
 return [...screen.querySelectorAll('form[id]')].map(form=>({id:form.id,fields:[...form.elements].filter(e=>e.name).map(e=>({name:e.name,value:e.value,checked:e.checked})),open:form.closest('details')?.open}));
}
function restoreDrafts(drafts){
 for(const draft of drafts){
  const form=document.getElementById(draft.id);if(!form)continue;
  for(const saved of draft.fields){const e=form.elements.namedItem(saved.name);if(e){e.value=saved.value;if('checked' in e)e.checked=saved.checked;}}
  if(draft.open&&form.closest('details'))form.closest('details').open=true;
  if(draft.id==='workspaceFilters')form.dispatchEvent(new Event('input',{bubbles:true}));
 }
}
languageSelect.addEventListener('change',()=>run(async()=>{
 const drafts=captureDrafts(),tripId=current?.id;setLanguage(languageSelect.value);translateShell();renderNotice();
 if(session){if(tripId)await openTrip(tripId);else await refresh();restoreDrafts(drafts);}
},{clear:false}));
document.addEventListener('submit',e=>{
 const f=e.target;if(!['login','quote','payment','user'].includes(f.id)&&!f.dataset.event)return;e.preventDefault();
 run(async()=>{
  const b=Object.fromEntries(new FormData(f));
  if(f.id==='login'){const s=await api('session','POST',{username:b.username,password:b.password});await signedIn(s);return;}
  if(f.id==='quote'){current.offer={price:Number(b.price),currency:b.currency,validUntil:b.validUntil,custInfo:b.custInfo,internalNote:b.internalNote};current.status='offer';await saveTrip(current);await openTrip(current.id);tell('quoteSaved');}
  if(f.id==='payment'){
   const id=crypto.randomUUID();current.folio.payments.push({id,type:'balance',method:b.method,amount:Number(b.amount),currency:current.offer.currency,exchangeRate:1,status:'pending',reference:b.reference,instructions:b.notes,due:b.due});current.payment={requestId:id,link:b.link};current.status='payopen';await saveTrip(current);await openTrip(current.id);tell('paymentSaved');
  }
  if(f.id==='user'){const d=await api('users','POST',b);await refresh();tell('accessCreated',{username:d.username});}
  if(f.dataset.event){await api('calendar/'+f.dataset.event,'PUT',{...b,version:Number(f.dataset.version),starts_at:new Date(b.starts_at+'Z').toISOString(),ends_at:new Date(b.ends_at+'Z').toISOString(),confirmChange:true});await refresh('calendar');tell('scheduleSaved');}
 });
});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b||!b.matches('[data-view],[data-trip],[data-back],[data-claim],[data-share],[data-paid],[data-confirm],[data-task],[data-disable],#logout'))return;
 run(async()=>{
  if(b.dataset.view)await refresh(b.dataset.view);
  if(b.dataset.trip)await openTrip(b.dataset.trip);
  if(b.hasAttribute('data-back'))await refresh('requests');
  if(b.hasAttribute('data-claim')){await api('requests/'+current.id+'/claim','POST',{});await openTrip(current.id);tell('claimed');}
  if(b.hasAttribute('data-share')){const d=await api('requests/'+current.id+'/access-link','POST',{});tell('privateLink',{url:d.url});}
  if(b.dataset.paid){const ref=prompt(t('paymentPrompt'));if(!ref)return;const p=current.folio.payments.find(p=>p.id===b.dataset.paid);p.status='paid';p.paidAt=Date.now();current.staffNote=(current.staffNote||'')+'\n'+t('paymentEvidence')+': '+ref;await saveTrip(current);await openTrip(current.id);tell('paymentRecorded');}
  if(b.hasAttribute('data-confirm')){current.status='confirmed';await saveTrip(current);await openTrip(current.id);tell('tripConfirmed');}
  if(b.dataset.task){await api('tasks/'+b.dataset.task,'PUT',{done:true,version:Number(b.dataset.version)});await refresh('tasks');}
  if(b.dataset.disable){await api('users/'+b.dataset.disable,'PUT',{role:b.dataset.role,active:false});await refresh('users');}
  if(b.id==='logout'){await api('session','DELETE');location.reload();}
 });
});
translateShell();
run(async()=>{const s=await api('session').catch(e=>{if(e.status===401)return null;throw e;});if(s?.role==='staff')await signedIn(s);});
