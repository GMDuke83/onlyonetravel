const {test,expect}=require('@playwright/test');
const base='http://localhost:8791';
const key='local-test-only-staff-key-12345678901234567890';
async function api(ctx,path,method='GET',data){const r=await ctx.request.fetch(base+'/api/v1/'+path,{method,headers:{Origin:base},...(data?{data}:{})});expect(r.ok(),await r.text()).toBeTruthy();return r.json();}

test('workspace finds contacts, filters offers and keeps pending requests out of bookings',async({browser})=>{
 const ctx=await browser.newContext({locale:'de-DE',viewport:{width:1440,height:900}});
 await api(ctx,'session','POST',{staffKey:key});
 const record={id:'r'+Date.now()+'workspace',contact:{first:'Workspace',last:'Testkunde',phone:'+49 000 888',email:'workspace@example.test'},from:'2099-11-01',to:'2099-11-04'};
 const {request:r}=await api(ctx,'requests','POST',{request:record});
 const page=await ctx.newPage();await page.goto('/operations.html');
 await page.locator('nav [data-view="customers"]').click();await page.getByLabel('Suche',{exact:true}).fill('workspace@example.test');
 await expect(page.locator('#workspaceResults')).toContainText('Workspace Testkunde');
 await page.getByLabel('Suche',{exact:true}).fill('does-not-exist-anywhere');await expect(page.getByRole('heading',{name:'Keine passenden Vorgänge'})).toBeVisible();
 await page.getByRole('button',{name:'Zurücksetzen',exact:true}).click();await page.locator('[data-trip="'+r.id+'"]').click();
 await page.getByRole('button',{name:'Übernehmen',exact:true}).click();await expect(page.locator('#notice')).toContainText('übernommen');
 await page.getByLabel('Verkaufspreis').fill('900');await page.getByLabel('Gültig bis').fill('2099-10-30');await page.getByLabel('Kundenbeschreibung').fill('Testangebot mit privatem Transfer');
 await page.getByRole('button',{name:'Angebot freigeben'}).click();await expect(page.locator('#notice')).toContainText('Angebotsversion gespeichert');
 await page.locator('nav [data-view="quotes"]').click();await page.getByLabel('Suche',{exact:true}).fill(record.contact.email);await page.getByLabel('Status',{exact:true}).selectOption('offer');
 await expect(page.locator('[data-trip="'+r.id+'"]')).toBeVisible();
 await page.locator('nav [data-view="bookings"]').click();await page.getByLabel('Suche',{exact:true}).fill(record.contact.email);await expect(page.locator('#workspaceResults')).toContainText('Keine passenden Vorgänge');
 await page.setViewportSize({width:390,height:844});await page.locator('nav [data-view="requests"]').click();await page.getByLabel('Suche',{exact:true}).fill(record.contact.email);
 await expect(page.locator('[data-trip="'+r.id+'"]')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBeTruthy();
 await ctx.close();
});

test('hero chooses desktop art without sending it to the mobile slideshow and supports pause',async({browser})=>{
 for(const width of [390,1440]){
  const ctx=await browser.newContext({locale:'de-DE',viewport:{width,height:900},reducedMotion:'reduce'}),page=await ctx.newPage();
  await page.goto('/');await page.waitForFunction(()=>!!window.ONLYONE?.boot);
  await page.evaluate(async()=>{await window.ONLYONE.boot();document.getElementById('intro')?.remove();document.getElementById('main').classList.add('is-active','is-instant');document.getElementById('main').setAttribute('aria-hidden','false');});
  const hero=page.locator('.pHero__img').first();await expect.poll(()=>hero.evaluate(i=>i.complete&&i.naturalWidth>0)).toBeTruthy();
  expect(await hero.evaluate(i=>i.currentSrc)).toContain(width>=700?'/editorial-2026/':'/hero/');
  const control=page.locator('[data-act="hero-motion"]');await expect(control).toHaveAttribute('aria-pressed','true');
  await control.click();await expect(control).toHaveAttribute('aria-pressed','false');await control.click();await expect(control).toHaveAttribute('aria-pressed','true');
  await ctx.close();
 }
});
