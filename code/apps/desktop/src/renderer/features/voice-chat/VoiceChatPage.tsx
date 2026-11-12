import type { AppState } from "../../../shared/ipc";
import { Page } from "../../ui";
import { VoiceChatCard } from "./VoiceChatCard";

export function VoiceChatPage({ s }: { s: AppState }) {
  return (
    <Page title="Voice chat" lead="Talk to an assistant that can see the window you share. Needs your OpenAI key.">
      <VoiceChatCard s={s} />
    </Page>
  );
}
