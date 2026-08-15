# ONLYONE — Project notes

Working notes: what was decided, why, and what is still open.
Kept short on purpose.

---

## 1. What came from the prototype

The starting point was `onlyone_iphone_ocean_stops_on_page_change.html`
(5.2 MB, single file). What was kept, and what was deliberately changed:

| Prototype | Now | Why |
|---|---|---|
| Video as a 4.3 MB Base64 string → `Blob` → `objectURL` | Real `.mp4` file at `/video/…` | A Base64 blob cannot be cached, cannot be range-requested, and blocks first paint. It also inflated the HTML ~50×. |
| Ocean sound synthesised with Web Audio (brown noise + LFO) | The video's own AAC track | The prototype's video was silent, so surf had to be faked. The current hero has real ocean audio, so the simulation was removed. |
| Card imagery: one 215 KB Base64 WebP, re-cropped via `background-position` | Real per-card WebP files | Cacheable, smaller in total, and each card can get real photography later without touching CSS. |
| Emoji icons (`☰`, `☎`, `▶`) | Inline SVG line icons | Design rule: no emoji. |
| `.app { height: 100vh }` | `100svh` | `100vh` on iOS includes retracting browser chrome → hero taller than the screen. |
| Hero + next section in one scroll container | Two explicit views (`#intro`, `#main`) | "Leaving the intro" has to be an exact moment so the ocean can be stopped precisely. A scroll position is fuzzy; a view switch is not. |
| Countdown inside the fading end-card, opacity juggled inline | Countdown is its own element; end title separate | The countdown had to survive the end-card's fade without inline style hacks. |

The look, copy, colours, countdown idea and overall sequence are the
prototype's — those were kept.

---

## 2. The hero video

Two source files were supplied:

| Source | Resolution | Audio |
|---|---|---|
| embedded in the prototype HTML | 720×1280 portrait | **none** |
| `Generated_Video_…6_12PM.mp4` | 1280×720 landscape | AAC, real ocean |

Same scene, same 8.00 s, same generation — one rendered portrait, one landscape.

Neither was usable alone: the portrait cut is the right framing for a phone but
silent; the landscape cut has the sound but would lose ~74 % of its width to
`object-fit: cover` on a 9:19.5 screen.

**Shipped:** portrait video stream + landscape audio track, muxed into one file
and re-encoded (H.264 High, yuv420p, CRF 25, `+faststart`, AAC 112 k).
2.2 MB, verified `moov` before `mdat`.

The page-two banner (`onlyone-marina-v1.mp4`) was letterboxed inside a portrait
frame; it was cropped to its real content area (720×900, offset y=190) and
encoded **with `-an`** — its supplied audio track was digital silence (−91 dB)
and page two must be silent anyway.

---

## 3. Placeholder assets — needs real photography

Every image in `public/images/` is a **frame from the hero video**, cropped and
lightly graded to differentiate the cards. The camera pushes in over the 8 s, so
the compositions genuinely differ — but it is all one villa.

That means **Antalya, Bodrum, Istanbul and Cappadocia currently show the same
location.** This is fine for a layout test and wrong for anything shown to a
client.

Replace with real photography, keeping the filenames:

```
destination-antalya.webp     400×560
destination-bodrum.webp      400×560
destination-istanbul.webp    400×560
destination-cappadocia.webp  400×560
stay-villas.webp             320×448
stay-boutique.webp           320×448
stay-residences.webp         320×448
feature-yachts.webp          640×400
feature-experiences.webp     640×400
feature-concierge.webp       640×400
```

---

## 4. Content status per section

| Section | State |
|---|---|
| Exclusive Destinations | 4 cards, placeholder imagery, no detail pages |
| Private Stays | 3 cards, placeholder imagery, no detail pages |
| VIP Services | 3 items, copy is a first draft |
| Yachts | one feature card |
| Experiences | one feature card |
| Concierge | one feature card |
| My Journey | shell only — no account, no persistence |

Taps on placeholder items show a small toast instead of navigating. Structure is
in place so sections can be filled without re-laying-out the page.

---

## 5. Verified

Driven in a real browser (Chromium, mobile emulation) at 390×844, 393×852 and
430×932:

* hero height === viewport height exactly (844 / 852 / 932)
* no horizontal scroll on either view
* video autoplays muted, decodes 720×1280
* countdown shows 3 · 2 · 1 with **0.00 px drift** horizontally and vertically
* countdown centred to the pixel
* end title appears, then auto-transitions
* on leaving the intro: video paused, muted, `currentTime === 0`
* page-two banner plays, muted, looping — and pauses when returning to the intro
* returning to the intro resets countdown to `3`, clears the end title, restarts
  playback from `0:00`
* first tap unmutes and replays from the start; toggle re-mutes
* no console errors, no failed requests

HTTP behaviour verified against the dev server: `200` on all assets,
`Content-Type: video/mp4`, and `206 Partial Content` with a correct
`Content-Range` for range requests.

### Test-environment caveat

The Chromium build available here has **no H.264/AAC decoder**
(`canPlayType('video/mp4; codecs="avc1.640028"')` returns `""`). To exercise the
sequence logic in a real browser, a temporary VP9/WebM copy of the same cut was
served and the `<source>` swapped at runtime. Those temp files were deleted and
are not in the repository.

So: **the MP4 was verified by inspection** (ffprobe: H.264 High, yuv420p, AAC,
faststart, correct duration) and **the app logic was verified by execution**.
Playback of the H.264 file itself still needs a real-device check on iPhone
Safari and Android Chrome.

---

## 6. Open points

1. **Public test URL** — no hosting project could be created from this
   environment (Cloudflare/Vercel APIs network-blocked; no `admin` permission
   for GitHub Pages). See README → Hosting for the exact remaining step.
2. **Real photography** — see §3.
3. **Script webfont for Android** — "Journey" falls back to Georgia there.
   A subsetted script font (only the glyphs in "Journey" / "Begins Now" /
   "Awaits", ~3–4 KB WOFF2) would fix it. Google Fonts was unreachable from
   this environment, so it could not be added now.
4. **Real device pass** — iPhone Safari and Android Chrome, per §5's caveat.
5. **Desktop** — currently the phone layout in a centred device frame. A real
   desktop design is a later phase.
6. **`main` is currently identical to `develop`.** Once the test environment is
   live, `main` should only receive reviewed merges.
