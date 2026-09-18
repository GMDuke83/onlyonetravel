import { json } from '../pay/util.js';
import { safely, fail, sameOrigin, bodyJSON, session, createSession, digest, token, rateLimit, owned } from '../../_lib/security.js';
import { settlePayment } from '../../_lib/payments.js';
import { createRequest, updateRequest, publicRequest } from '../../_lib/model.js';
import { catalog, serviceOffer } from '../../_lib/catalog.js';
export async function onRequest({request,env}) { return safely(async()=>{
  if(!env.DB)fail(503,'database-not-configured');
  const url=new URL(request.url),path=url.pathname.replace(/^\/api\/v1\/?/,'').split('/'),method=request.method;
  if(method!=='GET')sameOrigin(request);
  if(path[0]==='health'&&method==='GET'){await env.DB.prepare('SELECT id FROM requests LIMIT 1').first();return json({ok:true,backend:'d1',version:1});}
  const s=await session(request,env);
  if(path[0]==='session'){
    if(method==='GET')return s?json({role:s.role,name:s.name,scope:s.token_hash.slice(0,16)}):json({role:null},401);
    if(method==='POST'){
      const b=await bodyJSON(request);
      if(b.staffKey!==undefined){
        await rateLimit(env,'login:'+(request.headers.get('CF-Connecting-IP')||'local'),10);
        if(!env.STAFF_LOGIN_KEY||env.STAFF_LOGIN_KEY.length<32)fail(503,'staff-login-not-configured');
        if(await digest(String(b.staffKey))!==await digest(env.STAFF_LOGIN_KEY))fail(401,'invalid-credentials');
        // Replace the guest session only after credentials are verified.
        return createSession(request,env,'staff',String(b.name||'Staff').slice(0,100));
      }
      if(s)return json({role:s.role,name:s.name,scope:s.token_hash.slice(0,16)});
      await rateLimit(env,'session:'+(request.headers.get('CF-Connecting-IP')||'local'),100);
      return createSession(request,env);
    }
    if(method==='DELETE'){
      if(s)await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(s.token_hash).run();
      const r=json({ok:true});r.headers.set('Set-Cookie',(s?.role==='staff'?'oo_staff':'oo_session')+'=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');return r;
    }
  }
  if(!s)fail(401,'session-required');
  if(['partners','services'].includes(path[0]))return catalog({request,env,s,path,url});
  if(path[0]==='access'&&method==='POST'){
    const b=await bodyJSON(request);await rateLimit(env,'access:'+s.token_hash,30);
    const link=await env.DB.prepare('SELECT request_id FROM access_links WHERE token_hash=? AND expires_at>?').bind(await digest(String(b.token)),Date.now()).first();
    if(!link)fail(404,'link-expired-or-invalid');
    await env.DB.prepare('INSERT OR IGNORE INTO grants VALUES(?,?)').bind(link.request_id,s.token_hash).run();
    return json({id:link.request_id});
  }
  if(path[0]!=='requests')fail(404,'not-found');
  if(!path[1]){
    if(method==='GET'){
      const cursor=url.searchParams.get('cursor')||'';
      const rows=await env.DB.prepare('SELECT * FROM requests WHERE id>? AND (?=\'staff\' OR owner=? OR EXISTS(SELECT 1 FROM grants WHERE request_id=requests.id AND session_hash=?)) ORDER BY id LIMIT 100').bind(cursor,s.role,s.token_hash,s.token_hash).all();
      return json({requests:rows.results.map(r=>publicRequest(r,s.role)),cursor:rows.results.length===100?rows.results.at(-1).id:null});
    }
    if(method==='POST'){
      const b=await bodyJSON(request);let input=b.request;
      if(!input||!/^r[A-Za-z0-9_-]{8,80}$/.test(input.id))fail(400,'invalid-request-id');
      // Idempotency is scoped to the creating session. Knowing an ID never grants access.
      const existing=await env.DB.prepare('SELECT * FROM requests WHERE id=?').bind(input.id).first();
      if(existing){if(existing.owner!==s.token_hash)fail(409,'id-conflict');return json({request:publicRequest(existing,s.role)});}
      if(input.sourceServiceId)input=await serviceOffer(env,s,input);
      await rateLimit(env,'create:'+s.token_hash,30);
      let r=createRequest(input,input.id,s.role==='staff'||b.legacy===true);
      if(input.sourceServiceId)r.sourcing=input.sourcing;
      if(s.role==='staff'&&!b.legacy&&input.offer){
        r=updateRequest(r,{...r,offer:input.offer,status:'offer'},'staff',s.name);
        if(input.payment)r=updateRequest(r,{...r,payment:input.payment,status:input.status==='payopen'?'payopen':'offer'},'staff',s.name);
      }
      const inserts=[env.DB.prepare('INSERT INTO requests VALUES(?,?,?,1,?,?)').bind(r.id,s.token_hash,JSON.stringify(r),Date.now(),s.role+':'+s.name)];
      if(b.legacy)inserts.push(env.DB.prepare('INSERT INTO legacy_imports VALUES(?,?,?)').bind(r.id,JSON.stringify(input),Date.now()));
      await env.DB.batch(inserts);
      return json({request:publicRequest({data:r,version:1},s.role)},201);
    }
  }
  const {row,data}=await owned(request,env,path[1]);
  if(path[2]==='access-link'&&method==='POST'){
    const raw=token();await env.DB.prepare('INSERT INTO access_links VALUES(?,?,?)').bind(await digest(raw),row.id,Date.now()+7*86400000).run();
    return json({url:url.origin+'/#access='+raw,expiresIn:604800});
  }
  if(path[2]==='payment-attempts'){
    if(s.role!=='staff')fail(403,'staff-required');
    if(method==='GET')return json({attempts:(await env.DB.prepare('SELECT * FROM payment_attempts WHERE request_id=? ORDER BY created_at DESC LIMIT 30').bind(row.id).all()).results});
    if(method==='POST'){
      const b=await bodyJSON(request);
      if(!['paid','failed'].includes(b.outcome)||typeof b.reference!=='string'||b.reference.trim().length<5||b.reference.length>200)fail(400,'bank-reference-required');
      const attempt=await env.DB.prepare('SELECT * FROM payment_attempts WHERE request_id=? AND id=? AND status=\'pending\'').bind(row.id,b.attemptId).first();
      if(!attempt)fail(409,'no-pending-attempt');
      const actor='staff:'+s.name+':bank-reconciliation:'+b.reference;
      if(b.outcome==='paid')await settlePayment(env,attempt,true,actor);
      else await env.DB.batch([
        env.DB.prepare('UPDATE payment_attempts SET status=\'failed\' WHERE id=? AND status=\'pending\'').bind(attempt.id),
        env.DB.prepare('UPDATE requests SET version=version+1,updated_at=?,actor=? WHERE id=?').bind(Date.now(),actor,row.id)
      ]);
      return json({ok:true});
    }
  }
  if(path[2]==='events'&&method==='GET'){
    if(s.role!=='staff')fail(403,'staff-required');
    const rows=await env.DB.prepare('SELECT version,actor,at,data FROM request_events WHERE request_id=? AND version>? ORDER BY version LIMIT 100').bind(row.id,Number(url.searchParams.get('after')||0)).all();return json({events:rows.results});
  }
  if(path[2]==='legacy'&&method==='GET'){
    if(s.role!=='staff')fail(403,'staff-required');
    const legacy=await env.DB.prepare('SELECT data,imported_at FROM legacy_imports WHERE request_id=?').bind(row.id).first();return json({legacy:legacy?{...legacy,data:JSON.parse(legacy.data)}:null});
  }
  if(path[2])fail(404,'not-found');
  if(method==='GET')return json({request:publicRequest(row,s.role)});
  if(method==='PUT'){
    const b=await bodyJSON(request);
    if(b.version!==row.version)fail(409,'version-conflict');
    const r=updateRequest(data,b.request,s.role,s.name);
    const financial=JSON.stringify([r.offer,r.folio,r.payment])!==JSON.stringify([data.offer,data.folio,data.payment]);
    // Lock financial edits while the bank is handling a charge. The SQL predicate
    // closes the race between checking the attempt and committing the update.
    const result=await env.DB.prepare('UPDATE requests SET data=?,version=version+1,updated_at=?,actor=? WHERE id=? AND version=? AND (?=0 OR NOT EXISTS(SELECT 1 FROM payment_attempts WHERE request_id=requests.id AND status=\'pending\'))').bind(JSON.stringify(r),Date.now(),s.role+':'+s.name,row.id,row.version,financial?1:0).run();
    if(!result.meta.changes)fail(409,'version-conflict-or-payment-in-progress');
    return json({request:publicRequest({data:r,version:row.version+1},s.role)});
  }
  fail(405,'method-not-allowed');
}); }
