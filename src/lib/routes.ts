/**
 * The one place the app writes down what a route IS.
 *
 * Before v0.22 four independent hardcoded lists decided where a person could
 * go, and no test compared any of them to the routes that exist:
 * `NAV_LINKS` in `site-nav.tsx`, `GO_TO_TARGETS` and `SHORTCUT_ROWS` in
 * `keyboard-help.tsx`, and the dashboard action rail. Two defects fell out of
 * that split, both visible to a first-time visitor and both editorial rather
 * than technical: `/now` shipped in no navigation surface at all, and
 * `/monetization` - an internal analytics view by its own copy - sat in the
 * primary nav one slot after Pricing.
 *
 * With one list those stop being oversights and become one-field decisions.
 * `src/app/__tests__/route-registry-guard.test.ts` reads this module against
 * the real `src/app` tree and against the rendered nav, so a fourteenth route
 * is judged the moment its `page.tsx` exists.
 *
 * Scope, deliberately: this registry answers "where can I go", not "what comes
 * next". `SwipeStepCard`'s `previousHref`/`nextHref` encode the daily task
 * SEQUENCE (focus, then execute, then review) and stay where they are; folding
 * a sequence into a flat registry would invent a concept the product does not
 * have. Route-level gating also stays out: `subscription-guard.tsx` owns
 * `GATE_EXEMPT_ROUTES`, settled by v0.14.
 *
 * See `docs/design/ROUTE_VOCABULARY.md` (D1-D8) for the decisions and their
 * alternatives.
 */

/**
 * Who a route is FOR. "internal" marks a developer-facing tool that stays live
 * at its URL but does not belong in the front door a stranger meets. It is not
 * an access control: nothing here gates anything, and `audience` exists so
 * "removed from the nav" and "deleted" can never be confused.
 */
export type RouteAudience = "visitor" | "internal";

/**
 * Where a primary-nav route sits in the header (v0.23 D6).
 *
 * "inline" renders as a pill in the header row; "more" lives inside the
 * header's `<details>` disclosure. This is a DECLARED field rather than a
 * position rule ("the first three entries are inline") because a position rule
 * couples "where a route sits in the list" to "whether it is behind the
 * disclosure", so reordering the nav would silently re-slot it - exactly the
 * implicit coupling v0.22 spent two PRs removing.
 */
export type NavSlot = "inline" | "more";

export type RouteEntry = {
  /** Written without a trailing slash, the form every href in the app uses. */
  readonly path: string;
  /** The word a person sees. Nav labels and keyboard-dialog rows share it. */
  readonly label: string;
  /** Whether this route appears in the primary nav, in registry order. */
  readonly inPrimaryNav: boolean;
  /**
   * Where the header puts it. Required on every `inPrimaryNav: true` entry and
   * absent on the others; `route-registry-guard.test.ts` enforces both
   * directions, so a thirteenth nav route cannot be added without deciding.
   */
  readonly navSlot?: NavSlot;
  /** The second key of the `g` chord that reaches this route, if any. */
  readonly goToKey?: string;
  readonly audience: RouteAudience;
};

/**
 * Every shipped route, in the order the primary nav renders them.
 *
 * `/now` sits directly after Dashboard because it is the one route that is
 * useful with no plan, no check-in and no account (v0.22 D4). `/monetization`
 * is last and out of the nav (v0.22 D3); the dashboard's collapsed "Workspace
 * insights" disclosure still links to it, so the person who wants the numbers
 * keeps a path to them.
 *
 * The three `navSlot: "inline"` entries are v0.23 D3, and the rule that picked
 * them is written down rather than left to taste: `/` is where the day is
 * assembled and where the loop returns, `/now` is the one route useful with no
 * plan and no account, and `/slicer` is the largest surface in the app - the
 * one the product names itself after - which until v0.23 PR1 had zero other
 * doors and still has no `g` chord. The three loop steps are deliberately not
 * inline: `SwipeStepCard` already carries `/focus` -> `/execute` -> `/review`
 * -> `/` as swipes, arrow keys and buttons, so they carry each other.
 *
 * Three is a MEASURED number, not a taste: four items (three links plus the
 * More disclosure) is the largest set that stays on one row at 375x667.
 * See `docs/design/NAV_SHAPE.md` D2 for the shapes that were measured and
 * rejected, and `e2e/nav-shape.spec.ts` for the assertion that keeps it true.
 */
export const ROUTES: readonly RouteEntry[] = [
  { path: "/", label: "Dashboard", inPrimaryNav: true, navSlot: "inline", goToKey: "d", audience: "visitor" },
  { path: "/now", label: "Now", inPrimaryNav: true, navSlot: "inline", goToKey: "n", audience: "visitor" },
  { path: "/slicer", label: "Slicer", inPrimaryNav: true, navSlot: "inline", audience: "visitor" },
  { path: "/ambient", label: "Ambient", inPrimaryNav: true, navSlot: "more", audience: "visitor" },
  { path: "/breathe", label: "Breathe", inPrimaryNav: true, navSlot: "more", audience: "visitor" },
  { path: "/challenges", label: "Challenges", inPrimaryNav: true, navSlot: "more", audience: "visitor" },
  { path: "/focus", label: "Focus", inPrimaryNav: true, navSlot: "more", goToKey: "f", audience: "visitor" },
  { path: "/execute", label: "Execute", inPrimaryNav: true, navSlot: "more", goToKey: "e", audience: "visitor" },
  { path: "/review", label: "Review", inPrimaryNav: true, navSlot: "more", goToKey: "r", audience: "visitor" },
  { path: "/trends", label: "Trends", inPrimaryNav: true, navSlot: "more", goToKey: "t", audience: "visitor" },
  { path: "/journal", label: "Journal", inPrimaryNav: true, navSlot: "more", goToKey: "j", audience: "visitor" },
  { path: "/pricing", label: "Pricing", inPrimaryNav: true, navSlot: "more", audience: "visitor" },
  { path: "/monetization", label: "Monetization", inPrimaryNav: false, audience: "internal" },
];

/** The routes the primary nav renders, in registry order. */
export function primaryNavRoutes(): readonly RouteEntry[] {
  return ROUTES.filter((route) => route.inPrimaryNav);
}

/**
 * The primary-nav routes the header renders as pills, in registry order.
 *
 * `primaryNavRoutes()` is deliberately left alone: the header is now two
 * surfaces, but "which routes are in the front door" is still one answer, and
 * anything that needs the whole set (the door census, a future footer) should
 * keep getting it from one place.
 */
export function inlineNavRoutes(): readonly RouteEntry[] {
  return primaryNavRoutes().filter((route) => route.navSlot === "inline");
}

/** The primary-nav routes behind the header's "More" disclosure, in registry order. */
export function moreNavRoutes(): readonly RouteEntry[] {
  return primaryNavRoutes().filter((route) => route.navSlot === "more");
}

/**
 * A registry entry that carries a `g` chord, narrowed so the surfaces that
 * consume one need no cast to read `goToKey`.
 */
export type GoToRoute = RouteEntry & { readonly goToKey: string };

/**
 * The routes reachable by a `g` chord, in registry order.
 *
 * As of v0.22 PR2 this is the ONLY chord list: `keyboard-help.tsx` builds both
 * the table `router.push` reads and the "Go to X" rows the dialog shows from
 * this function (D5, D6), so a chord that does not work and a working chord
 * the dialog hides are both unrepresentable rather than merely guarded against.
 */
export function goToRoutes(): readonly GoToRoute[] {
  return ROUTES.filter((route): route is GoToRoute => route.goToKey !== undefined);
}
