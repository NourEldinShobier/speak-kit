import { useState } from "react";
import { Button } from "@speakkit/ui";
import { api } from "./ui";

/** A Copy button that says Copied for a moment; a clipboard that refuses leaves the label alone. */
export function CopyButton({ text, label, caption = "Copy" }: { text: string; label: string; caption?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      iconLeft={done ? "check" : "copy"}
      aria-label={label}
      onClick={async () => {
        try {
          await api.copy(text);
        } catch {
          return;
        }
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
    >
      {done ? "Copied" : caption}
    </Button>
  );
}
