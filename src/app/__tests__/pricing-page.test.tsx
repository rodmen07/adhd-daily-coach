import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PricingPage from "@/app/pricing/page";

// `useCoachAuth` is left REAL so the failure message under test comes from the
// hook failing for a real reason (no Firebase configuration) rather than from a
// mock agreeing with the assertion. Only the config read is stubbed.
vi.mock("@/lib/firebase", () => ({
  isFirebaseConfigured: vi.fn(() => false),
  loadFirebaseAuth: vi.fn(async () => null),
  loadFirebaseFirestore: vi.fn(async () => null),
}));

afterEach(() => {
  cleanup();
});

describe("Pricing page", () => {
  it("renders monetization details and core calls to action", () => {
    window.localStorage.clear();
    render(<PricingPage />);

    expect(screen.getByText("Membership")).toBeTruthy();
    expect(screen.getByText("Simplicity first, no tiers.")).toBeTruthy();
    expect(screen.getByText("30 Days Free")).toBeTruthy();

    expect(screen.getByRole("button", { name: "Sign in to start 30-day Free Trial" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to dashboard" }).getAttribute("href")).toBe("/");
    // Nothing has failed yet, so the checkout page announces nothing.
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("announces a sign-in failure in an assertive live region", async () => {
    // This page is the checkout entry point: until v0.15 a failed sign-in here
    // showed the person nothing at all, on the one route whose whole job is to
    // convert them.
    window.localStorage.clear();
    render(<PricingPage />);

    fireEvent.click(screen.getByRole("button", { name: "Sign in to start 30-day Free Trial" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Google login is not configured yet.");
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });
});
