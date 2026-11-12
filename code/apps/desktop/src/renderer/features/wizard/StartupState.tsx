import { useEffect, useState } from "react";
import { Button, Logo } from "@speakkit/ui";
import { startupView, LOADING_AFTER_MS, SLOW_AFTER_MS } from "./startup";

/** The first window before the app answered: a loading line, and after ten seconds what to do when it does not. */
export function StartupState() {
  const [waited, setWaited] = useState(0);
  useEffect(() => {
    const a = setTimeout(() => setWaited(LOADING_AFTER_MS), LOADING_AFTER_MS);
    const b = setTimeout(() => setWaited(SLOW_AFTER_MS), SLOW_AFTER_MS);
    return () => (clearTimeout(a), clearTimeout(b));
  }, []);
  const view = startupView(waited);
  if (view === "quiet") return null;
  return (
    <div className="sk-startup" role="status" aria-live="polite">
      <Logo size={48} />
      <h1>{view === "loading" ? "Opening Speak Kit" : "Speak Kit is taking longer than usual"}</h1>
      {view === "slow" && (
        <>
          <p>It could not reach its background engine yet. Try again. If it keeps happening, restart your computer or check that security software is not blocking Speak Kit.</p>
          <Button variant="primary" size="lg" iconLeft="refresh" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </>
      )}
    </div>
  );
}
