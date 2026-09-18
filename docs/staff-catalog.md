# Eigene Partner, Leistungen und Angebote

## Mitarbeiterablauf

Nach der Mitarbeiteranmeldung führt **Partner & eigene Leistungen** auf der
Übersicht oder unter **Mehr** zur gemeinsamen Verwaltung:

1. Partner mit Ansprechpartner, E-Mail, Telefon und internen Notizen anlegen.
2. Eine eigene Leistung zuordnen: Hotel, Villa, Yacht, Transfer, Ausflug oder
   Sonstiges. Einkaufspreis, Währung und Preiseinheit ausdrücklich festlegen.
   Die Preiseinheit ist frei benennbar; Nächte oder Reisende werden nicht
   automatisch als Menge verwendet.
3. **Angebot erstellen** öffnet Kundendaten, Zeitraum, Reisende, Anzahl der
   Preiseinheiten, Gesamtverkaufspreis und Gültigkeit. Einkaufssumme und
   Differenz zum Verkaufspreis werden intern angezeigt. Die Differenz ist
   kein steuerlich berechneter Gewinn: Gebühren/Steuern werden nicht automatisch
   kalkuliert.
4. **Angebot freigeben** speichert unmittelbar ein individuelles Angebot und
   öffnet dessen Reiseakte. Es ist kein Entwurf. Dort kann der Mitarbeiter
   einen privaten Kundenzugang erzeugen. Es erfolgt kein automatischer Versand.
5. Der Kunde kann das Angebot über diesen Zugang auf einem anderen Gerät
   sehen und annehmen. Zahlungsanforderungen erfolgen über den bestehenden
   Zahlungsbereich. Die Freigabe löst keine Lieferantenbuchung oder Zahlung aus.

Archivieren erfolgt über das Feld **Aktiv**. Daten werden nicht gelöscht.
Archivierte Partner sperren auch neue Angebote ihrer noch aktiven Leistungen.
Bestehende Angebote behalten ihren Stand. Der öffentliche Katalog wird durch
diese interne Leistungserfassung noch nicht automatisch erweitert.

## Persistenz und Berechtigungen

Migration `0002_catalog.sql` ergänzt `partners`, `services` und
`catalog_events`. Ein Fremdschlüssel ordnet Leistungen einem Partner zu.
SQL-Trigger protokollieren jede Anlage und Änderung inklusive Mitarbeitername,
Zeitpunkt, Version und Datenschnappschuss. Es gelten weiterhin die vorhandenen
Mitarbeitersitzungen mit gemeinsamem Zugangsschlüssel; Namen sind keine
individuell verifizierten Benutzeridentitäten.

Alle Katalogendpunkte erfordern serverseitig die Rolle `staff`. Kundensitzungen
erhalten 403, nicht angemeldete Zugriffe 401. Schreibzugriffe benötigen denselben
Origin. Einkaufskonditionen werden nur im Arbeitsspeicher des Mitarbeiterbrowsers
gehalten. Die Katalogliste wird beim Öffnen oder über **Neu laden** geladen;
sie enthält keine Offline-Schreibwarteschlange. Formulare bleiben bei Fehlern
geöffnet, Konflikte überschreiben keine fremden Änderungen. Vor dem Neuladen
bei einem Konflikt Eingaben sichern.

Ein Kundenangebot enthält einen unveränderlichen internen `sourcing`-Schnappschuss
mit Partner, Leistungsversion, Einkaufspreis in kleinster Währungseinheit,
Menge und Einheit. `publicRequest` entfernt dieses Feld vollständig für Kunden.
Spätere Katalogänderungen verändern bestehende Angebote nicht. Das bestehende
Angebots-/Zahlungsmodell und seine Sperren gelten weiterhin.

## API

Alle Pfade liegen unter `/api/v1/`. Antworten: `record` bzw. `records`, jeweils
mit `id` und `_version`. Listen haben maximal 100 Einträge und einen `cursor`;
weitere Seiten mit `?cursor=…` abrufen. Kosten und Währungen sind nie öffentlich.

| Methode | Pfad | Zweck |
| --- | --- | --- |
| GET | `/partners`, `/services` | Seitennavigation durch alle internen Datensätze |
| GET | `/partners/:id`, `/services/:id` | Einzelnen Datensatz laden |
| POST | `/partners`, `/services` | Anlegen, Body `{ "record": { … } }` |
| PUT | `/partners/:id`, `/services/:id` | Ändern/archivieren, Body `{ "record": { … }, "version": 1 }` |
| POST | `/requests` | Individuelles Angebot aus eigener Leistung anlegen |

Partnerfelder: `name`, `contact`, `email`, `phone`, `notes`, `active`.
Leistungsfelder: `name`, `partnerId`, `category`, `description`, `unit`,
`costMinor` (nichtnegative ganze Zahl), `currency` (EUR/TRY/USD/GBP), `notes`,
`active`. Alle Schreibzugriffe validieren die Felder, PUT benötigt die zuletzt
gelesene Version; veraltete Versionen ergeben 409.

Für die Angebotserstellung enthält `request` die bestehenden Kundendaten und:

```json
{
  "id": "rCLIENTGENERATEDUNIQUEID",
  "sourceServiceId": "UUID",
  "serviceVersion": 1,
  "quantity": 2,
  "contact": { "first": "Kundenname", "phone": "+49 …" },
  "from": "2099-10-01",
  "to": "2099-10-02",
  "adults": 2,
  "offer": { "price": 250, "validUntil": "2099-09-30", "custInfo": "Individuelles Angebot" }
}
```

Der Server liest die Einkaufskonditionen selbst, übernimmt die Leistungswährung
und prüft Aktivstatus, Version, Menge und Angebotsgültigkeit. Eine wiederholte
Anlage mit derselben Anfrage-ID innerhalb derselben Sitzung ist idempotent.
Ein veralteter Katalogstand ergibt 409. Katalog-POSTs selbst sind nicht idempotent:
bei unklarem Verbindungsausgang zuerst die Liste neu laden, bevor erneut
ein Partner oder eine Leistung angelegt wird.

## Deployment und Prüfungen

Keine neuen Secrets oder Bindings. Vor Auslieferung die neue Migration auf der
jeweiligen D1-Datenbank ausführen. Der vorhandene Cloudflare-Deploymentworkflow
führt die Migrationen bereits vor dem Pages-Deployment aus. Die tatsächlichen
Datenbank-IDs und Zugangsschlüssel müssen gemäß `shared-backend.md` eingerichtet
sein. Lokal: `npm run db:migrate:local`, anschließend `npm run dev:backend`.
GitHub Pages allein führt diese APIs nicht aus.

Prüfungen: `npm run check`, `npm test`, `npm run check:functions`,
`npm run test:browser`. Die API-Tests führen sämtliche Migrationen aus und prüfen
Berechtigungen, Versionskonflikte, Audit, Archivierung und die Geheimhaltung
des Einkaufsschnappschusses. Der Browsertest prüft Partner → Leistung → Angebot
über die echte Oberfläche und separate Mitarbeiter-/Kundensitzungen.

## Noch auszubauen

Eigene Partneranmeldung mit getrennten Rechten, einzelne Mitarbeiterkonten,
Lieferantenbestätigungen pro Reiseleistung, mehrere Leistungen pro Angebot,
Angebotsentwürfe/-versionen, saisonale Tarife, Kontingente, automatische
Benachrichtigungen, Kalender, Dokumente sowie Lieferantenverbindlichkeiten.
Externe Anschlüsse und die endgültige Bankintegration benötigen die offiziellen
Unterlagen, Partnerfreigaben und Testzugänge. Diese Erweiterung baut keinen
HotelRunner-Anschluss und behauptet keine Ziraat-Produktionsfreigabe.
