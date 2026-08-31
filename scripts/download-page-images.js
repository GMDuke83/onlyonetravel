#!/usr/bin/env node
'use strict';
/* ============================================================================
   download-page-images.js — alle Bilder einer Webseite einsammeln

   Gedacht zum Sichten von Yacht-Fotografie: eine Detailseite angeben, alle
   dort referenzierten Bilder landen als Originaldateien in einem Ordner.
   Was davon verwendet wird — und ob die Rechte dafür vorliegen — entscheidet
   der Mensch, nicht dieses Skript.

   Aufruf (Node 18+, keine Abhängigkeiten):

     node scripts/download-page-images.js <seiten-url> [Optionen]

   Optionen:
     --out <ordner>    Zielordner (Standard: yacht-images)
     --min-kb <n>      kleinere Dateien verwerfen (Standard: 25 — filtert
                       Icons und Thumbnails weg; 0 = alles behalten)
     --list            nur die gefundenen Bild-URLs auflisten, nichts laden
     --all             auch SVG/GIF und Logo-/Icon-Pfade mitnehmen
     --base <url>      Basis-URL, wenn statt einer URL eine lokal
                       gespeicherte HTML-Datei übergeben wird

   Beispiele:
     node scripts/download-page-images.js https://example.com/yacht --out fotos
     node scripts/download-page-images.js gespeicherte-seite.html --base https://example.com

   Warum die lokale Datei: Manche Seiten liefern Bots kein vollständiges HTML.
   Dann die Seite im Browser öffnen und mit Strg+S ("Webseite, komplett" ist
   nicht nötig — "Nur HTML" genügt) speichern; die abgespeicherte Datei trägt
   dieselben Bild-URLs, und dieses Skript liest sie daraus.

   Was eingesammelt wird:
     · <img src> und das größte Kandidatenbild aus jedem srcset
     · <source srcset>, <video poster>, <link rel="preload" as="image">
     · og:image / twitter:image
     · nackte Bild-URLs in eingebetteten Skripten und JSON-Blobs
       (auch mit \/-escapten Schrägstrichen, wie Next.js sie ausliefert)
     · Next.js-Optimizer-URLs (/_next/image?url=…) werden zur Originaldatei
       entpackt statt die verkleinerte Kopie zu laden
   ============================================================================ */

const fs   = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (!args.length || args.includes('--help') || args.includes('-h')) {
  console.log(fs.readFileSync(__filename, 'utf8').split('====\n')[1].split('\n   ====')[0]
    .replace(/^ {3}/gm, ''));
  process.exit(args.length ? 0 : 1);
}

const opt  = (name, def) => { const i = args.indexOf(name); return i > -1 && args[i + 1] != null ? args[i + 1] : def; };
const flag = n => args.includes(n);

const SRC     = args[0];
const OUT     = path.resolve(opt('--out', 'yacht-images'));
const MIN_KB  = Number(opt('--min-kb', '25')) || 0;
const BASE    = opt('--base', '');
const ALL     = flag('--all');
const LIST    = flag('--list');
const DELAY   = 250;   // ms zwischen Downloads — kein Grund, unhöflich zu sein

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
           '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const sleep = ms => new Promise(r => setTimeout(r, ms));

/* --- URLs aus dem HTML ziehen -------------------------------------------- */

function largestFromSrcset(srcset) {
  // "a.jpg 640w, b.jpg 1280w" → b.jpg   ·   "a.jpg 1x, b.jpg 2x" → b.jpg
  let best = null, bestW = -1;
  for (const part of srcset.split(',')) {
    const bits = part.trim().split(/\s+/);
    if (!bits[0]) continue;
    const w = bits[1] ? parseFloat(bits[1]) || 0 : 0;
    if (w >= bestW) { bestW = w; best = bits[0]; }
  }
  return best;
}

function unwrapNextImage(u) {
  // /_next/image?url=<encoded>&w=3840&q=75 → das Original dahinter
  try {
    const x = new URL(u);
    if (x.pathname.endsWith('/_next/image') && x.searchParams.get('url')) {
      return new URL(decodeURIComponent(x.searchParams.get('url')), x.origin).href;
    }
  } catch (e) {}
  return u;
}

function extractImageUrls(html, baseUrl) {
  const found = new Set();
  const push = raw => {
    if (!raw) return;
    const u = raw.trim().replace(/&amp;/g, '&');
    if (!u || u.startsWith('data:')) return;
    try { found.add(new URL(u, baseUrl).href.split('#')[0]); } catch (e) {}
  };

  for (const m of html.matchAll(/<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/gi))   push(m[1]);
  for (const m of html.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/gi))            push(largestFromSrcset(m[1]));
  for (const m of html.matchAll(/<video\b[^>]*?\bposter\s*=\s*["']([^"']+)["']/gi)) push(m[1]);
  for (const m of html.matchAll(/<link\b[^>]+>/gi)) {
    const tag = m[0];
    if (/rel\s*=\s*["']preload["']/i.test(tag) && /as\s*=\s*["']image["']/i.test(tag)) {
      const h = tag.match(/href\s*=\s*["']([^"']+)["']/i);
      if (h) push(h[1]);
    }
  }
  for (const m of html.matchAll(/<meta\b[^>]*?(?:property|name)\s*=\s*["'](?:og:image|twitter:image)[^"']*?["'][^>]*?content\s*=\s*["']([^"']+)["']/gi)) push(m[1]);

  // nackte Bild-URLs — einmal roh, einmal mit \/ → / für JSON-Blobs
  const bare = /https?:\/\/[^\s"'<>\\)]+?\.(?:jpe?g|png|webp|avif|gif)(?:\?[^\s"'<>)]*)?/gi;
  for (const m of html.matchAll(bare)) push(m[0]);
  for (const m of html.replace(/\\\//g, '/').matchAll(bare)) push(m[0]);

  let urls = [...found].map(unwrapNextImage);
  urls = [...new Set(urls)].filter(u => /^https?:\/\//.test(u));
  if (!ALL) {
    urls = urls.filter(u => !/\.(svg|gif)(\?|$)/i.test(u));
    urls = urls.filter(u => !/(favicon|sprite|logo|icon|flag|placeholder|avatar|pixel)/i.test(u));
  }
  return urls;
}

/* --- Dateinamen ----------------------------------------------------------- */

const taken = new Set();
function nameFor(u, contentType) {
  let base = 'image';
  try { base = path.basename(new URL(u).pathname) || 'image'; } catch (e) {}
  base = base.replace(/[<>:"|?*\\]/g, '_');
  if (!/\.[a-z0-9]{2,5}$/i.test(base)) {
    const sub = (contentType || '').split('/')[1];
    base += sub ? '.' + sub.split(';')[0].replace('jpeg', 'jpg') : '.img';
  }
  let name = base, n = 2;
  while (taken.has(name)) {
    const dot = base.lastIndexOf('.');
    name = base.slice(0, dot) + '-' + n++ + base.slice(dot);
  }
  taken.add(name);
  return name;
}

/* --- Hauptlauf ------------------------------------------------------------ */

async function main() {
  let html, baseUrl;

  if (fs.existsSync(SRC)) {
    html = fs.readFileSync(SRC, 'utf8');
    baseUrl = BASE || 'https://localhost/';
    if (!BASE) console.log('Hinweis: lokale Datei ohne --base — relative Bildpfade werden übersprungen.');
  } else {
    baseUrl = SRC;
    console.log('Lade Seite:', SRC);
    const res = await fetch(SRC, { headers: { 'user-agent': UA, accept: 'text/html,*/*' }, redirect: 'follow' });
    if (!res.ok) throw new Error('Seite antwortet mit HTTP ' + res.status);
    html = await res.text();
  }

  const urls = extractImageUrls(html, baseUrl);
  console.log(urls.length + ' Bild-URL(s) gefunden.');
  if (!urls.length) return;

  if (LIST) { urls.forEach(u => console.log('  ' + u)); return; }

  fs.mkdirSync(OUT, { recursive: true });
  let saved = 0, small = 0, failed = 0;

  for (const u of urls) {
    try {
      const res = await fetch(u, { headers: { 'user-agent': UA, accept: 'image/*,*/*' }, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      if (MIN_KB && buf.length < MIN_KB * 1024) {
        small++;
        console.log('  · übersprungen (' + Math.round(buf.length / 1024) + ' KB): ' + u);
      } else {
        const name = nameFor(u, res.headers.get('content-type'));
        fs.writeFileSync(path.join(OUT, name), buf);
        saved++;
        console.log('  ✓ ' + name + ' (' + Math.round(buf.length / 1024) + ' KB)');
      }
    } catch (e) {
      failed++;
      console.log('  ✗ ' + u + ' — ' + e.message);
    }
    await sleep(DELAY);
  }

  console.log('\nFertig: ' + saved + ' gespeichert, ' + small + ' zu klein, ' + failed + ' fehlgeschlagen.');
  console.log('Ordner: ' + OUT);
}

main().catch(e => { console.error('Fehler:', e.message); process.exit(1); });
