export async function api(path,method='GET',body){
 const res=await fetch('./api/v1/'+path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 let data;try{data=await res.json();}catch{throw Error('Backend nicht erreichbar. Bitte erneut versuchen.');}
 if(!res.ok)throw Error(data.error||'Anfrage fehlgeschlagen');return data;
}
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=(v,c='EUR')=>new Intl.NumberFormat('de-DE',{style:'currency',currency:c}).format(v||0);
export const when=v=>v?new Intl.DateTimeFormat('de-DE',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(new Date(v)):'—';
export const status={new:'Neue Anfrage',review:'In Prüfung',offer:'Angebot offen',accepted:'Angenommen',payopen:'Zahlung offen',paid:'Bezahlt',confirmed:'Bestätigt'};
export const field=(label,name,type='text',value='',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
