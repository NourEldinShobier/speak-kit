import { createRoot } from "react-dom/client";
import { ErrorBoundary, browserPlatform } from "@speakkit/ui";
import "@speakkit/ui/styles.css";
import "../../styles/compose.css";
import { SidePanelApp } from "./SidePanelApp";

document.documentElement.dataset.platform = browserPlatform();
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <SidePanelApp />
  </ErrorBoundary>,
);
