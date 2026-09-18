import { json } from '../api/pay/util.js';
import { bodyJSON, fail, digest, token } from './security.js';
import { can, roles, requirePermission } from './permissions.js';

const statement=(env,action,s,id)=>env.DB.prepare('INSERT INTO audit_events(action,actor,entity_id,at) VALUES(?,?,?,?)').bind(action,s.user_id||s.name,id,Date.now());
const text=(v,max=200)=>{if(typeof v!=='string'||!v.trim()||v.length>max)fail(400,'invalid-text');return v.trim();};
const date=v=>{if(typeof v!=='string'||!Number.isFinite(Date.parse(v)))fail(400,'invalid-date');return new Date(v).toISOString();};

export async function operations({request,env,s,path,url}){
  if(s.role!=='staff')fail(403,'staff-required');
  const [route,id]=path,method=request.method;
  if(route==='users'){
    requirePermission(s,'admin');
    if(method==='GET')return json({users:(await env.DB.prepare('SELECT id,name,role,active,created_at,updated_at FROM users ORDER BY name').all()).results});
    if(method==='POST'&&!id){
      const b=await bodyJSON(request);if(!roles.includes(b.role)||b.role==='owner')fail(400,'invalid-role');
      const name=text(b.name),raw=token(),uid=crypto.randomUUID(),now=Date.now();
      await env.DB.batch([env.DB.prepare('INSERT INTO users VALUES(?,?,?,?,1,?,?,?)').bind(uid,name,b.role,await digest(raw),now,now,s.user_id||s.name),statement(env,'user-created',s,uid)]);
      return json({id:uid,token:raw},201);
    }
    if(method==='PUT'&&id){
      const b=await bodyJSON(request);if(!roles.includes(b.role)||b.role==='owner'||typeof b.active!=='boolean')fail(400,'invalid-role');
      const u=await env.DB.prepare('SELECT * FROM users WHERE id=?').bind(id).first();if(!u)fail(404,'not-found');
      if(u.role==='owner'||id===s.user_id)fail(409,'cannot-change-owner-or-self');
      await env.DB.batch([env.DB.prepare('UPDATE users SET role=?,active=?,updated_at=? WHERE id=?').bind(b.role,b.active?1:0,Date.now(),id),env.DB.prepare('DELETE FROM sessions WHERE user_id=?').bind(id),statement(env,'user-access-changed',s,id)]);
      return json({ok:true});
    }
  }
  if(route==='audit'&&method==='GET'){
    requirePermission(s,'audit');
    return json({events:(await env.DB.prepare('SELECT id,action,actor,entity_id,at FROM audit_events ORDER BY id DESC LIMIT 200').all()).results,requests:(await env.DB.prepare('SELECT id,request_id,version,actor,at FROM request_events ORDER BY id DESC LIMIT 200').all()).results});
  }
  if(route==='operations'&&method==='GET'){
    const rows=(await env.DB.prepare('SELECT id,data FROM requests ORDER BY updated_at DESC LIMIT 500').all()).results;
    const attention=rows.map(r=>{const d=JSON.parse(r.data);return {id:r.id,code:d.code,status:d.status,name:d.contact?.first,assignedTo:d.assignedTo||null,from:d.from,until:d.offer?.validUntil};});
    return json({attention,role:s.permissionRole,permissions:['admin','audit','sales','finance','operate','costs'].filter(p=>can(s,p))});
  }
  if(route==='calendar'){
    if(method==='GET'){
      const from=url.searchParams.get('from')||'0000',to=url.searchParams.get('to')||'9999',resource=url.searchParams.get('resource')||'';
      return json({events:(await env.DB.prepare("SELECT * FROM calendar_events WHERE ends_at>? AND starts_at<? AND (?='' OR resource=?) ORDER BY starts_at LIMIT 500").bind(from,to,resource,resource).all()).results});
    }
    if(method==='PUT'&&id){
      requirePermission(s,'operate');const b=await bodyJSON(request);
      if(b.confirmChange!==true)fail(400,'confirm-calendar-change');
      const start=date(b.starts_at),end=date(b.ends_at);if(end<=start)fail(400,'invalid-period');
      const resource=typeof b.resource==='string'?b.resource.trim().slice(0,100):'';
      // Planning times are separate from the customer's contractual travel dates.
      try{
        const result=await env.DB.batch([
          env.DB.prepare('UPDATE calendar_events SET starts_at=?,ends_at=?,resource=?,version=version+1,updated_at=?,actor=? WHERE id=? AND version=?').bind(start,end,resource,Date.now(),s.user_id||s.name,id,b.version),
          env.DB.prepare("INSERT INTO audit_events(action,actor,entity_id,at) SELECT 'calendar-changed',?,?,? WHERE changes()=1").bind(s.user_id||s.name,id,Date.now())
        ]);if(!result[0].meta.changes)fail(409,'version-conflict');
      }catch(e){if(e.message?.includes('resource-conflict'))fail(409,'resource-conflict');throw e;}
      return json({ok:true});
    }
  }
  if(route==='tasks'){
    if(method==='GET')return json({tasks:(await env.DB.prepare('SELECT * FROM tasks ORDER BY done,due_at LIMIT 500').all()).results});
    if(method==='PUT'&&id){
      requirePermission(s,'operate');const b=await bodyJSON(request);if(typeof b.done!=='boolean')fail(400,'invalid-done');
      const result=await env.DB.batch([env.DB.prepare('UPDATE tasks SET done=?,version=version+1,updated_at=?,actor=? WHERE id=? AND version=?').bind(b.done?1:0,Date.now(),s.user_id||s.name,id,b.version),env.DB.prepare("INSERT INTO audit_events(action,actor,entity_id,at) SELECT 'task-changed',?,?,? WHERE changes()=1").bind(s.user_id||s.name,id,Date.now())]);
      if(!result[0].meta.changes)fail(409,'version-conflict');return json({ok:true});
    }
  }
  fail(405,'method-not-allowed');
}
