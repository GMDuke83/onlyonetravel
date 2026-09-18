/* Staff-only catalog. Supplier costs are fetched after server authorization,
   held only in memory, and never written to localStorage. */
(function(){
  'use strict';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const categories={hotel:'Hotel',villa:'Villa',yacht:'Yacht',transfer:'Transfer',excursion:'Ausflug',other:'Sonstiges'};
  const money=(n,c)=>new Intl.NumberFormat('de-DE',{style:'currency',currency:c}).format(n/100);
  async function api(path,method='GET',body){
    const response=await fetch('./api/v1/'+path,{method,credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    let data;try{data=await response.json();}catch{throw Error('Server nicht erreichbar. Eingaben bleiben geöffnet.');}
    if(!response.ok)throw Error(data.error==='version-conflict'?'Zwischenzeitlich geändert. Eingaben sichern und Liste neu laden.':data.error||'Speichern fehlgeschlagen');
    return data;
  }
  async function all(path){let rows=[],cursor;do{const page=await api(path+(cursor?'?cursor='+encodeURIComponent(cursor):''));rows.push(...page.records);cursor=page.cursor;}while(cursor);return rows;}
  window.mountOnlyoneCatalog=async function(root,{onCreated}){
    if(!root)return;
    let partners=[],services=[],busy=false;
    root.innerHTML='<p role="status">Verwaltung wird geladen …</p>';
    const field=(name,label,value='',type='text',extra='')=>`<label class="catalogField">${esc(label)}<input class="input" name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
    const select=(name,label,options,value)=>`<label class="catalogField">${label}<select class="input" name="${name}" aria-label="${esc(label)}">${options.map(([v,t])=>`<option value="${esc(v)}" ${v===value?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
    function error(e){const box=root.querySelector('[data-catalog-error]');if(box)box.textContent=e.message;else root.textContent=e.message;}
    function list(){
      root.innerHTML=`<div class="catalogNav"><button class="btn btn--primary" data-catalog-new="partners">Partner anlegen</button><button class="btn btn--gold" data-catalog-new="services">Leistung anlegen</button><button class="btn btn--ghost" data-catalog-refresh>Neu laden</button></div>
      <p class="noteBox">Interne Verwaltung · Leistungen sind auf Anfrage. Ein angelegter Partner hat noch keinen eigenen Zugang. Angebote werden persönlich freigegeben.</p>
      <p role="alert" data-catalog-error></p><div data-catalog-editor></div>
      <label class="catalogField">Partner oder Leistung suchen<input class="input" type="search" data-catalog-search></label>
      <h2 class="h-lg">Eigene Leistungen (${services.length})</h2>
      ${services.length?services.map(r=>`<article class="listCard" data-catalog-searchable="${esc((r.name+' '+(partners.find(p=>p.id===r.partnerId)?.name||'')).toLowerCase())}"><b>${esc(r.name)}</b><p>${esc(categories[r.category])} · ${esc(partners.find(p=>p.id===r.partnerId)?.name||'')} · ${r.active?'Aktiv':'Archiviert'}</p><p>Einkauf: ${money(r.costMinor,r.currency)} / ${esc(r.unit)}</p><div class="catalogNav"><button class="btn btn--ghost" data-catalog-edit="services" data-id="${r.id}">Leistung bearbeiten</button>${r.active&&partners.some(p=>p.id===r.partnerId&&p.active)?`<button class="btn btn--primary" data-catalog-offer="${r.id}">Angebot erstellen</button>`:''}</div></article>`).join(''):'<p>Noch keine eigenen Leistungen. Zuerst einen Partner, dann dessen Leistung anlegen.</p>'}
      <h2 class="h-lg">Partner (${partners.length})</h2>
      ${partners.map(r=>`<article class="listCard" data-catalog-searchable="${esc((r.name+' '+r.contact).toLowerCase())}"><b>${esc(r.name)}</b><p>${esc(r.contact)} · ${r.active?'Aktiv':'Archiviert'}</p><p>${esc(r.email)} ${esc(r.phone)}</p><button class="btn btn--ghost" data-catalog-edit="partners" data-id="${r.id}">Partner bearbeiten</button></article>`).join('')}`;
    }
    async function reload(){[partners,services]=await Promise.all([all('partners'),all('services')]);if(root.isConnected)list();}
    function editor(table,r={active:true}){
      const service=table==='services';
      if(service&&!partners.some(p=>p.active)&&!r.id){error(Error('Bitte zuerst einen aktiven Partner anlegen.'));return;}
      const target=root.querySelector('[data-catalog-editor]');
      target.innerHTML=`<form class="listCard catalogForm" data-catalog-form="${table}" data-id="${esc(r.id||'')}"><h2 class="h-lg">${service?'Leistung':'Partner'} ${r.id?'bearbeiten':'anlegen'}</h2>
        ${field('name','Name',r.name,'text','required maxlength="200"')}
        ${service?select('partnerId','Partner',partners.filter(p=>p.active||p.id===r.partnerId).map(p=>[p.id,p.name]),r.partnerId)+select('category','Kategorie',Object.entries(categories),r.category)+field('unit','Preiseinheit, z. B. Nacht / Fahrzeug / Person',r.unit,'text','required maxlength="200"')+field('cost','Einkaufspreis je Einheit',((r.costMinor||0)/100).toFixed(2),'number','required min="0" max="9999999" step="0.01"')+select('currency','Währung',['EUR','TRY','USD','GBP'].map(v=>[v,v]),r.currency)+`<label class="catalogField">Leistungsbeschreibung<textarea class="input" name="description" maxlength="2000">${esc(r.description)}</textarea></label>`:field('contact','Ansprechpartner',r.contact,'text','maxlength="200"')+field('email','E-Mail',r.email,'email','maxlength="200"')+field('phone','Telefon',r.phone,'text','maxlength="200"')}
        <label class="catalogField">Interne Notizen<textarea class="input" name="notes" maxlength="2000">${esc(r.notes)}</textarea></label>
        <label><input type="checkbox" name="active" ${r.active?'checked':''}> Aktiv (abwählen zum Archivieren)</label>
        <div class="catalogNav"><button class="btn btn--primary" type="submit">Speichern</button><button class="btn btn--ghost" type="button" data-catalog-cancel>Abbrechen</button></div></form>`;
      target.querySelector('input').focus();
    }
    function offer(id){
      const r=services.find(x=>x.id===id),target=root.querySelector('[data-catalog-editor]');
      target.innerHTML=`<form class="listCard catalogForm" data-catalog-quote="${r.id}" data-request-id="r${crypto.randomUUID().replace(/-/g,'')}"><h2 class="h-lg">Angebot · ${esc(r.name)}</h2>
      ${field('first','Kundenname','','text','required maxlength="100"')}${field('phone','Telefon','','text','required maxlength="100"')}${field('email','E-Mail','','email','maxlength="200"')}
      ${field('from','Von','','date','required')}${field('to','Bis','','date','required')}${field('adults','Reisende',1,'number','required min="1" max="1000" step="1"')}
      ${field('quantity','Anzahl Preiseinheiten · '+r.unit,1,'number','required min="1" max="10000" step="1"')}${field('price','Kundenpreis gesamt · '+r.currency,'','number','required min="0.01" max="9999999" step="0.01"')}
      <p data-catalog-margin aria-live="polite"></p>
      ${field('validUntil','Angebot gültig bis','','date','required')}
      <label class="catalogField">Text für den Kunden<textarea class="input" name="custInfo" maxlength="2000">${esc(r.description)}</textarea></label>
      <p class="noteBox">Mit der Freigabe entsteht ein individuelles Kundenangebot. Eine Partnerbestätigung und eine Zahlungsanforderung erfolgen separat. Den privaten Kundenzugang finden Sie anschließend in der Reiseakte.</p>
      <div class="catalogNav"><button class="btn btn--primary" type="submit">Angebot freigeben</button><button class="btn btn--ghost" type="button" data-catalog-cancel>Abbrechen</button></div></form>`;
      target.querySelector('input').focus();updateMargin();
    }
    function updateMargin(){const f=root.querySelector('[data-catalog-quote]');if(!f)return;const r=services.find(x=>x.id===f.dataset.catalogQuote),cost=r.costMinor*Number(f.elements.quantity.value),price=Math.round(Number(f.elements.price.value)*100);f.querySelector('[data-catalog-margin]').textContent='Einkauf gesamt: '+money(cost,r.currency)+(f.elements.price.value?' · Differenz zum Einkauf: '+money(price-cost,r.currency):'');}
    root.addEventListener('input',e=>{if(e.target.matches('[data-catalog-search]')){for(const card of root.querySelectorAll('[data-catalog-searchable]'))card.hidden=!card.dataset.catalogSearchable.includes(e.target.value.toLowerCase());}else updateMargin();});
    root.addEventListener('click',async e=>{
      const b=e.target.closest('button');if(!b||busy)return;
      if(b.hasAttribute('data-catalog-new'))editor(b.dataset.catalogNew);
      if(b.hasAttribute('data-catalog-edit'))editor(b.dataset.catalogEdit,(b.dataset.catalogEdit==='partners'?partners:services).find(r=>r.id===b.dataset.id));
      if(b.hasAttribute('data-catalog-offer'))offer(b.dataset.catalogOffer);
      if(b.hasAttribute('data-catalog-cancel'))root.querySelector('[data-catalog-editor]').replaceChildren();
      if(b.hasAttribute('data-catalog-refresh')){try{await reload();}catch(err){error(err);}}
    });
    root.addEventListener('submit',async e=>{
      e.preventDefault();if(busy)return;const f=e.target,data=Object.fromEntries(new FormData(f));busy=true;
      const submit=f.querySelector('[type="submit"]');submit.disabled=true;root.querySelector('[data-catalog-error]').textContent='';
      try{
        if(f.hasAttribute('data-catalog-quote')){
          const r=services.find(x=>x.id===f.dataset.catalogQuote);
          if(data.to<data.from)throw Error('Das Enddatum liegt vor dem Beginn.');
          if(data.validUntil<new Date().toISOString().slice(0,10))throw Error('Bitte ein gültiges Angebotsdatum wählen.');
          const result=await api('requests','POST',{request:{id:f.dataset.requestId,sourceServiceId:r.id,serviceVersion:r._version,quantity:Number(data.quantity),contact:{first:data.first,phone:data.phone,email:data.email},from:data.from,to:data.to,adults:Number(data.adults),offer:{price:Number(data.price),validUntil:data.validUntil,custInfo:data.custInfo}}});
          // Keep the same request ID if the connection fails after saving.
          await onCreated(result.request);
        }else{
          const table=f.dataset.catalogForm,old=(table==='partners'?partners:services).find(r=>r.id===f.dataset.id);
          const record={...data,active:f.elements.active.checked};if(table==='services'){record.costMinor=Math.round(Number(data.cost)*100);delete record.cost;}
          await api(table+(old?'/'+old.id:''),old?'PUT':'POST',{record,version:old?._version});await reload();
        }
      }catch(err){error(err);}finally{busy=false;submit.disabled=false;}
    });
    try{await reload();}catch(e){root.innerHTML='<p role="alert" data-catalog-error></p><button class="btn btn--ghost" data-catalog-refresh>Erneut laden</button>';error(e);}
  };
})();
