// iCalendar-Export (RFC 5545) für den Import in Google Kalender.
// Zeiten werden als Wiener Wanduhrzeit mit TZID=Europe/Vienna geschrieben, dazu ein
// VTIMEZONE-Block (Pflicht laut RFC 5545 §3.6.5). Die Umrechnung macht der Kalender,
// unabhängig von der Zeitzone des Geräts, das die Datei erzeugt.
import { sortTours, titleNames, toMin, shiftWallClock, PUFFER_MIN, nameKey, findTeamName } from "./model.js";

const TZID = "Europe/Vienna";
const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${TZID}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:+0100",
  "TZOFFSETTO:+0200",
  "TZNAME:CEST",
  "DTSTART:19700329T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:+0200",
  "TZOFFSETTO:+0100",
  "TZNAME:CET",
  "DTSTART:19701025T030000",
  "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** TEXT-Wert escapen (RFC 5545 §3.3.11). */
export const escapeText = (s) =>
  String(s ?? "").replace(/\r\n?/g, "\n").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");

/** Zeile auf höchstens 75 Oktette falten, ohne UTF-8-Zeichen zu zerteilen (RFC 5545 §3.1). */
export function foldLine(line) {
  const enc = new TextEncoder();
  const out = [];
  let cur = "", curLen = 0, limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (curLen + n > limit) {
      out.push(cur);
      cur = "";
      curLen = 0;
      limit = 74; // Folgezeilen beginnen mit einem Leerzeichen
    }
    cur += ch;
    curLen += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

const dt = (iso, hhmm) => `${iso.replace(/-/g, "")}T${hhmm.replace(":", "")}00`;
const stampUtc = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function calendar(events, now) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//fuehrungsvergabe//DE", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", ...VTIMEZONE];
  const stamp = stampUtc(now);
  for (const e of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${e.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART;TZID=${TZID}:${dt(e.datumStart, e.start)}`,
      `DTEND;TZID=${TZID}:${dt(e.datumEnde, e.ende)}`,
      `SUMMARY:${escapeText(e.titel)}`,
    );
    if (e.beschreibung) lines.push(`DESCRIPTION:${escapeText(e.beschreibung)}`);
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

const kurzUndLang = (t, mitLangtext = true) => [t.kurztitel, mitLangtext ? t.beschreibung : ""].map((s) => (s ?? "").trim()).filter(Boolean).join("\n");
const uidSafe = (s) => nameKey(s).normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";

/** Gesamtkalender des:der Koordinator:in: genaue Führungszeit, Titel "Ort Name, Name, ??". */
export function icsGesamt(round, planA, now = new Date()) {
  const events = sortTours(round.tours).map((t) => ({
    uid: `${round.id}-${t.id}@fuehrungsvergabe`,
    datumStart: t.datum,
    start: t.beginn,
    datumEnde: t.datum,
    ende: t.ende,
    titel: `${t.ort} ${titleNames(planA[t.id] ?? []).join(", ")}`,
    beschreibung: kurzUndLang(t),
  }));
  return calendar(events, now);
}

/** Persönlicher Kalender: 1 h vorher bis 1 h nachher, Titel "ORT Führung hhmm". */
export function icsPerson(round, planA, name, now = new Date()) {
  const me = nameKey(findTeamName(round.team, name) ?? name);
  const events = sortTours(round.tours)
    .filter((t) => (planA[t.id] ?? []).some((n) => n && nameKey(n) === me))
    .map((t) => {
      const s = shiftWallClock(t.datum, toMin(t.beginn) - PUFFER_MIN);
      const e = shiftWallClock(t.datum, toMin(t.ende) + PUFFER_MIN);
      const text = [`Führung ${t.beginn}–${t.ende}`, `Eingeteilt: ${titleNames(planA[t.id] ?? []).join(", ")}`];
      const extra = kurzUndLang(t, round.langtext !== false);
      return {
        uid: `${round.id}-${t.id}-${uidSafe(name)}@fuehrungsvergabe`,
        datumStart: s.datum,
        start: s.zeit,
        datumEnde: e.datum,
        ende: e.zeit,
        titel: `${t.ort} Führung ${t.beginn.replace(":", "")}`,
        beschreibung: extra ? `${text.join("\n")}\n\n${extra}` : text.join("\n"),
      };
    });
  return calendar(events, now);
}
