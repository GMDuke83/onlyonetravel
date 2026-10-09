# Betrieb und Staging-Abnahme

## Lokale Entwicklung

Node 24, `npm ci`, `npm run db:migrate:local`. `.dev.vars.example` nach `.dev.vars` kopieren, SITE_URL auf `http://localhost:8791` setzen. `npm run dev:backend` startet die **echten Pages Functions mit lokaler D1** auf Port 8791. `npm run dev` ist weiterhin nur die statische Vorschau, nicht die Plattform.

`node scripts/bootstrap-owner.js` erzeugt einen zufälligen persönlichen Zugang in `.local/owner-token.txt` und ausschließlich dessen SHA-256-Hash in `.local/bootstrap-owner.sql`. Beide Dateien sind ignoriert. SQL lokal anwenden:

```sh
npx wrangler d1 execute onlyone-travel --local --file=.local/bootstrap-owner.sql
```

`/operations.html` öffnen, Token aus der lokalen Datei verwenden. Weitere Mitarbeiter über Mitarbeiterverwaltung erstellen, Token sicher und manuell übergeben. Sperren beendet alle Sessions dieses Benutzers. Kein Kennwort und keine Session im localStorage. Für verlorenen Inhaberzugang muss ein berechtigter Infrastrukturadministrator den Tokenhash direkt ersetzen und zugehörige Sessions löschen; Self-Service-Recovery ist noch nicht implementiert.

Der gemeinsame `STAFF_LOGIN_KEY` funktioniert **nur** auf localhost/127.0.0.1 oder `.test`, mit explizitem `ALLOW_LEGACY_STAFF=true`, ausschließlich als automatisierte Testhilfe. In Staging/Produktion individuelle Benutzer verwenden und diese Variablen nicht setzen.

Prüfung: `npm run check`, `npm test`, `npm run check:functions`, `npx playwright install chromium`, `npm run test:browser`. Browsertests benötigen die in CI dokumentierte lokale Testhilfe. Kein anderer Server wird wiederverwendet. Testdaten sind synthetisch. Screenshots liegen unter `docs/screenshots`.

## Staging

- Cloudflare anmelden oder CI-Token mit minimalen Pages-/D1-Rechten einrichten.
- Separates Pages-Projekt und separate D1 für Staging erstellen. IDs in `wrangler.jsonc` ersetzen; Platzhalter sind absichtlich nicht deployfähig.
- SITE_URL exakt auf den Staging-Origin setzen. Kein Wildcard-CORS.
- D1 vor Migration exportieren; `npx wrangler d1 migrations apply onlyone-travel-preview --remote --env preview` mit geprüften Bindings ausführen.
- Inhaber in der **Staging-Datenbank** über Hash-SQL anlegen; Klartexttoken niemals committen oder als CI-Log ausgeben.
- `npm run check:functions`, dann ausdrücklich Preview-Branch deployen, z. B. `npx wrangler pages deploy public --project-name=YOUR-STAGING-PROJECT --branch=codex/oo-travel-platform`.
- Zwei echte Geräte: Anfrage, Angebot, Annahme, belegte Zahlung, Bestätigung, Kalender, Aufgaben, Portal und Audit prüfen. Unberechtigte Rollen testen. CSP/SameSite/Secure über HTTPS prüfen.
- Historischen localStorage-Import mit Kopie testen. Vorschau bestätigen, Wiederholung darf keine Dublette erzeugen. Originale bleiben erhalten; alte Zahlungen werden nicht übernommen.
- Kein DNS-Wechsel und kein Merge/Produktivdeploy ohne Staging-Abnahme.

## Bank / Partner

Ziraat bleibt durch `ZIRAAT_VERIFIED=false` gesperrt. Erforderlich: genauer Vertrag/API-Anbieter (NestPay oder anderes Verfahren), Bankdokument mit Hash-/Callback-Testvektoren, gehostete Eingabeseite, Test-Merchant, Store-Key, zulässige Währungen, 3DS-Anforderungen, verifizierte Return-URL und Verfahren für Abgleich/Erstattung. Erst nach Bank-UAT `ZIRAAT_VERIFIED=true` setzen. Geheimnisse in Cloudflare Secrets. Der vorhandene NestPay-Adapter prüft Betrag, Währung, Händler, eindeutigen Versuch und Hash; dies ist noch keine Bankzertifizierung.

Partner: bestätigter Empfänger, Partnerlink (nur HTTPS), Zahlungsanweisung und Referenz. Finance prüft tatsächlichen Eingang und erfasst den Nachweis. Eine bestätigte Reise in D1 ist keine automatisch beim Lieferanten vorgenommene Reservierung. Voucher-/Partnerprüfaufgabe bleibt sichtbar.

Keine Kartennummer/CVV in irgendein Formular oder Notizfeld eingeben. Frühere Dokumentationen zur hypothetischen Vakıf-/HotelRunner-Anbindung sind keine Freigabe; Vakıf ist serverseitig gesperrt.

## Backups / Rollback / Datenschutz

D1 Time Travel konfigurieren und verfügbare Aufbewahrung im gebuchten Tarif prüfen. Zusätzlich regelmäßige verschlüsselte SQL-Exporte außerhalb des Produktionskontos sichern. Export und Restore auf separate DB üben; Zeilenzahlen, Fremdschlüssel, QuoteVersionen, Ledger und Audit vergleichen. Bei Rollback vorheriges Worker-Artefakt nur mit kompatibler DB verwenden. Nicht destruktiv rückwärts migrieren und keine neu eingegangenen Zahlungen überschreiben. Wiederherstellung mit Bankabgleich koordinieren.

R2-Dokumentenmodul ist geplant, noch nicht aktiv. Vor Einführung privates Bucket-Binding, Download-Autorisierung, Größen-/Typprüfung, Malwareprozess, Aufbewahrung und Backup definieren. Cron/Queues sind ebenfalls Folgearbeit; die aktuelle Agenda/Aufgabenansicht berechnet bzw. speichert Fristen, versendet aber keine Erinnerungen.

DSGVO/KVKK: Verantwortlichen, Zwecke, Rechtsgrundlagen, Aufbewahrungsfristen, Auskunft/Löschung, Auftragsverarbeitung und internationale Transfers vor Betrieb festlegen. Keine Pass- oder Gesundheitsdaten in dieser ersten Strecke sammeln. Lokale Cache-/Legacy-Exporte enthalten Kontakte und sind entsprechend zu schützen.

## Bekannte Grenzen dieser Strecke

Noch kein vollständiger Positionseditor/PDF, kein automatischer E-Mail-Versand, keine Passwortreset-/MFA-/Einladungsstrecke, keine private Dokumentenverwaltung, keine iCal-/Google-/Microsoft-Anbindung, keine vollständige Finanzbuchhaltung/Partnerabrechnung/Reports oder CRM-Zusammenführung. Kalender: Agenda plus bestätigte Planungsänderung und Ressourcenkonflikte; Tag/Woche/Monat und wiederkehrende Termine folgen. Öffentliche vorhandene fünf Sprachen bleiben erhalten; Operations ist zunächst deutsch. API-Listen im Operations-Dashboard sind auf 500 Einträge begrenzt, Audit auf 200 je Quelle. Das ist ein erster vertikaler Meilenstein, keine fertig abgenommene Gesamtplattform.
