# Gelieferte Originaldateien

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
