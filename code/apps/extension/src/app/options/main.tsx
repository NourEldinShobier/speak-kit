import { createRoot } from "react-dom/client";
import { ErrorBoundary, browserPlatform } from "@speakkit/ui";
import "@speakkit/ui/lumen.css";
import "../../styles/compose.css";
import { OptionsApp } from "./Options";

document.documentElement.dataset.platform = browserPlatform();
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <OptionsApp />
  </ErrorBoundary>,
);
