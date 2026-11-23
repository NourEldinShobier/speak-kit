import { useState } from "react";
import { Button } from "@speakkit/ui";
import { useT } from "./i18n";
import { api } from "./ui";

/** The one step of pairing on this side: copy the pairing token, then paste it in the extension. */
export function CopyTokenButton({ token, onCopied }: { token: string; onCopied?: () => void }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="primary"
      iconLeft="copy"
      disabled={!token}
      onClick={async () => {
        await api.copy(token);
        setCopied(true);
        onCopied?.();
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? t("common.copied") : t("common.copy")}
    </Button>
  );
}
