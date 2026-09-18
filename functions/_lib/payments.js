import { fail, owned, token } from './security.js';
import { totals } from './model.js';
export async function preparePayment(request,env,input) {
  const {row,data:r}=await owned(request,env,String(input.oid||''));
  if(!r.offer||!['accepted','payopen'].includes(r.status))fail(409,'accepted-offer-required');
  const due=totals(r).due;if(due<=0)fail(409,'nothing-due');
  const pending=r.folio?.payments.find(p=>p.id===r.payment?.requestId&&p.status==='pending'&&p.type!=='refund');
  const amount=pending?Math.round(pending.amount*100):due,currency=pending?.currency||r.offer.currency;
  const base=pending?Math.round(pending.amount*pending.exchangeRate*100):due;
  if(base>due)fail(409,'amount-exceeds-balance');
  const existing=await env.DB.prepare('SELECT * FROM payment_attempts WHERE request_id=? AND status=\'pending\'').bind(row.id).first();
  if(existing)fail(409,'payment-already-in-progress');
  const attempt={id:'p'+token().slice(0,32),request_id:row.id,provider:'ziraat',amount_minor:amount,currency,base_minor:base,ledger_id:pending?.id||null};
  try {
    const result=await env.DB.prepare('INSERT INTO payment_attempts(id,request_id,provider,amount_minor,currency,base_minor,ledger_id,created_at,expires_at) SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM requests WHERE id=? AND version=?)').bind(attempt.id,row.id,attempt.provider,amount,currency,base,attempt.ledger_id,Date.now(),Date.now()+1800000,row.id,row.version).run();
    if(!result.meta.changes)fail(409,'version-conflict');
  } catch(e) { if(e.status)throw e;fail(409,'payment-already-in-progress'); }
  return attempt;
}
export async function settlePayment(env,attempt,approved,actor='bank:ziraat') {
  if(attempt.status==='paid')return approved;
  if(attempt.status!=='pending')return false;
  if(!approved){await env.DB.prepare('UPDATE payment_attempts SET status=\'failed\' WHERE id=? AND status=\'pending\'').bind(attempt.id).run();return false;}
  for(let retry=0;retry<4;retry++){
    const row=await env.DB.prepare('SELECT * FROM requests WHERE id=?').bind(attempt.request_id).first();
    const r=JSON.parse(row.data);
    if((r.folio?.payments||[]).some(p=>p.bankAttempt===attempt.id)){
      await env.DB.prepare('UPDATE payment_attempts SET status=\'paid\' WHERE id=?').bind(attempt.id).run();return true;
    }
    const now=Date.now();r.folio=r.folio||{total:r.offer.price,currency:r.offer.currency,payments:[],closed:false};
    let p=r.folio.payments.find(p=>p.id===attempt.ledger_id&&p.status==='pending');
    if(!p){p={id:attempt.id,type:'balance',method:attempt.provider,amount:attempt.amount_minor/100,currency:attempt.currency,exchangeRate:attempt.base_minor/attempt.amount_minor,baseAmount:attempt.base_minor/100,createdAt:now,staff:'bank'};r.folio.payments.push(p);}
    Object.assign(p,{status:'paid',paidAt:now,bankAttempt:attempt.id});
    r.payment={...(r.payment||{}),status:'paid',amount:p.amount,currency:p.currency,provider:attempt.provider,requestId:p.id,paidAt:now};
    const next=totals(r).due===0?'paid':'payopen';if(r.status!=='confirmed'&&r.status!==next){r.status=next;r.history.push({s:next,at:now});}
    const result=await env.DB.prepare('UPDATE requests SET data=?,version=version+1,updated_at=?,actor=? WHERE id=? AND version=? AND EXISTS(SELECT 1 FROM payment_attempts WHERE id=? AND status=\'pending\')').bind(JSON.stringify(r),now,actor,row.id,row.version,attempt.id).run();
    if(result.meta.changes){await env.DB.prepare('UPDATE payment_attempts SET status=\'paid\' WHERE id=?').bind(attempt.id).run();return true;}
  }
  fail(409,'callback-conflict-retry');
}
