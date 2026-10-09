const {test,expect}=require('@playwright/test');
const call=(page,path,method='GET',body)=>page.evaluate(async({path,method,body})=>{
 const r=await fetch('./api/v1/'+path,{method,headers:{'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 return {status:r.status,data:await r.json()};
},{path,method,body});
test('five languages preserve login, filters and quote drafts, and persist after reload',async({browser})=>{
 const {messages}=await import('../../public/js/operations/messages.js'),codes=['de','en','tr','uk','ru'];
 const ctx=await browser.newContext({locale:'en-GB',viewport:{width:390,height:844}}),page=await ctx.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{if(!localStorage.getItem('onlyone.state.v1'))localStorage.setItem('onlyone.state.v1',JSON.stringify({lang:'tr'}));});
 await page.goto('./operations.html');await expect(page.locator('#operationsLanguage')).toBeEnabled();
 await expect(page.locator('html')).toHaveAttribute('lang','tr');
 await page.locator('#login [name=username]').fill('admin');await page.locator('#login [name=password]').fill('admin');
 for(const [i,lang] of codes.entries()){
  await page.locator('#operationsLanguage').selectOption(lang);await expect(page.locator('#operationsLanguage')).toBeEnabled();
  await expect(page.locator('html')).toHaveAttribute('lang',lang);await expect(page.locator('#login button')).toHaveText(messages.login[i]);
  await expect(page.locator('.loginDemo')).toContainText(messages.username[i]+' admin');
  await expect(page.locator('#login [name=password]')).toHaveValue('admin');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 }
 await page.locator('#login [name=password]').fill('wrong');await page.locator('#login button').click();
 await expect(page.locator('#notice')).toHaveText(messages.errorCredentials[4]);
 await page.locator('#login [name=password]').fill('admin');await page.locator('#login button').click();
 await expect(page.locator('#screen h1')).toHaveText(messages['dashboard.title'][4]);
 const made=await call(page,'requests','POST',{request:{id:'rlanguages123456789',contact:{first:'Işık',last:'Demo',phone:'+90 000 111'},from:'2099-11-01',to:'2099-11-05',note:'Original customer note'}});
 expect(made.status).toBe(201);const id=made.data.request.id;
 await page.locator('nav [data-view=requests]').click();await page.locator('[name=query]').fill('Işık');
 await page.locator('[name=state]').selectOption('new');
 for(const [i,lang] of codes.entries()){
  await page.locator('#operationsLanguage').selectOption(lang);await expect(page.locator('#operationsLanguage')).toBeEnabled();
  await expect(page.locator('#screen h1')).toHaveText(messages.requests[i]);
  await expect(page.locator('[name=query]')).toHaveValue('Işık');await expect(page.locator('[name=state]')).toHaveValue('new');
  await expect(page.locator('#workspaceResults')).toContainText('Işık Demo');
 }
 await page.locator('[data-trip="'+id+'"]').click();
 await page.locator('#quote [name=price]').fill('1234.50');await page.locator('#quote [name=currency]').selectOption('USD');
 await page.locator('#quote [name=validUntil]').fill('2099-10-31');await page.locator('#quote [name=custInfo]').fill('Незбережений опис – unchanged');
 for(const [i,lang] of codes.entries()){
  await page.locator('#operationsLanguage').selectOption(lang);await expect(page.locator('#operationsLanguage')).toBeEnabled();
  await expect(page.locator('#quote [name=price]')).toHaveValue('1234.50');await expect(page.locator('#quote [name=currency]')).toHaveValue('USD');
  await expect(page.locator('#quote [name=custInfo]')).toHaveValue('Незбережений опис – unchanged');await expect(page.locator('#quote button')).toHaveText(messages.publishQuote[i]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 }
 expect((await call(page,'requests/'+id)).data.request.offer).toBeNull();
 await page.locator('nav [data-view=users]').click();await page.locator('#user [name=name]').fill('Test Colleague');
 await page.locator('#user [name=username]').fill('colleague.test');await page.locator('#user [name=password]').fill('A personal demo password');
 await page.locator('#user [name=role]').selectOption('finance');
 await page.locator('#operationsLanguage').selectOption('en');await expect(page.locator('#operationsLanguage')).toBeEnabled();
 await expect(page.locator('#user [name=role]')).toHaveValue('finance');await expect(page.locator('#user [name=password]')).toHaveValue('A personal demo password');
 await page.locator('#user button').click();await expect(page.locator('#notice')).toContainText('colleague.test');
 await page.reload();await expect(page.locator('#screen h1')).toHaveText(messages['dashboard.title'][1]);await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.locator('#logout').click();await expect(page.locator('#login')).toBeVisible();await expect(page.locator('#operationsLanguage')).toBeEnabled();
 await page.locator('#login [name=username]').fill('colleague.test');await page.locator('#login [name=password]').fill('A personal demo password');await page.locator('#login button').click();
 await expect(page.locator('#screen h1')).toHaveText(messages['dashboard.title'][1]);await expect(page.locator('nav [data-view=users]')).toBeHidden();
 expect(errors).toEqual([]);await ctx.close();
});
test('previous browser demo upgrades passwords without losing enquiries',async({browser})=>{
 const ctx=await browser.newContext({locale:'de-DE'}),page=await ctx.newPage();await page.goto('./operations.html');await expect(page.locator('#operationsLanguage')).toBeEnabled();
 await call(page,'session','POST',{username:'admin',password:'admin'});
 const created=await call(page,'requests','POST',{request:{id:'rupgrade123456789',contact:{first:'Preserved',phone:'123'},from:'2099-11-01',to:'2099-11-05'}});
 expect(created.status).toBe(201);await call(page,'session','DELETE');
 // Simulate the schema of the previously deployed static build.
 await page.evaluate(async()=>{
  const SQL=await window.initSqlJs({locateFile:f=>new URL('./demo/vendor/'+f,location.href).href});
  const db=new SQL.Database(Uint8Array.from(atob(localStorage.getItem('onlyone.demo.db.v1')),c=>c.charCodeAt(0)));
  db.run('DROP TABLE staff_credentials');const bytes=db.export();let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte);
  localStorage.setItem('onlyone.demo.db.v1',btoa(binary));localStorage.setItem('onlyone.demo.rev','upgrade-fixture');db.close();
 });
 await page.reload();await expect(page.locator('#operationsLanguage')).toBeEnabled();
 await page.locator('#login [name=username]').fill('admin');await page.locator('#login [name=password]').fill('admin');await page.locator('#login button').click();
 await expect(page.locator('#workspaceResults')).toContainText('Preserved');
 expect((await call(page,'requests/'+created.data.request.id)).status).toBe(200);await ctx.close();
});
