import { fail } from './security.js';
const currencies=['EUR','USD','TRY','GBP'];
const states=['new','review','offer','accepted','payopen','paid','confirmed'];
const str=(v,max=2000)=>typeof v==='string'?v.slice(0,max):'';
const num=(v,min,max)=>{if(!Number.isFinite(v)||v<min||v>max) fail(400,'invalid-number');return v;};
const money=v=>Math.round(num(v,0.01,9999999)*100)/100;
const currency=v=>{if(!currencies.includes(v)) fail(400,'invalid-currency');return v;};
const list=v=>Array.isArray(v)?v.slice(0,50):[];
export function createRequest(input,id,allowMissingPhone=false) {
  const contact=input.contact||{};
  if(!str(contact.first,100)||(!allowMissingPhone&&!str(contact.phone,100))) fail(400,'contact-required');
  const r={id,code:'OO-'+id.slice(1).toUpperCase(),kind:input.kind==='charter'?'charter':'hotel',
    hotelId:str(input.hotelId,100)||null,roomId:str(input.roomId,100),from:str(input.from,10),to:str(input.to,10),
    adults:num(input.adults??1,1,1000),children:num(input.children??0,0,100),childAges:list(input.childAges).map(v=>num(v,0,17)),
    wishes:list(input.wishes).map(v=>str(v,100)),excursions:list(input.excursions).map(v=>str(v,100)),note:str(input.note),route:str(input.route),
    contact:Object.fromEntries(['first','last','phone','email','wa'].map(k=>[k,str(contact[k],200)])),
    status:'new',createdAt:Date.now(),offer:null,payment:null,folio:null,staffNote:'',messages:[],history:[{s:'new',at:Date.now()}]};
  if(r.kind==='charter'&&!input.item)fail(400,'item-required');
  if(input.item)r.item=Object.fromEntries(['t','id','name','img'].map(k=>[k,str(input.item[k],500)]));
  if(r.item?.img&&(!/^(https:\/\/|\.?\/?images\/)/.test(r.item.img)||/[\s<>"'`]/.test(r.item.img)))r.item.img='';
  for(const d of [r.from,r.to]) if(d&&(!/^\d{4}-\d{2}-\d{2}$/.test(d)||!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d)) fail(400,'invalid-date');
  if(r.from&&r.to&&r.to<r.from)fail(400,'invalid-period');
  return r;
}
export function totals(r) {
  let paid=0;for(const p of r.folio?.payments||[])if(p.status==='paid')paid+=(p.type==='refund'?-1:1)*Math.round(p.amount*p.exchangeRate*100);
  return {paid,due:Math.max(0,Math.round((r.offer?.price||0)*100)-paid)};
}
export function publicRequest(row,role) {
  const r=typeof row.data==='string'?JSON.parse(row.data):structuredClone(row.data);
  if(role!=='staff'){
    delete r.staffNote;if(r.offer)delete r.offer.internalNote;
    if(r.folio)r.folio.payments=r.folio.payments.map(p=>Object.fromEntries(['id','type','method','amount','currency','exchangeRate','baseAmount','status','createdAt','paidAt'].filter(k=>p[k]!==undefined).map(k=>[k,p[k]])));
    if(!r.offer){r.payment=null;r.folio=null;}
  }
  return {...r,_version:row.version};
}
export function updateRequest(old,input,role,name) {
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'invalid-request');
  const r=structuredClone(old),staff=role==='staff';
  if(staff){
    r.staffNote=str(input.staffNote);
    if(input.offer && JSON.stringify(input.offer)!==JSON.stringify(old.offer)){
      if((old.folio?.payments||[]).length)fail(409,'offer-locked-after-payment-request');
      const o=input.offer;
      r.offer={price:money(o.price),currency:currency(o.currency),roomId:str(o.roomId,100),validUntil:str(o.validUntil,10),custInfo:str(o.custInfo),internalNote:str(o.internalNote),createdAt:Date.now()};
      r.folio={total:r.offer.price,currency:r.offer.currency,payments:[],closed:false};
    }
    const previous=old.folio?.payments||[], incoming=input.folio?.payments||[];
    if(previous.length>incoming.length)fail(409,'ledger-append-only');
    if(incoming.length>previous.length+1)fail(400,'one-payment-at-a-time');
    for(let i=0;i<previous.length;i++){
      const a=previous[i],b=incoming[i];
      if(JSON.stringify(a)===JSON.stringify(b))continue;
      const expected={...a,status:'paid',paidAt:b?.paidAt};
      if(a.status!=='pending'||JSON.stringify(expected)!==JSON.stringify(b))fail(409,'ledger-immutable');
      r.folio.payments[i]={...a,status:'paid',paidAt:Date.now(),staff:name};
    }
    if(incoming.length>previous.length){
      if(!r.offer)fail(409,'offer-required');const p=incoming.at(-1);
      if(!/^[A-Za-z0-9_-]{3,100}$/.test(p.id)||previous.some(x=>x.id===p.id))fail(400,'invalid-payment-id');
      if(!['deposit','balance','refund'].includes(p.type)||!['pending','paid'].includes(p.status))fail(400,'invalid-payment');
      const amount=money(p.amount),cur=currency(p.currency),rate=cur===r.offer.currency?1:num(p.exchangeRate,0.000001,1000000);
      const base=Math.round(amount*rate*100),t=totals(r);
      if(base>(p.type==='refund'?t.paid:t.due))fail(409,'amount-exceeds-balance');
      if(p.type==='refund'&&p.status==='pending')fail(400,'manual-refund-only');
      r.folio.payments.push({id:p.id,type:p.type,method:str(p.method,40),amount,currency:cur,exchangeRate:rate,baseAmount:base/100,baseCurrency:r.offer.currency,reference:str(p.reference,200),notes:str(p.notes),status:p.status,createdAt:Date.now(),...(p.status==='paid'?{paidAt:Date.now()}:{}),staff:name});
    }
    if(input.payment && r.offer){
      const p=input.payment, link=str(p.link,2000);
      if(link){let u;try{u=new URL(link);}catch{fail(400,'invalid-payment-link');}if(u.protocol!=='https:')fail(400,'invalid-payment-link');}
      const pending=r.folio?.payments.find(x=>x.id===p.requestId)||(!p.requestId&&p.status==='paid'?r.folio?.payments.filter(x=>x.status==='paid').at(-1):null);
      r.payment={link,status:pending?.status==='paid'?'paid':'open',...(pending?{requestId:pending.id,amount:pending.amount,currency:pending.currency,provider:pending.method,requestType:pending.type}:{}),...(pending?.paidAt?{paidAt:pending.paidAt}:{})};
    }
  } else {
    // Guest writes are explicitly limited to acceptance and their own messages.
    const visible=publicRequest({data:old,version:input._version},'guest');
    for(const k of ['offer','payment','staffNote','contact','item']) if(JSON.stringify(input[k])!==JSON.stringify(visible[k]))fail(403,'staff-field');
    // ensureFolio adds harmless derived totals while rendering; compare the ledger itself.
    if(JSON.stringify(input.folio?.payments||[])!==JSON.stringify(visible.folio?.payments||[]))fail(403,'staff-field');
  }
  const oldMessages=old.messages||[],messages=input.messages||[];
  if(!Array.isArray(messages)||messages.length<oldMessages.length||messages.length>oldMessages.length+1)fail(400,'invalid-messages');
  r.messages=oldMessages.map((m,i)=>{const b=messages[i];if(!b||b.text!==m.text||b.from!==m.from||b.at!==m.at)fail(409,'message-immutable');return {...m,read:m.read||(m.from!== (staff?'staff':'guest')&&b.read===true)};});
  if(messages.length>oldMessages.length){const m=messages.at(-1),text=str(m.text);if(!text.trim())fail(400,'empty-message');r.messages.push({from:staff?'staff':'guest',text,at:Date.now(),read:false});}
  if(r.offer&&(totals(r).paid<0||totals(r).paid>Math.round(r.offer.price*100)))fail(409,'invalid-ledger-balance');
  let next=input.status||old.status;
  if(!states.includes(next))fail(400,'invalid-status');
  if(!staff && next!==old.status){
    if(old.status!=='offer'||!['accepted','payopen'].includes(next)||!old.offer)fail(403,'invalid-transition');
    if(old.offer.validUntil&&old.offer.validUntil<new Date().toISOString().slice(0,10))fail(409,'offer-expired');
    next='accepted';
  }
  const transitions={new:['review','offer'],review:['offer'],offer:['accepted','payopen','paid'],accepted:['offer','payopen','paid','confirmed'],payopen:['offer','paid','confirmed'],paid:['payopen','confirmed'],confirmed:[]};
  if(staff&&next!==old.status&&!transitions[old.status]?.includes(next))fail(409,'invalid-transition');
  if(['offer','accepted','payopen','paid','confirmed'].includes(next)&&!r.offer)fail(409,'offer-required');
  if(next==='paid'&&totals(r).due>0)fail(409,'unpaid-balance');
  if(r.offer&&totals(r).due===0&&next!=='confirmed')next='paid';
  if(next!==old.status)r.history.push({s:next,at:Date.now()});r.status=next;
  return r;
}
