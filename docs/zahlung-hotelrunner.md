# Zahlungslinks — anbieterneutral (HotelRunner: geprüft und verworfen)

**Entscheidung 09/2026:** HotelRunner wird für Zahlungen nicht genutzt.
Der in der App gebaute Zahlungslink-Mechanismus bleibt bestehen und ist
bewusst **anbieterneutral** — später wird ein Finanzdienstleister
angebunden (PSP mit Link-/API-Angebot oder der eigene Bank-Sanal-POS).
Dieses Dokument hält den Mechanismus und die Rechercheergebnisse fest,
die zur Entscheidung geführt haben.

## Der Link-Mechanismus in der App (bleibt)

* **Mitarbeiter-Dashboard → „Zahlung anfordern"**: Bezeichnung, Betrag,
  Link der Zahlungsseite → erzeugt eine offene Zahlung im Gastbereich.
* An jeder Anfrage im Status „Zahlung offen": **„Zahlungslink
  erstellen"** — Link einfügen; die App fabriziert nie selbst einen.
* **Gast**: Zahlungs-Sheet wird link-first, sobald ein Link existiert —
  „Sichere Zahlungsseite öffnen" (neuer Tab).
* **„Zahlung eingegangen"**: Mitarbeiter prüft im Anbieter-Panel und
  setzt den Status auf „Bezahlt" — nötig, solange der Anbieter keine
  automatische Rückmeldung (Callback) an unsere Seite liefert.

Damit dockt jeder künftige Finanzdienstleister ohne Codeänderung an,
sobald er Zahlungsseiten-Links erzeugt. Liefert er eine **API**, wird
das Erzeugen des Links automatisiert (Cloudflare Function, wie beim
Sanal-POS-Modul); liefert er **Callbacks**, entfällt auch das manuelle
„Zahlung eingegangen".

## Warum nicht HotelRunner (Recherche, adversarial geprüft, 09/2026)

* **Keine Zahlungs-API.** Die Entwickler-API (developers.hotelrunner.com,
  api.hotelrunner.com/api/v2) kann nur Inventar und Reservierungen;
  Zahlungslinks („Ödeme Al") existieren nur manuell im Panel — der
  Panel-Schritt wäre für immer geblieben.
* **Kein eigener Acquirer.** „Finance and Payments" ist eine
  Orchestrierungsschicht über dem **eigenen Bank-Sanal-POS** der
  Unterkunft (genannte Integrationen: DenizBank, İş Bankası, GarantiPay;
  Ziraat/VakıfBank tauchen nirgends auf). Den Bankvertrag bräuchte man
  also ohnehin — dann kann er gleich ins eigene Modul.
* **Zusatzkosten** (Hybrid-Abo, z. B. min. $29.95/Monat + Prozentanteil
  am Buchungsumsatz) ohne Zahlungs-Fähigkeit, die unser eigenes Modul
  nicht hätte.
* Ein Login-Feld/iframe-Panel in unserer App verbietet sich (fremde
  Zugangsdaten, reCAPTCHA, Frame-Block).

Nebenbefund aus dem Test mit der echten HotelRunner-Zahlungsseite:
Checkout-URLs von hotelrunner.com verstehen `locale=` — die App hängt
bei solchen Links weiterhin automatisch die Gastsprache an (inert für
alle anderen Anbieter).

## Endzustand

Der eingebaute **Ziraat/VakıfBank-Sanal-POS-Weg**
(`docs/zahlung-sanal-pos.md`) bleibt der Zielzustand für volle
Automatisierung: Gast zahlt in der App auf der Bankseite, kryptografisch
geprüfte Rückmeldung, kein Panel, kein manueller Schritt. Bis Bankverträge
oder ein PSP da sind, zeigt die Seite den ehrlich beschrifteten
Demo-Simulator; mit Link läuft der Link-Weg.
