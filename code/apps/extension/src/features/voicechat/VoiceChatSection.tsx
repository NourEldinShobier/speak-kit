import { useCallback, useEffect, useState } from "react";
import { Button, SettingRow, StatusPill } from "@speakkit/ui";
import { useToken, type SectionProps } from "../settings";
import { send } from "../../shared/client";
import { openUrl } from "../../shared/links";
import { Card, PageHead } from "../../shared/ui";
import { voiceStatus } from "./mint";

type KeyState = "checking" | "key" | "no-key" | "down" | "unpaired";
type MicState = "granted" | "prompt" | "denied" | "unknown";

/** Whether the app has a key; asked again when the user comes back to this tab (they add the key in the app). */
function useKeyState(port: number, token: string): KeyState {
  const [state, setState] = useState<KeyState>("checking");
  const check = useCallback(async () => {
    const r = await voiceStatus({ fetch: (i, init) => fetch(i, init), port, token });
    setState(r.ok ? (r.hasKey ? "key" : "no-key") : r.problem === "unpaired" ? "unpaired" : "down");
  }, [port, token]);
  useEffect(() => {
    void check();
    const on = () => !document.hidden && void check();
    document.addEventListener("visibilitychange", on);
    return () => document.removeEventListener("visibilitychange", on);
  }, [check]);
  return state;
}

/** The microphone permission of this extension, as Chrome has it. */
function useMic(): [MicState, () => Promise<void>] {
  const [state, setState] = useState<MicState>("unknown");
  const read = useCallback(async () => {
    try {
      const p = await navigator.permissions.query({ name: "microphone" as PermissionName });
      setState(p.state);
      p.onchange = () => setState(p.state);
    } catch {
      setState("unknown");
    }
  }, []);
  useEffect(() => void read(), [read]);
  const ask = useCallback(async () => {
    try {
      (await navigator.mediaDevices.getUserMedia({ audio: true })).getTracks().forEach((t) => t.stop());
    } catch {
      /* blocked: the state below says so */
    }
    await read();
  }, [read]);
  return [state, ask];
}

const KEY_PILL: Record<KeyState, { tone: "green" | "orange" | "red" | "neutral"; text: string }> = {
  checking: { tone: "neutral", text: "Checking" },
  key: { tone: "green", text: "Key added" },
  "no-key": { tone: "orange", text: "No key" },
  down: { tone: "red", text: "App not running" },
  unpaired: { tone: "red", text: "Not paired" },
};
const KEY_TEXT: Record<KeyState, string> = {
  checking: "Asking the Speak Kit app.",
  key: "Your OpenAI API key is stored in the Speak Kit app. The extension never sees it.",
  "no-key": "Add your OpenAI API key in the Speak Kit app. It is kept in your operating system's keychain.",
  down: "Start the Speak Kit app to see whether a key is added.",
  unpaired: "Pair the extension with the app on the General page first.",
};
const MIC_TEXT: Record<MicState, string> = {
  granted: "Allowed. Speak Kit listens only while a conversation is open.",
  prompt: "Chrome asks the first time you talk to a page.",
  denied: "Blocked. Allow the microphone for Speak Kit in Chrome's site settings.",
  unknown: "Chrome asks the first time you talk to a page.",
};

export function VoiceChatSection({ s, saved }: SectionProps) {
  const { token } = useToken();
  const key = useKeyState(s.port, token);
  const [mic, allow] = useMic();
  return (
    <>
      <PageHead title="Voice chat" desc="Talk to a web page. Your voice and the page text go to OpenAI; Speak Kit has no server and stores nothing." saved={saved} />
      <Card title="OpenAI" id="vc-key-h">
        <SettingRow
          label="API key"
          description={KEY_TEXT[key]}
          control={
            <>
              <StatusPill tone={KEY_PILL[key].tone} data-sk="voicechat-key">
                {KEY_PILL[key].text}
              </StatusPill>
              <Button variant="secondary" onClick={() => void send({ t: "open-app" })}>
                Open Speak Kit settings
              </Button>
            </>
          }
        />
      </Card>
      <Card title="Microphone" id="vc-mic-h">
        <SettingRow
          label="Microphone access"
          description={MIC_TEXT[mic]}
          control={
            <>
              <StatusPill tone={mic === "granted" ? "green" : mic === "denied" ? "red" : "neutral"} data-sk="voicechat-mic">
                {mic === "granted" ? "Allowed" : mic === "denied" ? "Blocked" : "Not asked yet"}
              </StatusPill>
              {mic === "prompt" && (
                <Button variant="secondary" onClick={() => void allow()}>
                  Allow microphone
                </Button>
              )}
              <Button variant="secondary" onClick={() => void openUrl(`chrome://settings/content/siteDetails?site=${encodeURIComponent(`chrome-extension://${chrome.runtime.id}`)}`)}>
                Manage in Chrome
              </Button>
            </>
          }
        />
      </Card>
    </>
  );
}
