#!/usr/bin/env node
/* Builds the static test version of the platform into dist/ (or the folder
   given as the first argument).

   The result runs on any static host — GitHub Pages, plain FTP webspace —
   because demo/shim.js answers /api/* inside the browser with the real
   functions/ code and an SQLite database stored in that browser. It is a
   test version: every visitor sees only their own data, and no bank payment
   can start. The production platform still needs Cloudflare (docs/deployment-checklist.md).

     node scripts/build-demo.js [outDir]
*/
'use strict';
const fs=require('fs');
const path=require('path');

const ROOT=path.resolve(__dirname,'..');
const OUT=path.resolve(ROOT,process.argv[2]||'dist');
const DEMO=path.join(OUT,'demo');

// Brackets in file names are routing syntax for Cloudflare; static hosts and
// URLs handle them poorly. Imports inside the files are relative to their
// folder, so renaming within the same folder changes nothing else.
const RENAME={'[[path]].js':'catchall.js','[provider].js':'provider.js'};

fs.rmSync(OUT,{recursive:true,force:true});
fs.cpSync(path.join(ROOT,'public'),OUT,{recursive:true});
// Cloudflare-only routing; meaningless on a static host.
fs.rmSync(path.join(OUT,'_routes.json'),{force:true});

function copyFunctions(from,to){
  fs.mkdirSync(to,{recursive:true});
  for(const entry of fs.readdirSync(from,{withFileTypes:true})){
    const src=path.join(from,entry.name);
    if(entry.isDirectory())copyFunctions(src,path.join(to,entry.name));
    else if(entry.name.endsWith('.js'))fs.copyFileSync(src,path.join(to,RENAME[entry.name]||entry.name));
  }
}
copyFunctions(path.join(ROOT,'functions'),path.join(DEMO,'functions'));

fs.cpSync(path.join(ROOT,'demo'),DEMO,{recursive:true});

const migrationsDir=path.join(ROOT,'migrations');
const migrations=fs.readdirSync(migrationsDir).filter(f=>f.endsWith('.sql')).sort()
  .map(name=>({name,sql:fs.readFileSync(path.join(migrationsDir,name),'utf8')}));
fs.writeFileSync(path.join(DEMO,'migrations.json'),JSON.stringify(migrations));

// The shim must run before every other script on the page.
let build='demo';
try{build=JSON.parse(fs.readFileSync(path.join(OUT,'version.json'),'utf8')).build||build;}catch{}
const tag=`<script src="./demo/shim.js?v=${encodeURIComponent(build)}"></script>`;
for(const page of ['index.html','operations.html']){
  const file=path.join(OUT,page);
  if(!fs.existsSync(file))continue;
  let html=fs.readFileSync(file,'utf8');
  const charset=html.match(/<meta charset="[^"]*">/i);
  if(charset)html=html.replace(charset[0],charset[0]+tag);
  else html=html.replace(/<head>/i,m=>m+tag);
  if(!html.includes(tag))throw new Error('Could not inject demo shim into '+page);
  fs.writeFileSync(file,html);
}

fs.writeFileSync(path.join(OUT,'.nojekyll'),'');
console.log('Demo build written to '+path.relative(ROOT,OUT)+'/ ('+migrations.length+' migrations, build '+build+')');
