import { useEffect, useReducer } from "react";
import { Button, IconButton, Select, SettingRow, SettingsSection, TextInput } from "@speakkit/ui";
import { VOICE_CHAT_MODEL, VOICE_CHAT_VOICES, type VoiceChatVoice } from "@speakkit/protocol";
import type { AppState } from "../../../shared/ipc";
import { normalizeApiKey } from "../../../shared/voice-chat";
import { api } from "../../ui";
import { cardReducer, initCard, keyLine, KEY_HELP, NO_ENCRYPTION, type CardAction, type CardState } from "./voice-chat-model";

const VOICE_OPTIONS = VOICE_CHAT_VOICES.map((v) => ({ value: v, label: v[0]!.toUpperCase() + v.slice(1) }));
type Dispatch = (a: CardAction) => void;

/** Runs a call to main and dispatches its result; a call that throws shows a general message. */
async function attempt(dispatch: Dispatch, run: () => Promise<CardAction>): Promise<void> {
  try {
    dispatch(await run());
  } catch {
    dispatch({ type: "failed" });
  }
}

function useKeyActions(st: CardState, dispatch: Dispatch) {
  return {
    save: async () => {
      if (st.busy) return;
      const key = normalizeApiKey(st.draft);
      if (!key) return dispatch({ type: "invalid" });
      dispatch({ type: "busy", what: "save" });
      await attempt(dispatch, async () => ({ type: "saved", result: await api.voiceChatSetKey(key) }));
    },
    test: async () => {
      if (st.busy) return;
      dispatch({ type: "busy", what: "test" });
      await attempt(dispatch, async () => ({ type: "tested", result: await api.voiceChatTestKey() }));
    },
    remove: async () => {
      if (st.busy) return;
      dispatch({ type: "busy", what: "remove" });
      await attempt(dispatch, async () => ({ type: "removed", status: await api.voiceChatRemoveKey() }));
    },
  };
}

/** The key field. Its text is the only place the renderer holds a key, and Save empties it. */
function KeyRow({ st, dispatch, save }: { st: CardState; dispatch: Dispatch; save: () => Promise<void> }) {
  const canEncrypt = st.status?.canEncrypt !== false;
  return (
    <SettingRow
      className="lm-row--control"
      label={<label htmlFor="voice-chat-key">OpenAI API key</label>}
      description={canEncrypt ? KEY_HELP : NO_ENCRYPTION}
      control={
        <div className="sk-vckey__field">
          <TextInput
            id="voice-chat-key"
            className="sk-vckey__input"
            type={st.reveal ? "text" : "password"}
            value={st.draft}
            placeholder={st.status?.hasKey ? "Saved" : "sk-..."}
            disabled={!canEncrypt || st.busy !== null}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => dispatch({ type: "draft", text: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && st.draft && st.busy === null && void save()}
          />
          {st.draft ? <IconButton name={st.reveal ? "eye-off" : "eye"} label={st.reveal ? "Hide key" : "Show key"} aria-pressed={st.reveal} onClick={() => dispatch({ type: "reveal" })} /> : null}
        </div>
      }
    />
  );
}

/** The key field and its three buttons; the tests render it with a given state. */
export function VoiceChatKeyRows({ st, dispatch }: { st: CardState; dispatch: Dispatch }) {
  const { save, test, remove } = useKeyActions(st, dispatch);
  const hasKey = !!st.status?.hasKey;
  const idle = st.busy === null;
  return (
    <>
      <KeyRow st={st} dispatch={dispatch} save={save} />
      <SettingRow
        className="lm-row--control"
        label={keyLine(st)}
        // The live region is always there, so a screen reader announces the text when it appears.
        description={
          <span role="status" className="sk-vckey__notice" data-tone={st.notice?.tone} data-testid="voice-chat-notice">
            {st.notice?.text}
          </span>
        }
        control={
          <>
            <Button variant="primary" loading={st.busy === "save"} disabled={st.status?.canEncrypt === false || !idle || !st.draft.trim()} onClick={() => void save()}>
              Save
            </Button>
            <Button loading={st.busy === "test"} disabled={!hasKey || !idle} onClick={() => void test()}>
              Test key
            </Button>
            <Button loading={st.busy === "remove"} disabled={!hasKey || !idle} onClick={() => void remove()}>
              Remove key
            </Button>
          </>
        }
      />
    </>
  );
}

/** Settings > Voice and playback > Voice chat: the OpenAI key (kept encrypted by main, never shown again), the voice and the model. */
export function VoiceChatCard({ s }: { s: AppState }) {
  const [st, dispatch] = useReducer(cardReducer, undefined, initCard);
  useEffect(() => {
    api.voiceChatStatus().then(
      (status) => dispatch({ type: "loaded", status }),
      () => dispatch({ type: "failed" }),
    );
  }, []);
  return (
    <SettingsSection title="Voice chat" description="Talk to a web page by voice. It uses your own OpenAI account.">
      <VoiceChatKeyRows st={st} dispatch={dispatch} />
      <SettingRow
        className="lm-row--control"
        label="Voice"
        control={<Select label="Voice chat voice" value={s.config.voiceChatVoice} onChange={(v) => void api.voiceChatSetVoice(v as VoiceChatVoice)} options={VOICE_OPTIONS} />}
      />
      <SettingRow label={`Model: ${VOICE_CHAT_MODEL}`} />
    </SettingsSection>
  );
}
