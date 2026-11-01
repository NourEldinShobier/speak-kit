import { lazy, Suspense, useEffect, useState } from "react";
import { Icon, Logo, NavItem, Select, SidebarNav, type IconName } from "@speakkit/ui";
import { ConnectionCard, useHealth } from "../../features/connection";
import { AppearsCard } from "../../features/launcher";
import { useSettings, useToken } from "../../features/settings";
import { PageHead } from "../../shared/ui";

// Everything but General loads on demand, as one chunk: the page opens on General and most visits never leave it (size budget in scripts/budget.mjs).
const Sections = lazy(() => import("./Sections"));

const NAV: [id: string, label: string, icon: IconName][] = [
  ["general", "General", "adjustments"],
  ["launcher", "Edge launcher", "layout-sidebar-right"],
  ["voice", "Voice and speed", "microphone"],
  ["highlight", "Highlighting", "highlight"],
  ["reader", "Reader view", "book"],
  ["shortcuts", "Shortcuts", "keyboard"],
  ["sites", "Sites and filters", "world"],
];
const ids = NAV.map((n) => n[0]);
const sectionFromHash = (h: string) => {
  const x = h.replace(/^#\/?/, "");
  return ids.includes(x) ? x : "general";
};

export function OptionsApp() {
  const [sec, setSec] = useState(() => sectionFromHash(location.hash));
  const { settings, saved, update, ready } = useSettings();
  const { token, set: setToken } = useToken();
  const { result: health, refresh } = useHealth(5000);
  const version = typeof chrome !== "undefined" && chrome.runtime?.getManifest ? chrome.runtime.getManifest().version : "dev";

  useEffect(() => {
    const on = () => setSec(sectionFromHash(location.hash));
    addEventListener("hashchange", on);
    return () => removeEventListener("hashchange", on);
  }, []);
  useEffect(() => {
    document.title = `${NAV.find((n) => n[0] === sec)![1]} · Speak Kit`;
  }, [sec]);

  const common = { s: settings, upd: update, saved };
  return (
    <div className="lm op">
      <div className="op-top">
        <div className="op-logo">
          <Logo size={26} />
          <span>Speak Kit</span>
        </div>
        <Select
          label="Section"
          value={sec}
          onChange={(v) => {
            location.hash = v;
          }}
          options={NAV.map(([id, label]) => ({ value: id, label }))}
        />
      </div>
      <SidebarNav label="Settings sections" className="op-nav">
        <div className="op-logo">
          <Logo size={26} />
          <span>Speak Kit</span>
        </div>
        {NAV.map(([id, label, icon]) => (
          <NavItem key={id} href={`#${id}`} icon={icon} selected={sec === id}>
            {label}
          </NavItem>
        ))}
        <div className="sk-grow" />
        <div className="op-autosave">
          <Icon name="circle-check" size={14} />
          Changes save automatically
        </div>
        <div className="op-ver">Speak Kit extension {version}</div>
      </SidebarNav>
      <main className="op-main" id="main" data-section={sec} aria-busy={!ready}>
        {sec === "general" && (
          <>
            <PageHead title="General" desc="How the extension talks to the Speak Kit desktop app and where it shows up." />
            <ConnectionCard s={settings} upd={update} health={health} refresh={refresh} token={token} setToken={setToken} />
            <AppearsCard s={settings} upd={update} />
            {saved && (
              <span className="sk-sr" role="status">
                Saved
              </span>
            )}
          </>
        )}
        {sec !== "general" && (
          <Suspense fallback={null}>
            <Sections id={sec} {...common} />
          </Suspense>
        )}
      </main>
    </div>
  );
}
