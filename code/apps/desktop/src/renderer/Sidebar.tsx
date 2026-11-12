import { useState } from "react";
import { Icon, IconButton, NavItem, NavSection, SidebarNav } from "@speakkit/ui";
import type { AppState, Page, SettingsSub } from "../shared/ipc";
import { engineView } from "../shared/engine-view";
import { ExportPill } from "./features/export";
import { QuickTopics, requestRow, SettingsResults, SettingsSearchField } from "./features/settings";
import { searchSettings, type SettingRowDef } from "../shared/settings/search-index";
import { footerStatus } from "../shared/settings/footer";
import { filterSettingsNav, MENU, settingsItem } from "./routes";
import { useT } from "./i18n";
import type { RecentReading } from "./shell-model";

export interface SidebarProps {
  s: AppState;
  hidden: boolean;
  page: Page;
  sub: SettingsSub;
  recent: RecentReading[];
  go(page: Page, sub?: SettingsSub): void;
  onCloseSettings(): void;
  onOpenRecent(id: string): void;
  onOpenExport(jobId: string): void;
}

/** A nav link that stays a button for the keyboard but never changes the URL hash. */
const Link = ({ href, onActivate, ...rest }: { href: string; onActivate(): void } & Omit<React.ComponentProps<typeof NavItem>, "href" | "onClick">) => (
  <NavItem
    {...rest}
    href={href}
    onClick={(e) => {
      e.preventDefault();
      onActivate();
    }}
  />
);

function FooterStatus({ s }: { s: AppState }) {
  const { t } = useT();
  const f = footerStatus(s);
  return (
    <div className="sk-side__foot" data-testid="settings-footer">
      <span data-problem={f.problem || undefined}>{f.listener}</span>
      {f.update && <span>{f.update}</span>}
      <button type="button" className="sk-side__link" onClick={() => window.speakkit.openExternal("release-notes")}>
        {t("nav.releaseNotes")}
      </button>
    </div>
  );
}

function SettingsNav(p: SidebarProps) {
  const { t, label } = useT();
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);
  const typing = q.trim().length > 0;
  const found = typing ? searchSettings(q, (pg) => settingsItem(pg).label) : [];
  const open = (row: SettingRowDef) => {
    requestRow(row.id);
    p.go("settings", row.page);
    setQ("");
  };
  const groups = filterSettingsNav("");
  return (
    <SidebarNav label={t("nav.settings")}>
      <div className="sk-side__head">
        <IconButton name="arrow-left" label={t("nav.closeSettings")} size={28} onClick={p.onCloseSettings} />
        <span className="sk-side__label">{t("nav.settings")}</span>
      </div>
      <SettingsSearchField q={q} setQ={setQ} setFocus={setFocus} onEnter={() => found[0] && open(found[0].rows[0]!)} />
      {typing && <SettingsResults q={q} groups={found} onOpen={open} onClear={() => setQ("")} />}
      {!typing && focus && <QuickTopics onPick={setQ} />}
      {!typing &&
        groups.map((g) => (
          <div key={g.group} style={{ display: "contents" }}>
            <NavSection>{label(`group.${g.group}`, g.group)}</NavSection>
            {g.items.map((it) => (
              <Link key={it.id} icon={it.icon} href={`#settings-${it.id}`} selected={p.sub === it.id} onActivate={() => p.go("settings", it.id)}>
                {label(`sub.${it.id}`, it.label)}
              </Link>
            ))}
          </div>
        ))}
      <div className="sk-side__spacer" />
      <FooterStatus s={p.s} />
    </SidebarNav>
  );
}

function EngineCard({ s }: { s: AppState }) {
  const { t } = useT();
  const v = engineView(s.health, s.serverError);
  return (
    <div className="sk-engcard">
      <b>Kokoro-82M · {v.label}</b>
      {v.hint && <span>{v.hint}</span>}
      <span className="sk-engcard__ok">
        <Icon name="lock" size={13} />
        {t("nav.onDevice")}
      </span>
    </div>
  );
}

function RecentList({ recent, onPick }: { recent: RecentReading[]; onPick(id: string): void }) {
  const { t } = useT();
  if (recent.length === 0) return <div className="sk-side__empty">{t("nav.recentEmpty")}</div>;
  return (
    <>
      {recent.map((r) => (
        <Link key={r.id} icon="history" href="#recent" onActivate={() => onPick(r.id)}>
          {r.title}
        </Link>
      ))}
    </>
  );
}

function MainNav(p: SidebarProps) {
  const { t, label } = useT();
  return (
    <SidebarNav label={t("nav.main")}>
      <div className="sk-side__title">{t("nav.menu")}</div>
      {MENU.map((g) => (
        <div key={g.group} style={{ display: "contents" }}>
          <NavSection>{label(`group.${g.group}`, g.group)}</NavSection>
          {g.items.map((n) => (
            <Link key={n.page} icon={n.icon} href={`#${n.page}`} selected={p.page === n.page} onActivate={() => p.go(n.page)}>
              {label(`page.${n.page}`, n.label)}
            </Link>
          ))}
        </div>
      ))}
      <NavSection>{t("nav.recent")}</NavSection>
      <RecentList recent={p.recent} onPick={p.onOpenRecent} />
      <div className="sk-side__spacer" />
      <ExportPill s={p.s} onOpen={p.onOpenExport} />
      <EngineCard s={p.s} />
      <Link icon="settings" href="#settings" onActivate={() => p.go("settings", "general")}>
        {t("nav.settings")}
      </Link>
    </SidebarNav>
  );
}

/** The left column: the main pages, or the settings sections while in settings. */
export function Sidebar(p: SidebarProps) {
  return (
    <aside className="sk-side" hidden={p.hidden}>
      {p.page === "settings" ? <SettingsNav {...p} /> : <MainNav {...p} />}
    </aside>
  );
}
