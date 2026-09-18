const {test,expect}=require('@playwright/test');
const base='http://localhost:8791';
const staffKey=process.env.ONLYONE_TEST_STAFF_KEY||'local-test-only-staff-key-12345678901234567890';
async function call(ctx,path,method='GET',data){const res=await ctx.request.fetch(base+'/api/v1/'+path,{method,headers:{Origin:base},...(data?{data}:{})});expect(res.ok(),await res.text()).toBeTruthy();return res.json();}
async function openApp(page){await page.route('**/*',route=>['image','media','font'].includes(route.request().resourceType())||!route.request().url().startsWith(base)?route.abort():route.continue());await page.goto('/',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.ONLYONE?.boot);await page.evaluate(()=>window.ONLYONE.boot());await page.evaluate(()=>{document.getElementById('intro')?.remove();document.getElementById('main').classList.add('is-active','is-instant');document.getElementById('main').setAttribute('aria-hidden','false');});}

test('staff creates a partner, own service and customer offer through the real UI',async({browser})=>{
 const staff=await browser.newContext({viewport:{width:390,height:844}}),second=await browser.newContext(),guest=await browser.newContext();
 await call(staff,'session','POST',{name:'Catalog staff',staffKey});await call(second,'session','POST',{name:'Second device',staffKey});await call(guest,'session','POST',{});
 const page=await staff.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await openApp(page);
 await page.locator('[data-act="menu"]').click();await page.locator('[data-mgo="staff"]').click();await page.locator('[data-go="s-catalog"]').click();
 const name='Partner '+crypto.randomUUID();
 await page.getByRole('button',{name:'Partner anlegen',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill(name);await page.getByLabel('Interne Notizen').fill('Private supplier terms');await page.getByRole('button',{name:'Speichern',exact:true}).click();
 await expect(page.locator('[data-catalog-form]')).toHaveCount(0);
 const partner=(await call(second,'partners')).records.find(p=>p.name===name);expect(partner).toBeTruthy();
 await page.getByRole('button',{name:'Leistung anlegen',exact:true}).click();await page.getByLabel('Name',{exact:true}).fill('Airport service '+name);await page.getByLabel('Partner',{exact:true}).selectOption(partner.id);await page.getByLabel('Kategorie').selectOption('transfer');await page.getByLabel('Preiseinheit,').fill('Fahrzeug');await page.getByLabel('Einkaufspreis').fill('85');await page.getByRole('button',{name:'Speichern',exact:true}).click();await expect(page.locator('[data-catalog-form]')).toHaveCount(0);
 const service=(await call(second,'services')).records.find(s=>s.partnerId===partner.id);expect(service.costMinor).toBe(8500);
 await page.getByLabel('Partner oder Leistung suchen').fill(name);
 await page.screenshot({path:test.info().outputPath('catalog-mobile.png'),fullPage:true});
 await page.locator('[data-catalog-offer="'+service.id+'"]').click();await page.getByLabel('Kundenname').fill('Own offer customer');await page.getByLabel('Telefon',{exact:true}).fill('+49 123');await page.getByLabel('Von',{exact:true}).fill('2099-10-01');await page.getByLabel('Bis',{exact:true}).fill('2099-10-02');await page.getByLabel('Anzahl Preiseinheiten').fill('2');await page.getByLabel('Kundenpreis gesamt').fill('250');await page.getByLabel('Angebot gültig bis').fill('2099-09-30');await expect(page.locator('[data-catalog-margin]')).toContainText('80,00');
 await page.getByRole('button',{name:'Angebot freigeben'}).click();await expect(page.locator('#app')).toContainText('Eigene Leistung · Einkaufskonditionen');
 const r=(await call(second,'requests')).requests.find(r=>r.item?.id===service.id);expect(r.offer.price).toBe(250);expect(r.sourcing.costMinor).toBe(8500);expect(r.payment).toBeNull();
 const privateLink=await call(second,'requests/'+r.id+'/access-link','POST',{});await call(guest,'access','POST',{token:new URLSearchParams(new URL(privateLink.url).hash.slice(1)).get('access')});const visible=(await call(guest,'requests/'+r.id)).request;expect(visible.sourcing).toBeUndefined();expect(visible.offer.price).toBe(250);
 expect((await guest.request.get(base+'/api/v1/services')).status()).toBe(403);
 const storage=await page.evaluate(()=>JSON.stringify({...localStorage}));expect(storage).not.toContain('Private supplier terms');expect(storage).not.toContain(service.id);
 expect(errors).toEqual([]);await staff.close();await second.close();await guest.close();
});
test('real Pages/D1: separate browser sessions see the same request and private offer',async({browser})=>{
 const guest=await browser.newContext(),staff=await browser.newContext(),other=await browser.newContext();
 await call(guest,'session','POST',{});await call(staff,'session','POST',{name:'Browser staff',staffKey});await call(other,'session','POST',{});
 const id='r'+crypto.randomUUID().replaceAll('-','');
 await call(guest,'requests','POST',{request:{id,kind:'charter',item:{t:'yacht',id:'test',name:'Browser journey'},contact:{first:'Browser guest',phone:'+49 123'},from:'2026-10-01',adults:2}});
 expect((await call(other,'requests')).requests.some(r=>r.id===id)).toBeFalsy();
 const staffPage=await staff.newPage();const errors=[];staffPage.on('pageerror',e=>errors.push(e.message));await openApp(staffPage);
 await staffPage.locator('[data-act="menu"]').click();await staffPage.locator('[data-mgo="staff"]').click();
 await staffPage.locator('nav [data-go="s-req"]').click();await staffPage.locator('[data-sreq="'+id+'"]').click();
 await staffPage.locator('[data-act="offer-form"]').click();await staffPage.locator('#oPrice').fill('1750');await staffPage.locator('#oInfo').fill('Private yacht offer');await staffPage.locator('#oNote').fill('staff private note');await staffPage.locator('[data-act="offer-save"]').click();
 await expect.poll(async()=>(await call(staff,'requests/'+id)).request.status).toBe('offer');
 const guestPage=await guest.newPage();guestPage.on('pageerror',e=>errors.push(e.message));await openApp(guestPage);
 await guestPage.evaluate(()=>document.querySelector('[data-go="trips"]')?.click());
 await expect(guestPage.locator('#app')).toContainText('Browser journey');
 await guestPage.locator('[data-trip="'+id+'"]').click({force:true});
 await expect(guestPage.locator('#app')).toContainText('Private yacht offer');
 await expect(guestPage.locator('#app')).not.toContainText('staff private note');
 await guestPage.locator('[data-act="accept"]').click({force:true});
 await expect.poll(async()=>(await call(staff,'requests/'+id)).request.status).toBe('accepted');
 const link=await call(guest,'requests/'+id+'/access-link','POST',{});
 const newDevice=await other.newPage();await newDevice.route('**/*',route=>['image','media','font'].includes(route.request().resourceType())||!route.request().url().startsWith(base)?route.abort():route.continue());await newDevice.goto(link.url,{waitUntil:'domcontentloaded'});await newDevice.waitForFunction(()=>!!window.ONLYONE?.boot);await newDevice.evaluate(()=>window.ONLYONE.boot());
 await expect.poll(async()=>(await call(other,'requests')).requests.some(r=>r.id===id)).toBeTruthy();
 expect(errors).toEqual([]);
 await guest.close();await staff.close();await other.close();
});

test('staff login uses server credentials and logout clears the staff view',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();await openApp(page);
 await page.locator('[data-act="menu"]').click();await page.locator('[data-mgo="staff"]').click();
 await page.locator('#stName').fill('UI staff');await page.locator('#stKey').fill(staffKey);await page.locator('[data-act="do-login"]').click();
 await expect(page.locator('nav [data-go="s-req"]')).toBeVisible();expect((await call(context,'session')).role).toBe('staff');
 await page.locator('[data-go="s-more"]').click();await page.locator('[data-act="logout"]').click();
 await expect.poll(async()=>(await call(context,'session')).role).toBe('guest');await expect(page.locator('nav [data-go="s-req"]')).toHaveCount(0);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('onlyone.state.v1')||'{}').staff||null)).toBeNull();await context.close();
});
test('legacy import, offline outbox and conflict recovery preserve unsaved edits',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage();await call(context,'session','POST',{});
 const old={id:'rlegacy-browser',kind:'charter',item:{t:'service',id:'legacy',name:'Legacy journey'},contact:{first:'Legacy guest',phone:'123'},adults:1,status:'paid',offer:{price:99,currency:'EUR'},payment:{status:'paid'}};
 await page.addInitScript(old=>{if(!localStorage.getItem('onlyone.backend.v1'))localStorage.setItem('onlyone.state.v1',JSON.stringify({requests:[old]}));},old);
 await openApp(page);await page.locator('[data-go="trips"]').click();page.once('dialog',d=>d.accept());await page.locator('[data-backend="import"]').click();
 await expect.poll(async()=>(await call(context,'requests')).requests.length).toBe(1);
 let r=(await call(context,'requests')).requests[0];expect(r.status).toBe('new');expect(r.offer).toBeNull();
 // A remote message arrives, then a local message races using the stale version.
 await page.locator('[data-trip="'+r.id+'"]').click();
 r.messages.push({from:'guest',text:'Other device',at:1,read:false});await call(context,'requests/'+r.id,'PUT',{request:r,version:r._version});
 await page.evaluate(()=>document.querySelector('[data-go="concierge"]')?.click());
 // Use the real concierge composer.
 await page.locator('#cMsg').fill('Unsaved local question');await page.locator('[data-act="c-send"]').click();
 await expect(page.locator('#backend-status')).toContainText('Not saved');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('onlyone.backend.v1')).pending.length)).toBe(1);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Reload server data'}).click();await download;
 await expect.poll(async()=>page.evaluate(()=>JSON.parse(localStorage.getItem('onlyone.backend.v1')).pending.length)).toBe(0);
 await page.locator('[data-go="concierge"]').click();
 await page.route('**/api/v1/requests/**',route=>route.request().method()==='PUT'?route.abort():route.continue());
 await page.locator('#cMsg').fill('Offline question');await page.locator('[data-act="c-send"]').click();
 await expect(page.locator('#backend-status')).toContainText('this device only');
 await page.unroute('**/api/v1/requests/**');await page.evaluate(()=>window.dispatchEvent(new Event('online')));
 await expect.poll(async()=>(await call(context,'requests/'+r.id)).request.messages.some(m=>m.text==='Offline question')).toBeTruthy();
 await context.close();
});
