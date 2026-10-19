import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { markdownToHtml, inline } from "../app/js/markdown.js";

test("Inline: fett, kursiv, Code, Escaping", () => {
  assert.equal(inline("**fett** und *kursiv*"), "<b>fett</b> und <i>kursiv</i>");
  assert.equal(inline("`a **b**` <script>"), "<code>a **b**</code> &lt;script&gt;");
  assert.equal(inline("Koordinator:in & Team"), "Koordinator:in &amp; Team");
});

test("Inline: Links nur http(s) und relativ", () => {
  assert.equal(inline("[GitHub](https://github.com/x)"), '<a href="https://github.com/x" target="_blank" rel="noopener">GitHub</a>');
  assert.equal(inline("[Datei](README.md)"), '<a href="README.md">Datei</a>');
  assert.doesNotMatch(inline("[böse](javascript:alert(1))"), /href/);
});

test("Blöcke: Überschriften verschoben, Trennlinie, Absatz über mehrere Zeilen", () => {
  assert.equal(markdownToHtml("# Titel\n\nZeile 1\nZeile 2\n\n---", { ebene: 2 }), "<h2>Titel</h2>\n<p>Zeile 1 Zeile 2</p>\n<hr>");
});

test("Listen: nummeriert mit verschachtelter Aufzählung", () => {
  const html = markdownToHtml("1. Eins\n   - Unterpunkt\n2. Zwei\n\n- A\n- B").replace(/\n/g, "");
  assert.equal(html, "<ol><li>Eins<ul><li>Unterpunkt</li></ul></li><li>Zwei</li></ol><ul><li>A</li><li>B</li></ul>");
});

test("Tabelle mit Kopfzeile", () => {
  const html = markdownToHtml("| A | B |\n|---|---|\n| **1** | 2 |");
  assert.equal(html, "<table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td><b>1</b></td><td>2</td></tr></tbody></table>");
});

test("Die echte Anleitung wird vollständig umgesetzt", () => {
  const md = readFileSync(new URL("../app/ANLEITUNG.md", import.meta.url), "utf8");
  const html = markdownToHtml(md, { ebene: 2 });
  assert.match(html, /^<h2>Führungsvergabe – Kurzanleitung<\/h2>/);
  assert.match(html, /<h3>Für den:die Koordinator:in \(am Laptop\)<\/h3>/);
  assert.equal((html.match(/<tr>/g) ?? []).length, 7, "Kopf + 6 Schritte");
  assert.equal((html.match(/<ol>/g) ?? []).length, (html.match(/<\/ol>/g) ?? []).length);
  assert.equal((html.match(/<ul>/g) ?? []).length, (html.match(/<\/ul>/g) ?? []).length);
  assert.equal((html.match(/<li>/g) ?? []).length, (html.match(/<\/li>/g) ?? []).length);
  assert.doesNotMatch(html, /\*\*|^\s*[-|#]/m, "keine Markdown-Reste");
});
