const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
for(const file of [...walk('functions'),...walk('public/js'),...walk('scripts')].filter(f=>f.endsWith('.js')))execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
console.log('JavaScript syntax checks passed.');
