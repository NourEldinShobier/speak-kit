import { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/lumen.css";
import "./gallery.css";
import { Board } from "./board";
import { Group } from "./layout";
import { VanillaHost } from "./vanilla-host";

function App() {
  const [mode, setMode] = useState<"both" | "dark" | "light">("both");
  const themes = mode === "both" ? (["dark", "light"] as const) : ([mode] as const);
  return (
    <>
      <header className="g-head lm" data-theme="dark">
        <h1>SpeakKit UI · Lumen components</h1>
        <div className="g-modes" role="group" aria-label="Theme">
          {(["both", "dark", "light"] as const).map((m) => (
            <button key={m} aria-pressed={mode === m} onClick={() => setMode(m)}>
              {m}
            </button>
          ))}
        </div>
      </header>
      {themes.map((t) => (
        <main key={t} className="lm g-panel" data-theme={t} data-panel={t}>
          <h2 className="g-title">{t === "dark" ? "Dark" : "Light"}</h2>
          <Board theme={t} />
          <Group title="Vanilla builders (src/vanilla.ts) in the same page">
            <VanillaHost />
          </Group>
        </main>
      ))}
    </>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
