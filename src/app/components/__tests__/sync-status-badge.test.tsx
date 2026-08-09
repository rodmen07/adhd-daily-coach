import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncStatusBadge } from "@/app/components/sync-status-badge";

const mockUseCoachAuth = vi.fn();
vi.mock("@/app/hooks/use-coach-auth", () => ({
  useCoachAuth: () => mockUseCoachAuth(),
}));

const mockCreateCheckinStore = vi.fn<(...args: unknown[]) => { backend: string }>();
vi.mock("@/lib/checkin-store", () => ({
  createCheckinStore: (...args: unknown[]) => mockCreateCheckinStore(...args),
}));

function mockBackendValue(backend: string) {
  mockCreateCheckinStore.mockReturnValue({ backend });
}

const signedInUser = { uid: "user-1", email: "me@example.com" };

describe("SyncStatusBadge", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("shows guest local mode when Firebase auth is unconfigured", () => {
    mockUseCoachAuth.mockReturnValue({ authUser: null, authConfigured: false });
    mockBackendValue("local");

    render(<SyncStatusBadge />);

    expect(screen.getByText("GUEST (LOCAL)")).toBeTruthy();
  });

  it("shows cloud synced only when signed in and the store backend is firestore", () => {
    mockUseCoachAuth.mockReturnValue({ authUser: signedInUser, authConfigured: true });
    mockBackendValue("firestore");

    render(<SyncStatusBadge />);

    expect(screen.getByText("CLOUD SYNCED")).toBeTruthy();
  });

  it("shows sync off when firestore mode is configured but unavailable", () => {
    mockUseCoachAuth.mockReturnValue({ authUser: signedInUser, authConfigured: true });
    mockBackendValue("firestore-fallback");

    render(<SyncStatusBadge />);

    expect(screen.getByText("SYNC OFF (LOCAL)")).toBeTruthy();
    expect(screen.queryByText("CLOUD SYNCED")).toBeNull();
  });

  it("shows signed-in local mode when the deployment uses the local backend", () => {
    mockUseCoachAuth.mockReturnValue({ authUser: signedInUser, authConfigured: true });
    mockBackendValue("local");

    render(<SyncStatusBadge />);

    expect(screen.getByText("SIGNED IN (LOCAL)")).toBeTruthy();
    expect(screen.queryByText("CLOUD SYNCED")).toBeNull();
  });

  it("shows local workspace when signed out with auth configured", () => {
    mockUseCoachAuth.mockReturnValue({ authUser: null, authConfigured: true });
    mockBackendValue("local");

    render(<SyncStatusBadge />);

    expect(screen.getByText("LOCAL WORKSPACE")).toBeTruthy();
  });

  it("resolves the backend with signedIn true for a signed-in user", () => {
    mockUseCoachAuth.mockReturnValue({ authUser: signedInUser, authConfigured: true });
    mockBackendValue("firestore");

    render(<SyncStatusBadge />);

    expect(mockCreateCheckinStore).toHaveBeenCalledWith(undefined, { signedIn: true });
  });

  it("resolves the backend with signedIn false when signed out", () => {
    mockUseCoachAuth.mockReturnValue({ authUser: null, authConfigured: true });
    mockBackendValue("local");

    render(<SyncStatusBadge />);

    expect(mockCreateCheckinStore).toHaveBeenCalledWith(undefined, { signedIn: false });
  });

  /**
   * v0.26 D4 and roadmap done-when 8.
   *
   * Everything above is unchanged: the five states still say the same five
   * words, and the backend still resolves the same way. What D4 added is that
   * the badge now has an ACCESSIBLE NAME carrying the sentence that used to
   * live only in `title` - unreachable on touch, unreliable in screen readers,
   * and with no keyboard path at all (design doc section 1f).
   *
   * The jsdom half of the clause is the one that matters here: the name cannot
   * depend on the viewport. That is not a claim about CSS, it is a claim about
   * this component - it reads no width, so one render's name is every render's
   * name. `matchMedia` is spied on rather than assumed, because a JS-driven
   * collapse is precisely the implementation that would make a screen reader's
   * answer depend on the window width, and it would pass a name assertion at a
   * single width. The browser half - that the word really is hidden below the
   * 56rem cap and really does come back above it - is in
   * `e2e/nav-shape.spec.ts`, where there is a layout engine to see it.
   */
  const EXPLANATIONS: ReadonlyArray<readonly [string, string, () => void]> = [
    [
      "GUEST (LOCAL)",
      "Firebase authentication is not configured in environment variables. Local backup enabled",
      () => {
        mockUseCoachAuth.mockReturnValue({ authUser: null, authConfigured: false });
        mockBackendValue("local");
      },
    ],
    [
      "CLOUD SYNCED",
      "Check-ins sync to Firestore. Registered user: me@example.com",
      () => {
        mockUseCoachAuth.mockReturnValue({ authUser: signedInUser, authConfigured: true });
        mockBackendValue("firestore");
      },
    ],
    [
      "SYNC OFF (LOCAL)",
      "Cloud sync is configured but Firestore is unavailable right now. Check-ins are saved on this device",
      () => {
        mockUseCoachAuth.mockReturnValue({ authUser: signedInUser, authConfigured: true });
        mockBackendValue("firestore-fallback");
      },
    ],
    [
      "SIGNED IN (LOCAL)",
      "Signed in as me@example.com, but check-ins stay on this device. Cloud sync is not enabled for this deployment",
      () => {
        mockUseCoachAuth.mockReturnValue({ authUser: signedInUser, authConfigured: true });
        mockBackendValue("local");
      },
    ],
    [
      "LOCAL WORKSPACE",
      "All data saved on your device. Authenticate with Google to back up and sync across devices",
      () => {
        mockUseCoachAuth.mockReturnValue({ authUser: null, authConfigured: true });
        mockBackendValue("local");
      },
    ],
  ];

  it.each(EXPLANATIONS)(
    "gives %s an accessible name that carries its explanation, not just a title attribute",
    (label, explanation, arrange) => {
      arrange();

      render(<SyncStatusBadge />);

      const badge = screen.getByRole("img", { name: `${label}. ${explanation}` });
      // `title` stays for pointer users; it is no longer the ONLY carrier.
      expect(badge.getAttribute("title")).toBe(explanation);
      // The word is still real text in the DOM. The collapse hides it; it must
      // never remove it, or the desktop badge and the phone badge become two
      // different components.
      expect(badge.querySelector(".sync-status-word")?.textContent).toBe(label);
    },
  );

  it("announces the same name at 375 as at 1280, because it never reads the width", () => {
    mockUseCoachAuth.mockReturnValue({ authUser: null, authConfigured: true });
    mockBackendValue("local");
    const matchMedia = vi.spyOn(window, "matchMedia");

    setViewportWidth(375);
    render(<SyncStatusBadge />);
    const narrowName = screen.getByRole("img").getAttribute("aria-label");
    cleanup();

    setViewportWidth(1280);
    render(<SyncStatusBadge />);
    const wideName = screen.getByRole("img").getAttribute("aria-label");

    expect(narrowName, "the badge has no accessible name at all").toBeTruthy();
    expect(
      wideName,
      "the badge announces itself differently at 1280 than at 375, so what a screen " +
        "reader is told about where the data lives depends on the window width",
    ).toBe(narrowName);
    expect(
      narrowName,
      "the accessible name dropped the explanation the title attribute carries, which " +
        "is the whole point of D4: collapsing the word must not collapse the meaning",
    ).toContain("All data saved on your device");
    expect(
      matchMedia,
      "the component read a media query, so the collapse is implemented in JavaScript " +
        "and the accessible name can diverge between widths by construction",
    ).not.toHaveBeenCalled();
  });
});

/** jsdom's `innerWidth` is writable but not settable through an assignment alone. */
function setViewportWidth(width: number) {
  Object.defineProperty(window, "innerWidth", { value: width, configurable: true, writable: true });
  window.dispatchEvent(new Event("resize"));
}
