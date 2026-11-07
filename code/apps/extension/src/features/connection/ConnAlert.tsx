import { useState } from "react";
import { Banner, Button } from "@speakkit/ui";
import type { HealthResult } from "../../shared/client";

const ALERT_TEXT = {
  offline: "Open Speak Kit and this page reconnects by itself. If it doesn't, download the app first.",
  token: "Speak Kit rejected the pairing token saved in this browser. Paste a new token below, or re-pair from scratch.",
};

/** The one-line diagnostic the banner's "Copy details" button puts on the clipboard. */
const detailsText = (st: "offline" | "token", port: number, health: HealthResult | null) =>
  `${st === "offline" ? "app-not-running" : "token-rejected"} · 127.0.0.1:${port}${!health?.ok && health?.detail ? ` · ${health.detail}` : ""}`;

/** Warning under the status row of the connection card. The button only writes to the clipboard on a click; nothing here reads it. */
export function ConnAlert({ st, port, health }: { st: "offline" | "token"; port: number; health: HealthResult | null }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(detailsText(st, port, health));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the button stays as it was */
    }
  };
  return (
    <div className="op-alert">
      <Banner
        tone="warning"
        icon="alert-triangle"
        action={
          <Button iconLeft={copied ? "check" : "copy"} onClick={copy}>
            {copied ? "Copied" : "Copy details"}
          </Button>
        }
      >
        {ALERT_TEXT[st]}
      </Banner>
    </div>
  );
}
