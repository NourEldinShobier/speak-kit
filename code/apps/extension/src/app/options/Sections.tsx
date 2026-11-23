import { HighlightSection } from "../../features/highlight";
import { AppearsCard } from "../../features/launcher";
import { ReaderSection } from "../../features/reader";
import { ShortcutsSection, SiteRulesCards, SitesSection } from "../../features/settings";
import { VoiceChatSection } from "../../features/voicechat";
import { VoiceSection } from "../../features/voices";

type Common = Parameters<typeof SitesSection>[0];

/** Every options section except General, in one lazily loaded chunk. "advanced" is the content of the fold on the General page. */
export default function Sections({ id, ...common }: Common & { id: string }) {
  switch (id) {
    case "advanced":
      return (
        <>
          <AppearsCard s={common.s} upd={common.upd} />
          <SiteRulesCards s={common.s} upd={common.upd} />
        </>
      );
    case "voice":
      return <VoiceSection {...common} />;
    case "voicechat":
      return <VoiceChatSection {...common} />;
    case "highlight":
      return <HighlightSection {...common} />;
    case "reader":
      return <ReaderSection {...common} />;
    case "shortcuts":
      return <ShortcutsSection />;
    case "sites":
      return <SitesSection {...common} />;
    default:
      return null;
  }
}
