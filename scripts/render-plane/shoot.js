/* Renders the aircraft still used by the "arrival" band on the home screen.
 *
 * Not part of the site build — run it only to change the paint or the angle.
 * It needs two packages that the site itself does not:
 *
 *     npm i three playwright
 *     node scripts/render-plane/shoot.js
 *
 * Output: public/images/3d/plane-top.webp (via an intermediate PNG).
 *
 * Rendering happens in a headless Chromium with SwiftShader rather than in a
 * 3D application, so the result is reproducible on any machine with node and
 * no extra software. See docs/3d-flugzeug.md for the reasoning.
 *
 * The model's baseColor texture is deliberately NOT shipped: the material is
 * replaced with the brand's champagne metal in page.html, so the texture would
 * be 4 MB of donor airline livery that never reaches a pixel. GLTFLoader logs a
 * 404 for it, which is expected and harmless.
 */
const path=require('path'), fs=require('fs'), http=require('http');
const HERE=__dirname;
const REPO=path.resolve(HERE,'..','..');
const { chromium }=require(path.join(REPO,'node_modules','playwright'));

const W=1400, H=2400;
const MIME={'.html':'text/html','.js':'text/javascript','.gltf':'model/gltf+json','.bin':'application/octet-stream','.png':'image/png'};
const roots={
  '/three/addons/': path.join(REPO,'node_modules','three','examples','jsm')+path.sep,
  '/three/':        path.join(REPO,'node_modules','three','build')+path.sep,
  '/model/':        path.join(HERE,'model')+path.sep,
  '/':              HERE+path.sep,
};

const srv=http.createServer((req,res)=>{
  const u=decodeURIComponent(req.url.split('?')[0]);
  let file=null;
  for(const p of Object.keys(roots).sort((a,b)=>b.length-a.length)){
    if(u.startsWith(p)){ file=path.join(roots[p], u.slice(p.length)||'page.html'); break; }
  }
  if(!file||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);return res.end('no '+u);}
  res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
}).listen(4180);

(async()=>{
  const b=await chromium.launch({
    args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']
  });
  const p=await (await b.newContext({viewport:{width:W,height:H},deviceScaleFactor:1})).newPage();
  await p.goto(`http://localhost:4180/page.html?w=${W}&h=${H}&yaw=0`,{waitUntil:'load'});
  console.log('WebGL:',await p.evaluate(()=>{
    const c=document.createElement('canvas');const g=c.getContext('webgl2')||c.getContext('webgl');
    return g?g.getParameter(g.VERSION):'NO WEBGL';
  }));
  await p.waitForFunction('window.__ready===true',{timeout:120000});
  const err=await p.evaluate(()=>window.__error||null);
  if(err){console.error('LOAD ERROR:',err);await b.close();srv.close();process.exit(1);}

  /* Crop to the alpha bounding box: transparent margin is bytes the phone
     downloads for no pixels. */
  const box=await p.evaluate(()=>{
    const c=document.querySelector('canvas');
    const g=document.createElement('canvas');g.width=c.width;g.height=c.height;
    const x=g.getContext('2d');x.drawImage(c,0,0);
    const d=x.getImageData(0,0,c.width,c.height).data;
    let x0=c.width,y0=c.height,x1=-1,y1=-1;
    for(let y=0;y<c.height;y++)for(let X=0;X<c.width;X++){
      if(d[(y*c.width+X)*4+3]>8){if(X<x0)x0=X;if(X>x1)x1=X;if(y<y0)y0=y;if(y>y1)y1=y;}
    }
    return {x:x0,y:y0,width:x1-x0+1,height:y1-y0+1};
  });
  console.log('alpha bbox:',box);

  const out=path.join(HERE,'plane-top.png');
  await (await p.$('canvas')).screenshot({path:out, omitBackground:true, clip:box});
  await b.close(); srv.close();

  console.log('\nwrote '+out+'\nnow encode it:\n' +
    '  ffmpeg -y -i '+out+' -vf "scale=900:-1" -c:v libwebp -quality 88 \\\n' +
    '         public/images/3d/plane-top.webp');
})();
