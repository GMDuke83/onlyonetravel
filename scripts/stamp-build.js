#!/usr/bin/env node
/* ==========================================================================
   ONLYONE LUXURY TRAVEL — build stamp

   Writes one build id into every place that has to agree on it:

     public/version.json   the id the running page polls for
     public/index.html     CURRENT_BUILD, and the ?v= on the stylesheet,
                           the script and the manifest

   Why this exists
   ---------------
   The page reloads itself when version.json reports a build it does not
   recognise. That only works if the id actually moves when the files do, and
   while it was typed by hand it did not: eleven commits landed on top of
   `20260818-customer-home-r43` — one of them removed a quarter of the
   stylesheet — without the id changing once. Every browser that had been to
   the site kept the old CSS and the old script, and the only way out was to
   clear the site's storage by hand.

   So it is not typed by hand any more. Both deploy workflows run this before
   they upload, and the id comes from the commit being deployed.

   The id is derived from the commit, not from the clock, so running this
   twice on the same commit produces the same files — which is what makes
   --check meaningful and keeps re-runs from churning the diff.

   Usage
   -----
     node scripts/stamp-build.js            stamp from HEAD (or $GITHUB_SHA)
     node scripts/stamp-build.js --check    exit 1 if the files are stale
     node scripts/stamp-build.js --id=<id>  stamp an explicit id
   ========================================================================== */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'public', 'index.html');
const VERSION = path.join(ROOT, 'public', 'version.json');

const argv = process.argv.slice(2);
const CHECK = argv.includes('--check');
const EXPLICIT = (argv.find((a) => a.startsWith('--id=')) || '').slice(5);

/* --------------------------------------------------------------------------
   the id
   -------------------------------------------------------------------------- */

function git(cmd) {
  try {
    return execSync('git ' + cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch (e) {
    return '';
  }
}

function stamp(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return stamp(new Date().toISOString());
  const p = (n) => String(n).padStart(2, '0');
  return (
    d.getUTCFullYear() +
    p(d.getUTCMonth() + 1) +
    p(d.getUTCDate()) +
    '-' +
    p(d.getUTCHours()) +
    p(d.getUTCMinutes())
  );
}

function identity() {
  if (EXPLICIT) return { build: EXPLICIT, commit: git('rev-parse HEAD') || '', iso: new Date().toISOString() };

  // In CI the checkout is shallow but the commit itself is there, so both of
  // these answer. GITHUB_SHA is the fallback for a checkout with no .git.
  const sha = git('rev-parse HEAD') || process.env.GITHUB_SHA || '';
  const iso = git('log -1 --format=%cI') || new Date().toISOString();
  const short = sha ? sha.slice(0, 7) : 'nogit';
  return { build: stamp(iso) + '-' + short, commit: sha, iso };
}

/* --------------------------------------------------------------------------
   the two files
   -------------------------------------------------------------------------- */

/* Only the stylesheet, the script and the manifest carry the id. The hero
   video and its audio deliberately do not: their version sits in the
   filename (…-v4.mp4), they are served with a one-year immutable cache, and
   a query that moved on every deploy made every deploy re-download 1.1 MB of
   video over mobile data for no reason at all. */
const ASSET_QUERY = /((?:\.\/(?:css|js)\/[^"'?\s]+|\.\/manifest\.webmanifest)\?v=)[^"'\s]*/g;
const BUILD_CONST = /(var CURRENT_BUILD\s*=\s*")[^"]*(")/;

function renderIndex(src, id) {
  let out = src;
  let hits = 0;

  out = out.replace(BUILD_CONST, (m, a, b) => {
    hits++;
    return a + id.build + b;
  });
  out = out.replace(ASSET_QUERY, (m, a) => {
    hits++;
    return a + id.build;
  });

  if (!hits) throw new Error('public/index.html carries no build id — nothing was stamped');
  if (!BUILD_CONST.test(out)) throw new Error('CURRENT_BUILD is missing from public/index.html');
  return out;
}

function renderVersion(src, id) {
  let json;
  try {
    json = JSON.parse(src);
  } catch (e) {
    throw new Error('public/version.json is not valid JSON: ' + e.message);
  }
  // version and label are the human release name (R43 / r43-mobile) and stay
  // whatever a person last called this round. Only the machine-read fields move.
  json.build = id.build;
  json.date = id.iso.slice(0, 10);
  json.commit = id.commit;
  return JSON.stringify(json, null, 2) + '\n';
}

/* --------------------------------------------------------------------------
   run
   -------------------------------------------------------------------------- */

function main() {
  const id = identity();

  const indexSrc = fs.readFileSync(INDEX, 'utf8');
  const versionSrc = fs.readFileSync(VERSION, 'utf8');

  const indexOut = renderIndex(indexSrc, id);
  const versionOut = renderVersion(versionSrc, id);

  const stale = indexOut !== indexSrc || versionOut !== versionSrc;

  if (CHECK) {
    if (stale) {
      console.error('stamp-build: public/ is not stamped for ' + id.build);
      console.error('             run `npm run stamp` (the deploy does this on its own)');
      process.exit(1);
    }
    console.log('stamp-build: up to date — ' + id.build);
    return;
  }

  if (!stale) {
    console.log('stamp-build: already ' + id.build + ' — nothing to write');
    return;
  }

  fs.writeFileSync(INDEX, indexOut);
  fs.writeFileSync(VERSION, versionOut);
  console.log('stamp-build: ' + id.build);
  console.log('             public/index.html   CURRENT_BUILD + ?v= on css, js, manifest');
  console.log('             public/version.json build, date, commit');
}

try {
  main();
} catch (err) {
  console.error('stamp-build: ' + err.message);
  process.exit(1);
}
