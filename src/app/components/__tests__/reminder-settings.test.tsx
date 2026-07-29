import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReminderSettingsPanel } from "@/app/components/reminder-settings";
import type { AsyncStatus } from "@/lib/async-status";

const PREFS_KEY = "calm-daily-coach:reminder-prefs:guest";

function stubNotification(permission: string, requestResult = "granted") {
  const constructed: { title: string; options?: { body?: string; tag?: string } }[] = [];
  const requestPermission = vi.fn(async () => requestResult);

  class FakeNotification {
    static permission = permission;
    static requestPermission = requestPermission;

    constructor(title: string, options?: { body?: string; tag?: string }) {
      constructed.push({ title, options });
    }
  }

  vi.stubGlobal("Notification", FakeNotification);
  return { constructed, requestPermission };
}

function renderPanel(overrides?: {
  draftStatus?: AsyncStatus;
  canSendDraft?: boolean;
  onSendEmailDraft?: () => void;
  onEmailChange?: (value: string) => void;
  email?: string;
}) {
  return render(
    <ReminderSettingsPanel
      storageScope="guest"
      email={overrides?.email ?? ""}
      onEmailChange={overrides?.onEmailChange ?? (() => {})}
      onSendEmailDraft={overrides?.onSendEmailDraft ?? (() => {})}
      draftStatus={overrides?.draftStatus ?? { type: "idle" }}
      canSendDraft={overrides?.canSendDraft ?? false}
    />,
  );
}

describe("ReminderSettingsPanel", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(URL, "createObjectURL");
    Reflect.deleteProperty(URL, "revokeObjectURL");
  });

  it("renders reminders off by default with honest no-auto-send copy", () => {
    renderPanel();

    expect(screen.getByText("Reminders")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
    const toggle = screen.getByRole("checkbox", { name: "Enable a daily reminder" }) as HTMLInputElement;
    expect(toggle.checked).toBe(false);
    expect(
      screen.getByText(
        "ADHD Daily Coach never sends anything automatically. Browser nudges appear only while the app is open, email reminders open a prefilled draft in your mail app, and the calendar option downloads a file for you to import yourself.",
      ),
    ).toBeTruthy();
    expect(screen.queryByLabelText("Reminder time")).toBeNull();
  });

  it("persists enabling the reminder and choosing a time", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("checkbox", { name: "Enable a daily reminder" }));

    expect(screen.getByText("Daily at 18:00")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}")).toMatchObject({
      enabled: true,
      time: "18:00",
      channel: "browser",
    });

    fireEvent.change(screen.getByLabelText("Reminder time"), { target: { value: "07:30" } });

    expect(screen.getByText("Daily at 07:30")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}")).toMatchObject({
      enabled: true,
      time: "07:30",
    });
  });

  it("hydrates persisted preferences on mount", () => {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "07:15", channel: "email" }),
    );

    renderPanel();

    expect(screen.getByText("Daily at 07:15")).toBeTruthy();
    const emailRadio = screen.getByRole("radio", { name: "Email draft" }) as HTMLInputElement;
    expect(emailRadio.checked).toBe(true);
  });

  it("reveals the email draft flow only for the email channel", () => {
    const onSendEmailDraft = vi.fn();
    renderPanel({ onSendEmailDraft, canSendDraft: true, email: "me@example.com" });

    fireEvent.click(screen.getByRole("checkbox", { name: "Enable a daily reminder" }));
    expect(screen.queryByRole("button", { name: "Open reminder draft" })).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Email draft" }));

    fireEvent.click(screen.getByRole("button", { name: "Open reminder draft" }));
    expect(onSendEmailDraft).toHaveBeenCalledTimes(1);
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}")).toMatchObject({
      channel: "email",
    });
  });

  it("reveals the calendar download flow only for the calendar channel", () => {
    renderPanel();

    fireEvent.click(screen.getByRole("checkbox", { name: "Enable a daily reminder" }));
    expect(screen.queryByRole("button", { name: "Download calendar reminder (.ics)" })).toBeNull();

    fireEvent.click(
      screen.getByRole("radio", { name: "Calendar file (your calendar app reminds you)" }),
    );

    expect(screen.getByRole("button", { name: "Download calendar reminder (.ics)" })).toBeTruthy();
    expect(
      screen.getByText(
        "ADHD Daily Coach creates the file on your device; nothing is uploaded or sent. Import it into Google Calendar, Apple Calendar, or Outlook, and your calendar app does the reminding, even while ADHD Daily Coach is closed.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Changed the time? Download a fresh file and import it again to replace the old event.",
      ),
    ).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "{}")).toMatchObject({
      channel: "calendar",
    });
  });

  it("downloads the .ics file and confirms without claiming a reminder is set", () => {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "08:30", channel: "calendar" }),
    );
    const createObjectURL = vi.fn<(blob: Blob) => string>(() => "blob:focus-reminder");
    const revokeObjectURL = vi.fn();
    Object.assign(URL, { createObjectURL, revokeObjectURL });

    let downloadName = "";
    vi.spyOn(HTMLElement.prototype, "click").mockImplementation(function (this: HTMLElement) {
      downloadName = (this as HTMLAnchorElement).download;
    });

    renderPanel();

    fireEvent.click(screen.getByRole("button", { name: "Download calendar reminder (.ics)" }));

    expect(downloadName).toBe("focus-daily-reminder.ics");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const blob = createObjectURL.mock.calls[0][0];
    expect(blob.type).toBe("text/calendar;charset=utf-8");
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:focus-reminder");
    expect(
      screen.getByText("Calendar file saved. Import it into your calendar app whenever you are ready."),
    ).toBeTruthy();
    expect(screen.queryByText(/is set/i)).toBeNull();

    fireEvent.change(screen.getByLabelText("Reminder time"), { target: { value: "09:00" } });

    expect(
      screen.queryByText("Calendar file saved. Import it into your calendar app whenever you are ready."),
    ).toBeNull();
  });

  it("disables the draft button without a plan and explains why", () => {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "18:00", channel: "email" }),
    );

    renderPanel({ canSendDraft: false });

    const draftButton = screen.getByRole("button", { name: "Open reminder draft" }) as HTMLButtonElement;
    expect(draftButton.disabled).toBe(true);
    expect(screen.getByText("Generate today's plan first to fill the draft.")).toBeTruthy();
  });

  it("surfaces draft status messages from the planner", () => {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "18:00", channel: "email" }),
    );

    renderPanel({
      canSendDraft: true,
      draftStatus: { type: "error", message: "Add an email to send reminders." },
    });

    expect(screen.getByRole("alert").textContent).toBe("Add an email to send reminders.");
  });

  it("shows a dismissible in-session nudge when the reminder time arrives", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 18, 8, 59, 0, 0));
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "09:00", channel: "browser" }),
    );

    renderPanel();

    expect(screen.queryByText("Reminder: it's time for today's plan.")).toBeNull();

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(screen.getByText("Reminder: it's time for today's plan.")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Reminder: it's time for today's plan.")).toBeNull();
  });

  it("never requests notification permission on load or on selecting the browser channel", () => {
    const { requestPermission } = stubNotification("default");
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "18:00", channel: "email" }),
    );

    renderPanel();
    expect(requestPermission).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("radio", { name: "Browser nudge (while the app is open)" }));

    expect(requestPermission).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Allow notifications" })).toBeTruthy();
    expect(
      screen.getByText(
        "Optional: allow system notifications so the nudge can reach you while ADHD Daily Coach is open in a tab, even when the tab is in the background. There is no push service; nothing arrives once the app is closed.",
      ),
    ).toBeTruthy();
  });

  it("requests permission only from the Allow notifications button and reflects the grant", async () => {
    const { requestPermission } = stubNotification("default", "granted");
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "18:00", channel: "browser" }),
    );

    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Allow notifications" }));
    });

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Allow notifications" })).toBeNull();
    expect(
      screen.getByText(
        "System notifications are on. At your reminder time, ADHD Daily Coach shows one quiet notification while the app is open in a tab; nothing arrives once the app is closed.",
      ),
    ).toBeTruthy();
  });

  it("reflects a denial from the prompt honestly without re-prompting", async () => {
    const { requestPermission } = stubNotification("default", "denied");
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "18:00", channel: "browser" }),
    );

    renderPanel();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Allow notifications" }));
    });

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Allow notifications" })).toBeNull();
    expect(
      screen.getByText(
        "Notifications are blocked for this site, so the nudge appears right here instead while the app is open. If you change your mind, allow notifications in your browser's site settings; ADHD Daily Coach will not ask again.",
      ),
    ).toBeTruthy();
  });

  it("shows the blocked state without an Allow button when permission is already denied", () => {
    const { requestPermission } = stubNotification("denied");
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "18:00", channel: "browser" }),
    );

    renderPanel();

    expect(requestPermission).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Allow notifications" })).toBeNull();
    expect(
      screen.getByText(
        "Notifications are blocked for this site, so the nudge appears right here instead while the app is open. If you change your mind, allow notifications in your browser's site settings; ADHD Daily Coach will not ask again.",
      ),
    ).toBeTruthy();
  });

  it("explains the iPhone Safari limit when notifications are unsupported", () => {
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "18:00", channel: "browser" }),
    );

    renderPanel();

    expect(screen.queryByRole("button", { name: "Allow notifications" })).toBeNull();
    expect(
      screen.getByText(
        "System notifications are not available in this browser. On iPhone, Safari tabs cannot show them, so the nudge appears right here while the app is open.",
      ),
    ).toBeTruthy();
  });

  it("delivers one OS notification instead of the banner when permission is granted", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 18, 8, 59, 0, 0));
    const { constructed } = stubNotification("granted");
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "09:00", channel: "browser" }),
    );

    renderPanel();

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(constructed).toHaveLength(1);
    expect(constructed[0].title).toBe("ADHD Daily Coach");
    expect(constructed[0].options?.body).toBe("Time for today's plan, whenever you are ready.");
    expect(screen.queryByText("Reminder: it's time for today's plan.")).toBeNull();
  });

  it("falls back to the in-page nudge when permission stays undecided", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 18, 8, 59, 0, 0));
    const { constructed } = stubNotification("default");
    window.localStorage.setItem(
      PREFS_KEY,
      JSON.stringify({ enabled: true, time: "09:00", channel: "browser" }),
    );

    renderPanel();

    act(() => {
      vi.advanceTimersByTime(60 * 1000);
    });

    expect(constructed).toHaveLength(0);
    expect(screen.getByText("Reminder: it's time for today's plan.")).toBeTruthy();
  });
});
