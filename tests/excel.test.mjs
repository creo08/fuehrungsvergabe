import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { zipSync, strToU8 } from "../app/vendor/fflate.mjs";
import { parseTSV, readXlsx, pruefeZeilen, parseDatum, parseZeit, serialToIso } from "../app/js/excel.js";

const TEAM = ["Anna Huber", "Ben Gruber", "Clara"];
const HEAD = "Ort\tDatum\tBeginn\tEnde\tSprache\tPersonen\tFix\tKurztitel\tBeschreibung";

test("TSV: einfache Zeilen, CRLF und LF", () => {
  assert.deepEqual(parseTSV("a\tb\r\nc\td\r\n"), [["a", "b"], ["c", "d"]]);
  assert.deepEqual(parseTSV("a\tb\nc\td"), [["a", "b"], ["c", "d"]]);
});

test("TSV: mehrzeilige Zelle in Anführungszeichen mit verdoppelten Anführungszeichen", () => {
  const text = 'Museum\t"Zeile 1\nZeile 2 mit ""Zitat"""\tx\r\nDom\t\t\r\n';
  assert.deepEqual(parseTSV(text), [["Museum", 'Zeile 1\nZeile 2 mit "Zitat"', "x"], ["Dom", "", ""]]);
});

test("TSV: Tab innerhalb einer Zelle in Anführungszeichen, CRLF in Zelle wird zu LF", () => {
  assert.deepEqual(parseTSV('"a\tb"\t"c\r\nd"\n'), [["a\tb", "c\nd"]]);
});

test("TSV: Anführungszeichen mitten im Text bleibt erhalten", () => {
  assert.deepEqual(parseTSV('Sag "Hallo"\tx'), [['Sag "Hallo"', "x"]]);
});

test("Datum: Seriennummer 1900- und 1904-System, Text, Fehler", () => {
  assert.equal(serialToIso(46333), "2026-11-07");
  assert.equal(serialToIso(44871, true), "2026-11-07");
  assert.equal(parseDatum(46333).iso, "2026-11-07");
  assert.equal(parseDatum("7.11.2026").iso, "2026-11-07");
  assert.equal(parseDatum("07.11.2026").iso, "2026-11-07");
  assert.equal(parseDatum("2026-11-07").iso, "2026-11-07");
  assert.equal(parseDatum("46333").iso, "2026-11-07");
  assert.equal(parseDatum("31.02.2026").ok, false);
  assert.equal(parseDatum("Sa., 7. Nov. 2026").ok, false);
  assert.equal(parseDatum("07.11.26").ok, false, "zweistelliges Jahr wird nicht geraten");
  assert.equal(parseDatum(46333.5).ok, false, "Datum mit Uhrzeit");
});

test("Zeit: Bruchteil, Text, Rundung auf Minuten, Fehler", () => {
  assert.equal(parseZeit(0.4166666666666667, "Beginn").hhmm, "10:00");
  assert.equal(parseZeit(0.47916666666, "Beginn").hhmm, "11:30");
  assert.equal(parseZeit("9:05", "Beginn").hhmm, "09:05");
  assert.equal(parseZeit("10:00:00", "Beginn").hhmm, "10:00");
  assert.equal(parseZeit("10:00:30", "Beginn").ok, false);
  assert.equal(parseZeit("10.00", "Beginn").ok, false);
  assert.equal(parseZeit("25:00", "Beginn").ok, false);
  assert.equal(parseZeit(1.2, "Beginn").ok, false);
});

test("Zeilenprüfung: gültige Zeile mit Standardwerten und Groß-/Kleinschreibung", () => {
  const rows = parseTSV(`${HEAD}\nMuseum\t07.11.2026\t10:00\t11:30\t\t\tanna huber, BEN GRUBER\tVS Linz\t"Zeile 1\nZeile 2"`);
  const r = pruefeZeilen(rows, { team: TEAM });
  assert.equal(r.fehler, null);
  // zwei Fix-Namen, aber Personen leer = 1 → Problem
  assert.deepEqual(r.zeilen[0].probleme, ["Mehr Fix-Namen als Personen (1)"]);
  const rows2 = parseTSV(`${HEAD}\nMuseum\t07.11.2026\t10:00\t11:30\ten\t2\tanna huber, BEN GRUBER\tVS Linz\t"Zeile 1\nZeile 2"`);
  const z = pruefeZeilen(rows2, { team: TEAM }).zeilen[0];
  assert.deepEqual(z.probleme, []);
  assert.deepEqual(z.daten, { ort: "Museum", datum: "2026-11-07", beginn: "10:00", ende: "11:30", sprache: "EN", personen: 2, fix: ["Anna Huber", "Ben Gruber"], kurztitel: "VS Linz", beschreibung: "Zeile 1\nZeile 2" });
});

test("Zeilenprüfung: Spalten in beliebiger Reihenfolge, Zusatzspalten, Überschrift in anderer Schreibweise", () => {
  const rows = [["notiz", "ENDE", "beginn", "Datum", "ort"], ["x", "12:00", "11:00", "08.11.2026", "Dom"]];
  const z = pruefeZeilen(rows, { team: TEAM }).zeilen[0];
  assert.deepEqual(z.probleme, []);
  assert.equal(z.daten.sprache, "DE");
  assert.equal(z.daten.personen, 1);
});

test("Zeilenprüfung: Pflichtspalte fehlt, doppelte Spalte", () => {
  assert.match(pruefeZeilen([["Ort", "Datum", "Beginn"]]).fehler, /Ende/);
  assert.match(pruefeZeilen([["Ort", "Datum", "Beginn", "Ende", "ort"]]).fehler, /doppelt/);
});

test("Zeilenprüfung: alle Problemarten werden markiert, nichts wird korrigiert", () => {
  const rows = parseTSV([
    HEAD,
    "\tbla\t10:00\t11:00\t\t\t\t\t",
    "Museum\t07.11.2026\t11:00\t11:00\tFR\t0\t\t\t",
    "Museum\t07.11.2026\t11:00\t10:00\tDE\t1\tZoe\t\t",
    "Museum\t07.11.2026\t10:00\t11:00\tDE\t1\tAnna Huber, Clara\t\t",
    'Museum\t07.11.2026\t10:00\t11:00\tDE\t1,5\t\t"zwei\nZeilen"\t',
  ].join("\n"));
  const z = pruefeZeilen(rows, { team: TEAM }).zeilen;
  assert.ok(z[0].probleme.includes("Ort fehlt"));
  assert.ok(z[0].probleme.some((p) => /Datum „bla“/.test(p)));
  assert.ok(z[1].probleme.some((p) => /Ende 11:00 liegt nicht nach Beginn/.test(p)));
  assert.ok(z[1].probleme.some((p) => /Sprache „FR“/.test(p)));
  assert.ok(z[1].probleme.some((p) => /Personen „0“/.test(p)));
  assert.ok(z[2].probleme.some((p) => /Ende 10:00 liegt nicht nach Beginn 11:00/.test(p)));
  assert.ok(z[2].probleme.some((p) => /Fix-Name „Zoe“/.test(p)));
  assert.ok(z[3].probleme.some((p) => /Mehr Fix-Namen als Personen/.test(p)));
  assert.ok(z[4].probleme.some((p) => /Personen „1,5“/.test(p)));
  assert.ok(z[4].probleme.some((p) => /Kurztitel/.test(p)));
});

test("Zeilenprüfung: Uhrzeiten außerhalb 06–22 sind kein Problem", () => {
  const z = pruefeZeilen(parseTSV(`${HEAD}\nMuseum\t07.11.2026\t05:00\t23:30\t\t\t\t\t`), { team: TEAM }).zeilen[0];
  assert.deepEqual(z.probleme, []);
  assert.deepEqual(z.hinweise, []);
});

test("Zeilenprüfung: Hinweise für außerhalb des Zeitraums und Duplikate, leere Zeilen werden übersprungen", () => {
  const rows = parseTSV(`\n${HEAD}\nMuseum\t07.12.2026\t10:00\t11:00\t\t\t\t\t\n\t\t\t\t\t\t\t\t\nMuseum\t07.12.2026\t10:00\t11:00\t\t\t\t\t\nDom\t02.11.2026\t10:00\t11:00\t\t\t\t\t`);
  const vorhandene = [{ ort: "dom", datum: "2026-11-02", beginn: "10:00" }];
  const z = pruefeZeilen(rows, { team: TEAM, von: "2026-11-01", bis: "2026-11-30", vorhandene }).zeilen;
  assert.equal(z.length, 3);
  assert.ok(z[0].hinweise.includes("liegt außerhalb des Rundenzeitraums"));
  assert.ok(z[1].hinweise.some((h) => /wie Zeile 3/.test(h)));
  assert.ok(z[2].hinweise.some((h) => /bereits vorhandene/.test(h)));
  assert.ok(z.every((x) => x.probleme.length === 0));
});

// ---------- .xlsx ----------
function xlsx({ sheet, shared = null, date1904 = false, sheetPath = "worksheets/sheet1.xml" }) {
  const files = {
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8(`<workbook xmlns:r="r"><workbookPr${date1904 ? ' date1904="1"' : ""}/><sheets><sheet name="F" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<Relationships><Relationship Id="rId1" Type="ws" Target="${sheetPath}"/></Relationships>`),
    [`xl/${sheetPath}`]: strToU8(`<worksheet><sheetData>${sheet}</sheetData></worksheet>`),
  };
  if (shared) files["xl/sharedStrings.xml"] = strToU8(`<sst>${shared.map((s) => `<si>${s}</si>`).join("")}</sst>`);
  return zipSync(files);
}

test("xlsx: Shared Strings (auch Rich Text), Zahlen, leere Zellen, Entities, eigener Blattpfad", () => {
  const shared = ["<t>Ort</t>", "<t>Datum</t>", "<t>Beginn</t>", "<t>Ende</t>", "<t>Beschreibung</t>", "<t>Museum &amp; Dom</t>", '<r><t>Zeile 1</t></r><r><t xml:space="preserve">\nZeile 2 &quot;x&quot;</t></r>'];
  const sheet =
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c><c r="F1" t="s"><v>4</v></c></row>' +
    '<row r="3"><c r="A3" t="s"><v>5</v></c><c r="B3" s="1"><v>46333</v></c><c r="C3" s="2"><v>0.41666666666666669</v></c><c r="D3"><v>0.47916666666666669</v></c><c r="F3" t="s"><v>6</v></c></row>';
  const { rows, date1904 } = readXlsx(xlsx({ sheet, shared, sheetPath: "worksheets/blatt.xml" }));
  assert.equal(date1904, false);
  assert.deepEqual(rows[0], ["Ort", "Datum", "Beginn", "Ende", "", "Beschreibung"]);
  assert.deepEqual(rows[1], []);
  assert.equal(rows[2][5], 'Zeile 1\nZeile 2 "x"');
  const z = pruefeZeilen(rows, { date1904 }).zeilen;
  assert.equal(z.length, 1);
  assert.deepEqual(z[0].probleme, []);
  assert.equal(z[0].daten.ort, "Museum & Dom");
  assert.equal(z[0].daten.datum, "2026-11-07");
  assert.equal(z[0].daten.beginn, "10:00");
  assert.equal(z[0].daten.ende, "11:30");
});

test("xlsx: 1904-Datumssystem und Inline-Strings", () => {
  const sheet =
    '<row r="1"><c r="A1" t="inlineStr"><is><t>Ort</t></is></c><c r="B1" t="inlineStr"><is><t>Datum</t></is></c><c r="C1" t="inlineStr"><is><t>Beginn</t></is></c><c r="D1" t="inlineStr"><is><t>Ende</t></is></c></row>' +
    '<row r="2"><c r="A2" t="inlineStr"><is><t>Schloss</t></is></c><c r="B2"><v>44871</v></c><c r="C2" t="str"><v>14:00</v></c><c r="D2" t="inlineStr"><is><t>15:15</t></is></c></row>';
  const { rows, date1904 } = readXlsx(xlsx({ sheet, date1904: true }));
  assert.equal(date1904, true);
  const z = pruefeZeilen(rows, { date1904 }).zeilen[0];
  assert.deepEqual(z.probleme, []);
  assert.equal(z.daten.datum, "2026-11-07");
});

test("xlsx: mit openpyxl erzeugte Datei (Fixture) und 1904-Variante", () => {
  for (const [f, d1904] of [["t1900.xlsx", false], ["t1904.xlsx", true]]) {
    const { rows, date1904 } = readXlsx(readFileSync(new URL(`./fixtures/${f}`, import.meta.url)));
    assert.equal(date1904, d1904);
    const z = pruefeZeilen(rows, { team: ["Anna", "Ben"], date1904 }).zeilen;
    assert.equal(z[0].daten.datum, "2026-11-07");
    assert.equal(z[0].daten.beginn, "10:00");
    assert.equal(z[0].daten.beschreibung, 'Zeile 1\nZeile 2 mit "Zitat"');
    assert.deepEqual(z[0].daten.fix, ["Anna", "Ben"]);
    assert.equal(z[1].daten.datum, "2026-11-08");
    assert.equal(z[1].daten.sprache, "EN");
    assert.equal(z[2].daten.datum, "2026-03-29");
    assert.equal(z[2].daten.beginn, "01:00");
  }
});

test("xlsx: Vorlage aus dem Repo wird erkannt, Beispielzeilen sind Problemzeilen", () => {
  const { rows } = readXlsx(readFileSync(new URL("../app/vorlage-fuehrungen.xlsx", import.meta.url)));
  const r = pruefeZeilen(rows, { team: ["Anna"] });
  assert.equal(r.fehler, null);
  assert.equal(r.zeilen.length, 2);
  for (const z of r.zeilen) assert.ok(z.probleme.some((p) => /Beispielzeile/.test(p)));
  assert.equal(r.zeilen[0].daten.datum, "2026-11-07");
  assert.equal(r.zeilen[0].daten.beschreibung, "Volksschule Linz, 24 Kinder\nTreffpunkt Haupteingang, 15 Min vorher");
});

test("xlsx: keine Zip-Datei", () => {
  assert.throws(() => readXlsx(new Uint8Array([1, 2, 3])), /keine gültige \.xlsx/);
});
