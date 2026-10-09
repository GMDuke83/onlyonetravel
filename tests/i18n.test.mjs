import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {messages} from '../public/js/operations/messages.js';
import {languages,detectLanguage,setLanguage,getLanguage,translate,errorText,taskTitle} from '../public/js/operations/i18n.js';
import {money} from '../public/js/operations/api.js';
import {contactGroups,filterRows} from '../public/js/operations/workspace.js';
test('all five customer languages have complete operations copy with matching placeholders',()=>{
 assert.deepEqual(Object.keys(languages),['de','en','tr','uk','ru']);
 const params=s=>[...s.matchAll(/\{(\w+)\}/g)].map(m=>m[1]).sort();
 for(const [key,row] of Object.entries(messages)){
  assert.equal(row.length,5,key);for(const value of row){assert.equal(typeof value,'string');assert.ok(value.trim(),key);assert.deepEqual(params(value),params(row[0]),key);}
 }
 for(const file of ['main.js','workspace.js','trips.js','api.js']){
  const source=readFileSync(new URL('../public/js/operations/'+file,import.meta.url),'utf8');
  for(const m of source.matchAll(/\b(?:h|t)\('([^']+)'/g))if(!m[1].endsWith('.'))assert.ok(messages[m[1]],file+': '+m[1]);
 }
 const html=readFileSync(new URL('../public/operations.html',import.meta.url),'utf8');
 for(const m of html.matchAll(/data-i18n(?:-label)?="([^"]+)"/g))assert.ok(messages[m[1]],m[1]);
});
test('language priority follows saved operations preference, customer setting and supported browser locale',()=>{
 assert.equal(detectLanguage('tr','de',['uk-UA']),'tr');assert.equal(detectLanguage(null,'uk',['de-DE']),'uk');
 assert.equal(detectLanguage('bad',null,['fr-FR','ru-RU']),'ru');assert.equal(detectLanguage(null,null,['ua']),'uk');
 assert.equal(detectLanguage(null,null,['fr-FR']),'en');
});
test('formatting, errors and seeded tasks translate while contact identity stays stable',()=>{
 const rows=[{id:'1',name:'IRIS',phone:'123',email:'',updatedAt:1},{id:'2',name:'iris',phone:'123',email:'',updatedAt:2}];
 for(const lang of Object.keys(languages)){setLanguage(lang);assert.equal(getLanguage(),lang);assert.equal(contactGroups(rows).length,1);assert.ok(errorText({code:'invalid-credentials'}));assert.equal(taskTitle('Anfrage prüfen'),translate('reviewTask'));assert.equal(taskTitle('Customer note'),'Customer note');}
 setLanguage('tr');assert.equal(filterRows([{id:'3',name:'IŞIK',updatedAt:1}],{query:'ışık'}).length,1);
 setLanguage('de');assert.match(money(1234.5),/1\.234,50/);setLanguage('en');assert.match(money(1234.5),/1,234\.50/);
});
