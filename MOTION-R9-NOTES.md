# ONLYONE motion update r9

- Hero Ken-Burns motion strengthened slightly (roughly 1.8% -> 8.6-8.8% scale during each 9.6 s slide animation).
- Added subtle transform-only movement to visible editorial still images on the homepage, including travel-world and excursion cards.
- Added the same quiet movement to destination, experience, curated-offer, VIP deck and concierge stills so the page feels more alive.
- IntersectionObserver starts animation only near the viewport and pauses it when off-screen to protect iOS performance.
- `prefers-reduced-motion` disables all new image motion.
- Internal asset revision bumped to `20260817-1924-motion5-r9`; the public user-facing URL remains unchanged.

Validation:
- `node --check public/js/app.js` passed.
- CSS brace balance passed.
- Living-image observer and render hook present.
- Home travel-world and excursion motion selectors present.
- Hero r9 motion keyframes present.
- HTML asset revision points to r9 and contains no r8 asset reference.
