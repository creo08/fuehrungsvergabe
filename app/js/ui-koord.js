// Koordinationsansicht (für den Laptop gestaltet): Runde anlegen, Führungen eintragen oder
// importieren, Link 1 verschicken, Rückmeldungen sammeln, einteilen, korrigieren, verschicken.
import { esc, toast, saveFile, pickFile, relTage, messageBox, baseUrl, anleitungZeigen, REPO_URL, FEEDBACK_URL } from "./ui-common.js";
import { actions as personActions } from "./ui-person.js";
import {
  newRound, newRoundFrom, addTour, updateTour, nameKey, findTeamName, sortNames, sortTours, fmtDatum, fmtDatumKurz,
  validDate, validTime, toMin, durationMin, canValid, teamAnswers, unknownAnswers, overlaps, effectiveMax, normalizePlan, emptyPlan, SPRACHEN,
} from "./model.js";
import { encodeRound, encodePlan, linkFor, messageRound, messagePlan } from "./codec.js";
import { parseTSV, readXlsx, pruefeZeilen } from "./excel.js";
import { solveRound, analyse, loadHighs } from "./solver.js";
import { icsGesamt } from "./ical.js";
import { backupJson, backupFilename, parseBackup } from "./store.js";
import { demoRound } from "./demo.js";

const TABS = [
  ["runde", "Runde & Team"],
  ["fuehrungen", "Führungen"],
  ["link1", "Link 1 verschicken"],
  ["antworten", "Rückmeldungen"],
  ["einteilung", "Einteilung"],
  ["versand", "Plan & Kalender"],
];

const cur = (app) => app.state.rounds[app.view.rid ?? app.state.currentRoundId] ?? null;
const rundenName = (r) => `${r.demo ? "DEMO · " : ""}${r.von && r.bis ? `Runde ${fmtDatum(r.von)} – ${fmtDatum(r.bis)}` : "Neue Runde (Zeitraum fehlt)"}`;
const sprachTag = (l) => `<span class="tag ${l === "EN" ? "en" : ""}">${l}</span>`;

let persistGefragt = false;

export function render(app) {
  if (!persistGefragt) {
    persistGefragt = true;
    app.requestPersist();
  }
  const r = cur(app);
  if (r) {
    app.view.rid = r.id;
    if (r.plan) r.plan.a = normalizePlan(r, r.plan.a);
  }
  const runden = Object.values(app.state.rounds).sort((a, b) => (b.von || b.createdAt).localeCompare(a.von || a.createdAt));
  const sicherungAlt = !app.state.lastBackupAt || Date.now() - new Date(app.state.lastBackupAt).getTime() > 7 * 864e5;
  const leiste = `<div class="leiste">
    ${runden.length ? `<label class="runde-wahl"><select data-change="k-runde-waehlen" aria-label="Runde wählen">${runden.map((x) => `<option value="${esc(x.id)}" ${r && x.id === r.id ? "selected" : ""}>${esc(rundenName(x))}</option>`).join("")}</select></label>` : ""}
    <button class="btn small ghost" data-action="k-neu">Neue Runde</button>
    ${runden.length ? `<button class="btn small ghost" data-action="k-neu-aus-letzter" title="Übernimmt Team und Sprachen, keine Führungen, Antworten oder Pläne">Neue Runde aus letzter</button>` : ""}
    <span class="abstand"></span>
    <span class="sicherung ${sicherungAlt ? "alt" : ""}" title="Sicherung = kompletter Stand als Datei, z. B. für Gerätewechsel">Letzte Sicherung: ${esc(relTage(app.state.lastBackupAt))}</span>
    <button class="btn small ghost" data-action="k-sichern">Sicherung speichern</button>
    <button class="btn small ghost" data-action="k-oeffnen">Sicherung öffnen</button>
    <details class="mehr"><summary>Mehr</summary><div class="mehr-menue">
      <button class="link" data-action="k-demo">Demo-Runde anlegen</button>
      ${r ? `<button class="link gefahr" data-action="k-loeschen">Diese Runde löschen</button>` : ""}
      <button class="link" data-action="zu-person">Zur Personen-Ansicht</button>
      <hr>
      <a class="link" href="${FEEDBACK_URL}" target="_blank" rel="noopener" title="Öffentlich auf GitHub, Konto nötig – bitte keine Namen aus dem Team">Feedback geben ↗</a>
      <a class="link" href="${REPO_URL}" target="_blank" rel="noopener">Projekt auf GitHub ↗</a>
    </div></details>
  </div>`;
  if (!r) {
    return `<div class="koord">${leiste}<section class="karte willkommen">
      <h2>Willkommen</h2>
      <p>Lege eine neue Runde an oder öffne eine Sicherung (z. B. von dem:der bisherigen Koordinator:in). Zum Ausprobieren gibt es eine Demo-Runde mit Beispieldaten.</p>
      <div class="knoepfe"><button class="btn" data-action="k-neu">Neue Runde anlegen</button><button class="btn ghost" data-action="k-oeffnen">Sicherung öffnen</button><button class="btn ghost" data-action="k-demo">Demo-Runde anlegen</button></div>
    </section></div>`;
  }
  const tab = app.view.tab ?? "runde";
  const ans = teamAnswers(r);
  const info = { fuehrungen: `(${r.tours.length})`, antworten: `(${Object.keys(ans).length}/${r.team.length})` };
  const nav = `<nav class="tabs" role="tablist">${TABS.map(([k, l], i) => `<button role="tab" data-action="k-tab" data-tab="${k}" aria-selected="${tab === k}"><span class="schritt">${i + 1}.</span> ${esc(l)} ${info[k] ?? ""}</button>`).join("")}</nav>`;
  const inhalt = { runde: tabRunde, fuehrungen: tabFuehrungen, link1: tabLink1, antworten: tabAntworten, einteilung: tabEinteilung, versand: tabVersand }[tab](app, r);
  return `<div class="koord">${leiste}${r.demo ? '<p class="demo-band">DEMO-Runde mit Beispieldaten – kann unter „Mehr“ gelöscht werden.</p>' : ""}${nav}${inhalt}</div>`;
}

// ---------- 1 Runde & Team ----------
function tabRunde(app, r) {
  const ans = teamAnswers(r);
  return `<section class="karte">
    <h2>Zeitraum</h2>
    <div class="reihe">
      <div class="feld"><label for="von">Von</label><input type="date" id="von" value="${esc(r.von)}" data-change="k-feld" data-k="von"></div>
      <div class="feld"><label for="bis">Bis</label><input type="date" id="bis" value="${esc(r.bis)}" data-change="k-feld" data-k="bis"></div>
      <div class="feld"><label for="frist">Rückmeldung bis</label><input type="date" id="frist" value="${esc(r.frist)}" data-change="k-feld" data-k="frist"></div>
    </div>
  </section>
  <section class="karte">
    <h2>Team (${r.team.length})</h2>
    <p class="sub">Die Sprachen werden in Link 1 als Vorschlag mitgeschickt; jede Person kann sie ändern. Sie werden aus der letzten Rückmeldung übernommen.</p>
    <table class="tabelle"><thead><tr><th>Name</th><th>Sprachen</th><th>Rückmeldung</th><th></th></tr></thead><tbody>
      ${sortNames(r.team).map((n) => {
        const l = r.langs[nameKey(n)] ?? [];
        return `<tr><td>${esc(n)}</td>
          <td>${SPRACHEN.map((s) => `<button class="chip klein" data-action="k-team-sprache" data-name="${esc(n)}" data-l="${s}" aria-pressed="${l.includes(s)}">${s}</button>`).join(" ")}</td>
          <td>${ans[n] ? `✓ ${esc(new Date(ans[n].ts).toLocaleDateString("de-AT"))}` : '<span class="gedimmt">–</span>'}</td>
          <td class="rechts"><button class="iconbtn" data-action="k-team-weg" data-name="${esc(n)}" aria-label="${esc(n)} entfernen" title="Entfernen">✕</button></td></tr>`;
      }).join("") || '<tr><td colspan="4" class="gedimmt">Noch niemand im Team.</td></tr>'}
    </tbody></table>
    <div class="reihe">
      <div class="feld breit"><label for="neuer-name">Name hinzufügen</label><input id="neuer-name" data-enter="k-team-add" placeholder="Vorname Nachname"></div>
      <button class="btn" data-action="k-team-add">Hinzufügen</button>
    </div>
    <details><summary>Mehrere Namen auf einmal einfügen</summary>
      <textarea id="namen-liste" rows="5" placeholder="Ein Name pro Zeile"></textarea>
      <button class="btn ghost" data-action="k-team-liste">Alle hinzufügen</button>
    </details>
  </section>`;
}

// ---------- 2 Führungen ----------
function tabFuehrungen(app, r) {
  const form = app.tmp.form ? tourForm(app, r) : "";
  const imp = app.tmp.import ? importVorschau(app, r) : "";
  const paste = app.tmp.paste ? `<section class="karte">
      <h2>Aus Excel einfügen</h2>
      <p class="sub">In Excel die Zellen <b>inklusive Überschriftenzeile</b> markieren, kopieren und hier einfügen.</p>
      <textarea id="paste-excel" rows="8" placeholder="Ort&#9;Datum&#9;Beginn&#9;Ende …"></textarea>
      <div class="knoepfe"><button class="btn" data-action="k-paste-pruefen">Prüfen</button><button class="btn ghost" data-action="k-paste-zu">Abbrechen</button></div>
    </section>` : "";
  const rows = sortTours(r.tours).map((t) => `<tr>
      <td class="nowrap">${esc(fmtDatumKurz(t.datum))}${t.datum.slice(0, 4)}</td><td class="nowrap">${esc(t.beginn)}–${esc(t.ende)}</td>
      <td>${esc(t.ort)}</td><td>${esc(t.kurztitel)}</td><td>${sprachTag(t.sprache)}</td><td class="zahl">${t.personen}</td>
      <td>${t.fix.map((f) => `<span class="tag fix">${esc(f)}</span>`).join(" ")}</td>
      <td class="beschreibung" title="${esc(t.beschreibung)}">${esc(t.beschreibung.split("\n")[0])}${t.beschreibung.includes("\n") ? " …" : ""}</td>
      <td class="rechts nowrap"><button class="iconbtn" data-action="k-tour-edit" data-id="${esc(t.id)}" title="Bearbeiten" aria-label="Bearbeiten">✎</button><button class="iconbtn" data-action="k-tour-weg" data-id="${esc(t.id)}" title="Löschen" aria-label="Löschen">✕</button></td>
    </tr>`).join("");
  const aussen = r.von && r.bis ? r.tours.filter((t) => t.datum < r.von || t.datum > r.bis).length : 0;
  return `${form}${paste}${imp}<section class="karte">
    <div class="kopfzeile"><h2>Führungen (${r.tours.length})</h2>
      <div class="knoepfe">
        <button class="btn" data-action="k-tour-neu">+ Führung</button>
        <button class="btn ghost" data-action="k-xlsx">Excel-Datei laden</button>
        <button class="btn ghost" data-action="k-paste-auf">Aus Excel einfügen</button>
        <a class="btn ghost" href="vorlage-fuehrungen.xlsx" download>Vorlage herunterladen</a>
      </div></div>
    ${aussen ? `<ul class="hinweise"><li>${aussen} ${aussen === 1 ? "Führung liegt" : "Führungen liegen"} außerhalb des Rundenzeitraums.</li></ul>` : ""}
    <div class="tabelle-scroll"><table class="tabelle"><thead><tr><th>Datum</th><th>Zeit</th><th>Ort</th><th>Kurztitel</th><th>Sprache</th><th>Pers.</th><th>Fix</th><th>Beschreibung</th><th></th></tr></thead>
    <tbody>${rows || '<tr><td colspan="9" class="gedimmt">Noch keine Führungen. Einzeln anlegen oder aus Excel übernehmen.</td></tr>'}</tbody></table></div>
  </section>`;
}

function tourForm(app, r) {
  const f = app.tmp.form;
  const orte = [...new Set(r.tours.map((t) => t.ort))].sort();
  const fehler = app.tmp.formFehler ?? [];
  return `<section class="karte formular" id="tour-form">
    <h2>${f.id ? "Führung bearbeiten" : "Neue Führung"}</h2>
    <div class="reihe">
      <div class="feld"><label for="f-ort">Ort</label><input id="f-ort" name="ort" list="orte" value="${esc(f.ort)}" required><datalist id="orte">${orte.map((o) => `<option value="${esc(o)}">`).join("")}</datalist></div>
      <div class="feld"><label for="f-datum">Datum</label><input type="date" id="f-datum" name="datum" value="${esc(f.datum)}" required></div>
      <div class="feld schmal"><label for="f-beginn">Beginn</label><input type="time" id="f-beginn" name="beginn" value="${esc(f.beginn)}" required></div>
      <div class="feld schmal"><label for="f-ende">Ende</label><input type="time" id="f-ende" name="ende" value="${esc(f.ende)}" required></div>
      <div class="feld schmal"><label for="f-sprache">Sprache</label><select id="f-sprache" name="sprache">${SPRACHEN.map((s) => `<option ${s === f.sprache ? "selected" : ""}>${s}</option>`).join("")}</select></div>
      <div class="feld schmal"><label for="f-personen">Personen</label><input type="number" min="1" step="1" id="f-personen" name="personen" value="${esc(f.personen)}"></div>
    </div>
    <div class="feld"><span class="lbl">Fix eingeteilt (zählt zu den Personen)</span>
      <div class="chips">${sortNames(r.team).map((n) => `<label class="chip"><input type="checkbox" name="fix" value="${esc(n)}" ${f.fix.includes(n) ? "checked" : ""}> ${esc(n)}</label>`).join("") || '<span class="gedimmt">Erst Team anlegen.</span>'}</div></div>
    <div class="feld"><label for="f-kurz">Kurztitel (eine Zeile)</label><input id="f-kurz" name="kurztitel" value="${esc(f.kurztitel)}" placeholder="z. B. Volksschule Linz"></div>
    <div class="feld"><label for="f-beschr">Beschreibung (Langtext)</label><textarea id="f-beschr" name="beschreibung" rows="4">${esc(f.beschreibung)}</textarea></div>
    ${fehler.length ? `<ul class="hinweise fehler">${fehler.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    <div class="knoepfe"><button class="btn" data-action="k-tour-speichern">Speichern</button><button class="btn ghost" data-action="k-tour-abbrechen">Abbrechen</button></div>
  </section>`;
}

function importVorschau(app, r) {
  const { fehler, zeilen, quelle } = app.tmp.import;
  if (fehler) return `<section class="karte"><h2>Import: ${esc(quelle)}</h2><ul class="hinweise fehler"><li>${esc(fehler)}</li></ul><button class="btn ghost" data-action="k-import-zu">Schließen</button></section>`;
  const ok = zeilen.filter((z) => !z.probleme.length);
  const bad = zeilen.length - ok.length;
  return `<section class="karte">
    <h2>Import-Vorschau: ${esc(quelle)}</h2>
    <p class="sub">${zeilen.length} Zeilen gelesen: <b>${ok.length} fehlerfrei</b>${bad ? `, <b class="warnfarbe">${bad} mit Problemen</b> (werden nicht übernommen – bitte in Excel korrigieren und erneut importieren)` : ""}.</p>
    <div class="tabelle-scroll"><table class="tabelle"><thead><tr><th>Zeile</th><th></th><th>Datum</th><th>Zeit</th><th>Ort</th><th>Kurztitel</th><th>Sprache</th><th>Pers.</th><th>Fix</th><th>Probleme / Hinweise</th></tr></thead><tbody>
    ${zeilen.map((z) => {
      const d = z.daten;
      return `<tr class="${z.probleme.length ? "problem" : z.hinweise.length ? "hinweis" : ""}">
        <td class="zahl">${z.nr}</td><td>${z.probleme.length ? "✕" : z.hinweise.length ? "!" : "✓"}</td>
        <td class="nowrap">${d.datum ? esc(fmtDatum(d.datum)) : "–"}</td><td class="nowrap">${esc(d.beginn ?? "–")}–${esc(d.ende ?? "–")}</td>
        <td>${esc(d.ort)}</td><td>${esc(d.kurztitel)}</td><td>${esc(d.sprache)}</td><td class="zahl">${Number.isFinite(d.personen) ? d.personen : "–"}</td><td>${esc(d.fix.join(", "))}</td>
        <td>${[...z.probleme.map((p) => `<span class="warnfarbe">${esc(p)}</span>`), ...z.hinweise.map((h) => esc(h))].join("<br>")}</td></tr>`;
    }).join("")}</tbody></table></div>
    <div class="knoepfe"><button class="btn" data-action="k-import-ok" ${ok.length ? "" : "disabled"}>${ok.length} fehlerfreie ${ok.length === 1 ? "Zeile" : "Zeilen"} übernehmen</button><button class="btn ghost" data-action="k-import-zu">Verwerfen</button></div>
  </section>`;
}

// ---------- 3 Link 1 ----------
function tabLink1(app, r) {
  const warn = [];
  if (!r.team.length) warn.push("Das Team ist leer.");
  if (!r.tours.length) warn.push("Es gibt noch keine Führungen.");
  if (!r.von || !r.bis) warn.push("Der Zeitraum fehlt.");
  if (!r.frist) warn.push("Die Rückmeldefrist fehlt.");
  if (r.sentRev > 0 && r.rev > r.sentRev) warn.push("Seit dem letzten Versand wurden Führungen neu angelegt oder zeitlich geändert. Bitte Link 1 erneut verschicken – ältere Rückmeldungen gelten für diese Führungen als „nicht gemeldet“.");
  const code = encodeRound(r, { langtext: r.langtext.r });
  const url = linkFor(baseUrl(), code);
  return `<section class="karte">
    <h2>Link 1 an alle verschicken</h2>
    <p class="sub">Die Nachricht enthält alle Führungen (ohne Min/Max anderer). Jede Person tippt den Link an oder kopiert die ganze Nachricht in die App.</p>
    ${warn.length ? `<ul class="hinweise">${warn.map((w) => `<li>${esc(w)}</li>`).join("")}</ul>` : ""}
    <label class="schalter"><input type="checkbox" data-change="k-langtext" data-k="r" ${r.langtext.r ? "checked" : ""}> Langtext (Beschreibung) mitschicken</label>
    ${messageBox("Link 1 – an alle (WhatsApp-Gruppe)", messageRound(r, url), { id: "link1", hinweis: `Stand ${r.rev}${r.sentRev ? ` · zuletzt verschickt: Stand ${r.sentRev}` : " · noch nicht verschickt"}. Lange Links (über ca. 3.000 Zeichen) sind in WhatsApp evtl. nicht antippbar – Kopieren und Einfügen funktioniert immer.` })}
    <p><a href="${esc(url)}" target="_blank" rel="noopener">Vorschau: so sieht es eine Person</a></p>
  </section>`;
}

// ---------- 4 Rückmeldungen ----------
function tabAntworten(app, r) {
  const ans = teamAnswers(r);
  const unbekannt = unknownAnswers(r);
  const erg = app.tmp.einfuegeErgebnis;
  return `<section class="karte">
    <h2>Rückmeldungen einfügen</h2>
    <p class="sub">Am schnellsten: Den Link in WhatsApp Web bzw. am Laptop anklicken – öffnet er sich im selben Browser wie diese App, wird die Antwort automatisch übernommen. Sonst die Nachricht(en) kopieren und hier einfügen, auch mehrere auf einmal.</p>
    <textarea id="antworten-text" rows="4" placeholder="Nachrichten hier einfügen"></textarea>
    <div class="knoepfe"><button class="btn" data-action="k-antworten-einfuegen">Übernehmen</button></div>
    ${erg ? `<ul class="hinweise">${erg.map((m) => `<li class="${m.art === "ok" ? "gut" : m.art === "fehler" ? "fehler" : ""}">${esc(m.text)}</li>`).join("")}</ul>` : ""}
  </section>
  <section class="karte">
    <h2>Stand (${Object.keys(ans).length} von ${r.team.length})</h2>
    <div class="tabelle-scroll"><table class="tabelle"><thead><tr><th>Name</th><th>Antwort vom</th><th>Sprachen</th><th>Min–Max</th><th>Kann (gültig)</th><th>Seit Antwort neu/geändert</th><th></th></tr></thead><tbody>
    ${sortNames(r.team).map((n) => {
      const a = ans[n];
      if (!a) return `<tr class="gedimmt"><td>${esc(n)}</td><td colspan="6">keine Rückmeldung</td></tr>`;
      const gueltig = r.tours.filter((t) => canValid(a, t)).length;
      const veraltet = r.tours.filter((t) => (t.trev ?? 0) > a.rev && a.langs.includes(t.sprache) && !t.fix.some((f) => nameKey(f) === nameKey(n))).length;
      return `<tr><td>${esc(n)}</td><td>${esc(new Date(a.ts).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" }))}</td><td>${a.langs.map(sprachTag).join(" ")}</td>
        <td class="nowrap">${a.min}–${a.max}${effectiveMax(r, a) < a.max ? ` <span class="klein" title="Max begrenzt auf mögliche Führungen">(wirksam ${effectiveMax(r, a)})</span>` : ""}</td><td class="zahl">${gueltig}</td>
        <td>${veraltet ? `<span class="warnfarbe">${veraltet} ${veraltet === 1 ? "Führung" : "Führungen"} – gilt als nicht gemeldet</span>` : ""}</td>
        <td class="rechts"><button class="iconbtn" data-action="k-antwort-weg" data-name="${esc(n)}" title="Antwort entfernen" aria-label="Antwort entfernen">✕</button></td></tr>`;
    }).join("")}</tbody></table></div>
    <p class="klein">„Seit Antwort neu/geändert“: Führungen, die nach der Antwort dieser Person neu angelegt oder bei Datum/Beginn/Ende geändert wurden. Dafür gilt die Person als nicht gemeldet und wird nicht eingeteilt. Abhilfe: Link 1 erneut schicken, die Person antwortet neu.</p>
  </section>
  ${unbekannt.length ? `<section class="karte"><h2>Nicht im Team</h2><p class="sub">Diese Antworten werden bei der Einteilung nicht berücksichtigt.</p>
    <ul class="liste-einfach">${unbekannt.map((u) => `<li><b>${esc(u.name)}</b> <button class="btn small ghost" data-action="k-unbekannt-team" data-name="${esc(u.name)}">Ins Team übernehmen</button> <button class="btn small ghost" data-action="k-antwort-weg" data-name="${esc(u.name)}">Verwerfen</button></li>`).join("")}</ul></section>` : ""}`;
}

// ---------- 5 Einteilung ----------
function tabEinteilung(app, r) {
  const ans = teamAnswers(r);
  const laeuft = app.tmp.laeuft;
  const kopf = `<section class="karte">
    <div class="kopfzeile"><h2>Einteilung</h2>
      <div class="knoepfe"><button class="btn" data-action="k-einteilen" ${laeuft || !r.tours.length ? "disabled" : ""}>${laeuft ? "Einteilung läuft …" : r.plan ? "Neu einteilen" : "Einteilen"}</button>
      ${r.plan ? `<button class="btn ghost" data-action="k-plan-leeren">Plan leeren</button>` : `<button class="btn ghost" data-action="k-plan-haendisch">Händisch einteilen</button>`}</div></div>
    <p class="sub">Rangfolge: möglichst kein Platz offen › Min erreichen › keine direkt aufeinanderfolgenden Führungen (&lt; 30 min) › gleichmäßig nach Führungsstunden relativ zum Max. Max wird nie überschritten, Fix ist immer gesetzt.</p>
    ${r.plan?.solvedAt ? `<p class="klein">Berechnet ${esc(new Date(r.plan.solvedAt).toLocaleString("de-AT", { dateStyle: "short", timeStyle: "short" }))}${r.plan.ms != null ? ` in ${(r.plan.ms / 1000).toLocaleString("de-AT", { maximumFractionDigits: 1 })} s` : ""}${r.plan.manual ? " · händisch korrigiert" : ""}</p>` : ""}
  </section>`;
  if (!r.plan) return kopf;
  const a = r.plan.a;
  const { proTour, personen, hinweise } = analyse(r, a);
  const gruppen = [
    ["offen", "Offene Plätze"], ["korrektur", "Geprüfte Korrekturen"], ["min", "Unter Min"], ["max", "Über Max"],
    ["anschluss", "Direkt aufeinander"], ["fix", "Fix-Einteilung"], ["veraltet", "Ältere Rückmeldungen"], ["antwort", "Ohne Rückmeldung"], ["unbekannt", "Nicht im Team"],
  ];
  const hinweisHtml = hinweise.length
    ? gruppen.map(([k, titel]) => {
      const hs = hinweise.filter((h) => h.art === k);
      return hs.length ? `<h3>${esc(titel)} (${hs.length})</h3><ul class="hinweise">${hs.map((h) => `<li>${esc(h.text)}</li>`).join("")}</ul>` : "";
    }).join("")
    : '<ul class="hinweise"><li class="gut">Alle Plätze besetzt, alle Min/Max eingehalten, keine Probleme.</li></ul>';

  const team = sortNames(r.team);
  const zeilen = sortTours(r.tours).map((t) => {
    const slots = a[t.id] ?? [];
    const pt = proTour[t.id];
    const andere = (n) => sortTours(r.tours).filter((o) => o.id !== t.id && (a[o.id] ?? []).some((x) => x && nameKey(x) === nameKey(n)));
    const grund = (n) => {
      const x = ans[n];
      if (!x) return "keine Rückmeldung";
      if (!x.can.includes(t.id)) return "kann nicht";
      if (!canValid(x, t)) return "geändert";
      if (!x.langs.includes(t.sprache)) return `kein ${t.sprache}`;
      if (andere(n).some((o) => overlaps(o, t))) return "Überschneidung";
      return null;
    };
    const zelle = slots.map((n, k) => {
      if (n && k < t.fix.length) return `<button class="tag fix knopf" data-action="k-tour-edit" data-id="${esc(t.id)}" data-tab="fuehrungen" title="Fix eingeteilt – klicken zum Ändern">${esc(n)} ✎</button>`;
      const belegt = new Set(slots.filter((x, j) => x && j !== k).map(nameKey));
      const frei = team.filter((m) => !belegt.has(nameKey(m)));
      const passend = frei.filter((m) => !grund(m));
      const rest = frei.filter((m) => grund(m));
      const anzahl = (m) => Object.values(a).filter((s) => s.some((x) => x && nameKey(x) === nameKey(m))).length;
      const opt = (m, warn) => `<option value="${esc(m)}" ${n && nameKey(n) === nameKey(m) ? "selected" : ""}>${esc(m)}${warn ? ` (${esc(grund(m))})` : ""} · ${anzahl(m)}${ans[m] ? `/${ans[m].max}` : ""}</option>`;
      return `<select class="slot ${n ? (grund(n) ? "warn" : "") : "leer"}" data-change="k-slot" data-id="${esc(t.id)}" data-k="${k}" aria-label="Platz ${k + 1}">
        <option value="">— offen —</option>
        ${passend.length ? `<optgroup label="Passend">${passend.map((m) => opt(m, false)).join("")}</optgroup>` : ""}
        ${rest.length ? `<optgroup label="Mit Warnung">${rest.map((m) => opt(m, true)).join("")}</optgroup>` : ""}
      </select>`;
    }).join("");
    const info = [pt.offen ? `<span class="warnfarbe">${pt.offen} offen</span>` : "", pt.moeglich.length ? `möglich: ${esc(pt.moeglich.join(", "))}` : "", pt.ueberMax.length ? `über Max: ${esc(pt.ueberMax.join(", "))}` : "", ...pt.probleme.map((p) => `<span class="warnfarbe">${esc(p)}</span>`)].filter(Boolean).join("<br>");
    return `<tr class="${pt.offen ? "offen" : ""}"><td class="nowrap">${esc(fmtDatumKurz(t.datum))}</td><td class="nowrap">${esc(t.beginn)}–${esc(t.ende)}</td><td>${esc(t.ort)}${t.kurztitel ? `<br><span class="klein">${esc(t.kurztitel)}</span>` : ""}</td><td>${sprachTag(t.sprache)}</td><td><div class="slots">${zelle}</div></td><td class="klein">${info}</td></tr>`;
  }).join("");

  const pers = personen.map((p) => {
    const st = [];
    if (!p.antwort) st.push('<span class="gedimmt">keine Rückmeldung</span>');
    else {
      if (p.anzahl < p.min) st.push('<span class="warnfarbe">unter Min</span>');
      if (p.anzahl > p.max) st.push('<span class="warnfarbe">über Max</span>');
    }
    return `<tr><td>${esc(p.name)}</td><td class="zahl">${p.anzahl}${p.fixN ? ` <span class="klein">(${p.fixN} fix)</span>` : ""}</td><td class="zahl">${p.stunden.toLocaleString("de-AT", { maximumFractionDigits: 1 })} h</td>
      <td class="nowrap">${p.antwort ? `${p.min}–${p.max}${p.effMax < p.max ? ` (wirksam ${p.effMax})` : ""}` : "–"}</td><td>${st.join(" ")}</td></tr>`;
  }).join("");

  return `${kopf}
  <section class="karte"><h2>Hinweise</h2>${hinweisHtml}</section>
  <section class="karte"><h2>Plan – händisch korrigierbar</h2>
    <p class="sub">Je Platz eine Person wählen. „Passend“ = hat „kann“ gemeldet, spricht die Sprache, keine Überschneidung. Die Zahl hinter dem Namen = eingeteilte Führungen / Max.</p>
    <p class="sub"><span class="tag fix">Fix</span> eingeteilte Personen sind gesetzt. <b>Entfixieren:</b> auf den violetten Namen klicken (öffnet die Führung unter „2. Führungen“) → Häkchen bei „Fix eingeteilt“ entfernen → Speichern. Die Person bleibt danach als normale Einteilung stehen; den Platz dann hier neu wählen oder neu einteilen.</p>
    <div class="tabelle-scroll"><table class="tabelle plan"><thead><tr><th>Datum</th><th>Zeit</th><th>Ort</th><th>Spr.</th><th>Einteilung</th><th>Hinweis</th></tr></thead><tbody>${zeilen}</tbody></table></div>
  </section>
  <section class="karte"><h2>Einsätze pro Person</h2>
    <table class="tabelle"><thead><tr><th>Name</th><th>Führungen</th><th>Stunden</th><th>Min–Max</th><th>Status</th></tr></thead><tbody>${pers}</tbody></table>
  </section>`;
}

// ---------- 6 Plan & Kalender ----------
function tabVersand(app, r) {
  if (!r.plan) return `<section class="karte"><h2>Plan & Kalender</h2><p>Erst unter „5. Einteilung“ einteilen.</p></section>`;
  const { hinweise } = analyse(r, r.plan.a);
  const offen = hinweise.filter((h) => h.art === "offen").length;
  const url = linkFor(baseUrl(), encodePlan(r, r.plan.a, { langtext: r.langtext.p }));
  return `<section class="karte">
    <h2>Link 3 – Plan an alle</h2>
    ${offen ? `<ul class="hinweise"><li>${offen} ${offen === 1 ? "Führung hat" : "Führungen haben"} noch offene Plätze (im Kalender als „??“).</li></ul>` : ""}
    <label class="schalter"><input type="checkbox" data-change="k-langtext" data-k="p" ${r.langtext.p ? "checked" : ""}> Langtext (Beschreibung) mitschicken – kommt dann auch in die persönlichen Kalendereinträge</label>
    ${messageBox("Link 3 – an alle (WhatsApp-Gruppe)", messagePlan(r, url), { id: "link3" })}
    <p><a href="${esc(url)}" target="_blank" rel="noopener">Vorschau: so sieht es eine Person</a></p>
  </section>
  <section class="karte">
    <h2>Gesamtkalender (.ics)</h2>
    <p class="sub">Alle Führungen mit Titel „Ort Name, Name“ (alphabetisch, „??“ = offener Platz), genaue Führungszeit, Beschreibung = Kurztitel + Langtext.</p>
    <button class="btn" data-action="k-ics">Gesamtkalender herunterladen</button>
    <ol class="klein anleitung">
      <li>Am Computer <b>calendar.google.com</b> öffnen → Zahnrad → Einstellungen → <b>Importieren &amp; Exportieren</b>.</li>
      <li>Datei auswählen, Ziel-Kalender wählen, <b>Importieren</b>.</li>
      <li><b>Nur einmal importieren.</b> Spätere Änderungen direkt im Google Kalender vornehmen, nicht in der App.</li>
    </ol>
  </section>`;
}

// ---------- Aktionen ----------
function neueRunde(app, r) {
  app.state.rounds[r.id] = r;
  app.state.currentRoundId = r.id;
  app.state.rolle = "koordinator";
  app.commit({ zeichnen: false });
  app.go("koord", { rid: r.id, tab: "runde" });
}

function formWerte() {
  const el = document.getElementById("tour-form");
  const v = (n) => el.querySelector(`[name="${n}"]`).value;
  return {
    ort: v("ort").trim(), datum: v("datum"), beginn: v("beginn"), ende: v("ende"), sprache: v("sprache"),
    personen: v("personen").trim(), fix: [...el.querySelectorAll('[name="fix"]:checked')].map((x) => x.value),
    kurztitel: v("kurztitel"), beschreibung: v("beschreibung").replace(/\r\n?/g, "\n").replace(/\s+$/, ""),
  };
}

async function importZeilen(app, r, rows, quelle, date1904 = false) {
  app.tmp.import = { ...pruefeZeilen(rows, { team: r.team, von: r.von, bis: r.bis, vorhandene: r.tours, date1904 }), quelle };
  app.tmp.paste = false;
  app.render();
}

export const actions = {
  "k-tab": (app, el) => {
    app.view.tab = el.dataset.tab;
    app.tmp = {};
    app.render();
  },
  "k-neu": (app) => neueRunde(app, newRound()),
  "k-neu-aus-letzter": (app) => {
    const r = cur(app) ?? Object.values(app.state.rounds)[0];
    if (r) neueRunde(app, newRoundFrom(r));
  },
  "k-demo": (app) => neueRunde(app, demoRound()),
  "k-anleitung": () => anleitungZeigen(),
  "k-loeschen": (app) => {
    const r = cur(app);
    if (!r || !confirm(`${rundenName(r)} wirklich löschen? Das lässt sich nicht rückgängig machen (außer über eine Sicherung).`)) return;
    delete app.state.rounds[r.id];
    const rest = Object.values(app.state.rounds).sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    app.state.currentRoundId = rest[0]?.id ?? null;
    app.view.rid = app.state.currentRoundId;
    app.commit();
  },
  "zu-person": (app) => {
    app.state.rolle = "person";
    app.commit({ zeichnen: false });
    app.go("person-home");
  },
  "k-sichern": async (app) => {
    const now = new Date();
    await saveFile(backupFilename(now), "application/json", backupJson(app.state, now));
    app.state.lastBackupAt = now.toISOString();
    app.commit();
    toast("Sicherung gespeichert.");
  },
  "k-oeffnen": async (app) => {
    const f = await pickFile(".json,application/json");
    if (!f) return;
    const { zustand, gespeichert } = parseBackup(f.data);
    const n = Object.keys(zustand.rounds).length;
    if (!confirm(`Sicherung vom ${new Date(gespeichert).toLocaleString("de-AT")} mit ${n} ${n === 1 ? "Runde" : "Runden"} öffnen?\n\nDer aktuelle Stand auf diesem Gerät wird dabei ersetzt.`)) return;
    zustand.rolle = "koordinator";
    app.state = zustand;
    app.commit({ sofort: true, zeichnen: false });
    app.go("koord", { rid: zustand.currentRoundId, tab: "runde" });
    toast("Sicherung geöffnet.");
  },
  // Team
  "k-team-add": (app) => {
    const r = cur(app);
    const el = document.getElementById("neuer-name");
    const n = el.value.trim().replace(/\s+/g, " ");
    if (!n) return;
    if (findTeamName(r.team, n)) return toast(`„${n}“ steht schon in der Teamliste.`, "warn");
    r.team.push(n);
    app.commit();
    document.getElementById("neuer-name")?.focus();
  },
  "k-team-liste": (app) => {
    const r = cur(app);
    const namen = document.getElementById("namen-liste").value.split(/\r?\n/).map((s) => s.trim().replace(/\s+/g, " ")).filter(Boolean);
    let neu = 0;
    for (const n of namen) if (!findTeamName(r.team, n)) { r.team.push(n); neu++; }
    app.commit();
    toast(`${neu} ${neu === 1 ? "Name" : "Namen"} hinzugefügt${namen.length > neu ? `, ${namen.length - neu} schon vorhanden` : ""}.`);
  },
  "k-team-weg": (app, el) => {
    const r = cur(app);
    const n = el.dataset.name;
    const fix = r.tours.filter((t) => t.fix.some((f) => nameKey(f) === nameKey(n))).length;
    if (!confirm(`${n} aus dem Team entfernen?${fix ? `\n\n${n} ist bei ${fix} ${fix === 1 ? "Führung" : "Führungen"} fix eingeteilt – diese Fix-Einträge werden entfernt.` : ""}`)) return;
    r.team = r.team.filter((x) => x !== n);
    r.tours.forEach((t) => (t.fix = t.fix.filter((f) => nameKey(f) !== nameKey(n))));
    if (r.plan) for (const id in r.plan.a) r.plan.a[id] = r.plan.a[id].map((x) => (x && nameKey(x) === nameKey(n) ? null : x));
    app.commit();
  },
  "k-team-sprache": (app, el) => {
    const r = cur(app);
    const k = nameKey(el.dataset.name);
    const l = r.langs[k] ?? [];
    r.langs[k] = l.includes(el.dataset.l) ? l.filter((x) => x !== el.dataset.l) : SPRACHEN.filter((x) => x === el.dataset.l || l.includes(x));
    app.commit();
  },
  // Führungen
  "k-tour-neu": (app) => {
    const r = cur(app);
    const last = sortTours(r.tours).at(-1);
    app.tmp.form = { id: null, ort: last?.ort ?? "", datum: last?.datum ?? r.von ?? "", beginn: "", ende: "", sprache: "DE", personen: 1, fix: [], kurztitel: "", beschreibung: "" };
    app.tmp.formFehler = [];
    app.render();
    document.getElementById("f-ort")?.focus();
  },
  "k-tour-edit": (app, el) => {
    const t = cur(app).tours.find((x) => x.id === el.dataset.id);
    if (el.dataset.tab) {
      app.view.tab = el.dataset.tab;
      app.tmp = {};
    }
    app.tmp.form = { ...t, fix: [...t.fix] };
    app.tmp.formFehler = [];
    app.render();
    document.getElementById("tour-form")?.scrollIntoView({ block: "start" });
  },
  "k-tour-abbrechen": (app) => {
    app.tmp.form = null;
    app.render();
  },
  "k-tour-speichern": (app) => {
    const r = cur(app);
    const f = formWerte();
    const fehler = [];
    if (!f.ort) fehler.push("Ort fehlt.");
    if (!validDate(f.datum)) fehler.push("Datum fehlt.");
    if (!validTime(f.beginn)) fehler.push("Beginn fehlt.");
    if (!validTime(f.ende)) fehler.push("Ende fehlt.");
    if (validTime(f.beginn) && validTime(f.ende) && toMin(f.ende) <= toMin(f.beginn)) fehler.push("Ende muss nach dem Beginn liegen.");
    const p = /^\d+$/.test(f.personen) ? +f.personen : NaN;
    if (!(p >= 1)) fehler.push("Personen muss eine ganze Zahl ab 1 sein.");
    else if (f.fix.length > p) fehler.push(`Mehr Fix-Personen (${f.fix.length}) als Personen (${p}).`);
    if (/\n/.test(f.kurztitel)) fehler.push("Kurztitel darf nur eine Zeile haben.");
    if (fehler.length) {
      app.tmp.form = { ...app.tmp.form, ...f };
      app.tmp.formFehler = fehler;
      return app.render();
    }
    const daten = { ...f, personen: p, kurztitel: f.kurztitel.trim() };
    if (app.tmp.form.id) updateTour(r, app.tmp.form.id, daten);
    else addTour(r, daten);
    app.tmp.form = null;
    app.commit();
    toast("Führung gespeichert.");
  },
  "k-tour-weg": (app, el) => {
    const r = cur(app);
    const t = r.tours.find((x) => x.id === el.dataset.id);
    if (!confirm(`Führung ${fmtDatum(t.datum)} ${t.beginn} ${t.ort} löschen?`)) return;
    r.tours = r.tours.filter((x) => x.id !== t.id);
    if (r.plan) delete r.plan.a[t.id];
    app.commit();
  },
  "k-xlsx": async (app) => {
    const f = await pickFile(".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", true);
    if (!f) return;
    const r = cur(app);
    try {
      const { rows, date1904 } = readXlsx(f.data);
      await importZeilen(app, r, rows, f.name, date1904);
    } catch (e) {
      app.tmp.import = { fehler: e.message, zeilen: [], quelle: f.name };
      app.render();
    }
  },
  "k-paste-auf": (app) => {
    app.tmp.paste = true;
    app.render();
    document.getElementById("paste-excel")?.focus();
  },
  "k-paste-zu": (app) => {
    app.tmp.paste = false;
    app.render();
  },
  "k-paste-pruefen": (app) => importZeilen(app, cur(app), parseTSV(document.getElementById("paste-excel").value), "eingefügter Text"),
  "k-import-zu": (app) => {
    app.tmp.import = null;
    app.render();
  },
  "k-import-ok": (app) => {
    const r = cur(app);
    const ok = app.tmp.import.zeilen.filter((z) => !z.probleme.length);
    for (const z of ok) addTour(r, z.daten);
    app.tmp.import = null;
    app.commit();
    toast(`${ok.length} ${ok.length === 1 ? "Führung" : "Führungen"} übernommen.`);
  },
  // Rückmeldungen
  "k-antworten-einfuegen": async (app) => {
    const { verarbeiteCodes } = await import("./main.js");
    const text = document.getElementById("antworten-text").value;
    const { meldungen } = verarbeiteCodes(text, { quelle: "einfuegen" });
    app.tmp.einfuegeErgebnis = meldungen.map((m) => (m.text === "Runde geöffnet." || m.text === "Plan geöffnet." ? { art: "warn", text: "Eine Runde/ein Plan (kein Antwort-Link) wurde in die Personen-Ansicht übernommen." } : m));
    app.commit();
  },
  "k-antwort-weg": (app, el) => {
    const r = cur(app);
    if (!confirm(`Antwort von ${el.dataset.name} entfernen?`)) return;
    delete r.answers[nameKey(el.dataset.name)];
    app.commit();
  },
  "k-unbekannt-team": (app, el) => {
    const r = cur(app);
    const n = el.dataset.name.trim();
    if (!findTeamName(r.team, n)) r.team.push(n);
    const a = r.answers[nameKey(n)];
    if (a) r.langs[nameKey(n)] = [...a.langs];
    app.commit();
  },
  // Einteilung
  "k-einteilen": async (app) => {
    const r = cur(app);
    if (r.plan?.manual && !confirm("Neu einteilen? Händische Korrekturen gehen dabei verloren.")) return;
    app.tmp.laeuft = true;
    app.render();
    await new Promise((res) => setTimeout(res, 30));
    try {
      const highs = await loadHighs();
      const res = solveRound(r, highs);
      r.plan = { a: res.a, solvedAt: new Date().toISOString(), ms: res.ms, manual: false };
      toast("Einteilung fertig.");
    } finally {
      app.tmp.laeuft = false;
      app.commit();
    }
  },
  "k-plan-leeren": (app) => {
    const r = cur(app);
    if (!confirm("Plan leeren? Alle Einteilungen außer Fix werden entfernt.")) return;
    r.plan = null;
    app.commit();
  },
  "k-plan-haendisch": (app) => {
    const r = cur(app);
    r.plan = { a: emptyPlan(r), solvedAt: null, manual: true };
    app.commit();
  },
  "k-ics": async (app) => {
    const r = cur(app);
    await saveFile(`fuehrungen-${r.von || "runde"}-bis-${r.bis || ""}.ics`.replace(/-bis-\.ics$/, ".ics"), "text/calendar;charset=utf-8", icsGesamt(r, r.plan.a));
  },
  kopieren: async (app, el) => {
    await personActions.kopieren(app, el);
    gesendet(app, el.dataset.ziel);
  },
  teilen: async (app, el) => {
    await personActions.teilen(app, el);
    gesendet(app, el.dataset.ziel);
  },
};

function gesendet(app, ziel) {
  const r = cur(app);
  if (ziel === "link1" && r && r.sentRev !== r.rev) {
    r.sentRev = r.rev;
    app.commit();
  }
}

export const changes = {
  "k-runde-waehlen": (app, el) => {
    app.state.currentRoundId = el.value;
    app.view.rid = el.value;
    app.tmp = {};
    app.commit();
  },
  "k-feld": (app, el) => {
    cur(app)[el.dataset.k] = el.value;
    app.commit();
  },
  "k-langtext": (app, el) => {
    cur(app).langtext[el.dataset.k] = el.checked;
    app.commit();
  },
  "k-slot": (app, el) => {
    const r = cur(app);
    r.plan.a[el.dataset.id][+el.dataset.k] = el.value || null;
    r.plan.manual = true;
    app.commit();
  },
};
