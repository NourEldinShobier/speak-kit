import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "@speakkit/ui/styles.css";
import type { CapsuleState } from "../../../shared/capture/capsule";
import { CapsulePill } from "./CapsulePill";

function Capsule() {
  const [state, setState] = useState<CapsuleState | null>(null);
  const bridge = window.speakkitCapture.capsule;
  useEffect(() => bridge.onState(setState), [bridge]);
  return state ? <CapsulePill state={state} onAction={bridge.action} onHover={bridge.hover} /> : null;
}

createRoot(document.getElementById("root")!).render(<Capsule />);
