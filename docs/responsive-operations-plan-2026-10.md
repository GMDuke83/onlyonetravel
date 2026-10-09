# ONLYONE – Arbeitsplan für Mobil, Desktop und Mitarbeiterbereich

Stand: 9. Oktober 2026. Ausgangspunkt: main b811f1a. Priorität des Auftraggebers: zuerst Mobil- und Desktopansicht samt Bildern; anschließend Anfragen, Kunden, Angebote und Buchungen. Dieser Plan ergänzt den bestehenden Plattformplan vom September.

## Ausgangslage und Ziel

Die Anwendung besitzt fünf öffentliche Sprachen, einen Kundenbereich und einen ersten gemeinsamen Ablauf auf Cloudflare Pages Functions/D1. Mitarbeiterrollen, Angebotsversionen, Zahlungsfolio, Buchungsbestätigung, Agenda und Aufgaben bestehen bereits. Die öffentliche GitHub-Pages-Testversion speichert ihre Daten dagegen je Browser; sie ist keine gemeinsame Betriebsumgebung.

Die bisherigen drei Startbilder sind 720 Pixel breite Hochformate. Die Desktop-Erweiterung war knapp und adressierte teilweise nicht verwendete Rasterklassen. Im Mitarbeiterbereich fehlten eigene Einstiege für Kontakte, Angebote und Buchungen sowie Such- und Filtermöglichkeiten.

Ziel: eine stimmige Website auf Smartphone, Tablet und Desktop, passende Bildausschnitte bei begrenzten Ladezeiten und ein nachvollziehbarer Arbeitsablauf von der Kundenanfrage bis zur bestätigten Reise.

## Gestaltungsgrundlage

Bestehende Identität beibehalten: Espresso #241C14, Elfenbein #F7F3ED, Weiß #FFFFFF, Roségold #D9B09C und dunkler Akzent #935640; lokale Inter-Schrift, vorhandenes Logo. Die Landschaft trägt den Auftritt, die Bedienung bleibt ruhig. Mobil bleibt die untere Navigation; ab 1100 Pixeln stehen die Hauptbereiche im Kopf. Ab 700 Pixeln entstehen passende Raster, Inhalte werden auf maximal etwa 1320 Pixel begrenzt. Kein neues Frontend-Framework notwendig.

Desktop: Kopf mit Logo / Hauptnavigation / Menü → breites Landschaftsbild mit lesbarer Botschaft → vier Leistungseinstiege → Reiseideen im Raster → Rückzugsort / persönliche Anfrage → Reisewelten → Hotelauswahl → Services → Kontakt.

Mobil: vorhandener filmischer Einstieg → Hochformatbild → kurze Leistungseinstiege → bedienbare Karten und Formulare → feste untere Navigation. Mitarbeiter arbeiten mobil mit beschrifteten Vorgangskarten; am Desktop mit Listen und Seitenleiste.

## 1. Mobil- und Desktopansichten – erste Umsetzung

Umfang: Kopf- und Touch-Navigation, Startseite, Reiseideen, Reisewelten, Hotelauswahl, Servicekarten, Unterkunftssuche, Dialogbreiten, Kontaktformulare und Mitarbeiterlisten. Mehrspaltige Desktopraster, größere Touchflächen und Eingabeschriften, sichtbarer Fokus, pausierbarer Bildwechsel und reduzierte Bewegung.

Abnahme: Prüfen bei 360, 390, 430, 768, 1024, 1366, 1440 und 1920 Pixel Breite. Navigation, Text, Bilder und Formularaktionen dürfen sich nicht überlagern. Tabellen werden auf kleinen Geräten zu Karten. Suche, Rücknavigation und Anfrage bleiben bedienbar. Die restlichen Detailseiten werden in der nachfolgenden Gesamtabnahme ebenfalls geprüft.

Erste Änderungen sind in diesem Arbeitszweig umgesetzt. Feinschliff aller Detailseiten und reale Geräteprüfungen bleiben Teil von Etappe 6.

## 2. Bildmaterial und Ladeverhalten – erste Umsetzung

Erstellt: drei neue Querformate – Küstenbucht, Terrasse am Meer und Kappadokien. Die gelieferten Originale haben tatsächlich 1672 × 941 Pixel. Optimierte WebP-Varianten mit 960, 1280 und 1672 Pixel Breite, ohne künstliches Hochskalieren. Das größte WebP liegt je Motiv bei etwa 190–278 kB. Der Browser wählt die Variante; Smartphones behalten im Startbildwechsel ihre vorhandenen Hochformate.

Die neuen Motive dienen der Reiseinspiration und werden entsprechend bezeichnet. Bilder konkreter Hotels werden nicht durch erfundene Objektfotos ersetzt. Generierungsanweisungen und Herkunft werden dokumentiert.

Nächster Ausbau: Desktopmaterial für Transfer, Yacht, Events und VIP-Betreuung; Sichtung der vorhandenen Bildrechte und echten Hotelfotos; mobile Bildausschnitte mit festgelegtem Motivschwerpunkt; Poster und bedarfsgesteuertes Laden der Videos. Für sehr große oder hochauflösende Bildschirme sind echte Ausgangsbilder mit 2560–3840 Pixel Breite zu beschaffen oder neu zu erzeugen. Die aktuellen Dateien sind keine 4K-Master.

Abnahme: Alle Bildpfade existieren; keine verzerrten Motive; kein unnötiges Laden der Desktop-Startbilder auf Smartphones; festgelegte Bildmaße gegen Layoutsprünge. Zielwerte für spätere Messung: LCP ≤ 2,5 s, CLS ≤ 0,1 und INP ≤ 200 ms unter dokumentierten Testbedingungen; noch keine gemessenen Werte behauptet.

## 3. Mitarbeiter-Arbeitsplatz – erster Ausbau

Umgesetzt: eigene Ansichten für Anfragen, Kundenkontakte, Angebote und Buchungen. Suche nach Name, Reisenummer, Telefon, E-Mail und Zuständigkeit; Status- und Zuweisungsfilter; Sortierung nach Änderung oder Reisebeginn; Rücksetzen und Aktualisieren. Angebote zeigen Vorgänge mit Angebot, Buchungen nur bestätigte Reisen. Die Kontaktübersicht gruppiert ausschließlich identische Namen und Kontaktdaten und führt keine Stammdaten zusammen. Der vorhandene Umfang von maximal 500 aktuellen Vorgängen wird bei Überschreitung ausdrücklich angezeigt.

Nächste Schritte: serverseitige Suche und Seitennavigation für große Bestände, lesbare Mitarbeiterauswahl statt interner Kennungen, Zuweisen/Vertreten, nächste Aktion und Wiedervorlage, Aufgaben direkt aus der Reiseakte, gespeicherte Ansichten und persönliche Arbeitsvorräte. Benachrichtigungen zunächst innerhalb der Anwendung; externer Versand erst nach Festlegung des Kanals.

Abnahme: Eine neue Anfrage erscheint beim zuständigen Mitarbeiter; Suche und Filter kombinieren sich korrekt; Änderungen sind versionsgeprüft; Vertriebs-, Finanz- und Leserechte bleiben serverseitig wirksam; mobile Karten und Desktoplisten führen zur gleichen Reiseakte.

## 4. Kundenkartei – nächstes Fachmodul

Umfang: eigene Kundennummer und bearbeitbare Kontaktakte, mehrere Reisende, bevorzugte Sprache und Kontaktweg, Reisehistorie, Einwilligungsnachweise, interne Hinweise mit passenden Rechten. Kundenanlage aus einer Anfrage mit Prüfung vorhandener Kontakte. Dubletten nur vorschlagen; Zusammenführen mit Vorschau, eindeutiger Zuordnung aller Reisen und Änderungsprotokoll. Gleiche Namen oder gemeinsame Telefonnummern dürfen keine automatische Identitätsannahme auslösen.

Technik: additive Datenbankmigration, Kunden- und Reisenden-API, Referenz von Reiseakte auf Kunde; bestehende Kontakt-Snapshots und Angebotsstände erhalten. Daten erst nach Validierung übernehmen. Kunden sehen nur ihre eigenen freigegebenen Vorgänge.

Abnahme: Ein Kunde kann mehrere Reisen besitzen; Kontaktdatenänderung verfälscht keine bereits freigegebenen Dokumente; Dublettenabgleich ist nachvollziehbar; unberechtigte Zugriffe und gleichzeitige Änderungen werden abgefangen.

## 5. Angebote und Buchungen – durchgängiger Betrieb

Angebote: mehrteiliger Editor für Unterkunft, Transfer, Ausflüge und Sonderleistungen; Mengen, Einheiten und Zeitraum; Währung, Rabatte, Gültigkeit, Bedingungen und Gesamtbetrag; interne Einkaufskosten und Marge nur für berechtigte Rollen. Entwurf → Freigabe → nachvollziehbare Version → Kundenannahme. Private PDF-Ausgabe und Dokumentenablage; akzeptierte Stände bleiben unveränderlich, Änderungen erzeugen eine neue Version.

Buchungen: Partneranfrage und Bestätigung, Buchungsreferenzen, Leistungszeiten, Abholorte und zuständige Mitarbeiter; Termine und Aufgaben; Voucher und Checkliste vor Reisebeginn. Kundenzusage, Zahlungseingang und Lieferantenbestätigung werden getrennt geführt. Nachbuchungen, Stornierung, Erstattung und Partnerabrechnung benötigen definierte Zustände und revisionsfähige Einträge.

Abnahme: Testreise vom Eingang bis zu Angebot, Annahme, Zahlungsanforderung, belegtem Zahlungseingang und Bestätigung auf getrennten Geräten durchführen. Veraltete Angebotsannahmen, doppelte Bestätigung und doppelte Zahlung dürfen keine falschen Buchungen erzeugen. Kein Echtbankbetrieb ohne separat geprüfte Anbindung.

## 6. Gesamtabnahme und Veröffentlichung

Prüfen: alle öffentlichen Sprachen, lange Namen/Texte, leere Listen, Fehlerzustände, langsames Netz, Reload, Tastatur, sichtbarer Fokus, reduzierte Bewegung und echte iOS-/Android-Geräte. Kunden- und Mitarbeiterabläufe in getrennten Sitzungen; Rollen und interne Daten; Bild- und Video-Ladezeiten. Bestehende automatische Prüfungen um die neuen Fachmodule ergänzen.

Betrieb: getrennte Test- und Produktionsdatenbank, HTTPS-Testadresse, Zugangseinladungen und Wiederherstellung, Backups und Wiederherstellungstest, versionierte Migrationen, protokolliertes Release und Rückkehr zur Vorversion. Die öffentliche Demo bleibt als Demo erkennbar. Ein produktives System benötigt Cloudflare-Projekt, Datenbankbindungen und eine freigegebene Domain.

Abnahme: erfolgreich geprüfte Änderung im Review; Testumgebung mit gemeinsamem Datenspeicher; vollständiger Testablauf ohne Konsolenfehler; Rückfallweg dokumentiert. Veröffentlichung ist ein eigener Schritt nach Sichtprüfung der konkreten Version.

## Reihenfolge, Aufwand und Abhängigkeiten

1. Gestaltung und erste Bilder: bereits begonnen; Nacharbeit nach Geräteprüfung.
2. Mitarbeiter-Arbeitsplatz vervollständigen: etwa 2–4 Entwicklungstage.
3. Kundenkartei: etwa 3–5 Entwicklungstage, nach Datenmodell und Regeln zum Zusammenführen.
4. Positionsangebote und private Dokumente: etwa 4–7 Entwicklungstage.
5. Buchungsabwicklung und Partnerbestätigung: etwa 3–6 Entwicklungstage.
6. Gesamttests und Testbetrieb: etwa 2–4 Entwicklungstage, anschließend Veröffentlichung.

Die Spannen sind Planungsgrößen für konzentrierte Entwicklungsarbeit, keine Terminzusage. Externe Kontoeinrichtung, Bildfreigaben, Datenübernahme, Bankabnahme und Rückfragen sind darin nicht enthalten. Etappen 4 und 5 bauen auf dem bestehenden gemeinsamen Backend auf; ein Neuaufbau ist nicht nötig.

## Noch benötigte fachliche Entscheidungen

Vor dem jeweiligen Fachmodul klären: Wer darf Angebote freigeben und Preise ändern? Welche Kundendaten werden tatsächlich gebraucht? Wie werden Lieferantenbestätigungen erfasst? Welche Angebots-/Voucher-Vorlagen und Stornobedingungen gelten? Welche Bildquellen sind für konkrete Hotels freigegeben? Wer verwaltet Test- und Produktivzugänge? Diese Entscheidungen blockieren die erste Gestaltungsetappe nicht.

## Nachweise dieses Arbeitspakets

23 Node-/SQLite-/Berechtigungs- und Filtertests bestanden; JavaScript-Syntax und Functions-Kompilierung erfolgreich. UI-Prüfung in der lokalen statischen Testversion mit synthetischen Daten. Der lokale Cloudflare-Workers-Prozess scheitert auf diesem Windows-System mit einem Laufzeitfehler; deshalb wird die Prüfung gegen echte Pages Functions zusätzlich über die vorhandene GitHub-CI ausgeführt. Abschließende Ergebnisse werden im PR festgehalten. Kein produktiver Datenimport, keine Produktionsumstellung und kein echter Zahlungsvorgang.
