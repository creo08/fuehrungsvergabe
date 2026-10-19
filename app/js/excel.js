// Excel-Import: .xlsx-Datei lesen und aus Excel kopierten Text (Tab-getrennt) zerlegen,
// dann jede Zeile prüfen. Es wird nichts stillschweigend korrigiert: Unklares wird als
// Problem markiert und nicht übernommen.
import { unzipSync, strFromU8 } from "../vendor/fflate.mjs";
import { parseSprache, findTeamName, validDate, validTime, toMin, fromMin, nameKey, dayNum } from "./model.js";

// ---------- Text aus der Zwischenablage ----------
/** Tab-getrennter Text → Zeilen × Zellen. Zellen in "…" dürfen Tabs, Umbrüche und "" enthalten. */
export function parseTSV(text) {
  const s = String(text ?? "").replace(/^﻿/, "");
  const rows = [];
  let row = [], cell = "", i = 0, quoted = false, cellStart = true;
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      cell += c; i++; continue;
    }
    if (c === '"' && cellStart) { quoted = true; cellStart = false; i++; continue; }
    if (c === "\t") { row.push(cell); cell = ""; cellStart = true; i++; continue; }
    if (c === "\r" || c === "\n") {
      row.push(cell); rows.push(row); row = []; cell = ""; cellStart = true;
      i += c === "\r" && s[i + 1] === "\n" ? 2 : 1;
      continue;
    }
    cell += c; cellStart = false; i++;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => r.map((v) => v.replace(/\r\n?/g, "\n")));
}

// ---------- .xlsx ----------
const unxml = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d)).replace(/&amp;/g, "&")
    .replace(/_x000D_/g, "").replace(/\r\n?/g, "\n");
const textOf = (xml) => unxml([...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>|<t(?:\s[^>]*)?\/>/g)].map((m) => m[1] ?? "").join(""));
const colIndex = (ref) => [...ref].reduce((a, ch) => a * 26 + ch.charCodeAt(0) - 64, 0) - 1;

/**
 * Liest das erste Tabellenblatt einer .xlsx-Datei.
 * Ergebnis: {rows: Zellen (string|number|boolean|""), date1904}
 */
export function readXlsx(bytes) {
  let files;
  try {
    files = unzipSync(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  } catch {
    throw new Error("Datei ist keine gültige .xlsx-Datei.");
  }
  const get = (p) => (files[p] ? strFromU8(files[p]) : null);
  const wb = get("xl/workbook.xml");
  if (!wb) throw new Error("Datei ist keine gültige .xlsx-Datei (workbook.xml fehlt).");
  const date1904 = /<workbookPr\b[^>]*\bdate1904="(1|true)"/.test(wb);
  // erstes Blatt über die Beziehungen finden
  let sheetPath = "xl/worksheets/sheet1.xml";
  const first = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(wb) ?? /<sheet\b[^>]*\bid="([^"]+)"/.exec(wb);
  const rels = get("xl/_rels/workbook.xml.rels");
  if (first && rels) {
    const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => r.includes(`Id="${first[1]}"`));
    const target = rel && /Target="([^"]+)"/.exec(rel)?.[1];
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target}`.replace(/\/\.\//g, "/");
  }
  const sheet = get(sheetPath);
  if (!sheet) throw new Error("Tabellenblatt nicht gefunden.");
  const sst = get("xl/sharedStrings.xml");
  const shared = sst ? [...sst.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  const rows = [];
  for (const rm of sheet.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rnum = /\br="(\d+)"/.exec(rm[1]);
    const ri = rnum ? +rnum[1] - 1 : rows.length;
    const row = [];
    let next = 0;
    for (const cm of (rm[2] ?? "").matchAll(/<c\b((?:[^>/]|\/(?!>))*)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cm[1], body = cm[2] ?? "";
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs);
      const ci = ref ? colIndex(ref[1]) : next;
      next = ci + 1;
      const t = /\bt="(\w+)"/.exec(attrs)?.[1] ?? "n";
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val = "";
      if (t === "s") val = v !== undefined ? shared[+v] ?? "" : "";
      else if (t === "inlineStr") val = textOf(/<is>([\s\S]*?)<\/is>/.exec(body)?.[1] ?? "");
      else if (t === "str" || t === "e") val = v !== undefined ? unxml(v) : "";
      else if (t === "b") val = v === "1";
      else if (v !== undefined && v !== "") val = Number(v);
      row[ci] = val;
    }
    for (let k = 0; k < row.length; k++) if (row[k] === undefined) row[k] = "";
    rows[ri] = row;
  }
  for (let k = 0; k < rows.length; k++) if (!rows[k]) rows[k] = [];
  return { rows, date1904 };
}

// ---------- Werte deuten ----------
const EXCEL_EPOCH = dayNum("1899-12-30");
/** Excel-Seriennummer (nur Datum) → ISO. 1904-System: +1462 Tage. */
export function serialToIso(n, date1904 = false) {
  const days = Math.floor(n) + (date1904 ? 1462 : 0);
  return new Date((EXCEL_EPOCH + days) * 864e5).toISOString().slice(0, 10);
}

/** Datum aus Zelle → {ok, iso} oder {ok:false, msg}. */
export function parseDatum(v, date1904) {
  if (typeof v === "number") {
    if (!Number.isFinite(v) || v < 61 || v > 2958465) return { ok: false, msg: `Datum „${v}“ ist keine gültige Excel-Datumszahl` };
    if (Math.abs(v - Math.round(v)) > 1e-9) return { ok: false, msg: "Datum enthält auch eine Uhrzeit" };
    return { ok: true, iso: serialToIso(Math.round(v), date1904) };
  }
  const s = String(v ?? "").trim();
  if (!s) return { ok: false, msg: "Datum fehlt" };
  let m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  let iso = m ? `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}` : null;
  if (!m && (m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s))) iso = s;
  if (!iso && /^\d{5}$/.test(s)) return parseDatum(Number(s), date1904);
  if (!iso || !validDate(iso)) return { ok: false, msg: `Datum „${s}“ nicht lesbar (erwartet TT.MM.JJJJ)` };
  return { ok: true, iso };
}

/** Uhrzeit aus Zelle → {ok, hhmm} oder {ok:false, msg}. */
export function parseZeit(v, feld) {
  if (typeof v === "number") {
    if (!(v >= 0 && v < 1)) return { ok: false, msg: `${feld} „${v}“ ist keine Uhrzeit` };
    const min = Math.round(v * 1440);
    if (min >= 1440) return { ok: false, msg: `${feld} „${v}“ ist keine Uhrzeit` };
    return { ok: true, hhmm: fromMin(min) };
  }
  const s = String(v ?? "").trim();
  if (!s) return { ok: false, msg: `${feld} fehlt` };
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(s);
  if (!m || (m[3] && m[3] !== "00")) return { ok: false, msg: `${feld} „${s}“ nicht lesbar (erwartet hh:mm)` };
  const hhmm = `${m[1].padStart(2, "0")}:${m[2]}`;
  if (!validTime(hhmm)) return { ok: false, msg: `${feld} „${s}“ ist keine gültige Uhrzeit` };
  return { ok: true, hhmm };
}

// ---------- Spalten ----------
export const SPALTEN = ["ort", "datum", "beginn", "ende", "sprache", "personen", "fix", "kurztitel", "beschreibung"];
const PFLICHT = ["ort", "datum", "beginn", "ende"];
const anzeige = { ort: "Ort", datum: "Datum", beginn: "Beginn", ende: "Ende", sprache: "Sprache", personen: "Personen", fix: "Fix", kurztitel: "Kurztitel", beschreibung: "Beschreibung" };

/** Überschriftenzeile → {map: spalte→index, fehlend: [...], doppelt: [...]} */
export function mapHeader(header) {
  const map = {}, doppelt = [];
  header.forEach((h, i) => {
    const k = String(h ?? "").trim().toLowerCase();
    if (!SPALTEN.includes(k)) return;
    if (k in map) doppelt.push(anzeige[k]);
    else map[k] = i;
  });
  return { map, fehlend: PFLICHT.filter((k) => !(k in map)).map((k) => anzeige[k]), doppelt };
}

const str = (v) => (v === undefined || v === null ? "" : typeof v === "number" ? String(v) : typeof v === "boolean" ? (v ? "WAHR" : "FALSCH") : String(v));
const isEmptyRow = (r) => r.every((v) => str(v).trim() === "");

/**
 * Prüft alle Zeilen. Ergebnis:
 * {fehler: string|null, zeilen: [{nr, daten, probleme: [], hinweise: []}]}
 * Nur Zeilen ohne Probleme dürfen übernommen werden; Hinweise sind keine Fehler.
 */
export function pruefeZeilen(rows, { team = [], von = "", bis = "", vorhandene = [], date1904 = false } = {}) {
  const startIdx = rows.findIndex((r) => r && !isEmptyRow(r));
  if (startIdx < 0) return { fehler: "Keine Daten gefunden.", zeilen: [] };
  const { map, fehlend, doppelt } = mapHeader(rows[startIdx]);
  if (fehlend.length) return { fehler: `Pflichtspalte fehlt: ${fehlend.join(", ")}. Die erste Zeile muss die Überschriften enthalten.`, zeilen: [] };
  if (doppelt.length) return { fehler: `Spalte doppelt vorhanden: ${doppelt.join(", ")}.`, zeilen: [] };
  const cell = (r, k) => (k in map ? r[map[k]] : "");
  const zeilen = [];
  const schluessel = new Map(vorhandene.map((t) => [`${nameKey(t.ort)}|${t.datum}|${t.beginn}`, "bereits vorhandene Führung"]));
  for (let i = startIdx + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (isEmptyRow(r)) continue;
    const probleme = [], hinweise = [];
    if (r.some((v) => /BEISPIEL/.test(str(v)))) probleme.push("Beispielzeile aus der Vorlage – bitte löschen");
    const ort = str(cell(r, "ort")).trim();
    if (!ort) probleme.push("Ort fehlt");
    else if (/\n/.test(ort)) probleme.push("Ort darf keinen Zeilenumbruch enthalten");
    const d = parseDatum(cell(r, "datum"), date1904);
    if (!d.ok) probleme.push(d.msg);
    const b = parseZeit(cell(r, "beginn"), "Beginn");
    if (!b.ok) probleme.push(b.msg);
    const e = parseZeit(cell(r, "ende"), "Ende");
    if (!e.ok) probleme.push(e.msg);
    if (b.ok && e.ok && toMin(e.hhmm) <= toMin(b.hhmm)) probleme.push(`Ende ${e.hhmm} liegt nicht nach Beginn ${b.hhmm}`);
    const sp = parseSprache(cell(r, "sprache"));
    if (sp === undefined) probleme.push(`Sprache „${str(cell(r, "sprache")).trim()}“ unbekannt (erlaubt: DE, EN)`);
    let personen = 1;
    const pRaw = str(cell(r, "personen")).trim();
    if (pRaw) {
      if (/^\d+$/.test(pRaw) && +pRaw >= 1) personen = +pRaw;
      else { personen = NaN; probleme.push(`Personen „${pRaw}“ ist keine ganze Zahl ≥ 1`); }
    }
    const fixRaw = str(cell(r, "fix")).trim();
    const fix = [];
    if (fixRaw) {
      for (const part of fixRaw.split(",").map((x) => x.trim()).filter(Boolean)) {
        const n = findTeamName(team, part);
        if (!n) probleme.push(`Fix-Name „${part}“ steht nicht in der Teamliste`);
        else if (fix.includes(n)) probleme.push(`Fix-Name „${part}“ doppelt`);
        else fix.push(n);
      }
      if (Number.isFinite(personen) && fixRaw.split(",").filter((x) => x.trim()).length > personen) probleme.push(`Mehr Fix-Namen als Personen (${personen})`);
    }
    const kurztitel = str(cell(r, "kurztitel")).trim();
    if (/\n/.test(kurztitel)) probleme.push("Kurztitel darf keinen Zeilenumbruch enthalten");
    const beschreibung = str(cell(r, "beschreibung")).replace(/\r\n?/g, "\n").replace(/^\n+|\s+$/g, "");
    if (d.ok && ((von && d.iso < von) || (bis && d.iso > bis))) hinweise.push("liegt außerhalb des Rundenzeitraums");
    if (d.ok && b.ok && ort) {
      const k = `${nameKey(ort)}|${d.iso}|${b.hhmm}`;
      if (schluessel.has(k)) hinweise.push(`gleicher Ort, Tag und Beginn wie ${schluessel.get(k)}`);
      else schluessel.set(k, `Zeile ${i + 1}`);
    }
    zeilen.push({
      nr: i + 1,
      daten: { ort, datum: d.iso, beginn: b.hhmm, ende: e.hhmm, sprache: sp ?? "DE", personen, fix, kurztitel, beschreibung },
      probleme,
      hinweise,
    });
  }
  if (!zeilen.length) return { fehler: "Unter der Überschriftenzeile stehen keine Führungen.", zeilen };
  return { fehler: null, zeilen };
}
