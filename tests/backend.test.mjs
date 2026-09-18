import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { onRequest as api } from '../functions/api/v1/[[path]].js';
import { onRequestPost as start } from '../functions/api/pay/start.js';
import { onRequest as callback } from '../functions/api/pay/return/[provider].js';
import { nestpayHashVer3 } from '../functions/api/pay/util.js';

// Execute the actual migration and SQL against SQLite, adapting only D1's
// async result shape. Transactional batch behavior is preserved.
function database(){
  const db=new DatabaseSync(':memory:');for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
  const wrap=(sql,args=[])=>({bind:(...values)=>wrap(sql,values),
    first:async()=>db.prepare(sql).get(...args)||null,
    all:async()=>({results:db.prepare(sql).all(...args)}),
    run:async()=>({meta:{changes:Number(db.prepare(sql).run(...args).changes)}})});
  return {prepare:sql=>wrap(sql),batch:async statements=>{db.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());db.exec('COMMIT');return result;}catch(e){db.exec('ROLLBACK');throw e;}},raw:db};
}
function fixture(){
  const env={DB:database(),STAFF_LOGIN_KEY:'test-staff-key-'.repeat(4),ZIRAAT_CLIENT_ID:'merchant-test',ZIRAAT_STORE_KEY:'bank-test-key',SITE_URL:'https://travel.test'};
  const call=async(path,method='GET',body,cookie='',origin='https://travel.test')=>{
    const request=new Request('https://travel.test/api/v1/'+path,{method,headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const response=await api({request,env});return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]};
  };
  const login=async(staff=false)=>(await call('session','POST',staff?{name:'Maria',staffKey:env.STAFF_LOGIN_KEY}:{})).cookie;
  const input={id:'r1234567890abcdef',contact:{first:'Ada',phone:'+49 123'},from:'2026-10-01',to:'2026-10-08',adults:2};
  const create=async cookie=>(await call('requests','POST',{request:input},cookie)).data.request;
  const put=async(r,cookie)=>call('requests/'+r.id,'PUT',{request:r,version:r._version},cookie);
  const get=async(id,cookie)=>(await call('requests/'+id,'GET',null,cookie)).data.request;
  const bankStart=async(r,cookie,extra={})=>{const response=await start({env,request:new Request('https://travel.test/api/pay/start',{method:'POST',headers:{Origin:'https://travel.test',Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify({oid:r.id,provider:'ziraat',...extra})})});return {status:response.status,data:await response.json()};};
  const bankReturn=async(fields,overrides={},signed=true)=>{
    const data={clientid:fields.clientid,oid:fields.oid,amount:fields.amount,currency:fields.currency,Response:'Approved',ProcReturnCode:'00',mdStatus:'1',...overrides};
    data.HASH=signed?await nestpayHashVer3(data,env.ZIRAAT_STORE_KEY):'forged';
    return callback({env,params:{provider:'ziraat'},request:new Request('https://travel.test/api/pay/return/ziraat',{method:'POST',body:new URLSearchParams(data)})});
  };
  return {env,call,login,input,create,put,get,bankStart,bankReturn};
}
async function offered(f,guest,staff,price=1000){let r=await f.create(guest);r=await f.get(r.id,staff);r.offer={price,currency:'EUR',internalNote:'PRIVATE',custInfo:'Your trip'};r.status='offer';const response=await f.put(r,staff);assert.equal(response.status,200,JSON.stringify(response.data));return response.data.request;}

async function catalogFixture(){
 const f=fixture(),staff=await f.login(true),guest=await f.login();
 const partner=(await f.call('partners','POST',{record:{name:'Own supplier',email:'partner@example.test',notes:'PRIVATE CONTRACT',active:true}},staff)).data.record;
 const service=(await f.call('services','POST',{record:{name:'Private transfer',partnerId:partner.id,category:'transfer',unit:'vehicle',costMinor:8500,currency:'EUR',active:true}},staff)).data.record;
 return {...f,staff,guest,partner,service};
}
test('catalog is staff-only, versioned, audited and shared between staff sessions',async()=>{
 const f=await catalogFixture(),other=await f.login(true);
 for(const path of ['partners','services','partners/'+f.partner.id,'services/'+f.service.id]){
   assert.equal((await f.call(path,'GET',null,f.guest)).status,403);
   assert.equal((await f.call(path)).status,401);
 }
 assert.equal((await f.call('services','GET',null,other)).data.records[0].name,f.service.name);
 assert.equal((await f.call('partners','POST',{record:f.partner},f.guest)).status,403);
 assert.equal((await f.call('services/'+f.service.id,'PUT',{record:f.service,version:1},f.guest)).status,403);
 const edit={record:{...f.service,costMinor:9500},version:1};
 assert.equal((await f.call('services/'+f.service.id,'PUT',edit,other)).status,200);
 assert.equal((await f.call('services/'+f.service.id,'PUT',edit,f.staff)).status,409);
 assert.equal((await f.call('services/'+f.service.id,'GET',null,f.staff)).data.record.costMinor,9500);
 const events=f.env.DB.raw.prepare("SELECT * FROM catalog_events WHERE kind='service' ORDER BY version").all();
 assert.equal(events.length,2);assert.equal(JSON.parse(events[0].data).costMinor,8500);assert.match(events[1].actor,/Maria/);
 assert.equal((await f.call('services','POST',{record:{...f.service,costMinor:-1}},f.staff)).status,400);
 assert.equal((await f.call('services','POST',{record:{...f.service,partnerId:'missing'}},f.staff)).status,400);
});
test('own-service offers snapshot supplier costs and never disclose them to the customer',async()=>{
 const f=await catalogFixture();
 const input={...f.input,sourceServiceId:f.service.id,serviceVersion:1,quantity:2,offer:{price:250,currency:'USD',validUntil:'2099-12-31',custInfo:'Return transfer'}};
 assert.equal((await f.call('requests','POST',{request:input},f.guest)).status,403);
 const created=await f.call('requests','POST',{request:input},f.staff);assert.equal(created.status,201,JSON.stringify(created.data));
 const r=created.data.request;assert.equal(r.status,'offer');assert.equal(r.payment,null);assert.equal(r.offer.currency,'EUR');assert.equal(r.sourcing.costMinor,8500);assert.equal(r.sourcing.quantity,2);
 assert.equal((await f.call('requests','POST',{request:input},f.staff)).data.request.id,r.id);
 const link=(await f.call('requests/'+r.id+'/access-link','POST',{},f.staff)).data.url;
 await f.call('access','POST',{token:new URLSearchParams(new URL(link).hash.slice(1)).get('access')},f.guest);
 const visible=await f.get(r.id,f.guest);assert.equal(visible.sourcing,undefined);assert.equal(visible.offer.price,250);assert.equal(visible.offer.internalNote,undefined);
 visible.status='accepted';assert.equal((await f.put(visible,f.guest)).status,200);
 await f.call('services/'+f.service.id,'PUT',{record:{...f.service,costMinor:9900},version:1},f.staff);
 assert.equal((await f.get(r.id,f.staff)).sourcing.costMinor,8500);
 assert.equal((await f.call('requests','POST',{request:{...input,id:'rstaleversion0001'}},f.staff)).status,409);
});
test('archived partners block new catalog offers and active services',async()=>{
 const f=await catalogFixture();await f.call('partners/'+f.partner.id,'PUT',{record:{...f.partner,active:false},version:1},f.staff);
 const input={...f.input,sourceServiceId:f.service.id,serviceVersion:1,quantity:1,offer:{price:100,validUntil:'2099-12-31'}};
 assert.equal((await f.call('requests','POST',{request:input},f.staff)).status,409);
 assert.equal((await f.call('services','POST',{record:f.service},f.staff)).status,409);
 assert.equal((await f.call('services/'+f.service.id,'PUT',{record:{...f.service,active:false},version:1},f.staff)).status,200);
});

test('separate devices share requests, offers, messages, acceptance, payments and confirmation',async()=>{
  const f=fixture(),guest=await f.login(),staff=await f.login(true),other=await f.login();
  const offer=await offered(f,guest,staff);
  assert.equal((await f.call('requests','GET',null,staff)).data.requests.length,1);
  assert.equal((await f.call('requests','GET',null,other)).data.requests.length,0);
  assert.equal((await f.call('requests/'+offer.id,'GET',null,other)).status,404);
  let r=await f.get(offer.id,guest);assert.equal(r.offer.internalNote,undefined);assert.equal(r.staffNote,undefined);
  r.status='accepted';r.messages.push({from:'guest',text:'Thank you',at:1,read:false});assert.equal((await f.put(r,guest)).status,200);
  r=await f.get(r.id,staff);assert.equal(r.status,'accepted');assert.equal(r.messages[0].from,'guest');
  const started=await f.bankStart(r,guest,{amount:0.01,currency:'TRY'});assert.equal(started.status,200);assert.equal(started.data.fields.amount,'1000.00');assert.equal(started.data.fields.currency,'978');
  assert.equal((await f.bankStart(r,guest)).status,409);
  const paid=await f.bankReturn(started.data.fields);assert.equal(paid.status,302);
  await f.bankReturn(started.data.fields);
  r=await f.get(r.id,staff);assert.equal(r.status,'paid');assert.equal(r.folio.payments.length,1);
  r.status='confirmed';assert.equal((await f.put(r,staff)).status,200);
  assert.equal((await f.get(r.id,guest)).status,'confirmed');
  const events=(await f.call('requests/'+r.id+'/events','GET',null,staff)).data.events;
  assert.ok(events.some(x=>x.actor==='bank:ziraat'));assert.ok(events.some(x=>x.actor==='staff:Maria'));
});
test('ID guessing, forged roles, CSRF, invalid credentials and rate limiting fail closed',async()=>{
 const f=fixture();assert.equal((await f.call('requests')).status,401);
 assert.equal((await f.call('session','POST',{},'','https://evil.test')).status,403);
 for(let i=0;i<10;i++)assert.equal((await f.call('session','POST',{staffKey:'wrong'})).status,401);
 assert.equal((await f.call('session','POST',{staffKey:f.env.STAFF_LOGIN_KEY})).status,429);
 const guest=await f.login();let r=await f.create(guest);r.offer={price:1,currency:'EUR'};r.status='paid';assert.equal((await f.put(r,guest)).status,403);
});
test('optimistic concurrency rejects a stale edit without overwriting the latest version',async()=>{
 const f=fixture(),guest=await f.login(),staff=await f.login(true);let r=await f.create(guest);r=await f.get(r.id,staff);
 const old=structuredClone(r);r.staffNote='first edit';assert.equal((await f.put(r,staff)).status,200);old.staffNote='stale edit';assert.equal((await f.put(old,staff)).status,409);assert.equal((await f.get(r.id,staff)).staffNote,'first edit');
});
test('legacy import keeps an immutable review source but never trusts historical paid flags',async()=>{
 const f=fixture(),guest=await f.login(),staff=await f.login(true);
 const old={...f.input,status:'paid',offer:{price:100,currency:'EUR'},payment:{status:'paid'},staffNote:'old private note'};
 const imported=await f.call('requests','POST',{request:old,legacy:true},guest);assert.equal(imported.status,201);assert.equal(imported.data.request.status,'new');assert.equal(imported.data.request.offer,null);
 assert.equal((await f.call('requests','POST',{request:old,legacy:true},guest)).data.request.id,old.id);
 assert.equal((await f.call('requests/'+old.id+'/legacy','GET',null,guest)).status,403);
 assert.equal((await f.call('requests/'+old.id+'/legacy','GET',null,staff)).data.legacy.data.status,'paid');
});
test('private access links grant only one request, and expiry is enforced',async()=>{
 const f=fixture(),guest=await f.login(),other=await f.login();const r=await f.create(guest);
 const result=await f.call('requests/'+r.id+'/access-link','POST',{},guest);const token=new URL(result.data.url).hash.slice(8);
 assert.equal((await f.call('access','POST',{token},other)).status,200);assert.equal((await f.get(r.id,other)).id,r.id);
 f.env.DB.raw.exec('UPDATE access_links SET expires_at=0');assert.equal((await f.call('access','POST',{token},other)).status,404);
});
test('forged and amount-mismatched bank callbacks do not credit the ledger',async()=>{
 const f=fixture(),guest=await f.login(),staff=await f.login(true);const offeredRequest=await offered(f,guest,staff);let r=await f.get(offeredRequest.id,guest);r.status='accepted';await f.put(r,guest);
 const started=await f.bankStart(r,guest);assert.equal((await f.bankReturn(started.data.fields,{},false)).status,400);assert.equal((await f.bankReturn(started.data.fields,{amount:'0.01'})).status,400);
 assert.equal((await f.get(r.id,staff)).folio.payments.length,0);
 const response=await callback({env:f.env,params:{provider:'vakif'},request:new Request('https://travel.test/api/pay/return/vakif?Rc=0000')});assert.equal(response.status,405);
});
test('server validates refunds, mixed currencies, immutable ledger and pending charge locks',async()=>{
 const f=fixture(),guest=await f.login(),staff=await f.login(true);let r=await offered(f,guest,staff);r.status='payopen';
 r.folio.payments.push({id:'deposit123',type:'deposit',method:'ziraat',amount:200,currency:'USD',exchangeRate:0.9,status:'pending'});r.payment={requestId:'deposit123'};
 let result=await f.put(r,staff);assert.equal(result.status,200);r=result.data.request;
 const started=await f.bankStart(r,guest);assert.equal(started.data.fields.amount,'200.00');assert.equal(started.data.fields.currency,'840');
 r.folio.payments.push({id:'cash123',type:'balance',method:'cash',amount:820,currency:'EUR',status:'paid'});assert.equal((await f.put(r,staff)).status,409);
 await f.bankReturn(started.data.fields);r=await f.get(r.id,staff);assert.equal(r.folio.payments.length,1);assert.equal(r.folio.payments[0].baseAmount,180);assert.equal(r.status,'payopen');
 r.folio.payments.push({id:'refund123',type:'refund',method:'cash',amount:181,currency:'EUR',status:'paid'});assert.equal((await f.put(r,staff)).status,409);
 r=await f.get(r.id,staff);r.folio.payments[0].amount=1;assert.equal((await f.put(r,staff)).status,409);
});
test('staff logout preserves guest access, rotation revokes staff sessions',async()=>{
 const f=fixture(),guest=await f.login(),staff=await f.login(true),cookies=guest+'; '+staff;const r=await f.create(guest);
 assert.equal((await f.call('session','GET',null,cookies)).data.role,'staff');
 await f.call('session','DELETE',null,cookies);assert.equal((await f.call('session','GET',null,guest)).data.role,'guest');
 const newer=await f.login(true);f.env.STAFF_LOGIN_KEY='rotated'.repeat(8);assert.equal((await f.call('session','GET',null,newer)).status,401);assert.equal((await f.get(r.id,guest)).id,r.id);
});

test('staff bank reconciliation is authenticated, audited and idempotent',async()=>{
 const f=fixture(),guest=await f.login(),staff=await f.login(true);const offer=await offered(f,guest,staff);let r=await f.get(offer.id,guest);r.status='accepted';await f.put(r,guest);
 const started=await f.bankStart(r,guest),attemptId=started.data.fields.oid;
 assert.equal((await f.call('requests/'+r.id+'/payment-attempts','POST',{attemptId,outcome:'paid',reference:'bank-001'},guest)).status,403);
 assert.equal((await f.call('requests/'+r.id+'/payment-attempts','POST',{attemptId,outcome:'paid',reference:'bank-001'},staff)).status,200);
 assert.equal((await f.call('requests/'+r.id+'/payment-attempts','POST',{attemptId,outcome:'paid',reference:'bank-001'},staff)).status,409);
 await f.bankReturn(started.data.fields);r=await f.get(r.id,staff);assert.equal(r.folio.payments.length,1);assert.equal(r.status,'paid');
 const events=(await f.call('requests/'+r.id+'/events','GET',null,staff)).data.events;assert.ok(events.some(e=>e.actor.includes('bank-reconciliation:bank-001')));
});
test('server strips injected image markup and rejects invalid status regressions',async()=>{
 const f=fixture(),guest=await f.login(),staff=await f.login(true);
 let result=await f.call('requests','POST',{request:{...f.input,kind:'charter',item:{t:'service',name:'Untrusted',img:'x" onerror="alert(1)'}}},guest);assert.equal(result.data.request.item.img,'');
 let r=await f.get(f.input.id,staff);r.status='review';await f.put(r,staff);r=await f.get(r.id,staff);r.status='new';assert.equal((await f.put(r,staff)).status,409);
});

test('exchange rates target the offer currency rather than a hardcoded EUR base',async()=>{
 const f=fixture(),guest=await f.login(),staff=await f.login(true);let r=await f.create(guest);r=await f.get(r.id,staff);r.offer={price:1000,currency:'TRY'};r.status='offer';r=(await f.put(r,staff)).data.request;
 r.folio.payments.push({id:'foreign123',type:'deposit',method:'cash',amount:10,currency:'USD',exchangeRate:30,baseCurrency:'EUR',status:'paid'});
 assert.equal((await f.put(r,staff)).status,400);r.folio.payments[0].baseCurrency='TRY';const result=await f.put(r,staff);assert.equal(result.status,200);assert.equal(result.data.request.folio.payments[0].baseAmount,300);
});
