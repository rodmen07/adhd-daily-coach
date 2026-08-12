import { readFile } from "node:fs/promises";
import { test, expect, APP_ROOT } from "./fixtures";

/**
 * v0.29 PR2 - the way out (`docs/design/WORKSPACE_EXPORT.md`, ROADMAP done-when
 * clause 8).
 *
 * Labelled by MILESTONE rather than by a J-number: `E2E_SMOKE.md` names J1, J2
 * and J3 and stops there, and every spec added since (`nav-shape`,
 * `route-identity`) is labelled by the version that added it. Calling this one
 * "J6" would assert a journey ledger with a J4 and a J5 in it, and there is no
 * such thing on disk or in the doc.
 *
 * WHAT THIS PROVES THAT NO JSDOM TEST CAN
 * ---------------------------------------
 * The component suite asserts the panel's behaviour against a STUBBED
 * `URL.createObjectURL`, because jsdom does not implement it: it reads the Blob
 * handed to the stub. That leaves the last link of the chain untested - whether
 * a real browser, handed this exact Blob/anchor/revoke sequence, actually writes
 * a file to disk. It is a genuinely reachable failure and not a hypothetical:
 * `downloadWorkspaceExport` calls `URL.revokeObjectURL(url)` on the line after
 * `anchor.click()`, so if Chromium had not already taken the blob by then, the
 * stubbed suite would stay green while every real download produced nothing.
 *
 * So this journey seeds real data through the real UI in a real browser, clicks
 * the real control, captures the real download, and PARSES THE FILE OFF DISK.
 * The two stores it asserts are written by two different routes (`/journal` and
 * the dashboard's own onboarding), which is what makes the parsed file evidence
 * about the collector rather than about one store.
 *
 * The console-error tripwire from ./fixtures is armed automatically.
 */

const JOURNAL_PATH = `${APP_ROOT}journal/`;
const JOURNAL_ENTRY = "Grateful for a window seat and nowhere to be.";

type ExportedFile = {
  app: string;
  formatVersion: number;
  exportedAt: string;
  source: string;
  scope: string;
  stores: Record<string, { label: string; kind: string; value: unknown }>;
};

test.describe("v0.29: the workspace export", () => {
  test("the button writes a real file whose JSON carries the envelope and the seeded stores", async ({
    page,
  }) => {
    // 1. Seed one store from a route that is not the dashboard, so the file
    //    cannot be explained by whatever `/` itself happens to write.
    await page.goto(JOURNAL_PATH);
    await page.getByPlaceholder("A few words are plenty.").fill(JOURNAL_ENTRY);
    await page.getByRole("button", { name: "Save today's entry" }).click();
    await expect(page.getByTestId("journal-saved-note")).toBeVisible();

    // 2. Reach the dashboard and clear the first-run overlay, which itself
    //    writes the onboarding preference record - the second store.
    await page.goto(APP_ROOT);
    const overlay = page.getByTestId("onboarding-container");
    await expect(overlay).toBeVisible();
    await page.getByRole("button", { name: "Quick start now" }).click();
    await expect(overlay).toHaveCount(0);

    // 3. The panel, in the place D6 says it lives: on `/`, below the reminder
    //    settings, as its own labelled region.
    const panel = page.getByRole("region", { name: "Your data" });
    await expect(panel).toBeVisible();
    await expect(
      panel.getByText("Everything saved in this browser, in one file you can keep."),
    ).toBeVisible();
    // Signed out, so the account sentence must be absent: on a deployment with
    // no Firebase credentials there is no cloud half for it to be true about.
    await expect(
      panel.getByText("Entries that live only in your account are not in this file."),
    ).toHaveCount(0);

    // 4. The click, and the download Chromium actually performed.
    const downloadPromise = page.waitForEvent("download");
    await panel.getByRole("button", { name: "Download a copy" }).click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(
      /^adhd-daily-coach-workspace-\d{4}-\d{2}-\d{2}\.json$/,
    );
    await expect(panel.getByText("Copy downloaded.")).toBeVisible();

    // 5. The file off disk, parsed rather than pattern-matched.
    const savedPath = await download.path();
    const parsed = JSON.parse(await readFile(savedPath, "utf-8")) as ExportedFile;

    expect(parsed.app).toBe("ADHD Daily Coach");
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.source).toBe("this browser");
    expect(parsed.scope).toBe("guest");
    expect(Number.isNaN(Date.parse(parsed.exportedAt))).toBe(false);

    // Both seeded stores are present, each asserted by the value that was typed
    // or chosen in the browser rather than by the store merely existing.
    expect(Object.keys(parsed.stores)).toEqual(
      expect.arrayContaining(["journal", "onboarding"]),
    );
    expect(JSON.stringify(parsed.stores.journal.value)).toContain(JOURNAL_ENTRY);
    expect(parsed.stores.journal.kind).toBe("content");
    expect(parsed.stores.onboarding.kind).toBe("preference");
  });
});
