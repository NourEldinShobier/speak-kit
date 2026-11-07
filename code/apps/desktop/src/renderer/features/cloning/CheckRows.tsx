import { Icon } from "@speakkit/ui";
import type { CloneCheck, CloneCheckId } from "@speakkit/protocol";

const TITLE: Record<CloneCheckId, string> = { length: "Length", "sample-rate": "Sample rate", loudness: "Loudness", silence: "Silence", noise: "Noise" };

/** One row per criterion the server judged: a green tick or a red mark, "Length: failed", and the server's own sentence. */
export function CheckRows({ checks }: { checks: CloneCheck[] }) {
  return (
    <ul className="sk-clone-checks" data-testid="clone-checks">
      {checks.map((c) => (
        <li key={c.id} data-check={c.id} data-ok={c.ok}>
          <Icon name={c.ok ? "circle-check" : "alert-circle"} size={16} className={c.ok ? "sk-clone-ok" : "sk-clone-bad"} />
          <span>
            <b>
              {TITLE[c.id]}: {c.ok ? "passed" : "failed"}
            </b>
            <small>{c.message}</small>
          </span>
        </li>
      ))}
    </ul>
  );
}
