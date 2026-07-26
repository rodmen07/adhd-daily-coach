import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import JournalPage from "@/app/journal/page";
import { useCoachAuth } from "@/app/hooks/use-coach-auth";
import {
  getJournalPrompt,
  listJournalEntries,
  localDateKey,
  saveJournalEntry,
} from "@/lib/journal";

vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: vi.fn(),
}));

const authMock = {
  authUser: null,
  authMessage: "",
  authConfigured: false,
  signInWithGoogle: vi.fn(),
  signOutUser: vi.fn(),
};

function pastDateKey(daysAgo: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return localDateKey(date);
}

describe("Journal page", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.mocked(useCoachAuth).mockReturnValue(authMock as never);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("invites a first entry with today's prompt and a calm empty history", () => {
    render(<JournalPage />);

    const prompt = getJournalPrompt(localDateKey());
    const textarea = screen.getByLabelText(prompt);
    expect(textarea.tagName).toBe("TEXTAREA");

    // Nothing written yet: saving stays quietly unavailable, never demanded.
    const saveButton = screen.getByRole("button", { name: "Save today's entry" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);

    expect(screen.getByTestId("empty-state-journal")).toBeTruthy();
    expect(screen.getByText("No earlier entries, and that is fine")).toBeTruthy();
  });

  it("does not introduce its own main landmark (the layout owns the single main)", () => {
    // The page content wrapper is a plain div now; the one <main> lives in the
    // root layout so the skip link always has a single, stable target.
    render(<JournalPage />);
    expect(screen.queryByRole("main")).toBeNull();
  });

  it("keeps the save button disabled for whitespace-only drafts", () => {
    render(<JournalPage />);

    fireEvent.change(screen.getByLabelText(getJournalPrompt(localDateKey())), {
      target: { value: "   " },
    });

    const saveButton = screen.getByRole("button", { name: "Save today's entry" });
    expect((saveButton as HTMLButtonElement).disabled).toBe(true);
  });

  it("saving today's entry switches the editor to a gentle read view", async () => {
    render(<JournalPage />);

    const prompt = getJournalPrompt(localDateKey());
    fireEvent.change(screen.getByLabelText(prompt), {
      target: { value: "Grateful for rain on the window." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save today's entry" }));

    // Saving now goes through the async journal-store adapter (v0.9), so the
    // read view appears once that promise settles rather than synchronously.
    await screen.findByTestId("journal-saved-note");

    expect(screen.getByTestId("journal-saved-note").textContent).toBe(
      "Saved for today. One grateful thought is plenty.",
    );
    expect(screen.getByText("Grateful for rain on the window.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit today's entry" })).toBeTruthy();
    expect(screen.queryByLabelText(prompt)).toBeNull();

    const stored = listJournalEntries("guest");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.date).toBe(localDateKey());
  });

  it("shows the read view when today's entry already exists", async () => {
    saveJournalEntry(localDateKey(), "Already written this morning.", "guest");

    render(<JournalPage />);

    // Entries load asynchronously through the journal store on mount now.
    await screen.findByTestId("journal-saved-note");

    expect(screen.getByText("Already written this morning.")).toBeTruthy();
    expect(screen.queryByLabelText(getJournalPrompt(localDateKey()))).toBeNull();
    // Today's entry does not count as history.
    expect(screen.getByTestId("empty-state-journal")).toBeTruthy();
  });

  it("edits today's entry in place instead of adding a second one", async () => {
    saveJournalEntry(localDateKey(), "Original words", "guest");

    render(<JournalPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit today's entry" }));

    const prompt = getJournalPrompt(localDateKey());
    const textarea = screen.getByLabelText(prompt) as HTMLTextAreaElement;
    expect(textarea.value).toBe("Original words");

    fireEvent.change(textarea, {
      target: { value: "Original words, plus the evening light" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save today's entry" }));

    await screen.findByText("Original words, plus the evening light");
    const stored = listJournalEntries("guest");
    expect(stored).toHaveLength(1);
    expect(stored[0]?.text).toBe("Original words, plus the evening light");
  });

  it("lets an edit be abandoned without changing the saved entry", async () => {
    saveJournalEntry(localDateKey(), "Original words", "guest");

    render(<JournalPage />);
    fireEvent.click(await screen.findByRole("button", { name: "Edit today's entry" }));
    fireEvent.change(screen.getByLabelText(getJournalPrompt(localDateKey())), {
      target: { value: "A change of heart" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Keep it as it was" }));

    expect(screen.getByText("Original words")).toBeTruthy();
    expect(listJournalEntries("guest")[0]?.text).toBe("Original words");
  });

  // v0.13 "Bring your data with you". Firebase is unconfigured in tests, so
  // the store resolves to the local backend and the whole copy is observable
  // through real localStorage: no mock stands between the page and the
  // migration, which is what makes this a wiring proof rather than a
  // restatement of journal-store.test.ts.
  describe("guest-to-account migration on first signed-in load", () => {
    function signIn(uid = "user-123") {
      vi.mocked(useCoachAuth).mockReturnValue({
        ...authMock,
        authUser: { uid },
      } as never);
    }

    it("brings entries written signed out along, without deleting the guest copy", async () => {
      saveJournalEntry(pastDateKey(1), "Written before signing in.", "guest");
      signIn();

      render(<JournalPage />);

      expect(await screen.findByText("Written before signing in.")).toBeTruthy();
      expect(listJournalEntries("user-123")[0]?.text).toBe(
        "Written before signing in.",
      );
      // D4: migration copies, it never moves.
      expect(listJournalEntries("guest")[0]?.text).toBe(
        "Written before signing in.",
      );
    });

    it("leaves an entry the account already has on that date untouched", async () => {
      const sharedDate = pastDateKey(1);
      saveJournalEntry(sharedDate, "The guest version.", "guest");
      saveJournalEntry(sharedDate, "The account version.", "user-123");
      signIn();

      render(<JournalPage />);

      expect(await screen.findByText("The account version.")).toBeTruthy();
      expect(screen.queryByText("The guest version.")).toBeNull();
      expect(listJournalEntries("user-123")).toHaveLength(1);
    });

    it("does not migrate anything for a signed-out visitor", async () => {
      saveJournalEntry(pastDateKey(1), "Written before signing in.", "guest");

      render(<JournalPage />);

      await screen.findByText("Written before signing in.");
      // Nothing was copied anywhere: the guest scope is the only one used.
      expect(listJournalEntries("user-123")).toHaveLength(0);
    });
  });

  it("shows earlier entries newest first in modest finite chunks", async () => {
    for (let daysAgo = 1; daysAgo <= 10; daysAgo += 1) {
      saveJournalEntry(pastDateKey(daysAgo), `Thankful note ${daysAgo}`, "guest");
    }

    render(<JournalPage />);

    const visible = await screen.findAllByRole("listitem");
    expect(screen.queryByTestId("empty-state-journal")).toBeNull();

    expect(visible).toHaveLength(7);
    expect(visible[0]?.textContent).toContain("Thankful note 1");
    expect(visible[6]?.textContent).toContain("Thankful note 7");
    expect(screen.queryByText("Thankful note 8")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show earlier entries" }));

    await waitFor(() => {
      expect(screen.getAllByRole("listitem")).toHaveLength(10);
    });
    expect(screen.getByText("Thankful note 10")).toBeTruthy();
    // Everything is visible now, so the invitation quietly leaves.
    expect(screen.queryByRole("button", { name: "Show earlier entries" })).toBeNull();
  });
});
