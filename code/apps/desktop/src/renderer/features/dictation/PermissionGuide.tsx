import { Button, Icon } from "@speakkit/ui";
import type { PermissionsStatus } from "../../../shared/permissions/contract";
import { permissionLabel, stepButton, stepStatus } from "./permissions-model";

/** What the person still has to allow before dictation works, one row per permission. Hidden when nothing is open or the system could not say. */
export function PermissionGuide({
  status,
  onAct,
}: {
  status: PermissionsStatus | null;
  onAct: (id: PermissionsStatus["guides"]["dictation"]["steps"][number]["id"], action: "request" | "open-settings") => void;
}) {
  const guide = status?.guides.dictation;
  if (!guide?.next || guide.next.state === "unknown") return null;
  const steps = guide.steps.filter((s) => s.state !== "not-needed");
  return (
    <section className="lm-card dict-card" aria-label="Allow dictation" data-testid="permission-guide">
      <div className="dict-card__head">
        <span className="dict-card__tile">
          <Icon name="shield-check" size={18} />
        </span>
        <div>
          <div className="dict-card__title">Allow dictation</div>
          <div className="dict-card__step">{`${steps.filter((s) => s.action === "none").length} of ${steps.length} allowed`}</div>
        </div>
      </div>
      <ul className="dict-perms">
        {steps.map((s) => {
          const label = permissionLabel(s.id);
          const button = stepButton(s);
          return (
            <li key={s.id} className="dict-perms__row">
              <div className="dict-perms__text">
                <b>{label.name}</b>
                <span className="dict-card__sub">{`${label.why} ${stepStatus(s)}.`}</span>
              </div>
              {button && s.action !== "none" && (
                <Button variant={s.id === guide.next?.id ? "primary" : "secondary"} aria-label={`${button} ${label.name}`} onClick={() => onAct(s.id, s.action as "request" | "open-settings")}>
                  {button}
                </Button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
