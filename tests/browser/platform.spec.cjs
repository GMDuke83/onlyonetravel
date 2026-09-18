const {test,expect}=require('@playwright/test');
const {mkdirSync}=require('node:fs');
const base='http://localhost:8791',staffKey='local-test-only-staff-key-12345678901234567890';
async function api(ctx,path,method='GET',data){const r=await ctx.request.fetch(base+'/api/v1/'+path,{method,headers:{Origin:base},...(data?{data}:{})});expect(r.ok(),await r.text()).toBeTruthy();return r.json();}
async function boot(page){await page.goto('/');await page.waitForFunction(()=>!!window.ONLYONE?.boot);await page.evaluate(()=>{window.ONLYONE.boot();document.getElementById('intro')?.remove();document.getElementById('main').classList.add('is-active','is-instant');document.getElementById('main').setAttribute('aria-hidden','false');});await page.waitForFunction(()=>{const v=document.querySelector('.view');return v&&getComputedStyle(v).opacity==='1';});}
test('complete UI journey: enquiry, claim, quote, customer acceptance, partner payment, booking and calendar',async({browser})=>{
 mkdirSync('docs/screenshots',{recursive:true});
 const guest=await browser.newContext({viewport:{width:390,height:844},locale:'de-DE'}),staff=await browser.newContext({viewport:{width:1440,height:900}});
 const gp=await guest.newPage(),sp=await staff.newPage(),errors=[];gp.on('pageerror',e=>errors.push(e.message));sp.on('pageerror',e=>errors.push(e.message));
 await boot(gp);await gp.locator('[data-act="menu"]').click();await gp.locator('[data-mgo="excursions"]').click();
 await gp.locator('[data-exc]:not([data-exc="yacht-tour"])').first().click();await gp.locator('[data-act="exc-request"]').click();
 const name='Testreise '+Date.now();await gp.locator('#erDate').fill('2099-10-01');await gp.locator('#erName').fill(name);await gp.locator('#erPhone').fill('+49 000 000');await gp.locator('[data-act="exc-send"]').click();
 await expect.poll(async()=>(await api(guest,'requests')).requests.length).toBe(1);let r=(await api(guest,'requests')).requests[0];expect(r.offer).toBeNull();
 await sp.goto('/operations.html');await sp.getByLabel('Zugangstoken').fill(staffKey);await sp.getByRole('button',{name:'Anmelden',exact:true}).click();await expect(sp.getByRole('heading',{name:'Reisen möglich machen.'})).toBeVisible();
 await sp.locator('[data-trip="'+r.id+'"]').click();await sp.getByRole('button',{name:'Übernehmen',exact:true}).click();await expect(sp.locator('#notice')).toContainText('übernommen');
 await sp.getByLabel('Verkaufspreis').fill('1250');await sp.getByLabel('Gültig bis').fill('2099-09-30');await sp.getByLabel('Kundenbeschreibung').fill('Private Reise mit Guide und Transfer');await sp.getByLabel('Interne Notiz').fill('Nur intern: Einkauf 850 EUR');await sp.getByRole('button',{name:'Angebot freigeben'}).click();await expect(sp.locator('#notice')).toContainText('Angebotsversion gespeichert');
 await boot(gp);await gp.locator('[data-go="trips"]').click();await gp.locator('[data-trip="'+r.id+'"]').click();await expect(gp.locator('#app')).toContainText('Private Reise mit Guide');await expect(gp.locator('#app')).not.toContainText('Einkauf');await gp.locator('[data-act="accept"]').click();
 await expect.poll(async()=>(await api(guest,'requests/'+r.id)).request.status).toBe('accepted');
 await sp.locator('[data-view="requests"]').click();await expect(sp.getByRole('heading',{name:'Anfragen & Reisen',exact:true})).toBeVisible();await sp.locator('[data-trip="'+r.id+'"]').click();await sp.getByLabel('Zahlungsweg').selectOption('partner');await sp.getByLabel('Partnername / Empfänger und Zahlungsanweisung').fill('Testpartner – Überweisung laut Partnerbeleg');await sp.getByLabel('Zahlungsreferenz',{exact:true}).fill('PARTNER-TEST-1250');await sp.getByLabel('Zahlungsfrist').fill('2099-09-30');await sp.getByRole('button',{name:'Zahlung anfordern'}).click();await expect(sp.locator('#notice')).toContainText('Zahlungsanforderung gespeichert');
 await boot(gp);await gp.locator('[data-go="trips"]').click();await gp.locator('[data-trip="'+r.id+'"]').click();await expect(gp.locator('#app')).toContainText('Testpartner');
 sp.once('dialog',d=>d.accept('PARTNER-CONFIRMATION-TEST'));await sp.getByRole('button',{name:'Eingang verbuchen'}).click();await expect(sp.locator('#notice')).toContainText('Zahlungseingang verbucht');await sp.getByRole('button',{name:'Reise bestätigen',exact:true}).click();await expect(sp.locator('#notice')).toContainText('Reise bestätigt');
 await sp.evaluate(()=>window.scrollTo(0,0));await sp.screenshot({path:'docs/screenshots/trip-desktop.png',fullPage:true,animations:'disabled'});
 await sp.locator('[data-view="calendar"]').click();await expect(sp.locator('#screen')).toContainText('Bestätigte Reise');await expect(sp.locator('[data-trip="'+r.id+'"]').first()).toBeVisible();await sp.screenshot({path:'docs/screenshots/calendar-desktop.png',fullPage:true,animations:'disabled'});
 await sp.locator('[data-view="tasks"]').click();await expect(sp.locator('#screen')).toContainText('Partnerbestätigung und Voucher prüfen');
 await boot(gp);await gp.locator('[data-go="trips"]').click();await gp.locator('[data-trip="'+r.id+'"]').click();await expect.poll(async()=>(await api(guest,'requests/'+r.id)).request.status).toBe('confirmed');await expect(gp.locator('#app')).toContainText('bestätigt');await gp.screenshot({path:'docs/screenshots/portal-mobile.png',fullPage:true,animations:'disabled'});
 for(const [width,height] of [[360,800],[390,844],[430,932],[768,1024],[1366,768],[1440,900],[1920,1080]]){await sp.setViewportSize({width,height});await sp.locator('[data-view="requests"]').click();await expect(sp.getByRole('heading',{name:'Anfragen & Reisen',exact:true})).toBeVisible();await sp.locator('[data-trip="'+r.id+'"]').click();await expect(sp.getByRole('heading',{name:r.code,exact:true})).toBeVisible();expect(await sp.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();}
 await sp.locator('[data-view="audit"]').click();await expect(sp.locator('#screen')).toContainText('Reiseänderung');expect(errors).toEqual([]);
 await guest.close();await staff.close();
});
test('responsive public and operations layouts at all requested sizes',async({browser})=>{
 mkdirSync('docs/screenshots',{recursive:true});
 const context=await browser.newContext({locale:'de-DE'});await api(context,'session','POST',{staffKey});const page=await context.newPage();
 for(const [width,height] of [[360,800],[390,844],[430,932],[768,1024],[1366,768],[1440,900],[1920,1080]]){
  await page.setViewportSize({width,height});await page.goto('/operations.html');await expect(page.locator('h1')).toContainText('Reisen möglich machen');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();await page.screenshot({path:`docs/screenshots/operations-${width}.png`,fullPage:true,animations:'disabled'});
  await boot(page);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
  if(width>=820)expect(await page.locator('#main').evaluate(e=>e.getBoundingClientRect().width)).toBe(width);
  await page.screenshot({path:`docs/screenshots/public-${width}.png`,fullPage:true,animations:'disabled'});
 }
 await context.close();
});
