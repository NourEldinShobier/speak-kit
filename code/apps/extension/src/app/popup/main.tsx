import { createRoot } from "react-dom/client";
import "@speakkit/ui/lumen.css";
import "../../styles/compose.css";
import { PopupApp } from "./PopupApp";

createRoot(document.getElementById("root")!).render(<PopupApp />);
