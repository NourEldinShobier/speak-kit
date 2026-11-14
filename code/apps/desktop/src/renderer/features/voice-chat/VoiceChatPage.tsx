import type { AppState } from "../../../shared/ipc";
import { Page } from "../../ui";
import { VoiceChatCard } from "./VoiceChatCard";
import "../../../shared/i18n/packs/voices";
import { useT } from "../../i18n";

export function VoiceChatPage({ s }: { s: AppState }) {
  const { t } = useT();
  return (
    <Page title={t("vc.title")} lead={t("vc.lead")}>
      <VoiceChatCard s={s} />
    </Page>
  );
}
