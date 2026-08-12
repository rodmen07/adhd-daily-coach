import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceExportPanel } from "@/app/components/workspace-export-panel";
import { saveJournalEntry } from "@/lib/journal";
import { saveSlicedTasks } from "@/lib/slicer";
import type { SlicedTask } from "@/lib/slicer";

/**
 * The door onto the workspace export (v0.29 PR2, `docs/design/WORKSPACE_EXPORT.md`
 * D5, D6 and D8), and the ROADMAP done-when clauses 6 and 7.
 *
 * Every sentence this suite asserts is SPELLED OUT here as a literal rather than
 * imported from the component. Importing the string the component renders would
 * make each assertion compare a value against itself, which is the vacuous shape
 * the v0.22 PR2 drift guard fell into and the shape D3 of this milestone's design
 * doc bans outright. Two independent spellings, or it is not a check.
 *
 * The confirmation is asserted on the RENDERED DOM (`aria-live`, the absence of
 * `role`, the tone class), not by grepping the component for
 * `<StatusMessage>`. That matters here for a specific reason worth writing down:
 * `status-message-guard` scans `page.tsx` files only, so it does NOT cover this
 * component, and "the panel is held to that bar by construction" would be false
 * if it were left to that guard. What is asserted below is the observable
 * consequence instead, which is the stronger claim anyway.
 */

const GUEST = "guest";
const ACCOUNT = "account-9";

const STANDING_SENTENCE = "Everything saved in this browser, in one file you can keep.";
const ACCOUNT_SENTENCE = "Entries that live only in your account are not in this file.";
const CONFIRMATION = "Copy downloaded.";

function renderPanel(overrides?: {
  storageScope?: string;
  firebaseConfigured?: boolean;
  signedIn?: boolean;
}) {
  return render(
    <WorkspaceExportPanel
      storageScope={overrides?.storageScope ?? GUEST}
      firebaseConfigured={overrides?.firebaseConfigured ?? false}
      signedIn={overrides?.signedIn ?? false}
    />,
  );
}

function stubDownloadPlumbing() {
  const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:workspace-export");
  const revokeObjectURL = vi.fn();
  Object.assign(URL, { createObjectURL, revokeObjectURL });

  let downloadName = "";
  vi.spyOn(HTMLElement.prototype, "click").mockImplementation(function (this: HTMLElement) {
    downloadName = (this as HTMLAnchorElement).download;
  });

  return { createObjectURL, revokeObjectURL, downloadName: () => downloadName };
}

/** jsdom 24's Blob has no `text()`, so the file is read the way the lib suite reads it. */
function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function slicedTask(title: string): SlicedTask {
  return {
    id: "task-1",
    title,
    domain: "general",
    intimidation: "medium",
    steps: [{ id: "step-1", text: "Open the drawer", minutes: 2, completed: false }],
    createdAt: "2026-08-12T09:00:00.000Z",
  };
}

describe("WorkspaceExportPanel", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("offers the standing sentence and a real, keyboard-reachable button", () => {
    renderPanel();

    expect(screen.getByText(STANDING_SENTENCE)).toBeTruthy();

    // D6: a real <button>, not a div with a click handler. `getByRole` would
    // find an `role="button"` div too, so the tag name is asserted directly -
    // that is what makes it Tab-reachable and Enter/Space-activatable without
    // this component owning any key handling of its own.
    const button = screen.getByRole("button", { name: "Download a copy" });
    expect(button.tagName).toBe("BUTTON");
    expect((button as HTMLButtonElement).type).toBe("button");
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("says nothing about an account when nobody is signed in on a Firebase-configured deployment", () => {
    renderPanel({ firebaseConfigured: true, signedIn: false });

    expect(screen.queryByText(ACCOUNT_SENTENCE)).toBeNull();
    expect(screen.queryByTestId("workspace-export-account-note")).toBeNull();
  });

  it("says nothing about an account for a signed-in person when Firebase is not configured", () => {
    // The half a single `signedIn` prop would have hidden: without Firebase
    // there is no cloud copy, so the file is genuinely everything and the
    // sentence would be a lie in the other direction.
    renderPanel({ storageScope: ACCOUNT, firebaseConfigured: false, signedIn: true });

    expect(screen.queryByText(ACCOUNT_SENTENCE)).toBeNull();
    expect(screen.queryByTestId("workspace-export-account-note")).toBeNull();
  });

  it("says nothing about an account when neither condition holds", () => {
    renderPanel({ firebaseConfigured: false, signedIn: false });

    expect(screen.queryByText(ACCOUNT_SENTENCE)).toBeNull();
  });

  it("names what the file leaves out only when signed in on a Firebase-configured deployment", () => {
    renderPanel({ storageScope: ACCOUNT, firebaseConfigured: true, signedIn: true });

    expect(screen.getByText(ACCOUNT_SENTENCE)).toBeTruthy();
    expect(screen.getByTestId("workspace-export-account-note")).toBeTruthy();
    // The standing sentence never goes away: it is the one true in both states.
    expect(screen.getByText(STANDING_SENTENCE)).toBeTruthy();
  });

  it("downloads the current scope's workspace and confirms through the shared status primitive", async () => {
    const { createObjectURL, revokeObjectURL, downloadName } = stubDownloadPlumbing();
    saveSlicedTasks([slicedTask("the guest's task")], GUEST);
    saveJournalEntry("2026-08-12", "the guest's journal entry", GUEST);

    renderPanel({ storageScope: GUEST });

    // Nothing is announced before the click: the confirmation is transient, and
    // a status line that renders on mount would announce a download nobody ran.
    expect(screen.queryByTestId("workspace-export-status")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Download a copy" }));

    const status = screen.getByTestId("workspace-export-status");
    expect(status.textContent).toBe(CONFIRMATION);
    // D5: through StatusMessage with tone="notice", so politeness is DERIVED.
    // A routine confirmation must not interrupt: polite, and no alert role.
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.getAttribute("role")).toBeNull();
    expect(status.className).toContain("text-amber-700");

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:workspace-export");
    expect(downloadName()).toMatch(/^adhd-daily-coach-workspace-\d{4}-\d{2}-\d{2}\.json$/);

    const parsed = JSON.parse(await readBlobText(createObjectURL.mock.calls[0][0])) as {
      app: string;
      formatVersion: number;
      source: string;
      scope: string;
      stores: Record<string, { value: unknown }>;
    };
    expect(parsed.app).toBe("ADHD Daily Coach");
    expect(parsed.formatVersion).toBe(1);
    expect(parsed.source).toBe("this browser");
    expect(parsed.scope).toBe(GUEST);
    expect((parsed.stores.slicer.value as SlicedTask[])[0].title).toBe("the guest's task");
    // Two stores from two different key namespaces, so the file the button
    // writes is provably the collector's output rather than one lucky store.
    expect(JSON.stringify(parsed.stores.journal.value)).toContain("the guest's journal entry");
  });

  it("exports only the scope the panel was handed, with another scope's workspace sitting beside it", async () => {
    // D8, at the door rather than in the collector: a browser holding a guest
    // workspace AND a signed-in one must not hand either person the other's
    // file. Asserted by VALUE, not by store count - an export missing the
    // account's slicer row for some unrelated reason would pass a count check.
    const { createObjectURL } = stubDownloadPlumbing();
    saveSlicedTasks([slicedTask("the guest's task")], GUEST);
    saveSlicedTasks([slicedTask("the account's task")], ACCOUNT);

    renderPanel({ storageScope: ACCOUNT, firebaseConfigured: true, signedIn: true });
    fireEvent.click(screen.getByRole("button", { name: "Download a copy" }));

    const parsed = JSON.parse(await readBlobText(createObjectURL.mock.calls[0][0])) as {
      scope: string;
      stores: Record<string, { value: unknown }>;
    };
    expect(parsed.scope).toBe(ACCOUNT);
    const titles = (parsed.stores.slicer.value as SlicedTask[]).map((task) => task.title);
    expect(titles).toEqual(["the account's task"]);
    expect(titles).not.toContain("the guest's task");
  });

  it("drops a confirmation that stops being true when the scope changes under it", () => {
    stubDownloadPlumbing();

    const { rerender } = renderPanel({ storageScope: GUEST });
    fireEvent.click(screen.getByRole("button", { name: "Download a copy" }));
    expect(screen.getByTestId("workspace-export-status").textContent).toBe(CONFIRMATION);

    // Signing in changes which workspace the button would write. The old
    // confirmation described the guest file, so leaving it up would claim the
    // account's data had just been downloaded.
    rerender(
      <WorkspaceExportPanel storageScope={ACCOUNT} firebaseConfigured signedIn />,
    );

    expect(screen.queryByTestId("workspace-export-status")).toBeNull();
  });
});
