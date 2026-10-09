const {test,expect}=require('@playwright/test');

for(const view of [
  {name:'desktop',width:1440,height:900,video:'onlyone-hero-desktop-v1.mp4',poster:'onlyone-hero-desktop-poster-v1.webp',videoWidth:1920,videoHeight:1080},
  {name:'portrait phone',width:390,height:844,video:'onlyone-hero-terrace-v2.mp4',poster:'onlyone-hero-poster-v4.webp',videoWidth:720,videoHeight:1280},
  {name:'landscape phone',width:844,height:390,video:'onlyone-hero-desktop-v1.mp4',poster:'onlyone-hero-desktop-poster-v1.webp',videoWidth:1920,videoHeight:1080},
]){
  test(`intro plays the matching video and poster on ${view.name}`,async({page})=>{
    await page.setViewportSize({width:view.width,height:view.height});
    const videos=new Set(),posters=new Set(),errors=[];
    page.on('request',r=>{
      const file=new URL(r.url()).pathname.split('/').pop();
      if(file.endsWith('.mp4'))videos.add(file);
      if(file.includes('hero-')&&file.includes('poster'))posters.add(file);
    });
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('./');
    const video=page.locator('#heroVideo');
    await expect.poll(()=>video.evaluate(v=>v.videoWidth)).toBe(view.videoWidth);
    expect(await video.evaluate(v=>v.videoHeight)).toBe(view.videoHeight);
    expect(await video.evaluate(v=>v.currentSrc)).toContain(view.video);
    await expect.poll(()=>video.evaluate(v=>v.currentTime)).toBeGreaterThan(0);
    expect(await video.evaluate(v=>v.muted)).toBe(true);
    const poster=page.locator('.intro__poster img');
    expect(await poster.evaluate(img=>img.currentSrc)).toContain(view.poster);
    await expect.poll(()=>poster.evaluate(img=>img.naturalWidth)).toBeGreaterThan(0);
    expect([...videos]).toEqual([view.video]);
    expect([...posters]).toEqual([view.poster]);
    // Desktop also exercises the full countdown and automatic hand-over.
    if(view.name!=='desktop')await page.locator('#skipIntro').click();
    await expect(page.locator('#main')).toHaveAttribute('aria-hidden','false');
    await expect(page.locator('#intro')).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('intro keeps a landscape poster and an exit when video cannot load',async({page})=>{
  await page.setViewportSize({width:1440,height:900});
  await page.route('**/*.mp4',route=>route.abort());
  await page.goto('./');
  const poster=page.locator('.intro__poster img');
  await expect.poll(()=>poster.evaluate(img=>img.naturalWidth)).toBe(1920);
  await expect(poster).toBeVisible();
  expect(await page.locator('#heroVideo').evaluate(v=>getComputedStyle(v).backgroundColor)).toBe('rgba(0, 0, 0, 0)');
  await page.locator('#skipIntro').click();
  await expect(page.locator('#main')).toHaveAttribute('aria-hidden','false');
  await expect(page.locator('#intro')).toBeHidden();
});
