import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CalmPage from "@/app/ambient/page";

// Mock the Web Audio Synthesizer since web audio is not fully supported in the jsdom test environment
vi.mock("@/lib/audio-synthesizer", () => {
  return {
    CalmAudioSynthesizer: class {
      stop = vi.fn();
      setVolume = vi.fn();
      play = vi.fn();
      getActiveType = vi.fn().mockReturnValue(null);
    },
  };
});

afterEach(() => {
  cleanup();
});

/**
 * Both spellings of a Tailwind CSS-variable utility, read off the RENDERED
 * tree rather than off the source. `src/app/__tests__/css-var-syntax-guard.test.ts`
 * bans the broken one in `src/`; this reads what a browser would actually be
 * handed, in each state the page can be in, which a source scan cannot do -
 * the selected-card classes below do not exist in the DOM until something is
 * playing.
 */
const BROKEN_FORM = new RegExp(`[a-zA-Z-]+-\\[(--[a-zA-Z0-9-]+)\\]`, "g");
const WORKING_FORM = new RegExp(`[a-zA-Z-]+-\\((?:color:)?--[a-zA-Z0-9-]+\\)`, "g");

function renderedClassNames(container: HTMLElement): string {
  return [...container.querySelectorAll("[class]")]
    .map((element) => element.getAttribute("class") ?? "")
    .join(" ");
}

/** The token utilities on one element, e.g. `bg-(--field)`, sorted. */
function tokenClasses(element: Element): string[] {
  const className = element.getAttribute("class") ?? "";
  return [
    ...(className.match(WORKING_FORM) ?? []),
    ...(className.match(BROKEN_FORM) ?? []),
  ].sort();
}

function soundCard(name: string): HTMLElement {
  const button = screen.getByText(name).closest("button");
  if (!button) {
    throw new Error(`no sound card button found around "${name}"`);
  }
  return button;
}

describe("Ambient page", () => {
  it("renders correctly with full sound selection controls", () => {
    render(<CalmPage />);

    expect(screen.getByText("Ambient Noise")).toBeTruthy();
    expect(screen.getByText("Player Controls")).toBeTruthy();
    expect(screen.getByText("Volume")).toBeTruthy();

    expect(screen.getByText("Brown Noise")).toBeTruthy();
    expect(screen.getByText("Voss Pink Noise")).toBeTruthy();
    expect(screen.getByText("Alpha Beats (10Hz)")).toBeTruthy();
    expect(screen.getByText("Celestial Pad")).toBeTruthy();
  });

  it("emits only paintable theme tokens, in the idle state and while playing", () => {
    const { container } = render(<CalmPage />);

    const idle = renderedClassNames(container);
    expect(idle.match(WORKING_FORM)?.length ?? 0).toBeGreaterThan(10);
    expect(
      idle.match(BROKEN_FORM) ?? [],
      "the idle page renders Tailwind v3 CSS-variable utilities, which v4 compiles " +
        "to invalid declarations a browser drops (see css-var-syntax-guard.test.ts)"
    ).toEqual([]);

    fireEvent.click(soundCard("Brown Noise"));

    const playing = renderedClassNames(container);
    expect(
      playing.match(BROKEN_FORM) ?? [],
      "the selected-sound branch renders Tailwind v3 CSS-variable utilities; this " +
        "branch has no markup in the idle state, so only a click reaches it"
    ).toEqual([]);
    expect(playing).not.toBe(idle);
  });

  it("gives the playing sound a visual affordance the other cards do not have", () => {
    // The whole selected/unselected difference on this page is carried by theme
    // tokens - `border-(--accent) bg-(--accent)/10 text-(--foreground)` against
    // `border-(--line) bg-(--field) text-(--muted)`. While those compiled to
    // `border-color: --accent` and friends every one of them was dropped, so the
    // playing card and the stopped cards painted identically and "which sound is
    // on" was legible only from the word inside the badge.
    render(<CalmPage />);

    const stopped = tokenClasses(soundCard("Voss Pink Noise"));
    expect(tokenClasses(soundCard("Brown Noise"))).toEqual(stopped);

    fireEvent.click(soundCard("Brown Noise"));

    const playing = tokenClasses(soundCard("Brown Noise"));
    expect(
      playing,
      "the playing card carries the same theme tokens as a stopped one, so nothing " +
        "distinguishes it visually"
    ).not.toEqual(stopped);
    expect(playing.length).toBeGreaterThan(0);
    expect(tokenClasses(soundCard("Voss Pink Noise"))).toEqual(stopped);
  });

  it("stops the playing sound when the same card is pressed again", () => {
    render(<CalmPage />);

    const stopped = tokenClasses(soundCard("Celestial Pad"));

    fireEvent.click(soundCard("Celestial Pad"));
    expect(tokenClasses(soundCard("Celestial Pad"))).not.toEqual(stopped);

    fireEvent.click(soundCard("Celestial Pad"));
    expect(tokenClasses(soundCard("Celestial Pad"))).toEqual(stopped);
  });
});
