# Die 3D-Objekte: Jet und Maybach

> Hinweis: der Plattform-Hero ist seit dem Umbau eine Foto-Diashow, kein Video
> mehr. `onlyone-hero-coast-v1.mp4` und sein Posterbild wurden dabei entfernt.

Auf der Startseite folgen hinter den vier Erlebnis-Bannern zwei Bänder in der
Reihenfolge **Transfer, dann Anreise (Flugzeug)** — das Flugband schliesst die
Seite ab. Im Flugband wandert das Objekt beim Scrollen durch die
Ebenen: die Überschrift liegt
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
Flugstrecke. Auch die x-Positionen der Spuren in `vHome()` sitzen auf den
Hinterkanten *dieses* Flügels und müssten mitwandern.

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
Weil das Flugband der letzte Abschnitt der Seite ist, wäre der volle Durchlauf
sonst gar nicht erreichbar — gemessen war einmal bei `0.507` Schluss, das
Flugzeug flog nur die halbe Strecke. `armFlyBand()` normiert deshalb auf den
Fortschritt, der bei maximalem Scrollstand tatsächlich erreichbar ist, und
treibt **alle** Bänder, nicht nur das erste.

Das hat eine Kehrseite, die beim Vertauschen der Bänder zugebissen hat: sobald
das Flugband wieder am Seitenende steht, fährt es seinen Steigweg voll aus. Bei
den vorherigen −7svh landete es damit in der Überschrift — der Wert war nur
sicher, solange das Band mittig lag und `--p=1` nie erreichte. Deshalb misst
`overlap.js` jetzt den **gesamten Durchlauf** und nicht mehr nur den mittigen
Moment, und der Weg steht auf −3,5svh. Gemessen: maximal 23–27 % der
Überschrift verdeckt (die gewollte Kreuzung), 0–14 % des Laufbands.

Das Flugzeug selbst steht **gerade und still**. Eine frühere Fassung hatte eine
eigene 7-Sekunden-Schleife aus Drift, Schräglage und Atmen der Grösse — ein
gekipptes, wackelndes Foto sah aus wie ein Spielzeug, das jemand hin und her
schwenkt. Ein Jet wirkt wie ein Jet, wenn er gerade liegt. Geblieben ist allein
der Ebenendurchgang zwischen Überschrift und Karte, und das ist auch der Sinn
des Abschnitts.

Das Gefühl von Geschwindigkeit übernehmen stattdessen **acht Spuren hinter den
Tragflächen** (`.flyTrail`). Jede beginnt an der Hinterkante an ihrer eigenen
x-Position — weiter aussen heisst weiter hinten, weil der Flügel gepfeilt ist —
und zieht nach unten weg. Längen, Laufzeiten und Verzögerungen sind gestaffelt,
sonst pulsieren sie im Gleichtakt. Jede Linie ist ein Verlauf, der an beiden
Enden ausblendet: ein hart endender Balken liest sich als Kratzer auf dem
Display, ein ausblendender als Luft.

Unter dem Flugzeug läuft ein Laufband aus Zielen (Regionen + Ausflüge, in der
Sprache der Oberfläche). Die Zeile enthält ihren Inhalt exakt zweimal und
wandert um genau −50 % — der Umbruchpunkt landet auf demselben Pixel, die
Schleife hat keine Naht.

Bei `prefers-reduced-motion: reduce` wird `--p` fest auf `0.5` gesetzt, es wird
gar kein Scroll-Listener registriert, das Laufband steht still und die Spuren
verschwinden ganz.


---

# Das „Transfer"-Band: der Maybach ist raus

> **Stand 16.08.:** Der Wagen ist aus dem Band entfernt, `car-maybach.webp` ist
> gelöscht. An seiner Stelle steht der animierte Schriftzug **VIP TRANSFER**
> (`.vipWord`). Der Rest dieses Kapitels beschreibt, wie das Bild entstanden
> ist — als Beleg, falls es je zurückkommen soll; die Datei liegt in der
> Git-Historie und lässt sich mit `git show <commit>:public/images/3d/car-maybach.webp`
> wieder herausholen.

## Warum jetzt Schrift statt Auto

Ein gerendertes Auto ist immer das Bild *eines bestimmten* Autos, und es war von
Anfang an ein Kompromiss: 24 MB Modell auf ein Standbild eingedampft, und dieses
Standbild musste dann noch mit Luft ringsum beschnitten werden, damit es am
Bildschirmrand nicht wie abgeschnitten wirkte. Ein Wort kostet nichts, skaliert
auf jedes Display und sagt die Sache direkt.

Der Schriftzug läuft auf drei verschiedenen Uhren:

1. **Auftritt** — jedes Zeichen steigt einzeln auf, gestaffelt um 50 ms. Der
   verborgene Startzustand hängt an `.reveal`; ist das Reveal-System aus
   (reduced motion, kein IntersectionObserver), steht das Wort einfach da,
   statt für immer unsichtbar zu bleiben.
2. **Licht** — ein warmer Schein wandert über die Buchstaben und wiederholt
   sich. Pro Zeichen, nicht als auf den Text geclippter Verlauf: ein geclippter
   Hintergrund überlebt die Einzeltransformationen aus Punkt 1 nicht.
3. **Scrollen** — das ganze Wort wächst über den Durchlauf des Bandes um 4 %.
   Das ist, was vom Objekt übrig ist, das durch die Ebenen wanderte.

Pro Sprache eigenes Alphabet (`carWord`): **VIP TRANSFER** / **VIP ТРАНСФЕР**.
Die Zeichen sind wortweise gruppiert und brechen innerhalb eines Wortes nicht —
flach nebeneinander gesetzt landete im Russischen ein einzelnes **Р** in der
zweiten Zeile. Die Schriftgrösse (`clamp(30px, 10.2vw, 48px)`) ist so gewählt,
dass die längste der drei Sprachen auf einem 360-px-Telefon bei vollem
Scroll-Zoom einzeilig bleibt; Russisch ist der Engpass und misst rund 3 % mehr
als die lateinische Schreibweise.

---

## Wie das Bild damals entstand

Direkt hinter dem Flug folgte derselbe Dreischicht-Aufbau noch einmal, jetzt mit
dem Wagen: der Jet landet, das Auto übernimmt. Weil eine Limousine ein breites
Objekt ist und der Jet ein hohes, querte sie die Überschrift seitlich, statt
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
- Auflösung 3000 × 2000. Der Zuschnitt liegt bewusst **nicht** auf der
  Alpha-Bounding-Box: randlos beschnitten endete der Kofferraum exakt auf der
  Bildkante, was am Bildschirmrand wie abgeschnitten aussah. Jetzt mit rund 5 %
  Luft ringsum (`crop=1450:800:706:535`), dann auf 1000 px Breite skaliert.
- Achtung: Playwrights `elementHandle.screenshot({clip})` hat den Zuschnitt hier
  **ignoriert** — die Datei kam in voller Leinwandgrösse heraus. Deshalb wird
  die gemessene Box anschliessend mit ffmpeg geschnitten, nicht im Browser.

Ergebnis: `public/images/3d/car-maybach.webp`, 1000 × 552, 55 KB, mit Alpha und
den Reflexionen aus dem Render. Auch hier trägt das CSS keinen zusätzlichen
Schatten.
