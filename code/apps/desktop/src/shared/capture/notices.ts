/** Failure wording: what failed and the one next step. Technical detail goes to the log, never to the screen. */
export type NoticeCode =
  | "nothing-recorded"
  | "cancelled"
  | "still-saving"
  | "software-encoder"
  | "no-words"
  | "no-space"
  | "send-failed"
  | "cleaned-up"
  | "protected-window"
  | "permission-denied"
  | "unsupported"
  | "hotkey-failed"
  | "write-failed"
  | "display-lost"
  | "time-limit"
  | "failed";

export type NoticeTone = "error" | "warning" | "info";
export type NoticeAction = "retry" | "ok" | "open-audio" | "choose-folder" | "open-trash" | "record-screen" | "open-permissions" | "open-settings";

export interface Notice {
  code: NoticeCode;
  tone: NoticeTone;
  title: string;
  body: string;
  action: NoticeAction;
  actionLabel: string;
}

export interface NoticeParams {
  count?: number;
  days?: number;
  drive?: string;
  os?: "win32" | "darwin" | string;
}

const ACTION_LABEL: Record<NoticeAction, string> = {
  retry: "Try again",
  ok: "OK",
  "open-audio": "Open Audio",
  "choose-folder": "Choose folder",
  "open-trash": "Open Recycle Bin",
  "record-screen": "Record the whole screen",
  "open-permissions": "Open Screen Recording",
  "open-settings": "Open Capture settings",
};

interface Text {
  tone: NoticeTone;
  title: string;
  body: string;
  action: NoticeAction;
  label?: string;
}

const TEXT: Record<Exclude<NoticeCode, "no-space" | "cleaned-up">, Text> = {
  "nothing-recorded": { tone: "error", title: "Nothing was recorded", body: "The screen did not give Speak Kit any pictures. Check that the window is still open.", action: "retry" },
  cancelled: { tone: "info", title: "Capture cancelled", body: "You closed the picker. Nothing was recorded.", action: "ok" },
  "still-saving": { tone: "info", title: "The last capture is still being saved", body: "Wait until it is ready, then start again.", action: "ok" },
  "software-encoder": { tone: "warning", title: "Recording with the processor", body: "Your graphics card could not start recording. Battery use may be higher.", action: "ok" },
  "no-words": {
    tone: "warning",
    title: "No words were saved",
    body: "Speak Kit could not hear the microphone, so only the screen was recorded. Check the microphone in Audio settings.",
    action: "open-audio",
  },
  "send-failed": { tone: "error", title: "Couldn't send to Voice chat", body: "Voice chat isn't open. The capture is saved and copied.", action: "retry" },
  "protected-window": { tone: "warning", title: "This window is protected", body: "It shows black in a recording. Record the whole screen instead.", action: "record-screen" },
  "permission-denied": { tone: "error", title: "Speak Kit cannot see the screen", body: "Allow Speak Kit under Screen Recording in System Settings, then try again.", action: "open-permissions" },
  unsupported: { tone: "info", title: "Capture is not available here", body: "This computer cannot record the screen with Speak Kit yet.", action: "ok" },
  "hotkey-failed": { tone: "error", title: "The capture key did not start", body: "Another program may be using it. Choose a different key in Capture settings.", action: "open-settings" },
  "write-failed": {
    tone: "error",
    title: "Part of the recording could not be saved",
    body: "The capture folder stopped accepting files, so pictures or sound may be missing. Choose another folder for captures.",
    action: "choose-folder",
  },
  "time-limit": { tone: "info", title: "Recording stopped at the time limit", body: "A capture can run for up to 4 hours. What was captured so far is saved.", action: "ok" },
  "display-lost": { tone: "warning", title: "The screen was disconnected", body: "Recording stopped and what was captured so far is saved.", action: "ok" },
  failed: { tone: "error", title: "The capture failed", body: "Nothing was saved. Try again; details are in the log.", action: "retry" },
};

function textOf(code: NoticeCode, p: NoticeParams): Text {
  if (code === "no-space")
    return { tone: "error", title: "Not enough space to save", body: `Free up space on ${p.drive ?? "the drive"} or choose another folder for captures.`, action: "choose-folder" };
  if (code === "cleaned-up") {
    const bin = p.os === "darwin" ? "Trash" : "Recycle Bin";
    const n = p.count ?? 0;
    return {
      tone: "info",
      title: `Cleaned up ${n} old ${n === 1 ? "capture" : "captures"}`,
      body: `They were older than ${p.days ?? 30} days and moved to the ${bin}.`,
      action: "open-trash",
      label: `Open ${bin}`,
    };
  }
  return TEXT[code];
}

export function noticeFor(code: NoticeCode, p: NoticeParams = {}): Notice {
  const t = textOf(code, p);
  return { code, tone: t.tone, title: t.title, body: t.body, action: t.action, actionLabel: t.label ?? ACTION_LABEL[t.action] };
}

/** Maps any thrown value to a notice. A raw error message (transport or system text) never reaches the screen. */
export function noticeOfError(e: unknown, p: NoticeParams = {}): Notice {
  const text = e instanceof Error ? `${(e as NodeJS.ErrnoException).code ?? ""} ${e.message}` : String(e);
  if (/ENOSPC|no space|disk full/i.test(text)) return noticeFor("no-space", p);
  if (/permission|denied|not allowed|NotAllowed/i.test(text)) return noticeFor("permission-denied", p);
  if (/zero-frames|no frames|no picture/i.test(text)) return noticeFor("nothing-recorded", p);
  return noticeFor("failed", p);
}
