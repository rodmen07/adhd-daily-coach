/**
 * Static server that mimics GitHub Pages' shape for the exported site
 * (docs/design/E2E_SMOKE.md D3): `out/` is mounted under the production
 * basePath, directory URLs serve their `index.html`, the bare basePath
 * 301-redirects to its trailing-slash form (Pages does this), and unknown
 * paths serve the exported `404.html` with a real 404.
 *
 * Deliberately dependency-free: Node's stdlib only, so `dependencies` and
 * `devDependencies` gain nothing for serving (product rule: everything new
 * in v0.16 is dev tooling, and even the tooling stays lean).
 *
 * Requests OUTSIDE the basePath 404 on purpose. Pages serves this site only
 * under the repo-name prefix, so an asset request that escapes it is a
 * basePath regression the suite must see, not silently absorb.
 */
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createGzip } from "node:zlib";

import { SITE_BASE_PATH } from "../site-base-path.mjs";

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
// Playwright passes E2E_BASE_PATH through webServer.env so this server and the
// static export always agree. The fallback keeps `node e2e/serve.mjs` usable
// standalone, and comes from the same site-base-path.mjs that next.config.ts
// builds the export with - never a second copy of the derivation, which could
// be edited alone and desync the server from the artifact it serves.
const BASE_PATH = process.env.E2E_BASE_PATH ?? SITE_BASE_PATH;
const PORT = Number(process.env.E2E_PORT ?? 4173);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
  ".webmanifest": "application/manifest+json",
};

/**
 * Gzip content negotiation (v0.20 PR1, docs/ROADMAP.md): GitHub Pages serves
 * every text asset gzip-compressed, and Lighthouse's simulated throttling
 * derives its timings from transfer size, so an identity-only harness
 * measured a page ~3.5x heavier than what a visitor is served (measured live
 * in docs/design/PERF_PASS.md section 2: 1,751,261 B identity vs 494,416 B
 * gzip across the entry document's assets). Text types are negotiated;
 * already-compressed binaries (woff2, png, jpg, ico) are served as-is, which
 * is also what Pages does.
 */
const COMPRESSIBLE = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".svg",
  ".txt",
  ".webmanifest",
]);

/**
 * True when the request's Accept-Encoding accepts gzip: the token is present
 * (or `*`) and not refused with `q=0` (RFC 9110 12.5.3). No header means no
 * preference stated, and the conservative answer is identity.
 */
function acceptsGzip(req) {
  const header = req.headers["accept-encoding"];
  if (typeof header !== "string" || header.trim() === "") return false;
  for (const part of header.split(",")) {
    const [codingRaw, ...params] = part.split(";");
    const coding = codingRaw.trim().toLowerCase();
    if (coding !== "gzip" && coding !== "x-gzip" && coding !== "*") continue;
    const q = params
      .map((p) => p.trim().toLowerCase())
      .find((p) => p.startsWith("q="));
    if (q !== undefined && Number.parseFloat(q.slice(2)) === 0) continue;
    return true;
  }
  return false;
}

/** Every file response funnels through here so the 200 path and the 404 page
 *  negotiate identically - two copies of this logic could drift, and then
 *  the gate would measure a different encoding than the smoke suite sees. */
function sendFile(req, res, status, filePath) {
  const contentType = MIME[path.extname(filePath)] ?? "application/octet-stream";
  const headers = { "content-type": contentType };
  if (COMPRESSIBLE.has(path.extname(filePath))) {
    // The representation depends on Accept-Encoding either way, so caches
    // must be told even when this particular response is identity.
    headers.vary = "Accept-Encoding";
    if (acceptsGzip(req)) {
      headers["content-encoding"] = "gzip";
      res.writeHead(status, headers);
      createReadStream(filePath).pipe(createGzip()).pipe(res);
      return;
    }
  }
  res.writeHead(status, headers);
  createReadStream(filePath).pipe(res);
}

if (!existsSync(path.join(OUT_DIR, "index.html"))) {
  console.error(`[e2e serve] ${OUT_DIR} has no index.html - run \`npm run build\` first.`);
  process.exit(1);
}

function notFound(req, res) {
  const notFoundPage = path.join(OUT_DIR, "404.html");
  if (existsSync(notFoundPage)) {
    sendFile(req, res, 404, notFoundPage);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("not found");
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
  const rawPath = decodeURIComponent(url.pathname);

  if (rawPath === BASE_PATH) {
    // Pages redirects the bare basePath to its trailing-slash form.
    res.writeHead(301, { location: `${BASE_PATH}/` });
    res.end();
    return;
  }

  if (!rawPath.startsWith(`${BASE_PATH}/`)) {
    notFound(req, res);
    return;
  }

  const rel = rawPath.slice(BASE_PATH.length + 1);
  const fsPath = path.normalize(path.join(OUT_DIR, rel));
  // Path-traversal guard: everything served must resolve inside out/.
  if (fsPath !== OUT_DIR && !fsPath.startsWith(OUT_DIR + path.sep)) {
    notFound(req, res);
    return;
  }

  let filePath = null;
  if (existsSync(fsPath) && statSync(fsPath).isDirectory()) {
    if (!rawPath.endsWith("/")) {
      // trailingSlash: true - directories live at their slash form.
      res.writeHead(301, { location: `${rawPath}/` });
      res.end();
      return;
    }
    filePath = path.join(fsPath, "index.html");
  } else if (existsSync(fsPath)) {
    filePath = fsPath;
  } else if (existsSync(`${fsPath}.html`)) {
    filePath = `${fsPath}.html`;
  } else if (rawPath.endsWith(".__PAGE__.txt")) {
    // Windows-build quirk, verified 2026-07-26: the client runtime prefetches
    // segment payloads at `<route>/__next.<route>.__PAGE__.txt`, and the
    // Linux-built artifact GitHub Pages serves carries exactly that dotted
    // FILE (probed live: HTTP 200, and its bytes match the local nested form
    // below; the slash form 404s live). `next build` on Windows instead
    // writes the same payload as a nested `__next.<route>/__PAGE__.txt`
    // directory entry. Bridge that one spelling so a local Windows run sees
    // the artifact CI and production both see; on a Linux-built out/ the
    // dotted file exists and this branch never runs.
    const nested = path.normalize(
      fsPath.replace(/\.__PAGE__\.txt$/, `${path.sep}__PAGE__.txt`),
    );
    if (nested.startsWith(OUT_DIR + path.sep) && existsSync(nested)) {
      filePath = nested;
    }
  }

  if (!filePath || !existsSync(filePath)) {
    notFound(req, res);
    return;
  }

  sendFile(req, res, 200, filePath);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[e2e serve] serving ${OUT_DIR} at http://127.0.0.1:${PORT}${BASE_PATH}/`);
});
