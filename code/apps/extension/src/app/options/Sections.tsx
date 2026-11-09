import { HighlightSection } from "../../features/highlight";
import { LauncherSection } from "../../features/launcher";
import { ReaderSection } from "../../features/reader";
import { ShortcutsSection, SitesSection } from "../../features/settings";
import { VoiceChatSection } from "../../features/voicechat";
import { VoiceSection } from "../../features/voices";

type Common = Parameters<typeof LauncherSection>[0];

/** Every options section except General, in one lazily loaded chunk. */
export default function Sections({ id, ...common }: Common & { id: string }) {
  switch (id) {
    case "launcher":
      return <LauncherSection {...common} />;
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
