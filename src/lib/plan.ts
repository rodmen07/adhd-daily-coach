import {
  PARSE_FAILURE,
  isRecord,
  readBoundedString,
  readEnum,
  type ParseResult,
} from "@/lib/parse";

const focusAreas = [
  "Career",
  "Communication",
  "Creativity",
  "Deep Work",
  "Finances",
  "Fitness",
  "Hobbies",
  "Home",
  "Learning",
  "Mindfulness",
  "Nutrition",
  "Organization",
  "Relationships",
  "Sleep",
  "Writing",
] as const;

const doseOptions = ["light", "medium", "deep"] as const;

export type FocusArea = (typeof focusAreas)[number];
export type DailyDose = (typeof doseOptions)[number];

/** The longest note the planner accepts, in UTF-16 code units. */
export const NOTES_MAX_LENGTH = 280;

export type DailyPlanInput = {
  focus: FocusArea;
  dose: DailyDose;
  notes?: string;
};

/**
 * Validates a planner input record. Hand-written rather than schema-generated;
 * the primitives and the reason live in `@/lib/parse`.
 *
 * `notes` is optional, so its three states are kept distinct: absent is fine,
 * present-and-within-the-cap is fine, and present-but-not-a-string or over the
 * cap fails the whole record. Treating "absent" and "invalid" alike would let
 * a 5000-character note through as an omitted one.
 */
export const dailyPlanInputSchema = {
  safeParse(value: unknown): ParseResult<DailyPlanInput> {
    if (!isRecord(value)) {
      return PARSE_FAILURE;
    }

    const focus = readEnum(value.focus, focusAreas);
    const dose = readEnum(value.dose, doseOptions);
    if (focus === null || dose === null) {
      return PARSE_FAILURE;
    }

    if (value.notes === undefined) {
      return { success: true, data: { focus, dose } };
    }

    const notes = readBoundedString(value.notes, NOTES_MAX_LENGTH);
    if (notes === null) {
      return PARSE_FAILURE;
    }

    return { success: true, data: { focus, dose, notes } };
  },
};

export type DailyPlan = {
  date: string;
  focus: FocusArea;
  dose: DailyDose;
  minutes: number;
  action: string;
  reflection: string;
  optionalResource: string | null;
  capMessage: string;
};

const actionVariantsMap: Record<FocusArea, Record<DailyDose, readonly string[]>> = {
  Career: {
    light: [
      "Use 5 minutes to prioritize your top career task for today.",
      "Take 5 minutes to update one bullet in your resume or work journal.",
      "Do a 5-minute career check-in: one goal, one next action, one deadline.",
    ],
    medium: [
      "Spend 15 minutes advancing one career project or professional milestone.",
      "Use 15 minutes to draft a concise update for your manager or mentor.",
      "Do a 15-minute career sprint: refine one portfolio item or accomplishment note.",
    ],
    deep: [
      "Use 30 minutes to execute one high-impact career development task end-to-end.",
      "Run a 30-minute career planning block and define next-month targets.",
      "Do a 30-minute professional growth session: strategy, outreach, and follow-up.",
    ],
  },
  Communication: {
    light: [
      "Use 5 minutes to send one clear status update to someone waiting on you.",
      "Take 5 minutes to clarify one message and remove ambiguity before sending.",
      "Do a 5-minute communication cleanup: one concise reply, one clear next step.",
    ],
    medium: [
      "Spend 15 minutes preparing and delivering a difficult message using SBI.",
      "Use 15 minutes to script key points and send a high-clarity communication.",
      "Do a 15-minute communication sprint: align expectations and confirm ownership.",
    ],
    deep: [
      "Hold a 30-minute high-stakes conversation and document what worked.",
      "Use 30 minutes to resolve one communication bottleneck end-to-end.",
      "Run a 30-minute alignment call and capture decisions in writing.",
    ],
  },
  Creativity: {
    light: [
      "Use 5 minutes to sketch, brainstorm, or capture three fresh ideas.",
      "Take 5 minutes to create one rough draft without editing yourself.",
      "Do a 5-minute creative warm-up: prompt, response, and one refinement.",
    ],
    medium: [
      "Spend 15 minutes building a first draft of one creative concept.",
      "Use 15 minutes to iterate one idea into a clearer, stronger version.",
      "Do a 15-minute creative block and ship one small artifact.",
    ],
    deep: [
      "Use 30 minutes to produce and polish one meaningful creative output.",
      "Run a 30-minute creative session from concept to shareable draft.",
      "Do a 30-minute idea-to-output cycle and capture what to improve next.",
    ],
  },
  "Deep Work": {
    light: [
      "Run one 5-minute focus sprint on your most valuable task.",
      "Use 5 minutes to remove distractions and start the single highest-impact task.",
      "Do a 5-minute execution kickoff: define one outcome and begin immediately.",
    ],
    medium: [
      "Run one 15-minute focus block with zero context switching.",
      "Use 15 minutes for uninterrupted deep work on one priority deliverable.",
      "Do a 15-minute concentration block and ship one tiny visible increment.",
    ],
    deep: [
      "Run two 15-minute focus blocks (30 minutes total) and ship one meaningful deliverable.",
      "Do a 30-minute deep work session with a strict single-task scope.",
      "Use 30 minutes to complete the hardest part of your top task.",
    ],
  },
  Finances: {
    light: [
      "Use 5 minutes to review yesterday's spending and categorize key transactions.",
      "Take 5 minutes to log recent purchases and flag one avoidable expense.",
      "Do a 5-minute money check: totals, anomalies, and one quick correction.",
    ],
    medium: [
      "Spend 15 minutes setting this week's spending limits in your budget tracker.",
      "Use 15 minutes to reconcile accounts and update category caps.",
      "Run a 15-minute budget tune-up and define one spending rule for this week.",
    ],
    deep: [
      "Review monthly cash flow for 30 minutes and choose one concrete optimization.",
      "Use 30 minutes to analyze recurring expenses and set one reduction action.",
      "Run a 30-minute financial planning block and lock one savings move.",
    ],
  },
  Fitness: {
    light: [
      "Do a 5-minute movement burst: 90s squats, 90s wall push-ups, 2 minutes of deep breathing.",
      "Take a brisk 5-minute walk and finish with three deep breaths.",
      "Run a 5-minute mobility reset for hips, shoulders, and neck.",
    ],
    medium: [
      "Complete a 15-minute strength circuit: squats, push-ups, rows, and core.",
      "Do a 15-minute interval workout: 45s work and 30s rest across four moves.",
      "Run a 15-minute bodyweight ladder and log your energy after.",
    ],
    deep: [
      "Do a 30-minute workout and log your energy before and after.",
      "Complete a focused 30-minute strength session with short rests.",
      "Run a 30-minute mixed cardio and mobility session, then note recovery level.",
    ],
  },
  Hobbies: {
    light: [
      "Spend 5 minutes organizing your gear, instruments, or materials for your favorite hobby.",
      "Take 5 minutes to read about or discover one new technique.",
      "Use 5 minutes to practice a single tiny skill or movement.",
    ],
    medium: [
      "Spend 15 minutes practicing or working on your current hobby project without distraction.",
      "Use 15 minutes to jam, sketch, or test one new technique.",
      "Spend 15 minutes detailing notes on one hobby challenge to solve.",
    ],
    deep: [
      "Carve out 30 minutes of deep practice, play, or making on your favorite hobby.",
      "Use 30 minutes to complete a meaningful milestone step on your hobby project.",
      "Dedicate 30 minutes to experiment freely with new setups, patterns, or strategies.",
    ],
  },
  Home: {
    light: [
      "Use 5 minutes to reset one small home area you use daily.",
      "Take 5 minutes to complete one quick home maintenance task.",
      "Do a 5-minute home refresh: tidy, wipe, and reset one zone.",
    ],
    medium: [
      "Spend 15 minutes organizing one home space for easier daily use.",
      "Use 15 minutes to complete a focused home upkeep routine.",
      "Do a 15-minute home reset that improves tomorrow morning flow.",
    ],
    deep: [
      "Use 30 minutes to complete a meaningful home improvement or reset task.",
      "Run a 30-minute home systems block: organize, label, and simplify.",
      "Do a 30-minute cleanup and maintenance sprint in one priority area.",
    ],
  },
  Learning: {
    light: [
      "Use 5 minutes to review notes or flashcards from one recent lesson.",
      "Take 5 minutes to define the one concept you want to understand better.",
      "Do a 5-minute learning sprint: one recap, one question, one takeaway.",
    ],
    medium: [
      "Spend 15 minutes studying one concept without multitasking.",
      "Use 15 minutes to watch, read, or practice one targeted learning module.",
      "Do a 15-minute learning block and write a three-bullet summary.",
    ],
    deep: [
      "Use 30 minutes to study a topic, then explain it back in your own words.",
      "Run a 30-minute learning session with notes, practice, and recall.",
      "Do a 30-minute deep dive into one skill and identify the next drill.",
    ],
  },
  Mindfulness: {
    light: [
      "Do a 5-minute breathing session and note your current mood.",
      "Take 5 minutes for a body scan and write one-word emotional state.",
      "Use 5 minutes to pause, breathe, and identify your dominant feeling.",
    ],
    medium: [
      "Complete a 15-minute mindfulness practice and short journal entry.",
      "Do a 15-minute guided meditation followed by one reflective note.",
      "Run a 15-minute reset: breathwork plus a quick gratitude check-in.",
    ],
    deep: [
      "Do a 30-minute guided session and a full values check-in.",
      "Use 30 minutes for mindfulness practice and a focused reflection review.",
      "Run a 30-minute awareness session and document two emotional triggers.",
    ],
  },
  Nutrition: {
    light: [
      "Use 5 minutes to fill a water bottle and choose one nourishing snack.",
      "Take 5 minutes to plan your next meal around protein and produce.",
      "Do a 5-minute food check: water, snack, and one small nutrition win.",
    ],
    medium: [
      "Spend 15 minutes planning meals for the next two days.",
      "Use 15 minutes to assemble a grocery list around one balanced meal plan.",
      "Do a 15-minute nutrition block: prep a lunch, snack, or breakfast plan.",
    ],
    deep: [
      "Use 30 minutes to batch-prep a simple healthy base for the week.",
      "Do a 30-minute nutrition session: meal plan, grocery list, and prep steps.",
      "Review your food habits for 30 minutes and pick one sustainable improvement.",
    ],
  },
  Organization: {
    light: [
      "Use 5 minutes to clear one surface or reset one small workspace.",
      "Take 5 minutes to delete junk, file one document, and close one loop.",
      "Do a 5-minute organization pass: desk, inbox, or app notifications.",
    ],
    medium: [
      "Spend 15 minutes sorting one system: inbox, desk, notes, or calendar.",
      "Use 15 minutes to remove clutter and define one home for important items.",
      "Do a 15-minute reset that makes tomorrow's first task easier.",
    ],
    deep: [
      "Use 30 minutes to reset one room, drawer, or digital workspace.",
      "Run a 30-minute organization session and simplify one repeat workflow.",
      "Do a 30-minute cleanup and document the system you want to keep.",
    ],
  },
  Relationships: {
    light: [
      "Use 5 minutes to send a genuine check-in text to someone you care about.",
      "Take 5 minutes to write a thank-you message or quick appreciation note.",
      "Do a 5-minute relationship touchpoint: reach out, listen, and follow up.",
    ],
    medium: [
      "Spend 15 minutes planning or having a thoughtful conversation.",
      "Use 15 minutes to reconnect with a friend, partner, or family member.",
      "Do a 15-minute relationship block: listen, respond, and share one update.",
    ],
    deep: [
      "Use 30 minutes for a meaningful conversation with full attention.",
      "Run a 30-minute relationship repair or connection block and note what mattered.",
      "Do a 30-minute outreach session: three messages, one call, and one follow-up.",
    ],
  },
  Sleep: {
    light: [
      "Do a 5-minute pre-sleep prep: set your wind-down alarm and dim one light source.",
      "Use 5 minutes to prep your sleep space: water, cool room, and device cutoff.",
      "Take 5 minutes to queue tomorrow's bedtime reminder and clear bedside clutter.",
    ],
    medium: [
      "Run a 15-minute wind-down: no screens, dim lights, and light stretching.",
      "Complete a 15-minute sleep prep routine with breathing and room reset.",
      "Do a 15-minute digital sunset and set up your bedtime cues.",
    ],
    deep: [
      "Audit your sleep environment for 30 minutes and design a tighter bedtime routine.",
      "Run a 30-minute sleep reset: environment check plus next-week bedtime plan.",
      "Use 30 minutes to map sleep blockers and create one concrete nightly protocol.",
    ],
  },
  Writing: {
    light: [
      "Spend 5 minutes drafting a single paragraph or brain-dumping ideas for a draft.",
      "Take 5 minutes to outline three core talking points for your next piece.",
      "Spend 5 minutes listing five writing topics or article headlines.",
    ],
    medium: [
      "Write without editing for 15 minutes to build drafting momentum.",
      "Use 15 minutes to revise, polish, and structure a draft's intro block.",
      "Spend 15 minutes mapping headlines, quotes, and research points.",
    ],
    deep: [
      "Dedicate 30 minutes of deep focus to draft or complete a major section.",
      "Run a 30-minute polishing sprint to format, edit, and finish your piece.",
      "Spend 30 minutes editing complex sections and refining tone clarity.",
    ],
  },
};

const reflectionMap: Record<FocusArea, string> = {
  Career: "What progress did you make toward your next professional milestone?",
  Communication: "Which phrase or framing made your message clearer?",
  Creativity: "What idea became more original or useful after this session?",
  "Deep Work": "What interrupted your focus, and how will you prevent it tomorrow?",
  Finances: "What spending decision today aligns with your long-term goals?",
  Fitness: "What changed in your energy after completing this?",
  Hobbies: "What new trick, technique, or moment during play did you appreciate most?",
  Home: "What home routine now feels easier because of this effort?",
  Learning: "What concept became clearer, and what still needs review?",
  Mindfulness: "What emotion showed up most strongly, and what triggered it?",
  Nutrition: "What food choice today best supported your energy?",
  Organization: "What system or space now feels easier to maintain?",
  Relationships: "What made the connection feel more thoughtful or complete?",
  Sleep: "What is one adjustment that would improve tonight's sleep by 10%?",
  Writing: "What section or concept drafted today feels most compelling?",
};

const resourceMap: Record<FocusArea, string> = {
  Career: "Optional: Save one weekly career objective with a concrete owner and due date.",
  Communication:
    "Optional: Draft key talking points before your next important conversation.",
  Creativity: "Optional: Save one creative prompt for your next session.",
  "Deep Work": "Optional: Use a single-task timer for your next block.",
  Finances: "Optional: Create one spending category alert for this week.",
  Fitness: "Optional: Save a 30-minute bodyweight routine you can repeat tomorrow.",
  Hobbies: "Optional: Follow one high-quality tutorials video on your target skill.",
  Home: "Optional: Save a short daily home reset checklist.",
  Learning: "Optional: Bookmark one course, article, or practice prompt for later.",
  Mindfulness: "Optional: Use a guided breathing app for your next session.",
  Nutrition: "Optional: Save one simple meal template you can repeat this week.",
  Organization: "Optional: Save one repeatable cleanup checklist for your workspace.",
  Relationships: "Optional: Write one appreciation message you can send later today.",
  Sleep: "Optional: Write a 5-step wind-down checklist in your notes app.",
  Writing: "Optional: Free-write in a distraction-free notepad for 5 minutes.",
};

export const FOCUS_AREAS = focusAreas;
export const DOSE_OPTIONS = doseOptions;

const doseMinutes: Record<DailyDose, number> = {
  light: 5,
  medium: 15,
  deep: 30,
};

function stableHash(input: string) {
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 31 + input.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function pickActionVariant(focus: FocusArea, dose: DailyDose, date: string, notes?: string) {
  const variants = actionVariantsMap[focus][dose];
  const seed = `${date}|${focus}|${dose}|${notes ?? ""}`;
  const selected = variants[stableHash(seed) % variants.length];
  return selected;
}

export function buildDailyPlan(input: DailyPlanInput): DailyPlan {
  const minutes = doseMinutes[input.dose];
  const date = new Date().toISOString().slice(0, 10);

  return {
    date,
    focus: input.focus,
    dose: input.dose,
    minutes,
    action: pickActionVariant(input.focus, input.dose, date, input.notes),
    reflection: reflectionMap[input.focus],
    optionalResource: input.dose === "light" ? null : resourceMap[input.focus],
    capMessage: "You reached today's plan. See you tomorrow.",
  };
}
