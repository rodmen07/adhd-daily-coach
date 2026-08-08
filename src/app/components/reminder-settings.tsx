"use client";

import { useEffect, useState } from "react";
import type { AsyncStatus } from "@/lib/async-status";
import { downloadReminderCalendar } from "@/lib/reminder-ics";
import {
  getNotificationPermission,
  requestNotificationPermission,
  showReminderNotification,
  type NotificationPermissionState,
} from "@/lib/reminder-notifications";
import {
  loadReminderPreferences,
  saveReminderPreferences,
  type ReminderChannel,
  type ReminderPreferences,
} from "@/lib/reminder-preferences";
import { startReminderSchedule } from "@/lib/reminder-schedule";

type ReminderSettingsPanelProps = {
  storageScope: string;
  email: string;
  onEmailChange: (value: string) => void;
  onSendEmailDraft: () => void;
  draftStatus: AsyncStatus;
  canSendDraft: boolean;
};

export function ReminderSettingsPanel({
  storageScope,
  email,
  onEmailChange,
  onSendEmailDraft,
  draftStatus,
  canSendDraft,
}: ReminderSettingsPanelProps) {
  const [prefs, setPrefs] = useState<ReminderPreferences>(() => loadReminderPreferences(storageScope));
  const [loadedScope, setLoadedScope] = useState(storageScope);
  const [nudgeVisible, setNudgeVisible] = useState(false);
  const [calendarSaved, setCalendarSaved] = useState(false);
  const [notificationPermission, setNotificationPermission] =
    useState<NotificationPermissionState>(() => getNotificationPermission());

  if (storageScope !== loadedScope) {
    setLoadedScope(storageScope);
    setPrefs(loadReminderPreferences(storageScope));
    setNudgeVisible(false);
    setCalendarSaved(false);
  }

  function updatePrefs(update: Partial<ReminderPreferences>) {
    setCalendarSaved(false);
    setPrefs((prev) => {
      const next = { ...prev, ...update };
      saveReminderPreferences(storageScope, next);
      return next;
    });
  }

  function handleCalendarDownload() {
    setCalendarSaved(downloadReminderCalendar(prefs));
  }

  async function handleAllowNotifications() {
    setNotificationPermission(await requestNotificationPermission());
  }

  // Reflect permission changes made outside the panel (browser site
  // settings) where the Permissions API exists. Purely observational; it
  // never triggers a permission prompt.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.permissions?.query) {
      return;
    }

    let status: PermissionStatus | null = null;
    let cancelled = false;
    const sync = () => setNotificationPermission(getNotificationPermission());

    navigator.permissions
      .query({ name: "notifications" })
      .then((result) => {
        if (cancelled) {
          return;
        }
        status = result;
        result.addEventListener("change", sync);
      })
      .catch(() => {
        // Permission introspection is optional; the explicit request flow
        // still keeps state current.
      });

    return () => {
      cancelled = true;
      status?.removeEventListener("change", sync);
    };
  }, []);

  useEffect(() => {
    if (!prefs.enabled || prefs.channel !== "browser") {
      return;
    }

    const schedule = startReminderSchedule(prefs.time, () => {
      // One gentle nudge per occurrence: the OS notification when the user
      // granted permission, otherwise the in-page banner. Never both.
      if (!showReminderNotification()) {
        setNudgeVisible(true);
      }
    });

    return () => {
      schedule?.cancel();
    };
  }, [prefs.enabled, prefs.channel, prefs.time]);

  return (
    <section
      className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--field)] px-3 py-3"
      aria-label="Daily reminder settings"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="eyebrow !mb-0">Reminders</p>
        <p className="text-xs font-semibold text-(--accent)">
          {prefs.enabled ? `Daily at ${prefs.time}` : "Off"}
        </p>
      </div>

      <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={prefs.enabled}
          onChange={(event) => updatePrefs({ enabled: event.target.checked })}
        />
        Enable a daily reminder
      </label>

      <p className="field-hint mt-2">
        ADHD Daily Coach never sends anything automatically. Browser nudges appear only while the app is
        open, email reminders open a prefilled draft in your mail app, and the calendar option
        downloads a file for you to import yourself.
      </p>

      {prefs.enabled ? (
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Reminder time
            <input
              className="field"
              type="time"
              value={prefs.time}
              onChange={(event) => updatePrefs({ time: event.target.value })}
            />
          </label>

          <fieldset className="flex flex-col gap-1 text-sm text-slate-700">
            <legend className="mb-1">Reminder channel</legend>
            {(
              [
                { value: "browser", label: "Browser nudge (while the app is open)" },
                { value: "email", label: "Email draft" },
                { value: "calendar", label: "Calendar file (your calendar app reminds you)" },
              ] as { value: ReminderChannel; label: string }[]
            ).map((channel) => (
              <label key={channel.value} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="reminder-channel"
                  value={channel.value}
                  checked={prefs.channel === channel.value}
                  onChange={() => updatePrefs({ channel: channel.value })}
                />
                {channel.label}
              </label>
            ))}
          </fieldset>

          {prefs.channel === "browser" ? (
            <div className="flex flex-col gap-2">
              {notificationPermission === "default" ? (
                <>
                  <p className="field-hint">
                    Optional: allow system notifications so the nudge can reach you while ADHD Daily Coach
                    is open in a tab, even when the tab is in the background. There is no push
                    service; nothing arrives once the app is closed.
                  </p>
                  <div>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={handleAllowNotifications}
                    >
                      Allow notifications
                    </button>
                  </div>
                </>
              ) : null}
              {notificationPermission === "granted" ? (
                <p className="field-hint" aria-live="polite">
                  System notifications are on. At your reminder time, ADHD Daily Coach shows one quiet
                  notification while the app is open in a tab; nothing arrives once the app is
                  closed.
                </p>
              ) : null}
              {notificationPermission === "denied" ? (
                <p className="field-hint" aria-live="polite">
                  Notifications are blocked for this site, so the nudge appears right here
                  instead while the app is open. If you change your mind, allow notifications in
                  your browser&apos;s site settings; ADHD Daily Coach will not ask again.
                </p>
              ) : null}
              {notificationPermission === "unsupported" ? (
                <p className="field-hint">
                  System notifications are not available in this browser. On iPhone, Safari tabs
                  cannot show them, so the nudge appears right here while the app is open.
                </p>
              ) : null}
            </div>
          ) : null}

          {prefs.channel === "email" ? (
            <div className="flex flex-col gap-2">
              <label className="flex flex-col gap-1 text-sm text-slate-700">
                Reminder email
                <input
                  className="field"
                  type="email"
                  value={email}
                  onChange={(event) => onEmailChange(event.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <div>
                <button
                  className="secondary-button"
                  type="button"
                  onClick={onSendEmailDraft}
                  disabled={!canSendDraft}
                >
                  Open reminder draft
                </button>
              </div>
              {!canSendDraft ? (
                <p className="field-hint">Generate today&apos;s plan first to fill the draft.</p>
              ) : null}
              {draftStatus.type === "ok" ? (
                <p className="text-sm text-emerald-700" aria-live="polite">
                  {draftStatus.message}
                </p>
              ) : null}
              {draftStatus.type === "error" ? (
                <p className="text-sm text-rose-700" role="alert" aria-live="assertive">
                  {draftStatus.message}
                </p>
              ) : null}
            </div>
          ) : null}

          {prefs.channel === "calendar" ? (
            <div className="flex flex-col gap-2">
              <p className="field-hint">
                ADHD Daily Coach creates the file on your device; nothing is uploaded or sent. Import it
                into Google Calendar, Apple Calendar, or Outlook, and your calendar app does the
                reminding, even while ADHD Daily Coach is closed.
              </p>
              <div>
                <button className="secondary-button" type="button" onClick={handleCalendarDownload}>
                  Download calendar reminder (.ics)
                </button>
              </div>
              <p className="field-hint">
                Changed the time? Download a fresh file and import it again to replace the old
                event.
              </p>
              {calendarSaved ? (
                <p className="text-sm text-emerald-700" aria-live="polite">
                  Calendar file saved. Import it into your calendar app whenever you are ready.
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {nudgeVisible ? (
        <div
          className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface-strong)] px-3 py-2"
          aria-live="polite"
        >
          <p className="text-sm text-slate-700">Reminder: it&apos;s time for today&apos;s plan.</p>
          <button className="secondary-button" type="button" onClick={() => setNudgeVisible(false)}>
            Dismiss
          </button>
        </div>
      ) : null}
    </section>
  );
}
