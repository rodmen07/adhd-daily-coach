import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNotificationPermission,
  REMINDER_NOTIFICATION_BODY,
  REMINDER_NOTIFICATION_TAG,
  REMINDER_NOTIFICATION_TITLE,
  requestNotificationPermission,
  showReminderNotification,
} from "@/lib/reminder-notifications";

type ConstructedNotification = {
  title: string;
  options?: { body?: string; tag?: string };
};

function stubNotification(
  permission: string,
  options?: {
    requestResult?: string;
    requestRejects?: boolean;
    constructorThrows?: boolean;
  },
) {
  const constructed: ConstructedNotification[] = [];
  const requestPermission = vi.fn(async () => {
    if (options?.requestRejects) {
      throw new Error("permission request failed");
    }
    return options?.requestResult ?? permission;
  });

  class FakeNotification {
    static permission = permission;
    static requestPermission = requestPermission;

    constructor(title: string, notificationOptions?: { body?: string; tag?: string }) {
      if (options?.constructorThrows) {
        throw new TypeError("Illegal constructor");
      }
      constructed.push({ title, options: notificationOptions });
    }
  }

  vi.stubGlobal("Notification", FakeNotification);
  return { constructed, requestPermission };
}

describe("reminder notifications", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("getNotificationPermission", () => {
    it("reports unsupported when the Notification API is missing (iOS Safari tabs)", () => {
      vi.stubGlobal("Notification", undefined);
      expect(getNotificationPermission()).toBe("unsupported");
    });

    it("maps granted, denied, and default permission values", () => {
      stubNotification("granted");
      expect(getNotificationPermission()).toBe("granted");

      stubNotification("denied");
      expect(getNotificationPermission()).toBe("denied");

      stubNotification("default");
      expect(getNotificationPermission()).toBe("default");
    });

    it("treats unknown permission values as default", () => {
      stubNotification("prompt-with-chooser");
      expect(getNotificationPermission()).toBe("default");
    });
  });

  describe("requestNotificationPermission", () => {
    it("prompts once from the default state and returns the user's choice", async () => {
      const { requestPermission } = stubNotification("default", { requestResult: "granted" });

      await expect(requestNotificationPermission()).resolves.toBe("granted");
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });

    it("returns denied when the user declines the prompt", async () => {
      const { requestPermission } = stubNotification("default", { requestResult: "denied" });

      await expect(requestNotificationPermission()).resolves.toBe("denied");
      expect(requestPermission).toHaveBeenCalledTimes(1);
    });

    it("never prompts again after a denial", async () => {
      const { requestPermission } = stubNotification("denied");

      await expect(requestNotificationPermission()).resolves.toBe("denied");
      expect(requestPermission).not.toHaveBeenCalled();
    });

    it("skips the prompt when permission is already granted", async () => {
      const { requestPermission } = stubNotification("granted");

      await expect(requestNotificationPermission()).resolves.toBe("granted");
      expect(requestPermission).not.toHaveBeenCalled();
    });

    it("resolves unsupported without throwing when the API is missing", async () => {
      vi.stubGlobal("Notification", undefined);
      await expect(requestNotificationPermission()).resolves.toBe("unsupported");
    });

    it("falls back to the current state when the prompt itself fails", async () => {
      stubNotification("default", { requestRejects: true });
      await expect(requestNotificationPermission()).resolves.toBe("default");
    });
  });

  describe("showReminderNotification", () => {
    it("shows one OS notification with the calm reminder copy when granted", () => {
      const { constructed } = stubNotification("granted");

      expect(showReminderNotification()).toBe(true);
      expect(constructed).toHaveLength(1);
      expect(constructed[0].title).toBe("ADHD Daily Coach");
      expect(constructed[0].options?.body).toBe("Time for today's plan, whenever you are ready.");
      expect(constructed[0].options?.tag).toBe(REMINDER_NOTIFICATION_TAG);
    });

    it("does not construct a notification when permission is default", () => {
      const { constructed } = stubNotification("default");

      expect(showReminderNotification()).toBe(false);
      expect(constructed).toHaveLength(0);
    });

    it("does not construct a notification when permission is denied", () => {
      const { constructed } = stubNotification("denied");

      expect(showReminderNotification()).toBe(false);
      expect(constructed).toHaveLength(0);
    });

    it("returns false when the API is unsupported", () => {
      vi.stubGlobal("Notification", undefined);
      expect(showReminderNotification()).toBe(false);
    });

    it("returns false when the constructor throws so callers can fall back", () => {
      stubNotification("granted", { constructorThrows: true });
      expect(showReminderNotification()).toBe(false);
    });
  });

  it("keeps the notification copy calm and pressure-free", () => {
    for (const copy of [REMINDER_NOTIFICATION_TITLE, REMINDER_NOTIFICATION_BODY]) {
      expect(copy.trim().length).toBeGreaterThan(0);
      expect(copy).not.toMatch(/streak/i);
      expect(copy).not.toMatch(/hurry|now!|don't miss|last chance/i);
      expect(copy).not.toContain("!");
      // Em dash and en dash, by code point to keep the characters out of source.
      expect(copy).not.toContain(String.fromCharCode(0x2014));
      expect(copy).not.toContain(String.fromCharCode(0x2013));
    }
  });
});
