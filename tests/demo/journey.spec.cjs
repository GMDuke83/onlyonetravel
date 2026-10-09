const {test,expect}=require('@playwright/test');
// The journey of tests/browser/platform.spec.cjs on the static test build:
// no server, one browser, customer site and operations console in two tabs.
async function boot(page){await page.goto('./');await page.waitForFunction(()=>!!window.ONLYONE?.boot);await page.evaluate(async()=>{const loading=window.ONLYONE.boot();document.getElementById('intro')?.remove();document.getElementById('main').classList.add('is-active','is-instant');document.getElementById('main').setAttribute('aria-hidden','false');await loading;});await page.waitForFunction(()=>{const v=document.querySelector('.view');return v&&getComputedStyle(v).opacity==='1';});}
const api=(page,path)=>page.evaluate(async p=>(await fetch('./api/v1/'+p)).json(),path);
test('static test build: enquiry, quote, acceptance, payment, booking — all in the browser',async({browser})=>{
 const ctx=await browser.newContext({locale:'de-DE'});
 const gp=await ctx.newPage(),sp=await ctx.newPage(),errors=[];
 await gp.setViewportSize({width:390,height:844});await sp.setViewportSize({width:1440,height:900});
 for(const p of [gp,sp])p.on('pageerror',e=>errors.push(e.message));
 await boot(gp);expect((await api(gp,'health')).ok).toBe(true);
 await expect(gp.locator('#demo-banner')).toContainText('TESTVERSION');
 await gp.locator('[data-act="menu"]').click();await gp.locator('[data-mgo="excursions"]').click();
 await gp.locator('[data-exc]:not([data-exc="yacht-tour"])').first().click();await gp.locator('[data-act="exc-request"]').click();
 await gp.locator('#erDate').fill('2099-10-01');await gp.locator('#erName').fill('Testreise');await gp.locator('#erPhone').fill('+49 000 000');await gp.locator('[data-act="exc-send"]').click();
 await expect.poll(async()=>(await api(gp,'requests')).requests.length).toBe(1);const r=(await api(gp,'requests')).requests[0];expect(r.offer).toBeNull();
 await sp.goto('./operations.html');await expect(sp.locator('#notice')).toBeEmpty();await expect(sp.getByText('demo-inhaber')).toBeVisible();
 await sp.getByLabel('Zugangstoken').fill('demo-inhaber');await sp.getByRole('button',{name:'Anmelden',exact:true}).click();await expect(sp.getByRole('heading',{name:'Reisen möglich machen.'})).toBeVisible();
 await sp.locator('[data-trip="'+r.id+'"]').first().click();await sp.getByRole('button',{name:'Übernehmen',exact:true}).click();await expect(sp.locator('#notice')).toContainText('übernommen');
 await sp.getByLabel('Verkaufspreis').fill('1250');await sp.getByLabel('Gültig bis').fill('2099-09-30');await sp.getByLabel('Kundenbeschreibung').fill('Private Reise mit Guide und Transfer');await sp.getByLabel('Interne Notiz').fill('Nur intern: Einkauf 850 EUR');await sp.getByRole('button',{name:'Angebot freigeben'}).click();await expect(sp.locator('#notice')).toContainText('Angebotsversion gespeichert');
 await boot(gp);await gp.locator('[data-go="trips"]').click();await gp.locator('[data-trip="'+r.id+'"]').click();await expect(gp.locator('#app')).toContainText('Private Reise mit Guide');await expect(gp.locator('#app')).not.toContainText('Einkauf');await gp.locator('[data-act="accept"]').click();
 await expect.poll(async()=>(await api(gp,'requests/'+r.id)).request.status).toBe('accepted');
 await sp.locator('[data-view="requests"]').click();await sp.locator('[data-trip="'+r.id+'"]').first().click();await sp.getByLabel('Zahlungsweg').selectOption('partner');await sp.getByLabel('Partnername / Empfänger und Zahlungsanweisung').fill('Testpartner – Überweisung');await sp.getByLabel('Zahlungsreferenz',{exact:true}).fill('PARTNER-TEST-1250');await sp.getByLabel('Zahlungsfrist').fill('2099-09-30');await sp.getByRole('button',{name:'Zahlung anfordern'}).click();await expect(sp.locator('#notice')).toContainText('Zahlungsanforderung gespeichert');
 sp.once('dialog',d=>d.accept('PARTNER-CONFIRMATION-TEST'));await sp.getByRole('button',{name:'Eingang verbuchen'}).click();await expect(sp.locator('#notice')).toContainText('Zahlungseingang verbucht');await sp.getByRole('button',{name:'Reise bestätigen',exact:true}).click();await expect(sp.locator('#notice')).toContainText('Reise bestätigt');
 await sp.locator('[data-view="calendar"]').click();await expect(sp.locator('#screen')).toContainText('Bestätigte Reise');
 await sp.locator('[data-view="tasks"]').click();await expect(sp.locator('#screen')).toContainText('Partnerbestätigung und Voucher prüfen');
 await sp.locator('[data-view="audit"]').click();await expect(sp.locator('#screen')).toContainText('Reiseänderung');
 await boot(gp);await gp.locator('[data-go="trips"]').click();await gp.locator('[data-trip="'+r.id+'"]').click();await expect.poll(async()=>(await api(gp,'requests/'+r.id)).request.status).toBe('confirmed');await expect(gp.locator('#app')).toContainText('bestätigt');
 // The database and both sessions survive a reload.
 await sp.reload();await expect(sp.getByRole('heading',{name:'Reisen möglich machen.'})).toBeVisible();
 // No bank credentials exist in the test build: payment must never start.
 expect((await gp.evaluate(async()=>(await fetch('./api/pay/ping')).json())).providers).toEqual({ziraat:false,vakif:false});
 expect(errors).toEqual([]);
 await ctx.close();
});
