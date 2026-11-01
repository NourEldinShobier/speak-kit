import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "@speakkit/ui";
import "@speakkit/ui/lumen.css";
import "../../styles/compose.css";
import { OptionsApp } from "./Options";

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <OptionsApp />
  </ErrorBoundary>,
);
