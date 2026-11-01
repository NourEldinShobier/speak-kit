import { createRoot } from "react-dom/client";
import "@speakkit/ui/lumen.css";
import "../../styles/compose.css";
import { SidePanelApp } from "./SidePanelApp";

createRoot(document.getElementById("root")!).render(<SidePanelApp />);
