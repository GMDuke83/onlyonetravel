import {esc,status,day,h} from './api.js';
import {t,getLocale} from './i18n.js';

export const workspaceViews=['dashboard','requests','customers','quotes','bookings'];
const fold=v=>String(v??'').normalize('NFKC').toLowerCase().trim();
export function scopeRows(rows,view){
 return rows.filter(r=>view==='dashboard'?r.status!=='confirmed':view==='quotes'?r.hasOffer:view==='bookings'?r.status==='confirmed':true);
}
export function filterRows(rows,{query='',state='',assignment='',order='updated'}={}){
 const searchFold=v=>String(v??'').normalize('NFKC').toLocaleLowerCase(getLocale()).trim();
 const words=searchFold(query).split(/\s+/).filter(Boolean);
 return rows.filter(r=>(!state||r.status===state)&&(!assignment||(assignment==='unassigned'?!r.assignedTo:!!r.assignedTo))&&words.every(w=>searchFold([r.code,r.name,r.phone,r.email,r.itemTitle,r.assignedTo].join(' ')).includes(w)))
  .sort((a,b)=>order==='travel'?(a.from||'9999').localeCompare(b.from||'9999')||b.updatedAt-a.updatedAt:b.updatedAt-a.updatedAt);
}
export function contactGroups(rows){
 const groups=new Map();
 for(const r of rows){
  // Grouping identity never changes with the selected display language.
  const key=r.phone||r.email?JSON.stringify([fold(r.name),fold(r.phone),fold(r.email)]):r.id;
  if(!groups.has(key))groups.set(key,{name:r.name,phone:r.phone,email:r.email,rows:[]});
  groups.get(key).rows.push(r);
 }
 return [...groups.values()].sort((a,b)=>(a.name||'').localeCompare(b.name||'',getLocale()));
}
const badge=r=>`<span class="badge" data-status="${esc(r.status)}">${esc(status[r.status]||r.status)}</span>`;
function list(rows,view){
 if(!rows.length)return `<div class="empty"><h2>${h('emptyTitle')}</h2><p>${h('emptyDescription')}</p></div>`;
 if(view==='customers')return `<div class="contactGrid">${contactGroups(rows).map(c=>`<article class="card"><p class="muted">${h('contactFiles',{count:c.rows.length})}</p><h2>${esc(c.name||t('noName'))}</h2><p>${esc(c.phone||t('noPhone'))}<br>${esc(c.email||t('noEmail'))}</p><div class="contactTrips">${c.rows.map(r=>`<button data-trip="${esc(r.id)}"><span>${esc(r.code)}</span><span>${esc(status[r.status])} · ${esc(day(r.from))}</span></button>`).join('')}</div></article>`).join('')}</div>`;
 return `<div class="card recordsCard"><table class="records"><caption class="srOnly">${h('recordsCaption')}</caption><thead><tr>${['tripCustomer','status','travelDate','assignee','action'].map(k=>`<th scope="col">${h(k)}</th>`).join('')}</tr></thead><tbody>${rows.map(r=>`<tr><td data-label="${h('tripCustomer')}"><span class="muted">${esc(r.code)}</span><strong>${esc(r.name||t('noName'))}</strong><small>${esc(r.itemTitle==='vip-callback'?t('callback'):r.itemTitle||t('customTrip'))}</small></td><td data-label="${h('status')}">${badge(r)}</td><td data-label="${h('travelDate')}">${esc(day(r.from))}</td><td data-label="${h('assignee')}">${esc(r.assignedTo||t('unassigned'))}</td><td><button data-trip="${esc(r.id)}" aria-label="${h('openTrip',{code:r.code})}">${h('open')}</button></td></tr>`).join('')}</tbody></table></div>`;
}
export function mountWorkspace(root,ops,view){
 const source=scopeRows(ops.attention,view),filters={query:'',state:'',assignment:'',order:'updated'};
 root.innerHTML=`<div class="workspaceHead"><div><p class="muted">${h('workspaceEyebrow')}</p><h1>${h(['dashboard','customers'].includes(view)?view+'.title':view)}</h1><p class="workspaceDescription">${h(view+'.description')}</p></div><button data-view="${view}">${h('refresh')}</button></div>
 ${view==='dashboard'?`<div class="grid metrics">${[['newRequests',ops.attention.filter(r=>r.status==='new').length,'requests'],['openQuotes',ops.attention.filter(r=>r.status==='offer').length,'quotes'],['awaitingPayment',ops.attention.filter(r=>['accepted','payopen'].includes(r.status)).length,'requests']].map(([title,count,target])=>`<button class="card metricCard" data-view="${target}"><span>${h(title)}</span><b class="metric">${count}</b><small>${h('viewCases')}</small></button>`).join('')}</div>`:''}
 ${ops.truncated?`<p class="limitNotice">${h('limitNotice')}</p>`:''}
 <form id="workspaceFilters" class="workspaceFilters" role="search" aria-label="${h('searchRecords')}"><label class="filterQuery">${h('search')}<input name="query" type="search" placeholder="${h('searchPlaceholder')}" autocomplete="off"></label>${view==='customers'?'':`<label>${h('status')}<select name="state" aria-label="${h('status')}"><option value="">${h('allStatus')}</option>${Object.entries(status).map(([key,label])=>`<option value="${key}">${esc(label)}</option>`).join('')}</select></label><label>${h('assignment')}<select name="assignment" aria-label="${h('assignment')}"><option value="">${h('all')}</option><option value="unassigned">${h('unassigned')}</option><option value="assigned">${h('assigned')}</option></select></label><label>${h('order')}<select name="order" aria-label="${h('order')}"><option value="updated">${h('updated')}</option><option value="travel">${h('nextTravel')}</option></select></label>`}<button type="reset">${h('reset')}</button></form>
 <p class="muted" id="resultCount" role="status" aria-live="polite"></p><div id="workspaceResults"></div>`;
 const results=root.querySelector('#workspaceResults'),count=root.querySelector('#resultCount'),form=root.querySelector('.workspaceFilters');
 const draw=()=>{const rows=filterRows(source,filters);count.textContent=view==='customers'?t('contactsCount',{contacts:contactGroups(rows).length,trips:rows.length}):t('resultsCount',{count:rows.length,total:source.length});results.innerHTML=list(rows,view);};
 const update=()=>{Object.assign(filters,Object.fromEntries(new FormData(form)));draw();};
 form.addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();});
 form.addEventListener('input',update);form.addEventListener('change',update);
 form.addEventListener('reset',()=>{Object.assign(filters,{query:'',state:'',assignment:'',order:'updated'});draw();});
 draw();
}
