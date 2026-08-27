# ONLYONE LUXURY TRAVEL

Mobile-first cinematic luxury travel experience.

Luxury editorial · cinematic travel experience · personal concierge.
Deliberately not a booking-portal look.

The cinematic intro is the entrance; behind it sits the booking platform —
hotel discovery, requests, individual offers, payment and a staff back office.

The public home experience is now structured as:

`Hero → travel worlds → Türkiye-wide destinations → VIP assistant → handpicked stays → selected experiences`

The four primary travel worlds are **Beach resorts, Villas, Group tours / themed
journeys, and Event management**. Each has its own editorial entry page instead
of being just another small filter tile. The home destination layer is Türkiye-
wide (Antalya, Bodrum, Fethiye & Ölüdeniz, Istanbul, Cappadocia, Çeşme & Alaçatı),
while the existing Antalya-area region data remains available inside the actual
accommodation search.

The initial UI language is detected from the visitor's device/browser language
for the currently supported languages (`ru`, `de`, `en`). A language explicitly
chosen in the menu is stored and takes precedence on later visits; unsupported
system languages fall back to English.

The current development phase targets **smartphones only**. Desktop comes later —
on a large screen the app is framed as a device rather than stretched.

---

## Status

| | |
|---|---|
| Repository | `GMDuke83/onlyonetravel` (public) |
| Branches | `main` (stable, deploys) · `develop` (development) |
| Stack | HTML · CSS · Vanilla JS — no framework, no build step |
| Public test URL | `https://gmduke83.github.io/onlyonetravel/` |
| Custom domain | intentionally **not** configured |

> The test site is published by GitHub Pages from `main`. If a deployment is
> rejected with *"not allowed to deploy to github-pages"*, check
> *Settings → Pages → Source* is set to **GitHub Actions** — see
> [Hosting](#hosting).

---

## Project structure

```
onlyonetravel/
│
├── public/                        ← this folder IS the website (publish root)
│   ├── index.html                 intro markup + platform mount point
│   ├── css/app.css                intro styles + platform styles
│   ├── js/app.js                  intro controller + platform application
│   ├── video/                     8 clips, every one of them silent
│   │   ├── onlyone-hero-terrace-v1.mp4 intro hero (silent)
│   │   ├── onlyone-yacht-tour-v2.mp4   yacht band, loaded on approach
│   │   ├── onlyone-vip-welcome-v3.mp4  VIP welcome, loaded on approach
│   │   └── …                           excursions, confirm, events, tours
│   ├── audio/                     the intro's sound, and nothing else's
│   ├── images/
│   │   ├── hero/                       3-image cinematic hero rotation
│   │   ├── worlds/  worlds-r13/        travel-world imagery
│   │   ├── destinations/               Türkiye-wide destination imagery
│   │   ├── hotels/                     hotel & Antalya-region imagery
│   │   ├── excursions/                 excursion imagery
│   │   ├── clouds/  3d/                sprites for the flying plane
│   │   ├── r18/ … r34/                 imagery added per release round
│   │   └── video-posters/              first frames, shown while a clip loads
│   ├── fonts/                     Inter + Great Vibes, latin and cyrillic
│   ├── icons/
│   ├── _headers                   Cloudflare Pages cache/mime rules
│   ├── version.json               build id; the page reloads itself on a change
│   └── manifest.webmanifest
│
├── scripts/stamp-build.js         writes the build id into public/ before a deploy
├── scripts/dev-server.js          zero-dependency local server (Range support)
├── scripts/render-clouds/         raymarches the cloud sprites offline
├── docs/project-notes.md          decisions, open points, asset provenance
├── assets-source/                 untouched originals behind some images
├── .github/workflows/             GitHub Pages + Cloudflare Pages deployment
├── vercel.json
├── package.json
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

The test site runs on **GitHub Pages**, published from `main` — see Option B.

Cloudflare and Vercel remain configured as alternatives; neither could be set up
from the environment this repository was built in, because
`api.cloudflare.com` and `api.vercel.com` are blocked by its network policy (the
proxy answers `403` to `CONNECT`).

### Option A — Cloudflare Pages (gives `*.pages.dev`)

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

### Option B — GitHub Pages *(in use)*

`.github/workflows/deploy-github-pages.yml` publishes `public/` directly.
GitHub Pages can otherwise only serve the repository root or `/docs`; the
workflow uploads `public/` as the Pages artifact, so nothing has to move.

1. The repository must be **public** — Pages on a private repo requires a paid
   GitHub plan.
2. *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.
3. Push to `main` (or run the workflow manually from the Actions tab).

Result: `https://gmduke83.github.io/onlyonetravel/`

**It deploys from `main`, not `develop`.** GitHub creates the `github-pages`
environment itself and by default only allows the repository's *default*
branch to deploy into it; a run on `develop` is rejected with
*"Branch `develop` is not allowed to deploy to github-pages due to environment
protection rules."*

To publish from `develop` instead — which matches the branch model above —
allow it once under *Settings → Environments → github-pages → Deployment
branches*, then change the trigger in the workflow to `develop`.

The app uses **document-relative paths**, so it works under that sub-path just
as well as at a domain root later — verified in-browser under `/onlyonetravel/`
with all assets loading and no console errors.

### Option C — Vercel

`vercel.json` is already configured (`outputDirectory: public`, cache headers).
Import the repository at <https://vercel.com/new>, set the production branch to
`develop`, and deploy. Result: `https://<project>.vercel.app`.

### After going live

Add the real URL to the [Status](#status) table above so the team always has one
place to look.

---

## The price rule

**A guest never sees a price before a member of staff has written an individual
offer for them.** This is the platform's central business rule, and it is
enforced structurally rather than cosmetically.

There are no prices in the hotel data at all. Not hidden with CSS, not sitting
in a field the interface skips — simply absent. Look at `PUBLIC_HOTELS` in
`public/js/app.js`: no hotel and no room carries a price key. A price only comes
into existence when staff types one into the offer form, and it is then attached
to that one request.

Opening DevTools reveals nothing, because there is nothing to reveal.

```
discover → request → staff writes an offer → guest sees the price
          └── no price anywhere in this stretch ──┘
```

The guest journey runs: discover a hotel → choose it → enter travel dates →
pick a room preference → send a non-binding request → staff prepares an
individual offer → guest accepts → staff creates a payment link (Ziraat Bank
*Linkle Ödeme*, simulated for now) → payment → booking confirmed.

A real backend mirrors the same split: `/api/public/hotels` returns no prices,
and `/api/staff/*` requires authentication and a role check. Only the payment
service layer has to be swapped to go live.

### Trying it

The staff area is reachable from the menu (☰ → *Staff login*); any name works.
Open a request, create an offer with a price, then switch back to the guest
side — the price appears only there, under *My trips*.

State lives in `localStorage`, so a reload keeps favourites, requests, offers
and payment status.

## Hero video

`public/video/onlyone-hero-ocean-v3.mp4`

| | |
|---|---|
| Format | MP4 · H.264 High@4.0 · **yuv420p** |
| Resolution | 720 × 1280 (portrait, mobile-native) |
| Duration | 8.0 s |
| Audio | none — silent by design |
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
  -an \
  -movflags +faststart \
  public/video/onlyone-hero-ocean-v3.mp4
```

`yuv420p` and `+faststart` are not optional — without them the video either
fails to decode on iOS or refuses to start until fully downloaded.

---

## Audio

All website videos are **silent by design**. The MP4 files used by the intro,
VIP welcome, yacht, excursions and confirmation flows carry no audio track,
so no browser can unexpectedly unmute them. The intro remains `muted` for
maximum autoplay compatibility on iOS and Android.

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

## Caching, and how a push reaches a visitor

### The headers, and where they actually apply

Set in `public/_headers` (Cloudflare), mirrored in `vercel.json` and the dev
server:

| Path | Cache-Control |
|---|---|
| `/`, `/index.html` | `no-cache, must-revalidate` |
| `/css/*`, `/js/*` | `no-cache, must-revalidate` |
| `/version.json` | `no-store` |
| `/video/*`, `/audio/*` | `public, max-age=31536000, immutable` |
| `/images/*`, `/icons/*` | `public, max-age=604800` |

**GitHub Pages honours none of it.** It ignores `_headers` and `vercel.json`
alike and serves every file with `max-age=600`, so on the live site a returning
browser answers out of its own cache for ten minutes without asking anything —
and a PWA opened from the Android home screen resumes the document it already
has, which can be very much older than that. The table above is the policy this
project wants and gets on Cloudflare, on Vercel and locally. It is not what the
test site does.

The video is safe to cache for a year **because its filename is versioned** — a
new cut means a new filename. For that reason the hero video and its audio carry
no `?v=`: a query that moved every deploy would re-download 1.1 MB over mobile
data each time, for a file that has not changed.

### What actually keeps the site fresh

One build id, in two places that must agree:

* `public/version.json` — what the server says the current build is
* `CURRENT_BUILD` in `public/index.html` — what the loaded page thinks it is

The page asks `version.json` for that id on load, on every return to the
foreground, and once a minute while someone is looking. That request is the only
one guaranteed to leave the device (unique query, `no-store`). When the answer
differs from the id in the document, the page reloads itself at
`?b=<build>` — a URL no cache holds an entry for, which is what pulls the new
stylesheet and script down with it.

Reloading is not always polite: the view lives in history state, not in the URL,
so a reload lands back on the intro. So it reloads outright when the page is
being opened or has just come back to the foreground, and while somebody is
reading it offers the reload as a tap instead, applying it the next time they
leave and return.

**Both ids are written by `scripts/stamp-build.js`, never by hand**, and both
deploy workflows run it before they upload. The id is derived from the commit,
so it moves whenever `public/` moves and cannot be forgotten:

```
npm run stamp          stamp public/ from HEAD
npm run stamp:check    fail if public/ is not stamped for HEAD
```

The value committed to git points at whichever commit it was last stamped from;
the deploy re-stamps at upload, so the deployed id always matches the deployed
commit. `stamp:check` reporting drift on a fresh commit is expected, not a fault.

This mattered: while the id was typed by hand it went eleven commits without
moving — one of them removed a quarter of the stylesheet — and every browser
that had been to the site kept the old CSS and the old script until its storage
was cleared by hand.

### Why there is no service worker

A service worker is the usual answer to "make a PWA update itself", and it is
the wrong one here. It adds a cache the page controls badly, and the classic
symptom of getting it wrong is precisely the one this section exists to remove:
an app that will not let go of an old build. Polling one small JSON file gets
the same result with nothing to get wrong, and the site has no offline
requirement that would pay for the rest.

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

Two worlds, on purpose. The intro is one cinematic moment and keeps the deep
navy it was built around. Everything behind it — the platform you actually
browse in — is ivory, and carries **no blue at all**: browsing two dozen houses
in navy read cold and heavy, so every dark tone there is warm brown-black
rather than blue-black.

### Platform (ivory)

| Token | Value | Contrast on `--ground` | |
|---|---|---|---|
| `--ground` | `#F7F3ED` | — | page, ivory |
| `--ground-2` | `#FFFFFF` | — | raised |
| `--ground-3` | `#EFE8DC` | — | image placeholder |
| `--txt` | `#2A2119` | 14.3:1 | warm espresso ink |
| `--txt-2` | `#6B5B49` | 5.9:1 | body copy |
| `--txt-3` | `#7A6957` | 4.6:1 | labels, counts |
| `--dark` | `#2A2119` | — | filled buttons, chips, bubbles |
| `--gold-ink` | `#7F611B` | 5.2:1 | gold as text |
| `--gold` | `#D8B45C` | 1.8:1 | decoration only — never small text |

Contrast is measured, not eyeballed. The brand gold reaches only 1.8:1 on
ivory, so it is limited to rules, borders and anything over a photograph;
`--gold-ink` is the version that may carry words.

### Intro (unchanged)

| Token | Value | |
|---|---|---|
| `--navy` | `#08293C` | dark blue |
| `--navy-deep` | `#041B29` | deep navy |
| `--gold` | `#D8B45C` | champagne gold |
| `--gold-light` | `#F0D787` | light gold |

### Type

**Inter Variable**, self-hosted in `public/fonts/` — latin, latin-ext (the
Turkish `ş ğ ı` in place names) and cyrillic, each behind its own
`unicode-range`, so a German visitor never downloads the Russian cut. It is
self-hosted rather than linked from Google's CDN: a hotlink sends every
visitor's IP to a third party before the first headline paints, which is a
real problem for a German operator.

**Great Vibes**, also self-hosted, is the script face — the intro's *Journey*
and its closing line. It replaced a stack that began with "Snell Roundhand", an
Apple-only system font, which meant those words silently rendered as Georgia on
Android, i.e. not a script at all. One 43 KB latin file makes them identical on
every phone.

The rest of the intro keeps its old type: Georgia for the display line, the
system UI stack for the small tracked labels.

### Wordmark

The mark is the original one: concentric gold rings drawn in CSS
(`.brandMark` / `.appbar__mark`, no image at any size) with the ONLYONE
wordmark beside it. A script lockup was tried and reverted; it is one `git
revert` away in the history if it is ever wanted back.

The `LUXURY TRAVEL` subline takes `--gold-ink` on the ivory bar and the light
gold only inside the intro, over its photograph — the decorative gold measures
1.8:1 on ivory and is unreadable at 7.5px.

Headings need the opposite treatment to the serif they replaced: more weight
(600) and negative tracking that grows with size, or a grotesk reads loose and
thin at display sizes.

### Rules

No loud app colours. **No emoji icons** — every icon is an inline SVG line
icon. The intro carries no bottom navigation; the tab bar exists only on the
main experience. Text sitting on a photograph must set its colour explicitly
(see the `TEXT OVER IMAGERY` block in `app.css`) — inheriting the ground's ink
is what once turned the platform headline navy-on-daylight.

### Scroll animation

Two effects, both driven by position rather than by a timer, so they follow the
finger instead of running past it.

**Reveal.** Content rises 18px into place as it enters the screen
(`.reveal` / `armReveals()`). It replaced a `.fade-up` that animated every card
the moment a view rendered — most of which played to nobody, below the fold.
One `IntersectionObserver` per view; each element is released once and then
unobserved, so the callback stays cheap on a long page. The stagger is per
group, not per page, or a list near the bottom would inherit a two-second delay
from everything above it.

What is watched is not always what is revealed: a rail scrolls sideways, so
cards past its right edge never cross the vertical viewport — measured, seven
stayed invisible for the entire page. Rails are therefore watched as a unit and
release their cards together.

**Parallax.** Banner photographs drift 13px against their frames
(`--s`, -1 entering to +1 leaving), computed in the same rAF pass as the
aircraft and the car rather than in a second scroll listener. The `scale(1.09)`
is what buys the travel — without it the drift would expose the edges of the
crop.

Both are opacity and transform only, so the compositor carries them. Every
revealed element ends at `transform:none`, not a zero translate: a lingering
transform would make it a containing block and capture the fixed tab bar, which
is a bug this project has already had once. Under
`prefers-reduced-motion: reduce` nothing is hidden, nothing drifts, and no
scroll listener is registered at all.

### Background video loops

The three background clips are crossfade-looped: the last 1.6 s is dissolved
over the first, so the wrap point is a dissolve rather than a cut. Measured at
the seam, PSNR between the last and first frame went from **13.2 dB** (a hard,
visible jump) to **32.4 dB**. They are also slowed to 0.8×, which is as far as
24 fps source goes before duplicated frames start to judder.

Rebuild one with:

```bash
ffmpeg -y -i in.mp4 -filter_complex "\
[0:v]setpts=1.25*PTS,fps=24[s];[s]split=3[a][b][c];\
[a]trim=0:1.6,setpts=PTS-STARTPTS[head];\
[b]trim=1.6:8.4,setpts=PTS-STARTPTS[body];\
[c]trim=8.4:10,setpts=PTS-STARTPTS[tail];\
[tail][head]blend=all_expr='A*(1-T/1.6)+B*(T/1.6)'[mix];\
[mix][body]concat=n=2:v=1[v]" -map "[v]" -an \
  -c:v libx264 -profile:v high -pix_fmt yuv420p -crf 24 -preset slow \
  -movflags +faststart out.mp4
```

The intro video is deliberately left alone — it plays once and the countdown is
keyed to 3 s of playback, so retiming it would move the countdown.
