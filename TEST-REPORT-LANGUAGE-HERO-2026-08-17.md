# Test report — language + light hero animation

Build: `20260817-1924-motion5-r5`

- PASS — JS syntax
- PASS — Shared language resolver exactly once
- PASS — Intro uses shared resolver
- PASS — Main UI uses shared device resolver
- PASS — Manual selection persists
- PASS — Supported languages DE/EN/RU
- PASS — Hero subtle drift enabled
- PASS — Hero reverse drift on second image
- PASS — Reduced motion final override
- PASS — Internal build r5 (20260817-1924-motion5-r5)
- PASS — CSS cache revision r5
- PASS — JS cache revision r5
- PASS — Fixed public start URL unchanged (./?v=20260817-1924-motion5)
- PASS — Motion order preserved (yacht -> pamukkale -> events -> groups -> welcome)
- PASS — Excursion order preserved
- PASS — Static local asset references exist

Language unit cases:
- de-DE → de
- en-US → en
- ru-RU → ru
- tr-TR → en fallback
- saved RU overrides DE device language
- saved DE overrides EN device language

Public opening URL remains: `https://gmduke83.github.io/onlyonetravel/?v=20260817-1924-motion5`
