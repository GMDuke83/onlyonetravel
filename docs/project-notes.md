# ONLYONE — Project notes

Working notes: what was decided, why, and what is still open.
Kept short on purpose.

---

## 1. What came from the prototype

The starting point was `onlyone_iphone_ocean_stops_on_page_change.html`
(5.2 MB, single file). What was kept, and what was deliberately changed:

| Prototype | Now | Why |
|---|---|---|
| Video as a 4.3 MB Base64 string → `Blob` → `objectURL` | Real `.mp4` file at `/video/…` | A Base64 blob cannot be cached, cannot be range-requested, and blocks first paint. It also inflated the HTML ~50×. |
| Ocean sound synthesised with Web Audio (brown noise + LFO) | The video's own AAC track | The prototype's video was silent, so surf had to be faked. The current hero has real ocean audio, so the simulation was removed. |
| Card imagery: one 215 KB Base64 WebP, re-cropped via `background-position` | Real per-card WebP files | Cacheable, smaller in total, and each card can get real photography later without touching CSS. |
| Emoji icons (`☰`, `☎`, `▶`) | Inline SVG line icons | Design rule: no emoji. |
| `.app { height: 100vh }` | `100svh` | `100vh` on iOS includes retracting browser chrome → hero taller than the screen. |
| Hero + next section in one scroll container | Two explicit views (`#intro`, `#main`) | "Leaving the intro" has to be an exact moment so the ocean can be stopped precisely. A scroll position is fuzzy; a view switch is not. |
| Countdown inside the fading end-card, opacity juggled inline | Countdown is its own element; end title separate | The countdown had to survive the end-card's fade without inline style hacks. |

The look, copy, colours, countdown idea and overall sequence are the
prototype's — those were kept.

---

## 2. The hero video

Two source files were supplied:

| Source | Resolution | Audio |
|---|---|---|
| embedded in the prototype HTML | 720×1280 portrait | **none** |
| `Generated_Video_…6_12PM.mp4` | 1280×720 landscape | AAC, real ocean |

Same scene, same 8.00 s, same generation — one rendered portrait, one landscape.

Neither was usable alone: the portrait cut is the right framing for a phone but
silent; the landscape cut has the sound but would lose ~74 % of its width to
`object-fit: cover` on a 9:19.5 screen.

**Shipped:** portrait video stream + landscape audio track, muxed into one file
and re-encoded (H.264 High, yuv420p, CRF 25, `+faststart`, AAC 112 k).
2.2 MB, verified `moov` before `mdat`.

The page-two banner (`onlyone-marina-v1.mp4`) was letterboxed inside a portrait
frame; it was cropped to its real content area (720×900, offset y=190) and
encoded **with `-an`** — its supplied audio track was digital silence (−91 dB)
and page two must be silent anyway.

---

## 3. Placeholder assets — needs real photography

> **Superseded by §7/§8** — the destination/stay cards below were replaced by the
> booking platform. The point still stands: all imagery comes from the videos.
> Current filenames are `public/images/hotels/h01…h14.webp` + `hero.webp`.

Every image in `public/images/` is a **frame from the hero video**, cropped and
lightly graded to differentiate the cards. The camera pushes in over the 8 s, so
the compositions genuinely differ — but it is all one villa.

That means **Antalya, Bodrum, Istanbul and Cappadocia currently show the same
location.** This is fine for a layout test and wrong for anything shown to a
client.

Replace with real photography, keeping the filenames:

```
destination-antalya.webp     400×560
destination-bodrum.webp      400×560
destination-istanbul.webp    400×560
destination-cappadocia.webp  400×560
stay-villas.webp             320×448
stay-boutique.webp           320×448
stay-residences.webp         320×448
feature-yachts.webp          640×400
feature-experiences.webp     640×400
feature-concierge.webp       640×400
```

---

## 4. Content status per section

> **Superseded by §7** — these sections were replaced by the booking platform
> (hotel discovery, requests, offers, staff back office).

| Section | State |
|---|---|
| Exclusive Destinations | 4 cards, placeholder imagery, no detail pages |
| Private Stays | 3 cards, placeholder imagery, no detail pages |
| VIP Services | 3 items, copy is a first draft |
| Yachts | one feature card |
| Experiences | one feature card |
| Concierge | one feature card |
| My Journey | shell only — no account, no persistence |

Taps on placeholder items show a small toast instead of navigating. Structure is
in place so sections can be filled without re-laying-out the page.

---

## 5. Verified

Driven in a real browser (Chromium, mobile emulation) at 390×844, 393×852 and
430×932:

* hero height === viewport height exactly (844 / 852 / 932)
* no horizontal scroll on either view
* video autoplays muted, decodes 720×1280
* countdown shows 3 · 2 · 1 with **0.00 px drift** horizontally and vertically
* countdown centred to the pixel
* end title appears, then auto-transitions
* on leaving the intro: video paused, muted, `currentTime === 0`
* page-two banner plays, muted, looping — and pauses when returning to the intro
* returning to the intro resets countdown to `3`, clears the end title, restarts
  playback from `0:00`
* first tap unmutes and replays from the start; toggle re-mutes
* no console errors, no failed requests

HTTP behaviour verified against the dev server: `200` on all assets,
`Content-Type: video/mp4`, and `206 Partial Content` with a correct
`Content-Range` for range requests.

### Test-environment caveat

The Chromium build available here has **no H.264/AAC decoder**
(`canPlayType('video/mp4; codecs="avc1.640028"')` returns `""`). To exercise the
sequence logic in a real browser, a temporary VP9/WebM copy of the same cut was
served and the `<source>` swapped at runtime. Those temp files were deleted and
are not in the repository.

So: **the MP4 was verified by inspection** (ffprobe: H.264 High, yuv420p, AAC,
faststart, correct duration) and **the app logic was verified by execution**.
Playback of the H.264 file itself still needs a real-device check on iPhone
Safari and Android Chrome.

---

## 6. Open points

> **See §8 for the current list.**

1. **Public test URL** — resolved: GitHub Pages publishes from `main`.
   Cloudflare/Vercel stayed unreachable from this environment.
2. **Real photography** — see §3.
3. **Script webfont for Android** — "Journey" falls back to Georgia there.
   A subsetted script font (only the glyphs in "Journey" / "Begins Now" /
   "Awaits", ~3–4 KB WOFF2) would fix it. Google Fonts was unreachable from
   this environment, so it could not be added now.
4. **Real device pass** — iPhone Safari and Android Chrome, per §5's caveat.
5. **Desktop** — currently the phone layout in a centred device frame. A real
   desktop design is a later phase.
6. **`main` is currently identical to `develop`.** Once the test environment is
   live, `main` should only receive reviewed merges.

---

## 7. The booking platform

The intro is now the entrance to a booking platform rather than a static
showcase. Both live in the same app: `#intro` gates, `#main` holds the platform,
and `js/app.js` contains the intro controller followed by the platform.

The brand stays **ONLYONE LUXURY TRAVEL** throughout — an earlier working name
was dropped.

### The price rule is structural, not cosmetic

The requirement is that a guest sees no price until staff has written them an
individual offer. Hiding prices in the UI would not satisfy that: anyone can
open DevTools and read the data behind the page.

So the data has no prices. `PUBLIC_HOTELS` carries name, region, stars, rating,
reviews, amenities, board, beach distance, description, images and room types —
and no price key on any hotel or room. Nothing needs to be filtered out on the
way to the customer, because nothing is there.

A price is created only when staff fills in the offer form, and it is stored on
that one request. Verified at the source: a scan of the hotel and room data
blocks finds no price-like identifier at all.

Consequence for the real backend: `/api/public/hotels` returns exactly this
shape, `/api/staff/*` sits behind authentication and a role check. Only the
payment service layer has to change to go live with Ziraat *Linkle Ödeme*.

### Verified end to end

Driven in a real browser at 393×852, one continuous run:

* 24 hotels across 7 regions listed; the golf filter narrows to 3
* favourite stored and still present after a reload
* hotel detail shows 3 room types, no price
* 6-step request wizard completes; request `OO-2026-00128` created with
  status `new`, wishes saved, `offer === null`
* staff login → dashboard → open request → offer created at 2450 EUR
* status moves `offer` → `accepted` → `payopen` → `paid` → `confirmed`
* the Ziraat payment link is generated
* price appears **only** in the individual offer on the guest side
* a text scan of the whole guest area — home, search, hotel detail, wizard
  summary, trips before the offer — finds no price anywhere
* `localStorage` survives a reload with requests, status and favourites intact
* all three languages switch; the map renders 7 region pins
* no horizontal scroll, no failed requests, no console errors

### Two bugs found and fixed while testing

1. **Bottom sheets could push their action button off screen.** The sheet is a
   flex column with `max-height:90svh`, but the content is injected into a
   wrapper (`#sheetInner`) that was a plain block. The flex rules therefore
   never applied, the body could not shrink, and a long sheet — the filters —
   pushed *Apply* below the viewport. Measured: 917 px of content inside a
   767 px sheet. Fixed by making the wrapper the flex column.
2. **The intro could strand a visitor** if the video never decoded — see §5.

## 8. Still open

* **Real photography.** Hotel and region imagery is still derived from the two
  supplied videos, so different hotels share a location. Five real Antalya
  photos were shown in conversation but arrived as inline images rather than
  files, so they could not be committed. Filenames to drop them into:
  `public/images/hotels/h01…h14.webp` (640×400) and `hero.webp`.
* **Hotel administration for staff** (§22 of the brief) is not built; staff can
  work requests, offers, payments and customers, and see hotel counts per
  region, but not edit hotel records.
* **Real payment.** Ziraat *Linkle Ödeme* is simulated; the architecture keeps
  it behind a single service seam.
* **Desktop.** Still the phone layout in a centred device frame.

---

## 9. Ausflüge

Auf Wunsch ergänzt: Tagesausflüge über die Hotelregion hinaus, mit dem vom
Kunden gelieferten Bildmaterial.

| Ziel | Dauer |
|---|---|
| Pamukkale & Hierapolis | 1 Tag |
| Kappadokien | 2 Tage |
| Ephesos | 1 Tag |
| Ölüdeniz — Blaue Lagune | 1 Tag |
| Istanbul | 2 Tage |

Ölüdeniz, Ephesos und Kappadokien liegen bewusst außerhalb der Region Antalya —
es sind Ausflugsziele, keine Hotelregionen, und stehen deshalb in einem eigenen
Bereich statt in der Regionsliste.

**Einbindung in den Geschäftsprozess.** Ausflüge haben — wie Hotels — keinen
Preis. Sie sind kein zweiter Bestellweg, sondern hängen sich an die
Hotelanfrage:

* eigener Bereich zum Stöbern (Startseiten-Rail, Übersicht, Detail-Sheet)
* *Zur Anfrage hinzufügen* merkt ein Ziel vor (`pendingExc`)
* Schritt 4 des Anfrage-Wizards zeigt alle Ausflüge als Auswahl, Vorgemerktes
  ist bereits aktiv
* die Auswahl steht in der Zusammenfassung, wird an der Anfrage gespeichert und
  erscheint im Mitarbeiterbereich als eigener Block

Der Mitarbeiter stimmt sie beim Angebot mit ab — dort entsteht ohnehin der
einzige Preis.

Verifiziert: stöbern → vormerken → Wizard zeigt es vorausgewählt → zweites Ziel
ergänzt → beide in der Zusammenfassung → beide an der Anfrage gespeichert →
Mitarbeiter sieht beide. Kein Preis im gesamten Ausflugsbereich.

## 10. Echtes Bildmaterial (Upload 15.08.)

13 Fotos eingebaut, PNG → WebP, mittig auf Zielformat beschnitten:

* **5 Ausflugsbilder** — alle Ziele abgedeckt
* **7 Hotelbilder** — `h01 h02 h07 h08 h09 h10 h11`
* **2 Regionsbilder** — Antalya, Kemer

Die Rohdateien lagen als 33 MB PNG im Repo-Wurzelverzeichnis (`1.png`…`13.png`)
und wurden nach der Umwandlung entfernt; die ausgelieferten WebP wiegen zusammen
1,4 MB.

Noch Platzhalter aus den Videos: `h03 h04 h05 h06 h12 h13 h14` und die Regionen
`konyaalti lara belek side alanya`. Prompts dafür in `docs/image-prompts.md`.

---

## 11. Ton beim Einstiegsvideo

Auf die Frage, ob sich der Ton automatisch abspielen lässt: **nein, nicht
zuverlässig.** iOS Safari und Android Chrome starten Video mit Ton erst nach
einer Nutzerinteraktion. Das ist Browser-Politik, nicht Umsetzungssache — genau
die Regel, die verhindert, dass Seiten ungefragt losschallen.

Was tatsächlich möglich ist, wird jetzt ausgeschöpft:

| Situation | Verhalten |
|---|---|
| Erster Besuch, egal welches System | stumm — ohne Ausnahme |
| Erste Berührung des Hero | Ton an, Video ab 0:00 |
| Rückkehr, iOS Safari | bleibt stumm; Wunsch bleibt gespeichert, Hinweis erscheint |
| Rückkehr, Android Chrome | **kann von selbst mit Ton starten** |

Der Unterschied bei Android: Chrome führt pro Website einen *Media Engagement
Index*. Wer die Seite wiederholt besucht und dort Ton abgespielt hat,
überschreitet irgendwann die Schwelle, und unmuted Autoplay ist erlaubt. Deshalb
wird bei gespeichertem Tonwunsch beim Start **unmuted versucht**; scheitert es,
greift stumm der bestehende Rückfall. Apple kennt keine solche Ausnahme.

Zwei Ergänzungen dazu:

* Der Tonwunsch liegt in `localStorage` (`onlyone.sound`) und überlebt Besuche.
* Ein kleiner, lokalisierter Hinweis erscheint nach 1,4 s unter dem Ton-Symbol
  und verschwindet bei der ersten Berührung. Ohne ihn wüsste niemand, dass ein
  Tippen den Ton bringt.

Beim Testen fiel ein Zustandsfehler auf: bei gespeichertem Wunsch wurde
`defaultMuted = true` und `muted = false` gesetzt — Attribut und Property
widersprachen sich, und jede Neuinitialisierung des Medienelements fiel still
auf stumm zurück. Beide werden jetzt in beide Richtungen gleich gehalten.

Geprüft unter beiden Autoplay-Regimes des Browsers, alle vier Fälle der Tabelle.

## 12. Bildbestand vollständig bis auf zwei

Zweiter Upload: zehn erzeugte Bilder, exakt richtig benannt und in exakt den
vorgegebenen Maßen (640 × 400 bzw. 480 × 640) — sie mussten nur aus dem
Repo-Wurzelverzeichnis in `public/images/hotels/` einsortiert werden.

Damit sind **alle sieben Regionen**, **alle fünf Ausflüge** und **zwölf von
vierzehn Hotelmotiven** echte Fotografie. Offen: `h13` (antike Ruine am Strand)
und `h14` (Boutique-Dachterrasse); Prompts stehen in
`docs/chatgpt-bildauftrag.md`.

## 13. Die Diashow im Hero: warum es zwischendurch schwarz wurde

Zwei Fotos konnten sich nie überlappen. Jedes Bild bekam einen Sechstel-Anteil
am Durchlauf und blendete **innerhalb** dieses Anteils auf und wieder ab: bei
36 Sekunden Gesamtlauf war ein Bild ganze 1,9 Sekunden lang wirklich zu sehen,
davor und danach lagen je zwei Sekunden, in denen das eine schon weg und das
nächste noch nicht da war. Was in dieser Lücke durchscheint, ist der Kasten
hinter den Bildern — und der liegt unter Schleier und Glasschicht, also praktisch
schwarz. Genau der beschriebene Effekt.

Die Rechnung dazu ist kurz: liegen Ebenen mit den Deckkräften `o₁…oₙ`
übereinander, bleibt vom Hintergrund das Produkt `∏(1 − oᵢ)` sichtbar. Bei einer
klassischen Kreuzblende stehen in der Mitte beide auf 0,5 — es bleiben 25 %
Hintergrund. Für ein sauberes Bild muss also **irgendeine Ebene jederzeit auf 1
stehen**.

Deshalb blendet jetzt nur noch das ankommende Foto auf, und zwar **über** dem
alten, das dabei voll deckend liegen bleibt. Erst wenn es vollständig verdeckt
ist, zieht es sich zurück — unsichtbar. Damit das ankommende Bild wirklich oben
liegt, wandert der `z-index` mit; er braucht harte Stufen, die Deckkraft eine
weiche Kurve, und weil eine Keyframe-Zeitfunktion immer für alle Eigenschaften
des Keyframes gilt, sind es zwei getrennte Animationen (`heroSlide`, `heroLift`).
Die Bilder liegen dafür in einem eigenen Stapelkontext, sonst könnte ein
`z-index: 3` über Schleier und Überschrift klettern.

Standzeit: **9 Sekunden je Foto** statt 6, davon 8,5 s allein und voll deckend
(vorher 1,9 s). Die Blende dauert 2,2 s und liegt **zusätzlich** auf der
Standzeit, nicht darin.

Nebenbei repariert: `animation-delay` zählt ab dem Moment, in dem ein Element ins
Dokument kommt. Die Fotos werden nacheinander nachgeladen, also lief jedes
spätere ein Stück hinter dem vorigen her — das letzte hatte am Ende ein Drittel
seiner Zeit. Alle Verzögerungen werden jetzt gegen **einen** gemeinsamen
Nullpunkt gerechnet.

Gemessen (`slides.js`): 217 Messpunkte über den vollen 54-Sekunden-Durchlauf,
Hintergrund maximal **0,0 %** sichtbar, alle sechs Übergaben in der richtigen
Ebenenfolge, kürzeste Alleinstandzeit 8,5 s. Gegengeprüft an echten Pixeln
(`fadepx.js`): der Kasten hinter den Bildern wird magenta eingefärbt und der
Schleier abgeschaltet — durch die ganze Übergabe **0 %** Magenta. Die Gegenprobe
mit zwangsweise unsichtbaren Bildern zeigt 100 %, der Test misst also wirklich
etwas.

## 14. Das Kantenlicht: Linie statt Suchscheinwerfer

Die erste Fassung war ein heller Fleck auf einer 3 px breiten Spalte mit 38 px
Streuschein. Damit war das Licht gefühlt vierzig Pixel breit — ein Schmierstreifen
am Rand statt einer Linie — und zwischen zwei Durchläufen war die Kante schlicht
dunkel.

Jetzt ist die Spalte **1 px** breit, der Schein auf sie beschnitten
(`overflow: hidden`, kein `box-shadow` mehr), und der Grundverlauf geht nirgends
auf null: die Linie brennt durchgehend von oben nach unten. Was wandert, ist nur
noch eine Aufhellung dieser Linie, in 14 s statt 8 s, rechts um eine halbe Runde
versetzt.

Gemessen (`led.js`): an sieben Höhen zwischen 12 % und 82 % unterscheidet sich
die Randspalte um 62–169 Stufen von der Seite sieben Pixel weiter innen. Ohne
Streifen liegen dieselben sieben Messungen bei 1–34. Bei
`prefers-reduced-motion` bleibt die Linie stehen und nur die Wanderung hört auf —
vorher verschwand das ganze Element.

## 15. Transfer-Band ohne Auto, und zwei Zoom-Effekte

Der Maybach ist aus dem Band raus, `public/images/3d/car-maybach.webp` gelöscht.
An seiner Stelle steht **VIP TRANSFER** als animierter Schriftzug — Auftritt
Zeichen für Zeichen, ein warmes Licht, das über die Buchstaben wandert, und ein
Zoom, der am Scrollstand hängt. Details in `docs/3d-flugzeug.md`.

Dazu zwei Zoom-Effekte, beide gemessen:

**Die VIP-Kachel unter dem Hero** folgt dem Scrollen laufend. Der Scroll-Pass
setzte bisher `--s` (vorzeichenbehaftet, −1 beim Eintritt unten bis +1 beim
Austritt oben) für die Parallaxe; dazu kommt jetzt `--z` — wie nah die Kachel an
der Bildschirmmitte steht, 0 am Rand, 1 in der Mitte. Zwei Eigenschaften, weil
eine Parallaxe eine Richtung braucht und ein Zoom nicht.

Wichtig: die Kachel wächst **bis auf** ihre natürliche Grösse, nicht darüber
hinaus (`scale(1 − (1 − z) · 0,03)`, also 0,97 → 1,00). Über 1 skaliert wäre der
Block breiter als die Spalte, und genau daran hing schon einmal das seitliche
Verschieben der Seite. Gemessen über sechs Scrollstände: `--z` 0,05 → 0,93,
Skalierung 0,971 → 0,998, seitlicher Überlauf 0 px.

**Die Banner darunter** zoomen beim Eintritt: das Foto sitzt 8,5 % zu gross und
setzt sich über 1,5 s auf 1,0. Dafür gibt es eine dritte Ebene
(`.expBand__zoom`) um das vorhandene Paar aus Parallaxen-Rahmen und driftendem
Bild. Grund: der Effekt braucht eine `transition`, und eine `transition` auf dem
Element, das `--s` trägt, würde die Parallaxe eine Sekunde hinter dem Finger
herziehen. Drei Transformationen, drei Elemente — auf demselben Element ersetzt
die zweite die erste.

Gemessen (`zoom.js`): 1,085 → 1,065 nach 120 ms → exakt 1,0 im Ruhezustand, auf
allen vier Bannern. Bei `prefers-reduced-motion` stehen beide Zooms, der Lichtlauf
und der Wort-Zoom still, und die Buchstaben sind trotzdem sichtbar.

## 16. VIP-Empfang: der 9:16-Clip

Direkt hinter den vier VIP-Punkten ist ein Abschnitt für das eigene Hochformat-
Video des Auftraggebers gebaut: `.vipClip`, volle Breite, Seitenverhältnis
**9:16**. Auf einem 393-px-Telefon sind das 393 × 699 px — also fast genau ein
Bildschirm. Das ist Absicht: der Clip bekommt die Fläche, für die er gedreht
wurde, statt in einen Querformat-Schlitz gequetscht zu werden.

Drei Ebenen im Rahmen, aus demselben Grund wie bei den Erlebnis-Bannern:

| Ebene | z | wofür |
|---|---|---|
| Standbild | 0 | steht sofort da, bleibt bei Datensparmodus und wenn das Video nie lädt |
| Video | 1 | wird erst beim Hereinscrollen nachgeladen (`armBgVideos`) |
| Schleier | 2 | Verlauf, damit die Tafel nicht auf der nackten Aufnahme klebt |
| Glastafel | 3 | Ankunft / VIP-Empfang / eine Zeile |

Die Schrift steht auf einer eigenen dunklen Tafel, nicht nur auf dem Verlauf:
hinter einem bewegten Bild wechselt der Untergrund jedes Wortes von Bild zu
Bild, und ein Verlauf, der auf ein Einzelbild abgestimmt ist, versagt beim
nächsten.

**Der Abschnitt ist noch aus.** `VIP_CLIP` steht auf `null`, solange die Datei
nicht da ist — ein leerer 9:16-Rahmen wäre das grösste Loch der Seite. Zum
Einschalten: Datei ablegen, die zwei ffmpeg-Zeilen im Kommentar über `VIP_CLIP`
laufen lassen (Clip auf 1080 px Breite, H.264, `-an`; Standbild bei 1,5 s), die
Konstante setzen. `-an` ist nicht optional: §13 des Auftrags ist, dass nach dem
Intro nichts auf der Seite Ton macht, und eine entfernte Tonspur hält das per
Bauart und nicht per Attribut.

`vipclip.js` prüft beide Zustände — ausgeschaltet, dass keine Reste im DOM
liegen und keine Datei fehlt; eingeschaltet Seitenverhältnis, Ebenenfolge,
Standbild, Nachladen, stumm/Schleife/`playsinline`, keine Tonspur, kein
seitlicher Überlauf und der Titel in allen drei Sprachen. Mit einem
Platzhalter-Clip einmal durchgemessen: 393 × 699, Verhältnis 0,563, Ebenen
0 < 1 < 2 < 3, Überlauf 0 px.

## 17. Zwei Hochformat-Clips vom Auftraggeber

Der Auftraggeber dreht 9:16. Ein 9:16-Rahmen ist auf Telefonbreite fast genau
ein Bildschirm hoch (393 × 699 px), und genau darum geht es: das Material
bekommt die Form, für die es gedreht wurde, statt in einen Querformat-Schlitz
gequetscht zu werden.

| Abschnitt | steht hinter | Datei | Grösse | PSNR |
|---|---|---|---|---|
| VIP-Empfang | den vier VIP-Punkten | `onlyone-vip-welcome-v1.mp4` | 1,4 MB | 43,4 dB |
| Yacht-Tour | dem Ausflüge-Laufband | `onlyone-yacht-tour-v1.mp4` | 2,7 MB | 40,4 dB |

Beide bei CRF 24 aus dem Original (3,0 bzw. 5,8 MB). Gemessen statt geraten: für
den Empfang standen 1910 KB / 44,7 dB, 1438 KB / 43,4 dB und 1107 KB / 42,2 dB
zur Wahl; 43,4 dB ist derselbe Wert, auf den die Hero-Fotos eingestellt sind.

Der Yacht-Clip ist bei gleicher Einstellung fast doppelt so schwer und liegt
tiefer im PSNR — Wasser, Kielwelle und Gegenlicht sind teuer. `preset veryslow`
mit `aq-mode=3` brachte 2303 KB bei 39,4 dB, also keinen echten Gewinn; die
Physik lässt sich nicht überreden. Beide Clips laden erst beim Hereinscrollen
(`armBgVideos`), bis dahin kostet der Abschnitt sein Standbild (64 bzw. 100 KB).

Drei Ebenen im Rahmen, aus demselben Grund wie bei den Erlebnis-Bannern:
Standbild (z 0) steht sofort da und bleibt, falls das Video nie lädt; Video
(z 1) legt sich darüber; Schleier (z 2) und Glastafel (z 3) tragen die Schrift.
Die Schrift steht auf einer eigenen dunklen Tafel, nicht nur auf dem Verlauf:
hinter bewegtem Bild wechselt der Untergrund jedes Wortes von Bild zu Bild.

Das Standbild ist **Bild 0** des fertigen Clips, kein hübscheres weiter hinten —
so hat die Übergabe von Standbild zu Video nichts zu überspringen.

Beide Clips sind ohne Tonspur kodiert (`-an`). §13 des Auftrags — nach dem Intro
macht nichts auf der Seite Ton — hält damit per Bauart und nicht per Attribut;
gemessen: 0 dekodierte Tonbytes bei beiden.

Ein neuer Clip ist eine Zeile in `CLIPS` plus drei Zeilen Text pro Sprache. Die
beiden ffmpeg-Aufrufe stehen im Kommentar darüber.
