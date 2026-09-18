import {json} from '../api/pay/util.js';
import {fail,bodyJSON} from './security.js';
const fields=(b,names)=>Object.fromEntries(names.map(k=>{
  if(b[k]!==undefined&&typeof b[k]!=='string')fail(400,'invalid-'+k);
  const v=(b[k]||'').trim();if(v.length>(k==='notes'||k==='description'?2000:200))fail(400,'field-too-long');
  return [k,v];
}));
const pack=r=>({...JSON.parse(r.data),id:r.id,_version:r.version});
export async function catalog({request,env,s,path,url}){
  if(s.role!=='staff')fail(403,'staff-required');
  const table=path[0],id=path[1],method=request.method;
  if(path.length>2)fail(404,'not-found');
  if(method==='GET'){
    if(id){const row=await env.DB.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();if(!row)fail(404,'not-found');return json({record:pack(row)});}
    const rows=(await env.DB.prepare(`SELECT * FROM ${table} WHERE id>? ORDER BY id LIMIT 100`).bind(url.searchParams.get('cursor')||'').all()).results;
    return json({records:rows.map(pack),cursor:rows.length===100?rows.at(-1).id:null});
  }
  if(!((method==='POST'&&!id)||(method==='PUT'&&id)))fail(405,'method-not-allowed');
  const b=await bodyJSON(request),input=b.record;
  if(!input||typeof input!=='object'||Array.isArray(input))fail(400,'record-required');
  if(typeof input.active!=='boolean')fail(400,'active-required');
  let data;
  if(table==='partners'){
    data=fields(input,['name','contact','email','phone','notes']);
    if(data.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))fail(400,'invalid-email');
  }else{
    data=fields(input,['name','partnerId','category','description','unit','currency','notes']);
    if(!['hotel','villa','yacht','transfer','excursion','other'].includes(data.category))fail(400,'invalid-category');
    if(!['EUR','TRY','USD','GBP'].includes(data.currency))fail(400,'invalid-currency');
    if(!data.unit)fail(400,'unit-required');
    if(!Number.isSafeInteger(input.costMinor)||input.costMinor<0||input.costMinor>999999900)fail(400,'invalid-cost');
    data.costMinor=input.costMinor;
    const partner=await env.DB.prepare('SELECT data FROM partners WHERE id=?').bind(data.partnerId).first();
    if(!partner)fail(400,'partner-required');
    if(input.active&&!JSON.parse(partner.data).active)fail(409,'partner-inactive');
  }
  if(!data.name)fail(400,'name-required');data.active=input.active;
  const actor='staff:'+s.name,now=Date.now();
  if(method==='POST'){
    const newId=crypto.randomUUID();
    const columns=table==='services'?'id,partner_id,data,version,updated_at,actor':'id,data,version,updated_at,actor';
    const values=table==='services'?[newId,data.partnerId,JSON.stringify(data),1,now,actor]:[newId,JSON.stringify(data),1,now,actor];
    await env.DB.prepare(`INSERT INTO ${table} (${columns}) VALUES (${values.map(()=>'?').join(',')})`).bind(...values).run();
    return json({record:{...data,id:newId,_version:1}},201);
  }
  if(!Number.isSafeInteger(b.version)||b.version<1)fail(400,'version-required');
  const values=table==='services'?[data.partnerId,JSON.stringify(data),now,actor,id,b.version]:[JSON.stringify(data),now,actor,id,b.version];
  const result=await env.DB.prepare(`UPDATE ${table} SET ${table==='services'?'partner_id=?,':''}data=?,updated_at=?,actor=?,version=version+1 WHERE id=? AND version=?`).bind(...values).run();
  if(!result.meta.changes)fail(409,'version-conflict');
  return json({record:{...data,id,_version:b.version+1}});
}

// A published offer snapshots the supplier terms; later catalog edits must not
// silently change an existing customer offer. No external booking is implied.
export async function serviceOffer(env,s,input){
  if(s.role!=='staff')fail(403,'staff-required');
  const row=await env.DB.prepare('SELECT services.*,partners.data AS partner_data FROM services JOIN partners ON partners.id=services.partner_id WHERE services.id=?').bind(input.sourceServiceId).first();
  if(!row)fail(404,'service-not-found');
  const service=pack(row),partner=JSON.parse(row.partner_data);
  if(!service.active||!partner.active)fail(409,'service-or-partner-inactive');
  if(input.serviceVersion!==service._version)fail(409,'service-version-conflict');
  const until=input.offer?.validUntil;
  if(typeof until!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(until)||!Number.isFinite(Date.parse(until))||new Date(until).toISOString().slice(0,10)!==until||until<new Date().toISOString().slice(0,10))fail(400,'invalid-offer-expiry');
  const q=input.quantity;
  if(!Number.isSafeInteger(q)||q<1||q>10000)fail(400,'invalid-quantity');
  return {...input,kind:'charter',item:{t:'service',id:service.id,name:service.name},
    sourcing:{partnerId:service.partnerId,partner:partner.name,serviceId:service.id,serviceVersion:service._version,costMinor:service.costMinor,quantity:q,unit:service.unit,currency:service.currency},
    offer:{...input.offer,currency:service.currency}};
}
