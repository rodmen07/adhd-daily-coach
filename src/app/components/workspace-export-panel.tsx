"use client";

import { useState } from "react";
import { StatusMessage } from "@/app/components/status-message";
import { downloadWorkspaceExport } from "@/lib/workspace-export";

/**
 * The door onto the workspace export (v0.29 PR2,
 * `docs/design/WORKSPACE_EXPORT.md` D5 and D6).
 *
 * WHY THIS IS A FILE AND NOT JSX INSIDE `page.tsx` (D6)
 * ----------------------------------------------------
 * `src/app/page.tsx` measured 973 lines when v0.29 was defined, against this
 * repo's 1000-line hard candidate line. An inline panel would have crossed it
 * in the same commit that added a feature, which is the one move the code-health
 * bar names outright. The panel is also the only surface in the app that speaks
 * about the export, so it has a seam of its own to sit on.
 *
 * THE TWO STANDING SENTENCES ARE THE POINT OF THE MILESTONE (D5)
 * -------------------------------------------------------------
 * The file this button writes contains what THIS BROWSER holds. For a signed-in
 * person on a Firebase-configured deployment, check-ins, journal entries and
 * focus sessions also live in `users/{uid}/...` in Firestore, and the browser's
 * copy is whatever the local-first store last held. Saying "your data" over a
 * file that carries one backend's half would repeat exactly the defect v0.28
 * removed from `/`: a sentence true about one backend, rendered as if it were
 * true about both. So the second sentence is CONDITIONAL on both facts, and both
 * directions are asserted on the rendered DOM by
 * `src/app/components/__tests__/workspace-export-panel.test.tsx`.
 *
 * The two conditions arrive as two props rather than one pre-computed boolean so
 * that the suite can drive all four combinations. A single `hasAccountData` prop
 * would move the interesting decision to the call site, where nothing tests it.
 *
 * THE CONFIRMATION GOES THROUGH THE SHARED PRIMITIVE (D5)
 * ------------------------------------------------------
 * `StatusMessage` with `tone="notice"`, so politeness is DERIVED rather than
 * hand-spelled: this panel cannot disagree with the rest of the app about how
 * loudly a routine confirmation speaks. Worth stating plainly, because it is the
 * kind of claim that reads as guaranteed and is not:
 * `status-message-guard` scans `page.tsx` files only, so it does NOT hold this
 * component to that bar. What holds it is the assertion in this component's own
 * suite that the confirmation renders `aria-live="polite"` and no `role="alert"`
 * — a rendered-DOM check rather than a source scan, which is the stronger of
 * the two anyway.
 */

type WorkspaceExportPanelProps = {
  /**
   * The scope the person is currently in — `"guest"` or an account id. ONLY this
   * scope is exported (D8): one browser can hold a guest workspace beside one or
   * more signed-in workspaces, and exporting all of them would hand whoever
   * clicks the button the contents of every account that ever signed in on a
   * shared laptop.
   */
  storageScope: string;
  /** Whether this deployment has Firebase configured at all. */
  firebaseConfigured: boolean;
  /** Whether somebody is signed in right now. */
  signedIn: boolean;
};

export function WorkspaceExportPanel({
  storageScope,
  firebaseConfigured,
  signedIn,
}: WorkspaceExportPanelProps) {
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [confirmedScope, setConfirmedScope] = useState(storageScope);

  // Signing in or out changes WHICH workspace the button would download, so a
  // confirmation minted for the previous scope stops being true the moment the
  // scope changes. Clearing it during render (the same pattern
  // `ReminderSettingsPanel` uses for its own scope-dependent state) keeps a
  // stale "Copy downloaded." from sitting under a button that would now write a
  // different file.
  if (storageScope !== confirmedScope) {
    setConfirmedScope(storageScope);
    setConfirmation(null);
  }

  function handleDownload() {
    // `downloadWorkspaceExport` answers false when there is no document to hand
    // a file to (SSR, and the static export's prerender pass). Nothing was
    // downloaded then, so nothing is confirmed.
    setConfirmation(downloadWorkspaceExport({ scope: storageScope }) ? "Copy downloaded." : null);
  }

  return (
    <section
      className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--field)] px-3 py-3"
      aria-label="Your data"
    >
      <p className="eyebrow !mb-0">Your data</p>

      <p className="mt-2 text-sm leading-6 text-slate-700">
        Everything saved in this browser, in one file you can keep.
      </p>

      {firebaseConfigured && signedIn ? (
        <p className="field-hint mt-2" data-testid="workspace-export-account-note">
          Entries that live only in your account are not in this file.
        </p>
      ) : null}

      <div className="mt-3">
        <button className="secondary-button" type="button" onClick={handleDownload}>
          Download a copy
        </button>
      </div>

      <StatusMessage
        className="mt-3"
        tone="notice"
        message={confirmation}
        data-testid="workspace-export-status"
      />
    </section>
  );
}
