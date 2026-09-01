# Zahlungsmodul — Ziraat & VakıfBank Sanal POS

Was eingebaut wurde, wie „Sanal POS" überhaupt funktioniert, und was noch
von der Bank kommen muss, bevor echtes Geld fließt. Kurz gehalten, aber
vollständig.

---

## 1. Wie Sanal POS funktioniert — in drei Sätzen

Ein **Sanal POS** (virtuelles POS) ist das Kartenterminal der Bank im
Internet: Die Bank gibt einem Händler („üye işyeri") Zugangsdaten, der Shop
meldet eine Zahlung an, und der Kunde gibt seine Karte **auf der Seite der
Bank** ein (3-D Secure mit SMS-Bestätigung). Danach schickt die Bank den
Kunden mit dem Ergebnis zurück zum Shop. Das Geld läuft direkt über das
Händlerkonto bei der Bank — kein Zwischendienstleister.

Beide gewählten Banken bieten genau dieses „Hosted Page"-Modell:

| Bank | Plattform | Modell |
|---|---|---|
| Ziraat Bankası | NestPay (Asseco/EST) | „3D Pay Hosting" — signiertes Formular an die Bankseite |
| VakıfBank | PayFlex (İnnova) | „Ortak Ödeme" — Transaktion registrieren, Kunde zur Bankseite |

**Warum dieses Modell:** Die Kartennummer berührt unsere Seite nie. Damit
bleibt die PCI-DSS-Pflicht beim einfachsten Fragebogen (SAQ A) statt bei
einem Audit — und ein Datenleck bei uns kann keine Kartendaten treffen.

---

## 2. Die eine technische Wahrheit

Jede Bank-Anbindung braucht ein **Geheimnis** (Ziraat: Store Key,
VakıfBank: Merchant-Passwort), mit dem Zahlungen signiert bzw. angemeldet
werden. Ein Geheimnis kann nicht im Browser-JavaScript liegen — dort kann
es jeder lesen und beliebige Beträge signieren.

Unsere Seite ist statisch (GitHub Pages). Deshalb liegt die Bank-Logik in
**Cloudflare Pages Functions** (`functions/api/pay/…`) — kleine
Server-Endpunkte, die mit derselben Codebasis deployt werden. Der Workflow
`deploy-cloudflare-pages.yml` liegt schon im Repo und nimmt die Functions
automatisch mit.

* Auf **GitHub Pages** (aktuelle Test-URL) gibt es diese Endpunkte nicht →
  die App erkennt das selbst und zeigt einen ehrlich beschrifteten
  **Demo-Simulator** (neutraler 3-D-Secure-Testbildschirm, keine
  Bank-Optik).
* Auf **Cloudflare Pages** mit gesetzten Bank-Zugangsdaten läuft der echte
  Fluss.

---

## 3. Was eingebaut ist

**Frontend** (in der Optik der Seite, drei Sprachen):

* Zahlungs-Sheet mit Betragsanzeige und Bankauswahl
  („Ziraat Bankası / VakıfBank · Sanal POS · 3-D Secure") im Stil der
  bestehenden Auswahl-Listen — keine Bank-Logos (Markenrechte), Text genügt.
* Hinweiszeile: Kartendaten werden auf der Bankseite eingegeben.
* „Weiter zur Bank" → echter Fluss oder Demo, je nach Umgebung.
* Rückkehr von der Bank: `?pay=ok|fail&oid=…` wird vor dem Query-Aufräumen
  der Seite zwischengespeichert; die App öffnet direkt die Reise, setzt den
  Status auf „bezahlt" und zeigt die Bestätigung. Das Intro-Video wird bei
  der Rückkehr übersprungen.

**Server** (`functions/api/pay/`):

* `ping` — sagt der App, welche Banken freigeschaltet sind.
* `start` — signiert die Ziraat-Übergabe (NestPay-Hash „ver3", SHA-512)
  bzw. registriert die VakıfBank-Transaktion und liefert die Weiterleitung.
* `return/[provider]` — nimmt die Antwort der Bank entgegen. Bei Ziraat
  wird der Antwort-Hash kryptographisch geprüft (gefälschte Callbacks
  scheitern), bei VakıfBank der Ergebniscode; dann Weiterleitung zurück in
  die App. Geheimnisse tauchen in keiner URL auf.

**Grenze (bewusst):** Die App speichert Aufträge nur auf dem Gerät des
Kunden. Die verbindliche Zahlungsbestätigung ist immer das **Bank-Panel**
(Sanal-POS-Verwaltung der Bank) — dort sieht man jede Transaktion. Ein
Server-Auftragsspeicher wäre der nächste Ausbauschritt, ist aber für den
Start nicht nötig.

---

## 4. Was ihr bei den Banken beantragt

Beide Anträge laufen über die Filiale bzw. das Firmenkunden-Portal; nötig
sind Firma/Gewerbe, Steuernummer und ein Konto bei der jeweiligen Bank.

**Ziraat Bankası — „Sanal POS üye işyeri" beantragen.** Ihr bekommt von
Payten/EST:

| Feld | Env-Variable |
|---|---|
| İşyeri-/Client-Nummer | `ZIRAAT_CLIENT_ID` |
| 3D Store Key (Geheimnis) | `ZIRAAT_STORE_KEY` |
| Gate-URL (Prod ist voreingestellt; Test: `https://entegrasyon.asseco-see.com.tr/fim/est3Dgate`) | `ZIRAAT_GATE_URL` |

**VakıfBank — „Sanal POS 7/24 / PayFlex Ortak Ödeme" beantragen.** Ihr
bekommt von İnnova/VakıfBank:

| Feld | Env-Variable |
|---|---|
| HostMerchantId | `VAKIF_MERCHANT_ID` |
| MerchantPassword (Geheimnis) | `VAKIF_PASSWORD` |
| TerminalNo (z. B. VP000123) | `VAKIF_TERMINAL_NO` |
| Basis-URL (Prod voreingestellt; Test: `https://cptest.vakifbank.com.tr`) | `VAKIF_CP_BASE` |

> **Wichtig:** Die genauen VakıfBank-Feldnamen der „Ortak Ödeme"-
> Registrierung sind in `functions/api/pay/start.js` in **einer** Funktion
> (`vakifRegisterParams`) isoliert. Wenn das offizielle
> Integrationsdokument der Bank kommt, dort gegenprüfen — das ist eine
> Fünf-Minuten-Anpassung, kein Umbau. Gleiches gilt für den optionalen
> `VposTransactionInquiry`-Gegencheck im Callback.

**Währung:** Standardmäßig schalten die Banken TRY frei. Die Angebote der
Seite stehen in EUR — Fremdwährung („döviz POS") muss im Antrag explizit
mit beantragt werden, sonst rechnet die Bank ab oder lehnt ab.

---

## 5. Live schalten — Schritt für Schritt

1. Cloudflare-Konto anlegen (kostenlos reicht), Pages-Projekt
   `onlyone-luxury-travel`.
2. In GitHub: *Settings → Secrets and variables → Actions* die zwei
   Secrets `CLOUDFLARE_API_TOKEN` und `CLOUDFLARE_ACCOUNT_ID` setzen — der
   vorhandene Workflow deployt dann (Branch `develop` oder per Hand über
   *Actions → Deploy test environment → Run workflow*).
3. In Cloudflare: *Pages-Projekt → Settings → Variables and Secrets* die
   Bank-Variablen aus Abschnitt 4 setzen (Geheimnisse als „Secret"),
   dazu `SITE_URL` = die öffentliche Cloudflare-URL.
4. Erst mit den **Test-Zugangsdaten** der Bank durchspielen (beide Banken
   stellen Testumgebung und Testkarten); `ZIRAAT_GATE_URL` bzw.
   `VAKIF_CP_BASE` auf die Test-URLs stellen.
5. Testzahlung: Angebot → „Weiter zur Bank" → Testkarte auf der Bankseite
   → Rückkehr „bezahlt". Gegenprüfen im Sanal-POS-Panel der Bank.
6. Auf Produktions-Zugangsdaten und -URLs wechseln. Fertig.

Solange nichts davon gesetzt ist, passiert nichts Gefährliches: GitHub
Pages zeigt den Demo-Simulator, und die Functions antworten mit „nicht
konfiguriert".

---

## 6. Quellen der Recherche

* NestPay/EST-Anbindung der Ziraat (Community-Implementierungen, u. a.
  omnipay-nestpay, mewebstudio/pos, CP.VPOS) — Modell „3d_pay_hosting",
  Hash „ver3"/SHA-512.
* PayFlex/İnnova für VakıfBank (sanalpos.innova.com.tr, payflex.com.tr,
  Community-Implementierungen zu „Ortak Ödeme"/Common Payment) —
  RegisterTransaction → PaymentToken → SecurePayment-Seite.
* Verbindlich sind am Ende die Integrationsdokumente, die die Bank beim
  Vertragsabschluss mitliefert — die Endpunkte und Feldnamen sind deshalb
  konfigurierbar bzw. isoliert.
