# ONLYONE — iOS & Performance Test Report

Build: `20260817-1924-motion5-r4`
Public launch URL remains unchanged:
`https://gmduke83.github.io/onlyonetravel/?v=20260817-1924-motion5`

## Fixes

- Removed the three main-page hero image preloads from the initial HTML so the intro video has network priority on iOS.
- Added buffered prewarming: main hero/category images start warming only after the intro video is substantially buffered.
- Added a lightweight iOS countdown mode to avoid expensive animated SVG filters over hardware-decoded video.
- Added a playback guard during countdown ticks so a paused intro is immediately nudged back into muted inline playback.
- Replaced dynamic `<source>` insertion for background/motion videos with direct `video.src` loading.
- Added iOS-safe video properties (`muted`, `defaultMuted`, `playsInline`) before every playback attempt.
- Added generous prefetch distance plus vertical/horizontal visibility checks.
- Added scroll listeners for the horizontal motion rail and a direct `touchstart` playback fallback for iOS configurations that reject muted autoplay.
- Homepage images are requested earlier after hand-over instead of waiting for Safari native lazy-loading thresholds.
- Kept the external/public version query unchanged; only the internal asset revision changed to `r4`.

## Media optimisation

- Image payload: ~5.99 MB -> ~4.49 MB.
- Video payload: ~8.89 MB -> ~5.92 MB.
- Motion clips: 540x960, H.264 Main, yuv420p, 24 fps, faststart, no audio.
- Intro: 720x1280, H.264 Main, yuv420p, 24 fps, faststart, no embedded audio.
- Intro ocean sound remains in `public/audio/onlyone-hero-ocean-v1.m4a`.

## Tests executed

PASS — `node --check public/js/app.js`
PASS — `node --check scripts/dev-server.js`
PASS — all 81 image files decoded successfully.
PASS — all 8 MP4 files fully decoded with FFmpeg without errors.
PASS — all MP4 video streams are H.264/yuv420p.
PASS — all MP4 files have the `moov` atom before `mdat` (faststart).
PASS — all website MP4 files contain no audio stream.
PASS — static media reference scan found no missing files.
PASS — local HTTP byte-range test returned `206 Partial Content` for intro MP4.
PASS — local HTTP byte-range test returned `206 Partial Content` for intro M4A.
PASS — excursion order: Cappadocia before Pamukkale.
PASS — motion order includes Yacht first and VIP Welcome.
PASS — iOS direct-src loader, touch fallback and intro rolling guard are present.
PASS — HTML and `version.json` both use internal build `20260817-1924-motion5-r4`.

Note: an actual iPhone Safari runtime cannot be emulated faithfully in this container. The build was therefore tested for Safari-relevant media encoding, byte-range streaming, loading logic and JavaScript correctness; final physical-device verification should be done after GitHub Pages deployment.
