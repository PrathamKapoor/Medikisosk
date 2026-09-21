/**
 * Static file server for the vanilla clinical console (development and demo use).
 *
 * Serves apps/console/public on 5174 (CONSOLE_ORIGIN) with correct MIME types for ES modules
 * and the import map. No framework, no build step: edit a file, reload the page.
 * API calls go to the same origin expectation as the kiosk dev proxy — run the API on 8080
 * and point the console at it via CONSOLE_API_TARGET, or serve behind a reverse proxy that
 * forwards /api/* to the API.
 */

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../apps/console/public/", import.meta.url));
const PORT = Number(process.env.CONSOLE_PORT ?? 5174);
const API_TARGET = process.env.CONSOLE_API_TARGET ?? "http://127.0.0.1:8080";

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const target = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const joined = normalize(join(ROOT, target));
  // Containment without string-prefix pitfalls: the relative path must not escape.
  const rel = relative(ROOT, joined);
  if (rel === "" || rel.startsWith("..") || rel.includes(`..${sep}`))
    return null;
  return joined;
}

const server = createServer(async (req, res) => {
  try {
    // Reverse-proxy /api/* to the API so the console works from one origin.
    if (req.url.startsWith("/api/")) {
      const target = new URL(req.url, API_TARGET);
      const proxy = await fetch(target, {
        method: req.method,
        headers: req.headers,
        body:
          req.method === "GET" || req.method === "HEAD"
            ? undefined
            : await (async () => {
                const chunks = [];
                for await (const chunk of req) chunks.push(chunk);
                return Buffer.concat(chunks);
              })(),
      });
      res.writeHead(proxy.status, Object.fromEntries(proxy.headers.entries()));
      const buffer = Buffer.from(await proxy.arrayBuffer());
      res.end(buffer);
      return;
    }
    const file = safePath(req.url);
    if (!file) {
      res.writeHead(400, { "content-type": "text/plain" });
      res.end("Bad request");
      return;
    }
    let stats;
    try {
      stats = await stat(file);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    if (!stats.isFile()) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end("Not found");
      return;
    }
    const body = await readFile(file);
    res.writeHead(200, {
      "content-type": MIME[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    res.end(body);
  } catch {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end("Server error");
  }
});

server.listen(PORT, "127.0.0.1", () => {
  process.stdout.write(
    `MediKiosk console at http://127.0.0.1:${PORT} (API → ${API_TARGET})\n`,
  );
});
