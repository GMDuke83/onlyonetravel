import {t,getLocale} from './i18n.js';
export async function api(path,method='GET',body){
 const res=await fetch('./api/v1/'+path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
 let data;try{data=await res.json();}catch{const e=Error('network');e.code='network';throw e;}
 if(!res.ok){const e=Error(data.error||'request-failed');e.status=res.status;e.code=data.error;throw e;}return data;
}
export const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const money=(v,c='EUR')=>new Intl.NumberFormat(getLocale(),{style:'currency',currency:c}).format(v||0);
export const when=v=>v?new Intl.DateTimeFormat(getLocale(),{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Istanbul'}).format(new Date(v)):'—';
export const day=v=>/^\d{4}-\d{2}-\d{2}$/.test(v||'')?new Intl.DateTimeFormat(getLocale(),{dateStyle:'medium',timeZone:'UTC'}).format(new Date(v+'T12:00:00Z')):(v||t('dateOpen'));
export const status=Object.defineProperties({},Object.fromEntries(['new','review','offer','accepted','payopen','paid','confirmed'].map(key=>[key,{enumerable:true,get:()=>t('status.'+key)}])));
export const h=(key,params)=>esc(t(key,params));
export const field=(label,name,type='text',value='',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra}></label>`;
