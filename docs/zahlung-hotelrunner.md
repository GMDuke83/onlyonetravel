# Zahlungen über HotelRunner — der Weg, der heute schon geht

Wir sind HotelRunner-Kunde (Store `only-one-suites-residence`). Das Panel
kann zu jeder Buchung eine **Zahlung anfordern** und erzeugt dafür eine
gehostete Zahlungsseite (Karte + 3-D Secure, EUR). Genau diese Links
trägt die App jetzt zum Gast.

## Der Ablauf

1. **Mitarbeiter** meldet sich im HotelRunner-Panel an (Benutzername +
   Kennwort, app.hotelrunner.com) und fordert dort die Zahlung an →
   HotelRunner erzeugt die Zahlungsseite
   (`…hotelrunner.com/orders/…/payments/…/edit?token=…`).
2. Link kopieren und in der App hinterlegen — zwei Wege:
   * **Zahlung anfordern** (Button im Mitarbeiter-Dashboard): Bezeichnung,
     Betrag, Link → erzeugt sofort eine offene Zahlung im Gastbereich.
     Gebaut für den schnellen Test auf einem Telefon, taugt genauso für
     echte Anzahlungen und Sonderposten.
   * An einer bestehenden Anfrage/Buchung: Status „Zahlung offen" →
     **Zahlungslink erstellen** → Link einfügen.
3. **Gast** sieht in „Meine Reise" den Bezahl-Button → „Sichere
   Zahlungsseite öffnen" → HotelRunner-Seite (neuer Tab, in der Sprache
   des Gastes — die App hängt `locale=` an) → zahlt mit 3-D Secure.
4. Die HotelRunner-Seite kann **nicht** in unsere App zurückmelden.
   Darum schließt der Mitarbeiter die Schleife: Zahlungseingang im
   HotelRunner-Panel prüfen → in der App **„Zahlung eingegangen"** →
   Status „Bezahlt", der Gast sieht die Bestätigung.

Wichtig: Die HotelRunner-Zugangsdaten bleiben im Panel. In die App
wandert nur der Zahlungslink — nie Benutzername oder Kennwort.

## Optik der Zahlungsseite

Die Kartenseite läuft auf HotelRunners Domain; ihr Aussehen kommt aus
den **Design-/Farbeinstellungen eures HotelRunner-Auftritts** (die Seite
lädt `colors.css?store_code=only-one-suites-residence` — also die im
Panel gepflegten Storefarben). Damit sie zur App passt, dort diese Werte
eintragen:

| Rolle | Wert |
|---|---|
| Seitenhintergrund | `#F7F3ED` (Elfenbein) |
| Flächen/Karten | `#FFFFFF` |
| Text | `#2A2119` |
| Akzent/Links | `#935640` (Roségold dunkel) |
| Buttons | `#2A2119`, Text `#FFFFFF` — oder Akzent `#D9B09C` mit dunklem Text |

Außerdem im Panel korrigieren: Der Store heißt derzeit „ONLY ONE
**Sutes** & Residences" — Tippfehler, der auf jeder Zahlungsseite steht
(→ „Suites").

## Was der Quelltext der Zahlungsseite bestätigt

* Kartendaten werden auf HotelRunners Seite eingegeben und direkt an
  HotelRunner gesendet — PCI liegt bei denen, nicht bei uns.
* 3-D Secure ist aktiv (Checkbox, vorausgewählt), Verkaufswährung EUR.
* Die Checkout-URL versteht `locale=` (z. B. `de-DE`, `ru-RU`, `tr-TR`) —
  die App hängt die Gastsprache automatisch an.
* Hinweis „You are not charged now" neben „Pay now": vor dem ersten
  echten Einsatz eine kleine Testzahlung machen und im Panel prüfen, ob
  sie als Abbuchung (nicht nur Kartengarantie) ankommt.

## Verhältnis zum Sanal-POS-Modul

Das direkte Ziraat/VakıfBank-Modul (`docs/zahlung-sanal-pos.md`) bleibt
eingebaut und wartet auf Bankverträge + Cloudflare. Sobald es live ist,
laufen beide Wege parallel: Direktbuchung über die Bankseite, Links über
HotelRunner. Hat eine Buchung einen Link, zeigt die App dem Gast den
Link-Weg (dort fließt heute echtes Geld); ohne Link erscheint die
Bankauswahl bzw. der ehrlich beschriftete Demo-Simulator.
