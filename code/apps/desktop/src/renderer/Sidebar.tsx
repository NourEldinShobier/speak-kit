import { Icon, IconButton, Kbd, NavItem, NavSection, SidebarNav } from "@speakkit/ui";
import type { AppState, Page, SettingsSub } from "../shared/ipc";
import { engineView } from "../shared/engine-view";
import { showAccelerator } from "../shared/shortcuts";
import { ExportPill } from "./features/export";
import { SETTINGS_NAV } from "./settings";

type MainPage = Exclude<Page, "settings">;

const NAV: { page: MainPage; label: string; icon: "home" | "book" | "microphone" | "cpu" | "world" }[] = [
  { page: "home", label: "Home", icon: "home" },
  { page: "library", label: "Library", icon: "book" },
  { page: "voices", label: "Voices", icon: "microphone" },
  { page: "engines", label: "Engines", icon: "cpu" },
  { page: "browser", label: "Browser", icon: "world" },
];

export interface SidebarProps {
  s: AppState;
  hidden: boolean;
  page: Page;
  sub: SettingsSub;
  recent: string[];
  go(page: Page, sub?: SettingsSub): void;
  onCloseSettings(): void;
  onNewReading(text: string): void;
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
            <Link
              key={it.id}
              icon={it.icon}
              href={`#settings-${it.id}`}
              selected={p.sub === it.id || (it.id === "dictation" && p.sub === "dictation-history")}
              onActivate={() => p.go("settings", it.id)}
            >
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

function RecentList({ recent, onPick }: { recent: string[]; onPick(text: string): void }) {
  if (recent.length === 0) return <div className="sk-side__empty">Readings you start appear here.</div>;
  return (
    <>
      {recent.map((r) => (
        <Link key={r} icon="history" href="#recent" onActivate={() => onPick(r)}>
          {r}
        </Link>
      ))}
    </>
  );
}

function MainNav(p: SidebarProps) {
  return (
    <SidebarNav label="Main">
      <button type="button" className="lm-nav__item sk-new" onClick={() => p.onNewReading("")}>
        <span className="sk-new__tile">
          <Icon name="plus" size={14} />
        </span>
        <span className="lm-nav__label">New reading</span>
        <Kbd small>{showAccelerator("Ctrl+N", p.s.platform, "app").replace("+", " ")}</Kbd>
      </button>
      <div className="sk-side__sep" aria-hidden="true" />
      {NAV.map((n) => (
        <Link key={n.page} icon={n.icon} href={`#${n.page}`} selected={p.page === n.page} onActivate={() => p.go(n.page)}>
          {n.label}
        </Link>
      ))}
      <NavSection>Recent</NavSection>
      <RecentList recent={p.recent} onPick={p.onNewReading} />
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
