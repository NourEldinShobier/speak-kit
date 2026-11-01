import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@speakkit/ui";
import "@speakkit/ui/lumen.css";
import "../../styles/compose.css";
import { PopupApp } from "./PopupApp";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <PopupApp />
  </ErrorBoundary>,
);
