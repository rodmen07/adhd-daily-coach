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

/**
 * What a primary-nav route is ABOUT (v0.24 D3).
 *
 * Four categories, chosen so each one is a thing a person is doing rather than
 * a shelf things were put on: "Today" is the plan and the three steps that
 * work it, "In the moment" is the set that needs no plan and no account,
 * "Looking back" is the archives, "Account" is membership.
 *
 * The union is closed on purpose. A fifth category is a product decision, and
 * making it a `string` would let one arrive as a typo - which is exactly the
 * failure `navSlot` was declared rather than positional to avoid.
 */
export type NavGroup = "Today" | "In the moment" | "Looking back" | "Account";

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
  /**
   * Which category this route belongs to. Required on every `inPrimaryNav:
   * true` entry and absent on the others, the same both-directions shape
   * `navSlot` has, and for the same reason (v0.24 D2): a route belongs to a
   * category because of what it IS, not because of where the header currently
   * puts it. Carrying it only on the `more` entries would mean promoting a
   * route to inline silently deleted its meaning.
   */
  readonly navGroup?: NavGroup;
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
 * doors. The three loop steps are deliberately not inline: `SwipeStepCard`
 * already carries `/focus` -> `/execute` -> `/review` -> `/` as swipes, arrow
 * keys and buttons, so they carry each other.
 *
 * Three is a MEASURED number, not a taste: four items (three links plus the
 * More disclosure) is the largest set that stays on one row at 375x667.
 * See `docs/design/NAV_SHAPE.md` D2 for the shapes that were measured and
 * rejected, and `e2e/nav-shape.spec.ts` for the assertion that keeps it true.
 *
 * As of v0.24 D6 every front-door route carries a `g` chord. Before it, seven
 * did and five did not, and the split had no principle behind it: `/slicer`,
 * `/ambient`, `/breathe`, `/challenges` and `/pricing` were reachable from the
 * keyboard only by tabbing into the disclosure and through it. A chord is
 * invisible until a reader presses `?`, so it costs nothing to the person who
 * never does - unlike a nav pill, which every reader pays for on every page.
 */
export const ROUTES: readonly RouteEntry[] = [
  { path: "/", label: "Dashboard", inPrimaryNav: true, navSlot: "inline", navGroup: "Today", goToKey: "d", audience: "visitor" },
  { path: "/now", label: "Now", inPrimaryNav: true, navSlot: "inline", navGroup: "In the moment", goToKey: "n", audience: "visitor" },
  { path: "/slicer", label: "Slicer", inPrimaryNav: true, navSlot: "inline", navGroup: "Today", goToKey: "s", audience: "visitor" },
  { path: "/ambient", label: "Ambient", inPrimaryNav: true, navSlot: "more", navGroup: "In the moment", goToKey: "a", audience: "visitor" },
  { path: "/breathe", label: "Breathe", inPrimaryNav: true, navSlot: "more", navGroup: "In the moment", goToKey: "b", audience: "visitor" },
  { path: "/challenges", label: "Challenges", inPrimaryNav: true, navSlot: "more", navGroup: "In the moment", goToKey: "c", audience: "visitor" },
  { path: "/focus", label: "Focus", inPrimaryNav: true, navSlot: "more", navGroup: "Today", goToKey: "f", audience: "visitor" },
  { path: "/execute", label: "Execute", inPrimaryNav: true, navSlot: "more", navGroup: "Today", goToKey: "e", audience: "visitor" },
  { path: "/review", label: "Review", inPrimaryNav: true, navSlot: "more", navGroup: "Today", goToKey: "r", audience: "visitor" },
  { path: "/trends", label: "Trends", inPrimaryNav: true, navSlot: "more", navGroup: "Looking back", goToKey: "t", audience: "visitor" },
  { path: "/journal", label: "Journal", inPrimaryNav: true, navSlot: "more", navGroup: "Looking back", goToKey: "j", audience: "visitor" },
  { path: "/pricing", label: "Pricing", inPrimaryNav: true, navSlot: "more", navGroup: "Account", goToKey: "p", audience: "visitor" },
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

/** One category and the entries in it, in registry order. */
export type NavGroupSection<T extends RouteEntry = RouteEntry> = {
  readonly group: NavGroup;
  readonly routes: readonly T[];
};

/**
 * The categories in registry order, derived from `ROUTES` (v0.24 D3).
 *
 * "Registry order" is deliberately a property of the WHOLE registry rather
 * than of whatever subset is being rendered. Ordering each surface by first
 * appearance in its own list sounds equivalent and is not: the "More" panel
 * holds no `/` and no `/now`, so its first Today entry is `/focus` and its
 * first In-the-moment entry is `/ambient`, which puts In the moment FIRST
 * there and Today first in the keyboard dialog - two surfaces teaching a
 * reader two different shapes for the same twelve routes. The guard's
 * cross-surface assertion caught exactly that during v0.24 PR1; this function
 * is the fix, and `route-registry-guard.test.ts` keeps it fixed.
 */
export function navGroupOrder(): readonly NavGroup[] {
  const order: NavGroup[] = [];

  for (const route of ROUTES) {
    if (route.navGroup !== undefined && !order.includes(route.navGroup)) {
      order.push(route.navGroup);
    }
  }

  return order;
}

/**
 * Split a list of registry entries into its categories (v0.24 D3, D5).
 *
 * Two ordering rules, both derived from the registry rather than written down
 * anywhere: the GROUPS come out in `navGroupOrder()`, and the routes INSIDE
 * each group keep their input order. So the one list in this file decides the
 * order of the "More" panel's headings and the keyboard dialog's headings at
 * once, and a category that is re-ordered moves both.
 *
 * A group with no member in the input renders nothing at all rather than an
 * empty section, which is D4's "no heading over an empty list" - and it is why
 * this returns sections rather than a full four-entry map.
 *
 * Note that a group is NOT contiguous in the registry - `/` is Today and
 * `/now` is In the moment - so this is a real regrouping and not a partition
 * of adjacent runs. That is deliberate: registry order is the order the header
 * renders pills in, and forcing categories to be contiguous would make the
 * taxonomy decide the nav order rather than describe it.
 *
 * Entries with no category are DROPPED rather than collected into an "other"
 * bucket, because a nameless bucket is exactly the undifferentiated list this
 * milestone exists to remove. `route-registry-guard.test.ts` asserts that the
 * sections are a partition of their input, so a dropped entry is a red test
 * rather than a link that quietly stops rendering.
 */
export function navGroupSections<T extends RouteEntry>(
  routes: readonly T[],
): readonly NavGroupSection<T>[] {
  const grouped = routes.filter(
    (route): route is T & { readonly navGroup: NavGroup } => route.navGroup !== undefined,
  );

  return navGroupOrder()
    .map((group) => ({
      group,
      routes: grouped.filter((route) => route.navGroup === group),
    }))
    .filter((section) => section.routes.length > 0);
}

/**
 * The "More" panel's categories: only the groups that actually have something
 * behind the disclosure, so no heading is ever rendered over nothing (D4).
 */
export function moreNavGroups(): readonly NavGroupSection[] {
  return navGroupSections(moreNavRoutes());
}

/**
 * The keyboard dialog's categories. Same function, same registry, so the
 * dialog and the panel cannot disagree about what a route is about - there is
 * nothing to drift, which is why D5 ships no drift guard between the two.
 */
export function goToRouteGroups(): readonly NavGroupSection<GoToRoute>[] {
  return navGroupSections(goToRoutes());
}
