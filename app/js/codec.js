// Kodierung der drei Links. Aufbau: <Typ><Version>.<Nutzdaten>
//   R = Runde (Link 1), A = Antwort (Link 2), P = Plan (Link 3)
// Nutzdaten = lz-string compressToEncodedURIComponent(JSON) – Alphabet A–Z a–z 0–9 + - $,
// das WhatsApp nicht als Formatierung deutet. Die Daten stehen immer hinter "#".
import LZ from "../vendor/lz-string.mjs";
import { dayNum, fromDayNum, toMin, fromMin, findTeamName, nameKey, SPRACHEN } from "./model.js";

export const VERSION = 1;
const CODE_RE = /(?:^|[#\s(<"'])([RAP])(\d{1,2})\.([A-Za-z0-9+\-$]{8,})/g;

const langBits = (langs) => (langs ?? []).reduce((b, l) => b | (l === "DE" ? 1 : l === "EN" ? 2 : 0), 0);
const bitsLangs = (b) => SPRACHEN.filter((_, i) => b & (1 << i));

export const pack = (type, obj) => `${type}${VERSION}.${LZ.compressToEncodedURIComponent(JSON.stringify(obj))}`;

function unpack(payload) {
  const json = LZ.decompressFromEncodedURIComponent(payload);
  if (!json) throw new Error("Code ist unvollständig oder beschädigt.");
  return JSON.parse(json);
}

// ---------- Runde (Link 1) und Plan (Link 3) ----------
function compactRound(round, { langtext }) {
  const tours = [...round.tours];
  const base = round.von || tours.map((t) => t.datum).sort()[0] || "2000-01-01";
  const d0 = dayNum(base);
  const orte = [...new Set(tours.map((t) => t.ort))];
  const teamIdx = (n) => {
    const i = round.team.findIndex((t) => nameKey(t) === nameKey(n));
    return i >= 0 ? i : String(n);
  };
  return {
    obj: {
      i: round.id,
      r: round.rev,
      d: base,
      a: round.von,
      b: round.bis,
      f: round.frist,
      m: round.team,
      s: round.team.map((n) => langBits(round.langs?.[nameKey(n)])),
      o: orte,
      l: langtext ? 1 : 0,
      t: tours.map((t) => {
        const row = [t.id, orte.indexOf(t.ort), dayNum(t.datum) - d0, toMin(t.beginn), toMin(t.ende), t.sprache === "EN" ? 1 : 0, t.personen, t.fix.map(teamIdx), t.kurztitel || "", t.trev ?? 0];
        if (langtext) row.push(t.beschreibung || "");
        return row;
      }),
    },
    teamIdx,
  };
}

function expandRound(o) {
  if (!o || typeof o.i !== "string" || !Array.isArray(o.m) || !Array.isArray(o.t)) throw new Error("Code enthält keine gültige Runde.");
  const d0 = dayNum(o.d);
  const name = (x) => (typeof x === "number" ? o.m[x] : x);
  const langs = {};
  o.m.forEach((n, i) => {
    const l = bitsLangs(o.s?.[i] ?? 0);
    if (l.length) langs[nameKey(n)] = l;
  });
  return {
    id: o.i,
    rev: o.r,
    von: o.a,
    bis: o.b,
    frist: o.f,
    team: o.m,
    langs,
    langtext: !!o.l,
    tours: o.t.map((r) => ({
      id: r[0],
      ort: o.o[r[1]],
      datum: fromDayNum(d0 + r[2]),
      beginn: fromMin(r[3]),
      ende: fromMin(r[4]),
      sprache: r[5] ? "EN" : "DE",
      personen: r[6],
      fix: r[7].map(name),
      kurztitel: r[8] ?? "",
      trev: r[9] ?? 0,
      beschreibung: o.l ? r[10] ?? "" : "",
    })),
  };
}

export function encodeRound(round, { langtext = false } = {}) {
  return pack("R", compactRound(round, { langtext }).obj);
}

/** Plan: Runde + Zuteilung je Führung (Index in der Teamliste, -1 = offen). */
export function encodePlan(round, planA, { langtext = false } = {}) {
  const { obj, teamIdx } = compactRound(round, { langtext });
  obj.p = round.tours.map((t) => (planA[t.id] ?? []).map((n) => (n ? teamIdx(n) : -1)));
  return pack("P", obj);
}

// ---------- Antwort (Link 2) ----------
export function encodeAnswer(ans) {
  return pack("A", { i: ans.rid, r: ans.rev, z: ans.ts, n: ans.name, s: langBits(ans.langs), a: ans.min, b: ans.max, k: ans.can });
}

function expandAnswer(o) {
  const ok = o && typeof o.i === "string" && typeof o.n === "string" && Number.isInteger(o.a) && Number.isInteger(o.b) && Array.isArray(o.k);
  if (!ok) throw new Error("Code enthält keine gültige Antwort.");
  return { rid: o.i, rev: o.r ?? 0, ts: o.z ?? 0, name: o.n, langs: bitsLangs(o.s), min: o.a, max: o.b, can: o.k.map(String) };
}

// ---------- Lesen ----------
/** Ein einzelner Code (ohne "#") → {type, data}. Wirft bei Fehlern. */
export function decode(code) {
  const m = /^([RAP])(\d{1,2})\.([A-Za-z0-9+\-$]+)$/.exec(code.trim());
  if (!m) throw new Error("Das ist kein Code der Führungsvergabe.");
  const [, type, ver, payload] = m;
  if (+ver !== VERSION) throw new Error(`Code-Version ${ver} wird von dieser App-Version nicht unterstützt. Bitte App neu laden.`);
  const o = unpack(payload);
  if (type === "A") return { type, data: expandAnswer(o) };
  const round = expandRound(o);
  if (type === "R") return { type, data: round };
  if (!Array.isArray(o.p) || o.p.length !== o.t.length) throw new Error("Code enthält keinen gültigen Plan.");
  const a = {};
  round.tours.forEach((t, i) => {
    a[t.id] = o.p[i].map((x) => (x === -1 ? null : typeof x === "number" ? o.m[x] : x));
  });
  return { type, data: { round, a } };
}

/** Findet alle Codes in beliebigem Text (Link, ganze WhatsApp-Nachricht, mehrere Nachrichten). */
export function findCodes(text) {
  const out = [];
  const seen = new Set();
  for (const m of String(text ?? "").matchAll(CODE_RE)) {
    const code = `${m[1]}${m[2]}.${m[3]}`;
    if (seen.has(code)) continue;
    seen.add(code);
    try {
      out.push({ code, ...decode(code) });
    } catch (e) {
      out.push({ code, type: m[1], error: e.message });
    }
  }
  return out;
}

// ---------- Nachrichten ----------
export const linkFor = (baseUrl, code) => `${baseUrl}#${code}`;

const fmt = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.` : "");

export function messageRound(round, url) {
  const zeitraum = round.von && round.bis ? ` ${fmt(round.von)}–${fmt(round.bis)}` : "";
  const frist = round.frist ? ` bis ${fmt(round.frist)}` : "";
  return `Führungsvergabe${zeitraum}: Bitte melde dich${frist}, wann du kannst.\nAntippen – oder diese ganze Nachricht kopieren und in der App einfügen:\n${url}`;
}
export function messageAnswer(ans, url) {
  return `Rückmeldung Führungsvergabe von ${ans.name}:\n${url}`;
}
export function messagePlan(round, url) {
  const zeitraum = round.von && round.bis ? ` ${fmt(round.von)}–${fmt(round.bis)}` : "";
  return `Führungsplan${zeitraum} ist fertig.\nAntippen – oder diese ganze Nachricht kopieren und in der App einfügen:\n${url}`;
}

/** Zuordnung eines Plan-Namens zur Teamliste (für Anzeige "ich"). */
export const isMe = (round, slotName, me) => !!slotName && !!me && nameKey(findTeamName(round.team, slotName) ?? slotName) === nameKey(me);
