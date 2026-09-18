import { json } from '../api/pay/util.js';
export class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
export const fail = (status, message) => { throw new HttpError(status, message); };
export const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function digest(value) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join(''); }
export function sameOrigin(request) {
  if (request.headers.get('Origin') !== new URL(request.url).origin) fail(403,'same-origin-required');
}
export async function bodyJSON(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) fail(415,'json-required');
  if (Number(request.headers.get('content-length')) > 100000) fail(413,'body-too-large');
  const reader=request.body?.getReader(); if(!reader) fail(400,'bad-json');
  let size=0; const parts=[];
  for (;;) { const {done,value}=await reader.read(); if(done) break; size+=value.byteLength; if(size>100000){await reader.cancel();fail(413,'body-too-large');} parts.push(value); }
  const bytes=new Uint8Array(size); let at=0; for(const part of parts){bytes.set(part,at);at+=part.length;}
  try { const b=JSON.parse(new TextDecoder().decode(bytes)); if(!b||typeof b!=='object'||Array.isArray(b)) fail(400,'bad-json'); return b; } catch { fail(400,'bad-json'); }
}
export const localOnly=request=>['localhost','127.0.0.1','[::1]'].includes(new URL(request.url).hostname)||new URL(request.url).hostname.endsWith('.test');
export async function session(request,env) {
  if(!env.DB) fail(503,'database-not-configured');
  const cookies=request.headers.get('cookie')||'';
  for(const key of ['oo_staff','oo_session']){
    const raw=cookies.match(new RegExp('(?:^|;\\s*)'+key+'=([a-f0-9]{64})(?:;|$)'))?.[1];
    if(!raw)continue;
    const s=await env.DB.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').bind(await digest(raw),Date.now()).first();
    if(!s)continue;
    if(s.role==='staff'){
      if(s.user_id){const u=await env.DB.prepare('SELECT name,role,active FROM users WHERE id=?').bind(s.user_id).first();if(!u?.active)continue;s.permissionRole=u.role;s.name=u.name;}
      else {if(!localOnly(request)||env.ALLOW_LEGACY_STAFF!=='true'||!env.STAFF_LOGIN_KEY||s.credential_hash!==await digest(env.STAFF_LOGIN_KEY))continue;s.permissionRole='owner';}
    }
    return s;
  }
  return null;
}
export async function createSession(request,env,role='guest',name='Guest',user=null) {
  const raw=token(),hash=await digest(raw),ttl=role==='staff'?28800:2592000;
  await env.DB.prepare('INSERT INTO sessions(token_hash,role,name,expires_at,credential_hash,user_id) VALUES(?,?,?,?,?,?)').bind(hash,role,name,Date.now()+ttl*1000,role==='staff'&&!user?await digest(env.STAFF_LOGIN_KEY):null,user?.id||null).run();
  const cookie=`${role==='staff'?'oo_staff':'oo_session'}=${raw}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttl}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
  const r=json({role,name,permissionRole:user?.role||(role==='staff'?'owner':null),scope:hash.slice(0,16)});r.headers.set('Set-Cookie',cookie);return r;
}
export async function rateLimit(env,key,max=10) {
  const bucket=Math.floor(Date.now()/900000),hashed=await digest(key+':'+bucket);
  const row=await env.DB.prepare('INSERT INTO rate_limits VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count').bind(hashed,(bucket+1)*900000).first();
  if(row.count>max) fail(429,'rate-limit');
}
export async function owned(request,env,id) {
  const s=await session(request,env);if(!s) fail(401,'session-required');
  const row=await env.DB.prepare("SELECT * FROM requests WHERE id=? AND (?='staff' OR owner=? OR EXISTS(SELECT 1 FROM grants WHERE request_id=requests.id AND session_hash=?))").bind(id,s.role,s.token_hash,s.token_hash).first();
  if(!row) fail(404,'request-not-found');return {s,row,data:JSON.parse(row.data)};
}
export async function safely(fn) { try{return await fn();}catch(e){ if(!e.status) console.error('Backend failure');return json({error:e.status?e.message:'server-error'},e.status||500); } }
