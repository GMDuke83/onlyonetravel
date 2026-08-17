# ONLYONE — r7 white-page regression fix

- Fixed platform scope error: `LANGUAGE_STATE_KEY is not defined`.
- Intro and platform now share `window.ONLYONE_LANGUAGE` explicitly across their separate IIFEs.
- Platform uses `LANGUAGE.STATE_KEY`, `LANGUAGE.SUPPORTED`, and `LANGUAGE.device()`.
- Added a safe fallback resolver so the platform can still boot if the shared service is unavailable.
- Fixed intro accessibility transition: focus is moved out of the intro before `aria-hidden=true`.
- Cache revision bumped from `r6` to `r7` in HTML/manifest/media/script references.
- `node --check public/js/app.js` passes.
- Static local asset references pass.
- Hero motion CSS remains active at 9.6 seconds per active slide.
