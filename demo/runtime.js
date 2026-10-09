/* Demo backend: the real Pages Functions, running in the browser.

   - Database: sql.js (SQLite compiled to WebAssembly) behind a small adapter
     that offers the parts of the Cloudflare D1 API the functions use
     (prepare/bind/first/all/run, batch). The migrations in migrations/ are
     applied unchanged, triggers included.
   - Persistence: the database file is kept in localStorage. A revision key
     lets a second tab (customer site + operations console side by side)
     pick up the other tab's writes before it handles its next request.
   - Sessions: the functions answer with HttpOnly cookies, which a browser
     never lets page script set or read. A small cookie jar stands in.

   No bank credentials exist here, so /api/pay/ping reports every bank as
   not activated and no payment can start. */

const KEY_DB='onlyone.demo.db.v1', KEY_REV='onlyone.demo.rev';
// One cookie jar per page, so the customer site and the operations console can
// be open side by side in one browser as two different people. (On a real
// server both share one cookie jar, and a staff login also applies to the site.)
const KEY_JAR='onlyone.demo.cookies.'+(/operations\.html$/.test(location.pathname)?'operations':'site');

// Public test accounts only. No demo passwords exist in the production Functions.
const STAFF=[
  ['demo-owner','Demo Admin','owner','demo-inhaber','admin','admin'],
  ['demo-sales','Demo Sales','sales','demo-vertrieb','vertrieb','vertrieb'],
  ['demo-finance','Demo Finance','finance','demo-finanzen','finanzen','finanzen'],
];

// File names with brackets are renamed by the build; see scripts/build-demo.js.
const ROUTES=[
  [/^v1(\/.*)?$/, 'api/v1/catchall.js', ()=>({})],
  [/^pay\/ping$/, 'api/pay/ping.js', ()=>({})],
  [/^pay\/start$/, 'api/pay/start.js', ()=>({})],
  [/^pay\/return\/([^/]+)$/, 'api/pay/return/provider.js', m=>({provider:decodeURIComponent(m[1])})],
];

const store={
  get(k){try{return localStorage.getItem(k);}catch{return null;}},
  set(k,v){try{localStorage.setItem(k,v);return true;}catch{return false;}},
};

function toBase64(bytes){
  let s='';for(let i=0;i<bytes.length;i+=0x8000)s+=String.fromCharCode.apply(null,bytes.subarray(i,i+0x8000));
  return btoa(s);
}
function fromBase64(b64){
  const s=atob(b64),bytes=new Uint8Array(s.length);for(let i=0;i<s.length;i++)bytes[i]=s.charCodeAt(i);return bytes;
}
async function sha256(value){
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function loadScript(src){
  return new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=src;s.onload=resolve;s.onerror=()=>reject(new Error('load failed: '+src));document.head.appendChild(s);});
}

/* ---- D1 adapter -------------------------------------------------------- */
class Statement{
  constructor(d1,sql,params=[]){this.d1=d1;this.sql=sql;this.params=params;}
  bind(...params){return new Statement(this.d1,this.sql,params);}
  execute(){
    const db=this.d1.db,st=db.prepare(this.sql);
    try{
      st.bind(this.params.map(v=>v===undefined?null:typeof v==='boolean'?Number(v):v));
      const results=[];while(st.step())results.push(st.getAsObject());
      if(!/^\s*SELECT\b/i.test(this.sql))this.d1.dirty=true;
      return {results,success:true,meta:{changes:db.getRowsModified(),last_row_id:db.exec('SELECT last_insert_rowid()')[0].values[0][0]}};
    }finally{st.free();}
  }
  async first(column){const row=this.execute().results[0];if(!row)return null;return column?row[column]:row;}
  async all(){return this.execute();}
  async run(){return this.execute();}
}
class D1{
  constructor(db){this.db=db;this.dirty=false;}
  prepare(sql){return new Statement(this,sql);}
  async batch(statements){
    this.db.run('SAVEPOINT demo_batch');
    try{const out=statements.map(s=>s.execute());this.db.run('RELEASE demo_batch');return out;}
    catch(e){this.db.run('ROLLBACK TO demo_batch');this.db.run('RELEASE demo_batch');throw e;}
  }
}

/* ---- Cookie jar (stands in for HttpOnly cookies) ----------------------- */
const jar={
  read(){try{return JSON.parse(store.get(KEY_JAR))||{};}catch{return {};}},
  header(){const now=Date.now(),c=this.read();return Object.entries(c).filter(([,v])=>v.expires>now).map(([k,v])=>k+'='+v.value).join('; ');},
  apply(setCookie){
    const parts=setCookie.split(';').map(s=>s.trim()),[name,...rest]=parts[0].split('='),value=rest.join('=');
    const maxAge=Number((parts.find(p=>/^max-age=/i.test(p))||'').split('=')[1]);
    const c=this.read();
    if(!value||maxAge===0)delete c[name];else c[name]={value,expires:Date.now()+(Number.isFinite(maxAge)?maxAge*1000:86400000)};
    store.set(KEY_JAR,JSON.stringify(c));
  },
};
// Response headers refuse Set-Cookie when set from script; record it on the way in.
const cookieSink=new WeakMap();
for(const method of ['set','append']){
  const original=Headers.prototype[method];
  Headers.prototype[method]=function(name,value){
    if(String(name).toLowerCase()==='set-cookie')cookieSink.set(this,String(value));
    return original.call(this,name,value);
  };
}

/* ---- Runtime ----------------------------------------------------------- */
export async function start({root,demoDir}){
  await loadScript(demoDir+'vendor/sql-wasm.js');
  const SQL=await window.initSqlJs({locateFile:file=>demoDir+'vendor/'+file});
  const migrations=await (await fetch(demoDir+'migrations.json',{cache:'no-store'})).json();
  const rootPath=new URL(root).pathname;
  const env={SITE_URL:root.replace(/\/$/,'')};
  const modules=new Map();
  let d1,revision;

  function open(bytes){
    if(d1)d1.db.close();
    d1=new D1(new SQL.Database(bytes));
    d1.db.run('PRAGMA foreign_keys = ON');
    env.DB=d1;
  }
  function save(){
    if(!d1.dirty)return;
    const bytes=d1.db.export();
    d1.db.run('PRAGMA foreign_keys = ON'); // export() reopens the database and resets pragmas
    d1.dirty=false;
    revision=Date.now().toString(36)+Math.random().toString(36).slice(2);
    if(!store.set(KEY_DB,toBase64(bytes))||!store.set(KEY_REV,revision))console.warn('Demo database could not be saved in this browser.');
  }
  async function create(){
    open();
    for(const m of migrations)d1.db.exec(m.sql);
    const now=Date.now();
    for(const [id,name,role,token] of STAFF)
      d1.db.run('INSERT INTO users(id,name,role,token_hash,active,created_at,updated_at,created_by) VALUES(?,?,?,?,1,?,?,?)',[id,name,role,await sha256(token),now,now,'demo']);
    d1.dirty=true;save();
  }
  function sync(){
    const current=store.get(KEY_REV),saved=store.get(KEY_DB);
    if(d1&&current===revision)return false;
    if(!saved)return true;
    open(fromBase64(saved));revision=current;return false;
  }
  // Upgrade previous browser demos in place; never erase their travel records.
  // Web Locks serialize this with the normal API transaction queue across tabs.
  async function upgradePasswords(){
    if(d1.db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='staff_credentials'").length===0){
      d1.db.exec(migrations.find(m=>m.name==='0006_staff_passwords.sql').sql);d1.dirty=true;
    }
    const {hashPassword}=await import(demoDir+'functions/_lib/passwords.js');
    for(const [id,,,,username,password] of STAFF){
      const existing=d1.db.exec('SELECT user_id FROM staff_credentials WHERE user_id=?',[id]);
      if(!existing.length){d1.db.run('INSERT INTO staff_credentials VALUES(?,?,?,?)',[id,username,await hashPassword(password),Date.now()]);d1.dirty=true;}
    }
    save();
  }
  const withDatabaseLock=fn=>navigator.locks?navigator.locks.request('onlyone-demo-db',fn):fn();
  async function prepare(){if(sync())await create();await upgradePasswords();}
  await withDatabaseLock(prepare);

  async function route(request){
    const url=new URL(request.url),sub=url.pathname.slice(rootPath.length+'api/'.length);
    for(const [pattern,file,params] of ROUTES){
      const m=sub.match(pattern);if(!m)continue;
      if(!modules.has(file))modules.set(file,import(demoDir+'functions/'+file));
      const mod=await modules.get(file);
      const verb=request.method.charAt(0)+request.method.slice(1).toLowerCase();
      const handler=mod['onRequest'+verb]||mod.onRequest;
      if(!handler)return new Response(JSON.stringify({error:'method-not-allowed'}),{status:405,headers:{'content-type':'application/json'}});

      // The functions expect to be served at the domain root.
      const apiUrl=url.origin+'/api/'+sub+url.search;
      const body=['GET','HEAD'].includes(request.method)?null:await request.arrayBuffer();
      const inner=new Request(apiUrl,{method:request.method,body,headers:{'content-type':request.headers.get('content-type')||''}});
      const headers=new Headers(request.headers);
      headers.set('Origin',url.origin);
      headers.set('cookie',jar.header());
      if(body)headers.set('content-length',String(body.byteLength));
      const fake={url:apiUrl,method:request.method,headers,body:inner.body,
        text:()=>inner.text(),json:()=>inner.json(),arrayBuffer:()=>inner.arrayBuffer(),formData:()=>inner.formData()};

      let response=await handler({request:fake,env,params:params(m),data:{},waitUntil(){},next:()=>fetch(request)});
      const cookie=cookieSink.get(response.headers);
      if(cookie)jar.apply(cookie);
      // Links the functions build from the domain root must point at the demo's sub-path.
      if((response.headers.get('content-type')||'').includes('json')){
        const text=(await response.text()).split(url.origin+'/#').join(root+'#');
        response=new Response(text,{status:response.status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
      }
      return response;
    }
    return new Response(JSON.stringify({error:'not-found'}),{status:404,headers:{'content-type':'application/json'}});
  }

  let queue=Promise.resolve();
  return {
    handle(request){
      const task=queue.then(()=>withDatabaseLock(async()=>{
        try{await prepare();return await route(request);}
        catch(e){console.error('Demo backend failure',e);return new Response(JSON.stringify({error:'server-error'}),{status:500,headers:{'content-type':'application/json'}});}
        finally{save();}
      }));
      queue=task.catch(()=>{});
      return task;
    },
  };
}
