import { createRoot } from "react-dom/client";
import "@speakkit/ui/styles.css";
import { HudPill } from "./HudPill";
import "./hud-page.css";

createRoot(document.getElementById("root")!).render(<HudPill />);
