import { test, before } from "node:test";
import assert from "node:assert/strict";
import { newRound, addTour, updateTour, addAnswer, effectiveMax, nameKey } from "../app/js/model.js";
import { solveRound, analyse, buildModel, toLP, loadHighs } from "../app/js/solver.js";

let highs;
before(async () => {
  highs = await loadHighs();
});

/** Runde aus kompakter Beschreibung bauen. */
function runde(team, tours, answers) {
  const r = newRound({ team });
  r.von = "2026-11-01";
  r.bis = "2026-11-30";
  for (const t of tours) addTour(r, { ort: "Museum", sprache: "DE", personen: 1, fix: [], ...t });
  r.sentRev = r.rev;
  for (const a of answers) addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, langs: ["DE"], min: 0, max: 9, can: [], ...a });
  return r;
}
const T = (id, datum, beginn, ende, extra = {}) => ({ datum, beginn, ende, ...extra, _id: id });
const ids = (r) => Object.fromEntries(r.tours.map((t, i) => [`t${i + 1}`, t.id]));
const solve = (r) => solveRound(r, highs).a;

test("nur verfügbare Personen mit passender Sprache werden eingeteilt", () => {
  const r = runde(["Anna", "Ben"], [T(1, "2026-11-07", "10:00", "11:00", { sprache: "EN" })], []);
  const id = r.tours[0].id;
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Anna", langs: ["DE"], min: 0, max: 3, can: [id] });
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Ben", langs: ["DE", "EN"], min: 0, max: 3, can: [] });
  assert.deepEqual(solve(r)[id], [null], "Anna spricht kein EN, Ben kann nicht");
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 2, name: "Ben", langs: ["DE", "EN"], min: 0, max: 3, can: [id] });
  assert.deepEqual(solve(r)[id], ["Ben"]);
});

test("fixe Einteilung ist gesetzt und zählt auf Max", () => {
  const r = runde(["Anna", "Ben"], [T(1, "2026-11-07", "10:00", "11:00", { personen: 2, fix: ["Anna"] }), T(2, "2026-11-08", "10:00", "11:00")], []);
  const [f1, f2] = r.tours.map((t) => t.id);
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Anna", langs: ["DE"], min: 0, max: 1, can: [f1, f2] });
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Ben", langs: ["DE"], min: 0, max: 1, can: [f1] });
  const a = solve(r);
  assert.deepEqual(a[f1], ["Anna", "Ben"]);
  assert.deepEqual(a[f2], [null], "Anna hat Max 1 schon durch Fix erreicht");
  const h = analyse(r, a).hinweise.find((x) => x.art === "offen");
  assert.match(h.text, /möglich über Max: Anna \(1\/1\)/);
});

test("keine Überschneidung pro Person, aber Fix darf sich überschneiden (mit Hinweis)", () => {
  const r = runde(["Anna", "Ben"], [
    T(1, "2026-11-07", "10:00", "11:30"), T(2, "2026-11-07", "11:00", "12:00"),
    T(3, "2026-11-08", "10:00", "11:00", { fix: ["Ben"] }), T(4, "2026-11-08", "10:30", "11:30", { fix: ["Ben"] }),
  ], []);
  const [a1, a2] = r.tours.map((t) => t.id);
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Anna", langs: ["DE"], min: 2, max: 2, can: [a1, a2] });
  const a = solve(r);
  assert.equal([a[a1][0], a[a2][0]].filter((x) => x === "Anna").length, 1);
  const h = analyse(r, a).hinweise;
  assert.ok(h.some((x) => x.art === "fix" && /überschneiden/.test(x.text)));
  assert.ok(h.some((x) => x.art === "min" && /Anna: unter Min/.test(x.text)));
});

test("freier Einsatz neben eigener überlappender Fix-Führung ist ausgeschlossen", () => {
  const r = runde(["Anna"], [T(1, "2026-11-07", "10:00", "11:00", { fix: ["Anna"] }), T(2, "2026-11-07", "10:30", "11:30")], []);
  const [, f2] = r.tours.map((t) => t.id);
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "anna", langs: ["DE"], min: 0, max: 5, can: [f2] });
  assert.deepEqual(solve(r)[f2], [null]);
});

test("Max ist hart: lieber offener Platz als Max überschreiten", () => {
  const r = runde(["Anna"], [T(1, "2026-11-07", "10:00", "11:00"), T(2, "2026-11-08", "10:00", "11:00")], []);
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Anna", langs: ["DE"], min: 0, max: 1, can: r.tours.map((t) => t.id) });
  const a = solve(r);
  assert.equal(Object.values(a).flat().filter(Boolean).length, 1);
});

test("unlösbare Lage ergibt trotzdem einen Plan: keine Antworten, zu wenige Personen, Fix > Max", () => {
  const r1 = runde(["Anna", "Ben"], [T(1, "2026-11-07", "10:00", "11:00", { personen: 3 })], []);
  assert.deepEqual(solve(r1)[r1.tours[0].id], [null, null, null]);
  const h = analyse(r1, solve(r1)).hinweise;
  assert.ok(h.some((x) => x.art === "antwort" && /Anna, Ben/.test(x.text)));
  assert.ok(h.some((x) => /niemand Passendes/.test(x.text)));

  const r2 = runde(["Anna"], [1, 2, 3].map((i) => T(i, `2026-11-0${i}`, "10:00", "11:00", { fix: ["Anna"] })), []);
  addAnswer(r2, { rid: r2.id, rev: r2.rev, ts: 1, name: "Anna", langs: ["DE"], min: 0, max: 1, can: [] });
  const a2 = solve(r2);
  assert.ok(Object.values(a2).every((s) => s[0] === "Anna"));
  assert.ok(analyse(r2, a2).hinweise.some((x) => x.art === "max" && /schon durch Fix/.test(x.text)));
});

test("offener Platz ist teurer als Min-Unterschreitung", () => {
  // Anna (Min 1) und Ben (Min 1) können nur dieselbe eine Führung; ein Platz wird besetzt, einer bleibt unter Min.
  const r = runde(["Anna", "Ben"], [T(1, "2026-11-07", "10:00", "11:00")], []);
  const id = r.tours[0].id;
  for (const n of ["Anna", "Ben"]) addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: n, langs: ["DE"], min: 1, max: 1, can: [id] });
  assert.equal(solve(r)[id].filter(Boolean).length, 1);
});

test("Min wird vor Gleichmäßigkeit erfüllt", () => {
  const r = runde(["Anna", "Ben"], [T(1, "2026-11-07", "10:00", "11:00"), T(2, "2026-11-08", "10:00", "11:00")], []);
  const all = r.tours.map((t) => t.id);
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Anna", langs: ["DE"], min: 2, max: 2, can: all });
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Ben", langs: ["DE"], min: 0, max: 2, can: all });
  const a = solve(r);
  assert.deepEqual(all.map((id) => a[id][0]), ["Anna", "Anna"]);
});

test("Gleichmäßigkeit relativ zum Max, nach Führungsstunden", () => {
  // Anna Max 2, Ben Max 4, vier gleich lange Führungen → Anna 1, Ben 3 (50 % / 75 %)
  const tours = [1, 2, 3, 4].map((i) => T(i, `2026-11-0${i}`, "10:00", "11:00"));
  const r = runde(["Anna", "Ben"], tours, []);
  const all = r.tours.map((t) => t.id);
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Anna", langs: ["DE"], min: 0, max: 2, can: all });
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Ben", langs: ["DE"], min: 0, max: 4, can: all });
  const cnt = (a, n) => Object.values(a).flat().filter((x) => x === n).length;
  const a = solve(r);
  assert.equal(cnt(a, "Anna"), 1);
  assert.equal(cnt(a, "Ben"), 3);

  // Stunden zählen: eine lange Führung (3 h) und zwei kurze (1 h); beide Max 2
  const r2 = runde(["Anna", "Ben"], [T(1, "2026-11-01", "09:00", "12:00"), T(2, "2026-11-02", "10:00", "11:00"), T(3, "2026-11-03", "10:00", "11:00")], []);
  const all2 = r2.tours.map((t) => t.id);
  for (const n of ["Anna", "Ben"]) addAnswer(r2, { rid: r2.id, rev: r2.rev, ts: 1, name: n, langs: ["DE"], min: 0, max: 2, can: all2 });
  const a2 = solve(r2);
  const lang = a2[all2[0]][0];
  assert.deepEqual([a2[all2[1]][0], a2[all2[2]][0]].filter((x) => x === lang), [], "wer die lange Führung hat, bekommt keine kurze");
});

test("direkte Anschlüsse (< 30 min) werden vermieden, wenn es anders geht", () => {
  const r = runde(["Anna", "Ben"], [T(1, "2026-11-07", "10:00", "11:00"), T(2, "2026-11-07", "11:15", "12:00"), T(3, "2026-11-07", "13:00", "14:00")], []);
  const [t1, t2, t3] = r.tours.map((t) => t.id);
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Anna", langs: ["DE"], min: 2, max: 2, can: [t1, t2, t3] });
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Ben", langs: ["DE"], min: 1, max: 1, can: [t1, t2] });
  const a = solve(r);
  // Anna braucht 2 Einsätze; ohne Anschluss geht nur t1+t3 oder t2+t3
  assert.equal(a[t3][0], "Anna");
  assert.notEqual(a[t1][0] === "Anna" && a[t2][0] === "Anna", true);
  assert.ok(!analyse(r, a).hinweise.some((x) => x.art === "anschluss"));
  // erzwungen: nur Anna verfügbar, Min 2 → Anschluss erlaubt, mit Hinweis
  const r2 = runde(["Anna"], [T(1, "2026-11-07", "10:00", "11:00"), T(2, "2026-11-07", "11:15", "12:00")], []);
  addAnswer(r2, { rid: r2.id, rev: r2.rev, ts: 1, name: "Anna", langs: ["DE"], min: 2, max: 2, can: r2.tours.map((t) => t.id) });
  const a2 = solve(r2);
  assert.ok(Object.values(a2).every((s) => s[0] === "Anna"));
  assert.ok(analyse(r2, a2).hinweise.some((x) => x.art === "anschluss"));
});

test("Änderung nach der Antwort: zeitlich geänderte und neue Führungen gelten als nicht gemeldet, Sprache nicht", () => {
  const r = runde(["Anna"], [T(1, "2026-11-07", "10:00", "11:00"), T(2, "2026-11-08", "10:00", "11:00")], []);
  const [t1, t2] = r.tours.map((t) => t.id);
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Anna", langs: ["DE", "EN"], min: 0, max: 5, can: [t1, t2] });
  updateTour(r, t1, { beginn: "09:00" });
  updateTour(r, t2, { sprache: "EN", ort: "Dom" });
  addTour(r, { ort: "Dom", datum: "2026-11-09", beginn: "10:00", ende: "11:00" });
  const a = solve(r);
  assert.deepEqual(a[t1], [null]);
  assert.deepEqual(a[t2], ["Anna"]);
  assert.ok(analyse(r, a).hinweise.some((x) => x.art === "veraltet" && /2 Führungen/.test(x.text)));
});

test("Revision steigt nur einmal je verschicktem Link 1", () => {
  const r = runde(["Anna"], [T(1, "2026-11-07", "10:00", "11:00")], []);
  const rev = r.rev;
  addTour(r, { ort: "X", datum: "2026-11-08", beginn: "10:00", ende: "11:00" });
  addTour(r, { ort: "Y", datum: "2026-11-09", beginn: "10:00", ende: "11:00" });
  assert.equal(r.rev, rev + 1);
});

test("wirksames Max = höchstens mögliche Führungen (inkl. Fix)", () => {
  const r = runde(["Anna"], [T(1, "2026-11-07", "10:00", "11:00", { fix: ["Anna"] }), T(2, "2026-11-08", "10:00", "11:00"), T(3, "2026-11-09", "10:00", "11:00", { sprache: "EN" })], []);
  const all = r.tours.map((t) => t.id);
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Anna", langs: ["DE"], min: 0, max: 9, can: all });
  assert.equal(effectiveMax(r, r.answers[nameKey("Anna")]), 2);
});

test("unbekannte Namen werden nicht eingeteilt und gemeldet", () => {
  const r = runde(["Anna"], [T(1, "2026-11-07", "10:00", "11:00")], []);
  const st = addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Xaver", langs: ["DE"], min: 0, max: 1, can: [r.tours[0].id] });
  assert.equal(st.status, "unbekannt");
  const a = solve(r);
  assert.deepEqual(a[r.tours[0].id], [null]);
  assert.ok(analyse(r, a).hinweise.some((x) => x.art === "unbekannt"));
});

test("Korrekturen werden geprüft: nicht gemeldet, falsche Sprache, Überschneidung, keine Antwort", () => {
  const r = runde(["Anna", "Ben", "Eva"], [T(1, "2026-11-07", "10:00", "11:00", { sprache: "EN" }), T(2, "2026-11-07", "10:30", "11:30")], []);
  const [t1, t2] = r.tours.map((t) => t.id);
  addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: "Anna", langs: ["DE"], min: 0, max: 3, can: [t2] });
  const h = analyse(r, { [t1]: ["Anna"], [t2]: ["Anna"] }).hinweise.map((x) => x.text).join("\n");
  assert.match(h, /Anna hat für diese Führung nicht „kann“ gemeldet/);
  assert.match(h, /Anna spricht nicht EN/);
  assert.match(h, /Anna überschneidet sich/);
  const h2 = analyse(r, { [t1]: ["Eva"], [t2]: [null] }).hinweise.map((x) => x.text).join("\n");
  assert.match(h2, /Eva hat nicht geantwortet/);
});

test("deterministisch: gleiche Eingabe – auch in anderer Reihenfolge – ergibt gleichen Plan", () => {
  const team = Array.from({ length: 12 }, (_, i) => `Person ${String.fromCharCode(65 + i)}`);
  let s = 42;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const tours = Array.from({ length: 30 }, (_, i) => {
    const b = 8 * 60 + Math.floor(rnd() * 20) * 30;
    const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    return T(i, `2026-11-${String(1 + Math.floor(rnd() * 20)).padStart(2, "0")}`, hh(b), hh(b + 60 + Math.floor(rnd() * 3) * 30), { personen: 1 + Math.floor(rnd() * 3), sprache: rnd() < 0.3 ? "EN" : "DE" });
  });
  const r = runde(team, tours, []);
  for (const n of team) addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: n, langs: rnd() < 0.5 ? ["DE", "EN"] : ["DE"], min: Math.floor(rnd() * 3), max: 3 + Math.floor(rnd() * 4), can: r.tours.filter(() => rnd() < 0.6).map((t) => t.id) });
  const a1 = JSON.stringify(solve(r));
  assert.equal(JSON.stringify(solve(r)), a1);
  const r2 = structuredClone(r);
  r2.tours.reverse();
  r2.answers = Object.fromEntries(Object.entries(r2.answers).reverse());
  assert.equal(JSON.stringify(Object.fromEntries(Object.entries(solve(r2)).sort())), JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(a1)).sort())));
});

test("realistische Größe (90 Führungen, 25 Personen) ist optimal und schnell genug", () => {
  const team = Array.from({ length: 25 }, (_, i) => `P${String(i).padStart(2, "0")}`);
  let s = 7;
  const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
  const hh = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const tours = Array.from({ length: 90 }, (_, i) => {
    const b = 6 * 60 + Math.floor(rnd() * 28) * 30;
    const day = new Date(Date.UTC(2026, 10, 1) + Math.floor(rnd() * 42) * 864e5).toISOString().slice(0, 10);
    return T(i, day, hh(b), hh(Math.min(22 * 60, b + 60 + Math.floor(rnd() * 4) * 30)), { personen: 1 + Math.floor(rnd() * 3), sprache: rnd() < 0.25 ? "EN" : "DE", fix: rnd() < 0.15 ? [team[Math.floor(rnd() * 25)]] : [] });
  });
  const r = runde(team, tours, []);
  for (const n of team) {
    const min = Math.floor(rnd() * 3);
    addAnswer(r, { rid: r.id, rev: r.rev, ts: 1, name: n, langs: rnd() < 0.5 ? ["DE", "EN"] : ["DE"], min, max: min + Math.floor(rnd() * 8), can: r.tours.filter(() => rnd() < 0.6).map((t) => t.id) });
  }
  const t0 = Date.now();
  const res = solveRound(r, highs);
  const ms = Date.now() - t0;
  assert.ok(ms < 20000, `zu langsam: ${ms} ms`);
  const h = analyse(r, res.a).hinweise;
  assert.ok(!h.some((x) => x.art === "korrektur"), "Solver-Plan verletzt keine harte Bedingung");
  for (const p of analyse(r, res.a).personen) {
    const a = r.answers[nameKey(p.name)];
    assert.ok(p.anzahl <= Math.max(a.max, p.fixN), `${p.name} über Max`);
  }
});

test("LP-Text ist für leere Runden gültig", () => {
  const r = runde(["Anna"], [], []);
  assert.match(toLP(buildModel(r)), /^Minimize/);
  assert.deepEqual(solveRound(r, highs).a, {});
});
