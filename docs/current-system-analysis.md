# Bestandsanalyse – 18.09.2026

Basis: `main` = `7e39fc2d4236f3fcc4260b656943cad3ee986e3d`. Arbeitsbranch: `codex/oo-travel-platform`. Keine AGENTS.md gefunden. Analyse vor Implementierung.

## Bestand und Wiederverwendung

| Bereich | Befund | Entscheidung |
|---|---|---|
| Öffentliche Website | `public/index.html`, 434 kB `js/app.js`, 150 kB `css/app.css`; Vanilla JS, dynamische Views | Bestehende Ansichten, Bildwelt, Intro, Suche und Anfrageassistent erhalten |
| Mobile | Touch-Navigation, Bottom-Bar, Lazy-Video, selbst gehostete Fonts | Übernehmen; Zoom-Sperre entfernen, Fokus prüfen |
| Desktop | CSS ab 820 px erzwingt 430-px-Geräterahmen | Responsive Überschreibung statt Ersatz der mobilen Website |
| Katalog | Hotels ohne Preise; Yachten enthalten trotz Anfrageansicht `from`-Preise; Transfers mit Direktpreis | Alle eingebetteten Katalogpreise entfernen; Transfers ebenfalls Anfrage |
| Anfragen | Hotel, Charter/Yacht, Ausflug, Transfer; Kontakt, Datum, Gäste | Datenvertrag schrittweise serverseitig validieren |
| Angebote/Folio | Ein Angebot pro Anfrage, Teilzahlungen und Wechselkurs vorhanden | Versionierung, serverseitige Zustandsübergänge und unveränderliche Buchungen ergänzen |
| Login | Mitarbeitername genügt; Rolle im Browserzustand | Demo, kein Zugriffsschutz; serverseitig ersetzen |
| Kommunikation | Nachrichten in Anfragearray | Gemeinsames Backend; kein automatischer Versand |
| Sprachen | `SUPPORTED`: de/en/tr/uk/ru; Übersetzungstabellen und Fallbacks | Erhalten. README nennt noch nur drei Sprachen |
| Tests | main ohne automatisierte Fachtests | API/DB/Security/E2E ergänzen |

## Lokale Daten und Verlustrisiken

`onlyone.state.v1`: requests, leads, seq, staff, favorites, Sprache, Suche, vorgemerkte Ausflüge. Anfragen enthalten Angebote, Zahlungsfolio, interne Notizen, Nachrichten und Verlauf. `onlyone.payreturn` in sessionStorage enthält Zahlungsrückleitung; Audioeinstellung liegt separat lokal. Keine zentrale Kunden-/Mitarbeitersynchronisierung. Speicherfehler werden abgefangen und verschwiegen; Löschen des Browserprofils verliert Geschäftsdaten. Sequenzen kollidieren zwischen Geräten. Ein manipuliertes Browserobjekt kann Rollen und Zahlungen ändern. Ein Import darf historische Zahlungen nicht als verifiziert übernehmen.

## Zahlungen und Sicherheit

`functions/api/pay/start.js` signiert vom Client gelieferte Beträge ohne DB-Abgleich oder Anmeldung. Ziraat-Hashprüfung existiert, aber ohne persistentes Zahlungsledger, Referenzbindung und Idempotenz. Vakıf akzeptiert einen Ergebniscode ohne verifizierte Bankabfrage. Query-Parameter dürfen niemals als Zahlungsnachweis dienen. Bankvertrag und tatsächlich aktivierte API sind noch nicht nachgewiesen. Der Kommentar zu PCI/SAQ ist keine Compliance-Bestätigung.

Keine echte Rechteprüfung, kein zentraler Audit, keine CSRF-/Rate-Limit-Schicht auf main. Dynamisches HTML verwendet überwiegend `esc`, dennoch müssen URLs und neue API-Felder strikt validiert werden. Keine Passdaten in der ersten Strecke erheben. Öffentlich ausgelieferter Quellcode darf auch versteckte Einkaufspreise nicht enthalten.

## Branches und Deployment

Remote: main, develop, r43-release, r43-stage, drei claude-Branches, codex/mobile-home-services, codex/search-travel-services, codex/yacht-availability-requests und feature/shared-cloudflare-backend. Letzterer (`9d1835d`) enthält bereits D1, API, Cookie-Sessions, Import, Tests und Mitarbeiterkatalog. Seine Bausteine werden gezielt übernommen; das gemeinsame Mitarbeiterkennwort, binäre Rollen, fehlende Kalender-/Angebotsversionierung und zu großzügige Bestätigungsübergänge werden verbessert. Kein blindes Zusammenführen anderer Featurebranches.

GitHub-Pages-Workflow veröffentlicht main rein statisch. Cloudflare-Workflow veröffentlicht develop, sofern Secrets existieren. Vercel-Konfiguration vorhanden. README enthält widersprüchliche historische Hostinghinweise. GitHub Pages kann die Plattform-API nicht betreiben. Keine produktive Umstellung in diesem Meilenstein.

## Performance / offene Messungen

Kein Framework-Bundle; lokale WebP-Bilder/WOFF2, Video-Range-Unterstützung und verzögertes Laden brauchbar. Große monolithische JS-Datei und lange Übersetzungstabellen erschweren Wartung. Desktop-Layout, horizontales Overflow, Tastaturfokus, Fehlerzustände und reale Backendantworten werden im Browser geprüft. Lighthouse-/Screenreader- und physische Gerätetests sind getrennte Abnahmepunkte, keine aus Quellcode abgeleiteten Zusicherungen.
