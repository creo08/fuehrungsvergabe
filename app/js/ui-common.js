// Gemeinsame Hilfen für die Oberfläche (DOM).

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const isIOS = () =>
  /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/** Basisadresse der App (ohne Fragment), funktioniert auch unter einem Unterpfad. */
export const baseUrl = () => location.href.split("#")[0].split("?")[0];

let toastTimer = null;
export function toast(text, art = "ok") {
  const el = document.getElementById("toast");
  if (!el) return;
  el.textContent = text;
  el.dataset.art = art;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), art === "fehler" ? 7000 : 3500);
}

export async function copyText(text, fallbackEl) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (fallbackEl) {
      fallbackEl.focus();
      fallbackEl.select();
      try {
        return document.execCommand("copy");
      } catch {
        return false;
      }
    }
    return false;
  }
}

export const canShareText = () => typeof navigator.share === "function";
export async function shareText(text) {
  try {
    await navigator.share({ text });
    return true;
  } catch (e) {
    return e?.name === "AbortError" ? null : false;
  }
}

/**
 * Datei an die nutzende Person geben.
 * iOS: .ics per direkter Navigation (dann bietet Safari „Zum Kalender hinzufügen“ an),
 * andere Dateien über das Teilen-Menü („In Dateien sichern“). Sonst normaler Download.
 */
export async function saveFile(name, mime, content) {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  if (isIOS()) {
    if (mime.startsWith("text/calendar")) {
      const url = URL.createObjectURL(blob);
      location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 120000);
      return;
    }
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (e) {
        if (e?.name === "AbortError") return;
      }
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 120000);
}

/** Datei auswählen lassen und als Text bzw. Bytes liefern. */
export function pickFile(accept, asBytes = false) {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";
    input.onchange = async () => {
      const f = input.files?.[0];
      input.remove();
      if (!f) return resolve(null);
      resolve({ name: f.name, data: asBytes ? new Uint8Array(await f.arrayBuffer()) : await f.text() });
    };
    document.body.append(input);
    input.click();
  });
}

export function relTage(iso) {
  if (!iso) return "noch nie";
  const tage = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return tage <= 0 ? "heute" : tage === 1 ? "gestern" : `vor ${tage} Tagen`;
}

/** Nachricht mit Kopieren/Teilen-Knöpfen. */
export function messageBox(label, text, { id, hinweis = "" } = {}) {
  const lang = text.length;
  return `<div class="code" id="${id}">
    <div class="code-kopf"><span class="lbl">${esc(label)}</span><span class="klein">${lang.toLocaleString("de-AT")} Zeichen</span></div>
    <textarea readonly rows="4" class="code-text">${esc(text)}</textarea>
    <div class="knoepfe">
      <button class="btn" data-action="kopieren" data-ziel="${id}">Nachricht kopieren</button>
      ${canShareText() ? `<button class="btn ghost" data-action="teilen" data-ziel="${id}">Teilen …</button>` : ""}
    </div>
    ${hinweis ? `<p class="klein">${hinweis}</p>` : ""}
  </div>`;
}
