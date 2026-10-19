import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, backupJson, parseBackup, backupFilename } from "../app/js/store.js";
import { newRound, addTour } from "../app/js/model.js";

test("Sicherung: speichern und wieder öffnen ergibt denselben Stand", () => {
  const s = emptyState();
  const r = newRound({ team: ["Anna", "Ben"] });
  addTour(r, { ort: "Museum", datum: "2026-11-07", beginn: "10:00", ende: "11:00", beschreibung: "a\nb" });
  s.rounds[r.id] = r;
  s.currentRoundId = r.id;
  s.person.name = "Anna";
  const { zustand, gespeichert } = parseBackup(backupJson(s, new Date("2026-10-15T08:00:00Z")));
  assert.deepEqual(zustand, s);
  assert.equal(gespeichert, "2026-10-15T08:00:00.000Z");
});

test("Sicherung: fremde oder kaputte Dateien werden abgelehnt", () => {
  assert.throws(() => parseBackup("kein json"), /kein gültiges JSON/);
  assert.throws(() => parseBackup('{"app":"x","zustand":{}}'), /keine Sicherung/);
  assert.throws(() => parseBackup('{"app":"fuehrungsvergabe","v":99,"zustand":{}}'), /neueren App-Version/);
});

test("Sicherung: ältere Stände werden ergänzt", () => {
  const { zustand } = parseBackup('{"app":"fuehrungsvergabe","v":1,"zustand":{"rounds":{}}}');
  assert.deepEqual(zustand.person.plaene, {});
});

test("Dateiname enthält das Datum", () => {
  assert.match(backupFilename(new Date(2026, 9, 15, 12)), /^fuehrungsvergabe-sicherung-2026-10-15\.json$/);
});
