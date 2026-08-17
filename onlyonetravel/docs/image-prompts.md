# Bildmaterial — Spezifikation und Generierungs-Prompts

**Stand:** 23 echte Bilder sind eingebaut. Alle sieben Regionen, alle fünf
Ausflüge und zwölf von vierzehn Hotelmotiven sind erledigt.

**Noch Platzhalter:** nur `h13` und `h14` — Standbilder aus den Videos.

Diese Datei listet jeden Bildplatz mit Dateiname, Format und einem
fertigen Prompt — als Referenz für den ganzen Bildbestand.

> **Zum Weitergeben an ChatGPT:** `docs/chatgpt-bildauftrag.md`. Dort stehen
> nur die 12 noch fehlenden Bilder, jeder Prompt vollständig und einzeln
> einfügbar (Stil und Verbote sind schon eingebaut).

---

## So gehst du vor

1. **Was du hast, direkt hochladen.** Datei auf den passenden Namen bringen und
   nach `public/images/hotels/` legen — der bestehende Platzhalter wird
   überschrieben. Am Code ändert sich nichts.
2. **Was fehlt, generieren.** Prompt unten kopieren, Bild erzeugen, mit dem
   Zieldateinamen speichern.
3. **Optimieren** (siehe [Konvertierung](#konvertierung)) — die Zieldateien sind
   WebP und sollten unter ~60 KB liegen.

Format und Seitenverhältnis sind bindend. Weicht ein Bild ab, greift
`object-fit: cover` und beschneidet mittig — bei Hochformat in einem
Querformat-Platz geht dann viel Motiv verloren.

---

## Gemeinsamer Stilblock

An **jeden** Prompt anhängen. Er hält den Satz optisch zusammen und hält
fern, was nicht ins Bild gehört:

```text
Style: premium editorial travel photography, Mediterranean summer light,
turquoise sea and deep blue water, warm limestone and white architecture,
lush green planting, crisp natural daylight, shot on a full-frame camera,
35mm or 50mm lens, f/5.6, rich but natural colour, no HDR look,
no oversaturation.

Strictly: no text, no lettering, no captions, no watermark, no logo,
no user interface, no app screenshot, no frames or borders, no collage,
no recognisable faces, no people in the foreground.
Pure photographic subject only.
```

Warum die Verbote: Punkt 28 des Briefings verlangt reine Fotomotive — keine
eingebrannte UI, keine Screenshots. Generatoren setzen sonst gern Schrift oder
Interface-Elemente ins Bild.

---

## A · Regionen — 7 Bilder

**Hochformat 3:4 · 480 × 640 px** · Datei: `region-<id>.webp`

Diese Bilder sind das Einzige, was eine Region wiedererkennbar macht. Hier
lohnt ein echtes Wahrzeichen statt eines beliebigen Strandes.

| Datei | Region | Status |
|---|---|---|
| `region-antalya.webp` | Antalya Stadt | ✅ echtes Foto |
| `region-konyaalti.webp` | Konyaaltı | ✅ echtes Foto |
| `region-lara.webp` | Lara | ✅ echtes Foto |
| `region-belek.webp` | Belek | ✅ echtes Foto |
| `region-kemer.webp` | Kemer | ✅ echtes Foto |
| `region-side.webp` | Side | ✅ echtes Foto |
| `region-alanya.webp` | Alanya | ✅ echtes Foto |

### region-antalya.webp
```text
Vertical 3:4 portrait photograph of the old harbour of Kaleici, the historic
old town of Antalya, Turkey. Ottoman-era stone and timber houses stacked up
the cliff above a small marina with wooden boats, terracotta rooftops,
a minaret rising behind them, the Mediterranean opening to the right.
Late afternoon sun, long warm shadows.
```

### region-konyaalti.webp
```text
Vertical 3:4 portrait photograph of Konyaalti beach in Antalya, Turkey.
A wide pebble beach with clear turquoise shallows in the foreground and the
steep Beydaglari mountains rising directly behind the shoreline, pine trees
along the promenade. Bright midday summer light, deep blue sky.
```

### region-lara.webp
```text
Vertical 3:4 portrait photograph of Lara beach in Antalya, Turkey.
A broad golden sand beach curving into the distance, calm turquoise water,
neat rows of white sun loungers and cream parasols, large modern resort
buildings softly out of focus far behind. Early evening golden light.
```

### region-belek.webp
```text
Vertical 3:4 portrait photograph of a championship golf course in Belek,
Turkey. Immaculate green fairway framed by tall umbrella pine trees,
a bunker of pale sand, sprinklers catching the light, the Taurus mountains
hazy on the horizon. Soft early morning light, dew on the grass.
```

### region-kemer.webp
```text
Vertical 3:4 portrait photograph of the coast at Kemer, Turkey.
The forested Taurus mountains dropping steeply straight into a deep blue
bay, a narrow pebble cove at their foot, pine trees clinging to the rock,
crystal clear water shading from turquoise to navy. Clear summer day.
```

### region-side.webp
```text
Vertical 3:4 portrait photograph of the ancient Temple of Apollo at Side,
Turkey. Weathered white marble columns standing on the shoreline against
the Mediterranean, warm low sun behind them, calm sea and soft pastel sky.
Golden hour, long shadows across old stone.
```

### region-alanya.webp
```text
Vertical 3:4 portrait photograph of Alanya, Turkey. The Seljuk castle and
its fortress walls on the rocky headland above the sea, the red brick
octagonal Kizil Kule tower and the harbour below, turquoise bay curving
away. Late afternoon sun on the stone.
```

---

## B · Hotelbilder — 14 Bilder

**Querformat 16:10 · 640 × 400 px** · Datei: `h01.webp` … `h14.webp`

Ein gemeinsamer Pool: die 24 Demo-Hotels ziehen sich daraus je zwei bis drei
Bilder für Karte und Galerie. Deshalb sind die Motive **generisch**
(Resort, Villa, Boutique, Spa …) und nicht auf ein bestimmtes Hotel getauft.

Sobald echte Hotelfotos vorliegen, ist der saubere Weg: pro Hotel eigene
Dateien, und in `public/js/app.js` beim jeweiligen Hotel die Liste `imgs`
umstellen. Bis dahin trägt der Pool.

| Datei | Motiv | Status |
|---|---|---|
| `h01.webp` | Luxusvilla am Meer, Infinity-Pool | ✅ echtes Foto |
| `h02.webp` | Moderne Villa am Pool, Abendlicht | ✅ echtes Foto |
| `h03.webp` | Küste mit Kieselstrand und Bergen | ✅ echtes Foto |
| `h04.webp` | Golfplatz und Clubhaus | ✅ echtes Foto |
| `h05.webp` | Sandstrand mit Sonnenschirmen | ✅ echtes Foto |
| `h06.webp` | Familienpool mit Kinderbereich | ✅ echtes Foto |
| `h07.webp` | Küste aus der Luft, Resort am Hang | ✅ echtes Foto |
| `h08.webp` | Lounge-Interieur mit Meerblick | ✅ echtes Foto |
| `h09.webp` | Yachthafen, weißes Dorf | ✅ echtes Foto |
| `h10.webp` | Marina vor Bergen | ✅ echtes Foto |
| `h11.webp` | Villa mit Pool über der Bucht | ✅ echtes Foto |
| `h12.webp` | Aquapark mit Rutschen | ✅ echtes Foto |
| `h13.webp` | Antike Ruine am Strand | ⬜ Platzhalter |
| `h14.webp` | Boutique-Terrasse über der Bucht | ⬜ Platzhalter |

### h01.webp
```text
Horizontal 16:10 photograph of a luxury Mediterranean beachfront resort.
A long infinity pool in the foreground meeting the turquoise sea on the
horizon, pale limestone terrace, mature palm trees, low white architecture
with deep shaded loggias to one side. Bright summer afternoon.
```

### h02.webp
```text
Horizontal 16:10 photograph of a resort pool terrace at dusk. Still water
reflecting warm lamplight, cream sun loungers with folded towels, tall palms
lit from below, a modern low-rise hotel wing glowing behind, deep blue
evening sky. Calm, empty, elegant.
```

### h03.webp
```text
Horizontal 16:10 photograph of a Mediterranean pebble beach. Clear turquoise
shallows over pale stones in the foreground, steep pine-covered mountains
rising directly behind the shoreline, a curved promenade with palms.
Bright clear midday light.
```

### h04.webp
```text
Horizontal 16:10 photograph of a golf course in a Mediterranean pine forest.
Manicured green fairway sweeping to the left, pale sand bunker, umbrella
pines framing the view, a low stone clubhouse with a shaded terrace in the
middle distance. Soft morning light.
```

### h05.webp
```text
Horizontal 16:10 photograph of a golden sand beach at a luxury resort.
Neat rows of white sun loungers under cream parasols, calm turquoise sea,
a wooden pier reaching out to the right. Warm late afternoon light,
long soft shadows on the sand.
```

### h06.webp
```text
Horizontal 16:10 photograph of a family pool area at a Mediterranean resort.
A shallow curved pool with a gentle water feature, bright parasols, green
lawn and palms around it, a low white building with balconies behind.
Cheerful bright daylight, no people.
```

### h07.webp
```text
Horizontal 16:10 aerial photograph of a large resort set in umbrella pine
forest beside the sea. Low white buildings among dense green pines, several
pools, a sandy beach and the turquoise Mediterranean along the top of the
frame, mountains hazy in the distance. Clear summer day.
```

### h08.webp
```text
Horizontal 16:10 photograph of a luxury hotel spa interior. A still indoor
pool reflecting soft warm light, travertine stone walls, timber loungers
with white linen, arched openings letting in daylight, hammam-inspired
detailing. Calm, warm, quiet, no people.
```

### h09.webp
```text
Horizontal 16:10 photograph of a Mediterranean yacht marina. White motor
yachts moored along a stone quay, clear turquoise water, an old town of
terracotta rooftops and a minaret rising on the cliff behind.
Warm late afternoon light.
```

### h10.webp
```text
Horizontal 16:10 photograph of a turquoise Mediterranean bay with an ancient
stone castle on the rocky headland above it. A crescent of sand beach below,
palms along the shore, whitewashed buildings climbing the hillside.
Bright clear afternoon light.
```

### h11.webp
```text
Horizontal 16:10 photograph of a private luxury villa above the sea.
A small private pool on a stone terrace in the foreground, bougainvillea in
deep pink over a white wall, olive and cypress trees, the deep blue bay and
mountains beyond. Warm afternoon light.
```

### h12.webp
```text
Horizontal 16:10 photograph of a resort aquapark. Bright blue and white water
slides curving down into a large pool, palms and green planting around it,
clean modern shapes, the sea just visible behind. Vivid summer daylight,
no people.
```

### h13.webp
```text
Horizontal 16:10 photograph of ancient Roman ruins beside a Mediterranean
beach. Weathered white marble columns and fallen stone blocks on golden sand,
turquoise sea behind, a few pines to one side. Warm golden hour light,
long shadows.
```

### h14.webp
```text
Horizontal 16:10 photograph of a boutique hotel roof terrace overlooking a
Mediterranean bay. Timber deck with low rattan seating and cream cushions,
potted olive trees and lanterns, an infinity edge, the sea and distant
mountains beyond. Early evening, warm low sun.
```

---

## C · Ausflüge — 5 Bilder · **vollständig**

**Querformat 16:10 · 640 × 400 px** · Ordner `public/images/excursions/`

| Datei | Ziel | Status |
|---|---|---|
| `exc-pamukkale.webp` | Pamukkale & Hierapolis | ✅ |
| `exc-cappadocia.webp` | Kappadokien | ✅ |
| `exc-ephesus.webp` | Ephesos | ✅ |
| `exc-oludeniz.webp` | Ölüdeniz — Blaue Lagune | ✅ |
| `exc-istanbul.webp` | Istanbul | ✅ |

Kommt ein weiterer Ausflug dazu, Bild ablegen und in `public/js/app.js` einen
Eintrag im Array `EXCURSIONS` ergänzen (`id`, `img`, `dur`, `n`, `d` in RU/DE/EN).

Prompt-Vorlage für weitere Ziele:

```text
Horizontal 16:10 photograph of <ZIEL>, Turkey. <Was genau im Bild zu sehen
sein soll — Wahrzeichen, Landschaft, Tageszeit.> Wide establishing view,
no people in the foreground.
```

---

## Konvertierung

Nach dem Generieren auf Zielgröße bringen und als WebP speichern:

```bash
# Region (Hochformat 3:4)
ffmpeg -i quelle.png -vf "scale=480:640:force_original_aspect_ratio=increase,crop=480:640" \
  -quality 80 public/images/hotels/region-kemer.webp

# Hotel (Querformat 16:10)
ffmpeg -i quelle.png -vf "scale=640:400:force_original_aspect_ratio=increase,crop=640:400" \
  -quality 80 public/images/hotels/h01.webp
```

`force_original_aspect_ratio=increase` gefolgt von `crop` skaliert zuerst so,
dass der Rahmen sicher gefüllt ist, und schneidet dann mittig zu — damit
entstehen keine Ränder, egal welches Seitenverhältnis der Generator liefert.

Richtwert: 25–60 KB je Bild. Deutlich darüber → `-quality 70` versuchen.

---

## Nach dem Austausch prüfen

```bash
npm run dev
```

Dann auf <http://localhost:4173> das Intro überspringen und durchgehen:
Startseite (Regionen-Rail), Suche (Hotelkarten), ein Hotel öffnen (Galerie
wischen), Karte. Kein Bild darf verzerrt wirken oder wichtige Bildteile
verlieren — passiert das, stimmt das Seitenverhältnis der Quelle nicht.
