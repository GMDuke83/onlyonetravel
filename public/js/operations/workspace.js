import {esc,status} from './api.js';

const titles={dashboard:'Reisen möglich machen.',requests:'Anfragen & Reisen',customers:'Kunden & Kontakte',quotes:'Angebote',bookings:'Buchungen'};
const descriptions={dashboard:'Offene Vorgänge im Blick. Wählen Sie eine Reiseakte für den nächsten Schritt.',requests:'Anfragen prüfen, Zuständigkeit klären und die nächste Aktion vorbereiten.',customers:'Kontakte aus Reiseakten. Nur identische Namen und Kontaktdaten werden gemeinsam angezeigt; Stammdaten werden nicht zusammengeführt.',quotes:'Alle Reiseakten mit einem individuellen Angebot und dem aktuellen Bearbeitungsstand.',bookings:'Bestätigte Reisen. Eine Buchung in der Plattform ersetzt keine Lieferantenbestätigung.'};
export const workspaceViews=Object.keys(titles);
const fold=v=>String(v??'').normalize('NFKC').toLocaleLowerCase('de').trim();
export function scopeRows(rows,view){
 return rows.filter(r=>view==='dashboard'?r.status!=='confirmed':view==='quotes'?r.hasOffer:view==='bookings'?r.status==='confirmed':true);
}
export function filterRows(rows,{query='',state='',assignment='',order='updated'}={}){
 const words=fold(query).split(/\s+/).filter(Boolean);
 return rows.filter(r=>(!state||r.status===state)&&(!assignment||(assignment==='unassigned'?!r.assignedTo:!!r.assignedTo))&&words.every(w=>fold([r.code,r.name,r.phone,r.email,r.itemTitle,r.assignedTo].join(' ')).includes(w)))
  .sort((a,b)=>order==='travel'?(a.from||'9999').localeCompare(b.from||'9999')||b.updatedAt-a.updatedAt:b.updatedAt-a.updatedAt);
}
export function contactGroups(rows){
 const groups=new Map();
 for(const r of rows){
  // This is a display index, never a customer identity or an automatic merge.
  const key=r.phone||r.email?JSON.stringify([fold(r.name),fold(r.phone),fold(r.email)]):r.id;
  if(!groups.has(key))groups.set(key,{name:r.name,phone:r.phone,email:r.email,rows:[]});
  groups.get(key).rows.push(r);
 }
 return [...groups.values()].sort((a,b)=>(a.name||'').localeCompare(b.name||'','de'));
}
const badge=r=>`<span class="badge" data-status="${esc(r.status)}">${esc(status[r.status]||r.status)}</span>`;
function list(rows,view){
 if(!rows.length)return '<div class="empty"><h2>Keine passenden Vorgänge</h2><p>Ändern Sie die Suche oder setzen Sie die Filter zurück. Neue Anfragen erscheinen nach dem Aktualisieren.</p></div>';
 if(view==='customers')return `<div class="contactGrid">${contactGroups(rows).map(c=>`<article class="card"><p class="muted">KONTAKT · ${c.rows.length} ${c.rows.length===1?'REISEAKTE':'REISEAKTEN'}</p><h2>${esc(c.name||'Ohne Namen')}</h2><p>${esc(c.phone||'Telefon nicht hinterlegt')}<br>${esc(c.email||'E-Mail nicht hinterlegt')}</p><div class="contactTrips">${c.rows.map(r=>`<button data-trip="${esc(r.id)}"><span>${esc(r.code)}</span><span>${esc(status[r.status])} · ${esc(r.from||'Datum offen')}</span></button>`).join('')}</div></article>`).join('')}</div>`;
 return `<div class="card recordsCard"><table class="records"><caption class="srOnly">Reiseakten mit Status, Reisedatum und Zuständigkeit</caption><thead><tr><th scope="col">Reise / Kunde</th><th scope="col">Status</th><th scope="col">Reisedatum</th><th scope="col">Zuständig</th><th scope="col">Aktion</th></tr></thead><tbody>${rows.map(r=>`<tr><td data-label="Reise / Kunde"><span class="muted">${esc(r.code)}</span><strong>${esc(r.name||'Ohne Namen')}</strong><small>${esc(r.itemTitle||'Individuelle Reise')}</small></td><td data-label="Status">${badge(r)}</td><td data-label="Reisedatum">${esc(r.from||'Noch offen')}</td><td data-label="Zuständig">${esc(r.assignedTo||'Nicht zugewiesen')}</td><td><button data-trip="${esc(r.id)}" aria-label="Reise ${esc(r.code)} öffnen">Öffnen</button></td></tr>`).join('')}</tbody></table></div>`;
}
export function mountWorkspace(root,ops,view){
 const source=scopeRows(ops.attention,view),filters={query:'',state:'',assignment:'',order:'updated'};
 root.innerHTML=`<div class="workspaceHead"><div><p class="muted">IHR OPERATIONS-ARBEITSPLATZ</p><h1>${titles[view]}</h1><p class="workspaceDescription">${descriptions[view]}</p></div><button data-view="${view}">Aktualisieren</button></div>
 ${view==='dashboard'?`<div class="grid metrics">${[['Neue Anfragen',ops.attention.filter(r=>r.status==='new').length,'requests'],['Angebote offen',ops.attention.filter(r=>r.status==='offer').length,'quotes'],['Zahlung ausstehend',ops.attention.filter(r=>['accepted','payopen'].includes(r.status)).length,'requests']].map(([title,count,target])=>`<button class="card metricCard" data-view="${target}"><span>${title}</span><b class="metric">${count}</b><small>Vorgänge ansehen →</small></button>`).join('')}</div>`:''}
 ${ops.truncated?'<p class="limitNotice">Es werden die 500 zuletzt geänderten Reiseakten angezeigt. Suche, Kontaktübersicht und Kennzahlen beziehen sich auf diesen Ausschnitt.</p>':''}
 <form class="workspaceFilters" role="search" aria-label="Reiseakten durchsuchen"><label class="filterQuery">Suche<input name="query" type="search" placeholder="Name, Reisenummer, Telefon …" autocomplete="off"></label>${view==='customers'?'':`<label>Status<select name="state"><option value="">Alle Status</option>${Object.entries(status).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label><label>Zuständigkeit<select name="assignment"><option value="">Alle</option><option value="unassigned">Nicht zugewiesen</option><option value="assigned">Zugewiesen</option></select></label>`}${view==='customers'?'':`<label>Sortierung<select name="order"><option value="updated">Zuletzt geändert</option><option value="travel">Nächster Reisebeginn</option></select></label>`}<button type="reset">Zurücksetzen</button></form>
 <p class="muted" id="resultCount" role="status" aria-live="polite"></p><div id="workspaceResults"></div>`;
 const results=root.querySelector('#workspaceResults'),count=root.querySelector('#resultCount'),form=root.querySelector('.workspaceFilters');
 const draw=()=>{const rows=filterRows(source,filters);count.textContent=view==='customers'?`${contactGroups(rows).length} ${contactGroups(rows).length===1?'Kontakt':'Kontakte'} aus ${rows.length} ${rows.length===1?'Reiseakte':'Reiseakten'}`:`${rows.length} von ${source.length} Vorgängen`;results.innerHTML=list(rows,view);};
 const update=e=>{if(e.target.name){filters[e.target.name]=e.target.value;draw();}};
 form.addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();});
 form.addEventListener('input',update);form.addEventListener('change',update);
 form.addEventListener('reset',()=>{Object.assign(filters,{query:'',state:'',assignment:'',order:'updated'});draw();});
 draw();
}
