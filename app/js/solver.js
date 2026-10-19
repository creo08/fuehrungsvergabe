// Einteilung als ganzzahliges lineares Programm (gelöst mit HiGHS, WebAssembly).
//
// Variablen  x(p,f) ∈ {0,1}  nur für erlaubte Paare: Person hat für f gültig „kann“ gemeldet,
//            spricht die Sprache, ist nicht schon fix auf f und hat keine eigene Fix-Führung,
//            die sich mit f überschneidet.
// Hart       Plätze:  Σp x + offen(f) = Personen(f) − |Fix(f)|
//            Überschneidung: je Person und Beginn-Zeitpunkt höchstens eine laufende Führung
//            Max:     Σf x(p,f) ≤ max(0, wirksames Max − Fix(p))
// Weich      Min:     Σf x(p,f) + unter(p) ≥ Min − Fix(p)
// Ziel (streng gestuft): offene Plätze ≫ Min-Unterschreitung ≫ direkte Anschlüsse (< 30 min)
//            ≫ Gleichmäßigkeit (Führungsstunden relativ zu wirksamem Max × Ø-Dauer, konvex).
// Fix ist aus allen harten Bedingungen herausgenommen, deshalb gibt es immer eine Lösung.
import {
  nameKey, sortNames, findTeamName, canValid, overlaps, backToBack, durationMin, sortTours,
  teamAnswers, unknownAnswers, effectiveMax, fixToursOf, fmtDatumKurz, titleNames,
} from "./model.js";

const num = (c) => {
  const s = String(+c.toPrecision(12));
  return s;
};

/** Baut das Modell. Rein und deterministisch (feste Sortierung). */
export function buildModel(round) {
  const T = sortTours(round.tours);
  const answers = teamAnswers(round);
  const P = sortNames(Object.keys(answers)).sort((a, b) => (nameKey(a) < nameKey(b) ? -1 : nameKey(a) > nameKey(b) ? 1 : 0));
  const isFix = (t, p) => t.fix.some((f) => nameKey(f) === nameKey(p));
  const avgDurH = T.length ? T.reduce((s, t) => s + durationMin(t), 0) / T.length / 60 : 1;

  const vars = []; // {name, p, pi, t, ti}
  const free = T.map((t) => Math.max(0, t.personen - t.fix.length));
  const persons = P.map((p, pi) => {
    const a = answers[p];
    const fixT = fixToursOf(round, p);
    const effMax = effectiveMax(round, a);
    const elig = [];
    T.forEach((t, ti) => {
      if (free[ti] <= 0 || isFix(t, p)) return;
      if (!canValid(a, t) || !a.langs.includes(t.sprache)) return;
      if (fixT.some((g) => overlaps(g, t))) return;
      const v = { name: `x${pi}_${ti}`, p, pi, t, ti };
      vars.push(v);
      elig.push(v);
    });
    return { p, pi, a, fixT, fixN: fixT.length, fixH: fixT.reduce((s, t) => s + durationMin(t), 0) / 60, effMax, elig };
  });

  const obj = []; // [var, Gewicht-Art, Koeffizient]
  const rows = []; // {name, terms:[[var,coef]], op, rhs}
  const bounds = []; // [var, lo, hi]

  // direkte Anschlüsse
  const pairs = [];
  const fixAdj = [];
  for (const ps of persons) {
    for (let i = 0; i < ps.elig.length; i++) {
      for (let j = i + 1; j < ps.elig.length; j++) {
        const a = ps.elig[i], b = ps.elig[j];
        if (!overlaps(a.t, b.t) && backToBack(a.t, b.t)) pairs.push([a.name, b.name]);
      }
      if (ps.fixT.some((g) => backToBack(g, ps.elig[i].t))) fixAdj.push(ps.elig[i].name);
    }
  }
  const nB2B = pairs.length + fixAdj.length;
  const sumMin = persons.reduce((s, ps) => s + Math.max(0, ps.a.min - ps.fixN), 0);
  const W3 = 1, W2 = nB2B + 1, W1 = W2 * sumMin + nB2B + 2;

  // Plätze
  T.forEach((t, ti) => {
    if (free[ti] <= 0) return;
    const xs = vars.filter((v) => v.ti === ti);
    rows.push({ name: `platz${ti}`, terms: [...xs.map((v) => [v.name, 1]), [`u${ti}`, 1]], op: "=", rhs: free[ti] });
    obj.push([`u${ti}`, W1]);
    bounds.push([`u${ti}`, 0, free[ti]]);
  });

  // Personen
  const fair = [];
  for (const ps of persons) {
    const { pi, elig } = ps;
    // Überschneidung: für jeden Beginn die zu diesem Zeitpunkt laufenden Führungen
    const seen = new Set();
    for (const v of elig) {
      const grp = elig.filter((w) => w.t.datum === v.t.datum && toM(w.t.beginn) <= toM(v.t.beginn) && toM(v.t.beginn) < toM(w.t.ende)).map((w) => w.name);
      const key = grp.join(",");
      if (grp.length > 1 && !seen.has(key)) {
        seen.add(key);
        rows.push({ name: `ueb${pi}_${v.ti}`, terms: grp.map((g) => [g, 1]), op: "<=", rhs: 1 });
      }
    }
    if (!elig.length) continue;
    const cap = Math.max(0, ps.effMax - ps.fixN);
    rows.push({ name: `max${pi}`, terms: elig.map((v) => [v.name, 1]), op: "<=", rhs: cap });
    const need = ps.a.min - ps.fixN;
    if (need > 0) {
      rows.push({ name: `min${pi}`, terms: [...elig.map((v) => [v.name, 1]), [`s${pi}`, 1]], op: ">=", rhs: need });
      obj.push([`s${pi}`, W2]);
      bounds.push([`s${pi}`, 0, need]);
    }
    // Gleichmäßigkeit: Halbstunden-Stufen mit steigenden Kosten
    if (cap > 0 && ps.effMax > 0) {
      const durs = elig.map((v) => durationMin(v.t) / 60).sort((a, b) => b - a);
      const maxFreeH = durs.slice(0, cap).reduce((s, d) => s + d, 0);
      const K = Math.ceil(maxFreeH / 0.5 - 1e-9);
      const capH = ps.effMax * avgDurH;
      const terms = elig.map((v) => [v.name, durationMin(v.t) / 60]);
      for (let k = 1; k <= K; k++) {
        const z = `z${pi}_${k}`;
        terms.push([z, -0.5]);
        fair.push([z, (ps.fixH + k * 0.5) / capH]);
        bounds.push([z, 0, 1]);
      }
      if (K > 0) rows.push({ name: `std${pi}`, terms, op: "=", rhs: 0 });
    }
  }
  const fairSum = fair.reduce((s, [, c]) => s + c, 0);
  for (const [z, c] of fair) obj.push([z, c / (fairSum * 1.01)]);
  pairs.forEach(([a, b], i) => {
    rows.push({ name: `ans${i}`, terms: [[a, 1], [b, 1], [`y${i}`, -1]], op: "<=", rhs: 1 });
    obj.push([`y${i}`, W3]);
    bounds.push([`y${i}`, 0, 1]);
  });
  for (const v of fixAdj) obj.push([v, W3]);

  return { T, P, persons, vars, rows, obj, bounds, weights: { W1, W2, W3 } };
}

const toM = (s) => +s.slice(0, 2) * 60 + +s.slice(3, 5);

/** Modell → LP-Textformat für HiGHS. */
export function toLP(m) {
  const objMap = new Map();
  for (const [v, c] of m.obj) objMap.set(v, (objMap.get(v) ?? 0) + c);
  const lin = (terms) =>
    terms.map(([v, c], i) => `${c < 0 ? "- " : i ? "+ " : ""}${num(Math.abs(c))} ${v}`).join(" ");
  const objTerms = [...objMap.entries()];
  let s = "Minimize\n obj: " + (objTerms.length ? lin(objTerms) : "0 leer") + "\nSubject To\n";
  for (const r of m.rows) if (r.terms.length) s += ` ${r.name}: ${lin(r.terms)} ${r.op} ${num(r.rhs)}\n`;
  s += "Bounds\n";
  for (const [v, lo, hi] of m.bounds) s += ` ${num(lo)} <= ${v} <= ${num(hi)}\n`;
  if (!objTerms.length) s += " leer = 0\n";
  if (m.vars.length) s += "Binary\n" + m.vars.map((v) => ` ${v.name}`).join("\n") + "\n";
  return s + "End\n";
}

export const HIGHS_OPTIONS = { mip_rel_gap: 0, mip_abs_gap: 1e-9, output_flag: false, log_to_console: false };

/** Löst eine Runde. `highs` ist das geladene HiGHS-Modul. */
export function solveRound(round, highs) {
  const m = buildModel(round);
  const t0 = Date.now();
  let chosen = new Set();
  if (m.vars.length) {
    const res = highs.solve(toLP(m), HIGHS_OPTIONS);
    if (res.Status !== "Optimal") throw new Error(`Der Solver hat keine optimale Lösung gefunden (${res.Status}).`);
    chosen = new Set(m.vars.filter((v) => res.Columns[v.name]?.Primal > 0.5).map((v) => v.name));
  }
  const a = {};
  m.T.forEach((t, ti) => {
    const fix = t.fix.map((f) => findTeamName(round.team, f) ?? f);
    const assigned = sortNames(m.vars.filter((v) => v.ti === ti && chosen.has(v.name)).map((v) => v.p));
    const open = Math.max(0, t.personen - fix.length - assigned.length);
    a[t.id] = [...fix, ...assigned, ...Array(open).fill(null)];
  });
  return { a, ms: Date.now() - t0, vars: m.vars.length };
}

let highsPromise = null;
/** Lädt HiGHS einmalig (Datei liegt neben highs.mjs und wird vom Service Worker zwischengespeichert). */
export function loadHighs() {
  highsPromise ??= import("../vendor/highs.mjs").then((mod) => mod.default());
  return highsPromise;
}

// ---------- Auswertung eines Plans (auch nach händischer Korrektur) ----------
const label = (t) => `${fmtDatumKurz(t.datum)} ${t.beginn} ${t.ort}`;

/**
 * Prüft einen Plan und liefert Hinweise.
 * {proTour: {id: {offen, moeglich, ueberMax, probleme}}, personen: [...], hinweise: [{art, text}]}
 */
export function analyse(round, planA) {
  const T = sortTours(round.tours);
  const answers = teamAnswers(round);
  const ansOf = (n) => answers[findTeamName(round.team, n) ?? ""] ?? null;
  const toursOf = new Map(); // nameKey → [t]
  for (const t of T) for (const n of planA[t.id] ?? []) if (n) {
    const k = nameKey(n);
    if (!toursOf.has(k)) toursOf.set(k, []);
    toursOf.get(k).push(t);
  }
  const hinweise = [];
  const proTour = {};
  const isFix = (t, n) => t.fix.some((f) => nameKey(f) === nameKey(n));

  for (const t of T) {
    const slots = planA[t.id] ?? [];
    const offen = slots.filter((s) => !s).length;
    const probleme = [];
    const keys = slots.filter(Boolean).map(nameKey);
    keys.forEach((k, i) => { if (keys.indexOf(k) !== i) probleme.push(`${slots.filter(Boolean)[i]} ist doppelt eingetragen`); });
    for (const n of slots.filter(Boolean)) {
      if (isFix(t, n)) continue;
      const a = ansOf(n);
      if (!findTeamName(round.team, n)) probleme.push(`${n} steht nicht in der Teamliste`);
      else if (!a) probleme.push(`${n} hat nicht geantwortet`);
      else {
        if (!a.can.includes(t.id)) probleme.push(`${n} hat für diese Führung nicht „kann“ gemeldet`);
        else if (!canValid(a, t)) probleme.push(`${n}: Führung wurde nach der Antwort geändert`);
        if (!a.langs.includes(t.sprache)) probleme.push(`${n} spricht nicht ${t.sprache}`);
      }
      const other = (toursOf.get(nameKey(n)) ?? []).filter((o) => o !== t && overlaps(o, t));
      if (other.length && !other.every((o) => isFix(o, n))) probleme.push(`${n} überschneidet sich mit ${other.map(label).join(", ")}`);
    }
    const moeglich = [], ueberMax = [];
    if (offen) {
      for (const [name, a] of Object.entries(answers)) {
        if (keys.includes(nameKey(name)) || !canValid(a, t) || !a.langs.includes(t.sprache)) continue;
        const mine = toursOf.get(nameKey(name)) ?? [];
        if (mine.some((o) => overlaps(o, t))) continue;
        if (mine.length < a.max) moeglich.push(name);
        else ueberMax.push(`${name} (${mine.length}/${a.max})`);
      }
      let text = `${label(t)}: ${offen} ${offen === 1 ? "Platz" : "Plätze"} offen`;
      if (moeglich.length) text += ` – möglich: ${sortNames(moeglich).join(", ")}`;
      if (ueberMax.length) text += ` – möglich über Max: ${sortNames(ueberMax).join(", ")}`;
      if (!moeglich.length && !ueberMax.length) text += " – niemand Passendes verfügbar";
      hinweise.push({ art: "offen", text, tour: t.id });
    }
    for (const p of probleme) hinweise.push({ art: "korrektur", text: `${label(t)}: ${p}`, tour: t.id });
    proTour[t.id] = { offen, moeglich: sortNames(moeglich), ueberMax: sortNames(ueberMax), probleme };
  }

  // Fix-Prüfungen
  for (const t of T) for (const f of t.fix) {
    const a = ansOf(f);
    if (a && !a.langs.includes(t.sprache)) hinweise.push({ art: "fix", text: `${label(t)}: ${f} ist fix eingeteilt, gibt aber ${t.sprache} nicht als Sprache an` });
    for (const g of fixToursOf(round, f)) if (g !== t && tourSortKey(g) > tourSortKey(t) && overlaps(g, t)) hinweise.push({ art: "fix", text: `${f} ist fix auf zwei Führungen, die sich überschneiden: ${label(t)} und ${label(g)}` });
  }

  // Personen
  const personen = [];
  for (const name of sortNames(round.team)) {
    const a = answers[name] ?? null;
    const mine = toursOf.get(nameKey(name)) ?? [];
    const stunden = mine.reduce((s, t) => s + durationMin(t), 0) / 60;
    const fixN = fixToursOf(round, name).length;
    const p = { name, anzahl: mine.length, stunden, fixN, min: a?.min ?? null, max: a?.max ?? null, effMax: a ? effectiveMax(round, a) : null, antwort: !!a };
    personen.push(p);
    if (a) {
      if (mine.length < a.min) hinweise.push({ art: "min", text: `${name}: unter Min (${mine.length} von mindestens ${a.min})` });
      if (mine.length > a.max) hinweise.push({ art: "max", text: `${name}: über Max (${mine.length}, Max ${a.max})${fixN > a.max ? " – schon durch Fix-Einteilung" : ""}` });
      const geaendert = round.tours.filter((t) => a.can.includes(t.id) && !canValid(a, t)).length;
      const neu = round.tours.filter((t) => (t.trev ?? 0) > a.rev && !a.can.includes(t.id) && a.langs.includes(t.sprache) && !isFix(t, name)).length;
      if (geaendert + neu) hinweise.push({ art: "veraltet", text: `${name}: ${geaendert + neu} ${geaendert + neu === 1 ? "Führung" : "Führungen"} nach der Antwort neu oder zeitlich geändert – gilt als nicht gemeldet` });
    }
    const sorted = sortTours(mine);
    for (let i = 0; i + 1 < sorted.length; i++) {
      const x = sorted[i], y = sorted[i + 1];
      if (!overlaps(x, y) && backToBack(x, y)) hinweise.push({ art: "anschluss", text: `${name}: direkt aufeinander am ${fmtDatumKurz(x.datum)} (${x.beginn}–${x.ende} ${x.ort}, ${y.beginn}–${y.ende} ${y.ort})` });
    }
  }
  const ohne = sortNames(round.team.filter((n) => !answers[n]));
  if (ohne.length) hinweise.push({ art: "antwort", text: `Keine Antwort von: ${ohne.join(", ")}` });
  for (const u of unknownAnswers(round)) hinweise.push({ art: "unbekannt", text: `Antwort von „${u.name}“ wird nicht berücksichtigt – Name steht nicht in der Teamliste` });

  return { proTour, personen, hinweise };
}
const tourSortKey = (t) => `${t.datum} ${t.beginn} ${t.ende} ${t.id.padStart(6, "0")}`;

/** Titel eines Termins in der Gesamt-.ics: "Ort Name, Name, ??". */
export const gesamtTitel = (t, slots) => `${t.ort} ${titleNames(slots).join(", ")}`;
