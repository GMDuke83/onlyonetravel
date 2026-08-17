# ONLYONE Premium Final Pass — 2026-08-17

## Startseite
- Hero-Crossfade auf 1,8 s verlängert und Ken-Burns-Bewegung deutlich beruhigt.
- Hero behält den Zero-Gap-Fallback; kein leerer Frame zwischen Bildern.
- VIP-Assistent-Bereich luftiger und visuell stärker priorisiert.
- „ONLYONE in Bewegung“ auf echtes 9:16 umgestellt, alle drei Flow-Clips gleich groß.
- Poster→Video-Übergang blendet erst nach `loadeddata/playing` ein.
- Erlesene Angebote: 1 großes ONLYONE-CHOICE-Angebot + 4 kleinere Angebote.
- Featured Offer zeigt eine kurze Premium-Metazeile.
- VIP Transfer und Flug/Transfer nutzen dieselbe dunkle Material-/Goldsprache.
- Flug/Transfer-Karte ist echter Full-Bleed über die Displaybreite.
- Destinationen/Unterkünfte sind als Premium-Navigationskarten ausgearbeitet.
- Neuer finaler VIP-Assistent-CTA am Seitenende.
- Kapitelübergänge durch sehr feine Goldlinien und ruhige Farbverläufe vereinheitlicht.

## Navigation
- Bottom Navigation flacher und transparenter.
- Aktiver Tab bekommt einen kleinen Goldindikator statt starker Flächenfarbe.
- VIP-Assistent bleibt als mittlere Primary Action hervorgehoben.
- Sprachreihenfolge DE / EN / RU; automatische Browser-/Systemerkennung bleibt aktiv.

## Video / Performance
- Gruppenreise, Event und Pamukkale neu H.264 Main / yuv420p / faststart / ohne Audio codiert.
- Poster für die drei Flow-Videos auf WebP umgestellt.
- Hintergrundvideos werden bereits kurz vor dem Viewport geladen (IntersectionObserver rootMargin).
- Alle Website-Clips bleiben physisch ohne Audiospur.
- Nur `onlyone-hero-ocean-v4.mp4` enthält AAC für den Intro-Soundbutton.
- Intro bleibt autoplay-sicher stumm und kann per Nutzeraktion mit Originalton neu gestartet werden.

## QA
- JavaScript-Syntax mit `node --check` geprüft.
- Alle statischen `t('...')`-Keys gegen EN-Lokalisierung geprüft: keine fehlenden Keys.
- Video-Audiospuren geprüft: ausschließlich Intro enthält Audio.
