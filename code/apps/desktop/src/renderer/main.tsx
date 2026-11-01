import { createRoot } from "react-dom/client";
import "@speakkit/ui/lumen.css";
import "./shell.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(<App />);
