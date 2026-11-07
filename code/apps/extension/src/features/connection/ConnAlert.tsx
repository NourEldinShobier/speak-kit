import { useEffect, useRef, useState } from "react";
import { Banner, Button } from "@speakkit/ui";
import type { HealthResult } from "../../shared/client";

const ALERT_TEXT = {
  offline: "Open Speak Kit and this page reconnects by itself. If it doesn't, download the app first.",
  token: "Speak Kit rejected the pairing token saved in this browser. Paste a new token below, or re-pair from scratch.",
};

const RESULT = { copied: { text: "Copied", icon: "check" }, failed: { text: "Could not copy", icon: "alert-circle" } } as const;

/** The one-line diagnostic the banner's "Copy details" button puts on the clipboard. */
const detailsText = (st: "offline" | "token", port: number, health: HealthResult | null) =>
  `${st === "offline" ? "app-not-running" : "token-rejected"} · 127.0.0.1:${port}${!health?.ok && health?.detail ? ` · ${health.detail}` : ""}`;

/** Warning under the status row of the connection card. The button only writes to the clipboard on a click; nothing here reads it. */
export function ConnAlert({ st, port, health }: { st: "offline" | "token"; port: number; health: HealthResult | null }) {
  const [result, setResult] = useState<"copied" | "failed" | null>(null);
  const timer = useRef(0);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(detailsText(st, port, health));
      setResult("copied");
    } catch {
      setResult("failed"); // clipboard blocked: say so on the button and to screen readers
    }
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setResult(null), 1500);
  };
  const message = result ? RESULT[result].text : "";
  return (
    <div className="op-alert">
      <Banner
        tone="warning"
        icon="alert-triangle"
        action={
          <Button iconLeft={result ? RESULT[result].icon : "copy"} onClick={copy}>
            {message || "Copy details"}
          </Button>
        }
      >
        {ALERT_TEXT[st]}
      </Banner>
      <span className="sk-sr" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}
