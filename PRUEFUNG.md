# Phase 0 – Prüfung vor dem Bau

Stand: 15.10.2026. Grundlage: der ursprüngliche Auftrag und ein klickbarer Prototyp (beide nicht Teil dieses Repositorys). Zitate wie „Abschnitt 3“ beziehen sich auf die Abschnitte dieses Auftrags.

> **Teil D (am Ende) enthält die Entscheidungen vom 15.10. und die neuen Messungen für 90 Führungen und 25 Personen.** Wo D etwas anderes sagt als A–C, gilt D.

Wie die Aussagen belegt sind:

- **gemessen:** selbst gemessen. Die Skripte liefen außerhalb des Repos (Node 22, Chromium 147 über Playwright). In Phase 1 werden daraus Tests.
- **Quelle:** recherchiert und verlinkt. Einige Seiten (webkit.org, support.google.com) waren aus dieser Umgebung nicht direkt abrufbar. Dort stütze ich mich auf Suchauszüge der verlinkten Seite. Das ist jeweils mit „(Auszug)“ markiert.
- **Gerätetest nötig:** Das lässt sich nur auf echten iPhones bzw. Android-Geräten klären. Die gesammelte Liste steht am Ende von Teil B.

---

## A. Querprüfung der Vorgaben

### A1. Prototyp und Auftrag weichen voneinander ab

| Prototyp | Auftrag | Folge |
|---|---|---|
| Dauer (45–180 min) | Beginn **und Ende** | Das Formular bekommt Beginn/Ende wie im Excel-Schema. |
| kein Ort, keine Beschreibung | Ort ist Pflicht, Beschreibung mehrzeilig | Beide Felder kommen ins Formular. Ohne Ort fehlt der Kalendertitel „Ort Namen“. |
| Rollen-Umschalter oben | Rolle ergibt sich aus dem Link | Ohne Link startet die App in der Koordinationsansicht, mit Link 1/3 in der Personen-Ansicht. Den Umschalter gibt es nur noch als „Ich bin Koordinator:in“. |
| Datumsrechnung mit `new Date("…T10:00")` in der Zeitzone des Geräts | Termine in Österreich | Zeiten bleiben **Wiener Wanduhrzeit als Text** (`"10:00"`). Erst beim iCal-Export bekommen sie ihre Zeitzone (B6). Ein Gerät in anderer Zeitzone verschiebt sonst nichts. |
| Fix-Führungen werden automatisch in „kann“ übernommen | – | Fix wird getrennt gespeichert, nicht als „kann“. |
| Greedy-Einteilung | ILP | siehe B7/B10 |

### A2. Ablauf (Abschnitt 3) gegen Datenmodell (Abschnitt 5)

Der Ablauf passt grundsätzlich. Es fehlen aber Felder, ohne die er nicht lückenlos funktioniert:

1. **Formatversion `v`** wird in Abschnitt 5 verlangt, steht aber in keinem Objekt. Vorschlag: `v` in jedem Link und in der Sicherung.
2. **Runden-ID:** Es ist nicht festgelegt, wie sie entsteht. Vorschlag: eine zufällige ID mit 8 Zeichen beim Anlegen. Sie ist nicht vom Datum abgeleitet, weil zwei Runden für denselben Monat sonst kollidieren.
3. **Revision der Runde** (`rev`) fehlt. Ohne sie lässt sich nicht erkennen, ob eine Antwort zu einem älteren Stand von Link 1 gehört (siehe A4).
4. **Zeitstempel in der Antwort** fehlt. Schickt jemand zwei Antworten, muss die neueste gelten, auch wenn der:die Koordinator:in sie in anderer Reihenfolge einfügt.
5. **Link 3 muss selbsttragend sein.** Im Modell enthält ein Plan nur `führungsId → Namen`. Die Person braucht für Anzeige und `.ics` aber Ort, Datum, Zeiten und Beschreibung. Auf iOS gilt: Hat die Person Link 1 im Safari-Tab geöffnet und Link 3 in der Homescreen-App (oder umgekehrt), dann kennt die App die Runde nicht (B3). **Link 3 enthält daher die Runde inklusive Beschreibungen** und ist damit der längste Link (B2).
6. **Sprachen** stehen nur in der Antwort, nicht in der Teamliste. Das passt zu „vom Gerät gemerkt“. Damit „Neue Runde aus letzter“ Sprachen und Min/Max übernehmen kann, nimmt der:die Koordinator:in diese Werte aus den letzten Antworten (Vorschlag in C4).
7. **Datenschutz:** Link 1 enthält die Namen aller Teammitglieder. Steht in den Beschreibungen etwa eine Kontakt-Telefonnummer, reist sie in Link 3 per Messenger an alle. Das ist eine Entscheidung der Nutzenden. Die App weist nicht darauf hin, weil das im Auftrag nicht vorgesehen ist.

### A3. Excel-Schema (Abschnitt 6) gegen Ablauf

- **Keine ID-Spalte.** Ein erneuter Import kann eine bestehende Führung nicht wiedererkennen. Er würde Duplikate erzeugen oder müsste nach Ort+Datum+Beginn raten. Vorschlag: Der Import **fügt nur hinzu**. Geändert wird in der App. Die Vorschau warnt bei Zeilen, die einer bestehenden Führung gleichen (A6).
- **„Personen“ inklusive oder exklusive Fix?** Abschnitt 4 sagt „die Führung braucht entsprechend weniger freie Plätze“. Ich lese daher: **Personen = Gesamtzahl, Fix eingeschlossen.** Mehr Fix-Namen als Personen sind laut Abschnitt 6 ein Fehler. Das ist konsistent.
- **„Personen“ ungültig** (z. B. `0`, `1,5`, `zwei`): Diese Fälle stehen nicht in der Problemliste. Wegen „nichts stillschweigend korrigieren“ markiere ich sie trotzdem als Problem.
- **Sprache in Kleinbuchstaben** (`de`): Für Spaltennamen ist Groß-/Kleinschreibung egal, für Werte steht nichts da. Vorschlag: `de`/`en` gelten als DE/EN. `Deutsch`, `D` usw. sind „unbekannte Sprache“.
- **Fix-Namen** werden exakt verglichen, nach Entfernen von Leerzeichen am Rand. Abweichende Groß-/Kleinschreibung wird als Problem markiert, nicht still angeglichen.

### A4. Koordinator:in ändert Führungen nach dem Versand von Link 1

Der Auftrag regelt diesen Fall nicht. Vorschlag (C5):

- Jede Änderung, die die Verfügbarkeit berührt (Datum, Beginn, Ende, Sprache, neue Führung), erhöht `rev` der Runde. Die ID der Führung bleibt gleich.
- Ändern sich nur Beschreibung, Fix oder Personenzahl, erhöht sich `rev` **nicht**, denn die Antwort bleibt gültig.
- Ist eine Führung neuer als die Antwort einer Person oder wurde sie danach geändert, gilt sie für diese Person als **„nicht gemeldet“**, also als nicht verfügbar. Das Ergebnis zeigt dann z. B. „Anna: 2 Führungen nach Änderung nicht beantwortet“.
- Gelöschte Führungen werden in Antworten ignoriert.
- Der:Die Koordinator:in verschickt den neuen Link 1. Wer ihn öffnet, findet die eigenen bisherigen Häkchen wieder: im Gerätespeicher oder als Vorbelegung im Link (C4).

### A5. Antworten von Namen, die nicht (mehr) im Team sind

- Die Person kann ihren Namen nur aus der Teamliste in Link 1 wählen. Ein unbekannter Name entsteht also nur, wenn der:die Koordinator:in das Team danach ändert.
- Vorschlag: Solche Antworten erscheinen getrennt unter „Nicht im Team“. Der Solver ignoriert sie. Der:Die Koordinator:in kann sie mit einem Tipp „ins Team übernehmen“ oder verwerfen.
- Wird eine Person aus dem Team entfernt, bleibt ihre Antwort gespeichert, zählt aber nicht. Ist sie irgendwo fix eingeteilt, erscheint ein Hinweis, weil Fix-Namen laut Schema im Team stehen müssen.
- **Risiko ohne Lösung im Auftrag:** Wählt jemand versehentlich den falschen Namen, überschreibt diese Antwort die der anderen Person. Die App zeigt beim Einfügen „ersetzt Antwort vom …“, kann den Irrtum aber nicht erkennen.

### A6. Sonderfälle bei Führungen

- **Über Mitternacht:** Abschnitt 6 macht „Ende ≤ Beginn“ zum Fehler. Führungen über Mitternacht lassen sich so **nicht eintragen**. Das ist in Ordnung, wenn es sie nicht gibt (C2).
- **Außerhalb des Rundenzeitraums:** Der Auftrag sagt dazu nichts. Vorschlag: eine Warnung in der Vorschau und Liste, kein Fehler. Die Führung wird mitgeplant, zählt aber trotzdem auf Min/Max, weil sie in dieser Runde verteilt wird.
- **Doppelte Führungen** (gleicher Ort, gleiches Datum, gleicher Beginn): Das können zwei parallele Gruppen sein. Daher **nur eine Warnung**, kein Fehler. Personen können ohnehin nicht beide gleichzeitig führen.
- **Zeitumstellung:** Eine Führung in der Nacht der Umstellung (z. B. 29.03., 01:00–03:30) dauert real eine Stunde weniger. Für Überschneidungen rechnet die App in Wanduhrzeit. Das ist bei Führungen tagsüber bedeutungslos.

### A7. „Fix zählt auf Min/Max“

Grundsätzlich sinnvoll: Wer fix eingeteilt ist, hat diese Führung. Problematisch ist es in diesen Fällen:

| Fall | Problem | Vorschlag |
|---|---|---|
| Fix allein > Max | Ein hartes Max wäre unerfüllbar, das Modell hätte keine Lösung. | Max begrenzt nur **freie** Einsätze: `frei ≤ max(0, Max − Fix)`. Die Person bekommt nichts dazu. Hinweis „Anna: 3 fix, Max 2“. |
| Fix überlappt Fix (gleiche Person) | Harte Überschneidungsregel wäre verletzt. | Fix wird nicht geprüft, sondern gesetzt. In der Vorschau und im Ergebnis erscheint eine Warnung. |
| Fix-Person hat nicht geantwortet, kann laut Antwort nicht oder hat die falsche Sprache | Widerspruch zu „nur verfügbar und passende Sprache“ | **Fix gewinnt.** Bei falscher Sprache erscheint ein Hinweis. |
| Freier Einsatz überlappt eigenen Fix-Einsatz | – | ist ausgeschlossen (harte Bedingung) |
| Fix ≥ Min | – | Min ist erfüllt, die Fairness rechnet ab dem Fix-Stand weiter. |

### A8. Weitere Lücken

- **Koordinator:in ist selbst Teammitglied.** Das ist wahrscheinlich, steht aber nicht im Auftrag. Diese Person soll dann auf dem eigenen Gerät antworten können, ohne Link an sich selbst (C8).
- **Mehrere Runden gleichzeitig:** Link 3 für November kommt, während Link 1 für Dezember offen ist. Die App speichert Runden nach ID getrennt.
- **Frist** ist nur Anzeige. Antworten nach der Frist werden weiter angenommen, weil der Auftrag nichts anderes sagt.
- **Kalendertitel bei offenen Plätzen** und Reihenfolge der Namen sind nicht festgelegt (C7).
- **Händische Korrektur:** Der Prototyp lässt nur passende Personen auswählen. Hat jemand telefonisch zugesagt, kann der:die Koordinator:in diese Person dann nicht eintragen (C6).
- **Repo-Name:** Das Repo heißt `fuehrungsvergabe`. Die Pages-Adresse lautet daher `https://<user>.github.io/fuehrungsvergabe/`, nicht `…/fuehrungsplan/`. Mit relativen Pfaden funktioniert beides. Eine Umbenennung ist möglich, ändert aber die Adresse, und gespeicherte Homescreen-Symbole zeigen dann ins Leere.

---

## B. Annahmen: Urteil und Begründung

### B1. Das `#`-Fragment wird nicht an den Server übertragen. **Bestätigt.**

- RFC 3986 §3.5: Das Fragment wird vor dem Abruf vom URI getrennt. Das Request-Target in HTTP besteht nur aus Pfad und Query (RFC 9112 §3.2). Den `Referer` entfernt der Browser das Fragment ebenfalls („strip url for use as a referrer“, Referrer Policy §8.4).
- Wer den Link trotzdem sieht: der Messenger bzw. Mail-Anbieter als Übermittler (WhatsApp und Signal Ende-zu-Ende, SMS und E-Mail nicht), der Browser-Verlauf und eine eventuelle Verlaufs-Synchronisierung (Chrome-Sync, iCloud). Link-Vorschauen holen die Seite ohne Fragment.
- Folge: Die App ruft nach dem Laden zusätzlich `history.replaceState` auf und entfernt die Daten aus der Adresszeile, sobald sie lokal übernommen sind. So bleiben sie nicht beim Teilen der Adresse oder im Lesezeichen hängen.

Quellen: [RFC 3986 §3.5](https://www.rfc-editor.org/rfc/rfc3986#section-3.5), [RFC 9112 §3.2](https://www.rfc-editor.org/rfc/rfc9112#section-3.2), [Referrer Policy – strip url](https://w3c.github.io/webappsec-referrer-policy/#strip-url)

### B2. Komprimierte Links bleiben kurz genug. **Teilweise widerlegt.**

**Gemessen** mit lz-string 1.5.0 `compressToEncodedURIComponent`, 40 Führungen, 15 Personen, eindeutige Beschreibungen mit Ø 85 Zeichen (3–4 Zeilen: Gruppe, Kontakt, Hinweis), Basis-URL 49 Zeichen:

| Inhalt | JSON (Zeichen) | ganzer Link (Zeichen) |
|---|---:|---:|
| Link 1 als Objekte, mit Beschreibung | 7.698 | **4.019** |
| Link 1 als Objekte, ohne Beschreibung | 3.922 | 1.779 |
| Link 1 kompakt¹, mit Beschreibung | 5.031 | 3.019 |
| Link 1 kompakt, ohne Beschreibung | 1.415 | **949** |
| Link 1 kompakt, ohne Beschreibung, mit Vorbelegung (C4) | 1.543 | 1.016 |
| Link 2 (Antwort, 20 von 40 angekreuzt) | 102 | **179** |
| Link 3 nur Zuordnung | 316 | 265 |
| Link 3 kompakt, selbsttragend, ohne Beschreibung | 1.703 | 1.138 |
| Link 3 kompakt, selbsttragend, mit Beschreibung | 5.319 | **3.224** |

¹ kompakt = Felder als Arrays, Orte und Fix-Namen als Index, Datum als Tag im Zeitraum, Zeiten in Minuten.

Skalierung (kompakt): Link 3 mit Beschreibung hat bei 10 Führungen 1.401 Zeichen, bei 20 Führungen 2.079 und bei 40 Führungen 3.224. Pro Führung kommen etwa 50 bis 60 Zeichen dazu, bei längeren Beschreibungen entsprechend mehr.

**Grenzen der Übertragungswege:**

| Weg | Grenze | Urteil |
|---|---|---|
| WhatsApp | Für die App für Privatnutzer ist keine Grenze offiziell dokumentiert. Die Business-API erlaubt 4.096 Zeichen pro Text. | 1–3 Tsd. Zeichen sind wahrscheinlich in Ordnung → **Gerätetest** |
| Signal | Ab etwa 2.000 Zeichen wird der Text als „Langtext-Anhang“ verschickt (signal-cli-Konstante, Herstellerangabe fehlt). Ob der Link darin antippbar bleibt, ist unklar. | **Gerätetest** |
| SMS | 153 Zeichen pro Segment. Ab einer vom Netz bzw. Gerät abhängigen Länge wird in MMS umgewandelt (200 bis 480 Zeichen berichtet). | **ungeeignet** für Link 1/3, Link 2 grenzwertig |
| E-Mail | Outlook Desktop kürzte Links über Safe Links bis 2023 bei 2.084 Zeichen, seit Build 16130 bei 8.192. Reine Text-Mails können lange Zeilen umbrechen. | bis etwa 2.000 Zeichen sicher |
| Browser | Chrome erlaubt URLs bis 2 MB. Andere Browser sind großzügig. | kein Engpass |

**Folge und Ausweg:**

1. **Link 1 ohne Beschreibung**, kompakt kodiert: unter 1.100 Zeichen. Für die Verfügbarkeitsmeldung wird die Beschreibung nicht gebraucht. Das ist in allen Messengern unkritisch.
2. **Link 3** braucht die Beschreibung für die persönliche `.ics`. Bei 40 Führungen sind es etwa 3.200 Zeichen. Ab 2.000 Zeichen zeigt die App einen Hinweis und bietet zusätzlich **„Plan als Datei teilen“** an: eine kleine `.json`-Datei, die die App wieder öffnet. Alternative: Link 3 ohne Beschreibung, dann fehlt sie in der persönlichen `.ics` (C3).
3. Link 2 ist mit unter 200 Zeichen unkritisch.

Quellen: [WhatsApp Business API – Text (4096)](https://developers.facebook.com/docs/whatsapp/api/messages/text/) (Auszug), [signal-cli: Nachrichtenlänge 2000](https://git.cs.tu-dortmund.de/marvin.weiler/signal-cli-with-http-logging/commit/11d38f29efb46c60c582c9a5bac9e61a83044752) (Auszug), [AOSP smsToMmsTextThreshold](https://android.googlesource.com/platform/packages/apps/Mms/+/ead2759%5E%21/), [Samsung: SMS wird zu MMS](https://ushl.samsung.com/hk_en/support/mobile-devices/why-do-my-sms-messages-sometimes-change-to-mms-even-when-i-am-not-sending-images), [Microsoft: Outlook URL-Limit 2084 → 8192](https://support.microsoft.com/en-us/support/known-issues/outlook-error-cannot-send-this-item-when-replying-to-an-email)

### B3. Ein angetippter Link öffnet PWA oder Browser, und die gespeicherten Personendaten sind dort verfügbar. **Für iOS widerlegt, für Android mit Einschränkungen bestätigt.**

**iOS/iPadOS:**

- Homescreen-Web-Apps haben **eigenen, von Safari getrennten Speicher**. Laut WebKit ist das so gewollt („by design“, Bug 181849). Seit Safari 17.2 werden beim Hinzufügen nur Cookies kopiert, kein localStorage und keine IndexedDB.
- Ein in WhatsApp, Signal oder Mail angetippter Link öffnet **Safari** bzw. den eingestellten Standardbrowser, **nicht die Homescreen-App**. Ein Mechanismus wie „Universal Links“ existiert nur für native Apps. Ab iOS 26 öffnen Homescreen-Lesezeichen standardmäßig als Web-App. Belege, dass sich damit am Öffnen fremder Links etwas ändert, habe ich nicht gefunden → **Gerätetest**.
- Andere Browser auf iOS (Chrome, Firefox) haben jeweils **eigenen** Speicher. In-App-Browser (Instagram, Facebook, teils Telegram) ebenso.
- **Folge:** Wer die App am iPhone zum Homescreen hinzufügt und dann Links aus WhatsApp antippt, landet in Safari, ohne gemerkten Namen, Sprachen und Min/Max.

**Android (Chrome):**

- Beim Installieren erzeugt Chrome eine WebAPK. Diese registriert einen Intent-Filter für den Manifest-Scope. Links in diesem Scope öffnen daher die installierte App (bzw. es kommt eine Nachfrage).
- Der Speicher ist mit dem Chrome-Tab geteilt (gleiches Browser-Profil). Bei Samsung Internet oder Firefox als Standardbrowser verhält es sich anders → **Gerätetest**.

**Konsequenzen für den Bau** (Vorschlag C4):

1. **Vorbelegung in Link 1:** Der:Die Koordinator:in schickt pro Person die letzten Sprachen und Min/Max mit. Das kostet etwa +70 Zeichen bei 15 Personen. Die Person muss dann nur noch ihren Namen wählen, auf jedem Gerät und in jedem Browser. Der Gerätespeicher ist nur noch Komfort (gemerkter Name, Häkchen bei erneutem Öffnen).
2. **Einfügen-Feld überall:** In der App kann man einen Link-Text einfügen, auch **mehrere Links auf einmal**, z. B. aus einem kopierten Chatverlauf. Das ist der Weg für den:die Koordinator:in auf dem iPhone mit Homescreen-App, weil Link 2 dort in Safari aufgehen würde.
3. Empfehlung in der Anleitung: **Personen auf dem iPhone nutzen einfach Safari** (kein Homescreen nötig). Der:Die **Koordinator:in nutzt PC oder Homescreen-App** (wegen B4).

Quellen: [WebKit Bug 181849 – Homescreen-Apps teilen Speicher nicht mit Safari](https://bugs.webkit.org/show_bug.cgi?id=181849) (Auszug), [WebKit: Safari 17.2](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/) (Auszug), [WWDC23 „What’s new in web apps“](https://developer.apple.com/videos/play/wwdc2023/10120/) (Auszug), [heise: iOS 26 Web-Apps](https://www.heise.de/en/news/iOS-26-and-iPadOS-26-Changed-web-app-behaviour-on-the-home-screen-10749652.html), [web.dev: WebAPKs](https://web.dev/articles/webapks)

### B4. iOS/Safari löscht lokale Daten nach Inaktivität. **Bestätigt, unter Bedingungen.**

- **Safari-Tab:** Intelligent Tracking Prevention löscht **allen per Skript beschreibbaren Speicher** einer Website (IndexedDB, localStorage, Service-Worker-Registrierung, Cache). Das passiert nach **7 Tagen, an denen Safari benutzt wurde, ohne dass man mit dieser Website interagiert hat**. Das gilt seit iOS 13.4 und Safari 13.1, auch auf dem Mac.
- **Homescreen-Web-Apps sind ausgenommen.** Sie haben einen eigenen Zähler für Nutzungstage, der bei Nutzung der App zurückgesetzt wird. Ihr Erstanbieter-Speicher soll nicht gelöscht werden.
- **Seit Safari 17:** Zusätzlich kann bei Speicherdruck oder längerer Nichtnutzung geräumt werden. `navigator.storage.persist()` schützt davor. WebKit gewährt das heuristisch, z. B. bei Homescreen-Web-Apps. Einzelne Entwickler:innen berichten trotzdem von Verlusten (Apple-Forum, iOS 15).
- **Folge für Koordinationsdaten:**
  1. Ein:e Koordinator:in auf iPhone oder Mac sollte nie nur im Safari-Tab arbeiten. Eine Runde läuft etwa einen Monat, die 7 Tage sind schnell erreicht. Dafür die Homescreen-App nutzen, oder am PC Chrome, Edge oder Firefox (dort gibt es keine 7-Tage-Regel).
  2. Die App ruft `navigator.storage.persist()` auf.
  3. **Sicherung ist Pflicht-Routine:** Die App zeigt „Letzte Sicherung: vor X Tagen / noch nie“ (C12).
  4. Für Personen ist ein Datenverlust harmlos, wenn Link 1 die Vorbelegung enthält (B3).

Quellen: [WebKit: Updates to Storage Policy (Safari 17)](https://webkit.org/blog/14403/updates-to-storage-policy/) (Auszug), [WebKit: Full Third-Party Cookie Blocking and More (7-Tage-Regel)](https://webkit.org/blog/10218/full-third-party-cookie-blocking-and-more/) (Auszug), [WebKit Tracking Prevention](https://webkit.org/tracking-prevention/) (Auszug), [Apple-Forum: PWA-Daten über 7 Tage](https://developer.apple.com/forums/thread/710157) (Auszug)

### B5. Downloads (`.ics`, `.json`, `.xlsx`) funktionieren in der installierten PWA, und die `.ics` lässt sich in den Kalender übernehmen. **Unklar, teilweise widerlegt.**

- **iOS, Homescreen-App:** `<a download>` mit Blob öffnet laut mehreren Berichten von Entwickler:innen eine Vorschau statt zu speichern. Teilweise bleibt man darin ohne Zurück-Knopf gefangen. Zuverlässiger ist `navigator.share({ files: [datei] })`, also das Teilen-Menü mit „In Dateien sichern“, AirDrop oder Messenger. Laut Bericht nur die Datei übergeben, ohne Text oder Titel.
- **`.ics` auf iOS:** Das Teilen-Menü zeigt die Datei nur an, ohne Import-Knopf. „Zum Kalender hinzufügen“ erscheint laut Bericht, wenn Safari direkt zu einer `text/calendar`-Ressource navigiert, z. B. zu einer Blob-URL ohne `download`-Attribut. Eine Bestätigung von Apple fehlt, eine Angabe der iOS-Version auch → **Gerätetest**.
- **Google Kalender:** Laut Google-Hilfe ist der `.ics`-Import **nur am Computer** möglich (calendar.google.com → Einstellungen → Importieren & Exportieren). Die Google-Kalender-App für Android und iOS kann keine `.ics` importieren. Auf dem Handy landet eine `.ics` im **Gerätekalender**: auf dem iPhone in Apple Kalender, wo man einen Google-Kalender wählen kann, wenn das Google-Konto in iOS eingerichtet ist; auf Android im Kalender des Herstellers, falls vorhanden.
- **Android/Chrome:** Downloads per Blob funktionieren im Tab und in der WebAPK (Ordner „Downloads“). Das Öffnen der `.ics` hängt davon ab, welche Kalender-App sie annimmt → **Gerätetest**.
- **Folge:**
  - Ziel „Import in Google Kalender“: Der:Die **Koordinator:in importiert am PC**. Das ist der bisherige Weg und funktioniert sicher.
  - Für **Personen am Handy** gibt es den Knopf „Meine Termine“. Er wählt je Plattform den passenden Weg: iOS direkte Navigation, sonst Download, als Ausweichweg Teilen. Ob die Termine dann in Google landen, hängt von den Kalenderkonten auf dem Gerät ab.
  - Sicherung und Vorlage: Download bzw. auf iOS das Teilen-Menü.

Quellen: [Google-Hilfe: Termine importieren (Computer)](https://support.google.com/calendar/answer/37118?hl=en&co=GENIE.Platform%3DDesktop) (Auszug), [Google-Hilfe: dieselbe Seite für Android](https://support.google.com/calendar/answer/37118?hl=en&co=GENIE.Platform%3DAndroid) (Auszug), [renkei PR #302 (iOS-Downloads über Teilen-Menü)](https://github.com/campfhir/renkei/pull/302), [uruni Issue #475 (Blob-Viewer in iOS-PWA)](https://github.com/kerti/uruni/issues/475), [gpk-calculator PR #114 (.ics auf iOS per direkter Navigation)](https://github.com/z9bl/gpk-calculator/pull/114), [Apple-Forum: Download in PWA](https://developer.apple.com/forums/thread/119017)

### B6. Google Kalender importiert `.ics` mit `TZID=Europe/Vienna` korrekt. **Wahrscheinlich bestätigt.** Erneuter Import derselben UID: **unklar.**

- **RFC 5545 §3.6.5** verlangt für jede verwendete `TZID` einen **VTIMEZONE**-Block in der Datei. Viele Exporte lassen ihn weg. Für Regelkonformität kommt er hinein: Europe/Vienna, CET/CEST, Umstellung am letzten Sonntag im März um 02:00 und am letzten Sonntag im Oktober um 03:00, EU-Regel seit 1996.
- **Warum TZID statt UTC:** Mit `DTSTART;TZID=Europe/Vienna:20261107T100000` steht die Wiener Wanduhrzeit in der Datei. Die Umrechnung macht der Kalender. Das ist unabhängig von der Zeitzone des Geräts, das die Datei erzeugt, und unabhängig davon, ob der Browser des:der Koordinator:in aktuelle Zeitzonendaten hat. Bei Terminen über den Umstellungstag hinweg ergibt sich die richtige Uhrzeit. Google versteht IANA-Namen wie `Europe/Berlin` laut aktuellem Erfahrungsbericht direkt. Ältere Berichte (2009–2012) beschreiben Probleme. Offizielle Doku dazu gibt es nicht → **Gerätetest** mit einem Termin im Sommer und einem im Winter.
- **Erneuter Import derselben UID:** Die Berichte widersprechen sich. Ein Bericht sagt „bereits importiert, übersprungen“ (Zoho-Forum), andere sagen „aktualisiert“ oder „Duplikat“. Google dokumentiert das nicht. **Folge:** Der Ablauf braucht keinen erneuten Import, denn nachträgliche Änderungen gehören laut Auftrag in Google. Die App sagt beim Export: „Nur einmal importieren. Änderungen danach direkt im Google Kalender.“
- **UID:** `<rundenId>-<führungsId>@fuehrungsplan`. Sie ist stabil und in Gesamt- und Personen-Datei identisch. Landen beide im **selben** Kalender, greift das Verhalten bei gleicher UID (vermutlich übersprungen). In **verschiedenen** Kalendern ist es unproblematisch.
- Die übrigen RFC-Regeln sind unstrittig und werden getestet: Zeilen über 75 Oktette falten (UTF-8-sicher), `\` `;` `,` und Zeilenumbruch in TEXT escapen (§3.3.11), CRLF, `DTSTAMP` Pflicht.

Quellen: [RFC 5545 §3.6.5 VTIMEZONE](https://www.rfc-editor.org/rfc/rfc5545#section-3.6.5), [§3.1 Zeilenfaltung](https://www.rfc-editor.org/rfc/rfc5545#section-3.1), [§3.3.11 TEXT](https://www.rfc-editor.org/rfc/rfc5545#section-3.3.11), [Discourse: TZID=Europe/Berlin in Google korrekt](https://meta.discourse.org/t/calendar-event-ics-export-wrong-time-1-h-when-importing-into-outlook-with-tzid-europe-berlin/409797?tl=en), [Zoho-Forum: „bereits importiert“](https://help.zoho.com/portal/pt/community/topic/fyi-ics-file-format-bug) (Auszug), [Google-Hilfe: Importprobleme](https://support.google.com/calendar/answer/45654?hl=en) (Auszug)

### B7. Der Solver läuft offline, ist deterministisch und schnell genug. **Bestätigt (gemessen).**

**Kandidaten:**

| Paket | Lizenz | Größe (roh / gzip) | Art |
|---|---|---|---|
| `yalps` 0.6.4 | MIT | 9,9 KB / **4,1 KB** | reines JavaScript, Simplex + Branch-and-Cut |
| `highs` 1.15.3 (HiGHS als WebAssembly) | MIT | 3,7 MB / **1,25 MB** (wasm + js) | professioneller MIP-Solver |
| `javascript-lp-solver` | Unlicense | – | Vorgänger von YALPS, langsamer laut YALPS-Benchmark; nicht weiter betrachtet |
| `glpk.js` | **GPL-3.0** | – | Copyleft-Lizenz; ohne Not nicht nehmen |

**Gemessen in Node 22**, Modell wie in B10, 3–5 zufällige Instanzen je Größe, Szenarien „knapp“, „locker“ und „Überangebot“:

| Größe | Binärvariablen | HiGHS | YALPS | gleiche Optimalwerte | deterministisch |
|---|---:|---:|---:|---|---|
| 6 Führungen × 5 Personen | 4–13 | 2–59 ms | 0–7 ms | ja | ja |
| 40 × 15 (realistisch) | 158–403 | 11–72 ms | 1–21 ms | ja | ja |
| 80 × 25 | 507–1.124 | 19–47 ms | 14–101 ms | ja | ja |
| 120 × 30 (Stress) | 898–2.036 | 33–77 ms | 37–354 ms | ja | ja |

**Gemessen in Chromium 147 mit CPU-Drosselung** als Näherung für ein Mittelklasse-Handy (Szenario Überangebot, also mit den meisten Gleichständen):

| Drosselung | HiGHS laden + kompilieren | 40 × 15 YALPS / HiGHS | 80 × 25 YALPS / HiGHS | 120 × 30 YALPS / HiGHS |
|---|---:|---:|---:|---:|
| 1× | 403 ms | 33 / 150 ms | 123 / 66 ms | 475 / 96 ms |
| 4× | 454 ms | 42 / 87 ms | 536 / 252 ms | 1.615 / 348 ms |
| 6× | 525 ms | 79 / 123 ms | 764 / 315 ms | 2.518 / 524 ms |

- **Determinismus:** Für jede Instanz habe ich 5–10-mal gelöst und zusätzlich mit umgekehrter Reihenfolge von Führungen und Antworten. Dabei kam immer **dieselbe Zuteilung** heraus. Voraussetzung: Die App sortiert die Eingabe vor dem Modellbau fest (Führungen nach Datum, Beginn, ID; Personen nach Name). Sie setzt **kein Zeitlimit**, weil ein Abbruch nach Zeit vom Gerät abhängt. Als Notbremse dient ein Iterationslimit, das deterministisch ist. Wird es erreicht, erscheint ein Hinweis.
- **Offline:** Beide Pakete sind statische Dateien, die der Service Worker zwischenspeichert. HiGHS braucht dafür den wasm-MIME-Typ, den GitHub Pages liefert.
- **Sonderfälle** (beide Solver, alle mit Lösung): keine Antworten; Fix > Max; Fix überlappt Fix; mehr Plätze als Personen; Sprache passt nicht.
- **Überholt durch D4: Gewählt ist jetzt HiGHS.** Ursprüngliche Wahl war YALPS. In realistischer Größe (≈ 40 × 15) braucht es selbst bei 6-facher Drosselung unter 0,1 s. Es ist 300-mal kleiner, was beim ersten Laden über mobile Daten zählt, und hat keine wasm-Abhängigkeit. HiGHS ist bei mehr als 80 Führungen klar schneller und robuster. Weil der Modellbau vom Solver getrennt ist, lässt sich HiGHS nachrüsten, falls Runden deutlich größer werden.

Quellen: [YALPS README (Benchmarks, Grenzen)](https://github.com/IanManske/YALPS), [highs-js (npm)](https://www.npmjs.com/package/highs), [Gurobi: Zeitlimit ist nicht reproduzierbar](https://support.gurobi.com/hc/en-us/articles/360031636051) (Auszug; gilt sinngemäß für jeden Solver)

### B8. Excel-Datums- und Zeitwerte sowie mehrzeilige Zellen werden korrekt gelesen. **Bestätigt, unter Bedingungen (teilweise gemessen).**

**Datei-Import (`.xlsx`):**

- Datum ist eine **Seriennummer** (Tage seit 30.12.1899), Zeit ein **Tagesbruchteil** (10:00 = 0,41666…). Die App rundet auf ganze Minuten, wegen Gleitkomma-Fehlern.
- Das 1900-System übernimmt den Lotus-Fehler, dass es den 29.02.1900 als Serial 60 gibt. Für Daten ab März 1900 ist das irrelevant. Ältere Mac-Mappen nutzen das **1904-System** (`<workbookPr date1904="1"/>`). Der Versatz beträgt 1.462 Tage.
- Datum oder Zeit können auch als **Text** in der Zelle stehen (`08.11.2026`, `14:00`).
- **Gemessen:** Ich habe mit openpyxl zwei Mappen erzeugt (1900- und 1904-System), jeweils mit Serien-Datum, Text-Datum, Zeitbruch, Text-Zeit, mehrzeiliger Zelle mit Anführungszeichen, Zusatzspalte und leeren optionalen Zellen. Ein Prototyp-Leser (unzip + XML) liest beide korrekt: 07.11.2026 10:00, 08.11.2026 14:00, 29.03.2026 01:00, Zeilenumbruch und `"` erhalten.
- **Noch nicht gemessen:** eine **von Excel selbst gespeicherte** Datei. Excel nutzt „Shared Strings“ statt Inline-Text. Der Leser kann beides, getestet ist nur Inline-Text. Bitte in Phase 1 eine echte Excel-Datei aus dem Alltag zum Testen beilegen, gern anonymisiert.
- **Bibliothek:** SheetJS auf npm ist bei Version 0.18.5 stehen geblieben und hat zwei bekannte Lücken (CVE-2023-30533 Prototype Pollution, behoben in 0.19.3; CVE-2024-22363 ReDoS, behoben in 0.20.2). Die behobenen Versionen gibt es nur über cdn.sheetjs.com, das aus dieser Umgebung gesperrt ist. **Vorschlag:** ein eigener kleiner Leser (etwa 150 Zeilen) mit `fflate` (MIT) zum Entpacken. Er liest nur Tabelle 1, Shared Strings, Inline-Text und das Datumssystem. Das ist leicht testbar und hat keine bekannten Lücken. Die Spaltenerkennung über die Überschrift macht die Zellformate (`styles.xml`) überflüssig.
- **Vorlage `vorlage-fuehrungen.xlsx`:** Ein Python-Skript im Repo erzeugt sie mit openpyxl. Die Auswahlliste DE/EN als Datenvalidierung habe ich erzeugt und in der Datei geprüft. Die Datei wird eingecheckt. Die beiden Beispielzeilen sind als „BEISPIEL – löschen“ markiert. Damit sie beim Import nicht stillschweigend übernommen werden, markiert die Vorschau Zeilen, die das Wort „BEISPIEL“ in der Spalte Ort enthalten, als Problem.

**Kopieren und Einfügen:**

- Excel legt **Tab-getrennten Text** in die Zwischenablage. Zellen mit Zeilenumbruch stehen in `"…"`, innere `"` werden verdoppelt. Zeilen enden je nach System mit CRLF oder LF, Umbrüche in Zellen meist mit LF. Der Parser akzeptiert beides und trennt nur außerhalb von Anführungszeichen.
- Eingefügt werden die **angezeigten** Werte, nicht die Seriennummer. Das Format hängt vom Zellformat und vom Gebietsschema ab: `07.11.2026`, `7.11.2026`, `Sa., 7. November 2026`, `10:00`, `10:00:00`, oder sogar `46333`, wenn die Zelle das Format „Standard“ hat. Akzeptiert werden `T.M.JJJJ` / `TT.MM.JJJJ`, ISO `JJJJ-MM-TT`, `hh:mm[:ss]` und eine reine Seriennummer. **Alles andere erscheint als Problemzeile**, es wird nicht geraten. Zweistellige Jahre gelten ebenfalls als Problem.
- Google Sheets und LibreOffice liefern dasselbe Format. Getestet wird es in Phase 1 mit festen Beispieltexten.

Quellen: [Microsoft: 1900- und 1904-Datumssystem](https://learn.microsoft.com/en-us/office/troubleshoot/excel/1900-and-1904-date-system), [Microsoft: Excel hält 1900 für ein Schaltjahr](https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year), [SheetJS-Advisory CVE-2024-22363](https://cdn.sheetjs.com/advisories/CVE-2024-22363) (Auszug), [SheetJS Issue #3012 (0.18.5 meldet Lücke)](https://git.sheetjs.com/sheetjs/sheetjs/issues/3012) (Auszug), [Mathesar #2811 (Excel-Zwischenablage, Anführungszeichen)](https://github.com/mathesar-foundation/mathesar/issues/2811), [Microsoft Tech Community: mehrzeilige Zellen kopieren](https://techcommunity.microsoft.com/discussions/excelgeneral/copying-multiline-text/44683)

### B9. Der Service Worker funktioniert unter dem GitHub-Pages-Unterpfad. **Bestätigt.**

- Der Scope eines Service Workers ist standardmäßig das Verzeichnis seiner Skriptdatei. `navigator.serviceWorker.register('./sw.js')` von `/fuehrungsvergabe/index.html` ergibt den Scope `/fuehrungsvergabe/`. Dafür ist kein `Service-Worker-Allowed`-Header nötig, den Pages auch nicht setzen kann.
- Im Manifest stehen `start_url: "./"` und `scope: "./"`. Diese Werte gelten relativ zur Manifest-Adresse. Alle Pfade in der App sind relativ, keiner beginnt mit `/`.
- GitHub Pages liefert HTTPS, was Pflicht für Service Worker ist, und setzt `Cache-Control: max-age=600`. Der Service Worker cacht daher mit Versionsnamen und lädt neue Versionen beim nächsten Start nach.
- **Hinweis:** Alle Project-Pages eines GitHub-Kontos teilen sich den Origin `<user>.github.io`. Andere Projekte desselben Kontos könnten den Speicher der App lesen. Die App verwendet eigene Schlüssel-Präfixe und einen eigenen Cache-Namen.
- Getestet wird in Phase 1 mit lokalem Server unter `/fuehrungsvergabe/` und Playwright im Offline-Modus.

Quellen: [MDN: ServiceWorkerContainer.register (Scope)](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerContainer/register), [MDN: Manifest scope](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/scope), [GitHub Docs: Project-Sites unter `<user>.github.io/<repo>`](https://docs.github.com/en/pages/getting-started-with-github-pages/about-github-pages)

### B10. Das ILP mit weichen Bedingungen liefert immer eine Lösung, und die Gewichte erzeugen keine unerwünschten Effekte. **Bestätigt, aber nur mit den Bedingungen unten (gemessen).**

**Modell:**

- Variablen
  - x(p,f) ∈ {0,1} nur für erlaubte Paare: Person hat geantwortet und „kann“, Sprache passt, Person ist nicht schon fix auf f, und f überschneidet sich nicht mit einer eigenen Fix-Führung.
  - offen(f) ≥ 0 – unbesetzte freie Plätze
  - unter(p) ≥ 0 – Einsätze, die zu Min fehlen
- Harte Bedingungen
  - Plätze: Σₚ x(p,f) + offen(f) = Personen(f) − |Fix(f)|
  - Überschneidung: Für jeden Zeitpunkt, an dem eine Führung beginnt, gilt Σ x(p,f) ≤ 1 über alle Führungen der Person, die zu diesem Zeitpunkt laufen. Für Intervalle ist das exakt.
  - Max hart nur für freie Einsätze: Σ_f x(p,f) ≤ max(0, Max(p) − Fix(p))
- Weich: Σ_f x(p,f) + unter(p) ≥ Min(p) − Fix(p)

**Warum es immer eine Lösung gibt:** „Niemand frei eingeteilt“ (alle x = 0, offen = alle freien Plätze, unter = fehlende Min) erfüllt jede Bedingung, weil Fix aus allen harten Bedingungen herausgenommen ist. **Gemessen:** Alle 42 Zufallsinstanzen und 5 Sonderfälle waren lösbar, und die nachträgliche Prüfung des Plans auf Überbuchung, Max und Überschneidung fand 0 Fehler.

**Ziel (minimieren), Rangfolge streng:**

1. **Offener Platz**, Gewicht W₁. Das ist der teuerste Posten: Ein Platz bleibt nur offen, wenn ihn niemand Passendes mehr übernehmen kann.
2. **Unterschreitung von Min**, Gewicht W₂ je fehlender Führung.
3. **Gleichmäßigkeit:** Der k-te Einsatz einer Person kostet F · k / Max(p) (konvex steigend, gezählt ab dem Fix-Stand). Der nächste Einsatz geht also an die Person mit der **geringsten Auslastung ihres eigenen Maximums**. Beispiel: Anna (Max 2) und Ben (Max 4), 4 Plätze. Die Kosten sind Ben 2,5 · 5 · 7,5 · 10 und Anna 5 · 10. Ergebnis: Anna 1, Ben 3, das sind 50 % bzw. 75 % Auslastung. Die Alternative Anna 2, Ben 2 hätte 100 % / 50 %.
   - Begründung: „Gleichmäßig relativ zu Min/Max“ heißt, wer mehr Zeit angibt, bekommt mehr, aber im gleichen Verhältnis. Min ist über Rang 2 schon gesichert. Eine Formel mit (k − Min)/(Max − Min) wäre bei Min = Max undefiniert.
   - Linear umsetzbar mit Stufenvariablen 0 ≤ z(p,k) ≤ 1, ohne zusätzliche Ganzzahligkeit.
4. Die **Gewichte werden pro Runde berechnet**, sodass die Rangfolge garantiert gilt: F so, dass alle Fairnesskosten zusammen < 1 sind; W₂ = 1; W₁ = ΣMin + 1. Feste Werte wie 1000/100/10 können bei großen Runden die Rangfolge verletzen, weil viele kleine Fairnesskosten zusammen einen Min-Punkt überwiegen.

**Effekte, die geprüft werden mussten:**

- **„Lieber Max überschreiten als einen Platz offen lassen?“** Mit hartem Max: **nie.** Ich empfehle das hart (C1). Max ist die eigene Zusage der Person. Ein offener Platz ist im Ergebnis rot sichtbar, der:die Koordinator:in kann ihn händisch besetzen, und die Person wird dabei gefragt. Ein weiches Max mit W₂ < W_Max < W₁ würde Personen still über ihr Limit verplanen. Max weich zu machen ist **nicht nötig**, damit es immer eine Lösung gibt. Nötig war nur, Fix aus Max herauszunehmen (A7).
- **„Lieber Platz offen lassen, um jemandes Min zu erfüllen?“** Nein, W₁ > W₂. Ein Einsatz nimmt niemandem einen Platz weg, Min wird nur durch Umverteilung beeinflusst.
- **Personen ohne Min bekommen nichts,** wenn genug andere da sind. Gewollt: Die Fairness verteilt nur, was an Plätzen da ist, es gibt keinen Zwang zu Einsätzen.
- **Gleichstände** (mehrere gleich gute Pläne) löst der Solver deterministisch auf (B7). Fachlich gibt es dafür keine Regel. Es bekommt nicht systematisch die alphabetisch erste Person.

### Gerätetest-Checkliste (nur auf echten Geräten prüfbar)

| # | Test | Gerät |
|---|---|---|
| G1 | WhatsApp und Signal: Link mit 1.000, 2.000 und 3.300 Zeichen verschicken. Kommt er bei der empfangenden Person vollständig und antippbar an? | iPhone + Android |
| G2 | Link aus WhatsApp antippen bei installierter Homescreen-App: Öffnet sich Safari oder die App? Ist der gemerkte Name da? | iPhone (iOS 26) |
| G3 | Dasselbe mit installierter Chrome-App. | Android |
| G4 | „Meine Termine“ (.ics) in der Homescreen-App bzw. in Safari: Erscheint „Zum Kalender hinzufügen“? | iPhone |
| G5 | `.ics` öffnen: Welche Kalender-App nimmt sie an? | Android |
| G6 | Gesamt-`.ics` in calendar.google.com importieren: Ein Termin im Sommer und einer im Winter auf richtige Uhrzeit prüfen, Titel `Ort Name, Name`, Beschreibung mehrzeilig. Dann dieselbe Datei erneut importieren und notieren, was passiert. | PC |
| G7 | Sicherung speichern („In Dateien sichern“) und auf anderem Gerät öffnen. | iPhone → PC |
| G8 | Flugmodus: App öffnen, Link 1 öffnen, antworten, einteilen, `.ics` erzeugen. | alle |

---

## C. Offene Fragen

Hier stehen nur Fragen, deren Antwort den Bau ändert. **Fett** ist jeweils der Vorschlag, der ohne andere Entscheidung gilt.

> Beantwortet am 15.10. Was daraus folgt, steht in Teil D. Die Liste bleibt hier unverändert, damit nachvollziehbar ist, was gefragt wurde.

1. **Max hart oder weich?** → **Hart** (nur für freie Einsätze). Fix darf Max überschreiten, dazu erscheint ein Hinweis. Ein offener Platz wird von dem:der Koordinator:in händisch gelöst. (B10, A7)
2. **Gibt es Führungen über Mitternacht?** → **Nein.** „Ende ≤ Beginn“ bleibt ein Fehler. (A6)
3. **Beschreibung in den Links:** → **Link 1 ohne Beschreibung, Link 3 mit.** Ab 2.000 Zeichen zeigt die App einen Hinweis und bietet zusätzlich „Plan als Datei teilen“ an. Alternative: Link 3 ebenfalls ohne Beschreibung; dann fehlt sie in der persönlichen `.ics`, nur die Gesamtdatei hat sie. (B2)
4. **Vorbelegung Sprachen/Min/Max in Link 1 mitschicken** (aus den letzten Antworten bei dem:der Koordinator:in)? → **Ja.** Grund: Auf dem iPhone ist der Gerätespeicher beim Öffnen aus dem Messenger oft ein anderer. Der Gerätespeicher bleibt zusätzlich als Komfort. (B3)
5. **Änderungen nach Link 1:** → **Revision und neuer Link 1.** Neue oder zeitlich bzw. sprachlich geänderte Führungen gelten bei älteren Antworten als „nicht gemeldet“, mit Hinweis. (A4)
6. **Händische Korrektur:** → **Alle Teammitglieder wählbar.** Passende stehen oben. Unpassende (kann nicht, falsche Sprache, Überschneidung, über Max) sind markiert und erzeugen einen Hinweis. Alternative wie im Prototyp: nur passende. (A8)
7. **Kalendertitel:** → **nur eingeteilte Namen, Fix zuerst, dann alphabetisch, kein Platzhalter** für offene Plätze, z. B. `Museum Hans, Peter`. Ist niemand eingeteilt: nur `Museum`. Soll ein offener Platz sichtbar sein (z. B. `Museum Hans, ?`)?
8. **Koordinator:in ist auch Teammitglied** und meldet sich direkt im eigenen Gerät, ohne Link an sich selbst? → **Ja.**
9. **Fairness-Formel „Auslastung des eigenen Max“** (k/Max)? → **Ja.** Alternative: gleiche absolute Anzahl, unabhängig vom Max. (B10)
10. **Wer importiert wohin?** → **Der:Die Koordinator:in importiert die Gesamtdatei am PC in den gemeinsamen Google Kalender** wie bisher. Personen holen sich ihre Termine optional in den eigenen Kalender. Wenn Personen den gemeinsamen Kalender ohnehin sehen, ist die persönliche `.ics` doppelt. Soll sie trotzdem angeboten werden? (B5, B6)
11. **„Sicherung öffnen“:** → **Ersetzt den gesamten Stand** nach Rückfrage, ohne Zusammenführen. Das ist der einfachste und sichere Weg für Gerätewechsel und Übergabe. (Abschnitt 9)
12. **Sicherungs-Erinnerung** „Letzte Sicherung: vor X Tagen“ in der Koordinationsansicht? → **Ja**, dezent, ohne Pop-up. Sie ist nicht ausdrücklich verlangt, aber wegen B4 der wichtigste Schutz der Koordinationsdaten.

Technische Entscheidungen ohne Rückfrage:

- YALPS als Solver (B7)
- eigener xlsx-Leser mit fflate statt SheetJS (B8)
- Vorlage per openpyxl-Skript (B8)
- kein Build-Schritt (ES-Module, Bibliotheken im Repo); GitHub-Actions-Workflow, der Tests ausführt und den App-Ordner nach Pages deployt
- Import fügt nur hinzu (A3)
- `de`/`en` in Kleinbuchstaben werden akzeptiert (A3)
- Runden-ID zufällig (A2)

---

## D. Entscheidungen vom 15.10.2026 und ihre Folgen

### D1. Festgelegt

| Thema | Entscheidung | Folge für den Bau |
|---|---|---|
| Koordinationsansicht | wird zu 99 % auf einem Büro-Laptop genutzt | **Für den Desktop gestaltet:** Tabellen, breite Ansicht, Tastatur. Am Handy muss sie nur benutzbar sein. |
| Personen-Ansicht | Handy | **Mobile-first**, große Tippflächen |
| Personen pro Führung | Gesamtzahl inklusive Fix | wie in A3 angenommen |
| Groß-/Kleinschreibung | Sprache **und Namen** werden ohne Rücksicht darauf verglichen | Betrifft Excel-Import, Fix-Spalte und Antworten. Gespeichert wird die Schreibweise aus der Teamliste. |
| Falscher Name in einer Antwort | wird hingenommen, ein Mensch prüft | Die App zeigt nur „ersetzt Antwort vom …“. |
| Uhrzeiten | keine Führungen über Mitternacht; üblich 06:00–22:00, **aber kein Fehler außerhalb** | Einziger Zeitfehler ist **Ende ≤ Beginn**. Ende = Beginn zählt mit, weil eine Führung ohne Dauer nicht sinnvoll ist (Auftrag Abschnitt 6). Zeiten außerhalb von 06–22 Uhr erzeugen weder Fehler noch Hinweis. Die persönliche `.ics` darf dadurch vor 06:00 beginnen oder nach Mitternacht enden; RFC 5545 erlaubt das. |
| A7 (Fix und Min/Max) | alle Vorschläge angenommen | – |
| Kalendertitel Gesamtkalender | Ort + Namen **alphabetisch**, je offener Platz `??` | Deutsche Sortierung, Fix hat keinen Vorrang. Beispiele: `Museum Anna, Ben`, `Museum Anna, ??`, `Museum ??, ??` |
| Repo-Name | bleibt `fuehrungsvergabe` | – |
| Min/Max | **keine Vorbelegung**, weder aus dem Link noch aus dem Gerätespeicher | Die Felder starten leer und sind Pflicht. Das weicht bewusst von Abschnitt 3 des Auftrags ab („vorbelegt mit den Werten der letzten Runde“). „Neue Runde aus letzter“ übernimmt nur noch Team und Sprachen. Min/Max stehen nur in Link 2, den nur der:die Koordinator:in bekommt. **Max ist begrenzt auf die Zahl der Führungen, die für die Person möglich sind**: angekreuzte Führungen in ihrer Sprache plus ihre Fix-Führungen. Nimmt sie Häkchen weg, sinkt die Grenze sofort sichtbar mit, Min ≤ Max ebenso. Der Solver rechnet zusätzlich mit *wirksamem Max* = min(Max, noch mögliche Führungen), etwa wenn Häkchen durch eine Zeitänderung ungültig wurden (A4). Sonst wirkt die Person in der Fairness-Rechnung zu wenig ausgelastet. |
| Sprachen | werden in Link 1 pro Person vorbelegt, aus der letzten Antwort | Die Person kann sie ändern. Wer Link 1 dekodiert, sieht die Sprachen aller Teammitglieder. Das ist laut Entscheidung in Ordnung. |
| C1 Max | hart, dazu ein Hinweis, wer mit Max-Überschreitung einspringen könnte | Bei jedem offenen Platz zeigt das Ergebnis die Personen, die „kann“ gemeldet haben, die Sprache sprechen und keine Überschneidung mit eigenen Einsätzen haben, aber schon bei Max sind. Beispiel: „Sa 07.11. Museum 10:00: 1 offen – möglich über Max: Anna (3/3), Ben (2/2)“. Geprüft wird nur das Ergänzen einer Person, keine Umverteilung. |
| C5 Änderungen nach Link 1 | Eine Sprachänderung ist kein Problem | Für eine Person ungültig wird ein Häkchen nur bei Änderung von **Datum, Beginn oder Ende** sowie bei **neuen** Führungen. Bei einer Sprachänderung bleibt das Häkchen gültig, der Solver prüft ohnehin, ob die Person die neue Sprache spricht. Ort, Kurztitel, Langtext, Personenzahl und Fix lassen Antworten ebenfalls gültig. |
| C6 Korrektur | alle Teammitglieder wählbar | wie vorgeschlagen, Unpassende sind markiert |
| C8 Koordinator:in antwortet selbst | nimmt das eigene Handy wie alle | Es gibt keinen eigenen Antwortweg in der Koordinationsansicht. |
| C9 Fairness | darf sich nach Stunden richten | siehe D4 |
| C10 persönliche `.ics` | wird angeboten | siehe D5 |
| C11 / C12 | wie vorgeschlagen | Sicherung öffnen ersetzt den Stand nach Rückfrage. Dezente Sicherungs-Erinnerung. |

### D2. Beschreibung in zwei Teile (Kurztitel + Langtext): **Empfehlung ja**

- **Excel:** neue optionale Spalte **„Kurztitel“** (eine Zeile, z. B. „Volksschule Linz“). Die Spalte **„Beschreibung“** bleibt der mehrzeilige Langtext. Ein Zeilenumbruch im Kurztitel erscheint als Problemzeile. Die Vorlage wird entsprechend angepasst.
- **Nutzen:** Der Kurztitel hilft der Person beim Ankreuzen (Schulklasse oder Erwachsene?) und kostet wenig Platz. Den Langtext braucht vor allem, wer die Führung hält.
- **Gemessen** mit lz-string, kompakter Kodierung, **90 Führungen, 25 Personen**, Ø Kurztitel 17 Zeichen:

| Inhalt | Langtext Ø 99 Z. | Langtext Ø 215 Z. |
|---|---:|---:|
| Link 1 ohne Kurztitel, ohne Langtext | 1.778 | 1.800 |
| Link 1 mit Kurztitel, ohne Langtext | 2.541 | 2.557 |
| Link 1 mit Kurztitel + Sprachen-Vorbelegung | **2.578** | 2.568 |
| Link 1 mit Kurztitel + Langtext | 7.527 | 10.790 |
| Link 2 (≈ 45 von 90 angekreuzt) | **305** | 305 |
| Link 3 mit Kurztitel, ohne Langtext | **2.931** | 2.963 |
| Link 3 mit Kurztitel + Langtext | 7.974 | 11.221 |

### D3. Text statt Link: **Empfehlung: eine Nachricht, die beides ist**

- Die App erzeugt eine **fertige WhatsApp-Nachricht**: eine Zeile Erklärung (z. B. „Führungsvergabe 01.11.–12.12., Rückmeldung bis 25.10. – antippen oder ganze Nachricht kopieren und in der App einfügen“), darunter der Link. Der Link *ist* der Text-Code, es gibt also nur eine Ausgabe. Knöpfe: **„Nachricht kopieren“**, am Handy zusätzlich **„Teilen“**.
- **Empfangende:** Link antippen, **oder** die Nachricht lange drücken → Kopieren → App öffnen → **„Einfügen“**. Das Einfügefeld findet den Code in beliebigem Text, auch mit Grußtext davor oder mehreren Nachrichten untereinander. Das ist das Einfügefeld aus dem Prototyp, nur robuster.
- **WhatsApp verändert den Code nicht:** Das Alphabet von `compressToEncodedURIComponent` besteht aus `A–Z a–z 0–9 + - $`. Es enthält keine WhatsApp-Formatzeichen (Sternchen, Unterstrich, Tilde, Backtick).
- **Kein `wa.me/?text=…`-Knopf:** Der Text stünde dort in der Query, nicht im Fragment, und ginge an den Server von wa.me. Das verbietet Abschnitt 2 Nr. 6 des Auftrags.
- **Länge:** Für Privatchats wird überall eine Grenze von 65.536 Zeichen pro Nachricht genannt, allerdings nur von Drittanbietern, nicht von WhatsApp selbst. Selbst der längste Fall (11 Tsd.) passt also als Text. Ob WhatsApp Links mit 2,6 bis 3 Tsd. Zeichen noch **antippbar** macht, klärt Gerätetest G1. Falls nicht, bleibt Kopieren und Einfügen.
- **Koordinator:in am Laptop:** Link 2 (≈ 300 Zeichen) in WhatsApp Web oder Desktop anklicken. Er öffnet sich im **Standardbrowser**. Läuft die App dort, übernimmt sie die Antwort sofort. Der neue Tab zeigt „Antwort von X übernommen“, das bereits offene App-Fenster aktualisiert sich. 25 Antworten sind dann 25 Klicks. **Bedingung:** Die App läuft im Standardbrowser des Laptops. Sonst geht es über Einfügen (Gerätetest G9).
- **Dateien** nutzt nur der:die Koordinator:in für die Sicherung. „Plan als Datei teilen“ (B2) entfällt.

Quellen zur WhatsApp-Grenze (nur Drittanbieter): [typecount: WhatsApp Character Limits](https://typecount.com/blog/whatsapp-character-limit), [timelines.ai: Character Counter](https://timelines.ai/whatsapp-message-character-counter)

### D4. Solver und Fairness nach Stunden

**Gemessen** mit 90 Führungen × 25 Personen, je 3 Instanzen „knapp“ und „Überangebot“, Node 22:

| Fairness nach | Solver | Laufzeit | Ergebnis |
|---|---|---:|---|
| Anzahl Führungen | YALPS | 103–217 ms | optimal |
| Anzahl Führungen | HiGHS | 33–148 ms | optimal |
| **Einsatzstunden** | YALPS | 6.158–8.263 ms | 3× optimal, **1× Abbruch (Zyklus) nach 24 s ohne Ergebnis**, Rest der Messung abgebrochen |
| **Einsatzstunden** | **HiGHS** | **130–1.077 ms** | 6× optimal, deterministisch |

- **Entscheidung: HiGHS** (statt YALPS aus B7). YALPS ist für das Stundenmodell zu langsam und nicht verlässlich. Für eine Einteilung alle 6 Wochen am Laptop ist 1 s unkritisch. Personen brauchen den Solver nicht. Der Service Worker lädt ihn trotzdem einmal mit (1,25 MB gzip), damit die App überall gleich offline funktioniert.
- **Fairness nach Führungsstunden** (entschieden: **reine Führungsdauer**, ohne Vor- und Nachbereitung). Die Grenzkosten steigen je halbe Stunde mit der Auslastung relativ zu *wirksamem Max × Ø-Führungsdauer der Runde*. **Min und Max bleiben Anzahlen** wie im Auftrag. Gemessene Wirkung (erste Messung, damals noch mit Dauer + 2 h): Die Spannweite der Auslastung (Stunden je Max) sank in allen 6 Fällen, z. B. 2,00 → 1,42; 4,50 → 3,77; 1,75 → 1,15.
- **Direkt aufeinanderfolgende Führungen** (entschieden: Vor-/Nachbereitung zählt nicht als Überschneidung, aber direkte Anschlüsse sollen vermieden werden). Liegen zwischen dem Ende einer Führung und dem Beginn der nächsten derselben Person **weniger als 30 min**, kostet das eine **Strafe**. Ein harter Mindestabstand ist das nicht. Rangfolge der Ziele jetzt: offener Platz > Min-Unterschreitung > **direkter Anschluss** > Fairness. Ein direkter Anschluss bleibt also erlaubt, wenn sonst ein Platz offen bliebe oder jemand unter Min fiele, aber nie nur wegen der Gleichmäßigkeit. Eigene Fix-Führungen zählen dabei mit.
  - **Gemessen** (90 × 25, reine Dauer, 12 Instanzen; davon 6 mit 90 Führungen auf 14 Tage verdichtet, damit es viele Anschlüsse gibt):

    | | ohne Strafe | mit Strafe |
    |---|---|---|
    | direkte Anschlüsse im Plan | 0–3 je Instanz (insgesamt 13) | **0 in allen 12** |
    | offene Plätze, Spannweite der Auslastung | – | **unverändert** in allen 12 |
    | Laufzeit | 0,12–1,96 s | 0,15–3,09 s |

  - **Folge:** Der Schutz kostet in den Messungen nichts an Besetzung oder Gleichmäßigkeit, die Laufzeit steigt im ungünstigsten Fall auf etwa 3 s. Das ist für eine Einteilung alle 6 Wochen unkritisch, aber am Büro-Laptop eventuell etwas langsamer als in dieser Messumgebung. Die App zeigt während der Rechnung „Einteilung läuft …“.
- **Wichtige Einstellung:** `mip_rel_gap = 0`. Mit dem Standardwert (10⁻⁴) darf HiGHS bei den streng gestuften Gewichten (B10) die Fairness-Stufe teilweise ignorieren. Gemessen: in einem Fall Spannweite 3,80 statt 3,77.

### D5. Persönliche `.ics`

- **Zeit:** Beginn − 1 h bis Ende + 1 h, Wiener Zeit. Beispiel: Führung 10:00–11:30 ergibt den Termin 09:00–12:30. Bei üblichen Zeiten (06–22 Uhr) bleibt alles am selben Tag. Endet eine Führung nach 23:00, endet der Termin am Folgetag; das ist zulässig.
- **Titel:** `ORT Führung hhmm`, mit dem Beginn der Führung, z. B. `Museum Führung 1000`.
- **Beschreibung:** Führungszeit, alle Eingeteilten (alphabetisch, `??` für offen), danach Kurztitel und Langtext gemeinsam. Der Langtext steht nur drin, wenn Link 3 mit „Langtext mitschicken“ erzeugt wurde (D6-1). Beispiel:
  ```
  Führung 10:00–11:30
  Eingeteilt: Anna Huber, Ben Gruber, ??

  Volksschule Linz
  26 Pers., Kontakt über das Büro
  Rollstuhl dabei.
  ```
- **UID** ist eine andere als in der Gesamtdatei, weil Zeit und Titel abweichen. So stören sich beide nicht, auch nicht im selben Kalender.
- Die **Gesamt-`.ics`** bleibt wie im Auftrag: genaue Führungszeit, Titel `Ort Namen` mit `??`. Die **Beschreibung** besteht aus dem Kurztitel in der ersten Zeile, darunter dem Langtext 1:1. Der Langtext ist immer dabei, weil der:die Koordinator:in ihn lokal hat.
- **Kurztitel und Langtext kommen in beiden Dateien gemeinsam in die Beschreibung, nie in den Titel.** Die Titel bleiben exakt `Ort Name, Name` bzw. `ORT Führung hhmm`. Ist der Kurztitel leer, beginnt die Beschreibung direkt mit dem Langtext.

### D6. Entschieden am 15.10. (zweite Rückmeldung)

1. **Langtext:** Es gibt einen Schalter **„Langtext mitschicken“**, getrennt für Link 1 und Link 3. Standard ist **aus**. Ohne Langtext sind die Links etwa 2,6 bzw. 2,9 Tsd. Zeichen lang, mit Langtext etwa 7,5 bis 11 Tsd. (D2). Neben dem Schalter zeigt die App die aktuelle Länge an. In der Personen-Ansicht lässt sich ein mitgeschickter Langtext pro Führung aufklappen.
2. **Vor-/Nachbereitung** zählt nicht als Überschneidung. Für Abstände unter 30 min gibt es eine Strafe (D4).
3. **Fairness** nach reiner Führungsdauer (D4).

Die frühere Fassung dieses Abschnitts mit den Fragen:

1. **Langtext in Link 3?** → Standard **nein**. Link 1 und Link 3 enthalten den Kurztitel (≈ 2,6 bzw. ≈ 3,0 Tsd. Zeichen, gute Chance auf antippbare Links). Der Langtext steht nur in der Gesamt-`.ics`, also im gemeinsamen Google Kalender. Die persönliche `.ics` hat dann Kurztitel und Namen, aber keinen Langtext.
   - Mit Langtext wäre Link 3 etwa 8 bis 11 Tsd. Zeichen lang. Als kopierbarer Text geht das, als antippbarer Link vermutlich nicht.
   - Entscheidend ist: **Sehen alle Personen den gemeinsamen Google Kalender?** Wenn ja, ist „nein“ ausreichend. Wenn nein, schlage ich einen Schalter „Langtext mitschicken“ beim Erzeugen von Link 3 vor.
2. **Zählen Vor- und Nachbereitung bei „keine Überschneidung“?** → Standard **nein**, es zählt nur die Führungszeit wie im Auftrag. Bei „ja“ braucht eine Person zwischen zwei Führungen mindestens 2 h Abstand. 10:00–11:30 und danach 12:30 wären dann ausgeschlossen, auch am selben Ort. Bei „nein“ können sich die persönlichen Kalendereinträge zweier knapp aufeinanderfolgender Führungen überlappen.
3. **Einsatzzeit für die Fairness:** → Standard **Dauer + 2 h**. Alternative: reine Führungsdauer.

### D7. Geänderte Gerätetests

| # | Test | Gerät |
|---|---|---|
| G1 (neu) | WhatsApp: Nachrichten mit 2.600, 3.000 und 11.000 Zeichen. Ist der Link antippbar? Lässt sich die Nachricht vollständig kopieren? | iPhone + Android |
| G7 (neu) | Sicherung am Laptop speichern und auf einem zweiten Laptop öffnen | Laptop → Laptop |
| G9 (neu) | Link 2 in WhatsApp Web bzw. Desktop anklicken: Öffnet sich der Standardbrowser mit den App-Daten, und wird die Antwort übernommen? | Laptop |

Signal und SMS entfallen, weil WhatsApp der einzige Kanal ist. G2–G6 und G8 bleiben.

### D8. Geänderte Daten und Schema (gegenüber Abschnitt 5/6 des Auftrags)

- **Führung:** zusätzlich `kurztitel` (einzeilig). `beschreibung` ist der Langtext.
- **Runde / Link 1:** zusätzlich die Sprachen je Teammitglied (Vorbelegung), `v`, `rev`.
- **Antwort:** `min` und `max` sind Pflicht, ohne Vorbelegung. Zusätzlich `rev` und ein Zeitstempel.
- **Excel:** zusätzlich die optionale Spalte **Kurztitel**. Zeitfehler ist nur Ende ≤ Beginn. Sprache und Fix-Namen werden ohne Rücksicht auf Groß-/Kleinschreibung verglichen.
- **Link 1 / Link 3:** zusätzlich ein Merkmal, ob der Langtext enthalten ist (Schalter D6-1).
