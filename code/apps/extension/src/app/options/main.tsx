import { createRoot } from "react-dom/client";
import "@speakkit/ui/lumen.css";
import "../../styles/compose.css";
import { OptionsApp } from "./Options";

createRoot(document.getElementById("root")!).render(<OptionsApp />);
