// Abnahmetest im echten Browser (Chromium über Playwright):
// 6 Führungen, 5 Personen (inkl. Fix, beide Sprachen, eine Person ohne Antwort).
// Excel-Import → Link 1 → Antworten → Einteilen → Korrektur → Link 3 → .ics,
// danach Flugmodus (offline) und Sicherung auf „Gerät A“ speichern, auf „Gerät B“ öffnen.
//
// Aufruf: npm run test:e2e   (Screenshots landen in test-results/)
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import { zipSync, strToU8 } from "../../app/vendor/fflate.mjs";
import { createServer } from "../../tools/server.mjs";

const OUT = new URL("../../test-results/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 8765;
const BASE = `http://localhost:${PORT}/fuehrungsvergabe/`;
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);

const schritte = [];
const schritt = (t) => {
  schritte.push(t);
  console.log(`✓ ${t}`);
};

// ---------- Testdaten ----------
const TEAM = ["Anna", "Ben", "Clara", "David", "Eva"];
// 4 Führungen per Einfügen (Tab-getrennt, mehrzeilige Zelle in Anführungszeichen) …
const TSV = [
  "Ort\tDatum\tBeginn\tEnde\tSprache\tPersonen\tFix\tKurztitel\tBeschreibung",
  'Museum\t07.11.2026\t10:00\t11:30\tDE\t2\t\tVolksschule Linz\t"24 Kinder\nTreffpunkt Haupteingang"',
  "Museum\t07.11.2026\t14:00\t15:30\ten\t1\t\tSchool group\tMeeting point: ticket office",
  "Dom\t08.11.2026\t11:00\t12:00\tDE\t1\tclara\tSeniorenbund\t",
  "Museum\t14.11.2026\t10:00\t11:30\tDE\t2\t\tHTL Steyr\t",
].join("\r\n");
// … und 2 Führungen aus einer .xlsx-Datei (Datum als Seriennummer, Zeit als Bruchteil, Sommerzeit-Termin)
function xlsxDatei() {
  const s = ["Ort", "Datum", "Beginn", "Ende", "Sprache", "Personen", "Kurztitel", "Beschreibung", "Schloss", "Company visit", "Familie Maier", "Privatführung\nBitte Headset", "EN", "DE", "Museum"];
  const c = (ref, i) => `<c r="${ref}" t="s"><v>${i}</v></c>`;
  const n = (ref, v) => `<c r="${ref}"><v>${v}</v></c>`;
  const sheet =
    `<row r="1">${["A1", "B1", "C1", "D1", "E1", "F1", "G1", "H1"].map((r, i) => c(r, i)).join("")}</row>` +
    `<row r="2">${c("A2", 8)}${n("B2", 46347)}${n("C2", 10 / 24)}${n("D2", 11.5 / 24)}${c("E2", 12)}${n("F2", 2)}${c("G2", 9)}</row>` +
    `<row r="3">${c("A3", 14)}${n("B3", 46354)}${n("C3", 15 / 24)}${n("D3", 17 / 24)}${c("E3", 13)}${n("F3", 1)}${c("G3", 10)}${c("H3", 11)}</row>`;
  const file = `${OUT}import.xlsx`;
  writeFileSync(file, zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "xl/workbook.xml": strToU8('<workbook xmlns:r="r"><sheets><sheet name="F" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    "xl/_rels/workbook.xml.rels": strToU8('<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>'),
    "xl/worksheets/sheet1.xml": strToU8(`<worksheet><sheetData>${sheet}</sheetData></worksheet>`),
    "xl/sharedStrings.xml": strToU8(`<sst>${s.map((x) => `<si><t xml:space="preserve">${x}</t></si>`).join("")}</sst>`),
  }));
  return file;
}

// Antworten: Name → Sprachen, Häkchen (Kurztitel), Min, Max
const ANTWORTEN = {
  Anna: { langs: ["Deutsch", "Englisch"], kann: ["Volksschule Linz", "School group", "HTL Steyr", "Company visit"], min: 1, max: 3 },
  Ben: { langs: ["Deutsch"], kann: ["Volksschule Linz", "HTL Steyr", "Familie Maier"], min: 2, max: 2 },
  Clara: { langs: ["Deutsch", "Englisch"], kann: ["Company visit"], min: 1, max: 2 },
  David: { langs: ["Deutsch", "Englisch"], kann: ["School group", "Company visit", "Familie Maier"], min: 0, max: 2 },
  // Eva antwortet nicht
};

/** Gespeicherten Zustand aus IndexedDB lesen (wartet das verzögerte Speichern ab). */
async function zustand(page) {
  await page.waitForTimeout(500);
  for (let versuch = 0; ; versuch++) {
    try {
      return await leseZustand(page);
    } catch (e) {
      if (versuch >= 3) throw e;
      await page.waitForTimeout(500);
    }
  }
}
function leseZustand(page) {
  return page.evaluate(() => new Promise((res, rej) => {
    const r = indexedDB.open("fuehrungsvergabe", 1);
    r.onsuccess = () => {
      const g = r.result.transaction("zustand").objectStore("zustand").get("haupt");
      g.onsuccess = () => res(JSON.parse(g.result));
      g.onerror = () => rej(g.error);
    };
    r.onerror = () => rej(r.error);
  }));
}
const textVon = (page, sel) => page.locator(sel).inputValue();
const linkAus = (msg) => msg.match(/https?:\/\/\S+/)[0];

const server = createServer().listen(PORT);
const browser = await chromium.launch({ executablePath: exe });
const fehler = [];
const beobachte = (page, wer) => {
  page.on("pageerror", (e) => fehler.push(`${wer}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/Failed to load resource/.test(m.text()) && fehler.push(`${wer}: ${m.text()}`));
  page.on("dialog", (d) => d.accept());
};

try {
  // ===== Koordinator:in (Laptop) =====
  const kctx = await browser.newContext({ viewport: { width: 1366, height: 900 }, permissions: ["clipboard-read", "clipboard-write"], acceptDownloads: true, locale: "de-AT" });
  const k = await kctx.newPage();
  beobachte(k, "Koordinator:in");
  await k.goto(BASE);
  await k.getByText("Ich bin Koordinator:in").click();
  await k.getByRole("button", { name: "Neue Runde anlegen" }).click();
  await k.fill("#von", "2026-11-01");
  await k.fill("#bis", "2026-11-30");
  await k.fill("#frist", "2026-10-25");
  await k.locator("#frist").blur();
  await k.getByText("Mehrere Namen auf einmal einfügen").click();
  await k.fill("#namen-liste", TEAM.join("\n"));
  await k.getByRole("button", { name: "Alle hinzufügen" }).click();
  assert.equal(await k.locator("table.tabelle tbody tr").count(), 5);
  schritt("Runde mit Zeitraum, Frist und 5 Personen angelegt");

  // Excel: Einfügen
  await k.locator('.tabs button:has-text("2. Führungen")').click();
  await k.getByRole("button", { name: "Aus Excel einfügen" }).click();
  await k.fill("#paste-excel", TSV);
  await k.getByRole("button", { name: "Prüfen" }).click();
  await k.getByRole("button", { name: "4 fehlerfreie Zeilen übernehmen" }).click();
  // Excel: Datei
  const [chooser] = await Promise.all([k.waitForEvent("filechooser"), k.getByRole("button", { name: "Excel-Datei laden" }).click()]);
  await chooser.setFiles(xlsxDatei());
  await k.getByRole("button", { name: "2 fehlerfreie Zeilen übernehmen" }).click();
  let st = await zustand(k);
  let r = Object.values(st.rounds)[0];
  assert.equal(r.tours.length, 6);
  assert.deepEqual(r.tours.find((t) => t.ort === "Dom").fix, ["Clara"]);
  assert.equal(r.tours.find((t) => t.kurztitel === "Volksschule Linz").beschreibung, "24 Kinder\nTreffpunkt Haupteingang");
  assert.deepEqual(r.tours.filter((t) => t.sprache === "EN").map((t) => t.kurztitel).sort(), ["Company visit", "School group"]);
  assert.equal(r.tours.find((t) => t.kurztitel === "Company visit").datum, "2026-11-21");
  await k.screenshot({ path: `${OUT}koordinator-fuehrungen.png`, fullPage: true });
  schritt("6 Führungen per Excel-Einfügen (4) und .xlsx-Datei (2) übernommen, inkl. Fix, beider Sprachen, mehrzeiliger Beschreibung");

  // Link 1
  await k.locator('.tabs button:has-text("3. Link 1")').click();
  await k.getByLabel("Langtext (Beschreibung) mitschicken").check();
  await k.locator("#link1").getByRole("button", { name: "Nachricht kopieren" }).click();
  const link1Msg = await k.evaluate(() => navigator.clipboard.readText());
  assert.match(link1Msg, /Bitte melde dich bis 25\.10\./);
  const link1 = linkAus(link1Msg);
  assert.ok(link1.startsWith(`${BASE}#R1.`));
  st = await zustand(k);
  r = Object.values(st.rounds)[0];
  assert.equal(r.sentRev, r.rev, "Link 1 gilt nach dem Kopieren als verschickt");
  schritt(`Link 1 erzeugt und kopiert (${link1Msg.length} Zeichen)`);

  // ===== Personen (Handy) =====
  const antwortNachrichten = [];
  for (const [name, a] of Object.entries(ANTWORTEN)) {
    const pctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0 Mobile Safari/537.36", locale: "de-AT" });
    const p = await pctx.newPage();
    beobachte(p, name);
    if (name === "David") {
      // Weg 2: ganze Nachricht kopiert und in der App eingefügt
      await p.goto(BASE);
      await p.fill("#einfuegen", `[14.10., 18:03] Koordinator:in: ${link1Msg}`);
      await p.getByRole("button", { name: "Öffnen" }).click();
    } else {
      await p.goto(link1); // Weg 1: Link angetippt
    }
    await p.waitForSelector("#pname");
    assert.equal(new URL(p.url()).hash, "", "Daten werden aus der Adresszeile entfernt");
    await p.selectOption("#pname", name);
    for (const l of a.langs) await p.locator(`.chip:has-text("${l}")`).click();
    for (const kt of a.kann) await p.locator(`label.fuehrung:has-text("${kt}") input`).check();
    if (name === "Clara") {
      assert.ok(await p.locator('label.fuehrung:has-text("Seniorenbund") input').isDisabled(), "Fix-Führung ist gesperrt");
      assert.ok(await p.locator('label.fuehrung:has-text("Seniorenbund") input').isChecked(), "Fix-Führung ist angehakt");
    }
    assert.ok(await p.getByRole("button", { name: "Antwort erstellen" }).isDisabled(), "ohne Min/Max keine Antwort");
    // Erster Tipp auf „+“ setzt 0, jeder weitere +1; „+“ bei Max ist gesperrt, sobald alle möglichen erreicht sind
    const plus = p.locator('[data-k="max"][data-d="1"]');
    for (let i = 0; i < 10 && !(await plus.isDisabled()); i++) await plus.click();
    const moeglich = a.kann.length + (name === "Clara" ? 1 : 0);
    assert.equal(+(await p.locator("#wert-max").textContent()), moeglich, "Max ist auf mögliche Führungen begrenzt");
    while (+(await p.locator("#wert-max").textContent()) > a.max) await p.locator('[data-k="max"][data-d="-1"]').click();
    for (let i = 0; i <= a.min; i++) await p.locator('[data-k="min"][data-d="1"]').click();
    assert.equal(+(await p.locator("#wert-min").textContent()), a.min);
    await p.getByRole("button", { name: "Antwort erstellen" }).click();
    const msg = await textVon(p, "#antwort textarea");
    assert.match(msg, new RegExp(`Rückmeldung Führungsvergabe von ${name}`));
    antwortNachrichten.push(msg);
    if (name === "Anna") await p.screenshot({ path: `${OUT}person-rueckmeldung.png`, fullPage: true });
    await pctx.close();
  }
  schritt("4 von 5 Personen haben am Handy geantwortet (3× Link angetippt, 1× Nachricht eingefügt); Eva antwortet nicht");

  // Antworten bei dem:der Koordinator:in: drei per Einfügen (auf einmal), eine per Klick auf den Link
  await k.locator('.tabs button:has-text("4. Rückmeldungen")').click();
  await k.fill("#antworten-text", antwortNachrichten.slice(0, 3).join("\n[15.10., 09:12] Jemand: Danke!\n"));
  await k.getByRole("button", { name: "Übernehmen", exact: true }).click();
  await k.waitForTimeout(300);
  if ((await k.locator(".hinweise li.gut").count()) !== 3) { await k.screenshot({ path: `${OUT}fehler-antworten.png`, fullPage: true }); console.log(await k.locator(".karte").first().innerText()); }
  assert.equal(await k.locator(".hinweise li.gut").count(), 3);
  const tab2 = await kctx.newPage();
  beobachte(tab2, "Koordination, Tab 2");
  await tab2.goto(linkAus(antwortNachrichten[3]));
  await tab2.waitForSelector('.tabs button[aria-selected="true"]:has-text("4. Rückmeldungen")');
  await tab2.close();
  await k.waitForSelector('.tabs button:has-text("(4/5)")', { timeout: 5000 });
  st = await zustand(k);
  r = Object.values(st.rounds)[0];
  assert.deepEqual(Object.keys(r.answers).sort(), ["anna", "ben", "clara", "david"]);
  schritt("Antworten übernommen: 3 per Einfügen in einem Rutsch, 1 per Klick auf Link 2 (anderer Tab, gleicher Browser)");

  // Einteilen
  await k.locator('.tabs button:has-text("5. Einteilung")').click();
  await k.getByRole("button", { name: "Einteilen", exact: true }).click();
  await k.waitForSelector("text=Plan – händisch korrigierbar", { timeout: 30000 });
  st = await zustand(k);
  r = Object.values(st.rounds)[0];
  const byKurz = (kt) => r.tours.find((t) => t.kurztitel === kt);
  const plan = r.plan.a;
  const zaehl = (n) => Object.values(plan).flat().filter((x) => x === n).length;
  assert.deepEqual(plan[byKurz("Seniorenbund").id], ["Clara"], "Fix bleibt");
  for (const [n, a] of Object.entries(ANTWORTEN)) assert.ok(zaehl(n) <= a.max, `${n} über Max`);
  assert.equal(zaehl("Eva"), 0, "Eva ohne Antwort wird nicht eingeteilt");
  for (const t of r.tours) for (const n of plan[t.id]) if (n && !t.fix.includes(n)) {
    assert.ok(ANTWORTEN[n].kann.includes(t.kurztitel), `${n} nicht verfügbar für ${t.kurztitel}`);
    if (t.sprache === "EN") assert.ok(ANTWORTEN[n].langs.includes("Englisch"));
  }
  assert.equal(await k.locator("text=Keine Antwort von: Eva").count(), 1);
  await k.screenshot({ path: `${OUT}koordinator-einteilung.png`, fullPage: true });
  schritt(`Einteilung berechnet: ${JSON.stringify(Object.fromEntries(r.tours.map((t) => [t.kurztitel, plan[t.id]])))}`);

  // Korrektur: Eva (ohne Antwort) händisch auf die HTL-Führung setzen → Warnung
  const htl = byKurz("HTL Steyr");
  const sel = k.locator(`select[data-id="${htl.id}"]`).last();
  await sel.selectOption("Eva");
  await k.waitForSelector("text=Eva hat nicht geantwortet");
  st = await zustand(k);
  r = Object.values(st.rounds)[0];
  assert.ok(r.plan.a[htl.id].includes("Eva"));
  assert.equal(r.plan.manual, true);
  schritt("Händische Korrektur übernommen und geprüft („Eva hat nicht geantwortet“)");

  // Link 3 + Gesamtkalender
  await k.locator('.tabs button:has-text("6. Plan")').click();
  await k.getByLabel(/Langtext \(Beschreibung\) mitschicken/).check();
  await k.locator("#link3").getByRole("button", { name: "Nachricht kopieren" }).click();
  const link3Msg = await k.evaluate(() => navigator.clipboard.readText());
  const link3 = linkAus(link3Msg);
  assert.ok(link3.startsWith(`${BASE}#P1.`));
  const [dl] = await Promise.all([k.waitForEvent("download"), k.getByRole("button", { name: "Gesamtkalender herunterladen" }).click()]);
  const ics = readFileSync(await dl.path(), "utf8");
  writeFileSync(`${OUT}gesamt.ics`, ics);
  const unf = ics.replace(/\r\n /g, "");
  assert.equal((unf.match(/BEGIN:VEVENT/g) ?? []).length, 6);
  const htlTitel = `Museum ${[...r.plan.a[htl.id]].filter(Boolean).sort((a, b) => a.localeCompare(b, "de")).join("\\, ")}${r.plan.a[htl.id].includes(null) ? "\\, ??" : ""}`;
  assert.ok(unf.includes(`SUMMARY:${htlTitel}\r\n`), `Titel ${htlTitel}`);
  assert.match(unf, /DTSTART;TZID=Europe\/Vienna:20261107T100000/);
  assert.match(unf, /DESCRIPTION:Volksschule Linz\\n24 Kinder\\nTreffpunkt Haupteingang/);
  assert.ok(!/[^\r]\n/.test(ics), "CRLF");
  schritt(`Link 3 erzeugt (${link3Msg.length} Zeichen) und Gesamtkalender (.ics) geladen: Titel „${htlTitel.replace(/\\,/g, ",")}“`);

  // Person öffnet Link 3 und holt eigene Termine
  const actx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, acceptDownloads: true, locale: "de-AT" });
  const ap = await actx.newPage();
  beobachte(ap, "Anna (Plan)");
  await ap.goto(link3);
  await ap.selectOption("#pname2", "Anna");
  const annaN = zaehl("Anna");
  await ap.waitForSelector(`text=du hast ${annaN} ${annaN === 1 ? "Führung" : "Führungen"}`);
  assert.equal(await ap.locator(".fuehrung.mein").count(), annaN);
  await ap.screenshot({ path: `${OUT}person-plan.png`, fullPage: true });
  const [pdl] = await Promise.all([ap.waitForEvent("download"), ap.getByRole("button", { name: "Meine Termine in den Kalender" }).click()]);
  const pics = readFileSync(await pdl.path(), "utf8").replace(/\r\n /g, "");
  writeFileSync(`${OUT}anna.ics`, pics);
  assert.equal((pics.match(/BEGIN:VEVENT/g) ?? []).length, annaN);
  assert.match(pics, /SUMMARY:\S+ Führung \d{4}/);
  assert.match(pics, /DESCRIPTION:Führung \d\d:\d\d–\d\d:\d\d\\nEingeteilt: /);
  for (const t of r.tours.filter((t) => r.plan.a[t.id].includes("Anna"))) {
    const h = +t.beginn.slice(0, 2) - 1;
    assert.ok(pics.includes(`DTSTART;TZID=Europe/Vienna:${t.datum.replace(/-/g, "")}T${String(h).padStart(2, "0")}${t.beginn.slice(3)}00`), "1 h vorher");
  }
  schritt(`Anna öffnet Link 3, sieht ${annaN} eigene Führungen hervorgehoben und lädt ihre .ics (1 h vorher bis 1 h nachher)`);

  // ===== Flugmodus =====
  await k.evaluate(() => navigator.serviceWorker.ready);
  await kctx.setOffline(true);
  await k.reload();
  await k.waitForSelector(".tabs");
  await k.locator('.tabs button:has-text("5. Einteilung")').click();
  await k.getByRole("button", { name: "Neu einteilen" }).click();
  await k.waitForSelector("text=Einteilung fertig.", { timeout: 30000 });
  await kctx.setOffline(false);
  await ap.evaluate(() => navigator.serviceWorker.ready);
  await actx.setOffline(true);
  await ap.goto(link1);
  await ap.waitForSelector("#pname");
  await actx.setOffline(false);
  schritt("Offline: Koordinator:in lädt neu und teilt neu ein, Person öffnet Link 1 – alles ohne Netz");

  // ===== Sicherung: Gerät A → Gerät B =====
  const [bdl] = await Promise.all([k.waitForEvent("download"), k.getByRole("button", { name: "Sicherung speichern" }).click()]);
  assert.match(bdl.suggestedFilename(), /^fuehrungsvergabe-sicherung-\d{4}-\d{2}-\d{2}\.json$/);
  const backupPfad = `${OUT}${bdl.suggestedFilename()}`;
  await bdl.saveAs(backupPfad);
  await k.waitForTimeout(400);
  const stA = await zustand(k);
  const bctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: "de-AT" });
  const b = await bctx.newPage();
  beobachte(b, "Gerät B");
  await b.goto(BASE);
  await b.getByText("Ich bin Koordinator:in").click();
  const [ch2] = await Promise.all([b.waitForEvent("filechooser"), b.getByRole("button", { name: "Sicherung öffnen" }).first().click()]);
  await ch2.setFiles(backupPfad);
  await b.waitForSelector(".tabs");
  await b.waitForTimeout(400);
  const stB = await zustand(b);
  assert.deepEqual(stB.rounds, stA.rounds);
  assert.equal(stB.currentRoundId, stA.currentRoundId);
  await b.locator('.tabs button:has-text("5. Einteilung")').click();
  await b.waitForSelector("text=Plan – händisch korrigierbar");
  await b.screenshot({ path: `${OUT}geraet-b-einteilung.png`, fullPage: true });
  schritt("Sicherung auf Gerät A gespeichert und auf Gerät B geöffnet: gleicher Stand");

  // Dunkelmodus-Screenshot der Personen-Ansicht
  const dctx = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", isMobile: true, locale: "de-AT" });
  const dp = await dctx.newPage();
  await dp.goto(link1);
  await dp.waitForSelector("#pname");
  await dp.screenshot({ path: `${OUT}person-dunkel.png` });

  assert.deepEqual(fehler, [], `Fehler im Browser:\n${fehler.join("\n")}`);
  console.log(`\nAbnahme bestanden (${schritte.length} Schritte). Dateien in ${OUT}`);
} finally {
  await browser.close();
  server.close();
}
