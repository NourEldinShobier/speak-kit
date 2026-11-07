import { createRoot } from "react-dom/client";
import { ErrorBoundary, browserPlatform } from "@speakkit/ui";
import "@speakkit/ui/styles.css";
import "../../styles/compose.css";
import { PopupApp } from "./PopupApp";

document.documentElement.dataset.platform = browserPlatform();
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <PopupApp />
  </ErrorBoundary>,
);
