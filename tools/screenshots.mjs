// Erzeugt die Bildschirmfotos für das README (docs/*.png) aus der Demo-Runde.
// Aufruf: node tools/screenshots.mjs   (braucht Playwright + Chromium)
import { existsSync, mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { createServer } from "./server.mjs";

const OUT = new URL("../docs/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const PORT = 8766;
const BASE = `http://localhost:${PORT}/fuehrungsvergabe/`;
const exe = process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
const ohneToast = "#toast, #update { display: none !important; } header.top { position: static !important; }";

const server = createServer().listen(PORT);
const browser = await chromium.launch({ executablePath: exe });
try {
  const k = await (await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: "de-AT", permissions: ["clipboard-read", "clipboard-write"] })).newPage();
  k.on("dialog", (d) => d.accept());
  await k.goto(BASE);
  await k.addStyleTag({ content: ohneToast });
  await k.getByText("Ich bin Koordinator:in").click();
  await k.locator(".willkommen").getByRole("button", { name: "Demo-Runde anlegen" }).click();
  await k.locator('.tabs button:has-text("5. Einteilung")').click();
  await k.getByRole("button", { name: "Einteilen", exact: true }).click();
  await k.waitForSelector("text=Plan – händisch korrigierbar");
  await k.addStyleTag({ content: ohneToast });
  await k.screenshot({ path: `${OUT}koordination-einteilung.png`, fullPage: true });

  // Links aus der Demo-Runde für die Personen-Ansicht
  await k.locator('.tabs button:has-text("3. Link 1")').click();
  const link1 = (await k.locator("#link1 textarea").inputValue()).match(/https?:\/\/\S+/)[0];
  await k.locator('.tabs button:has-text("6. Plan")').click();
  const link3 = (await k.locator("#link3 textarea").inputValue()).match(/https?:\/\/\S+/)[0];

  const handy = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "de-AT" };
  for (const [name, link, datei, schritte] of [
    ["Anna", link1, "person-rueckmeldung.png", async (p) => {
      await p.selectOption("#pname", "Anna"); // Sprachen kommen als Vorschlag aus Link 1
      for (const kt of ["Volksschule Linz", "School group Munich", "HTL Steyr"]) await p.locator(`label.fuehrung:has-text("${kt}") input`).check();
      for (let i = 0; i < 2; i++) await p.locator('[data-k="min"][data-d="1"]').click();
      const plus = p.locator('[data-k="max"][data-d="1"]');
      while (!(await plus.isDisabled())) await plus.click();
    }],
    ["Anna", link3, "person-plan.png", async (p) => p.selectOption("#pname2", "Anna")],
  ]) {
    const p = await (await browser.newContext(handy)).newPage();
    await p.goto(link);
    await p.addStyleTag({ content: ohneToast });
    await schritte(p);
    await p.screenshot({ path: `${OUT}${datei}`, fullPage: true });
  }
  console.log(`Bildschirmfotos in ${OUT}`);
} finally {
  await browser.close();
  server.close();
}
