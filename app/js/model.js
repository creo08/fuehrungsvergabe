// Datenmodell und reine Hilfsfunktionen (ohne DOM). Alle Zeiten sind Wiener
// Wanduhrzeit als Text ("HH:MM"), Daten als "JJJJ-MM-TT". Es wird nie über die
// Zeitzone des Geräts umgerechnet.

export const SPRACHEN = ["DE", "EN"];
export const PUFFER_MIN = 60; // Vor- bzw. Nachbereitung in der persönlichen .ics
export const ANSCHLUSS_MIN = 30; // Abstand darunter gilt als direkter Anschluss

// ---------- Namen ----------
export const nameKey = (n) => String(n ?? "").trim().toLocaleLowerCase("de");
const collator = new Intl.Collator("de", { sensitivity: "base", numeric: true });
export const sortNames = (names) => [...names].sort((a, b) => collator.compare(a, b) || (a < b ? -1 : a > b ? 1 : 0));

/** Sucht einen Namen ohne Rücksicht auf Groß-/Kleinschreibung in der Teamliste. */
export function findTeamName(team, name) {
  const k = nameKey(name);
  return team.find((t) => nameKey(t) === k) ?? null;
}

// ---------- Sprache ----------
/** "de", "DE", " En " → "DE"/"EN"; leer → null; sonst undefined (unbekannt). */
export function parseSprache(v) {
  const s = String(v ?? "").trim();
  if (!s) return null;
  const u = s.toUpperCase();
  return SPRACHEN.includes(u) ? u : undefined;
}

// ---------- Zeit ----------
export const toMin = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  return m ? +m[1] * 60 + +m[2] : NaN;
};
export const fromMin = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const validTime = (hhmm) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm ?? "");
  return !!m && +m[1] < 24 && +m[2] < 60;
};
export function validDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}
/** Tage seit 1970-01-01 (kalendarisch, ohne Zeitzone). */
export const dayNum = (iso) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 864e5;
export const fromDayNum = (n) => new Date(n * 864e5).toISOString().slice(0, 10);
/** Datum + Minuten (auch negativ oder ≥ 1440) → {datum, zeit}. */
export function shiftWallClock(iso, minutes) {
  const d = dayNum(iso) + Math.floor(minutes / 1440);
  const m = ((minutes % 1440) + 1440) % 1440;
  return { datum: fromDayNum(d), zeit: fromMin(m) };
}
export const durationMin = (t) => toMin(t.ende) - toMin(t.beginn);
const WOCHENTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
export const fmtDatum = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
export const fmtDatumKurz = (iso) => `${WOCHENTAG[new Date(dayNum(iso) * 864e5).getUTCDay()]} ${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;

export const tourSort = (a, b) =>
  a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : toMin(a.beginn) - toMin(b.beginn) || toMin(a.ende) - toMin(b.ende) || cmpId(a.id, b.id);
const cmpId = (a, b) => (a.length - b.length) || (a < b ? -1 : a > b ? 1 : 0);
export const sortTours = (tours) => [...tours].sort(tourSort);

/** Überschneiden sich zwei Führungen zeitlich (gleicher Tag, echte Überlappung)? */
export const overlaps = (a, b) => a.datum === b.datum && toMin(a.beginn) < toMin(b.ende) && toMin(b.beginn) < toMin(a.ende);
/** Abstand in Minuten von a (früher) zu b (später) am selben Tag, sonst null. */
export function gapMin(a, b) {
  if (a.datum !== b.datum) return null;
  return toMin(b.beginn) - toMin(a.ende);
}
/** Direkter Anschluss: 0 ≤ Abstand < ANSCHLUSS_MIN in einer der beiden Richtungen. */
export function backToBack(a, b) {
  const g1 = gapMin(a, b), g2 = gapMin(b, a);
  return (g1 !== null && g1 >= 0 && g1 < ANSCHLUSS_MIN) || (g2 !== null && g2 >= 0 && g2 < ANSCHLUSS_MIN);
}

// ---------- IDs ----------
export function randomId(len = 8) {
  const abc = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(len);
  globalThis.crypto.getRandomValues(bytes);
  return [...bytes].map((b) => abc[b % abc.length]).join("");
}

// ---------- Runde ----------
export function newRound({ team = [], langs = {} } = {}) {
  return {
    id: randomId(),
    rev: 1,
    sentRev: 0,
    von: "",
    bis: "",
    frist: "",
    team: [...team],
    langs: { ...langs }, // Vorbelegung der Sprachen je Name (Schlüssel: nameKey)
    tours: [],
    nextTourId: 1,
    answers: {}, // nameKey → Antwort
    plan: null, // {a: {tourId: [name|null]}, solvedAt, manual: bool}
    langtext: { r: false, p: false },
    createdAt: new Date().toISOString(),
  };
}

/**
 * Markiert eine Änderung, die Rückmeldungen ungültig macht (neue Führung,
 * Datum/Beginn/Ende geändert). Die Revision steigt nur einmal pro verschicktem Link 1.
 */
export function bumpTimeRev(round, tour) {
  if (round.sentRev >= round.rev) round.rev += 1;
  tour.trev = round.rev;
}

export function addTour(round, data) {
  const t = {
    id: (round.nextTourId++).toString(36),
    ort: data.ort,
    datum: data.datum,
    beginn: data.beginn,
    ende: data.ende,
    sprache: data.sprache ?? "DE",
    personen: data.personen ?? 1,
    fix: [...(data.fix ?? [])],
    kurztitel: data.kurztitel ?? "",
    beschreibung: data.beschreibung ?? "",
    trev: 0,
  };
  bumpTimeRev(round, t);
  round.tours.push(t);
  return t;
}

/** Ändert eine Führung; bei Datum/Zeit-Änderung werden ältere Antworten für sie ungültig. */
export function updateTour(round, id, patch) {
  const t = round.tours.find((x) => x.id === id);
  if (!t) return null;
  const timeChanged = ["datum", "beginn", "ende"].some((k) => k in patch && patch[k] !== t[k]);
  Object.assign(t, patch);
  if (timeChanged) bumpTimeRev(round, t);
  return t;
}

// ---------- Antworten ----------
/** Antwort ins Team einordnen. Liefert {status, name}. Neuere Antwort (ts) gewinnt. */
export function addAnswer(round, ans) {
  if (ans.rid !== round.id) return { status: "andere-runde" };
  const teamName = findTeamName(round.team, ans.name);
  const key = nameKey(ans.name);
  const prev = round.answers[key];
  if (prev && prev.ts > ans.ts) return { status: "aelter", name: teamName ?? ans.name, prev };
  if (prev && prev.ts === ans.ts && JSON.stringify(prev) === JSON.stringify({ ...ans, name: prev.name })) return { status: "doppelt", name: prev.name };
  round.answers[key] = { ...ans, name: teamName ?? ans.name.trim() };
  if (teamName) round.langs[key] = [...ans.langs];
  return { status: teamName ? (prev ? "ersetzt" : "neu") : "unbekannt", name: teamName ?? ans.name, prev };
}

/** Antwort einer Person für eine Führung noch gültig? (nicht nach der Antwort zeitlich geändert/neu) */
export const canValid = (ans, tour) => ans.can.includes(tour.id) && (tour.trev ?? 0) <= ans.rev;

/** Antworten von Teammitgliedern (unbekannte Namen ausgeschlossen). */
export function teamAnswers(round) {
  const out = {};
  for (const name of round.team) {
    const a = round.answers[nameKey(name)];
    if (a) out[name] = a;
  }
  return out;
}
export const unknownAnswers = (round) => Object.values(round.answers).filter((a) => !findTeamName(round.team, a.name));

/** Führungen, die eine Person laut Antwort machen könnte (Häkchen gültig, Sprache passt). */
export function possibleTours(round, ans) {
  return round.tours.filter((t) => canValid(ans, t) && ans.langs.includes(t.sprache));
}

/** Fix-Führungen einer Person (Name ohne Groß-/Kleinschreibung). */
export const fixToursOf = (round, name) => round.tours.filter((t) => t.fix.some((f) => nameKey(f) === nameKey(name)));

/** Max, begrenzt auf die Zahl der möglichen Führungen (inkl. Fix). */
export function effectiveMax(round, ans) {
  const fixIds = new Set(fixToursOf(round, ans.name).map((t) => t.id));
  const free = possibleTours(round, ans).filter((t) => !fixIds.has(t.id)).length;
  return Math.min(ans.max, fixIds.size + free);
}

/** Namen eines Plans für einen Kalendertitel: alphabetisch, "??" je offenem Platz. */
export function titleNames(slots) {
  const names = sortNames(slots.filter(Boolean));
  const open = slots.filter((s) => !s).length;
  return [...names, ...Array(open).fill("??")];
}

/** Leerer Plan: Fix gesetzt, Rest offen. */
export function emptyPlan(round) {
  const a = {};
  for (const t of round.tours) {
    const fix = t.fix.map((f) => findTeamName(round.team, f) ?? f);
    a[t.id] = [...fix, ...Array(Math.max(0, t.personen - fix.length)).fill(null)];
  }
  return a;
}

/**
 * Plan an geänderte Führungen anpassen: Fix zuerst, bisherige freie Einteilungen behalten
 * (ohne Doppelte), auf die Personenzahl kürzen bzw. mit offenen Plätzen auffüllen.
 */
export function normalizePlan(round, planA) {
  const out = {};
  for (const t of round.tours) {
    const fix = t.fix.map((f) => findTeamName(round.team, f) ?? f);
    const keys = new Set(fix.map(nameKey));
    const rest = [];
    for (const n of planA?.[t.id] ?? []) {
      if (!n || keys.has(nameKey(n))) continue;
      keys.add(nameKey(n));
      rest.push(n);
    }
    const slots = [...fix, ...rest].slice(0, Math.max(t.personen, fix.length));
    while (slots.length < t.personen) slots.push(null);
    out[t.id] = slots;
  }
  return out;
}

/** Neue Runde aus der letzten: Team und Sprachen, keine Führungen, Antworten, Pläne, kein Min/Max. */
export function newRoundFrom(prev) {
  const langs = { ...(prev.langs ?? {}) };
  for (const a of Object.values(prev.answers ?? {})) if (findTeamName(prev.team, a.name)) langs[nameKey(a.name)] = [...a.langs];
  return newRound({ team: prev.team, langs });
}
