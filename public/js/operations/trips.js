import {api,esc,money,when,day,status,field,h} from './api.js';
import {t,label} from './i18n.js';
export async function tripView(id,permissions){
 const {request:r}=await api('requests/'+id),{versions}=await api('requests/'+id+'/quote-versions'),{booking}=await api('requests/'+id+'/booking');
 const sales=permissions.includes('sales'),finance=permissions.includes('finance');
 const paid=(r.folio?.payments||[]).filter(p=>p.status==='paid').reduce((n,p)=>n+(p.type==='refund'?-1:1)*p.baseAmount,0),due=Math.max(0,(r.offer?.price||0)-paid);
 return {r,html:`<div class="row"><h1>${esc(r.code)}</h1><span class="badge">${esc(status[r.status])}</span></div>
 <p>${esc(r.contact.first)} ${esc(r.contact.last)} · ${esc(r.contact.phone)} · ${esc(day(r.from))} – ${esc(day(r.to))}</p>
 <div class="actions"><button data-back>${h('allTrips')}</button>${sales?`<button data-claim>${h('claim')}</button>`:''}<button data-share>${h('createPortalLink')}</button></div>
 <p class="muted">${h('assignee')}: ${esc(r.assignedTo||t('unassigned'))}</p>
 <div class="split"><div><article class="card"><h2>${h('tripQuote')}</h2><p>${esc(r.item?.name==='vip-callback'?t('callback'):r.item?.name||r.hotelId||t('customTrip'))}</p><p>${esc(r.note)}</p>
 ${r.offer?`<h2>${money(r.offer.price,r.offer.currency)}</h2><p>${esc(r.offer.custInfo)}</p><p>${h('validUntil')} ${esc(r.offer.validUntil?day(r.offer.validUntil):t('noExpiry'))}</p>`:`<p>${h('prepareQuote')}</p>`}
 ${sales&&['new','review','offer'].includes(r.status)?`<form id="quote">
 ${field(h('price'),'price','number',r.offer?.price||'','required min="0.01" step="0.01"')}
 <label>${h('currency')}<select name="currency" aria-label="${h('currency')}">${['EUR','TRY','USD','GBP'].map(c=>`<option ${r.offer?.currency===c?'selected':''}>${c}</option>`).join('')}</select></label>
 ${field(h('validUntil'),'validUntil','date',r.offer?.validUntil||'','required')}
 <label>${h('customerDescription')}<textarea name="custInfo" required>${esc(r.offer?.custInfo)}</textarea></label>
 <label>${h('internalNote')}<textarea name="internalNote">${esc(r.offer?.internalNote)}</textarea></label><button>${h('publishQuote')}</button></form>`:''}
 <details><summary>${h('quoteVersions',{count:versions.length})}</summary>${versions.map(v=>`<p>V${v.version} · ${money(v.data.price,v.data.currency)} · ${when(v.created_at)}<br>${esc(v.data.custInfo)}</p>`).join('')}</details></article>
 ${booking?`<article class="card"><h2>${h('bookingConfirmed')}</h2><p>${esc(booking.id)}</p><p>${h('bookingAvailable')}</p></article>`:''}</div>
 <div><article class="card"><h2>${h('paymentLedger')}</h2>${r.offer?`<p>${h('paid')}: ${money(paid,r.offer.currency)}<br>${h('outstanding')}: <strong>${money(due,r.offer.currency)}</strong></p>`:`<p>${h('noQuote')}</p>`}
 ${(r.folio?.payments||[]).map(p=>`<p>${money(p.amount,p.currency)} · ${esc(label('method',p.method))} · ${esc(label('payment',p.status))}<br><small>${esc(p.reference)}</small>${finance&&p.status==='pending'?`<br><button data-paid="${esc(p.id)}">${h('recordPayment')}</button>`:''}</p>`).join('')}
 ${finance&&['accepted','payopen'].includes(r.status)&&due>0&&!r.folio?.payments.some(p=>p.status==='pending')?`<form id="payment">
 ${field(h('amount'),'amount','number',due.toFixed(2),'required min="0.01" step="0.01"')}
 <label>${h('paymentMethod')}<select name="method" aria-label="${h('paymentMethod')}">${['bank-transfer','partner','cash'].map(m=>`<option value="${m}">${esc(label('method',m))}</option>`).join('')}</select></label>
 ${field(h('paymentInstructions'),'notes','text','','required')}${field(h('paymentReference'),'reference','text','','required')}${field(h('paymentLink'),'link','url')}${field(h('paymentDue'),'due','date','','required')}
 <button>${h('requestPayment')}</button></form>`:''}
 ${sales&&r.status==='paid'?`<button data-confirm class="primary">${h('confirmTrip')}</button>`:''}</article>
 <article class="card"><h2>${h('history')}</h2>${r.history.map(item=>`<p>${esc(status[item.s]||item.s)} <small class="muted">${when(item.at)}</small></p>`).join('')}</article></div></div>`};
}
export async function saveTrip(r){return api('requests/'+r.id,'PUT',{request:r,version:r._version});}
