# ONLYONE LUXURY TRAVEL

Mobile-first cinematic luxury travel experience.

Luxury editorial · cinematic travel experience · personal concierge.
Deliberately not a booking-portal look.

The current development phase targets **smartphones only**. Desktop comes later —
on a large screen the app is framed as a device rather than stretched.

---

## Status

| | |
|---|---|
| Repository | `GMDuke83/onlyonetravel` (private) |
| Branches | `main` (stable) · `develop` (test/development) |
| Stack | HTML · CSS · Vanilla JS — no framework, no build step |
| Public test URL | **not live yet** — see [Hosting](#hosting) |
| Custom domain | intentionally **not** configured |

> The public test URL is still missing because no hosting project could be
> created from this environment. Everything needed to connect one is already in
> the repository — see [Hosting](#hosting) for the exact remaining step.

---

## Project structure

```
onlyonetravel/
│
├── public/                        ← this folder IS the website (publish root)
│   ├── index.html
│   ├── css/
│   │   └── app.css
│   ├── js/
│   │   └── app.js
│   ├── video/
│   │   ├── onlyone-hero-ocean-v1.mp4   intro hero — with ocean audio
│   │   └── onlyone-marina-v1.mp4       page-two banner — silent by design
│   ├── images/                     posters + card imagery (WebP)
│   ├── icons/                      favicon.svg, apple-touch-icon.png
│   ├── _headers                    Cloudflare Pages cache/mime rules
│   └── manifest.webmanifest
│
├── scripts/
│   └── dev-server.js               zero-dependency local server (Range support)
│
├── docs/
│   └── project-notes.md            decisions, open points, asset provenance
│
├── .github/workflows/
│   └── deploy-cloudflare-pages.yml automatic deployment (needs 2 secrets)
│
├── vercel.json                     config if Vercel is chosen instead
├── package.json
├── .gitignore
└── README.md
```

There is deliberately **no `src/` → `dist/` build step**. `public/` is served
as-is, which is the simplest thing that works on every static host and keeps
the app fast and maintainable.

---

## Local development

Requires Node 18+. No dependencies to install.

```bash
npm run dev
```

Then open <http://localhost:4173>.

To test on a real phone on the same Wi-Fi, open `http://<your-computer-ip>:4173`.

The dev server (`scripts/dev-server.js`) is intentionally tiny but does the two
things that actually matter for this project:

1. serves the correct `Content-Type` (`video/mp4` for the hero), and
2. answers **HTTP Range requests** — Safari refuses to stream video without them.

It also mirrors the production cache headers, so local behaviour matches the
deployed site.

---

## Branches & Git workflow

```
main       stable version
develop    current test and development environment
```

Work happens on `develop`. It is the branch wired to the public test
environment: every push to `develop` redeploys the test site.

```bash
git checkout develop
# ... work ...
git add -A
git commit -m "Describe the change"
git push -u origin develop
```

`main` is prepared for a later production environment but does not need a
production domain yet.

---

## Hosting

**Current state: no hosting project exists yet.**

It could not be created from the environment this repository was set up in:

* `api.cloudflare.com` and `api.vercel.com` are blocked by the network policy
  (the proxy answers `403` to `CONNECT`), so no Pages/Vercel project could be
  created via API.
* GitHub Pages could not be enabled either — the available token has no `admin`
  permission on the repository (and Pages on a *private* repo additionally
  requires a paid GitHub plan).

### Option A — Cloudflare Pages (recommended, gives `*.pages.dev`)

Fastest path, entirely in the dashboard, no CLI needed:

1. Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** →
   **Connect to Git**.
2. Select `GMDuke83/onlyonetravel`.
3. Settings:
   * **Production branch:** `develop`
   * **Framework preset:** *None*
   * **Build command:** *(leave empty)*
   * **Build output directory:** `public`
4. Save and deploy.

Result: `https://onlyone-luxury-travel.pages.dev` (the exact subdomain depends
on the project name you choose). Every push to `develop` redeploys
automatically. `public/_headers` is picked up by Cloudflare with no extra work.

<details>
<summary>Alternative: deploy from CI instead of the Git integration</summary>

`.github/workflows/deploy-cloudflare-pages.yml` is already in the repository.
It stays inactive until these two repository secrets exist:

* `CLOUDFLARE_API_TOKEN` — token with the **Cloudflare Pages: Edit** permission
* `CLOUDFLARE_ACCOUNT_ID` — from the Cloudflare dashboard URL

Add them under *Settings → Secrets and variables → Actions*, then push to
`develop`.
</details>

### Option B — Vercel

`vercel.json` is already configured (`outputDirectory: public`, cache headers).
Import the repository at <https://vercel.com/new>, set the production branch to
`develop`, and deploy. Result: `https://<project>.vercel.app`.

### After going live

Add the real URL to the [Status](#status) table above so the team always has one
place to look.

---

## Hero video

`public/video/onlyone-hero-ocean-v1.mp4`

| | |
|---|---|
| Format | MP4 · H.264 High@4.0 · **yuv420p** |
| Resolution | 720 × 1280 (portrait, mobile-native) |
| Duration | 8.0 s |
| Audio | AAC-LC 44.1 kHz stereo — the real ocean sound |
| `faststart` | yes (`moov` before `mdat`) |
| Size | ~2.2 MB |

**The video is a real file. It is never embedded as Base64 or loaded as a
Blob.** The earlier prototype inlined a ~4.3 MB Base64 string into the HTML,
which made the page 5.2 MB and uncacheable; that is gone.

The filename carries its version (`-v1`). To publish a new cut, ship it as
`-v2` and update the `<source>`. Never overwrite an existing filename — the
video is served with a one-year immutable cache, and versioning is what makes
that safe.

`public/video/onlyone-marina-v1.mp4` is the page-two banner. It was encoded
**without an audio track at all**, so it physically cannot make sound.

### Re-encoding

If you replace the hero, encode it like this:

```bash
ffmpeg -i input.mp4 \
  -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p \
  -crf 25 -preset slower \
  -c:a aac -b:a 112k -ar 44100 -ac 2 \
  -movflags +faststart \
  public/video/onlyone-hero-ocean-v2.mp4
```

`yuv420p` and `+faststart` are not optional — without them the video either
fails to decode on iOS or refuses to start until fully downloaded.

---

## Audio

The ocean is the **video's own audio track**. There is no synthesised
Web Audio noise anywhere in the app (the prototype simulated surf with a
filtered noise buffer because its video was silent — that code is removed).

Browsers only allow unmuted playback after a user gesture, so:

1. **On load** — the hero autoplays `muted` (as required by every mobile browser).
2. **First tap anywhere on the hero** — audio unlocks, and the intro replays
   from `0:00` so the sequence is experienced with the ocean from the start.
3. The sound button (top right) toggles it afterwards.

### Sound stops when the intro is left

Leaving the intro always does three things, in this order: **pause → mute →
rewind to 0**. The ocean can never bleed into page two. Page two's own banner
video has no audio track, so it is silent regardless.

### Returning to the intro

The circular-arrow button in the main header replays the intro. It resets the
video to `0:00`, the countdown back to `3`, and clears the end title. If sound
was unlocked before, it comes back — that return is itself a user gesture, so
the browser allows it.

---

## Intro sequence

```
video starts (muted autoplay)
   │
   ├─ at 3.0 s of playback
   │     3 · 2 · 1          (1 s each, driven by real playback position)
   │
   ├─ "Your Journey Begins Now"
   │
   └─ ~1.8 s hold → soft fade to the main experience
```

The countdown is driven by the video's `currentTime`, not a wall clock, so it
stays in sync even if playback stalls on a slow connection.

### Why the countdown never jumps

Position and animation live on **two different elements**:

* `.countdown` owns `left:50%` + `translateX(-50%)` and is **never animated**.
* `.countdown__value` / `.countdown__ringProgress` own the scale and sweep.

That makes it structurally impossible for a keyframe to drop the `-50%`
centering — the classic cause of a countdown sliding sideways on each digit.
The digits also use `font-variant-numeric: tabular-nums` inside a fixed 78 px
box, so `3`, `2` and `1` occupy identical space.

Verified in-browser at 390×844, 393×852 and 430×932: **0.00 px drift** on both
axes across all three digits.

---

## iPhone / Safari specifics

* `playsinline` **and** `webkit-playsinline` — without these iOS hijacks the
  video into its native fullscreen player and the whole intro is lost.
* `muted` must be present as an **HTML attribute**, not only set from JS,
  or iOS refuses to autoplay.
* `viewport-fit=cover` plus `env(safe-area-inset-*)` keeps content clear of the
  Dynamic Island, the notch and the home indicator.
* `100svh` (small viewport height) is used instead of `100vh`. `100vh` on iOS
  includes the retracting browser chrome, which makes the hero taller than the
  screen and cuts the countdown off.
* `-webkit-text-fill-color:transparent` is required alongside `background-clip`
  for the gold gradient on "Journey".
* The script face for "Journey" resolves to **Snell Roundhand**, an iOS system
  font — no webfont download.

## Android / Chrome specifics

* `disableremoteplayback` suppresses the Cast button overlay on the hero.
* `x5-playsinline` covers the X5/TBS engine used by some Chinese Android
  browsers, which otherwise forces its own player.
* Android has no system script font, so "Journey" falls back to Georgia. It
  still reads as distinct through the gold gradient, larger size and its own
  line. Shipping a subsetted script webfont is the planned follow-up (see
  `docs/project-notes.md`).
* Chrome honours `autoplay` + `muted` + `playsinline` the same way iOS does; the
  same unlock-on-tap flow applies.

---

## Caching

Set in `public/_headers` (Cloudflare) and mirrored in `vercel.json` and the dev
server:

| Path | Cache-Control |
|---|---|
| `/`, `/index.html` | `no-cache, must-revalidate` |
| `/css/*`, `/js/*` | `no-cache, must-revalidate` |
| `/video/*` | `public, max-age=31536000, immutable` |
| `/images/*`, `/icons/*` | `public, max-age=604800` |

HTML and code revalidate on every load, so during development you never chase a
stale page. The video is safe to cache for a year **because its filename is
versioned** — a new cut means a new filename.

---

## Later: custom domain

Nothing needs to change in the code. The app uses root-relative paths
(`/video/…`, `/css/…`), so it works under any hostname.

When a domain is ready: add it in the hosting dashboard as a custom domain,
point the DNS record it gives you, and the certificate is issued automatically.
No DNS records and no domain have been created at this stage — that is
intentional.

---

## Design system

| Token | Value | |
|---|---|---|
| `--navy` | `#08293C` | dark blue |
| `--navy-deep` | `#041B29` | deep navy |
| `--gold` | `#D8B45C` | champagne gold |
| `--gold-light` | `#F0D787` | light gold |

Plus white, turquoise and Mediterranean blue.

Rules: no loud app colours. **No emoji icons** — every icon is an inline SVG
line icon. The intro carries no bottom navigation; the tab bar exists only on
the main experience.
