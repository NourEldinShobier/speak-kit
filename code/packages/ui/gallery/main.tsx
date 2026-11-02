import { createRoot } from "react-dom/client";
import "../src/lumen.css";
import "./gallery.css";
import { Board } from "./board";
import { Group } from "./layout";
import { VanillaHost } from "./vanilla-host";

function App() {
  return (
    <>
      <header className="g-head lm">
        <h1>SpeakKit UI · Lockix components</h1>
      </header>
      <main className="lm g-panel" data-panel="light">
        <Board />
        <Group title="Vanilla builders (src/vanilla.ts) in the same page">
          <VanillaHost />
        </Group>
      </main>
    </>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(<App />);
