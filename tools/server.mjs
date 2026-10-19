// Kleiner lokaler Server zum Ausprobieren: liefert app/ unter /fuehrungsvergabe/ aus
// (wie GitHub Pages). Aufruf: node tools/server.mjs [port]
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../app/", import.meta.url));
const PREFIX = "/fuehrungsvergabe/";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm", ".svg": "image/svg+xml", ".png": "image/png", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".md": "text/markdown; charset=utf-8" };

export function createServer() {
  return http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    if (url.pathname === "/" || url.pathname === "/fuehrungsvergabe") {
      res.writeHead(302, { location: PREFIX });
      return res.end();
    }
    if (!url.pathname.startsWith(PREFIX)) {
      res.writeHead(404);
      return res.end("nicht gefunden");
    }
    let rel = decodeURIComponent(url.pathname.slice(PREFIX.length)) || "index.html";
    if (rel.endsWith("/")) rel += "index.html";
    const file = normalize(join(ROOT, rel));
    if (!file.startsWith(ROOT)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "max-age=600" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("nicht gefunden");
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = +(process.argv[2] ?? 8080);
  createServer().listen(port, () => console.log(`http://localhost:${port}${PREFIX}`));
}
