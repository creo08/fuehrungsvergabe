// Kleiner Markdown-Renderer für die Anleitung (ohne DOM). Kann genau das, was ANLEITUNG.md
// braucht: Überschriften, Absätze, Trennlinien, verschachtelte Listen, Tabellen,
// **fett**, *kursiv*, `Code` und Links. Alles wird escaped, rohes HTML gibt es nicht.
import { esc } from "./ui-common.js";

/** Inline-Formatierung einer Zeile (Text wird zuerst escaped). */
export function inline(text) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s
    // Links nur zu http(s), Ankern und relativen Pfaden (kein javascript: o. Ä.)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, url) =>
      /^https?:\/\//.test(url) ? `<a href="${url}" target="_blank" rel="noopener">${t}</a>`
        : url.includes(":") ? t
        : `<a href="${url}">${t}</a>`)
    .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<i>$2</i>");
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[+i]}</code>`);
}

const zellen = (zeile) => zeile.trim().replace(/^\||\|$/g, "").split("|").map((z) => z.trim());

/** Markdown → HTML. `ebene` verschiebt Überschriften: # wird zu h{ebene}, ## zu h{ebene+1} usw. */
export function markdownToHtml(md, { ebene = 1 } = {}) {
  const zeilen = md.replace(/\r\n?/g, "\n").split("\n");
  const out = [];
  let absatz = [];
  const listen = []; // offene Listen: { tiefe, tag }

  const absatzZu = () => {
    if (absatz.length) out.push(`<p>${inline(absatz.join(" "))}</p>`);
    absatz = [];
  };
  const listenZu = (bis = -1) => {
    while (listen.length && listen.at(-1).tiefe > bis) out.push(`</li></${listen.pop().tag}>`);
  };

  for (let i = 0; i < zeilen.length; i++) {
    const z = zeilen[i];
    const punkt = z.match(/^(\s*)([-*]|\d+\.)\s+(.*)$/);
    if (!z.trim()) {
      absatzZu();
      continue;
    }
    if (punkt) {
      absatzZu();
      const tiefe = punkt[1].length;
      const tag = /\d/.test(punkt[2]) ? "ol" : "ul";
      listenZu(tiefe);
      const oben = listen.at(-1);
      if (oben && oben.tiefe === tiefe && oben.tag !== tag) listenZu(tiefe - 1);
      if (listen.at(-1)?.tiefe === tiefe) out.push("</li><li>");
      else {
        out.push(`<${tag}><li>`);
        listen.push({ tiefe, tag });
      }
      out.push(inline(punkt[3]));
      continue;
    }
    if (listen.length && /^\s+\S/.test(z)) {
      out.push(` ${inline(z.trim())}`);
      continue;
    }
    listenZu();
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(z)) {
      absatzZu();
      out.push("<hr>");
    } else if (/^#{1,6}\s/.test(z)) {
      absatzZu();
      const [, rauten, text] = z.match(/^(#+)\s+(.*)$/);
      const h = Math.min(6, rauten.length + ebene - 1);
      out.push(`<h${h}>${inline(text)}</h${h}>`);
    } else if (z.trim().startsWith("|") && /^\s*\|?\s*:?-{3,}/.test(zeilen[i + 1] ?? "")) {
      absatzZu();
      const kopf = zellen(z);
      const rows = [];
      i += 2;
      while (i < zeilen.length && zeilen[i].trim().startsWith("|")) rows.push(zellen(zeilen[i++]));
      i--;
      out.push(`<table><thead><tr>${kopf.map((c) => `<th>${inline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`).join("")}</tbody></table>`);
    } else absatz.push(z.trim());
  }
  absatzZu();
  listenZu();
  return out.join("\n");
}
