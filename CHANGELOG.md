# Änderungen

Versionen nach [Semantic Versioning](https://semver.org/lang/de/). Solange die Hauptversion 0 ist, kann sich noch alles ändern, auch das Format der Links und der Sicherungsdateien.

## Unveröffentlicht

- **Anleitung in der App:** In der Koordinationsansicht öffnet **Anleitung** (oben rechts, immer sichtbar) die Kurzanleitung als Dialog, auch offline. Die Anleitung liegt dafür jetzt unter `app/ANLEITUNG.md`.
- **Feedback:** **Mehr → Feedback geben** öffnet ein Formular für GitHub-Issues (Fehler, Wunsch, Frage), **Mehr → Projekt auf GitHub** das Repository. Hinweis im Formular und in der Anleitung: alles ist öffentlich, keine Namen aus dem Team.

## v0.1.0-alpha – 15.10.2026

Erste Testversion. Alle Funktionen aus dem Auftrag sind enthalten und automatisch getestet. Auf echten Handys und mit Google Kalender ist sie aber **noch nicht erprobt**; dafür ist diese Alpha gedacht.

### Ablauf

- **Koordinator:in (Laptop)**, in sechs Schritten:
  1. Runde & Team anlegen.
  2. Führungen eintragen: per Formular, als `.xlsx`-Datei oder aus Excel kopiert. Eine Vorschau markiert Problemzeilen, nichts wird stillschweigend korrigiert.
  3. Link 1 an alle schicken (als WhatsApp-Nachricht kopieren oder teilen).
  4. Rückmeldungen sammeln: Link anklicken oder Nachrichten einfügen, auch mehrere auf einmal.
  5. Einteilen und händisch korrigieren.
  6. Link 3 an alle schicken und den Gesamtkalender herunterladen.
- **Personen (Handy):**
  - Namen und Sprachen wählen; das Gerät merkt sie sich.
  - Führungen ankreuzen, Mindestens/Höchstens angeben, Antwort an den:die Koordinator:in schicken.
  - Den Plan ansehen und die eigenen Termine als `.ics` holen.

### Einteilung

- Optimierung (ganzzahliges lineares Programm), gerechnet mit HiGHS direkt im Browser, auch offline.
- Feste Regeln:
  - Nur wer „kann“ gemeldet hat und die Sprache spricht.
  - Keine Überschneidungen.
  - Fix eingeteilte Personen bleiben gesetzt.
  - Höchstens wird nie überschritten.
- Danach in dieser Rangfolge:
  1. möglichst kein Platz offen
  2. Mindestens erreichen
  3. keine Führungen mit weniger als 30 min Abstand
  4. gleichmäßig nach Führungsstunden im Verhältnis zum Höchstens
- Gleiche Eingabe ergibt immer denselben Plan.
- Hinweise:
  - offene Plätze, mit allen, die einspringen könnten (auch über ihrem Höchstens)
  - unter Mindestens / über Höchstens
  - ohne Rückmeldung
  - nach der Antwort geänderte Führungen
  - Prüfung händischer Korrekturen

### Kalender

- `.ics` nach RFC 5545, Zeitzone Europe/Vienna inklusive Sommer- und Winterzeit.
- Gesamtkalender: Titel `Ort Name, Name, ??` (alphabetisch, `??` = offener Platz), genaue Führungszeit.
- Persönlicher Kalender: Titel `ORT Führung hhmm`, von 1 Stunde vorher bis 1 Stunde nachher, alle Eingeteilten in der Beschreibung.
- In beiden Dateien stehen Kurztitel und Langtext in der Beschreibung.

### Daten

- Kein Server und kein Konto. Daten reisen nur im Link nach dem `#`, das nie an den Webserver geht.
- Automatische Speicherung im Browser.
- **Sicherung speichern/öffnen** für Gerätewechsel und Übergabe der Koordination, mit Erinnerung.
- „Neue Runde aus letzter“ übernimmt Team und Sprachen.
- Schalter „Langtext mitschicken“ für Link 1 und Link 3.
- Demo-Runde auf Knopfdruck, deutlich als DEMO markiert.

### Technik

- Statische PWA ohne Build-Schritt. Funktioniert unter dem GitHub-Pages-Unterpfad und offline nach dem ersten Laden. Hell- und Dunkelmodus.
- Excel-Vorlage `vorlage-fuehrungen.xlsx` mit Auswahlliste DE/EN.
- Lizenz: MIT.
- GitHub Actions führt die Tests aus und veröffentlicht danach die App auf GitHub Pages.
- Tests:
  - 52 Unit-Tests: Excel/Einfügen, Solver inklusive unlösbarer Fälle, Links, iCal, Sicherung.
  - Abnahmetest im Browser: eine komplette Runde mit 6 Führungen und 5 Personen, Flugmodus, Sicherung von Gerät A auf Gerät B.
- Dokumentation: `ANLEITUNG.md` (Kurzanleitung), `README.md`, `PRUEFUNG.md` (Prüfung, Messungen, Entscheidungen).

### Bekannte Grenzen

- **Noch nicht auf echten Geräten geprüft** (Liste G1–G9 in `PRUEFUNG.md`):
  - Sind lange Links in WhatsApp antippbar?
  - Klappt der `.ics`-Import am iPhone und Android?
  - Wie verhält sich Google Kalender beim erneuten Import derselben Datei?
- **iPhone:** Links aus WhatsApp öffnen Safari, nicht die App auf dem Homescreen; beide haben getrennte Speicher.
- **Google Kalender:** Der `.ics`-Import geht nur am Computer.
- **Daten im Browser:** Sie können gelöscht werden (z. B. Safari nach 7 Tagen ohne Besuch). Regelmäßig sichern.
- **Excel:** Der Leser ist noch nicht mit einer echten, von Excel gespeicherten Datei getestet.
- **Langtext:** Link 1 oder 3 mit Langtext wird bei rund 90 Führungen 7.500 bis 11.000 Zeichen lang. Als Text geht das, als antippbarer Link vermutlich nicht.
