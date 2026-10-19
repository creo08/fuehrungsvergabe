import { test } from "node:test";
import assert from "node:assert/strict";
import { newRound, addTour, nameKey } from "../app/js/model.js";
import { encodeRound, encodePlan, encodeAnswer, decode, findCodes, linkFor, messageRound, messageAnswer, messagePlan, VERSION } from "../app/js/codec.js";

function beispiel() {
  const r = newRound({ team: ["Anna Huber", "Ben Gruber", "Clara Weiß"], langs: { [nameKey("Anna Huber")]: ["DE", "EN"], [nameKey("Ben Gruber")]: ["DE"] } });
  r.von = "2026-11-01"; r.bis = "2026-12-12"; r.frist = "2026-10-25";
  addTour(r, { ort: "Museum", datum: "2026-11-07", beginn: "10:00", ende: "11:30", sprache: "DE", personen: 2, fix: ["Anna Huber"], kurztitel: "Volksschule Linz", beschreibung: "Zeile 1\nZeile 2; mit, Zeichen \\ und 😀" });
  addTour(r, { ort: "Dom", datum: "2026-10-30", beginn: "14:00", ende: "15:00", sprache: "EN", personen: 1, kurztitel: "", beschreibung: "" });
  return r;
}

test("Runde: Hin- und Rückweg ohne Langtext", () => {
  const r = beispiel();
  const code = encodeRound(r);
  assert.match(code, new RegExp(`^R${VERSION}\\.[A-Za-z0-9+\\-$]+$`));
  const { type, data } = decode(code);
  assert.equal(type, "R");
  assert.equal(data.id, r.id);
  assert.equal(data.rev, r.rev);
  assert.deepEqual([data.von, data.bis, data.frist], [r.von, r.bis, r.frist]);
  assert.deepEqual(data.team, r.team);
  assert.deepEqual(data.langs, { [nameKey("Anna Huber")]: ["DE", "EN"], [nameKey("Ben Gruber")]: ["DE"] });
  assert.equal(data.langtext, false);
  assert.deepEqual(data.tours.map(({ beschreibung, ...t }) => t), r.tours.map(({ beschreibung, ...t }) => t));
  assert.ok(data.tours.every((t) => t.beschreibung === ""));
  assert.equal(data.tours[1].datum, "2026-10-30", "Datum vor Rundenbeginn bleibt erhalten");
});

test("Runde: mit Langtext (Unicode, Sonderzeichen, Umbrüche)", () => {
  const r = beispiel();
  const { data } = decode(encodeRound(r, { langtext: true }));
  assert.equal(data.langtext, true);
  assert.deepEqual(data.tours, r.tours);
});

test("Antwort: Hin- und Rückweg", () => {
  const ans = { rid: "abc12345", rev: 3, ts: 1793000000123, name: "Clara Weiß", langs: ["EN"], min: 1, max: 4, can: ["1", "a", "b2"] };
  const { type, data } = decode(encodeAnswer(ans));
  assert.equal(type, "A");
  assert.deepEqual(data, ans);
});

test("Plan: Hin- und Rückweg mit offenen Plätzen", () => {
  const r = beispiel();
  const [t1, t2] = r.tours.map((t) => t.id);
  const a = { [t1]: ["Anna Huber", null], [t2]: ["Clara Weiß"] };
  const { type, data } = decode(encodePlan(r, a, { langtext: true }));
  assert.equal(type, "P");
  assert.deepEqual(data.a, a);
  assert.equal(data.round.tours[0].beschreibung, r.tours[0].beschreibung);
});

test("Codes werden in beliebigem Text gefunden – auch mehrere und doppelte", () => {
  const r = beispiel();
  const url = linkFor("https://beispiel.github.io/fuehrungsvergabe/", encodeRound(r));
  const a1 = encodeAnswer({ rid: r.id, rev: 1, ts: 1, name: "Anna Huber", langs: ["DE"], min: 0, max: 1, can: [] });
  const a2 = encodeAnswer({ rid: r.id, rev: 1, ts: 2, name: "Ben Gruber", langs: ["DE"], min: 0, max: 1, can: [] });
  const chat = `[15.10., 10:01] Anna: ${messageAnswer({ name: "Anna" }, linkFor("https://x/", a1))}\n[15.10., 10:02] Ben: Hallo!\n${messageAnswer({ name: "Ben" }, linkFor("https://x/", a2))}\nnochmal: #${a1}`;
  const found = findCodes(chat);
  assert.deepEqual(found.map((f) => [f.type, f.data.name]), [["A", "Anna Huber"], ["A", "Ben Gruber"]]);
  const msg = messageRound(r, url);
  assert.match(msg, /bis 25\.10\./);
  assert.equal(findCodes(msg)[0].data.id, r.id);
  assert.equal(findCodes(messagePlan(r, linkFor("https://x/", encodePlan(r, {}))))[0].type, "P");
  assert.equal(findCodes(encodeRound(r))[0].type, "R", "Code ohne Link wird auch erkannt");
});

test("beschädigte oder fremde Codes liefern verständliche Fehler", () => {
  const code = encodeRound(beispiel());
  const kaputt = code.slice(0, 40);
  assert.ok(findCodes(`#${kaputt}`)[0].error);
  assert.throws(() => decode("X1.abc"), /kein Code/);
  assert.throws(() => decode(`R9.${code.slice(3)}`), /Version 9/);
  assert.deepEqual(findCodes("Termin R1.5 um 10 Uhr"), []);
});

test("Alphabet enthält keine WhatsApp-Formatzeichen", () => {
  const r = beispiel();
  for (const c of [encodeRound(r, { langtext: true }), encodePlan(r, {}), encodeAnswer({ rid: "x", rev: 1, ts: 1, name: "A_*~`", langs: [], min: 0, max: 0, can: [] })]) {
    assert.doesNotMatch(c, /[*_~`\s]/);
  }
});
