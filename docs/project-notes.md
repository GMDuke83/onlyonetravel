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
| VIP-Empfang | den vier VIP-Punkten | `onlyone-vip-welcome-v3.mp4` | 1,4 MB | 43,4 dB |
| Yacht-Tour | dem Ausflüge-Laufband | `onlyone-yacht-tour-v2.mp4` | 2,7 MB | 40,4 dB |

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

## 18. Nachgeprüft: kein Ton ausser im Intro

Auf Nachfrage die ganze Kette durchgemessen, nicht nur die zwei neuen Clips.
Ergebnis: **Stand aktualisiert: alle Videos sind physisch ohne Tonspur.** Vier voneinander unabhängige Prüfungen,
zwei davon am Quelltext statt am Bildschirm — eine Seite, die ein Test nie
öffnet, ist genau die Stelle, an der ein nicht stummes Video überlebt.

**1 · Die Dateien.** Von fünf MP4 in `public/video` trägt genau eine eine
Keine Tonspur: `onlyone-hero-ocean-v3.mp4` und die anderen Videos sind mit `-an`
kodiert, sind also nicht bloss stumm geschaltet, sondern haben gar keinen Ton.

**2 · Die Markup-Ebene.** Alle drei `<video>` im Projekt tragen das
`muted`-Attribut — die beiden aus `app.js` (Erlebnis-Banner und `bgVideo()`) und
das Intro in `index.html`. Das Attribut zählt, nicht nur die Eigenschaft: ein
Medienelement, das neu erzeugt oder neu geladen wird, fällt auf das Attribut
zurück, während eine im Skript gesetzte Eigenschaft verloren geht.

**3 · Wer überhaupt entstummen darf.** Acht Stellen im Quelltext setzen
`.muted = false`, `.volume` oder entfernen das Attribut — alle acht liegen im
ersten IIFE (Zeile 1–618, das Intro-Modul) und alle acht sprechen `video` an,
das in Zeile 41 an `#heroVideo` gebunden ist. Im Plattform-Modul kommt keine
einzige vor. Es gibt ausserdem kein `<audio>`, kein `new Audio`, keinen
`AudioContext` und keine einzige Audiodatei im Projekt.

**4 · Die Übergabe.** Der wirkliche Fehlerfall wäre, dass das Intro unter der
Plattform weiterläuft. Also im Test den Ton eingeschaltet, übergeben, nachgesehen:
pausiert, stumm, `muted`-Attribut wieder da, Position auf 0. Danach die drei
Seiten mit Video abgelaufen — Startseite (beide Hochformat-Clips),
VIP-Ausflüge (Kopfvideo) und die Bestätigungsseite, die erst nach einer echten
Anfrage durch den Wizard existiert. Alle vier Elemente stumm, Attribut gesetzt,
**0 dekodierte Tonbytes**.

Der Test heisst `noton.js` und prüft alle vier Ebenen in einem Lauf.

## 19. Empfangsvideo getauscht

Neue Aufnahme vom Auftraggeber, 720 × 1280, 10 s statt 8 s. Wieder mit `-an`
kodiert, also ohne Tonspur — nicht bloss stumm geschaltet.

Gemessen: 2073 KB / 45,8 dB, **1694 KB / 44,3 dB**, 1372 KB / 42,8 dB. Genommen
wieder CRF 24, dieselbe Einstellung wie bei den anderen beiden Clips.

Die Datei heisst **`-v2`**, nicht wieder `-v1`. Der Dateiname ist auf GitHub
Pages der Cache-Schlüssel: bei gleichem Namen bekämen Besucher, die schon einmal
da waren, noch tagelang den alten Clip. Ein neuer Name ist die einzige
verlässliche Art, das auszuschliessen. Dasselbe gilt für das Standbild.

## 20. Kompression: 10,4 MB → 6,5 MB

Zuerst gemessen, was ein Telefon **wirklich** lädt, und in welcher Reihenfolge.
Die Gesamtgrösse des Repositories ist die falsche Zahl: das meiste ist lazy, und
wer nie scrollt, zahlt es nie. Also nach Phasen gezählt (`weight.js`):

| Phase | vorher | nachher |
|---|---|---|
| 1 · Intro, erster Bildschirm | 2947 KB | **1878 KB** (−36 %) |
| 2 · Startseite ohne Scrollen | 810 KB | **391 KB** (−52 %) |
| 3 · Startseite ganz durchgescrollt | 6660 KB | **4184 KB** (−37 %) |
| **gesamt** | **10 417 KB** | **6453 KB** (−38 %) |

Video 6669 → 3857 KB, Bild 3373 → 2220 KB.

### Video: alle fünf auf CRF 28

Das Intro allein war 2249 KB von 2947 KB der ersten Phase — 76 %. Dort
entscheidet sich, wie schnell sich die Seite anfühlt, also lag der Hebel da.

Die Wahl von CRF 28 ist nicht geraten, sondern angesehen: Standbilder aus
Original, aktueller Datei und den Kandidaten nebeneinander, 1:1 und auf 2,4-fach
gezoomt, jeweils an der schwierigsten Stelle (Wasseroberfläche, Kielwelle,
Gegenlicht). Bis CRF 30 war kein Unterschied zu sehen; genommen wurde 28 mit
Reserve.

| Datei | vorher | nachher | PSNR |
|---|---|---|---|
| Intro (mit Ton) | 2248 KB | 1264 KB | 39,5 dB |
| Yacht-Tour | 2725 KB | 1483 KB | 37,8 dB |
| VIP-Empfang | 1694 KB | 1108 KB | 41,4 dB |
| Bestätigung | 1615 KB | 845 KB | 35,6 dB |
| Ausflüge | 1216 KB | 641 KB | 36,9 dB |

Die beiden Hochformat-Clips wurden aus den **Originalen** neu kodiert, nicht aus
den ausgelieferten Dateien — sonst wäre es eine zweite Generation Verlust auf
eine erste. Für Intro, Bestätigung und Ausflüge gibt es keine Originale mehr,
deshalb ist deren PSNR gegen die bisher ausgelieferte Datei gemessen und
entsprechend niedriger; das ist genau der Verlust gegenüber dem, was Besucher
bisher gesehen haben.

Bestätigung und Ausflüge lagen mit 404 × 720 bzw. 406 × 720 bei 1,5 Mbit/s —
das waren Bits in ein Bild, das ohnehin auf die dreifache Breite hochskaliert
wird. Da war am wenigsten zu verlieren.

**Alle Dateinamen sind hochgezählt.** Der Name ist auf GitHub Pages der
Cache-Schlüssel; ohne neuen Namen bekämen Wiederkehrer noch tagelang die alten,
grossen Dateien — womit die ganze Übung wirkungslos wäre.

### Bilder: gemessener WebP-Durchlauf

Neu kodiert wurde nur, wo es **mindestens 8 % spart und PSNR ≥ 40 dB bleibt** —
13 von 56 Dateien. Die übrigen 43 waren schon effizient und blieben unangetastet
(ein Durchlauf hätte sie teils sogar vergrössert).

Den grössten Teil machen die sechs Hero-Fotos aus: 1733 → 1245 KB (−28 %,
40,5–42,2 dB). Weil es an dieser Stelle schon einmal eine Beschwerde über die
Bildqualität gab, ist das nicht nur berechnet, sondern angesehen worden:
Ausschnitt mit Wasserkräuseln und Felsstruktur, 2,4-fach gezoomt, alt gegen neu —
kein sichtbarer Unterschied. Die Auflösung wurde **nicht** angefasst; 941 × 1672
liegt bei DPR 3 ohnehin unter dem Ideal, und Herunterrechnen war genau die
Ursache der damaligen Beschwerde.

### Der Hero-Nachschub kommt jetzt gestaffelt

Die Fotos 2–6 wurden alle innerhalb der ersten sieben Sekunden geholt — also
genau dann, wenn sie mit dem ersten Bildschirm um die Verbindung konkurrieren,
obwohl Foto 6 erst nach 43 Sekunden dran ist. Jedes wird jetzt rund sechs
Sekunden vor seinem Auftritt geholt. Das verschiebt 619 KB aus den ersten drei
Sekunden heraus, ohne ein einziges Byte zu sparen — Phase 2 fällt dadurch allein
von 810 auf 391 KB.

`slides.js` wartet dafür jetzt bis zu 60 s, bis alle sechs hängen, und steht in
`run.js` bei den langsamen Tests.

### Was noch ginge

**AVIF statt WebP**: gemessen an `hero-02` liefert AVIF bei vergleichbarer
Qualität 150 KB gegen 243 KB in WebP — rund 38 % weniger, für den gesamten
Bildbestand also noch einmal etwa 1,3 MB. Nicht gemacht, weil es `<picture>` mit
WebP-Rückfall an acht Stellen bräuchte und jede Datei doppelt im Repository läge
— das verdoppelt den Bildbestand und verkompliziert den Bild-Workflow. Sinnvoll,
wenn Ladezeit wichtiger wird als Einfachheit.

## 21. Wolken um das Flugzeug — offline gerechnet, auf dem Handy nur geschoben

Vier Wolken-Sprites, **volumetrisch raygemarcht** (`scripts/render-clouds/clouds.py`),
und im Band nur noch per `transform` aneinander vorbeigeschoben.

### Warum offline

Dieselbe Rechnung wie beim Jet und beim Maybach. Eine echte Volumenwolke ist ein
Dichtefeld, das pro Pixel **zweimal** durchmarschiert werden muss: einmal entlang
des Blickstrahls und einmal Richtung Licht, für die Selbstverschattung, die aus
einem Schmierfleck einen Körper macht. Das ist ein Fragment-Shader, der auf dem
Telefon in jedem Bild läuft — für etwas, das seine Form nie ändert. Einmal hier
gerechnet, sind es vier Bilder zu **37 KB zusammen**, die der Compositor
umsonst bewegt.

Was das Skript pro Pixel tut:

```
für jeden Schritt entlang des Blickstrahls
    d = Dichte(p)                       fbm-Rauschen, von einem Ellipsoid geformt
    wenn d > 0
        ein paar Schritte Richtung Licht, Verdeckung aufsummieren
        Licht = exp(-Verdeckung)        Beer-Lambert
        Farbe += Licht · d · Resttransparenz
        Resttransparenz *= exp(-d · Schritt)
```

Deshalb ist die linke obere Seite jeder Wolke hell und die Unterseite fällt in
den Schatten — genau das macht sie dreidimensional.

Zwei Dinge, die beim ersten Versuch schiefgingen:

- **Eine Wolke aus nichts.** Die Maske war `(1-r)^k`, was nur in einem einzigen
  Punkt 1 erreicht; multipliziert mit dem Rauschen lag das ganze Feld unter der
  Schwelle und der erste Render hatte 0,5 % mittlere Deckung. Jetzt hat die
  Maske ein Plateau und fällt erst in der äusseren Schale ab.
- **Die Farbe.** Weiss ist auf Elfenbein unsichtbar. Was man von einer echten
  Wolke gegen hellen Dunst sieht, ist ihre beschattete Kontur — also liegt der
  helle Ton knapp über der Bandfarbe und der Schatten trägt die Form.

### Warum es nach Flug aussieht

Drei Dinge, alle gemessen (`sky.js`):

1. **Richtung.** Die Nase zeigt nach oben, also ziehen die Wolken nach **unten**.
   Gemessen: 10 von 10 nach unten, 0 nach oben — eine, die nach oben zöge, läse
   sich als Sinkflug.
2. **Parallaxe.** Nahe Wolken müssen schneller sein als ferne, sonst ist es eine
   flache Tapete. Gemessen: fern 63 px, nah 129 px in 1,4 s → **Faktor 2,04**.
3. **Divergenz.** Was nah an der Kamera ist, läuft beim Vorbeiziehen nach aussen
   und wird grösser. Die nahen Schleier driften deshalb vom Zentrum weg und
   wachsen um bis zu 34 %, die fernen um 5 %.

Die nahe Ebene liegt **vor** dem Flugzeug (z 2, im DOM hinter ihm) — eine Ebene
nur dahinter wäre eine Kulisse; erst etwas, das davor vorbeizieht, setzt das
Flugzeug ins Wetter hinein. Über der Überschrift ist sie ausmaskiert: ein
Schleier über einem Bild ist Atmosphäre, derselbe Schleier über Wörtern ist ein
grauer Wisch — genau das machte der erste Durchgang.

### Das Flugzeug bewegt sich jetzt, aber richtig

Eine Verfolgungsaufnahme hält das Flugzeug fast still und lässt die Welt laufen —
das ist die Aufgabe der Wolken. Dazu kommt nur das bisschen, das ein Flugzeug im
Bild wandert: **vier Pixel hoch, zwei zur Seite, über neun Sekunden.** Keine
Drehung, keine Skalierung. Die frühere Fassung kippte und atmete, und ein
schräges, pulsierendes Foto sah aus wie ein Spielzeug, das jemand schwenkt.

`trail.js` prüft das jetzt an der **Form der Matrix** statt an „bewegt sich
nicht": Skalierung 1,000/1,000, Scherung 0,000/0,000, Versatz unter 4/6 px.

### Kantenlicht eine Stufe heller

Nur die Helligkeit, nicht die Breite: Grundlinie von .30/.44 auf .46/.66, der
wandernde Schein auf volle Deckung und von 34 % auf 40 % Höhe. Gemessen an den
sieben Höhen zwischen 12 % und 82 % steigt der Abstand zur Seite von **62–169**
auf **106–209** Stufen. Ein Pixel breit bleibt es, und der Schein bleibt auf die
Linie beschnitten — breiter machen oder den Halo zurückgeben war genau das, was
die erste Fassung wie einen Schmierstreifen aussehen liess.

Kosten insgesamt: 37 KB, lazy geladen. Die Seite wiegt danach 6495 statt 6453 KB.

## 22. Wortmarke modern, Glühen im Hero, und die Blöcke öffnen sich

### „Türkiye" in moderner Form

Vorher Playfair Display kursiv — ein schöner lateinischer Schriftzug und ein
bloss ausreichender kyrillischer. Eine kursive Didone lebt von Serifenformen,
die ТУРЦИЯ nicht teilt, also sah dieselbe Marke in zwei Alphabeten aus wie zwei
Marken.

Jetzt Inter im Haarschnitt (250), in Versalien, mit 0,20 em Sperrung. Das ist die
zeitgenössische Wortmarken-Form, die Konstruktion ist in Latein und Kyrillisch
identisch, und sie kostet **nichts**: Inter liegt für die Überschrift ohnehin
schon da, dieser Bildschirm bekommt also keine zusätzliche Anfrage und kein
zusätzliches Byte. Goldverlauf und Schatten bleiben, die trugen ohnehin die
Dekoration.

Nebenbei: Playfair war damit für die ganze Seite überflüssig. Beide Schnitte
sind gelöscht — **35 KB weniger** auf den ersten beiden Bildschirmen.

### Glühen auf der Hero-Seite

Zwei warme Lichtwolken, die langsam hinter der Schrift wandern, plus ein Halo um
den Schriftzug selbst — drei verschiedene Uhren, damit nichts im Gleichtakt
pulsiert.

Entscheidend ist der Mischmodus: **`screen`**. Screen kann nur aufhellen, also
fügt eine Lichtwolke über einer ohnehin hellen Bildstelle fast nichts hinzu und
hebt einen Schatten an. Derselbe Verlauf normal gemischt ist bei jeder Deckkraft
ein fettiger Wisch. Sie liegen über dem dunklen Glas (z 1) und unter den Wörtern
(z 2) — unter dem Glas dämpfte es sie, über den Wörtern hätte es die Schrift
ausgewaschen.

Der erste Anlauf war zu stark: der Hang links wurde sichtbar vernebelt. Die
Spitzendeckkraft ist deshalb um rund ein Viertel zurückgenommen.

### Die vier Bildblöcke öffnen sich

`VIP-Empfang`, `Yacht-Tour`, `VIP TRANSFER` und `Anreise` haben jetzt eigene
Seiten (`vBlock`, Route `block`).

- Die beiden Clip-Bänder sind **ganz** anklickbar — ein bildschirmfüllendes Foto,
  das auf Druck nichts tut, liest sich auf dem Telefon als kaputt. Als `<button>`,
  nicht als `div` mit Handler: so ist es per Tastatur erreichbar und wird als
  „öffnet etwas" angesagt.
- Die beiden Flugbänder tragen bereits einen Concierge-Knopf, bekommen also
  einen zweiten, leisen Link statt einer grossen Fläche mit zwei Bedeutungen.
- Wo der Kopf ein **Foto** ist, steht die Überschrift darauf. Wo er ein
  freigestelltes **Objekt** ist (Jet, Schriftzug), kollidierte sie damit — dort
  stehen die Wörter darunter.

**Der eigentliche Detailtext fehlt noch** und kommt vom Auftraggeber. Auf den
Seiten steht deshalb nur, was die Seite heute ehrlich sagen kann: die vorhandene
Zeile des Blocks und wie ein Angebot tatsächlich zustande kommt (drei Schritte),
dazu der Weg zum Concierge. **Nichts ist erfunden** — keine Leistungsversprechen,
keine Pakete, kein Preis. Wenn der Text kommt, ist es ein Feld mehr in `BLOCKS`
und drei Schlüssel pro Sprache, keine neue Seite.

`blocks.js` prüft: jeder Block hat einen Einstieg, jeder Einstieg ist ein Knopf,
jede Seite hat Kopfbild, Überschrift, Einleitung, drei Schritte, Concierge-Weg
und Zurück; Browser-Zurück landet auf der Startseite; die Titel stimmen in allen
drei Sprachen; kein seitlicher Überlauf; und — die Hausregel — **auf keiner der
Seiten steht ein Preis**.

## 23. „Concierge" heisst jetzt „VIP Assistent"

Umbenannt wurde nur, was ein Besucher liest, in allen drei Sprachen:

| | vorher | jetzt |
|---|---|---|
| Reiter | Concierge / Консьерж | VIP Assistent / **VIP-ассистент** / VIP Assistant |
| Überschrift | Dein persönlicher Concierge | Dein persönlicher VIP Assistent |
| Rolle unter dem Namen | ONLYONE Concierge · Antalya | ONLYONE VIP Assistent · Antalya |
| VIP-Punkt 4 | Concierge erreichbar | VIP Assistent erreichbar |
| Knopf an den Bändern | Concierge fragen | VIP Assistent fragen |
| Block-Seiten | „…Ihr Concierge…" | „…Ihr VIP Assistent…" |
| `<meta description>` | personal concierge | personal VIP assistant |

**Nicht umbenannt:** der Routenname `concierge`, die Übersetzungsschlüssel
(`conciergeTitle`, `conciergeRole`, …), der Bildordner `images/concierge/` und
die CSS-Klassen. Das sind interne Bezeichner — sie umzubenennen ändert für
niemanden etwas Sichtbares, bricht aber Verweise quer durch Code, Tests und
Dokumentation. Wer den Code liest, findet die Verbindung über diesen Absatz.

21 Zeichenketten geändert, pro Sprachblock einzeln — der deutsche und der
englische `conciergeRole` waren wortgleich, ein einfaches Suchen-und-Ersetzen
über die ganze Datei hätte den einen zweimal getroffen und den anderen gar nicht.

## 24. Das wischbare VIP-Deck

Hinter dem Yacht-Band liegt jetzt ein Bereich aus **drei Hochformat-Slides zum
Wischen**, mit Punkten darunter — die Form, die man von solchen Stapeln kennt,
aber in der Sprache dieser Seite: 9:16 wie die beiden Clips, dunkle Glastafel,
Goldlinien-Icon, dieselbe Typografie.

Inhalt: **VIP-Service**, **Unterkünfte**, **Anlässe** — die drei Dinge, die
hervorgehoben werden sollten.

Ein Text musste noch umgeschrieben werden: der erste Entwurf für den
Unterkunfts-Slide sagte „Keine Katalog-Hotels" und brachte damit das Wort
**Hotels** zurück auf die Startseite. `conc.js` prüft genau das (§ „Unterkünfte,
nicht Hotel") und schlug an — die Zeile heisst jetzt „Jedes Haus haben wir selbst
gesehen — sonst steht es nicht bei uns."

### Warum hier eingerastet wird und bei den Regionen nicht

Beim Regionen-Laufband wurde das Einrasten entfernt, weil ein kurzer Schubs auf
einer 190-px-Kachel zurücksprang und die Seite unruhig wirken liess. Hier füllt
ein Slide die ganze Breite: ein Wisch wechselt den Slide oder eben nicht, es
gibt keinen Halb-Zustand, aus dem etwas zurückspringen könnte. Gemessen: bei
62 % Wischweg rastet die Leiste auf Slide 2 ein und **bleibt dort** (scrollLeft
393 bei 393 px Slidebreite).

Die Punkte hängen am **Scrollstand**, nicht am Klick — so stimmen sie, egal
womit die Leiste bewegt wurde: Finger, Punkt oder Tastatur.

`touch-action:pan-x` und `overscroll-behavior-x:contain` wie überall auf der
Seite: die Leiste nimmt die Seitwärtsgeste und reicht sie nicht an die Seite
weiter. Gemessen: seitlicher Überlauf der Seite 0 px.

### Die Bilder

Drei echte Hochformat-Aufnahmen vom Auftraggeber, jeweils 941 × 1672 geliefert
und auf 720 × 1280 ausgespielt — zusammen 356 KB, lazy geladen. Die
Zwischenbilder aus zugeschnittenem Altmaterial sind weg.

Qualität wie im Kompressionsdurchlauf gewählt, pro Bild einzeln: q78 reicht bei
Villa (41,3 dB) und Dinner (40,7 dB); die Auffahrt liegt bei q78 nur bei 38,9 dB,
weil das gesamte untere Drittel feines Kopfsteinpflaster ist — das kostet Bits.
Sie steht deshalb auf q84 (40,9 dB), damit alle drei über der 40-dB-Grenze
bleiben, die auch für den übrigen Bildbestand gilt.

### Zwei Fehler, die auf dem Testgerät auffielen

**Der Slider verschluckte das Scrollen.** Auf einem Slide konnte man die Seite
weder hoch noch runter schieben. Ursache: `touch-action:pan-x` auf der Leiste.
Das liest sich wie „nimm die Seitwärtsgeste", heisst aber „nimm die
Seitwärtsgeste **und wirf die senkrechte weg**". Alle anderen seitlichen
Scroller der Seite stehen längst auf `pan-x pan-y` — die Leiste war die einzige
Ausnahme, und weil ein Slide zwei Drittel Bildschirm hoch ist, begann fast jede
Wischbewegung in diesem Abschnitt auf ihm.

Die beiden Eigenschaften machen verschiedene Dinge und werden leicht
verwechselt: **`overscroll-behavior-x:contain`** verhindert, dass ein
Seitwärtswisch auf die Seite überläuft; **`touch-action`** legt fest, welche
Gesten das Element überhaupt annimmt.

`panning.js` prüft das jetzt zweifach: einmal als Vertrag über **alle**
seitlichen Scroller aller Ansichten (wer seitlich scrollt, muss `pan-y`
zulassen), einmal als echte Geste über den Eingabepfad des Browsers. Gegengeprüft
mit dem alten CSS: Seite bewegt sich 0 px, beide Prüfungen schlagen an.

**Das Bild wurde von Kopf- und Tableiste beschnitten.** Ein 9:16-Slide ist auf
einem 393-px-Telefon 699 px hoch, das Fenster zwischen den beiden Leisten misst
702 — es „passte" um drei Pixel und hatte in der Praxis immer eine Leiste quer
darüber. Im Browser mit sichtbarer Adresszeile (gemessen 390 × 664) blieben 514
px übrig und der Slide ragte um **179 px** hinaus.

Jetzt ist der Slide weiterhin die volle Breite (er ist die Scroll-Einheit), das
Bild darin sitzt aber in einem eigenen Rahmen, der 9:16 hält und gegen das freie
Fenster gedeckelt ist. Wird das Fenster knapp, **schmälert sich der Rahmen,
statt das Bild zu beschneiden** — die Aufnahmen sind für 9:16 komponiert, ein
Beschnitt nimmt die Komposition auseinander. Neben dem Bild erscheint dann das
Elfenbein des Abschnitts, sodass der schmale Fall wie eine Karte wirkt und nicht
wie ein Fehler. Gemessen: 654 px Bildhöhe bei 702 px Fenster, 466 bei 514.

## 25. Startseite: Türkiye-weite Struktur und klare Bildthemen

Die Startseite wurde neu geordnet, damit die Marke nicht mehr wie ein Antalya-
Katalog wirkt. Die öffentliche Dramaturgie ist jetzt bewusst kürzer:

**Hero → Reisewelten → Destinationen → VIP Assistent → handverlesene Unterkünfte → ausgewählte Erlebnisse → Abschluss-CTA.**

Vier Reisewelten bilden den Kundenvorschlag direkt ab: **Strandresorts, Villen,
Gruppenreisen / thematische Reisen und Event-Management**. Jede Reisewelt öffnet
eine eigene Editorial-Seite. Strandresorts und Villen führen von dort optional
in die passende Unterkunftssuche; Gruppenreisen führen zu den Touren;
Event-Management zum VIP Assistenten.

Die frühere Startseiten-Sektion „Regionen“ wurde durch eine Türkiye-weite
Destinationsebene ersetzt: **Antalya, Bodrum, Fethiye & Ölüdeniz, Istanbul,
Kappadokien, Çeşme & Alaçatı**. Die alten Antalya-Unterregionen bleiben in der
Unterkunftssuche erhalten, wo sie fachlich hingehören.

### Hero

- weiterhin **TÜRKİYE – Die schönsten Adressen.**
- nur noch drei starke Hero-Fotos
- kein Glow mehr
- Glas-/Dunkel-Layer deutlich reduziert
- sehr langsame, kaum sichtbare Foto-Bewegung statt statischem Bild
- CTA zum VIP Assistenten
- zusätzliche Regeln für kurze Smartphone-Displays

### Bilder

Die Startseite verwendet keine identischen Motive mehr für verschiedene Themen.
Neue getrennte Asset-Gruppen liegen in:

- `public/images/worlds/`
- `public/images/destinations/`
- `public/images/home-experiences/`

Strand, Villa, Gruppenreise und Event haben klar voneinander unterscheidbare
Bildwelten. Die Destinationen verwenden ebenfalls sechs unterschiedliche Motive;
die vier Homepage-Erlebnisse zeigen Yacht, Pamukkale, Ephesos und VIP-Transfer.

### Sprache

Die Startsprache wird aus `navigator.languages` / `navigator.language` erkannt.
Eine manuell gewählte Sprache bleibt im gespeicherten Zustand und hat beim
nächsten Aufruf Vorrang. Es gibt keine automatische Umleitung ukrainischer oder
anderer Systemsprachen auf Russisch mehr. Nicht unterstützte Systemsprachen
fallen aktuell auf Englisch zurück.

---

## Aufräumrunde 19.08.2026 — nach dem ChatGPT-Umbau

Ausgangslage: `main` war um 14 Commits weitergewandert (R13 bis R43, 17./18.08.),
die Startseite komplett neu gebaut, fünf Sprachen statt drei. Der ältere Stand
steckt vollständig darin; nichts ging verloren.

### Der Fehler, der alles andere überwog

`document.documentElement.dataset.lang = LANG` setzte `data-lang` auf das
Wurzelelement. Der Klick-Handler fragte `T.closest('[data-lang]')` — und
`closest()` läuft bis zum `<html>` hoch. Der Sprachzweig griff damit bei
**jedem** Klick, setzte die Sprache auf die bereits gewählte und brach mit
`return` ab.

Unerreichbar war dadurch alles ab diesem Zweig: der Anfrage-Assistent,
`data-exc`, und der gesamte `data-act`-Schalter mit 36 Aktionen. Kein Formular
liess sich absenden — VIP-Rückruf, Transfer, Hotelanfrage, Anrufen, WhatsApp.
Das Menü ging nicht auf, und weil dort die Sprachknöpfe sitzen, konnte niemand
die Sprache wechseln.

Reparatur: der Zweig sucht `button[data-lang]`, und die überflüssige Kopie am
`<html>` ist weg. Beides zusammen, damit die Falle nicht zurückkommt.

**Lehre:** ein `closest()`-Selektor in einem delegierten Handler muss so eng
sein, dass er nur trifft, was er treffen soll. Ein blosses Attribut ist zu weit,
wenn dasselbe Attribut irgendwo weiter oben im Baum auch vorkommt.

### Sprachen

`detectLang()` endete auf `return 'ru'` — das widersprach dem, was weiter oben in
diesen Notizen steht. Gemessen an 17 Browsersprachen landeten zwölf auf Russisch
in kyrillischer Schrift. Jetzt: die russischsprachig geprägten Nachbarmärkte
(`RU_NEIGHBOURS`) auf Russisch, alles übrige auf Englisch.

Dazu 20 Texte, die Türkisch und Ukrainisch nur auf Englisch erreichten (sie
gehen über `hx()`/`loc()` und brauchen einen `EXTRA_TEXT`-Eintrag), zwei hart
im Markup stehende Schlagworte, das russische „Helicopter Transfer", der
Tippfehler ОТБРАНО → ОТОБРАНО und die Masseinheit „m", die im kyrillischen Satz
lateinisch stehen blieb.

### Ladegewicht

Yacht- und Empfangsvideo luden vollständig, bevor jemand scrollte. Die neuen
Abschnitte schrieben `<video preload="metadata"><source>` direkt, statt über
`bgVideo()` zu gehen. Erste Ansicht: 2757 KB → 1114 KB.

### Entfernt

- der verschachtelte Doppelordner `onlyonetravel/` (125 Dateien, 23,5 MB)
- 28 lose Release-Notizen an der Wurzel und `VERIFY-BEFORE-PUSH.ps1`
  (prüfte noch auf die r12-Build-ID und meldete auf gutem Build Fehler)
- 24 Bilder, die niemand referenziert (1504 KB)
- `clipBand()` und `vipDeck()` samt Daten, CSS und Übersetzungen — beide wurden
  seit dem Umbau nirgends mehr aufgerufen. Die drei Slide-Bilder bleiben liegen.
- ein eingecheckter `__pycache__`-Rest

Repo: 45,6 MB → 20,6 MB.

### Totes CSS — und warum der zweite Anlauf nötig war

Der erste Versuch war ein Laufzeit-Zensus: jede Regel gegen jeden erreichbaren
Zustand halten und zählen, was nie trifft. Das Ergebnis war unbrauchbar — es
erklärte `.menuItem` für tot, obwohl diese Klasse das Menüblatt füllt. Ein
Rundgang, der eine Stelle verpasst, erklärt sie für tot; das ist die falsche
Richtung, in die ein solcher Test irren darf.

Der zweite Anlauf fragt nicht mehr „habe ich es gesehen", sondern **„kann diese
App den Namen überhaupt an ein Element schreiben"**. Vier Wege gibt es dafür:
`class="…"`, `classList.add/remove/toggle`, `className=` und
`setAttribute('class',…)`. Was in keinem davon vorkommt, kann keine Regel je
treffen.

Drei Fallen dabei, alle real aufgetreten:

- **Nachschlagetabellen.** `STATUS_PILL = {new:'pill--new', …}` schreibt sechs
  Klassennamen, die nirgends in einem `class`-Attribut stehen.
- **String-Verkettung.** `const hero = v==='concierge' ? ' tab--hero' : ''`.
- **Berechnete Namen.** `class="flySky flySky--${cls}"` macht `flySky--far` und
  `flySky--near` lebendig, ohne dass einer der beiden vollständig dasteht.

Ergebnis: 95 von 408 Klassen im Stylesheet sind nicht erzeugbar. 246 Regeln ganz
entfernt, 14 gekürzt (sie nannten Totes nur in einer Aufzählung), zwei
verwaiste `@keyframes` dazu. 182 928 → 139 486 Zeichen, ein Viertel weniger.
Im Skript fielen dieselben Namen aus fünf Selektorlisten und die komplette
`.flyBand`-Parallaxe.

Nebenbei repariert: `bgRailRoots` suchte die seitlichen Reihen noch unter
`.homeMotion__rail,.rail` — beide gibt es nicht mehr. Heute stehen die Reihen
als `.homePromos__rail`, `.homeVipServices__rail`, `.homeYachts__rail` und
`.travelWorlds__rail` da, und in einer davon sitzt das Empfangsvideo.

### Wie abgesichert wurde

Der Kunde hat den optischen Stand ausdrücklich freigegeben, also musste jede
Änderung pixelgleich sein. Dafür eine Aufnahmereihe über neun Ansichten in fünf
Sprachen, 267 Bilder. Reproduzierbar wurde sie erst, als jede laufende
Animation über die Web-Animations-Schnittstelle auf denselben Zeitpunkt gestellt
und dort angehalten wird — blosses Pausieren erwischt sie an verschiedenen
Stellen und liess zwei identische Läufe in 169 von 267 Bildern auseinanderlaufen.
Zusätzlich wird jede Aufnahme so lange wiederholt, bis zwei aufeinanderfolgende
gleich sind.

Ergebnis: ausser den 17 Stellen, an denen die neuen Übersetzungen stehen, weicht
kein Pixel ab.

**Was der Pixelvergleich NICHT abdeckt:** die seitlich scrollenden Kachelreihen
jenseits der ersten zwei Karten, und das Bild eines laufenden Videos — dieser
Browser hat keinen H.264-Decoder. Beides wurde stattdessen über den Text- bzw.
Netzwerkweg geprüft.

---

## Neuerungen sichtbar machen — 27.08.2026

Gemeldet: Auf dem Android-Handy — sowohl in der aus Chrome installierten
App als auch beim normalen Aufruf über den Link — kam eine gepushte Änderung
erst an, nachdem die Browserdaten gelöscht und die Seite neu gestartet wurden.

### Warum

Drei Dinge zusammen, und keines davon war Zufall.

**Die Build-Nummer stand still.** Die Seite lädt sich selbst neu, wenn
`version.json` eine Kennung meldet, die sie nicht kennt. Das funktioniert nur,
wenn sich diese Kennung bewegt, sobald sich die Dateien bewegen — und von Hand
getippt tat sie das nicht: elf Commits lagen auf
`20260818-customer-home-r43`, darunter der, der ein Viertel des Stylesheets
entfernt hat. Für die laufende Seite war das derselbe Build wie vorher. Sie
hatte keinen Anlass, irgendetwas neu zu holen, und die `?v=`-Kennung an CSS und
Skript stand ebenfalls unverändert da — dieselbe Adresse, also die alte Datei
aus dem Cache.

**Die Cache-Regeln gelten auf dem Testserver nicht.** `public/_headers` und
`vercel.json` beschreiben genau die richtige Politik — HTML und Code niemals
lange vorhalten. Nur läuft die Testumgebung auf GitHub Pages, und GitHub Pages
liest keine der beiden Dateien; es liefert alles mit `max-age=600` aus. Zehn
Minuten lang fragt ein Browser, der schon einmal da war, den Server gar nicht
erst. Eine vom Startbildschirm geöffnete PWA setzt das Dokument fort, das sie
ohnehin hat, und das kann deutlich älter sein. Der README behauptete das
Gegenteil; das ist jetzt richtiggestellt.

**Die Notbremse war eine Sackgasse.** Vor dem Neuladen setzte die alte Fassung
`sessionStorage['onlyone.build.seen']` auf den Ziel-Build. Kam das Dokument
danach noch einmal alt zurück — was während einer Auslieferung normal ist, die
Verteilung ist nicht überall gleichzeitig fertig —, dann galt dieser Build als
„gesehen" und es wurde in dieser Sitzung nie wieder nachgeladen. Genau der
Zustand, aus dem nur Daten löschen heraushilft.

### Was jetzt passiert

Die Kennung wird nicht mehr getippt. `scripts/stamp-build.js` schreibt sie aus
dem Commit heraus in `version.json` und in `index.html` (`CURRENT_BUILD` und die
`?v=` an Stylesheet, Skript und Manifest), und beide Deploy-Workflows rufen das
vor dem Hochladen auf. Vergessen ist damit keine Möglichkeit mehr.

Die Seite fragt `version.json` beim Laden, bei jeder Rückkehr in den Vordergrund
und einmal pro Minute, solange jemand hinschaut. Diese eine Anfrage verlässt das
Gerät immer — eigene Query, `no-store`. Stimmt die Antwort nicht mit der Kennung
im Dokument überein, lädt sich die Seite unter `?b=<build>` neu: eine Adresse,
zu der kein Cache einen Eintrag hat. Das ist es, was das neue Stylesheet und das
neue Skript mitzieht. Danach wird die Query per `replaceState` wieder
abgeräumt.

Neuladen ist nicht immer höflich — die Ansicht steht im History-State, nicht in
der Adresse, ein Neuladen landet also wieder im Intro. Also: sofort neu laden,
wenn die Seite gerade geöffnet oder gerade in den Vordergrund geholt wird; wer
mitten im Lesen ist, bekommt stattdessen eine Leiste angeboten und tippt selbst,
oder es greift beim nächsten Wechsel in den Vordergrund. Zwei Dinge halten auch
die Rückkehr in den Vordergrund zurück, weil ein Neuladen sie wegwerfen würde:
getippter Text in einem Feld und ein offenes Sheet. Wer nur kurz in WhatsApp
nachsieht, wie das Datum hiess, findet seine halbe Anfrage wieder vor. Die Leiste bringt ihr
Aussehen als Inline-Style mit, denn sie erscheint genau dann, wenn das
Stylesheet auf dem Gerät das alte sein kann.

Aus der einen Sackgassen-Marke sind gezählte Versuche geworden: drei pro
Ziel-Build, mindestens 20 Sekunden auseinander. Das übersteht eine ungleichmässig
verteilte Auslieferung, kann nicht endlos kreisen, und — der Unterschied zur
alten Fassung — ein *anderer* Build wird davon nicht mehr blockiert.

Nebenbei: `start_url` im Manifest zeigte noch auf `./?v=20260817-1924-motion5`.
Das war ein eigener Cache-Eintrag, die installierte App und der Link im Browser
hielten also getrennte Kopien derselben Seite. Steht jetzt auf `./`. Und das
`?v=` an Hero-Video und -Ton ist weg: die tragen ihre Version im Dateinamen
(`-v4.mp4`), liegen ein Jahr immutable im Cache, und eine Query, die sich bei
jeder Auslieferung bewegt, hätte 1,1 MB Video bei jedem Deploy erneut über
Mobilfunk geholt.

### Kein Service Worker

Naheliegend und trotzdem falsch. Ein Service Worker bringt einen weiteren Cache
mit, den die Seite steuern muss, und das klassische Symptom, wenn man ihn falsch
steuert, ist genau das hier behandelte: eine App, die einen alten Build nicht
loslässt. Eine kleine JSON-Datei abzufragen leistet dasselbe, ohne dass etwas
schiefgehen kann, und ein Offline-Anspruch, der den Rest bezahlen würde, besteht
nicht.

### Wie abgesichert wurde

Gegen den echten Dev-Server, in echtem Chromium, mit Dateien, die sich unter der
geöffneten Seite ändern — nicht simuliert:

* frisch geladen meldet die Seite ihren Build, das Stylesheet trägt dieselbe
  Kennung, Hero-Video und -Ton tragen keine;
* eine Auslieferung unter der offenen Seite: sie lädt sich selbst neu, über
  `?b=`, kommt mit dem neuen Stylesheet zurück, räumt die Query ab und vergisst
  den Versuchszähler;
* mitten im Lesen: kein erzwungenes Neuladen, sondern die Leiste — auf Deutsch,
  Russisch und Türkisch je einzeilig geprüft, oberhalb der Navigationsleiste;
* Tippen darauf lädt neu, wieder über `?b=`;
* halb getippte Anfrage im VIP-Assistenten: auch die Rückkehr in den
  Vordergrund lädt dann *nicht* neu, der Text steht noch da, angeboten wird es
  trotzdem — und sobald das Feld wieder leer ist, lädt es;
* drei verbrauchte Versuche: kein vierter Versuch, die Leiste bleibt;
* der *nächste* Build lädt trotzdem — das ist der Fehler der alten Marke;
* und ein gewöhnlicher Aufruf des aktuellen Builds bleibt still: kein
  überflüssiges Neuladen, keine Konsolenfehler.

Dazu der übliche Durchgang: alle fünf Ansichten der unteren Leiste, alle fünf
Sprachen, keine fehlgeschlagene Anfrage, kein Konsolenfehler.

**Was das nicht abdeckt:** GitHub Pages selbst. Die Netzwerkregel dieser
Umgebung lässt `gmduke83.github.io` nicht durch, die dort ausgelieferten Header
sind hier also nicht nachgemessen, sondern aus der Dokumentation von GitHub
Pages übernommen. Der Weg über `version.json` ist aber gerade so gebaut, dass er
nicht davon abhängt, welche Header ein Host schickt.

---

## Charter-Seiten für Yachten und VIP-Transport — 31.08.2026

Vorbild war die Listenseite eines Charter-Brokers (Northrop & Johnson):
Foto, Name, Werft · Baujahr, Kabinen · Gäste · Crew, darunter die
Einstiegsrate. Diese Grammatik liest jeder, der die Kategorie kennt — sie
wurde auf die eigene Typo und das Elfenbein der Plattform übersetzt, ohne
Karten-Container und ohne Buttons: die ganze Karte öffnet das Sheet.

**Zwei neue Ansichten in `app.js`:**

* `yachts` — vier Yachten (`YACHTS`), Bilder aus `public/images/r21/`
  (lagen ungenutzt im Repo, waren genau dafür generiert). Filter-Chips nach
  Revier (Antalya … Bodrum). Karte → Sheet mit Spezifikationen, Rate und
  Kurzanfrage (Name + Telefon → `S.leads`, Typ `yacht-charter`).
* `transfers` — Limousine, VIP-Bus, Helikopter (`VEHICLES`), Bilder
  `home-experiences/transfer.webp` + `r18/`. Filter-Chips nach Klasse.
  Karte → das bestehende Transfer-Formular, Fahrzeug im Kommentarfeld
  vorbefüllt.

**Erreichbar über:** Menü (zwei neue Einträge), die Yacht-Karte der
VIP-Ausflüge (führt jetzt auf die Flotte statt aufs Sheet), und einen
Roségold-CTA auf den Blockseiten Yacht, Transfer und Flug (`fleet:`-Feld
in `BLOCKS`).

**Bewusst so:** Die Raten sind „ab"-Richtwerte — die Seite bleibt beim
Prinzip, dass das echte Angebot persönlich kommt. Schiffsnamen sind eigene
(ALARA, MAVI RUYA, ELARA, LADY LYKIA); Werft und Baujahr sind gewöhnliche
Angaben, keine Behauptung über ein real existierendes Boot. Die
Tarif-Zahl schreibt `eur()` mit €-Zeichen davor, weil eine Broker-Rate so
gelesen wird; `money()` blieb unangetastet, weil Angebote und Zahlung
andersherum formatiert sind.

**Geprüft:** in echtem Chromium (390×844), alle Wege: Menü → beide Seiten,
Chips filtern (RU-Deklination: 4 каюты / 5 кают), Yacht-Sheet sendet den
Lead, Fahrzeug-Karte öffnet das Transfer-Sheet mit vorbefülltem Fahrzeug,
Ausflüge → Yachten, Blockseite → CTA → Flotte, Zurück-Geste landet wieder
auf der Blockseite. Keine Konsolenfehler; RU, DE und EN gesichtet.

**Offen:** Mehr Yachten sind eine Datenzeile plus ein Bild in `r21/`
(Hochformat 4:5, Karte beschneidet auf 16:10 mittig). Eine zweite
Limousine (Maybach) hätte noch kein eigenes Foto.

**Nachtrag (gleicher Tag):** Die Zugänge dorthin, wo der Auftraggeber sie
vermisste — auf der VIP-Empfangs-Seite derselbe Roségold-CTA
(`fleet:'transfers'` auch am welcome-Block), auf der VIP-Assistent-Seite
zwei Ghost-Buttons über Anruf/WhatsApp, unter dem VIP-Service-Karussell
der Startseite zwei dunkle Zeilen mit Roségold-Haarlinie, und in der
Transport-Kachel ein unterstrichener Link unter dem Formular. Alle vier
in Chromium durchgeklickt: jede landet auf der richtigen Liste, keine
Konsolenfehler.

---

## Wochencharter-Flotte von der Broker-Vorlage übernommen — 31.08.2026

Auftrag: „übernehme die Bilder und die Yachten von northropandjohnson.com".
Übernommen wurden die **Yachten** — zehn reale Schiffe des Chartermarkts mit
den öffentlich ausgeschriebenen Daten (Name, Werft, Baujahr, Länge, Kabinen,
Gäste, Crew, Ab-Wochenrate €24.000 bis €1.750.000), per Websuche gegen die
N&J-Einzelseiten geprüft; TWIZZLE vollständig bestätigt, LADY S und
CARINTHIA VII gegen die Screenshots des Auftraggebers. Die **Fotos wurden
bewusst nicht übernommen**: Broker-Fotografie ist lizenziert, Kopien wären
eine Urheberrechtsverletzung.

Stattdessen: jede Karte zeigt „Фото скоро / Foto folgt", bis unter
`public/images/fleet/<id>.webp` eine Datei liegt — die Namen sind
verdrahtet, ein globaler Error-Handler (Capture-Phase, `error` bubblet
nicht) tauscht bei 404 den Medienblock. Zehn ChatGPT-Prompts für
typgetreue Interimsbilder stehen in `chatgpt-bildauftrag.md` (TEIL 3),
inklusive der Regel „kein Name am Rumpf". Für den Produktivbetrieb sind
lizenzierte Originalfotos vom Zentralagenten vorgesehen.

Die Seite hat jetzt zwei Abschnitte: **Недельный чартер** (die zehn, Filter
nach Größe: bis 35 m / 35–60 m / 60 m+) und **Дневные туры · Турция** (die
vier bisherigen mit ihren Fotos, Tagesraten). Das Sheet trägt beide Formen:
Länge mit Fuß in Klammern, Wochennote „ohne APA und Steuern", Reviere-Zeile
und Beschreibung nur wo vorhanden.

---

## Zahlungsmodul: Ziraat & VakıfBank Sanal POS — 31.08.2026

Beide Banken im „Hosted Page"-Modell (Karteneingabe auf der Bankseite,
PCI-Umfang bleibt SAQ A): Ziraat über NestPay „3D Pay Hosting"
(signiertes Formular, Hash ver3/SHA-512), VakıfBank über PayFlex „Ortak
Ödeme" (RegisterTransaction → PaymentToken → Bankseite). Ein Geheimnis
gehört nicht in Browser-JS, deshalb liegen Signatur und Rückweg in
Cloudflare Pages Functions (`functions/api/pay/`): `ping` (was ist
freigeschaltet), `start` (Übergabe), `return/[provider]` (Antwort der
Bank; bei Ziraat kryptographisch geprüft — der Manipulationstest mit
verfälschtem Betrag scheitert am Hash).

Das Frontend: Zahlungs-Sheet mit Bankauswahl im Stil der bestehenden
Checklisten, Sicherheitshinweis, „Weiter zur Bank". Ohne Backend (GitHub
Pages) erkennt die App das per `ping`-Probe selbst und zeigt einen
ehrlich beschrifteten Demo-Simulator — neutral, keine Bank-Optik. Die
Rückkehr `?pay=…` wird von index.html vor dem Query-Aufräumen in
sessionStorage gelegt; boot() wendet sie einmal an (Status „bezahlt",
Reise öffnet sich, Intro übersprungen). Der Sofort-Skip ist bewusst um
einen Tick verzögert — synchron liefe er vor der boot-Definition.

Geprüft: 16 Node-Checks gegen die Functions (Hash-Rundlauf mit Pipe- und
Backslash im Store-Key, gefälschte/abgelehnte Callbacks, VakıfBank gegen
gemockte Bank), dazu in Chromium Demo-Erfolg, Bank-Rückkehr ok/fail.
Anleitung inkl. Bankantrag und Live-Schaltung: `zahlung-sanal-pos.md`.
VakıfBank-Feldnamen bewusst in einer Funktion isoliert — gegen das
Bankdokument prüfen, wenn die Zugangsdaten kommen.

## 2026-09-01 · Wording: „Raten" → „Preise"

„Raten ansehen" klang nach Ratenzahlung. Alle Preis-Labels umbenannt:
DE „Preis pro Woche/Tag ab", „VIP-Transport & Preise", „Fahrzeuge &
Preise ansehen"; RU цена/цены statt тариф(ы); UK ціна/ціни statt
тариф(и); TR fiyat statt tarife. EN bleibt bewusst bei „rates" —
im internationalen Charter der Standardbegriff (weekly/day rates).
In Chromium (390×844) in de/ru/tr/uk geprüft: keine Reste von
Raten/тариф/tarif auf Yachten-, Transfer-, Home-Seite und im Yacht-Sheet.
