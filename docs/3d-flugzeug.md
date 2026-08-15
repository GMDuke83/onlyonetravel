# Die 3D-Objekte: Jet und Maybach

Auf der Startseite, unter den vier Erlebnis-Bannern, liegt ein Abschnitt, in dem
ein Flugzeug beim Scrollen durch die Ebenen wandert: die Überschrift liegt
**dahinter**, das Laufband und die Infokarte **davor**. Genau dieser
Sandwich-Effekt ist die ganze Wirkung — deshalb sind es getrennte Elemente und
kein Hintergrundbild.

## Das Bild

`public/images/3d/plane-top.webp` — vom Auftraggeber geliefert (`jet.png`),
PNG mit echtem Alphakanal inklusive eigenem Schlagschatten. Aufbereitung:

```bash
# auf die Alpha-Bounding-Box zuschneiden, auf 900 px Breite, WebP mit Alpha
ffmpeg -i jet.png -vf "crop=1574:1943:130:63,scale=900:-1" \
       -c:v libwebp -quality 90 -compression_level 6 \
       public/images/3d/plane-top.webp
```

Ergebnis: 900 × 1111, 120 KB. Weil das Bild seinen Schatten mitbringt, trägt
das CSS **keinen** zweiten `drop-shadow` — zwei Schatten übereinander sehen
schmutzig aus.

Wird das Bild ersetzt, unbedingt `width`/`height` am `<img>` in `vHome()`
mitziehen: die Werte reservieren den Platz vor dem Laden. Und die Geometrie im
`.flyBand__plane` ist auf dieses Seitenverhältnis abgestimmt — ein deutlich
höheres oder breiteres Bild braucht andere Werte für `top`, `width` und die
Flugstrecke.

## Warum kein echtes 3D im Browser

Ein früherer Stand rechnete ein glTF-Modell live mit three.js. Dagegen sprach:
4,2 MB Modell plus ~150 KB Bibliothek gegen **120 KB** Standbild, dazu
GPU-Dauerlast und ein spürbar warmes Gerät. Die Ansicht ist fest von oben und
dreht sich nicht — für einen festen Blickwinkel liefert ein Bild dasselbe
Ergebnis. Bewegt wird per CSS-`transform`, also auf dem Compositor: kein
Layout, kein Neuzeichnen, kein Ruckeln beim Scrollen.

Erst wenn eine frei drehbare Ansicht gewünscht wäre, kippt diese Rechnung.

## Bewegung

Der Fortschritt `--p` läuft von 0 (Band betritt den unteren Bildrand) bis 1.
Weil das Band der letzte Abschnitt der Seite ist, ist der volle Durchlauf gar
nicht erreichbar — gemessen war bei `0.507` Schluss, das Flugzeug flog nur die
halbe Strecke. `armFlyBand()` normiert deshalb auf den Fortschritt, der bei
maximalem Scrollstand tatsächlich erreichbar ist. Steht das Band später einmal
nicht mehr am Ende, ist dieser Faktor automatisch 1 und ändert nichts.

Zusätzlich fliegt das Flugzeug unabhängig vom Scrollen: der Wrapper trägt die
scrollgekoppelte Transformation, das Bild darin eine eigene 7-Sekunden-Schleife
aus Drift, leichter Schräglage und Atmen der Grösse. Zwei verschachtelte
Elemente, weil zwei Uhren: eine Transformation pro Element, sonst überschreiben
sie sich.

Unter dem Flugzeug läuft ein Laufband aus Zielen (Regionen + Ausflüge, in der
Sprache der Oberfläche). Die Zeile enthält ihren Inhalt exakt zweimal und
wandert um genau −50 % — der Umbruchpunkt landet auf demselben Pixel, die
Schleife hat keine Naht.

Bei `prefers-reduced-motion: reduce` wird `--p` fest auf `0.5` gesetzt, es wird
gar kein Scroll-Listener registriert, und Flug wie Laufband stehen still.


---

# Der Maybach im „Transfer"-Band

Direkt hinter dem Flug folgt derselbe Dreischicht-Aufbau noch einmal, jetzt mit
dem Wagen: der Jet landet, das Auto übernimmt. Weil eine Limousine ein breites
Objekt ist und der Jet ein hohes, quert sie die Überschrift seitlich, statt
durch sie hindurchzusteigen.

## Warum auch hier ein Bild und kein Live-3D

Das gelieferte Modell (`scenecompressed1fastnormal.glb`, meshopt-komprimiert)
wiegt **24 MB** und besteht aus **2 336 874 Dreiecken** in 18 Materialien —
gemessen, nicht geschätzt. Zum Vergleich: das ausgelieferte Standbild ist
**64 KB**. Selbst ein aktuelles Telefon würde an 2,3 Mio. Dreiecken in einer
Dauerschleife hörbar arbeiten, und 24 MB Download wären für eine mobil-zuerst
gebaute Seite ohnehin ausgeschlossen.

Das GLB liegt deshalb **nicht** im Repository. Es gehört in eure eigene
Ablage; für die Seite wird es nicht gebraucht. Soll es doch versioniert werden,
dann über Git LFS — eine 24-MB-Datei bleibt sonst für immer in der Historie und
jeder Klon lädt sie mit.

## Wie das Bild entstanden ist

Gerendert wie der Jet: three.js in einem headless Chromium mit SwiftShader,
Beleuchtung über `RoomEnvironment` + `PMREMGenerator`, orthografisch bzw.
perspektivisch, Hintergrund transparent.

- Kamera: perspektivisch, 26°, Front-Dreiviertel leicht von oben. Die Nase des
  Modells zeigt nach **−X**; ein erster Versuch stand auf +X und fotografierte
  den Kofferraum.
- Auflösung 3000 × 2000, danach auf die Alpha-Bounding-Box beschnitten
  (`crop=1318:724:772:573`) und auf 1000 px Breite skaliert.
- Achtung: Playwrights `elementHandle.screenshot({clip})` hat den Zuschnitt hier
  **ignoriert** — die Datei kam in voller Leinwandgrösse heraus. Deshalb wird
  die gemessene Box anschliessend mit ffmpeg geschnitten, nicht im Browser.

Ergebnis: `public/images/3d/car-maybach.webp`, 1000 × 549, 64 KB, mit Alpha und
den Reflexionen aus dem Render. Auch hier trägt das CSS keinen zusätzlichen
Schatten.
