/* Shared persistence adapter. localStorage is a guest cache/outbox only;
   server responses, permissions and versions are authoritative. */
(function(global){
  'use strict';
  global.createOnlyoneBackend=function({getState,render,notify}){
    const CACHE='onlyone.backend.v1',LEGACY='onlyone.legacy.v1';
    let baseline=new Map(),pending=new Map(),scope=null,role=null,ready=false,busy=false,blocked=false,timer,initializing;
    let legacy=[];
    const clone=x=>JSON.parse(JSON.stringify(x));
    const signature=x=>JSON.stringify(x);
    const read=k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}};
    const write=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch{status('Storage unavailable: keep this page open until saved.');}};
    function status(text){
      let el=document.getElementById('backend-status');
      if(!el){el=document.createElement('div');el.id='backend-status';el.setAttribute('role','status');el.style.cssText='position:fixed;left:12px;right:12px;top:8px;z-index:10000;background:#173a38;color:white;padding:9px 12px;border-radius:10px;font:13px system-ui;box-shadow:0 2px 15px #0003';document.body.appendChild(el);}
      el.replaceChildren(document.createTextNode(text));el.hidden=!text;
      if(text&&blocked){const b=document.createElement('button');b.textContent='Reload server data';b.style.marginLeft='12px';b.onclick=discard;el.appendChild(b);}
    }
    async function api(path,method='GET',body){
      const response=await fetch('./api/v1/'+path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},...(body?{body:JSON.stringify(body)}:{})});
      let data;try{data=await response.json();}catch{throw new Error('Backend unavailable');}
      if(!response.ok){const e=new Error(data.error||'Backend unavailable');e.status=response.status;throw e;}return data;
    }
    function cache(){
      // Staff records, internal notes and authentication never persist on disk.
      if(role==='staff')return;
      write(CACHE,{scope,requests:[...baseline.values()],pending:[...pending.entries()]});
    }
    async function pull(){
      let cursor='',requests=[];
      do{const page=await api('requests'+(cursor?'?cursor='+encodeURIComponent(cursor):''));requests.push(...page.requests);cursor=page.cursor;}while(cursor);
      const changed=signature([...baseline.values()])!==signature(requests);
      baseline=new Map(requests.map(r=>[r.id,clone(r)]));
      getState().requests=requests.sort((a,b)=>b.createdAt-a.createdAt);cache();
      return changed;
    }
    function capture(){
      if(!ready)return;
      for(const r of getState().requests){
        const base=baseline.get(r.id);
        if(signature(r)!==signature(base))pending.set(r.id,{request:clone(r),version:pending.get(r.id)?.version??base?._version??null,legacy:pending.get(r.id)?.legacy||false});
      }
      if(pending.size){cache();status(blocked?'Changes need review; they have not been saved.':'Saving changes…');clearTimeout(timer);timer=setTimeout(()=>flush(),0);}
    }
    async function flush(){
      const hadPending=pending.size>0;
      if(busy||!ready||blocked)return false;
      busy=true;
      try{
        while(pending.size){
          const [id,job]=pending.entries().next().value;
          const result=await api('requests'+(job.version?'/'+encodeURIComponent(id):''),job.version?'PUT':'POST',{request:job.request,version:job.version,legacy:job.legacy||false});
          pending.delete(id);baseline.set(id,clone(result.request));
          const index=getState().requests.findIndex(r=>r.id===id);if(index>=0)getState().requests[index]=result.request;
          cache();
        }
        status('');if(hadPending&&!document.activeElement?.matches('input,textarea,select'))render();return true;
      }catch(e){
        blocked=!!e.status&&e.status!==429&&e.status<500;
        status(blocked?'Not saved ('+e.message+'). Your changes are retained for review.':'Offline / server unavailable: changes are saved on this device only.');
        return false;
      }finally{busy=false;}
    }
    async function discard(){
      // Preserve rejected edits in an export before replacing the working view.
      if(pending.size)exportData([...pending.values()],'onlyone-unsaved-changes.json');
      pending.clear();blocked=false;await pull();status('');render();
    }
    function exportData(data,name){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
    function init(){if(ready)return Promise.resolve();if(!initializing)initializing=initialize().finally(()=>{initializing=null;});return initializing;}
    async function initialize(){
      const state=getState(),saved=read(CACHE);
      legacy=read(LEGACY)||[];
      if(!saved&&!legacy.length&&(state.requests.length||(state.leads||[]).length)){
        legacy=clone(state.requests);for(const lead of state.leads||[])legacy.push({id:'legacy-lead-'+legacy.length,contact:{first:lead.name,phone:lead.phone},note:JSON.stringify(lead),adults:lead.guests||1});
        write(LEGACY,legacy);
      }
      state.staff=null;state.requests=[];state.leads=[];
      try{
        const s=await api('session','POST',{});scope=s.scope;role=s.role;state.staff=role==='staff'?s.name:null;
        if(saved?.scope===scope)pending=new Map(saved.pending||[]);
        else if(saved?.pending?.length){legacy.push(...saved.pending.map(([,job])=>job.request));write(LEGACY,legacy);}
        await pull();
        for(const [id,job] of pending){const i=state.requests.findIndex(r=>r.id===id);if(i>=0)state.requests[i]=job.request;else state.requests.unshift(job.request);}
        ready=true;
        const access=new URLSearchParams(location.hash.slice(1)).get('access');
        if(access){history.replaceState(null,'',location.pathname+location.search);try{await api('access','POST',{token:access});await pull();}catch(e){notify(e.message);}}
        await flush();
        if(legacy.length&&!pending.size)status('Local records available: open My trips to import them.');
      }catch(e){
        ready=false;status('Backend unavailable. New requests cannot be sent yet.');
        if(saved){state.requests=saved.requests||[];for(const [,job] of saved.pending||[]) {const i=state.requests.findIndex(r=>r.id===job.request.id);if(i>=0)state.requests[i]=job.request;else state.requests.unshift(job.request);}}
      }
    }
    async function login(name,staffKey){
      if(pending.size)throw new Error('Save or review pending changes before signing in.');
      const s=await api('session','POST',{name,staffKey});scope=s.scope;role=s.role;getState().staff=s.name;baseline.clear();ready=true;blocked=false;await pull();status('');
    }
    async function logout(){
      if(pending.size)throw new Error('Save or review pending changes before signing out.');
      await api('session','DELETE');getState().staff=null;getState().requests=[];baseline.clear();ready=false;await init();
    }
    async function importLegacy(){
      if(!ready||busy)return;
      for(const old of legacy){
        const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(scope+':'+old.id));
        const id='r'+[...new Uint8Array(bytes)].map(v=>v.toString(16).padStart(2,'0')).join('').slice(0,32);
        const r={...old,id};pending.set(id,{request:r,version:null,legacy:true});
        if(!getState().requests.some(x=>x.id===id))getState().requests.unshift(r);
      }
      cache();status('Importing local requests…');
      if(await flush()){legacy=[];write(LEGACY,[]);await pull();render();notify('Requests imported. Historical offers/payments require staff verification.');}
    }
    async function share(id){const result=await api('requests/'+encodeURIComponent(id)+'/access-link','POST',{});if(navigator.clipboard){await navigator.clipboard.writeText(result.url);notify('Private access link copied (valid for 7 days).');}else window.prompt('Private access link (valid for 7 days)',result.url);}
    function toolbar(){return '<div style="display:flex;gap:8px;flex-wrap:wrap;margin:12px 0">'+(legacy.length?'<button class="btn btn--ghost" data-backend="import">Import local requests ('+legacy.length+')</button>':'')+'<button class="btn btn--ghost" data-backend="export">Export local backup</button><label class="btn btn--ghost">Load backup<input type="file" accept="application/json,.json" data-backend-file hidden></label><button class="btn btn--ghost" data-backend="refresh">Refresh</button></div>';}
    async function reconcile(id,outcome){
      const {attempts}=await api('requests/'+id+'/payment-attempts');const attempt=attempts.find(x=>x.status==='pending');
      if(!attempt){notify('No pending bank payment.');return;}
      const reference=window.prompt('Verify '+(attempt.amount_minor/100)+' '+attempt.currency+' in the bank panel first. Enter the bank reference for '+outcome+':');
      if(!reference)return;
      await api('requests/'+id+'/payment-attempts','POST',{attemptId:attempt.id,outcome,reference});await pull();render();notify('Bank reconciliation saved.');
    }
    document.addEventListener('change',async e=>{
      if(!e.target.matches('[data-backend-file]'))return;const file=e.target.files?.[0];if(!file)return;
      try{if(file.size>5000000)throw new Error('Backup exceeds 5 MB.');const data=JSON.parse(await file.text());const rows=Array.isArray(data)?data:data.requests;if(!Array.isArray(rows)||rows.length>1000)throw new Error('Invalid backup.');legacy=rows;write(LEGACY,legacy);render();notify('Backup loaded. Choose Import local requests to send it.');}catch(err){notify(err.message);}
    });
    document.addEventListener('click',async e=>{const b=e.target.closest('[data-backend]');if(!b)return;e.preventDefault();try{if(b.dataset.backend==='import')await importLegacy();if(b.dataset.backend==='export')exportData(legacy.length?legacy:[...baseline.values()],'onlyone-local-backup.json');if(b.dataset.backend==='refresh'){if(!ready)await init();else{capture();if(await flush())await pull();}render();}if(b.dataset.backend==='share')await share(b.dataset.id);if(b.dataset.backend==='reconcile')await reconcile(b.dataset.id,b.dataset.outcome);if(b.dataset.backend==='legacy'){const result=await api('requests/'+b.dataset.id+'/legacy');exportData(result.legacy,'onlyone-legacy-review.json');}}catch(err){notify(err.message);}});
    setInterval(async()=>{if(document.hidden||busy||blocked||!ready)return;capture();if(!await flush())return;try{if(!document.activeElement?.matches('input,textarea,select')&&await pull())render();}catch{status('Connection interrupted. Showing last saved data.');}},15000);
    window.addEventListener('online',async()=>{if(!ready)await init();else await flush();render();});
    window.addEventListener('beforeunload',e=>{if(pending.size){e.preventDefault();e.returnValue='';}});
    return {init,capture,flush,login,logout,toolbar,get blocked(){return blocked;},get busy(){return busy;},get ready(){return ready;},get pending(){return pending.size>0;}};
  };
})(window);
