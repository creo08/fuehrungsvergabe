// Einstieg: Zustand laden, Link im Fragment auswerten, Ansicht wählen, Ereignisse verteilen.
import { createStore, requestPersist } from "./store.js";
import { findCodes } from "./codec.js";
import { addAnswer } from "./model.js";
import { toast, esc } from "./ui-common.js";
import * as koord from "./ui-koord.js";
import * as person from "./ui-person.js";

const store = createStore();
const main = document.getElementById("app");

export const app = {
  state: null,
  view: { seite: "start", rid: null, tab: "runde" },
  tmp: {}, // flüchtige Daten der Ansicht (Vorschau, Eingaben)
  render,
  /** Zustand speichern und neu zeichnen. */
  commit({ sofort = false, zeichnen = true } = {}) {
    store.save(app.state, { sofort }).then((ok) => {
      if (!ok) toast("Speichern auf diesem Gerät nicht möglich – bitte Sicherung speichern!", "fehler");
    });
    if (zeichnen) render();
  },
  get speicherModus() {
    return store.mode;
  },
  go(seite, extra = {}) {
    app.view = { ...app.view, seite, ...extra };
    app.tmp = {};
    render();
    window.scrollTo({ top: 0 });
  },
  requestPersist,
};

function render() {
  const v = app.view;
  let html;
  if (v.seite === "koord") html = koord.render(app);
  else if (v.seite === "person-runde" || v.seite === "person-plan" || v.seite === "person-home") html = person.render(app);
  else html = person.render({ ...app, view: { ...v, seite: "person-home" } });
  main.innerHTML = html;
  document.body.dataset.seite = v.seite;
  koord.afterRender?.(app);
  person.afterRender?.(app);
}

// ---------- Links im Fragment ----------
/** Verarbeitet Codes aus Text (Fragment oder eingefügte Nachricht). Liefert Meldungen. */
export function verarbeiteCodes(text, { quelle = "link" } = {}) {
  const codes = findCodes(text);
  const meldungen = [];
  let ziel = null;
  for (const c of codes) {
    if (c.error) {
      meldungen.push({ art: "fehler", text: c.error });
      continue;
    }
    if (c.type === "R") {
      const r = c.data;
      app.state.person.runden[r.id] = { ...r, empfangen: new Date().toISOString() };
      ziel = { seite: "person-runde", rid: r.id };
      meldungen.push({ art: "ok", text: "Runde geöffnet." });
    } else if (c.type === "P") {
      const { round, a } = c.data;
      app.state.person.plaene[round.id] = { round, a, empfangen: new Date().toISOString() };
      ziel = { seite: "person-plan", rid: round.id };
      meldungen.push({ art: "ok", text: "Plan geöffnet." });
    } else if (c.type === "A") {
      const ans = c.data;
      const round = app.state.rounds[ans.rid];
      if (!round) {
        meldungen.push({ art: "fehler", text: `Antwort von ${ans.name}: Die passende Runde ist auf diesem Gerät bzw. in diesem Browser nicht gespeichert.` });
        continue;
      }
      const st = addAnswer(round, ans);
      const txt = {
        neu: `Antwort von ${st.name} übernommen.`,
        ersetzt: `Antwort von ${st.name} übernommen (ersetzt die frühere Antwort).`,
        aelter: `Antwort von ${st.name} ist älter als die schon vorhandene – nicht übernommen.`,
        doppelt: `Antwort von ${st.name} war schon übernommen.`,
        unbekannt: `Antwort von „${st.name}“ übernommen, aber der Name steht nicht in der Teamliste.`,
      }[st.status];
      meldungen.push({ art: st.status === "aelter" || st.status === "unbekannt" ? "warn" : "ok", text: txt });
      app.state.currentRoundId = round.id;
      ziel = { seite: "koord", rid: round.id, tab: "antworten" };
    }
  }
  if (!codes.length && quelle !== "link") meldungen.push({ art: "fehler", text: "Kein Code der Führungsvergabe gefunden. Bitte die ganze Nachricht kopieren." });
  return { meldungen, ziel };
}

function hashVerarbeiten() {
  const h = location.hash.slice(1);
  if (!h) return false;
  const { meldungen, ziel } = verarbeiteCodes(decodeURIComponent(h));
  // Daten aus der Adresszeile entfernen (nicht im Verlauf/Lesezeichen behalten)
  history.replaceState(null, "", location.pathname + location.search);
  if (ziel) {
    app.view = { ...app.view, ...ziel };
    if (ziel.seite === "koord") app.state.rolle = "koordinator";
    app.commit({ sofort: true, zeichnen: false });
  }
  app.tmp = { meldungen };
  render();
  const fehler = meldungen.find((m) => m.art === "fehler");
  if (fehler) toast(fehler.text, "fehler");
  else if (meldungen.length) toast(meldungen.map((m) => m.text).join(" "), meldungen.some((m) => m.art === "warn") ? "warn" : "ok");
  return true;
}

// ---------- Ereignisse ----------
function handler(kind) {
  return async (ev) => {
    const el = ev.target.closest(`[data-${kind}]`);
    if (!el || !ev.currentTarget.contains(el)) return;
    const name = el.dataset[kind];
    const fn = (app.view.seite === "koord" ? koord : person)[kind === "action" ? "actions" : "changes"][name] ?? (kind === "action" ? person.actions[name] ?? koord.actions[name] : null);
    if (!fn) return;
    if (kind === "action") ev.preventDefault();
    try {
      await fn(app, el, ev);
    } catch (e) {
      console.error(e);
      toast(e.message || String(e), "fehler");
    }
  };
}
main.addEventListener("click", handler("action"));
main.addEventListener("change", handler("change"));
document.querySelector("header.top").addEventListener("click", handler("action"));
document.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && ev.target.matches?.("[data-enter]")) {
    ev.preventDefault();
    main.querySelector(`[data-action="${ev.target.dataset.enter}"]`)?.click();
  }
});
window.addEventListener("hashchange", () => hashVerarbeiten());

// ---------- Start ----------
async function start() {
  app.state = await store.load();
  store.onExternalChange(async () => {
    // Ein anderer Tab hat gespeichert (z. B. Antwort per Link übernommen) → neu laden
    app.state = await store.load();
    render();
  });
  if (!hashVerarbeiten()) {
    const hatRunden = Object.keys(app.state.rounds).length > 0;
    if (app.state.rolle === "koordinator" || (hatRunden && app.state.rolle !== "person")) app.view = { ...app.view, seite: "koord", rid: app.state.currentRoundId };
    else app.view = { ...app.view, seite: "person-home" };
    render();
  }
  if (store.mode === "speicher") toast("Dieser Browser erlaubt kein dauerhaftes Speichern (z. B. privates Fenster). Daten gehen beim Schließen verloren.", "fehler");
}

// ---------- Service Worker ----------
if ("serviceWorker" in navigator && location.protocol !== "file:") {
  const warSchonInstalliert = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register("./sw.js").then((reg) => {
    reg.addEventListener("updatefound", () => {
      const nw = reg.installing;
      nw?.addEventListener("statechange", () => {
        if (nw.state === "installed" && warSchonInstalliert) {
          const bar = document.getElementById("update");
          bar.hidden = false;
          bar.querySelector("button").onclick = () => nw.postMessage("skipWaiting");
        }
      });
    });
  }).catch(() => {});
  let neu = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (neu || !warSchonInstalliert) return;
    neu = true;
    location.reload();
  });
}

start().catch((e) => {
  main.innerHTML = `<section class="karte"><h2>Fehler beim Start</h2><p>${esc(e.message)}</p></section>`;
});
