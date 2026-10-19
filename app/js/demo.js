// Demo-Runde: nur auf Knopfdruck, deutlich als DEMO markiert, wie jede Runde löschbar.
import { newRound, addTour, addAnswer, nameKey, fromDayNum, dayNum } from "./model.js";

export function demoRound(heute = new Date()) {
  const r = newRound({ team: ["Anna", "Ben", "Clara", "David", "Eva"] });
  r.demo = true;
  // Zeitraum: nächster Kalendermonat
  const y = heute.getFullYear(), m = heute.getMonth() + 1;
  const von = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);
  const bis = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
  r.von = von;
  r.bis = bis;
  r.frist = fromDayNum(dayNum(von) - 7);
  const tag = (n) => fromDayNum(dayNum(von) + n);
  const touren = [
    { ort: "Museum", datum: tag(6), beginn: "10:00", ende: "11:30", sprache: "DE", personen: 2, kurztitel: "Volksschule Linz", beschreibung: "24 Kinder, 2 Lehrpersonen\nTreffpunkt Haupteingang, 15 Min vorher" },
    { ort: "Museum", datum: tag(6), beginn: "14:00", ende: "15:30", sprache: "EN", personen: 1, kurztitel: "School group Munich", beschreibung: "Meeting point: ticket office" },
    { ort: "Dom", datum: tag(7), beginn: "11:00", ende: "12:00", sprache: "DE", personen: 1, fix: ["Clara"], kurztitel: "Seniorenbund", beschreibung: "Barrierefrei – Lift benutzen" },
    { ort: "Museum", datum: tag(13), beginn: "10:00", ende: "11:30", sprache: "DE", personen: 2, kurztitel: "HTL Steyr", beschreibung: "" },
    { ort: "Schloss", datum: tag(20), beginn: "10:00", ende: "11:30", sprache: "EN", personen: 2, kurztitel: "Company visit", beschreibung: "Bitte Headset mitnehmen" },
    { ort: "Museum", datum: tag(27), beginn: "15:00", ende: "17:00", sprache: "DE", personen: 1, kurztitel: "Familie Maier", beschreibung: "Privatführung, 12 Personen" },
  ];
  const ids = touren.map((t) => addTour(r, t).id);
  r.sentRev = r.rev;
  const ans = (name, langs, min, max, idx) => addAnswer(r, { rid: r.id, rev: r.rev, ts: Date.now(), name, langs, min, max, can: idx.map((i) => ids[i]) });
  ans("Anna", ["DE", "EN"], 1, 3, [0, 1, 3, 4]);
  ans("Ben", ["DE"], 2, 2, [0, 2, 3, 5]);
  ans("Clara", ["DE", "EN"], 1, 2, [2, 4]);
  ans("David", ["DE", "EN"], 0, 2, [1, 4, 5]);
  // Eva antwortet nicht
  r.langs[nameKey("Eva")] = ["DE"];
  return r;
}
