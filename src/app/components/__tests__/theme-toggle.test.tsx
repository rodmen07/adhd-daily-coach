import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ThemeToggle } from "@/app/components/theme-toggle";

describe("ThemeToggle", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    document.documentElement.dataset.theme = "dark";
  });

  it("shows a confirmation panel before switching to light mode", async () => {
    document.documentElement.dataset.theme = "dark";
    window.localStorage.setItem("calm-daily-coach:theme", "dark");

    render(<ThemeToggle />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));

    expect(screen.getByText("Dark mode is the default because it is easier to read. Switch to light mode anyway?")).toBeTruthy();
    expect(window.localStorage.getItem("calm-daily-coach:theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(screen.getByRole("button", { name: "Keep dark mode" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Use light mode" })).toBeTruthy();
  });

  it("keeps dark mode when the user cancels", async () => {
    document.documentElement.dataset.theme = "dark";
    window.localStorage.setItem("calm-daily-coach:theme", "dark");

    render(<ThemeToggle />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep dark mode" }));

    expect(screen.queryByText("Dark mode is the default because it is easier to read. Switch to light mode anyway?")).toBeNull();
    expect(window.localStorage.getItem("calm-daily-coach:theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("switches to light mode when the user confirms", async () => {
    document.documentElement.dataset.theme = "dark";
    window.localStorage.setItem("calm-daily-coach:theme", "dark");

    render(<ThemeToggle />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    fireEvent.click(screen.getByRole("button", { name: "Use light mode" }));

    expect(window.localStorage.getItem("calm-daily-coach:theme")).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(screen.getByRole("button", { name: "Switch to dark mode" })).toBeTruthy();
  });

  it("closes the confirmation panel when the user presses Escape", async () => {
    document.documentElement.dataset.theme = "dark";
    window.localStorage.setItem("calm-daily-coach:theme", "dark");

    render(<ThemeToggle />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Switch to light mode" })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole("button", { name: "Switch to light mode" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Switch to light mode" }), { key: "Escape" });

    expect(screen.queryByText("Dark mode is the default because it is easier to read. Switch to light mode anyway?")).toBeNull();
    expect(window.localStorage.getItem("calm-daily-coach:theme")).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  /**
   * v0.26 PR1 (docs/design/HEADER_ACTIONS.md D3, roadmap done-when 3).
   *
   * Everything above this comment is UNCHANGED by that milestone, and that is
   * the clause: all four flow assertions already queried the control by its
   * accessible name rather than by its text, so dropping the visible label
   * moved no behaviour. The two tests below are the additions - the first pins
   * the label being gone (a jsdom test cannot see 30x30, but it can see that
   * nothing but the accessible name is left to identify the button by), the
   * second pins where the word the button used to carry now lives.
   */
  it("identifies itself by accessible name alone, with no visible text", async () => {
    document.documentElement.dataset.theme = "dark";
    window.localStorage.setItem("calm-daily-coach:theme", "dark");

    render(<ThemeToggle />);

    const toggle = await screen.findByRole("button", { name: "Switch to light mode" });
    expect(
      toggle.textContent,
      "the theme toggle still renders visible text, which is the `.secondary-button` " +
        "padding-around-a-label shape that made it 46 px tall and the tallest control " +
        "in the header",
    ).toBe("");
    // The glyph is a CSS `::before`, so it is not text content and not an
    // accessible name either - the aria-label is the whole name at both themes.
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
  });

  it("names the confirmation in the panel, now that the button cannot carry it", async () => {
    document.documentElement.dataset.theme = "dark";
    window.localStorage.setItem("calm-daily-coach:theme", "dark");

    render(<ThemeToggle />);

    const toggle = await screen.findByRole("button", { name: "Switch to light mode" });
    fireEvent.click(toggle);

    expect(
      screen.getByText("Confirm light mode"),
      "the second step of the light-mode confirmation has no name anywhere: it " +
        "used to be the button's own text, and a label-less button cannot carry it",
    ).toBeTruthy();
    expect(
      toggle.textContent,
      "the pending state put text back on the button, which is the 46 px shape again",
    ).toBe("");
    // The panel still says what it always said, in the same words.
    expect(
      screen.getByText("Dark mode is the default because it is easier to read. Switch to light mode anyway?"),
    ).toBeTruthy();
  });
});