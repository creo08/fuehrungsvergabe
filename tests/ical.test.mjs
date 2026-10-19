import { test } from "node:test";
import assert from "node:assert/strict";
import { newRound, addTour } from "../app/js/model.js";
import { icsGesamt, icsPerson, foldLine, escapeText } from "../app/js/ical.js";

const NOW = new Date(Date.UTC(2026, 9, 15, 8, 30, 0));

function runde() {
  const r = newRound({ team: ["Peter", "hans", "Änne"] });
  r.id = "rund1234";
  addTour(r, { ort: "Museum", datum: "2026-07-07", beginn: "10:00", ende: "11:30", personen: 3, kurztitel: "Volksschule Linz", beschreibung: "Zeile 1\nZeile 2; a, b \\ c" });
  addTour(r, { ort: "Dom", datum: "2026-11-08", beginn: "23:30", ende: "23:50", personen: 1, kurztitel: "", beschreibung: "" });
  return r;
}
const unfold = (s) => s.replace(/\r\n /g, "");

test("RFC 5545: CRLF, Zeilen ≤ 75 Oktette, VTIMEZONE, Pflichtfelder", () => {
  const r = runde();
  const [t1, t2] = r.tours.map((t) => t.id);
  const ics = icsGesamt(r, { [t1]: ["Peter", "hans", null], [t2]: [null] }, NOW);
  assert.ok(ics.endsWith("\r\n"));
  assert.ok(!/[^\r]\n/.test(ics), "nur CRLF");
  for (const line of ics.split("\r\n")) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  const u = unfold(ics);
  assert.match(u, /BEGIN:VCALENDAR\r\nVERSION:2\.0\r\nPRODID:/);
  assert.match(u, /BEGIN:VTIMEZONE\r\nTZID:Europe\/Vienna/);
  assert.match(u, /RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU/);
  assert.match(u, /RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU/);
  assert.equal((u.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.match(u, /DTSTAMP:20261015T083000Z/);
});

test("Gesamtkalender: Titel Ort + Namen alphabetisch + ?? je offenem Platz, Zeit genau, Beschreibung Kurztitel + Langtext", () => {
  const r = runde();
  const [t1, t2] = r.tours.map((t) => t.id);
  const u = unfold(icsGesamt(r, { [t1]: ["Peter", "hans", null], [t2]: [null] }, NOW));
  assert.match(u, /SUMMARY:Museum hans\\, Peter\\, \?\?\r\n/);
  assert.match(u, /SUMMARY:Dom \?\?\r\n/);
  assert.match(u, /DTSTART;TZID=Europe\/Vienna:20260707T100000\r\nDTEND;TZID=Europe\/Vienna:20260707T113000/);
  assert.match(u, /DESCRIPTION:Volksschule Linz\\nZeile 1\\nZeile 2\\; a\\, b \\\\ c\r\n/);
  assert.match(u, new RegExp(`UID:rund1234-${t1}@fuehrungsvergabe`));
  assert.doesNotMatch(u.split("BEGIN:VEVENT")[2], /DESCRIPTION/, "leere Beschreibung wird weggelassen");
});

test("Umlaute im Titel werden alphabetisch richtig sortiert", () => {
  const r = runde();
  const [t1] = r.tours.map((t) => t.id);
  assert.match(unfold(icsGesamt(r, { [t1]: ["Peter", "Änne", "hans"] }, NOW)), /SUMMARY:Museum Änne\\, hans\\, Peter/);
});

test("Persönlicher Kalender: 1 h vorher bis 1 h nachher, Titel ORT Führung hhmm, alle Eingeteilten, über Mitternacht", () => {
  const r = runde();
  const [t1, t2] = r.tours.map((t) => t.id);
  const plan = { [t1]: ["Peter", "hans", null], [t2]: ["Peter"] };
  const u = unfold(icsPerson(r, plan, "peter", NOW));
  assert.equal((u.match(/BEGIN:VEVENT/g) ?? []).length, 2);
  assert.match(u, /DTSTART;TZID=Europe\/Vienna:20260707T090000\r\nDTEND;TZID=Europe\/Vienna:20260707T123000/);
  assert.match(u, /SUMMARY:Museum Führung 1000/);
  assert.match(u, /DESCRIPTION:Führung 10:00–11:30\\nEingeteilt: hans\\, Peter\\, \?\?\\n\\nVolksschule Linz\\nZeile 1/);
  assert.match(u, /DTSTART;TZID=Europe\/Vienna:20261108T223000\r\nDTEND;TZID=Europe\/Vienna:20261109T005000/);
  assert.match(u, /SUMMARY:Dom Führung 2330/);
  assert.match(u, new RegExp(`UID:rund1234-${t1}-peter@fuehrungsvergabe`));
  const hans = unfold(icsPerson(r, plan, "Hans", NOW));
  assert.equal((hans.match(/BEGIN:VEVENT/g) ?? []).length, 1);
});

test("Zeilenfaltung zerteilt keine UTF-8-Zeichen; Escaping", () => {
  const line = "DESCRIPTION:" + "äöü😀".repeat(40);
  const folded = foldLine(line);
  for (const part of folded.split("\r\n")) assert.ok(new TextEncoder().encode(part).length <= 75);
  assert.equal(folded.replace(/\r\n /g, ""), line);
  assert.equal(escapeText("a,b;c\\d\r\ne"), "a\\,b\\;c\\\\d\\ne");
});

test("stabile UID: gleiche Runde/Führung → gleiche UID bei erneutem Export", () => {
  const r = runde();
  const a = { [r.tours[0].id]: ["Peter"] };
  const uids = (s) => unfold(s).match(/UID:[^\r]+/g);
  assert.deepEqual(uids(icsGesamt(r, a, NOW)), uids(icsGesamt(r, { [r.tours[0].id]: ["hans"] }, new Date())));
});
