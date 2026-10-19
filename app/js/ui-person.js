// Personen-Ansicht (Handy zuerst): Verfügbarkeit melden (Link 1) und Plan ansehen (Link 3).
import { esc, toast, copyText, shareText, saveFile, messageBox, baseUrl } from "./ui-common.js";
import { encodeAnswer, linkFor, messageAnswer } from "./codec.js";
import { nameKey, findTeamName, sortTours, fmtDatum, fmtDatumKurz, titleNames, SPRACHEN } from "./model.js";
import { icsPerson } from "./ical.js";

const SPRACHNAME = { DE: "Deutsch", EN: "Englisch" };

export function render(app) {
  const { seite } = app.view;
  if (seite === "person-runde") return renderRunde(app);
  if (seite === "person-plan") return renderPlan(app);
  return renderHome(app);
}

// ---------- Start ----------
function renderHome(app) {
  const p = app.state.person;
  const runden = Object.values(p.runden).sort((a, b) => (b.empfangen ?? "").localeCompare(a.empfangen ?? ""));
  const plaene = Object.values(p.plaene).sort((a, b) => (b.empfangen ?? "").localeCompare(a.empfangen ?? ""));
  const zr = (r) => (r.von && r.bis ? `${fmtDatum(r.von)} – ${fmtDatum(r.bis)}` : "Runde");
  return `<div class="person">
    <section class="karte">
      <h2>Nachricht einfügen</h2>
      <p class="sub">Hast du eine Nachricht der Führungsvergabe bekommen? Antippen öffnet sie direkt. Sonst: Nachricht in WhatsApp lange drücken → Kopieren → hier einfügen.</p>
      <textarea id="einfuegen" rows="4" placeholder="Nachricht oder Link hier einfügen"></textarea>
      <div class="knoepfe">
        <button class="btn" data-action="person-einfuegen">Öffnen</button>
        ${navigator.clipboard?.readText ? `<button class="btn ghost" data-action="person-zwischenablage">Aus Zwischenablage einfügen</button>` : ""}
      </div>
    </section>
    ${plaene.length ? `<section class="karte"><h2>Pläne</h2><div class="liste">${plaene.map((x) => `<button class="zeile-knopf" data-action="person-oeffnen" data-seite="person-plan" data-rid="${esc(x.round.id)}">Plan ${esc(zr(x.round))}</button>`).join("")}</div></section>` : ""}
    ${runden.length ? `<section class="karte"><h2>Rückmeldungen</h2><div class="liste">${runden.map((r) => `<button class="zeile-knopf" data-action="person-oeffnen" data-seite="person-runde" data-rid="${esc(r.id)}">Verfügbarkeit ${esc(zr(r))}${r.frist ? ` · bis ${esc(fmtDatum(r.frist))}` : ""}</button>`).join("")}</div></section>` : ""}
    <p class="fuss"><button class="link" data-action="zu-koordinator">Ich bin Koordinator:in →</button></p>
  </div>`;
}

// ---------- Verfügbarkeit melden ----------
function entwurf(app, r) {
  const p = app.state.person;
  const e = (p.entwuerfe[r.id] ??= { can: [], min: null, max: null, gesendetRev: null });
  return e;
}
function meinName(app, team) {
  return findTeamName(team, app.state.person.name) ?? "";
}
function meineSprachen(app, r, name) {
  const p = app.state.person;
  if (p.langs?.length) return p.langs;
  return r.langs?.[nameKey(name)] ?? [];
}

/** Zustand jeder Führung für die Person. */
function tourStatus(r, t, name, langs, e) {
  const mineFix = !!name && t.fix.some((f) => nameKey(f) === nameKey(name));
  const voll = !mineFix && t.fix.length >= t.personen;
  const langOk = langs.includes(t.sprache);
  const aktiv = !mineFix && !voll && langOk;
  const geaendert = e.gesendetRev != null && (t.trev ?? 0) > e.gesendetRev;
  return { mineFix, voll, langOk, aktiv, kann: aktiv && e.can.includes(t.id), geaendert };
}

function moeglich(r, name, langs, e) {
  return r.tours.reduce((n, t) => {
    const s = tourStatus(r, t, name, langs, e);
    return n + (s.mineFix || s.kann ? 1 : 0);
  }, 0);
}

/** Max auf mögliche Führungen begrenzen, Min ≤ Max. */
function begrenzen(e, mgl) {
  if (e.max != null && e.max > mgl) e.max = mgl;
  if (e.min != null && e.max != null && e.min > e.max) e.min = e.max;
}

function renderRunde(app) {
  const r = app.state.person.runden[app.view.rid];
  if (!r) return renderHome(app);
  const e = entwurf(app, r);
  const name = meinName(app, r.team);
  const langs = meineSprachen(app, r, name);
  const mgl = moeglich(r, name, langs, e);
  begrenzen(e, mgl);
  const tage = new Map();
  for (const t of sortTours(r.tours)) {
    if (!tage.has(t.datum)) tage.set(t.datum, []);
    tage.get(t.datum).push(t);
  }
  const touren = [...tage.entries()].map(([d, ts]) => `
    <h3 class="tag-kopf">${esc(fmtDatumKurz(d))}${d.slice(0, 4)}</h3>
    ${ts.map((t) => {
      const s = tourStatus(r, t, name, langs, e);
      const grund = s.mineFix ? '<span class="tag fix">fix eingeteilt</span>' : s.voll ? '<span class="tag">schon besetzt</span>' : !s.langOk ? '<span class="tag aus">Sprache passt nicht</span>' : "";
      return `<label class="fuehrung ${s.aktiv ? "" : "aus"} ${s.kann || s.mineFix ? "an" : ""}">
        <span class="zeit"><b>${esc(t.beginn)}</b>–${esc(t.ende)}</span>
        <span class="info"><b>${esc(t.ort)}</b>${t.kurztitel ? ` · ${esc(t.kurztitel)}` : ""}
          <span class="tags"><span class="tag ${t.sprache === "EN" ? "en" : ""}">${t.sprache}</span>${grund}${s.geaendert ? '<span class="tag warn">neu/geändert</span>' : ""}</span>
          ${t.beschreibung ? `<details class="langtext"><summary>Beschreibung</summary><p>${esc(t.beschreibung).replace(/\n/g, "<br>")}</p></details>` : ""}
        </span>
        <input type="checkbox" class="haken" data-change="person-kann" data-id="${esc(t.id)}" ${s.kann || s.mineFix ? "checked" : ""} ${s.aktiv ? "" : "disabled"} aria-label="kann am ${esc(fmtDatumKurz(t.datum))} um ${esc(t.beginn)}">
      </label>`;
    }).join("")}`).join("");

  const fehler = [];
  if (!name) fehler.push("Bitte wähle deinen Namen.");
  if (!langs.length) fehler.push("Bitte wähle mindestens eine Sprache.");
  if (e.min == null || e.max == null) fehler.push("Bitte gib an, wie viele Führungen du mindestens und höchstens machen möchtest.");
  const antwort = app.tmp.antwort;
  const zr = r.von && r.bis ? `${fmtDatum(r.von)} – ${fmtDatum(r.bis)}` : "";
  const stepper = (k, wert, maxWert) => `<div class="stepper" role="group" aria-label="${k === "min" ? "Mindestens" : "Höchstens"}">
      <button data-action="person-zahl" data-k="${k}" data-d="-1" aria-label="weniger" ${wert == null || wert <= 0 ? "disabled" : ""}>−</button>
      <span class="wert" id="wert-${k}">${wert ?? "–"}</span>
      <button data-action="person-zahl" data-k="${k}" data-d="1" aria-label="mehr" ${wert != null && wert >= maxWert ? "disabled" : ""}>+</button></div>`;
  return `<div class="person">
    <section class="karte">
      <h2>Verfügbarkeit melden</h2>
      <p class="sub">${zr ? `Zeitraum ${esc(zr)}` : ""}${r.frist ? ` · Rückmeldung bis <b>${esc(fmtDatum(r.frist))}</b>` : ""}</p>
      <div class="feld"><label for="pname">Ich bin</label>
        <select id="pname" data-change="person-name"><option value="">– Name wählen –</option>${r.team.map((n) => `<option ${n === name ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      <div class="feld"><span class="lbl">Ich führe auf</span>
        <div class="chips">${SPRACHEN.map((l) => `<button class="chip" data-action="person-sprache" data-l="${l}" aria-pressed="${langs.includes(l)}">${SPRACHNAME[l]}</button>`).join("")}</div></div>
      <p class="klein">Name und Sprachen merkt sich dieses Gerät.</p>
    </section>
    <section class="karte">
      <h2>Wann kannst du?</h2>
      <p class="sub">Hake jede Führung an, die du übernehmen könntest. (${mgl} möglich)</p>
      <div class="touren">${touren || '<p class="sub">Keine Führungen in dieser Runde.</p>'}</div>
    </section>
    <section class="karte">
      <h2>Wie viele?</h2>
      <p class="sub">Anzahl Führungen in dieser Runde. Höchstens so viele, wie du angehakt hast.</p>
      <div class="zahlen">
        <div class="feld"><span class="lbl">Mindestens</span>${stepper("min", e.min, e.max ?? mgl)}</div>
        <div class="feld"><span class="lbl">Höchstens</span>${stepper("max", e.max, mgl)}</div>
      </div>
      ${fehler.length ? `<ul class="hinweise">${fehler.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : ""}
      <button class="btn gross" data-action="person-antwort" ${fehler.length ? "disabled" : ""}>Antwort erstellen</button>
      ${antwort ? messageBox("Antwort an den:die Koordinator:in", antwort, { id: "antwort", hinweis: "Diese Nachricht per WhatsApp an den:die Koordinator:in schicken. Änderst du danach etwas, erstelle die Antwort neu und schicke sie noch einmal – die neueste gilt." }) : ""}
    </section>
    <p class="fuss"><button class="link" data-action="person-home">← Übersicht</button></p>
  </div>`;
}

// ---------- Plan ----------
function renderPlan(app) {
  const x = app.state.person.plaene[app.view.rid];
  if (!x) return renderHome(app);
  const { round: r, a } = x;
  const name = meinName(app, r.team);
  const mein = (t) => !!name && (a[t.id] ?? []).some((n) => n && nameKey(n) === nameKey(name));
  const tours = sortTours(r.tours);
  const meine = tours.filter(mein);
  const zr = r.von && r.bis ? `${fmtDatum(r.von)} – ${fmtDatum(r.bis)}` : "";
  return `<div class="person">
    <section class="karte">
      <h2>Führungsplan</h2>
      <p class="sub">${esc(zr)}</p>
      <div class="feld"><label for="pname2">Ich bin</label>
        <select id="pname2" data-change="person-name"><option value="">– Name wählen –</option>${r.team.map((n) => `<option ${n === name ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      ${name ? `<p><b>${esc(name)}</b>, du hast ${meine.length} ${meine.length === 1 ? "Führung" : "Führungen"}.</p>
        ${meine.length ? `<ul class="meine">${meine.map((t) => `<li><b>${esc(fmtDatumKurz(t.datum))}</b> ${esc(t.beginn)}–${esc(t.ende)} ${esc(t.ort)}${t.kurztitel ? ` · ${esc(t.kurztitel)}` : ""}</li>`).join("")}</ul>
        <button class="btn gross" data-action="person-ics">Meine Termine in den Kalender</button>
        <p class="klein">Termine beginnen 1 Stunde vor der Führung und enden 1 Stunde danach. Spätere Änderungen gibt es nur im Google Kalender, nicht hier.</p>` : ""}` : ""}
    </section>
    <section class="karte">
      <h2>Alle Führungen</h2>
      <div class="touren">${tours.map((t) => `<div class="fuehrung plan ${mein(t) ? "mein" : ""}">
        <span class="zeit"><b>${esc(fmtDatumKurz(t.datum))}</b>${esc(t.beginn)}–${esc(t.ende)}</span>
        <span class="info"><b>${esc(t.ort)}</b>${t.kurztitel ? ` · ${esc(t.kurztitel)}` : ""} <span class="tag ${t.sprache === "EN" ? "en" : ""}">${t.sprache}</span><br>
          ${titleNames(a[t.id] ?? []).map((n) => (n === "??" ? '<span class="tag warn">??</span>' : name && nameKey(n) === nameKey(name) ? `<span class="ich">${esc(n)}</span>` : esc(n))).join(", ")}</span>
      </div>`).join("")}</div>
    </section>
    <p class="fuss"><button class="link" data-action="person-home">← Übersicht</button></p>
  </div>`;
}

// ---------- Aktionen ----------
async function einfuegen(app, text) {
  const { verarbeiteCodes } = await import("./main.js");
  const { meldungen, ziel } = verarbeiteCodes(text, { quelle: "einfuegen" });
  const f = meldungen.find((m) => m.art === "fehler");
  if (ziel) {
    if (ziel.seite === "koord") app.state.rolle = "koordinator";
    app.commit({ zeichnen: false });
    app.go(ziel.seite, ziel);
  }
  if (f) toast(f.text, "fehler");
  else if (meldungen.length) toast(meldungen.map((m) => m.text).join(" "));
}

export const actions = {
  "person-einfuegen": (app) => einfuegen(app, document.getElementById("einfuegen").value),
  "person-zwischenablage": async (app) => {
    try {
      await einfuegen(app, await navigator.clipboard.readText());
    } catch {
      toast("Zwischenablage nicht lesbar – bitte Nachricht ins Feld einfügen.", "fehler");
    }
  },
  "person-oeffnen": (app, el) => app.go(el.dataset.seite, { rid: el.dataset.rid }),
  "person-home": (app) => app.go("person-home"),
  "zu-koordinator": (app) => {
    app.state.rolle = "koordinator";
    app.commit({ zeichnen: false });
    app.go("koord", { rid: app.state.currentRoundId });
  },
  "person-sprache": (app, el) => {
    const r = app.state.person.runden[app.view.rid];
    const p = app.state.person;
    const cur = meineSprachen(app, r, meinName(app, r.team));
    const l = el.dataset.l;
    p.langs = cur.includes(l) ? cur.filter((x) => x !== l) : SPRACHEN.filter((x) => x === l || cur.includes(x));
    app.tmp.antwort = null;
    app.commit();
  },
  "person-zahl": (app, el) => {
    const r = app.state.person.runden[app.view.rid];
    const e = entwurf(app, r);
    const name = meinName(app, r.team);
    const mgl = moeglich(r, name, meineSprachen(app, r, name), e);
    const k = el.dataset.k, d = +el.dataset.d;
    const grenze = k === "max" ? mgl : e.max ?? mgl;
    // Erster Tipp auf „+“: Mindestens beginnt bei 0, Höchstens beim schon gewählten Mindestens
    if (e[k] == null && d > 0) e[k] = Math.min(grenze, k === "max" ? e.min ?? 0 : 0);
    else e[k] = Math.max(0, Math.min(grenze, (e[k] ?? 0) + d));
    if (k === "max" && e.min != null && e.min > e.max) e.min = e.max;
    app.tmp.antwort = null;
    app.commit();
  },
  "person-antwort": (app) => {
    const r = app.state.person.runden[app.view.rid];
    const e = entwurf(app, r);
    const name = meinName(app, r.team);
    const langs = meineSprachen(app, r, name);
    const can = r.tours.filter((t) => tourStatus(r, t, name, langs, e).kann).map((t) => t.id);
    const ans = { rid: r.id, rev: r.rev, ts: Date.now(), name, langs, min: e.min, max: e.max, can };
    e.gesendetRev = r.rev;
    app.tmp.antwort = messageAnswer(ans, linkFor(baseUrl(), encodeAnswer(ans)));
    app.commit();
    document.getElementById("antwort")?.scrollIntoView({ block: "center", behavior: "smooth" });
  },
  "person-ics": async (app) => {
    const x = app.state.person.plaene[app.view.rid];
    const name = meinName(app, x.round.team);
    const datei = `meine-fuehrungen-${(x.round.von || "plan").slice(0, 7)}.ics`;
    await saveFile(datei, "text/calendar;charset=utf-8", icsPerson(x.round, x.a, name));
  },
  kopieren: async (app, el) => {
    const box = document.getElementById(el.dataset.ziel);
    const ta = box.querySelector("textarea");
    const ok = await copyText(ta.value, ta);
    toast(ok ? "Kopiert – jetzt in WhatsApp einfügen." : "Bitte Text markieren und kopieren.", ok ? "ok" : "warn");
    if (ok) el.dispatchEvent(new CustomEvent("kopiert", { bubbles: true }));
  },
  teilen: async (app, el) => {
    const ta = document.getElementById(el.dataset.ziel).querySelector("textarea");
    const ok = await shareText(ta.value);
    if (ok === false) toast("Teilen nicht möglich – bitte kopieren.", "warn");
    if (ok) el.dispatchEvent(new CustomEvent("kopiert", { bubbles: true }));
  },
};

export const changes = {
  "person-kann": (app, el) => {
    const r = app.state.person.runden[app.view.rid];
    const e = entwurf(app, r);
    const id = el.dataset.id;
    e.can = el.checked ? [...new Set([...e.can, id])] : e.can.filter((x) => x !== id);
    app.tmp.antwort = null;
    app.commit();
  },
  "person-name": (app, el) => {
    app.state.person.name = el.value;
    const rid = app.view.rid;
    const r = app.state.person.runden[rid] ?? app.state.person.plaene[rid]?.round;
    // Sprachen: zuerst Gerät, sonst Vorbelegung aus Link 1
    if (!app.state.person.langs?.length && r?.langs?.[nameKey(el.value)]) app.state.person.langs = [...r.langs[nameKey(el.value)]];
    app.tmp.antwort = null;
    app.commit();
  },
};
