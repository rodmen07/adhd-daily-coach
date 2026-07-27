/**
 * ADHD Task Slicing Domain Logic
 * 
 * Specifically designed for ADHD minds suffering from executive paralysis/dysfunction.
 * Procedurally slices vague, intimidating tasks into tiny, hyper-actionable, 
 * physical micro-steps (each under 5 minutes) to bridge the activation gap.
 */

import {
  GUEST_SCOPE_KEY,
  guestMigrationMarker,
  migrateGuestRecords,
  type GuestMigrationResult,
} from "@/lib/guest-migration";

export type SlicingDomain = "writing" | "coding" | "cleaning" | "admin" | "study" | "general";

export type IntimidationLevel = "low" | "medium" | "high";

export interface SliceStep {
  id: string;
  text: string;
  minutes: number;
  completed: boolean;
  alternativeText?: string;
  isAlternative?: boolean;
}

export interface SlicedTask {
  id: string;
  title: string;
  domain: SlicingDomain;
  intimidation: IntimidationLevel;
  steps: SliceStep[];
  createdAt: string;
  completedAt?: string;
}

export const SLICING_DOMAINS: { id: SlicingDomain; label: string; emoji: string; description: string }[] = [
  { id: "general", label: "General Errands / Life", emoji: "📌", description: "Vague things you've been putting off" },
  { id: "cleaning", label: "Cleaning / Environment", emoji: "🧼", description: "Tidying, clearing desks, folding laundry" },
  { id: "coding", label: "Programming / Technical", emoji: "💻", description: "Refactoring, hunting bugs, building features" },
  { id: "writing", label: "Writing / Emails", emoji: "✍️", description: "Drafting essays, replying to difficult messages" },
  { id: "admin", label: "Admin / Accounts", emoji: "📁", description: "Paying bills, updating sheets, organizing files" },
  { id: "study", label: "Studying / Reading", emoji: "📚", description: "Reviewing slides, reading complex PDFs, preparation" },
];

/**
 * Procedurally slice an intimidating task name into small 1-5 minute steps.
 * Leverages domain knowledge and keyword matching to offer highly context-relevant microsteps.
 */
export function procedurallySliceTask(
  title: string,
  domain: SlicingDomain,
  intimidation: IntimidationLevel
): SliceStep[] {
  const norm = title.toLowerCase();
  const steps: SliceStep[] = [];
  let stepIdx = 1;

  const addStep = (text: string, minutes: number, alternativeText?: string) => {
    steps.push({
      id: `step-${stepIdx++}`,
      text,
      minutes,
      completed: false,
      alternativeText,
    });
  };

  // 1. ANCHOR STEP (Based on Executive Dysfunction Intimidation Level)
  // High intimidation gets a body/grounding step that requires zero brain power.
  if (intimidation === "high") {
    addStep(
      "Touch your nose, wiggle your toes, and take one deep sigh. Gets you back in your body.",
      1,
      "Drink one sip of water and look out the nearest window for 10 seconds."
    );
  } else if (intimidation === "medium") {
    addStep(
      "Close every unrelated browser tab and take 2 slow, deep breaths.",
      1,
      "Say out loud: 'I am about to focus on this for just five minutes.'"
    );
  }

  // 2. DOMAIN & KEYWORD SPECIFIC MICRO-STEPS
  if (domain === "writing") {
    if (norm.includes("email") || norm.includes("msg") || norm.includes("letter") || norm.includes("reply") || norm.includes("text")) {
      addStep("Open your email draft, type the recipient name, and immediately save it.", 1, "Open a completely blank text document.");
      addStep("Jot down 3 raw bullet points of exactly what you want to convey. No full sentences yet.", 2, "Write down the main reason why you are sending this.");
      addStep("Draft one sentence explaining the core message. Don't touch backspace.", 3, "Draft 'Hi, hope you are well. I wanted to follow up on...'");
      addStep("Format with a greeting ('Best,' or 'Thanks!') and fix obvious typos.", 1);
      addStep("Copy/paste, hit send, and immediately close the email tab.", 2);
    } else if (norm.includes("essay") || norm.includes("paper") || norm.includes("thesis") || norm.includes("report") || norm.includes("article") || norm.includes("doc")) {
      addStep("Create a blank document, name it, and write a funny placeholder title.", 1, "Open your writing software.");
      addStep("Brain-dump a chaotic bullet list of any 3 points/ideas in your head.", 2, "Write down the main thing you want the reader to understand.");
      addStep("Write 50 words of absolute garbage. Unfiltered, fast, and rough.", 3, "Find one quote or reference related to your topic and paste it.");
      addStep("Highlight the best single sentence you've written so far.", 1);
      addStep("Write just two more sentences building on that single thought.", 4);
    } else {
      addStep("Open your word processor and set a larger, comfortable font size.", 1, "Prepare a blank notepad and a pen.");
      addStep("Write a short 3-sentence summary of what this piece is about.", 2);
      addStep("Draft purely the first sentence of your target section.", 3, "Jot down the heading names you will need.");
      addStep("Stand up, stretch for 30 seconds, then write two more sentences.", 4);
    }
  } else if (domain === "coding") {
    if (norm.includes("test") || norm.includes("spec") || norm.includes("unit")) {
      addStep("Open the relevant test suite file or create a blank one.", 1, "Add a console log structure first.");
      addStep("Write a single test declaration with only a failing assertion.", 2, "Write down the assert template code.");
      addStep("Run the test runner and enjoy seeing the satisfying red error.", 1);
      addStep("Write the absolute bare-minimum boilerplate code to get it to turn green.", 4, "Inject dummy return values first.");
    } else if (norm.includes("bug") || norm.includes("fix") || norm.includes("error") || norm.includes("crash") || norm.includes("fail") || norm.includes("issue")) {
      addStep("Open the error logs or stack trace side-by-side with your code.", 2, "Get the exact error message text copied.");
      addStep("Add a single console.log or print statement right before where it crashes.", 2, "Add a debug marker inside the caller.");
      addStep("Isolate, highlight, and read that exact 5-line block of code.", 3);
      addStep("Make one small experimental change to solve the core problem.", 4, "Comment out the offending line to see if compiling succeeds.");
    } else {
      addStep("Open your IDE and close all open tabs except the target file.", 1, "Open just the terminal window first.");
      addStep("Add a code comment block outlining the 3 subtasks this code needs.", 2, "Write down a list of functions you want to write.");
      addStep("Define the function signature or input/output variable declarations.", 2);
      addStep("Write the first 2 lines of real logic or log your input variables to verify.", 4);
    }
  } else if (domain === "cleaning") {
    if ( norm.includes("desk") || norm.includes("table") || norm.includes("workspace") || norm.includes("surface") ) {
      addStep("Pick up all cups, glasses, or dishes and group them together.", 2, "Put all dishes near the sink.");
      addStep("Throw away any obvious wrappers, receipts, or papers.", 2, "Fill a single shopping bag with desk trash.");
      addStep("Stack all loose books, notes, or cards into one single neat pile.", 2, "Slide loose notebooks out of immediate sight.");
      addStep("Wipe down the center of the surface with a tissue or cloth.", 2);
    } else if ( norm.includes("room") || norm.includes("bedroom") || norm.includes("closet") || norm.includes("clothes") || norm.includes("laundry") ) {
      addStep("Throw all dirty clothes on the floor into one central hamper or pile.", 3, "Put away exactly 3 hanging items.");
      addStep("Pick up everything off the floor and place it temporarily onto your bed.", 3, "Clear a single 2-foot zone on the floor.");
      addStep("Put away exactly 4 items from the bed into drawers or shelves.", 2);
      addStep("Wipe or dust one nightstand or cleared shelf section.", 3);
    } else {
      addStep("Put on high-energy music, a podcast, or a brown-noise focus sound.", 1);
      addStep("Pick up exactly 3 items that are completely in the wrong place and move them.", 2);
      addStep("Gather any obvious trash in sight into one trash bag.", 3);
      addStep("Clean one tiny 'island' (e.g., just the laptop lid, or just the keyboard).", 4, "Vacuum/sweep a small square meter.");
    }
  } else if (domain === "admin") {
    if ( norm.includes("tax") || norm.includes("bill") || norm.includes("pay") || norm.includes("money") || norm.includes("invoice") ) {
      addStep("Retrieve your password from your vault or retrieve/open the statement.", 2, "Locate the invoice slip on your desk.");
      addStep("Sip some water, roll your shoulders, and look away for 10 seconds.", 1);
      addStep("Open the bill payment portal and input the digits. Do not click pay yet.", 3, "Log into your bank online portal.");
      addStep("Confirm the payment detail and submit.", 2);
    } else {
      addStep("Close all non-relevant browser window tabs and sit comfortably.", 1);
      addStep("Log into the specific system, application, or online sheet.", 2, "Open a blank spreadsheet for staging.");
      addStep("Locate other necessary details, reference files, or reference links.", 2);
      addStep("Fill out the first 3 input fields or update the first 3 columns of data.", 3, "Format the document headers first.");
      addStep("Save or export, close the file, and reward yourself.", 1);
    }
  } else if (domain === "study") {
    if (norm.includes("read") || norm.includes("book") || norm.includes("article") || norm.includes("pdf")) {
      addStep("Open the text and read ONLY the headers, subheadings, and bold words.", 3, "Read purely the final paragraph summary first.");
      addStep("Read the very first paragraph of the current section.", 3);
      addStep("Highlight or write down exactly one interesting term or sentence.", 2);
    } else {
      addStep("Gather your notebook, pen, study deck, or active slides.", 2, "Open your active bookmark.");
      addStep("Read just the introduction page or a single summary slide.", 3);
      addStep("Write down a single key concept in your own words, no matter how messy.", 2, "Explain what you read out loud to an imaginary companion.");
      addStep("Set a timer for 5 minutes and read/skim purely what we can in that window.", 5);
    }
  } else {
    // General / Miscellaneous fallback
    addStep("Stand up, reach to the ceiling for a stretch, then do a gentle twist.", 1);
    addStep("Set a micro countdown timer for exactly 3 minutes.", 1);
    addStep("Open your task portal or gather the physical materials needed.", 2);
    addStep("Perform the lowest-friction physical action possible (e.g. put shoes on).", 3);
    addStep("Write down a single subsequent step to execute next.", 2);
  }

  // 3. MINDFUL END CHECKPOINT (ADHD closure)
  addStep(
    "Stop immediately. Do a high-five in the air and celebrate taking action!",
    1,
    "Declare out loud: 'I broke the paralysis. Great work!'"
  );

  return steps;
}

// Storage Helpers
const SLICER_STORAGE_KEY_PREFIX = "focus-adhd-coach:slicer";

function getScopedSlicerKey(scope: string): string {
  return `${SLICER_STORAGE_KEY_PREFIX}:${scope}`;
}

export function loadSlicedTasks(scope: string = "guest"): SlicedTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(getScopedSlicerKey(scope));
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error("Failed to load sliced tasks:", e);
    return [];
  }
}

export function saveSlicedTasks(tasks: SlicedTask[], scope: string = "guest"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(getScopedSlicerKey(scope), JSON.stringify(tasks));
  } catch (e) {
    console.error("Failed to save sliced tasks:", e);
  }
}

/**
 * Guest-to-account migration for sliced-task history (v0.17 PR1,
 * docs/design/GUEST_WORKSPACE_MIGRATION.md).
 *
 * Sliced tasks are durable workspace data, not today-scoped working state:
 * `SlicedTask` carries `createdAt`/`completedAt` and `loadSlicedTasks`
 * applies no staleness drop, so a half-completed task sliced weeks ago loads
 * exactly as written. Without this copy, the moment sign-in resolves the
 * page re-keys storage to the account scope and a guest's entire list
 * visibly vanishes.
 *
 * Rides the shared primitive (`migrateGuestRecords`) with the id-identity
 * conflict guard (D3): a guest task whose locally minted `id` the account
 * scope already holds is skipped, everything else is appended after the
 * account's own tasks. Account data wins; the guest copy is never deleted.
 *
 * The write goes through `window.localStorage.setItem` directly rather than
 * `saveSlicedTasks`, ON PURPOSE: `saveSlicedTasks` swallows storage errors
 * for interactive saves, but a swallowed throw here would let the primitive
 * report `migrated` and set the idempotency marker over a copy that never
 * landed. Bare, a quota throw surfaces as `error`, the marker stays unset,
 * and the next load retries - the same deliberately-unguarded-write rule the
 * journal and focus-session migrations follow (PR #113/#115).
 *
 * The marker backend segment is a literal "local" (D4): this store has no
 * backend resolution and no Firestore surface (D6), so there is nothing to
 * resolve.
 */
export function migrateGuestSlicedTasks(
  targetScopeKey: string,
): Promise<GuestMigrationResult> {
  return migrateGuestRecords<SlicedTask>(
    {
      markerKey: guestMigrationMarker(targetScopeKey, "local", "slicer"),
      listGuestRecords: () => loadSlicedTasks(GUEST_SCOPE_KEY),
      conflictGuard: {
        listAccountRecords: async () => loadSlicedTasks(targetScopeKey),
        identityKey: (task) => task.id,
      },
      write: async (task) => {
        const merged = [...loadSlicedTasks(targetScopeKey), task];
        window.localStorage.setItem(
          getScopedSlicerKey(targetScopeKey),
          JSON.stringify(merged),
        );
      },
    },
    targetScopeKey,
  );
}
