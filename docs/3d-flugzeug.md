# Das Flugzeug im „Anreise"-Band

Auf der Startseite, unter den vier Erlebnis-Bannern, liegt ein Abschnitt, in dem
ein Flugzeug beim Scrollen durch die Ebenen wandert: die Überschrift liegt
**dahinter**, die Infokarte **davor**. Genau dieser Sandwich-Effekt ist die
ganze Wirkung — deshalb sind es drei getrennte Elemente und kein Hintergrundbild.

## Warum kein echtes 3D im Browser

Naheliegend wäre gewesen, das glTF-Modell mit three.js direkt auf dem Handy zu
rendern. Dagegen sprachen drei gemessene Punkte:

| | echtes WebGL | vorgerendertes Bild |
|---|---|---|
| Übertragung | 4,2 MB Modell + ~150 KB Bibliothek | **37 KB** |
| Rechenlast | GPU-Dauerlast, spürbar warmes Gerät | keine |
| Ausfallrisiko | WebGL kann fehlen oder gedrosselt sein | keins |

Die Ansicht ist von oben und fest — sie dreht sich nicht. Für einen festen
Blickwinkel liefert ein einzelnes Bild exakt dasselbe Ergebnis wie eine
Echtzeit-Szene, nur eben für ein Hundertstel der Daten. Bewegt wird per
CSS-`transform`, also auf dem Compositor: kein Layout, kein Neuzeichnen, kein
Ruckeln beim Scrollen.

Sollte später eine frei drehbare Ansicht gewünscht sein, ändert sich die
Rechnung — dann wird three.js nötig, und das Modell sollte vorher mit Draco
oder meshopt komprimiert und die Textur auf 1024 px verkleinert werden.

## Herkunft und Lizenz

Das Modell stammt von Sketchfab:

> This work is based on "Airplane CRJ-900 Cityjet"
> (https://sketchfab.com/3d-models/airplane-crj-900-cityjet-02c4fa44604243c2bb48db64506a39af)
> by CityJet Training (https://sketchfab.com/artoud) licensed under CC-BY-4.0
> (http://creativecommons.org/licenses/by/4.0/)

CC BY 4.0 erlaubt kommerzielle Nutzung und Bearbeitung, **verlangt aber die
Nennung**. Die Nennung steht deshalb im Menü der App (unterster Absatz) und
hier — nicht nur in einer Codezeile, die niemand sieht.

**Die Originallackierung wurde entfernt.** Das Modell trug die Livery einer
echten Fluggesellschaft samt Schriftzug; die gehört nicht auf die Seite eines
anderen Unternehmens, weil sie eine Partnerschaft suggeriert, die es nicht gibt.
Verwendet wird ausschliesslich die Geometrie, neu lackiert in Champagner-Gold
aus der Markenpalette.

## Wie das Bild entstanden ist

Gerendert wurde offline mit three.js in einem headless Chromium (SwiftShader),
nicht in einem 3D-Programm — dadurch ist der Vorgang reproduzierbar und braucht
keine Extra-Software:

1. glTF laden, Material durch `MeshPhysicalMaterial` in `#C9A96B` ersetzen
   (`metalness .92`, `roughness .30`, `clearcoat .85`)
2. Beleuchtung über `RoomEnvironment` + `PMREMGenerator` — eine reine
   Richtlicht-Beleuchtung liess den Rumpf wie graues Plastik aussehen; erst die
   Umgebungsspiegelung erzeugt den langen Glanz entlang der Mittellinie
3. Orthografische Kamera senkrecht von oben, `up = (0,0,1)`, damit die Nase nach
   oben zeigt
4. Auf die Alpha-Bounding-Box zuschneiden, auf 900 px Breite skalieren, als
   WebP mit Alphakanal speichern

Ergebnis: `public/images/3d/plane-top.webp`, 900 × 1543, **37 KB**.

Das Renderskript liegt unter `scripts/render-plane/`. Es wird nicht im Betrieb
gebraucht, sondern nur, wenn Lackierung oder Blickwinkel geändert werden sollen:

```bash
npm i three playwright          # nur für das Rendern
node scripts/render-plane/shoot.js
```

## Bewegung

Der Fortschritt `--p` läuft von 0 (Band betritt den unteren Bildrand) bis 1.
Weil das Band der letzte Abschnitt der Seite ist, ist der volle Durchlauf gar
nicht erreichbar — gemessen war bei `0.507` Schluss, das Flugzeug flog nur die
halbe Strecke. `armFlyBand()` normiert deshalb auf den Fortschritt, der bei
maximalem Scrollstand tatsächlich erreichbar ist. Steht das Band später einmal
nicht mehr am Ende, ist dieser Faktor automatisch 1 und ändert nichts.

Bei `prefers-reduced-motion: reduce` wird `--p` fest auf `0.5` gesetzt und gar
kein Scroll-Listener registriert.
