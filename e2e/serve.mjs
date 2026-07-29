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

if (!existsSync(path.join(OUT_DIR, "index.html"))) {
  console.error(`[e2e serve] ${OUT_DIR} has no index.html - run \`npm run build\` first.`);
  process.exit(1);
}

function notFound(res) {
  const notFoundPage = path.join(OUT_DIR, "404.html");
  if (existsSync(notFoundPage)) {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    createReadStream(notFoundPage).pipe(res);
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
    notFound(res);
    return;
  }

  const rel = rawPath.slice(BASE_PATH.length + 1);
  const fsPath = path.normalize(path.join(OUT_DIR, rel));
  // Path-traversal guard: everything served must resolve inside out/.
  if (fsPath !== OUT_DIR && !fsPath.startsWith(OUT_DIR + path.sep)) {
    notFound(res);
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
    notFound(res);
    return;
  }

  res.writeHead(200, {
    "content-type": MIME[path.extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[e2e serve] serving ${OUT_DIR} at http://127.0.0.1:${PORT}${BASE_PATH}/`);
});
