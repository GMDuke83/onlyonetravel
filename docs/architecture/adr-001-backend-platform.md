# ADR 001: Cloudflare-native, schrittweise Erweiterung

Status: angenommen für erste vertikale Strecke, 18.09.2026.

| Option | Vorteile | Nachteile |
|---|---|---|
| A: Pages Functions + D1 + privates R2 + Cron/Queues | Existierende Functions und getesteter Featurebranch; ein Origin, kleines Betriebsmodell; bestehendes Vanilla-Frontend bleibt | Auth nicht enthalten; D1-SQLite-Grenzen; Cron als separater Worker; Datenschutz-/Regionenkonzept nötig |
| B: PostgreSQL + Supabase Auth/Storage/Edge | Bewährter Auth-Lebenszyklus, RLS, relationales Reporting, Backups | Zusätzliche Plattform und Migration vorhandener Functions; RLS und Auth-Brücke korrekt zu betreiben |
| C: Node API + PostgreSQL + S3 + OIDC | Große Portabilität, freie Region, umfangreiche SQL-/Reporting-Funktionen | Serverbetrieb, Patching und mehr Infrastruktur für kleine Agentur |

Entscheidung: A mit zentraler D1-Datenquelle. Kein Frontendframework für diese Strecke. Vorhandenen API-/Persistenzadapter übernehmen und härten; Operations-UI als getrennte ES-Module. Keine weitere monolithische app.js. Für Mitarbeiter individuelle sichere Zugangstoken (nur Hash in D1), Serverrollen und widerrufbare Sessions; dies ist eine begrenzte erste Auth-Stufe. Passwort-/MFA-/Einladungs-Lebenszyklus über bewährten OIDC-Provider ist vor breitem Mitarbeiterrollout ein eigener Meilenstein. Ein universelles gemeinsames Mitarbeiterpasswort ist kein Zielmodell.

Kunden besitzen ihre Anfrage über HttpOnly-Session und zeitlich begrenzten privaten Portallink. Weitergabe des Links ist Weitergabe der Berechtigung; nur für minimierte Reisedaten, keine Ausweisdokumente. E-Mail-Zustellung bewusst manuell.

Requests bleiben zunächst Aggregate zur Kompatibilität des bestehenden Frontends. Versionierte Angebote, Buchungen, Termine, Aufgaben und individuelle Mitarbeiter werden relational ergänzt. DB-Trigger koppeln Snapshots/Audit und Bestätigung atomar an die Versionsänderung. Finanzielle Änderungen werden während offener Bankversuche gesperrt. Explizite DTOs und Feldredaktion schützen Konditionen.

R2 ist für private Dokumente vorgesehen, aber ohne Dokumentenmodul kein vorgetäuschter Upload. Cron/Queues werden erst mit konkreten Automatisierungsregeln aktiviert. Mehrwährungen im Folio, keine aktuelle Kursquelle behaupten. Backups: D1 Time Travel plus verschlüsselte Exporte und Wiederherstellungsprobe; R2 separat sichern. Imports erhalten Vorschau, stabile IDs und Originalbackup ohne automatische Bestätigung historischer Zahlungen.

Konsequenzen: GitHub Pages bleibt höchstens Vorschau, keine zentrale Plattform. Staging mit eigener D1 ist zwingend. Keine Produktivumschaltung ohne erfolgreiche Staging-Abnahme, Bankvertrag und Datenschutzprüfung. Wechsel zu PostgreSQL neu entscheiden bei komplexen mandantenübergreifenden Reports, D1-Grenzen oder verbindlichen Standortanforderungen.
