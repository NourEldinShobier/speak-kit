import type { ReactNode } from "react";
import type { PopupView } from "../../features/connection";
import { Foot, Msg, type MsgProps } from "./parts";
import type { PopupActions, PopupModel } from "./types";

/** The views that replace the whole body with one message and its actions. */
type MessageView = "install" | "offline" | "token" | "version" | "pdf" | "unreadable" | "fileurl" | "engine-missing";

interface Footer {
  left?: string | undefined;
  right: string;
  onRight: () => void;
}
interface MessageSpec extends Omit<MsgProps, "note"> {
  /** shows the "Starting Speak Kit..." / "did not start" line under the message */
  launchNote?: boolean;
  /** replaces the default "Open app" footer */
  footer?: Footer;
}

const MESSAGES: Record<MessageView, (m: PopupModel, a: PopupActions) => MessageSpec> = {
  install: (_m, a) => ({
    icon: "download",
    title: "Install Speak Kit to start listening",
    body: "Speak Kit reads pages aloud with a voice that runs on this computer. Nothing you read is uploaded.",
    primary: { label: "Download Speak Kit for Windows", onClick: a.download },
    secondary: { label: "I already installed it", onClick: a.recheck },
    footer: { left: "Free. Works offline.", right: "Learn more", onRight: a.learn },
  }),
  offline: (m, a) => ({
    icon: "power",
    title: "Speak Kit isn't running",
    body: "The extension reads with the Speak Kit desktop app on this computer. Open the app and this popup connects by itself.",
    primary: { label: m.launch === "starting" ? "Starting..." : "Open Speak Kit", onClick: a.openApp },
    secondary: { label: "Download the app", onClick: a.download },
    launchNote: true,
    footer: { right: "Troubleshooting", onRight: a.help },
  }),
  token: (_m, a) => ({
    icon: "link",
    title: "Pair Speak Kit with this browser again",
    body: "The app and this browser no longer share a pairing token. This usually happens after reinstalling one of them.",
    primary: { label: "Paste new token", onClick: a.pasteToken },
    secondary: { label: "Open Speak Kit", onClick: a.openApp },
    launchNote: true,
    footer: { right: "Extension options", onRight: a.options },
  }),
  version: (_m, a) => ({
    icon: "refresh",
    title: "Speak Kit needs an update",
    body: "The app and this extension no longer speak the same version of the protocol. Install the latest release of both; your settings are kept.",
    primary: { label: "Download the latest app", onClick: a.download },
    secondary: { label: "Check again", onClick: a.recheck },
    footer: { right: "Troubleshooting", onRight: a.help },
  }),
  pdf: (_m, a) => ({
    icon: "file-text",
    title: "Chrome's PDF viewer can't be read",
    body: "Extensions cannot reach text inside the PDF viewer. Select the text you want, copy it, and paste it into the app.",
    primary: { label: "Paste text in the app", onClick: a.openApp },
    launchNote: true,
  }),
  unreadable: (_m, a) => ({
    icon: "lock-off",
    title: "Can't read this page",
    body: "Chrome blocks extensions on its own pages (chrome://, the Web Store). Open a normal website or paste text into the app.",
    primary: { label: "Paste text in the app", onClick: a.openApp },
    launchNote: true,
  }),
  fileurl: (_m, a) => ({
    icon: "file-text",
    title: "Allow access to file URLs",
    body: "Chrome needs one more permission to read local files. Turn on “Allow access to file URLs” in the extension settings.",
    primary: { label: "Open extension settings", onClick: a.extSettings },
    secondary: { label: "Paste text in the app", onClick: a.openApp },
    launchNote: true,
  }),
  "engine-missing": (_m, a) => ({
    icon: "alert-triangle",
    title: "The voice engine isn't ready",
    body: "Speak Kit is running but the Kokoro voice model isn't installed or failed to start. Open the app to download or repair it.",
    primary: { label: "Open Speak Kit", onClick: a.openApp },
    secondary: { label: "Check again", onClick: a.recheck },
    launchNote: true,
  }),
};

const LAUNCH_NOTE: Record<Exclude<PopupModel["launch"], "idle">, string> = {
  starting: "Starting Speak Kit...",
  failed: "Speak Kit did not start. Open it from the Start menu, or download it first.",
};

function LaunchNote({ launch }: { launch: PopupModel["launch"] }) {
  if (launch === "idle") return null;
  return (
    <p className="pp-launch" role="status">
      {LAUNCH_NOTE[launch]}
    </p>
  );
}

const isMessageView = (view: PopupView): view is MessageView => view in MESSAGES;

/** The body and footer for a message view; null for the views that show the player. */
export function messageFor(m: PopupModel, a: PopupActions): { body: ReactNode; foot: ReactNode } | null {
  if (!isMessageView(m.view)) return null;
  const { launchNote, footer, ...msg } = MESSAGES[m.view](m, a);
  return {
    body: <Msg {...msg} note={launchNote ? <LaunchNote launch={m.launch} /> : undefined} />,
    foot: footer ? <Foot left={footer.left} right={footer.right} onRight={footer.onRight} /> : <Foot onRight={a.openApp} />,
  };
}
