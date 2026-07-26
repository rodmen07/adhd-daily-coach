import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { AuthMessage } from "@/app/components/auth-message";

afterEach(() => {
  cleanup();
});

describe("AuthMessage", () => {
  it("says nothing when there is nothing to say", () => {
    const { container } = render(<AuthMessage message="" />);
    expect(container.innerHTML).toBe("");

    cleanup();
    const nullCase = render(<AuthMessage message={null} />);
    expect(nullCase.container.innerHTML).toBe("");
  });

  it("announces a failure assertively", () => {
    render(<AuthMessage message="Could not sign in right now." />);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toBe("Could not sign in right now.");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });

  it("keeps the class globals.css hangs the dark-theme override on", () => {
    // `html[data-theme="dark"] .text-rose-700` in globals.css is what makes
    // this paragraph readable in the dark theme. The class is a contract with
    // that stylesheet, not styling that can be swapped freely, and it is now
    // shared by every sign-in surface at once.
    render(<AuthMessage message="Could not sign in right now." />);

    expect(screen.getByRole("alert").className).toContain("text-rose-700");
  });
});
