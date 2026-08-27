#!/usr/bin/env node
/* ==========================================================================
   ONLYONE LUXURY TRAVEL — local dev server
   Zero dependencies. Serves ./public with the two things that actually
   matter for this project:

     1. correct Content-Type  (video/mp4 for the hero)
     2. HTTP Range requests   (Safari refuses to stream video without them)

   Usage:  npm run dev        →  http://localhost:4173
           PORT=8080 npm run dev
   ========================================================================== */

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || 4173;
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.mp4': 'video/mp4',
  '.m4a': 'audio/mp4',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

function cacheControl(ext, pathname) {
  // Mirrors public/_headers. Note that the live site is on GitHub Pages,
  // which honours neither that file nor vercel.json and serves everything
  // with max-age=600 — so this is the *intended* policy, not the deployed
  // one. What actually keeps the deployed site fresh is the build id in
  // version.json; see scripts/stamp-build.js.
  if (pathname === '/version.json') return 'no-store';
  if (pathname.startsWith('/video/')) return 'public, max-age=31536000, immutable';
  if (pathname.startsWith('/images/') || pathname.startsWith('/icons/')) return 'public, max-age=604800';
  return 'no-cache, must-revalidate';
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (err) {
    res.writeHead(400).end('Bad Request');
    return;
  }

  if (pathname.endsWith('/')) pathname += 'index.html';

  // Resolve inside ROOT only — no path traversal.
  const filePath = path.join(ROOT, path.normalize(pathname));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h1>404</h1><p>Not found: ' + pathname + '</p>');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': type,
      'Cache-Control': cacheControl(ext, pathname),
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff'
    };

    const range = req.headers.range;

    // --- partial content (Safari video streaming) ---
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (m) {
        let start = m[1] === '' ? null : parseInt(m[1], 10);
        let end = m[2] === '' ? null : parseInt(m[2], 10);

        if (start === null && end !== null) {
          // suffix range: last N bytes
          start = Math.max(0, stat.size - end);
          end = stat.size - 1;
        } else {
          if (start === null) start = 0;
          if (end === null || end >= stat.size) end = stat.size - 1;
        }

        if (start > end || start >= stat.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
          res.end();
          return;
        }

        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        if (req.method === 'HEAD') return res.end();
        fs.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, HOST, () => {
  console.log('');
  console.log('  ONLYONE LUXURY TRAVEL — dev server');
  console.log('  ----------------------------------');
  console.log(`  local:    http://localhost:${PORT}`);
  console.log(`  serving:  ${ROOT}`);
  console.log('');
  console.log('  Test on a phone: open http://<your-computer-ip>:' + PORT);
  console.log('');
});
