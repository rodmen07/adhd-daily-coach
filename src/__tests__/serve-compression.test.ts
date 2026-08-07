/**
 * Behavior-difference test for the E2E harness's gzip content negotiation
 * (v0.20 PR1, docs/ROADMAP.md).
 *
 * GitHub Pages serves this site gzip-compressed; until v0.20 the harness
 * served identity bytes, so every Lighthouse timing the gate asserted was
 * derived from a transfer roughly 3.5x heavier than what a visitor is served
 * (docs/design/PERF_PASS.md section 2, measured live: 1,751,261 B identity vs
 * 494,416 B gzip across the entry document's assets). This suite pins the
 * negotiation itself, by spawning the REAL `e2e/serve.mjs` - the same file
 * `playwright.config.ts` and `lighthouserc.cjs` both launch - and reading raw
 * bytes off the socket with `node:http`, which never decompresses anything
 * behind the test's back.
 *
 * It runs against the REAL static export in `out/` on purpose: the byte-count
 * assertion is only meaningful against the entry document a visitor is
 * served, not a fixture. CI builds before it tests (ci.yml: Build precedes
 * Tests with coverage), so `out/` always exists there; locally, run
 * `npm run build` first. The missing-artifact case is a hard failure with
 * that instruction, never a skip - a skipped gate reports green about a
 * server it never started.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { request } from "node:http";
import path from "node:path";
import { gunzipSync } from "node:zlib";

// The same module next.config.ts, playwright.config.ts and lighthouserc.cjs
// derive the mount point from - never a second copy of the slug.
import { SITE_BASE_PATH } from "../../site-base-path.mjs";

const ROOT = process.cwd();
/** Not 4173: a stale E2E listener (a known local hazard, see the backlog's
 *  playwright entry) must not be able to answer for the server under test. */
const PORT = 4381;
const ENTRY_URL = `http://127.0.0.1:${PORT}${SITE_BASE_PATH}/`;

interface RawResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  /** The body exactly as sent on the wire - never decompressed. */
  body: Buffer;
}

function get(url: string, headers: Record<string, string>): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (chunk: Buffer) => chunks.push(chunk));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        }),
      );
      res.on("error", reject);
    });
    req.on("error", reject);
    req.end();
  });
}

let server: ChildProcess;
let serverOutput = "";

beforeAll(async () => {
  expect(
    existsSync(path.join(ROOT, "out", "index.html")),
    "out/index.html is missing - run `npm run build` first; this suite " +
      "verifies the harness against the real export, so it cannot substitute " +
      "a fixture",
  ).toBe(true);

  server = spawn(process.execPath, [path.join(ROOT, "e2e", "serve.mjs")], {
    env: { ...process.env, E2E_PORT: String(PORT) },
    stdio: ["ignore", "pipe", "pipe"],
  });

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        reject(
          new Error(`e2e/serve.mjs never printed its ready line; saw: ${serverOutput}`),
        ),
      10_000,
    );
    const onData = (chunk: Buffer) => {
      serverOutput += chunk.toString();
      if (serverOutput.includes("[e2e serve] serving")) {
        clearTimeout(timer);
        resolve();
      }
    };
    server.stdout?.on("data", onData);
    server.stderr?.on("data", onData);
    server.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`e2e/serve.mjs exited early (code ${code}): ${serverOutput}`));
    });
  });
}, 15_000);

afterAll(() => {
  server?.kill();
});

describe("e2e/serve.mjs gzip content negotiation (v0.20 PR1)", () => {
  it("serves the entry document gzip-encoded when the client accepts it, and the byte counts differ", async () => {
    const identity = await get(ENTRY_URL, { "accept-encoding": "identity" });
    const gzip = await get(ENTRY_URL, { "accept-encoding": "gzip, deflate, br" });

    expect(identity.status).toBe(200);
    expect(gzip.status).toBe(200);

    // The negotiation itself: the encoded response says so, the identity one
    // carries no content-encoding at all (absent means identity per RFC 9110).
    expect(identity.headers["content-encoding"]).toBeUndefined();
    expect(gzip.headers["content-encoding"]).toBe("gzip");

    // The whole point of the milestone: the wire bytes differ, and the
    // compressed form is smaller. Equal counts would mean the header lied.
    expect(gzip.body.length).toBeLessThan(identity.body.length);

    // And it is the SAME document, not a different resource: decompressing
    // the gzip body reproduces the identity bytes exactly.
    expect(gunzipSync(gzip.body).equals(identity.body)).toBe(true);
  });

  it("tells caches the representation varies on Accept-Encoding", async () => {
    // Lighthouse computes transfer size from what actually crossed the wire;
    // a cache blind to Accept-Encoding could hand the identity bytes to a
    // gzip-accepting client (or vice versa) and quietly change what the gate
    // measures. Both variants must carry the Vary header.
    const identity = await get(ENTRY_URL, { "accept-encoding": "identity" });
    const gzip = await get(ENTRY_URL, { "accept-encoding": "gzip" });
    expect(String(identity.headers.vary ?? "").toLowerCase()).toContain("accept-encoding");
    expect(String(gzip.headers.vary ?? "").toLowerCase()).toContain("accept-encoding");
  });

  it("never compresses for a client that does not accept gzip", async () => {
    // A client that says nothing gets identity too: the harness negotiates,
    // it does not impose. (Real browsers always send Accept-Encoding; the
    // no-header case is the conservative default.)
    const silent = await get(ENTRY_URL, {});
    expect(silent.status).toBe(200);
    expect(silent.headers["content-encoding"]).toBeUndefined();

    // `gzip;q=0` is an explicit refusal, not an acceptance (RFC 9110 12.5.3).
    const refused = await get(ENTRY_URL, { "accept-encoding": "gzip;q=0" });
    expect(refused.status).toBe(200);
    expect(refused.headers["content-encoding"]).toBeUndefined();
  });

  it("leaves already-compressed binary assets alone", async () => {
    // Fonts (woff2) are compressed at rest; gzipping them again wastes CPU
    // and can grow the payload. GitHub Pages does not re-encode them either,
    // and the harness must not diverge from what it mimics.
    const woff2 = findWoff2Asset();
    expect(woff2, "no .woff2 asset found under out/_next/static - the export dropped its fonts?").not.toBeNull();
    const res = await get(`http://127.0.0.1:${PORT}${SITE_BASE_PATH}/${woff2}`, {
      "accept-encoding": "gzip",
    });
    expect(res.status).toBe(200);
    expect(res.headers["content-encoding"]).toBeUndefined();
  });
});

/** First .woff2 under out/_next/static, as a path relative to out/. */
function findWoff2Asset(): string | null {
  const staticDir = path.join(ROOT, "out", "_next", "static");
  if (!existsSync(staticDir)) return null;
  const stack = [staticDir];
  while (stack.length > 0) {
    const dir = stack.pop()!;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith(".woff2")) {
        return path.relative(path.join(ROOT, "out"), full).split(path.sep).join("/");
      }
    }
  }
  return null;
}
