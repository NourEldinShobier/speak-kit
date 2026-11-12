import { Icon, IconButton, NavItem, NavSection, SidebarNav } from "@speakkit/ui";
import type { AppState, Page, SettingsSub } from "../shared/ipc";
import { engineView } from "../shared/engine-view";
import { ExportPill } from "./features/export";
import { MENU, SETTINGS_NAV } from "./routes";

export interface SidebarProps {
  s: AppState;
  hidden: boolean;
  page: Page;
  sub: SettingsSub;
  recent: string[];
  go(page: Page, sub?: SettingsSub): void;
  onCloseSettings(): void;
  onOpenRecent(): void;
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

function SettingsNav(p: SidebarProps) {
  return (
    <SidebarNav label="Settings">
      <div className="sk-side__head">
        <IconButton name="arrow-left" label="Close settings" size={28} onClick={p.onCloseSettings} />
        <span className="sk-side__label">Settings</span>
      </div>
      {SETTINGS_NAV.map((g) => (
        <div key={g.group} style={{ display: "contents" }}>
          <NavSection>{g.group}</NavSection>
          {g.items.map((it) => (
            <Link key={it.id} icon={it.icon} href={`#settings-${it.id}`} selected={p.sub === it.id} onActivate={() => p.go("settings", it.id)}>
              {it.label}
            </Link>
          ))}
        </div>
      ))}
    </SidebarNav>
  );
}

function EngineCard({ s }: { s: AppState }) {
  const v = engineView(s.health, s.serverError);
  return (
    <div className="sk-engcard">
      <b>Kokoro-82M · {v.label}</b>
      {v.hint && <span>{v.hint}</span>}
      <span className="sk-engcard__ok">
        <Icon name="lock" size={13} />
        100% on this device
      </span>
    </div>
  );
}

function RecentList({ recent, onPick }: { recent: string[]; onPick(): void }) {
  if (recent.length === 0) return <div className="sk-side__empty">Readings you start appear here.</div>;
  return (
    <>
      {recent.map((r) => (
        <Link key={r} icon="history" href="#recent" onActivate={onPick}>
          {r}
        </Link>
      ))}
    </>
  );
}

function MainNav(p: SidebarProps) {
  return (
    <SidebarNav label="Main">
      <div className="sk-side__title">Menu</div>
      {MENU.map((g) => (
        <div key={g.group} style={{ display: "contents" }}>
          <NavSection>{g.group}</NavSection>
          {g.items.map((n) => (
            <Link key={n.page} icon={n.icon} href={`#${n.page}`} selected={p.page === n.page} onActivate={() => p.go(n.page)}>
              {n.label}
            </Link>
          ))}
        </div>
      ))}
      <NavSection>Recent</NavSection>
      <RecentList recent={p.recent} onPick={p.onOpenRecent} />
      <div className="sk-side__spacer" />
      <ExportPill s={p.s} onOpen={p.onOpenExport} />
      <EngineCard s={p.s} />
      <Link icon="settings" href="#settings" onActivate={() => p.go("settings", "general")}>
        Settings
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
