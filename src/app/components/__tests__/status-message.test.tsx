import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatusMessage } from "@/app/components/status-message";

afterEach(() => {
  cleanup();
});

/**
 * The behaviour half of the v0.21 vocabulary. `status-message-guard.test.ts`
 * keeps page files from spelling status markup inline; this file is what makes
 * that worth enforcing, by proving the primitive they delegate to actually
 * announces at the right urgency.
 */
describe("StatusMessage", () => {
  it("says nothing when there is nothing to say", () => {
    for (const message of ["", null, undefined]) {
      const { container } = render(<StatusMessage tone="error" message={message} />);
      expect(container.innerHTML, `a ${String(message)} message must render nothing at all`).toBe("");
      cleanup();
    }
  });

  it("announces an error assertively, and claims the alert role", () => {
    render(<StatusMessage tone="error" message="Could not sign in right now." />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Could not sign in right now.");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
    expect(alert.className).toContain("text-rose-700");
  });

  it("announces success and notice politely, and claims no alert role", () => {
    // The behaviour difference this vocabulary exists for: a caller cannot make
    // a success shout, and cannot make an error whisper, because politeness is
    // derived from tone rather than passed alongside it.
    const cases = [
      { tone: "success" as const, expectedClass: "text-emerald-700" },
      { tone: "notice" as const, expectedClass: "text-amber-700" },
    ];

    for (const { tone, expectedClass } of cases) {
      const { container } = render(<StatusMessage tone={tone} message={`a ${tone}`} />);
      const paragraph = container.querySelector("p");

      expect(paragraph, `${tone} rendered no paragraph`).not.toBeNull();
      expect(paragraph!.getAttribute("aria-live"), `${tone} must be announced politely`).toBe("polite");
      expect(paragraph!.getAttribute("role"), `${tone} must not claim the alert role`).toBeNull();
      expect(paragraph!.className).toContain(expectedClass);
      cleanup();
    }
  });

  it("gives the notice tone a live region at all", () => {
    // `/`'s configuration notice shipped with no `role` and no `aria-live` for
    // the whole of v0.1 through v0.20: it was visible and unannounced. Adopting
    // the primitive is what fixes that, so the absence is asserted directly.
    render(<StatusMessage tone="notice" message="Google login is not configured yet." />);

    const paragraph = screen.getByText("Google login is not configured yet.");
    expect(paragraph.getAttribute("aria-live")).toBe("polite");
  });

  it("layers layout classes without letting a caller restate the tone", () => {
    render(
      <StatusMessage
        tone="success"
        className="status-banner mt-2"
        celebrate
        message="Great work finishing today."
      />,
    );

    const paragraph = screen.getByText("Great work finishing today.");
    expect(paragraph.className).toBe("status-banner mt-2 text-sm text-emerald-700 status-celebrate");
  });

  it("leaves the celebrate class off when the caller does not ask for it", () => {
    render(<StatusMessage tone="success" className="status-banner mt-2" message="Logged." />);

    expect(screen.getByText("Logged.").className).toBe("status-banner mt-2 text-sm text-emerald-700");
  });

  it("renders AuthMessage's exact class string when asked for its shape", () => {
    // `AuthMessage` is a thin delegate over this component as of v0.21, and its
    // own test file asserts the rendered markup unchanged. This is the same
    // contract stated from the primitive's side, so a class-composition change
    // here fails next to the reason rather than two files away.
    render(<StatusMessage tone="error" className="mt-3" message="Could not sign in right now." />);

    expect(screen.getByRole("alert").className).toBe("mt-3 text-sm text-rose-700");
  });
});
