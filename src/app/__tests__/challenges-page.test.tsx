import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ChallengesPage from "@/app/challenges/page";
import {
  BROKEN_FORM,
  renderedClassNames,
  tokenClasses,
  WORKING_FORM,
} from "@/__tests__/helpers/rendered-theme";

// The page seeds its date-based "daily recommendation" spotlight from
// `new Date().getDate()` (challenges/page.tsx) and always renders that
// challenge's title, independent of the active category filter. Without a
// pinned clock the "filters micro tasks" test flaked: MICRO_CHALLENGES has
// "Tomorrow's Top Three" (a productivity item) at index 7, and
// `getDate() % 15 === 7` on the 7th and 22nd of any month, so on those days the
// spotlight surfaced that title even after the Mindful filter removed it from
// the list - failing `queryByText("Tomorrow's Top Three").toBeNull()` (a real
// 2026-07-22 CI failure that passed locally on the 21st). Pin the clock to a
// date whose pick is a mindfulness challenge (getDate() 1 -> index 1, "Ambient
// Detail Spotting") so the spotlight never surfaces a productivity title and
// the filter assertion is deterministic. Only Date is faked, so React Testing
// Library's own timers stay real.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 0, 1, 12, 0, 0));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Challenges Page", () => {
  it("renders streak-free progress stats, daily recommendation and complete control filters", () => {
    render(<ChallengesPage />);

    expect(screen.getByText("Micro-Challenges")).toBeTruthy();
    expect(screen.getByText("Challenges Completed")).toBeTruthy();
    expect(screen.getByText("Today's Practice")).toBeTruthy();
    expect(screen.queryByText("Current Streak")).toBeNull();
    expect(screen.queryByText("Longest Streak")).toBeNull();
    expect(screen.getByText("Discover Habits Card")).toBeTruthy();

    expect(screen.getByRole("button", { name: "📋 All Tasks" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "🧘 Mindful" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "⚡ Focus" })).toBeTruthy();
  });

  it("filters micro tasks according to active category selection click", () => {
    render(<ChallengesPage />);

    // Click "🧘 Mindful"
    const mindfulBtn = screen.getByRole("button", { name: "🧘 Mindful" });
    fireEvent.click(mindfulBtn);

    // Let's verify that a productivity-category item is filtered out
    expect(screen.queryByText("Tomorrow's Top Three")).toBeNull();
  });

  // The rendered-DOM half of the theme guard (see ambient-page.test.tsx and
  // css-var-syntax-guard.test.ts): the active-filter classes -
  // `border-(--accent) bg-(--accent)/10 text-(--accent)` (challenges/page.tsx
  // ~line 161) - do not exist in the DOM until a filter other than the default
  // is clicked, so a source scan proves nothing about what this branch paints.
  it("emits only paintable theme tokens, before and after a filter is driven", () => {
    const { container } = render(<ChallengesPage />);

    const idle = renderedClassNames(container);
    expect(idle.match(WORKING_FORM)?.length ?? 0).toBeGreaterThan(10);
    expect(
      idle.match(BROKEN_FORM) ?? [],
      "the idle page renders Tailwind v3 CSS-variable utilities, which v4 " +
        "compiles to invalid declarations a browser drops",
    ).toEqual([]);

    const mindfulBtn = screen.getByRole("button", { name: "🧘 Mindful" });
    const unselected = tokenClasses(mindfulBtn);
    fireEvent.click(mindfulBtn);

    const filtered = renderedClassNames(container);
    expect(
      filtered.match(BROKEN_FORM) ?? [],
      "the active-filter branch renders Tailwind v3 CSS-variable utilities; " +
        "this branch has no markup until a non-default filter is clicked",
    ).toEqual([]);
    // The branch actually rendered: the clicked chip paints differently now.
    expect(tokenClasses(mindfulBtn)).not.toEqual(unselected);
    expect(tokenClasses(mindfulBtn).length).toBeGreaterThan(0);
  });
});
