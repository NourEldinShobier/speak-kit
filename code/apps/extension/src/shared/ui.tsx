import type { ReactNode } from "react";
import { Icon, SettingRow, Toggle } from "@speakkit/ui";

/** Small compositions of kit components shared by the options sections. */
export const ToggleRow = ({ title, desc, on, onChange }: { title: string; desc?: string; on: boolean; onChange: (v: boolean) => void }) => (
  <SettingRow label={title} description={desc} control={<Toggle checked={on} aria-label={title} onChange={onChange} />} />
);

/** Two toggle columns separated by hairlines, as in the "Where it appears" and "What to skip" cards. */
export function ToggleGrid({ items }: { items: { title: string; desc?: string; on: boolean; onChange: (v: boolean) => void }[] }) {
  return (
    <div className="op-grid2">
      {items.map((it) => (
        <ToggleRow key={it.title} {...it} />
      ))}
    </div>
  );
}

export function PageHead({ title, desc, saved, onReset, resetLabel = "Reset section" }: { title: string; desc: string; saved?: boolean; onReset?: () => void; resetLabel?: string }) {
  return (
    <div className="op-head">
      <div>
        <h1>{title}</h1>
        <p>{desc}</p>
      </div>
      <div className="op-head-r">
        {saved && (
          <span className="op-saved" role="status">
            <Icon name="circle-check" size={14} />
            Saved
          </span>
        )}
        {onReset && (
          <button type="button" className="sk-link" onClick={onReset}>
            {resetLabel}
            <Icon name="refresh" size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/** A titled r12 card. Rows go inside as SettingRow / ToggleRow. */
export const Card = ({ title, children, desc, id }: { title?: string; desc?: string; children: ReactNode; id?: string }) => (
  <section className="lm-card op-card" aria-labelledby={id}>
    {title && <h2 id={id}>{title}</h2>}
    {desc && <p className="op-card-d">{desc}</p>}
    {children}
  </section>
);
