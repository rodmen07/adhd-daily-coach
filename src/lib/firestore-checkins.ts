// Value imports of `firebase/firestore` live INSIDE the async functions below
// (v0.19 PR3, D4): this module is statically imported by checkin-store.ts,
// which page.tsx imports at render time, so a top-level value import here
// would drag the whole Firestore SDK back into the entry chunk. The type
// import is erased at compile time and costs nothing.
import type { Firestore } from "firebase/firestore";
import { FOCUS_AREAS, type FocusArea } from "@/lib/plan";
import type { CheckinInput } from "@/lib/checkin-store";
import type { BrowserCheckin, WeeklySummary } from "@/lib/browser-checkins";

type FirestoreCheckinDoc = CheckinInput & {
  createdAt: string;
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function toDateOnly(value?: string) {
  if (!value) {
    return todayDate();
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return todayDate();
  }

  return parsed.toISOString().slice(0, 10);
}

function createFocusSummary() {
  return Object.fromEntries(
    FOCUS_AREAS.map((focusArea) => [focusArea, { done: 0, skipped: 0 }]),
  ) as Record<FocusArea, { done: number; skipped: number }>;
}

export async function addFirestoreCheckin(
  db: Firestore,
  input: CheckinInput,
  scopeKey: string,
) {
  const { addDoc, collection } = await import("firebase/firestore");

  const payload: FirestoreCheckinDoc = {
    ...input,
    date: toDateOnly(input.date),
    createdAt: new Date().toISOString(),
  };

  await addDoc(collection(db, "users", scopeKey, "checkins"), payload);
}

export async function getFirestoreWeeklySummary(
  db: Firestore,
  endDateInput: string | undefined,
  scopeKey: string,
): Promise<WeeklySummary> {
  const { collection, getDocs, query, where } = await import(
    "firebase/firestore"
  );

  const endDate = new Date(toDateOnly(endDateInput));
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - 6);
  const startKey = startDate.toISOString().slice(0, 10);
  const endKey = endDate.toISOString().slice(0, 10);

  const q = query(
    collection(db, "users", scopeKey, "checkins"),
    where("date", ">=", startKey),
    where("date", "<=", endKey),
  );

  const snapshot = await getDocs(q);
  const byFocus = createFocusSummary();

  let done = 0;
  let skipped = 0;

  for (const doc of snapshot.docs) {
    const item = doc.data() as FirestoreCheckinDoc;
    if (!item.focus || !item.status) {
      continue;
    }

    if (!byFocus[item.focus]) {
      continue;
    }

    byFocus[item.focus][item.status] += 1;
    if (item.status === "done") {
      done += 1;
    } else if (item.status === "skipped") {
      skipped += 1;
    }
  }

  const total = done + skipped;

  return {
    windowStart: startKey,
    windowEnd: endKey,
    total,
    done,
    skipped,
    completionRate: total > 0 ? Number((done / total).toFixed(2)) : 0,
    byFocus,
  };
}

/**
 * Every check-in document in a caller-chosen `days`-long window, sourced from
 * the same `users/{uid}/checkins` collection getFirestoreWeeklySummary reads,
 * with the window parameterized by `days` instead of hardcoded to 7 (v0.11
 * Trends). Returns the raw records rather than a pre-aggregated summary so
 * aggregation happens once, in src/lib/trend-insights.ts, instead of being
 * reimplemented a third time the way getWeeklySummary and
 * getFirestoreWeeklySummary each independently count byFocus today. No new
 * collection, no new rule: still a plain owner-scoped read of `checkins`.
 */
export async function getFirestoreCheckinsInRange(
  db: Firestore,
  days: number,
  endDateInput: string | undefined,
  scopeKey: string,
): Promise<BrowserCheckin[]> {
  const { collection, getDocs, query, where } = await import(
    "firebase/firestore"
  );

  const endDate = new Date(toDateOnly(endDateInput));
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (days - 1));
  const startKey = startDate.toISOString().slice(0, 10);
  const endKey = endDate.toISOString().slice(0, 10);

  const q = query(
    collection(db, "users", scopeKey, "checkins"),
    where("date", ">=", startKey),
    where("date", "<=", endKey),
  );

  const snapshot = await getDocs(q);
  const checkins: BrowserCheckin[] = [];

  for (const docSnapshot of snapshot.docs) {
    const item = docSnapshot.data() as FirestoreCheckinDoc;
    if (!item.date || !item.focus || !item.status) {
      continue;
    }

    checkins.push({
      id: docSnapshot.id,
      date: item.date,
      focus: item.focus,
      dose: item.dose,
      minutes: item.minutes,
      status: item.status,
      skipReason: item.skipReason,
      createdAt: item.createdAt,
    });
  }

  return checkins;
}