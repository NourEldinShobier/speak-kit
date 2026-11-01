import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@speakkit/ui";
import "@speakkit/ui/lumen.css";
import "./shell.css";
import "./pages.css";
import "./overlays.css";
import "./setup.css";
import "./system.css";
import { App } from "./App";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
