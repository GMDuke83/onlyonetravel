# Gelieferte Originaldateien

## Intro-Video (9. Oktober 2026)

Die vom Auftraggeber gelieferte Flow-Datei
`Adapting_video_to_landscape_format_20261009211455.mp4` ist die Vorlage für
`public/video/onlyone-hero-desktop-v1.mp4`: 8 Sekunden, 1920 × 1080, 24 fps.
Die Webfassung hat 6.442.978 Bytes statt 20.586.301 Bytes. Sie enthält keine
Tonspur; die Website steuert ihren vorhandenen Meeresklang separat.
Das Original bleibt beim Auftraggeber und wird nicht zusätzlich veröffentlicht.

Breite Ansichten laden die neue 16:9-Fassung, Hochformatansichten weiterhin
`onlyone-hero-terrace-v2.mp4`. Ein responsives Vorschaubild zeigt jeweils das
passende Motiv, solange noch kein Videobild verfügbar ist. Countdown,
Überspringen und Tonsteuerung bleiben erhalten.

Webfassung und erstes Vorschaubild aus der gelieferten Datei erzeugen:

```bash
ffmpeg -i Adapting_video_to_landscape_format_20261009211455.mp4 \
  -map 0:v:0 -an -c:v libx264 -preset slow -crf 22 \
  -maxrate 6M -bufsize 12M -profile:v high -level:v 4.1 -refs 4 \
  -pix_fmt yuv420p -movflags +faststart public/video/onlyone-hero-desktop-v1.mp4
ffmpeg -i public/video/onlyone-hero-desktop-v1.mp4 -frames:v 1 \
  -c:v libwebp -quality 90 public/images/onlyone-hero-desktop-poster-v1.webp
```

## Bildvorlagen

Die unbearbeiteten Vorlagen, aus denen die Bilder unter `public/images/`
erzeugt wurden. Sie liegen **ausserhalb** von `public/`, werden also nicht
mit ausgeliefert und kosten die Seite nichts — sie sind nur das Archiv, falls
neu zugeschnitten werden muss.

| Datei | Wird zu | Verwendung |
|---|---|---|
| `jet.png` | `public/images/3d/plane-top.webp` | Flugzeug im „Anreise"-Band |
| `concierge-reach.png` | `public/images/concierge/conc-reach.webp` | Banner „Immer erreichbar" |
| `concierge-tailor.png` | `public/images/concierge/conc-tailor.webp` | Banner „Massgeschneidert" |
| `concierge-there.png` | `public/images/concierge/conc-there.webp` | Banner „Vor Ort für dich" |

Neu erzeugen:

```bash
# Banner — 16:10, auf 1200x750 gefüllt und beschnitten
ffmpeg -i assets-source/concierge-reach.png \
       -vf "scale=1200:750:force_original_aspect_ratio=increase,crop=1200:750" \
       -quality 84 public/images/concierge/conc-reach.webp

# Jet — auf die Alpha-Bounding-Box beschnitten, 900 px breit, Alpha erhalten
ffmpeg -i assets-source/jet.png -vf "crop=1574:1943:130:63,scale=900:-1" \
       -c:v libwebp -quality 90 -compression_level 6 \
       public/images/3d/plane-top.webp
```
