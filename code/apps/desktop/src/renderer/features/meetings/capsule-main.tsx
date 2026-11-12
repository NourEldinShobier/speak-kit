import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@speakkit/ui/styles.css";
import type { CapsuleView } from "../../../shared/meetings/contract";
import { MeetingCapsule } from "./MeetingCapsule";

function Capsule() {
  const [view, setView] = useState<CapsuleView | null>(null);
  const bridge = window.speakkitMeetings.capsule;
  useEffect(() => {
    const off = bridge.onState(setView);
    bridge.ready();
    return off;
  }, [bridge]);
  return view ? <MeetingCapsule view={view} onAction={bridge.act} onHover={bridge.interactive} onDrag={bridge.drag} /> : null;
}

createRoot(document.getElementById("root")!).render(<Capsule />);
