import {messages} from './messages.js';

export const languages={de:'Deutsch',en:'English',tr:'Türkçe',uk:'Українська',ru:'Русский'};
const codes=Object.keys(languages),locales={de:'de-DE',en:'en-GB',tr:'tr-TR',uk:'uk-UA',ru:'ru-RU'};
export const languageStorageKey='onlyone.operations.language.v1';
export function detectLanguage(preferred,customer,browserLanguages=[]){
 for(const value of [preferred,customer])if(codes.includes(value))return value;
 for(const value of browserLanguages){
  let base=String(value).toLowerCase().replace('_','-').split('-')[0];if(base==='ua')base='uk';
  if(codes.includes(base))return base;
  if(['be','bg','sr','mk','kk','ky','uz','tg','tk','ka','hy','az','mo'].includes(base))return 'ru';
 }
 return 'en';
}
function initialLanguage(){
 let saved,customer;
 try{saved=localStorage.getItem(languageStorageKey);customer=JSON.parse(localStorage.getItem('onlyone.state.v1'))?.lang;}catch{}
 return detectLanguage(saved,customer,typeof navigator==='undefined'?[]:navigator.languages||[navigator.language]);
}
let language=initialLanguage();
export const getLanguage=()=>language;
export const getLocale=()=>locales[language];
export function translate(key,params={},lang=language){
 const value=messages[key]?.[codes.indexOf(lang)];
 if(value===undefined)throw new Error('Missing translation: '+key+'/'+lang);
 return value.replace(/\{(\w+)\}/g,(_,name)=>String(params[name]??'{'+name+'}'));
}
export const t=translate;
export const label=(group,value)=>messages[group+'.'+value]?t(group+'.'+value):String(value??'');
export function setLanguage(value){
 if(!codes.includes(value))return;
 language=value;try{localStorage.setItem(languageStorageKey,value);}catch{}
 if(typeof document!=='undefined'){document.documentElement.lang=value;document.title=t('pageTitle');}
 if(typeof window!=='undefined')window.dispatchEvent(new Event('onlyone:operations-language'));
}
export function applyTranslations(root=document){
 document.documentElement.lang=language;document.title=t('pageTitle');
 root.querySelectorAll('[data-i18n]').forEach(e=>{e.textContent=t(e.dataset.i18n);});
 root.querySelectorAll('[data-i18n-label]').forEach(e=>{e.setAttribute('aria-label',t(e.dataset.i18nLabel));});
}
export function errorText(error){
 const code=error.code||error.message||'',status=error.status;
 const keys={'invalid-credentials':'errorCredentials','session-required':'errorSession','resource-conflict':'errorResource','already-assigned':'errorAssigned','cannot-change-owner-or-self':'errorOwner','invalid-period':'errorPeriod','invalid-date':'errorPeriod','offer-expired':'errorExpiry','invalid-offer-expiry':'errorExpiry','invalid-payment-link':'errorPaymentLink','username-taken':'errorUsernameTaken','invalid-username':'errorUsername','invalid-password':'errorPassword','network':'errorNetwork'};
 if(keys[code])return t(keys[code]);
 if(code.includes('version-conflict'))return t('errorConflict');
 if(/immutable|locked|append-only/.test(code))return t('errorLocked');
 if(/payment|balance|offer-required|paid-dated|accepted-offer|nothing-due|invalid-transition/.test(code))return t('errorPayment');
 return t(status===401?'errorSession':status===403?'errorPermission':status===404?'errorMissing':status===429?'errorRate':status===400?'errorInput':status>=500||error instanceof TypeError?'errorNetwork':'errorGeneric');
}
const taskKeys={'Anfrage prüfen':'reviewTask','Importierte Reise prüfen':'importTask','Partnerbestätigung und Voucher prüfen':'partnerTask','Zahlungseingang prüfen':'paymentTask'};
export const taskTitle=value=>taskKeys[value]?t(taskKeys[value]):value;
