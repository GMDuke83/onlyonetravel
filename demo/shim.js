/* Demo mode — only ever loaded by the static demo build (scripts/build-demo.js).

   A static host (GitHub Pages, plain FTP) has no server, so /api/* does not
   exist there. This script answers those requests inside the browser instead:
   it runs the real Pages Functions from functions/ against an SQLite database
   (sql.js) that lives in this browser's localStorage. Nothing leaves the
   device, and every visitor gets their own empty platform.

   It has to run before any other script on the page, because app.js and the
   operations console start calling the API as soon as they load. */
(function(){
  'use strict';
  var self=document.currentScript.src;
  var demoDir=new URL('./',self).href;
  var root=new URL('../',self);
  var apiPrefix=root.pathname+'api/';
  var realFetch=window.fetch.bind(window);
  var runtime=null;

  function load(){
    if(!runtime)runtime=import(demoDir+'runtime.js').then(function(m){return m.start({root:root.href,demoDir:demoDir});});
    return runtime;
  }

  window.fetch=function(input,init){
    var url;
    try{url=new URL(input instanceof Request?input.url:String(input),location.href);}catch(e){return realFetch(input,init);}
    if(url.origin!==location.origin||url.pathname.indexOf(apiPrefix)!==0)return realFetch(input,init);
    var request=new Request(input,init);
    return load().then(function(rt){return rt.handle(request);});
  };

  window.ONLYONE_DEMO={
    reset:function(){
      ['onlyone.demo.db.v1','onlyone.demo.rev','onlyone.demo.cookies.site','onlyone.demo.cookies.operations','onlyone.backend.v1','onlyone.legacy.v1']
        .forEach(function(k){try{localStorage.removeItem(k);}catch(e){}});
      location.reload();
    },
    staff:[
      {token:'demo-inhaber',role:'Inhaber (alle Rechte)'},
      {token:'demo-vertrieb',role:'Vertrieb'},
      {token:'demo-finanzen',role:'Finanzen'}
    ]
  };

  function banner(){
    var bar=document.createElement('div');
    bar.id='demo-banner';
    bar.setAttribute('role','note');
    // Top centre, small, and click-through except for its button: the site's
    // own controls sit in the corners and in bottom sheets.
    bar.style.cssText='position:fixed;left:50%;top:calc(4px + env(safe-area-inset-top));transform:translateX(-50%);z-index:9999;'+
      'display:flex;align-items:center;gap:6px;padding:3px 3px 3px 10px;border-radius:999px;background:rgba(43,33,24,.88);color:#f6efe4;'+
      'font:600 10px/1.2 system-ui,sans-serif;letter-spacing:.05em;white-space:nowrap;pointer-events:none;box-shadow:0 2px 10px rgba(0,0,0,.2)';
    var text=document.createElement('span');
    text.textContent='TESTVERSION';
    text.title='Alle Daten bleiben in diesem Browser. Keine echten Zahlungen.';
    var reset=document.createElement('button');
    reset.type='button';
    reset.textContent='Daten löschen';
    reset.style.cssText='border:0;border-radius:999px;padding:3px 8px;background:#f6efe4;color:#2b2118;font:inherit;cursor:pointer;pointer-events:auto';
    reset.onclick=function(){if(confirm('Alle Testdaten in diesem Browser löschen?'))window.ONLYONE_DEMO.reset();};
    bar.appendChild(text);bar.appendChild(reset);
    document.body.appendChild(bar);

    // Operations console: the login needs a personal token. Show the demo ones.
    var login=document.getElementById('login');
    if(login){
      var hint=document.createElement('div');
      hint.style.cssText='margin-top:16px;padding:12px 14px;border:1px dashed currentColor;border-radius:10px;font-size:14px;line-height:1.5';
      var title=document.createElement('strong');
      title.textContent='Testzugänge (nur Testversion):';
      hint.appendChild(title);
      window.ONLYONE_DEMO.staff.forEach(function(u){
        var line=document.createElement('div');
        var code=document.createElement('code');
        code.textContent=u.token;
        line.appendChild(code);
        line.appendChild(document.createTextNode(' — '+u.role));
        hint.appendChild(line);
      });
      login.insertAdjacentElement('afterend',hint);
    }
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',banner);else banner();
})();
