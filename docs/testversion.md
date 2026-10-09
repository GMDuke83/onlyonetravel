# Testversion (reine HTML-Seite)

Die Plattform braucht im Betrieb einen Server: Cloudflare Pages Functions und
eine D1-Datenbank (siehe `docs/deployment-checklist.md`). Ein reiner
Webspace (GitHub Pages, FTP-Hosting) kann das nicht ausführen.

Damit man die Plattform trotzdem ohne Server ausprobieren kann, gibt es eine
**Testversion**. `node scripts/build-demo.js` erzeugt sie in `dist/`.

## Wie sie funktioniert

- `demo/shim.js` wird als erstes Skript in `index.html` und
  `operations.html` eingefügt. Es fängt alle Aufrufe an `./api/*` ab.
- `demo/runtime.js` führt dafür **denselben Server-Code** aus `functions/`
  im Browser aus. Die Datenbank ist SQLite (sql.js, `demo/vendor/`). Die
  Migrationen aus `migrations/` laufen unverändert, Trigger eingeschlossen.
- Die Datenbank liegt im `localStorage` des Browsers.

## Was das bedeutet

- Jeder Besucher hat seine **eigene, leere** Plattform. Andere sehen seine
  Daten nicht. Ein zweites Gerät sieht also nicht, was auf dem ersten
  eingegeben wurde.
- Kundenseite und Mitarbeiterbereich können im **selben Browser in zwei Tabs**
  offen sein und arbeiten mit derselben Datenbank. Jeder Tab hat dabei eine
  eigene Anmeldung (Kunde bzw. Mitarbeiter).
- Test-Zugänge für den Mitarbeiterbereich (`operations.html`):

  | Token | Rolle |
  |---|---|
  | `demo-inhaber` | Inhaber (alle Rechte) |
  | `demo-vertrieb` | Vertrieb |
  | `demo-finanzen` | Finanzen |

- **Keine echte Zahlung:** Es gibt keine Bank-Zugangsdaten. Die Bankzahlung
  meldet „noch nicht freigeschaltet“. Zahlungseingänge kann ein Mitarbeiter
  wie im echten System manuell verbuchen.
- „Daten löschen“ oben im Banner setzt alles zurück.

## Lokal ansehen und testen

```sh
npm run build:demo
SERVE_DIR=dist BASE_PATH=/onlyonetravel/ npm run dev   # http://localhost:4173/onlyonetravel/
npm run test:demo                                      # kompletter Ablauf im Browser
```

## Veröffentlichung

`.github/workflows/deploy-github-pages.yml` baut die Testversion und
veröffentlicht sie unter `https://gmduke83.github.io/onlyonetravel/`. Das
passiert bei jedem Push auf `main`.

Die Testversion ist **nicht** für den Echtbetrieb gedacht. Für echte Kunden,
gemeinsame Daten und Sanal POS bleibt der Weg über Cloudflare.
